const {launchBrowser,baseURL}=require('./marble-browser.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await launchBrowser();try{
 const mobile=process.env.SMALL==='1',dir=path.resolve(__dirname,'../evidence/canine-production/digestion/visits');
 await fs.mkdir(dir,{recursive:true});
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1140,height:860},isMobile:mobile,hasTouch:mobile});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const state=()=>page.evaluate(()=>window.__photoOrbit.state);
 const wait=async fn=>page.waitForFunction(fn,null,{timeout:16000});
 const stage=page.locator('#stage'),snapshot=name=>stage.screenshot({path:path.join(dir,(mobile?'mobile-':'')+name+'.jpg'),quality:90});
 await page.goto(baseURL+'/canine-museum/index.html?tour=food');await wait(()=>window.__photoOrbit?.state.installed.length===6);
 for(const [key,sec,ids] of [['chest',15.65,['lungs','heart']],['upper',23.75,['liver','stomach']],['bowel',37.4,['kidney','gut']]]){
   await page.locator('#tour-time').fill(String(sec));await wait(()=>!!document.querySelector('.tour-door:not([hidden])')&&!document.querySelector('#tour-doorways').hidden);
   assert.deepEqual((await state()).tour.nearby,ids);await snapshot(key+'-approach');
   const saved=(await state()).tour;const pose=(await state()).camera;
   for(const id of ids){
     const door=page.locator('.tour-door[data-organ='+id+']');await door.click();
     await page.waitForFunction(id=>window.__photoOrbit.state.free&&window.__photoOrbit.state.tour.visiting===id&&window.__photoOrbit.state.detail.includes(id),id);
     const entered=(await state()).camera;assert.notDeepEqual(entered,pose);await snapshot(id+'-interior');
     await stage.focus();await page.keyboard.press('ArrowRight');await wait(()=>true);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     assert.notDeepEqual((await state()).camera,entered);
     await page.locator('#tour-room-back').click();await wait(()=>!window.__photoOrbit.state.tour.visiting);
     assert.equal((await state()).tour.elapsed,saved.elapsed);assert.equal((await state()).tour.playing,false);
     assert.deepEqual((await state()).camera,pose);
   }
 }
 // Scrub to just before the first encounter, start from a fresh trip and wait for automatic docking.
 await page.locator('#tour-exit').click();await page.locator('#food-start').click();
 await page.locator('#tour-time').fill('13.5');await wait(()=>window.__photoOrbit.state.tour.parked);
 assert.deepEqual((await state()).tour.nearby,['lungs','heart']);await snapshot('chest-docked');
 await page.locator('#tour-pass').click();await wait(()=>window.__photoOrbit.state.tour.playing);
 await page.locator('.tour-door[data-organ=heart]').click();await wait(()=>window.__photoOrbit.state.free);
 const when=(await state()).tour.elapsed;await page.waitForTimeout(500);assert.equal((await state()).tour.elapsed,when);
 await page.keyboard.press('Escape');await wait(()=>!window.__photoOrbit.state.tour.visiting&&window.__photoOrbit.state.tour.playing);
 await page.locator('#tour-exit').click();assert.equal((await state()).tour.active,false);
 // Enter through the working kiln doorway before the automatic two-gallery stop.
 await page.goto(baseURL+'/canine-museum/index.html?tour=food&station=stomach');
 await wait(()=>window.__photoOrbit?.state.tour.channels.includes('stomach')&&window.__photoOrbit.state.installed.length===6);
 assert.equal((await state()).tour.index,2);
 await page.locator('#tour-time').fill('19.75');
 const kiln=page.locator('.tour-door[data-organ=stomach]');await kiln.waitFor({state:'visible'});
 assert.deepEqual((await state()).tour.nearby,['stomach']);
 const beforeKiln=await state(),sign=await kiln.boundingBox();
 await page.mouse.click(sign.x+sign.width/2,sign.y-7);
 await wait(()=>window.__photoOrbit.state.free&&window.__photoOrbit.state.tour.visiting==='stomach');
 await page.locator('#tour-room-back').click();await wait(()=>!window.__photoOrbit.state.tour.visiting);
 assert.equal((await state()).tour.elapsed,beforeKiln.tour.elapsed);
 assert.deepEqual((await state()).camera,beforeKiln.camera);
 assert.deepEqual(errors,[]);console.log({mobile,passed:'all six Hi3D visits, free exploration, exact restore, docking and playback'});
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
