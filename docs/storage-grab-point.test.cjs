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
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page);await page.getByRole('button',{name:'Editar estoque',exact:true}).click();
 const choice=page.getByLabel('Quer alinhar os objetos lado a lado automaticamente?',{exact:true});assert.equal(await choice.inputValue(),'no');
 await choice.selectOption('yes');assert.equal(await page.getByLabel('Encaixe no chão',{exact:true}).inputValue(),'0.25');await choice.selectOption('no');
 await page.getByLabel('Adicionar objeto',{exact:true}).selectOption('wall');
 await page.getByRole('button',{name:'Superior',exact:true}).click();await page.waitForTimeout(1000);
 const canvas=page.locator('canvas').first();const r=await canvas.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
 await page.getByRole('button',{name:'Escolher local na cena',exact:true}).click();await page.mouse.click(x,y);await settle(page);
 await page.getByRole('button',{name:'Superior',exact:true}).click();await page.waitForTimeout(1000);
 const before=(await stored(page)).objects[0];
 // Compare the same movement when grabbing the center versus near the end.
 async function moveAt(startX){await page.mouse.move(startX,y);await page.mouse.down();await page.mouse.move(startX+60,y+45,{steps:12});await page.mouse.up();await settle(page);return (await stored(page)).objects[0].position;}
 const center=await moveAt(x);await page.getByRole('button',{name:'Desfazer',exact:true}).click();await settle(page);
 const distance=Math.hypot(4,2.5,0.15)*1.25/Math.min(1,r.width/r.height);
 const pixelsPerMeter=r.height/(2*(distance-1.25)*Math.tan(24*Math.PI/180));
 const end=await moveAt(x+1.6*pixelsPerMeter);
 assert.ok(Math.abs(center.x-end.x)<0.03,JSON.stringify({center,end}));assert.ok(Math.abs(center.z-end.z)<0.03);
 assert.ok(Math.abs(end.x-before.position.x)>0.1);
 await page.mouse.click(x+1.6*pixelsPerMeter+60,y+45);await settle(page);assert.equal(await page.locator('aside button').first().innerText(),'Apagar Parede 1');
 await page.mouse.click(r.x+20,r.y+20);await settle(page);assert.equal(await page.getByRole('button',{name:'Apagar Parede 1',exact:true}).count(),0);
 assert.equal(await page.locator('nextjs-portal').locator('button[aria-label="Open Next.js Dev Tools"]').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS alignment choice, wall grab offset, deselect background, hidden dev indicator');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
