// Exercise the handoff between the timeline, direct camera controls and bookroom.
const assert=require('node:assert/strict');
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const url=baseURL+'/marble-transition-lab/index.html';
const state=p=>p.evaluate(()=>window.__marbleTransition.state);
const eye=m=>m.slice(12,15);
const axes=m=>m.slice(0,12);
const same=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-9);
async function ready(page){await page.waitForSelector('#world[data-ready=true]');}
async function back(page){await page.waitForSelector('#stage[data-browsing=true]');}
async function room(page,stage){await page.waitForSelector('#world[data-visit='+stage+'][data-visit-busy=false]');}
async function atPose(page,pose){
  await page.waitForFunction(expected=>window.__marbleTransition.state.camera.every((v,i)=>Math.abs(v-expected[i])<1e-9),pose);
}
async function desktop(browser){
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],detail=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(/\/bookroom\/.*\.glb$/.test(r.url()))detail.push(r.url());});
  await page.goto(url);await ready(page);const source=await state(page);
  assert(await page.locator('#explore-tools').isHidden());
  await page.click('[data-progress="0.32"]');await page.click('#play');await back(page);
  await page.waitForFunction(()=>!window.__marbleTransition.state.playing);
  const overview=await state(page);
  const r=await page.locator('#world').boundingBox(),x=r.x+r.width*.5,y=r.y+r.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+95,y+34,{steps:8});await page.mouse.up();
  const looked=await state(page);assert.equal(looked.progress,1);
  assert(same(eye(overview.camera),eye(looked.camera)),'looking around must leave the eye in place');
  assert(!same(axes(overview.camera),axes(looked.camera)),'drag must change the heading');
  await page.mouse.wheel(0,-140);await page.waitForFunction(previous=>window.__marbleTransition.state.camera[14]!==previous,looked.camera[14]);
  const zoomed=await state(page);
  // Send just one keydown, then sample rendered frames before any OS repeat.
  await page.keyboard.down('ArrowUp');
  const frames=await page.evaluate(async()=>{
    const samples=[];
    for(let i=0;i<12;i++){await new Promise(requestAnimationFrame);samples.push(window.__marbleTransition.state.camera);}
    return samples;
  });
  await page.keyboard.up('ArrowUp');
  assert(frames.every(m=>same(axes(m),axes(zoomed.camera))),'forward movement must preserve orientation');
  assert(frames.slice(1).every((m,i)=>!same(eye(m),eye(frames[i]))),'a held key must move the camera every frame');
  const released=await state(page);await page.waitForTimeout(120);assert(same(released.camera,(await state(page)).camera),'release must stop motion');
  const delta=eye(released.camera).map((v,i)=>v-eye(zoomed.camera)[i]);
  assert(delta.reduce((d,v,i)=>d-v*zoomed.camera[8+i],0)>0,'forward must follow the current heading');
  // Looking and travelling are independent inputs. Losing focus clears the
  // physical key even if its keyup will go to a different control.
  await page.keyboard.down('d');await page.mouse.down();
  await page.mouse.move(x+140,y-30,{steps:5});await page.mouse.up();
  const moving=await state(page);await page.waitForTimeout(100);const strafe=await state(page);
  assert(!same(eye(moving.camera),eye(strafe.camera)));
  assert(!same(axes(released.camera),axes(strafe.camera)));
  await page.locator('#explore-island').focus();const blurred=await state(page);
  await page.waitForTimeout(100);assert(same(blurred.camera,(await state(page)).camera));
  await page.keyboard.up('d');await page.locator('#world').focus();
  await page.keyboard.down('e');await page.waitForTimeout(100);await page.keyboard.up('e');
  assert((await state(page)).camera[13]>blurred.camera[13],'E must raise the eye');
  await page.click('#explore-overview');await atPose(page,overview.camera);
  const pixel=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),t=window.__marbleTransition;
    const island=t.dreamScene.getObjectByName('Desktop island / blue-book');
    const pt=new T.Box3().setFromObject(island).getCenter(new T.Vector3()).project(t.camera);
    const r=document.getElementById('world').getBoundingClientRect();
    return [r.x+(1+pt.x)*r.width/2,r.y+(1-pt.y)*r.height/2];
  });
  await page.mouse.click(...pixel);
  await page.waitForFunction(()=>document.querySelector('#explore-island').value==='blue-book');
  await page.waitForTimeout(700);
  await page.selectOption('#explore-island','phone');
  await page.waitForFunction(()=>window.__marbleTransition.islands.find(e=>e.id==='phone').level==='hd');
  await page.waitForTimeout(700);
  const phone=await state(page);
  assert(!same(phone.camera,overview.camera));assert.deepEqual(detail.map(u=>u.split('/').pop()),['shell-grotto-v6.glb']);
  // Browsing while the room downloads cancels the entry, even at 180°.
  let release,signal;
  const gate=new Promise(done=>{release=done;}),requested=new Promise(done=>{signal=done;});
  await page.route('**/bookroom/bookcase-hd.glb',async route=>{signal();await gate;await route.continue();});
  await page.click('#enter-bookroom');await requested;
  await page.locator('#world').focus();await page.keyboard.press('d');release();
  await page.waitForFunction(()=>window.__marbleTransition.grotto.interior.book);
  assert.equal((await state(page)).visit.stage,'desk');
  await page.selectOption('#explore-island','phone');await atPose(page,phone.camera);
  // From a close-up, take the known approach and come back to the same view.
  await page.click('#reduce-motion');
  await page.click('#enter-bookroom');await room(page,'terrace');
  assert(await page.locator('#explore-tools').isHidden());
  await page.click('[data-visit-action=desktop]');await room(page,'desk');await atPose(page,phone.camera);
  await page.click('#enter-bookroom');await room(page,'terrace');
  for(const [action,phase] of [['enter','inside'],['read','book'],['photo','desk']]){
    await page.click('[data-visit-action='+action+']');await room(page,phase);
  }
  const returned=await state(page);
  assert(same(source.camera,returned.camera));assert(same(source.projection,returned.projection));assert.equal(returned.progress,0);
  // Reversing playback must still reach the original camera after exploration.
  await page.click('[data-progress="1"]');await back(page);await page.selectOption('#explore-island','orange-book');
  await page.click('#reduce-motion');await page.click('#play');await atPose(page,source.camera);
  assert.deepEqual(errors,[]);await page.close();
}
async function touch(browser){
  const page=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'});
  await page.goto(url+'?progress=1');await ready(page);await back(page);
  const overview=await state(page),r=await page.locator('#world').boundingBox();
  const x=Math.round(r.x+r.width*.50),y=Math.round(r.y+r.height*.58);
  const cdp=await page.context().newCDPSession(page);
  const dispatch=(type,coords)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:coords.map(([a,b],id)=>({x:a,y:b,id}))});
  await dispatch('touchStart',[[x,y]]);await dispatch('touchMove',[[x+42,y+18]]);await dispatch('touchEnd',[]);
  const rotated=await state(page);assert(same(eye(overview.camera),eye(rotated.camera)));assert(!same(axes(overview.camera),axes(rotated.camera)));assert.equal(rotated.progress,1);
  await dispatch('touchStart',[[x-30,y],[x+30,y]]);await dispatch('touchMove',[[x-64,y+12],[x+64,y+12]]);await dispatch('touchEnd',[]);
  const pinched=await state(page);assert(!same(rotated.camera,pinched.camera));assert.equal(pinched.progress,1);
  await page.setViewportSize({width:812,height:375});await page.waitForTimeout(180);
  assert(same(pinched.camera,(await state(page)).camera));
  await page.click('#explore-overview');const resized=await state(page);
  await page.click('[data-progress="1"]');assert(same(resized.camera,(await state(page)).camera));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),812);
  await page.close();
}
(async()=>{const browser=await launchBrowser();try{await desktop(browser);await touch(browser);
 console.log('In-place desktop/touch look, continuous keyboard travel, zoom, pan, island picking and LOD, exact room/source returns, touch rotation/pinch and landscape resize passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
