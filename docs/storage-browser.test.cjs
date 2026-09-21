const {
  chromium
} = require("../.npm-cache/storage-tests/node_modules/playwright");
const fs = require("fs");
const assert = require("assert/strict");
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
  const source = fs.readFileSync("src/components/StockApp.js", "utf8");
  const users = Function(
    "ROLES",
    "return " + source.match(/const DEMO_USERS = (\[[\s\S]*?\n\]);/)[1]
  )({ OWNER: "owner", MANAGER: "manager", EMPLOYEE: "employee" });
  for (const user of users) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      hasTouch: true
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        "estoque-demo-state",
        JSON.stringify({
          products: [
            {
              id: "test-m8",
              company_id: "demo-empresa1",
              name: "Parafuso M8",
              quantity: 100,
              active: true
            }
          ]
        })
      )
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.STORAGE_TEST_URL || "http://localhost:3100");
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    const fields = page.locator("form input");
    await fields.nth(0).fill("empresa1");
    await fields.nth(1).fill(user.username);
    await fields.nth(2).fill(user.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Sugestão de espaço", exact: true })
        .count(),
      1
    );
    await page
      .getByRole("button", { name: "Visualização e montagem 3D" })
      .click();
    await page
      .getByRole("button", { name: "Editar estoque", exact: true })
      .click();
    await page
      .getByLabel("Adicionar objeto", { exact: true })
      .selectOption("box");
    for (let i = 0; i < 3; i++) {
      await page
        .getByRole("button", { name: "Adicionar ao estoque", exact: true })
        .click();
      await page
        .getByLabel("Associar produto", { exact: true })
        .selectOption("test-m8");
      await page
        .getByLabel("Quantidade nesta posição", { exact: true })
        .fill("10");
      await page
        .getByRole("button", { name: "Salvar associação", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Duplicar", exact: true }).click();
    await page.getByRole("button", { name: "Desfazer", exact: true }).click();
    await page.getByRole("button", { name: "Refazer", exact: true }).click();
    await page
      .getByRole("button", { name: "Salvar layout", exact: true })
      .click();
    await page.waitForTimeout(500);
    await page
      .getByRole("button", { name: "Concluir montagem", exact: true })
      .click();
    await page.getByLabel("Encontrar produto", { exact: true }).fill("paraf");
    await page
      .getByRole("button", { name: "Parafuso M8 test-m8", exact: true })
      .click();
    assert.equal(
      await page.getByRole("button", { name: /Caixa.*10 unidades/ }).count(),
      3
    );
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Superior", exact: true }).click();
    await page
      .getByRole("button", { name: "Sugestão de espaço", exact: true })
      .last()
      .click();
    for (const label of ["Largura (m)", "Altura (m)", "Profundidade (m)"])
      await page.getByLabel(label, { exact: true }).fill("0.1");
    assert.equal(
      await page.getByRole("button", { name: /Ver no estoque/ }).count(),
      1
    );
    await page.getByRole("button", { name: /Ver no estoque/ }).click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page
      .getByRole("button", { name: "Visualização e montagem 3D" })
      .click();
    await page.getByLabel("Encontrar produto", { exact: true }).fill("paraf");
    await page
      .getByRole("button", { name: "Parafuso M8 test-m8", exact: true })
      .click();
    assert.equal(
      await page.getByRole("button", { name: /Caixa.*10 unidades/ }).count(),
      3
    );
    assert.deepEqual(errors, []);
    if (user.role === "employee")
      await page.screenshot({ path: "docs/storage-tablet-test.png" });
    console.log(
      user.role +
        ": acesso, montagem, associação sem imagem, três localizações, desfazer/refazer, sugestão e recarga OK"
    );
    await context.close();
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
