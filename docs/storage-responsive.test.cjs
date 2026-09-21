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
 for(const [width,height] of [[1920,1080],[1303,578],[1024,600],[768,1024],[844,390],[390,844],[320,568],[640,320]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(400);
 const control=page.getByLabel('Adicionar objeto',{exact:true});
 await control.scrollIntoViewIfNeeded();
 const bounds=await control.boundingBox();
 const sizes=await page.locator('[role=dialog]').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
 assert.ok(bounds.y>=0 && bounds.y+bounds.height<=height+1,'tools must be vertically reachable');
 await control.selectOption('wall');
 await control.selectOption('shelf');
 const close=page.getByRole('button',{name:'Fechar',exact:true});
 await close.scrollIntoViewIfNeeded();
 const closeBounds=await close.boundingBox();
 assert.ok(closeBounds.y>=0 && closeBounds.y+closeBounds.height<=height+1,'close must remain reachable');
 console.log(width,height,JSON.stringify({bounds,sizes}));
 assert.ok(bounds.width >= 200, 'object selector must retain usable width');
 assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1,'tools must fit viewport');
 assert.ok(sizes.scroll<=sizes.width+1,'dialog must not overflow horizontally');
 }
 }finally{await browser.close();}
})();
