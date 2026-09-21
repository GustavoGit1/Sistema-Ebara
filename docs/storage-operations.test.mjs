import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const modelUrl = moduleUrl(
  await readFile(
    new URL("../src/lib/storage-layout.js", import.meta.url),
    "utf8"
  )
);
const operationsUrl = moduleUrl(
  (
    await readFile(
      new URL("../src/lib/storage-operations.js", import.meta.url),
      "utf8"
    )
  ).replace('"./storage-layout"', JSON.stringify(modelUrl))
);
const persistenceUrl = moduleUrl(
  (
    await readFile(
      new URL("../src/lib/storage-persistence.js", import.meta.url),
      "utf8"
    )
  )
    .replace('"./storage-layout"', JSON.stringify(modelUrl))
    .replace('"./storage-operations"', JSON.stringify(operationsUrl))
);
const { makeObject, suggestions } = await import(modelUrl);
const { validateLayout, resizeTree, automaticObject, snapPosition } =
  await import(operationsUrl);
const { createSaveQueue, createLayoutRepository } = await import(
  persistenceUrl
);

test("redimensionar uma estante mantém posições proporcionais nas subdivisões", () => {
  const rack = makeObject("rack"),
    shelf = makeObject("shelf", rack.id),
    slot = makeObject("slot", shelf.id);
  slot.position.x = 0.3;
  const layout = { version: 1, objects: [rack, shelf, slot], items: [] };
  const result = resizeTree(layout, rack.id, { ...rack.dimensions, width: 4 });
  assert.equal(result.objects[2].position.x, 0.6);
  assert.equal(result.objects[2].dimensions.width, 1);
  assert.equal(layout.objects[2].position.x, 0.3);
});

test("redução não pode encolher uma posição abaixo do volume armazenado", () => {
  const slot = makeObject("slot");
  const layout = {
    version: 1,
    objects: [slot],
    items: [
      {
        id: "item",
        productId: "p",
        locationId: slot.id,
        quantity: 3,
        storedVolume: slot.dimensions
      }
    ]
  };
  assert.throws(
    () => resizeTree(layout, slot.id, { ...slot.dimensions, width: 0.1 }),
    /não comporta/
  );
});

test("carregamento rejeita ciclos, pais inexistentes e números inválidos", () => {
  const a = makeObject("box"),
    b = makeObject("box", a.id);
  const layout = { version: 1, objects: [a, b], items: [] };
  assert.equal(validateLayout(layout), layout);
  assert.throws(
    () => validateLayout({ ...layout, objects: [{ ...a, parentId: b.id }, b] }),
    /circular/
  );
  assert.throws(
    () => validateLayout({ ...layout, objects: [b] }),
    /inexistente/
  );
  assert.throws(
    () =>
      validateLayout({
        ...layout,
        objects: [{ ...a, dimensions: { ...a.dimensions, width: Infinity } }]
      }),
    /dimensões/
  );
});

test("códigos automáticos permanecem únicos após exclusões", () => {
  const first = makeObject("box", null, 1),
    third = makeObject("box", null, 3);
  assert.equal(
    automaticObject({ objects: [first, third], items: [] }, "box").code,
    "BOX-02"
  );
});

test("encaixe considera rotação e não alinha com estruturas distantes", () => {
  const rack = makeObject("rack");
  rack.rotation.y = Math.PI / 2;
  const wall = makeObject("wall");
  wall.position.x = 3;
  const result = snapPosition(
    rack,
    { x: 0.72, y: 0, z: 0 },
    [wall],
    null,
    0.25
  );
  assert.ok(Math.abs(result.position.x - 0.7) < 1e-7);
  assert.deepEqual(result.guides, ["x", "z"]);
  wall.position.z = 100;
  assert.equal(
    snapPosition(rack, { x: 0.72, y: 0, z: 0 }, [wall], null, 0.25).position.x,
    0.75
  );
});

test("volume inválido e ocupação de pai não produzem sugestão enganosa", () => {
  const pallet = makeObject("pallet"),
    slot = makeObject("slot", pallet.id);
  const layout = {
    objects: [pallet, slot],
    items: [{ locationId: pallet.id, quantity: 3 }]
  };
  assert.equal(
    suggestions(layout, { width: 0.1, height: 0.1, depth: 0.1 }).length,
    0
  );
  assert.equal(
    suggestions(
      { ...layout, items: [] },
      { width: NaN, height: 0.1, depth: 0.1 }
    ).length,
    0
  );
});

test("fila agrupa digitação e preserva edições feitas durante uma gravação", async () => {
  const calls = [],
    saved = [];
  let release;
  const queue = createSaveQueue(
    async (value) => {
      calls.push(value);
      if (value === 2)
        await new Promise((resolve) => {
          release = resolve;
        });
    },
    (value) => saved.push(value),
    (error) => {
      throw error;
    },
    10000
  );
  queue.schedule(1);
  queue.schedule(2);
  const work = queue.flush();
  queue.schedule(3);
  queue.schedule(4);
  release();
  await work;
  await queue.dispose();
  assert.deepEqual(calls, [2, 4]);
  assert.deepEqual(saved, [2, 4]);
});

test("falha de salvamento é informada e permite nova tentativa", async () => {
  let fail = true;
  const saved = [],
    errors = [];
  const queue = createSaveQueue(
    async () => {
      if (fail) throw new Error("offline");
    },
    (value) => saved.push(value),
    (error) => errors.push(error.message),
    10000
  );
  queue.schedule(1);
  await queue.flush();
  fail = false;
  queue.schedule(2);
  await queue.flush();
  await queue.dispose();
  assert.deepEqual(errors, ["offline"]);
  assert.deepEqual(saved, [2]);
});

test("persistência remota impede sobrescrever edição concorrente", async () => {
  const empty = { version: 1, objects: [], items: [] };
  const observed = [];
  const query = {
    select() {
      return this;
    },
    eq(key, value) {
      observed.push([key, value]);
      return this;
    },
    maybeSingle: async () => ({ data: { layout: empty, revision: 8 } }),
    update() {
      return this;
    },
    then(resolve) {
      return Promise.resolve({ data: [] }).then(resolve);
    }
  };
  const repository = createLayoutRepository({
    companyId: "company-a",
    demoMode: false,
    client: { from: () => query }
  });
  await repository.load();
  await assert.rejects(repository.save(empty), /Outra pessoa/);
  assert.ok(
    observed.some(
      ([key, value]) => key === "company_id" && value === "company-a"
    )
  );
  assert.ok(observed.some(([key, value]) => key === "revision" && value === 8));
});
