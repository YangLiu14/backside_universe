const {launchBrowser,baseURL}=require('./marble-browser.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const dir=path.resolve(__dirname,'../evidence/canine-production/hi3d-organs');
const ids=['heart','lungs','liver','stomach','kidney','gut'];
(async()=>{const b=await launchBrowser();try{const small=process.env.SMALL==='1';
const p=await b.newPage({viewport:small?{width:390,height:844}:{width:1220,height:960},deviceScaleFactor:1,reducedMotion:'reduce',isMobile:small,hasTouch:small});const errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await p.goto(baseURL+'/canine-museum/index.html?angle=90');await p.locator('#stage[data-ready=true]').waitFor({timeout:50000});
const state=()=>p.evaluate(()=>window.__photoOrbit.state),stage=p.locator('#stage'),slider=p.locator('#angle');
const snap=async file=>{await p.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame)});await stage.screenshot({path:path.join(dir,(small?'mobile-':'')+file+'.jpg'),quality:93})};
if(process.env.SHELL_ONLY==='1'){await snap('shell');console.log(errors);return}
await p.waitForFunction(()=>window.__photoOrbit.state.installed.length===6,null,{timeout:60000});
await snap('overview');assert.equal(await p.locator('.organ-pin:visible').count(),6);
await p.locator('#coat-toggle').click();await p.waitForFunction(()=>window.__photoOrbit.state.open===0);await snap('coat');await p.locator('#coat-toggle').click();
const cdp=small?await p.context().newCDPSession(p):null;
const frame=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function area(){await stage.scrollIntoViewIfNeeded();const b=await stage.boundingBox();return {x:Math.round(b.x+b.width*.55),y:Math.round(b.y+b.height*.58),w:b.width};}
async function touch(type,pts){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([id,x,y])=>({id,x:Math.round(x),y:Math.round(y)}))});}
async function dolly(){
  const {x,y,w}=await area();
  if(small){const a=w*.10,b=w*.17;await touch('touchStart',[[1,x-a,y],[2,x+a,y]]);
    await touch('touchMove',[[1,x-b+8,y+7],[2,x+b+8,y+7]]);await touch('touchEnd',[]);}
  else{await p.mouse.move(x,y);await p.mouse.wheel(0,-190);}
  await p.waitForFunction(()=>window.__photoOrbit.state.focusZoom<.90);
}
async function drag(pan=false){
  const {x,y,w}=await area();const dx=Math.round(w*.12);
  if(small){
    const pts=pan?[[1,x-24,y-5],[2,x+24,y+5]]:[[1,x,y]];
    await touch('touchStart',pts);await touch('touchMove',pts.map(([id,u,v])=>[id,u+dx,v-9]));await touch('touchEnd',[]);
  }else{const button=pan?'right':'left';await p.mouse.move(x,y);await p.mouse.down({button});
    await p.mouse.move(x+dx,y-9,{steps:6});await p.mouse.up({button});}
  await frame();
}
const full=(await state()).camera;
if(!small){
  // Approach a real gallery from the unselected overview; its high-resolution model should stream in.
  const pin=p.getByRole('button',{name:'胃 · 旋流陶坊',exact:true});
  await pin.scrollIntoViewIfNeeded();const bounds=await pin.boundingBox();
  await p.mouse.move(bounds.x+bounds.width*.7,bounds.y+bounds.height*.3);
  await p.mouse.wheel(0,-680);
  await p.waitForFunction(()=>!window.__photoOrbit.state.selected&&window.__photoOrbit.state.detail.includes('stomach'));
  await p.locator('#side-reset').click();await frame();
}
assert.equal(await p.locator('#gallery-nearer,#gallery-farther').count(),0);
await dolly();await drag();const rotated=await state();assert.notDeepEqual(rotated.camera,full);
await drag(true);const travel=await state();assert.notDeepEqual(travel.target,rotated.target);
const rows=[];
for(const id of ids){
 await p.locator('[data-gallery='+id+']').click();await p.waitForFunction(id=>window.__photoOrbit.state.focus===1 && window.__photoOrbit.state.selected===id,id);
 await p.waitForFunction(id=>window.__photoOrbit.state.detail.includes(id),id,{timeout:40000});assert.equal((await state()).detail.length,1);
 await snap(id+'-front');const start=await state();
 await drag();await snap(id+'-oblique');assert.notDeepEqual((await state()).camera,start.camera);
 await dolly();const near=await state();await snap(id+'-near');await drag(true);
 assert.notDeepEqual((await state()).target,near.target);
 if(id==='stomach'){
   await p.locator('#gallery-reset').click();await frame();
   const {x,y}=await area();
   if(small){for(let i=0;i<2;i++){await touch('touchStart',[[1,x,y]]);await touch('touchEnd',[]);}}
   else await p.mouse.dblclick(x,y);
   await frame();assert.notDeepEqual((await state()).target,start.target,'focus on exhibit surface');await snap('stomach-focused');
 }
 await p.locator('#gallery-reset').click();await frame();assert.deepEqual((await state()).camera,start.camera);
 await p.locator('#gallery-back').click();await p.waitForFunction(()=>window.__photoOrbit.state.selected===null);await frame();
 assert.deepEqual((await state()).camera,travel.camera,'restore custom overview');rows.push(id);
}
await p.locator('#side-reset').click();await frame();assert.deepEqual((await state()).camera,full);
await slider.fill('25');await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const first=await state();await slider.fill('84');await slider.fill('25');await p.waitForTimeout(100);assert.deepEqual((await state()).camera,first.camera);
await slider.fill('0');await p.waitForFunction(()=>window.__photoOrbit.state.photoOpacity==='1');await snap('photo');assert.equal(await p.locator('.organ-pin:visible').count(),0);
await p.locator('[data-gallery=heart]').click();await p.waitForFunction(()=>window.__photoOrbit.state.focus===1);await stage.focus();await p.keyboard.press('Escape');await p.waitForFunction(()=>!window.__photoOrbit.state.selected);
assert.deepEqual(errors,[]);await fs.writeFile(path.join(dir,(small?'mobile-':'')+'check.json'),JSON.stringify({rows,errors},null,2));console.log(rows)
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
