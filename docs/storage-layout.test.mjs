import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
const source = await readFile(
  new URL("../src/lib/storage-layout.js", import.meta.url),
  "utf8"
);
const { makeObject, pathTo, descendants, duplicateTree, suggestions } =
  await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );

test("hierarquias livres: caixa isolada, gaveta em armário e posição em palete", () => {
  const cabinet = makeObject("cabinet");
  const drawer = makeObject("drawer", cabinet.id);
  const box = makeObject("box");
  const pallet = makeObject("pallet");
  const slot = makeObject("slot", pallet.id);
  const objects = [cabinet, drawer, box, pallet, slot];
  assert.deepEqual(
    pathTo(objects, drawer.id).map((o) => o.type),
    ["cabinet", "drawer"]
  );
  assert.deepEqual(
    pathTo(objects, box.id).map((o) => o.type),
    ["box"]
  );
  assert.deepEqual(
    pathTo(objects, slot.id).map((o) => o.type),
    ["pallet", "slot"]
  );
  assert.equal(descendants(objects, cabinet.id).length, 2);
});

test("duplicação preserva estrutura e dimensões sem duplicar quantidades", () => {
  const rack = makeObject("rack"),
    shelf = makeObject("shelf", rack.id);
  const layout = {
    objects: [rack, shelf],
    items: [
      { id: "item", locationId: shelf.id, productId: "product", quantity: 10 }
    ]
  };
  const result = duplicateTree(layout, rack.id);
  assert.equal(result.objects.length, 4);
  assert.equal(result.objects[3].parentId, result.objects[2].id);
  assert.deepEqual(result.objects[2].dimensions, rack.dimensions);
  assert.equal(new Set(result.objects.map((o) => o.id)).size, 4);
  assert.equal(result.items.length, 1);
});

test("sugestões excluem volume desconhecido, posições pequenas e pais com subdivisões", () => {
  const free = makeObject("pallet"),
    unknown = makeObject("pallet"),
    full = makeObject("pallet"),
    parent = makeObject("box"),
    child = makeObject("slot", parent.id);
  const layout = {
    objects: [free, unknown, full, parent, child],
    items: [
      { locationId: unknown.id, quantity: 20 },
      { locationId: full.id, quantity: 10, storedVolume: full.dimensions }
    ]
  };
  const result = suggestions(layout, { width: 1, height: 1, depth: 1 });
  assert.deepEqual(
    result.map((s) => s.object.id),
    [free.id]
  );
});

test("percurso interrompe ciclos malformados sem travar", () => {
  assert.equal(
    pathTo(
      [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" }
      ],
      "a"
    ).length,
    2
  );
});

test("o mesmo produto pode ocupar três posições sem precisar de imagem", () => {
  const objects = [makeObject("slot"), makeObject("box"), makeObject("pallet")];
  const items = objects.map((o, i) => ({
    id: String(i),
    productId: "parafuso",
    locationId: o.id,
    quantity: 10
  }));
  assert.equal(items.filter((i) => i.productId === "parafuso").length, 3);
  assert.ok(items.every((i) => pathTo(objects, i.locationId).length === 1));
});
