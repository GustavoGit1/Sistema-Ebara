const { chromium } = require(process.cwd() + '/.npm-cache/storage-tests/node_modules/playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 const page=await browser.newPage({viewport:{width:1303,height:578}});
 await page.goto(process.env.STORAGE_TEST_URL || 'http://localhost:3101');
 await page.getByRole('button',{name:'Entrar no sistema'}).click();
 const fields=page.locator('form input');await fields.nth(0).fill('empresa1');await fields.nth(1).fill('Chefe');await fields.nth(2).fill('123456');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByRole('button',{name:'Visualização e montagem 3D',exact:true}).click();
 await page.locator('canvas').first().waitFor();
 await page.waitForTimeout(1200);
 await page.getByRole('button',{name:'Editar estoque',exact:true}).click();
 await page.waitForTimeout(700);
 for(const width of [1303,1024,768,390]){
 await page.setViewportSize({width,height:578});await page.waitForTimeout(400);
 const control=page.getByLabel('Adicionar objeto',{exact:true});
 await control.scrollIntoViewIfNeeded();
 const bounds=await control.boundingBox();
 const sizes=await page.locator('[role=dialog]').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
 console.log(width,JSON.stringify({bounds,sizes}));
 assert.ok(bounds.width >= 200, 'object selector must retain usable width');
 assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1,'tools must fit viewport');
 assert.ok(sizes.scroll<=sizes.width+1,'dialog must not overflow horizontally');
 }
 }finally{await browser.close();}
})();
