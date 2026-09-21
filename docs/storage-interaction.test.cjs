const {
  chromium
} = require("../.npm-cache/storage-tests/node_modules/playwright");
const assert = require("assert/strict");

async function login(page) {
  await page.goto(process.env.STORAGE_TEST_URL || "http://localhost:3100");
  await page.getByRole("button", { name: "Entrar no sistema" }).click();
  const inputs = page.locator("form input");
  await inputs.nth(0).fill("empresa1");
  await inputs.nth(1).fill("Chefe");
  await inputs.nth(2).fill("123456");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Visualização e montagem 3D" })
    .click();
  await page
    .getByRole("button", { name: "Editar estoque", exact: true })
    .waitFor();
}
async function stored(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("storage-layouts", 1);
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise((resolve) => {
      const request = db
        .transaction("layouts")
        .objectStore("layouts")
        .get("demo-empresa1");
      request.onsuccess = () => {
        resolve(request.result);
        db.close();
      };
    });
  });
}
async function settle(page) {
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader"
    ]
  });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page
    .getByRole("button", { name: "Editar estoque", exact: true })
    .click();
  await page
    .getByLabel("Adicionar objeto", { exact: true })
    .selectOption("box");
  await page
    .getByRole("button", { name: "Adicionar ao estoque", exact: true })
    .click();
  await settle(page);
  await page.getByLabel("Encaixe no chão", { exact: true }).selectOption("0");
  let before = await stored(page);
  await page.screenshot({ path: ".npm-cache/drag-before.png" });
  const canvas = page.locator("canvas"),
    rect = await canvas.boundingBox();
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 15, { steps: 12 });
  await page.mouse.up();
  await settle(page);
  const moved = await stored(page);
  await page.screenshot({ path: ".npm-cache/drag-after.png" });
  assert.notDeepEqual(
    moved.objects[0].position,
    before.objects[0].position,
    "mouse drag must save a new position"
  );
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await settle(page);
  assert.deepEqual(
    (await stored(page)).objects[0].position,
    before.objects[0].position
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }]
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + i * 7, y: y + i * 2, id: 1 }]
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  await settle(page);
  assert.notDeepEqual(
    (await stored(page)).objects[0].position,
    before.objects[0].position,
    "touch drag must save a new position"
  );
  await page
    .getByRole("button", { name: "Concluir montagem", exact: true })
    .click();
  await settle(page);
  const first = await canvas.screenshot();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 45, y, id: 1 },
      { x: x + 45, y, id: 2 }
    ]
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 45 - i * 5, y: y + i * 2, id: 1 },
        { x: x + 45 + i * 5, y: y + i * 2, id: 2 }
      ]
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  await settle(page);
  assert.notDeepEqual(
    await canvas.screenshot(),
    first,
    "pinch/pan must change the view"
  );
  assert.equal(
    (await stored(page)).objects.length,
    1,
    "camera gestures must not edit the layout"
  );
  await page
    .getByRole("button", { name: "Editar estoque", exact: true })
    .click();
  await page
    .getByLabel("Adicionar objeto", { exact: true })
    .selectOption("rack");
  await page
    .getByRole("button", { name: "Adicionar ao estoque", exact: true })
    .click();
  await page.getByLabel("Número de prateleiras", { exact: true }).fill("5");
  await settle(page);
  let data = await stored(page);
  const rack = data.objects.find((o) => o.type === "rack");
  assert.equal(data.objects.filter((o) => o.parentId === rack.id).length, 5);
  await page.getByLabel("Número de prateleiras", { exact: true }).fill("6");
  await settle(page);
  assert.equal(
    (await stored(page)).objects.filter((o) => o.parentId === rack.id).length,
    6
  );
  await page.getByLabel("Largura (m)", { exact: true }).fill("4");
  await settle(page);
  data = await stored(page);
  assert.ok(
    data.objects
      .filter((o) => o.type === "shelf")
      .every((o) => o.dimensions.width > 3.7)
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await settle(page);
  assert.equal(
    (await stored(page)).objects.length,
    8,
    "cancel deletion must preserve children"
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await settle(page);
  assert.equal((await stored(page)).objects.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "Mouse drag, touch drag, pinch/pan, undo, procedural 5→6 shelves, resize and deletion confirmation: OK"
  );
  const backup = await stored(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Importar cópia", { exact: true })
    .setInputFiles({
      name: "layout.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup))
    });
  await settle(page);
  assert.equal((await stored(page)).objects.length, 1);
  await page
    .getByLabel("Importar cópia", { exact: true })
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":8}')
    });
  assert.match(
    await page.getByRole("status").innerText(),
    /Não foi possível importar/
  );
  assert.equal((await stored(page)).objects.length, 1);
  console.log("Backup import and invalid-file rejection: OK");
  const other = await context.newPage();
  await login(other);
  await other
    .getByRole("button", { name: "Editar estoque", exact: true })
    .click();
  await page
    .getByLabel("Adicionar objeto", { exact: true })
    .selectOption("box");
  await page
    .getByRole("button", { name: "Adicionar ao estoque", exact: true })
    .click();
  await settle(page);
  await other
    .getByRole("button", { name: "Adicionar ao estoque", exact: true })
    .click();
  await settle(other);
  assert.match(await other.getByRole("status").innerText(), /Outra aba/);
  assert.equal(
    (await stored(page)).objects.length,
    2,
    "conflicting tab must not overwrite a newer layout"
  );
  console.log(
    "IndexedDB conflict between two tabs: blocked without overwriting"
  );
  await context.close();

  const largeContext = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true
  });
  await largeContext.addInitScript(() => {
    localStorage.setItem(
      "estoque-demo-state",
      JSON.stringify({
        products: [
          {
            id: "large-product",
            company_id: "demo-empresa1",
            name: "Parafuso M8",
            quantity: 50,
            active: true
          }
        ]
      })
    );
  });
  const large = await largeContext.newPage();
  large.on("pageerror", (error) => errors.push(error.message));
  await large.goto(process.env.STORAGE_TEST_URL || "http://localhost:3100");
  await large.evaluate(async () => {
    const objects = [],
      items = [];
    function object(id, type, parentId, x, y, z, width, height, depth) {
      return {
        id,
        name: id,
        code: id,
        type,
        parentId,
        position: { x, y, z },
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: { width, height, depth },
        properties: {}
      };
    }
    for (let r = 0; r < 10; r++) {
      objects.push(
        object(
          "R" + r,
          "rack",
          null,
          (r % 5) * 3,
          0,
          Math.floor(r / 5) * 4,
          2,
          3,
          0.6
        )
      );
      for (let level = 0; level < 10; level++) {
        const shelf = `R${r}-N${level}`;
        objects.push(
          object(
            shelf,
            "shelf",
            "R" + r,
            0,
            0.1 + level * 0.28,
            0,
            1.9,
            0.25,
            0.58
          )
        );
        for (let slot = 0; slot < 5; slot++) {
          const id = shelf + "-P" + slot;
          objects.push(
            object(
              id,
              "slot",
              shelf,
              -0.76 + slot * 0.38,
              0,
              0,
              0.35,
              0.22,
              0.55
            )
          );
          if (r === 9 && level === 8 && slot === 3)
            items.push({
              id: "location",
              productId: "large-product",
              locationId: id,
              quantity: 50
            });
        }
      }
    }
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("storage-layouts", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("layouts");
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction("layouts", "readwrite");
      tx.objectStore("layouts").put(
        { version: 1, objects, items },
        "demo-empresa1"
      );
      tx.oncomplete = resolve;
    });
    db.close();
  });
  const started = Date.now();
  await login(large);
  await large.getByLabel("Encontrar produto", { exact: true }).fill("Parafuso");
  await large
    .getByRole("button", { name: "Parafuso M8 large-product", exact: true })
    .click();
  await settle(large);
  assert.equal(
    await large.getByRole("button", { name: /R9.*50 unidades/ }).count(),
    1
  );
  await large.getByRole("button", { name: /R9.*50 unidades/ }).click();
  await settle(large);
  await large
    .getByRole("button", { name: "Voltar para visão geral", exact: true })
    .click();
  await settle(large);
  assert.equal((await stored(large)).objects.length, 610);
  await large.screenshot({ path: "docs/storage-large-layout-test.png" });
  assert.deepEqual(errors, []);
  console.log(
    "610 objects / 500 positions: search, hierarchical focus and overview OK in " +
      (Date.now() - started) +
      " ms including waits"
  );
  await largeContext.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
