// Browser checks distinguish an empty waiting page from an actual generated scene.
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'evidence/marble-lab/browser');
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await launchBrowser();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${baseURL}/marble-lab/index.html`);
  await page.waitForFunction(()=>window.__marbleLab);
  const manifest=await (await page.request.get(`${baseURL}/marble-lab/assets/scene.json`)).json();
  const result={generated:manifest.status==='generated',errors,states:[]};
  if(result.generated){
   await page.waitForFunction(()=>window.__marbleLab?.state.ready,{},{timeout:90000});
   await page.waitForTimeout(1200);
   for(const crop of ['full','desk','laptop','cup']){
    for(const angle of [0,-3,3,-6,6,-12,12]){
     await page.evaluate(({crop,angle})=>{window.__marbleLab.setCrop(crop);window.__marbleLab.setAngle(angle);},{crop,angle});
     await page.waitForTimeout(400);
     const state=await page.evaluate(()=>window.__marbleLab.state);
     assert.equal(state.angle,angle);assert.equal(state.referenceVisible,false);result.states.push(state);
     await page.locator('#world').screenshot({path:path.join(out,`${crop}-${angle}.png`)});
    }
   }
   await page.evaluate(()=>window.__marbleLab.setAngle(6));await page.waitForTimeout(500);
   const read=()=>page.evaluate(()=>({camera:window.__marbleLab.state.camera,pixels:document.querySelector('#world').toDataURL()}));
   const before=await read();await page.evaluate(()=>window.__marbleLab.setAngle(-12));await page.waitForTimeout(500);
   await page.evaluate(()=>window.__marbleLab.setAngle(6));await page.waitForTimeout(500);
   const after=await read();assert.deepEqual(before.camera,after.camera);
   result.reverse={cameraIdentical:true,imageIdentical:before.pixels===after.pixels};
   assert.ok(result.reverse.imageIdentical);
   await page.locator('#calibration-panel').evaluate(el=>el.open=true);
   await page.locator('#toggle-reference').click();assert.equal(await page.evaluate(()=>window.__marbleLab.state.angle),0);
   assert.equal(await page.evaluate(()=>window.__marbleLab.state.referenceVisible),true);
   await page.locator('#play').click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__marbleLab.state.referenceVisible),false);
   await page.locator('#play').click();const stopped=await page.evaluate(()=>window.__marbleLab.state.angle);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__marbleLab.state.angle),stopped);
   // Exercise actual pointer and keyboard handlers, not just the diagnostic API.
   await page.evaluate(()=>{window.__marbleLab.setCrop('desk');window.__marbleLab.setAngle(0);});
   await page.locator('#world').scrollIntoViewIfNeeded();
   const box=await page.locator('#world').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.5;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+box.width*.25,y,{steps:10});await page.mouse.up();
   assert.ok(Math.abs((await page.evaluate(()=>window.__marbleLab.state.angle))+6)<.15);
   await page.locator('#world').focus();await page.keyboard.press('Home');
   assert.equal(await page.evaluate(()=>window.__marbleLab.state.angle),0);
   await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>window.__marbleLab.state.angle),.5);
   await page.locator('#calibration-panel').evaluate(el=>el.open=false);
   await page.evaluate(()=>{window.__marbleLab.setCrop('full');window.__marbleLab.setAngle(0);});
  }else{
   await page.waitForTimeout(500);
   assert.equal(await page.evaluate(()=>window.__marbleLab.state.ready),false);
   assert.ok(await page.locator('#angle').isDisabled());assert.ok(await page.locator('#play').isDisabled());
   assert.ok((await page.locator('#result-note').textContent()).includes('尚未'));
   result.note='Waiting-state UI only. No Marble output exists; no visual acceptance claimed.';
  }
  assert.equal((await page.request.get(`${baseURL}/.env.local`)).status(),404);
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'qa.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({generated:result.generated,stops:result.states.length,reverse:result.reverse,errors,note:result.note}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
