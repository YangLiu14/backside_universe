import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL(process.env.BOOKROOM_EVIDENCE||'../evidence/holiday-assets-v1/laptop/bookroom-v6/browser/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],results={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.stack);});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto(process.env.BOOKROOM_URL||'http://127.0.0.1:9988/holiday-assets/bookroom.html');
 await page.waitForFunction(()=>window.bookroom?.state.ready,{},{timeout:120000});
 const idle=()=>page.waitForFunction(()=>window.bookroom&&!window.bookroom.state.busy,{},{timeout:30000});
 const state=()=>page.evaluate(()=>window.bookroom.state);
 const doorwayRay=()=>page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js');
  const a=window.bookroom.toWorld(new T.Vector3(.043,.100,-.709)),b=window.bookroom.toWorld(new T.Vector3(.043,.100,-.645)),d=b.clone().sub(a);
  const ray=new T.Raycaster(a,d.clone().normalize(),.0001,d.length());
  return ray.intersectObjects(window.bookroom.scene.children,true).filter(h=>h.object.isMesh&&h.object.visible).map(h=>h.object.name);
 });
 const shot=async name=>page.locator('#scene').screenshot({path:new URL(name+'.png',out).pathname});
 await shot('overview');await page.locator('#approach').click();await idle();await shot('terrace-closed');
 if(await page.locator('#enter').isEnabled())throw Error('Enter must be disabled while door is closed');
 if(await page.evaluate(()=>window.bookroom.walkable(.043,.685)))throw Error('Closed doorway is walkable');
 results.closedDoorGeometry=await doorwayRay();if(!results.closedDoorGeometry.some(n=>n.startsWith('green-door')))throw Error('Closed door mesh does not block the opening');
 await page.locator('#door').click();await idle();await shot('terrace-open');
 results.openDoorGeometry=await doorwayRay();if(results.openDoorGeometry.length)throw Error('Physical doorway blocked: '+results.openDoorGeometry.join(', '));
 if(!await page.evaluate(()=>window.bookroom.walkable(.043,.685)))throw Error('Open doorway is blocked');
 await page.locator('#enter').click();await idle();results.entered=await state();if(results.entered.stage!=='inside')throw Error('Entry failed');await shot('inside');
 results.furniture=await page.evaluate(()=>window.bookroom.furniture);
 results.navigation=await page.evaluate(async()=>{
  const {planWalk}=await import('/holiday-assets/bookroom-navigation.js');let checked=0,failed=0,unsafe=0;
  for(let x=-.05;x<.224;x+=.009)for(let y=.532;y<.667;y+=.009){if(!window.bookroom.walkable(x,y))continue;checked++;const route=planWalk([x,y],[window.bookroom.state.terraceX,window.bookroom.state.terraceY],window.bookroom.walkable,window.bookroom.furniture);if(!route){failed++;continue;}for(let i=1;i<route.length;i++)for(let t=0;t<=1;t+=.02)if(!window.bookroom.walkable(route[i-1][0]*(1-t)+route[i][0]*t,route[i-1][1]*(1-t)+route[i][1]*t))unsafe++;}
  return {checked,failed,unsafe};
 });if(results.navigation.failed||results.navigation.unsafe)throw Error('Safe exit routing failed: '+JSON.stringify(results.navigation));
 for(const name of ['reading','shelves','outside']){await page.locator(`[data-look="${name}"]`).click();await idle();await shot(name);}
 await page.locator('#scene').focus();const before=await state();await page.keyboard.down('a');await page.waitForTimeout(250);await page.keyboard.up('a');const after=await state();results.keyboardMoved=Math.hypot(...after.camera.map((n,i)=>n-before.camera[i]))>.001;if(!results.keyboardMoved)throw Error('Keyboard movement failed');
 results.boundaries=await page.evaluate(()=>({left:window.bookroom.walkable(-.08,.59),back:window.bookroom.walkable(.08,.49),right:window.bookroom.walkable(.25,.59)}));if(Object.values(results.boundaries).some(Boolean))throw Error('Wall boundary failed');
 await page.locator('#door').click();await idle();results.closedInside=!(await state()).doorOpen;if(!results.closedInside)throw Error('Cannot close door from inside');
 await page.locator('[data-look=reading]').click();await idle();await shot('reading-door-closed');
 await page.locator('#exit').click();await idle();results.exitOpenedDoor=(await state()).doorOpen;if(!results.exitOpenedDoor)throw Error('Exit failed to reopen door');await page.locator('#door').click();await idle();results.closedAfterExit=!(await state()).doorOpen;if(!results.closedAfterExit)throw Error('Door did not close');
 await page.locator('#overview').click();await idle();if((await state()).stage!=='overview')throw Error('Return failed');
 await page.locator('#motion').click();await page.locator('#approach').click();await idle();await page.locator('#door').click();await idle();await page.locator('#enter').click();await idle();results.reducedMotionEntered=(await state()).stage==='inside';
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('mobile.png',out).pathname,fullPage:true});results.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 const box=await page.locator('[data-move="forward"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();
 results.finalState=await state();results.errors=errors;
 await writeFile(new URL('report.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 if(errors.length||results.mobileOverflow||!results.reducedMotionEntered)throw Error('Browser verification failed');
}finally{await browser.close();}
