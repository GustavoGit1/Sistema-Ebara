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
 const browser = await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page);await page.getByRole('button',{name:'Editar estoque',exact:true}).click();
 await page.getByLabel('Adicionar objeto',{exact:true}).selectOption('box');
 await page.getByRole('button',{name:'Superior',exact:true}).click();await page.waitForTimeout(900);
 const canvas=page.locator('canvas').first();const r=await canvas.boundingBox();
 const x=r.x+r.width/2,y=r.y+r.height/2;
 await page.getByRole('button',{name:'Escolher local na cena',exact:true}).click();await page.mouse.click(x,y);await settle(page);
 let state=await stored(page);assert.equal(state.objects.length,1);assert.equal(state.objects[0].position.y,0);
 assert.match(await page.locator('aside button').first().innerText(),/^Apagar/);
 await page.getByRole('button',{name:'Escolher local na cena',exact:true}).click();await page.mouse.click(x,y);await settle(page);
 state=await stored(page);assert.equal(state.objects.length,2);assert.equal(state.objects[1].parentId,state.objects[0].id);assert.equal(state.objects[1].position.y,0.3);
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+130,y+80,{steps:15});await page.mouse.up();await settle(page);
 state=await stored(page);assert.equal(state.objects[1].parentId,null);assert.equal(state.objects[1].position.y,0);
 await page.getByLabel('Encaixe no ch\u00e3o',{exact:true}).selectOption('0');
 await page.mouse.move(x+130,y+80);await page.mouse.down();await page.mouse.move(x,y,{steps:15});await page.mouse.up();await settle(page);
 state=await stored(page);assert.equal(state.objects[1].parentId,state.objects[0].id);assert.equal(state.objects[1].position.y,0.3);
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();await settle(page);
 assert.equal((await stored(page)).objects[1].parentId,null);
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();await settle(page);
 state=await stored(page);assert.equal(state.objects[1].parentId,state.objects[0].id);
 const card=page.locator('[draggable="true"]');const transfer=await page.evaluateHandle(()=>new DataTransfer());
 await card.dispatchEvent('dragstart',{dataTransfer:transfer});await page.waitForTimeout(150);
 await canvas.dispatchEvent('dragover',{dataTransfer:transfer,clientX:x-130,clientY:y+80});
 await canvas.dispatchEvent('drop',{dataTransfer:transfer,clientX:x-130,clientY:y+80});await card.dispatchEvent('dragend',{dataTransfer:transfer});await settle(page);
 state=await stored(page);assert.equal(state.objects.length,3);assert.equal(state.objects[2].position.y,0);
 page.on('dialog',dialog=>dialog.accept());await page.locator('aside button').first().click();await settle(page);assert.equal((await stored(page)).objects.length,2);
 assert.deepEqual(errors,[]);await page.screenshot({path:'.npm-cache/storage-placement.png'});
 console.log('PASS preview, placement, stacking, unstacking, undo, palette drag/drop, delete, no browser errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
