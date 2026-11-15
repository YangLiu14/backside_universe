const assert=require('node:assert/strict');
const path=require('node:path');
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
const dist=(a,b)=>Math.hypot(a[12]-b[12],a[13]-b[13],a[14]-b[14]);
exports.checkWalk=async function(page,device,out){
  const state=()=>page.evaluate(()=>window.soleCityState());
  const touch=device==='mobile',street=page.locator('#street'),stage=page.locator('#stage');
  const click=el=>touch?el.tap():el.click();
  const orig=await state();await click(street);
  const entry=await state();await delay(200);const idle=await state();
  assert.deepEqual(idle.pose,entry.pose,'Entering exploration must leave the camera still until input');
  assert.equal(entry.mode,'walk');
  const key=async(name,ms)=>{await page.keyboard.down(name);await delay(ms);await page.keyboard.up(name);};
  const box=await stage.boundingBox(),x=box.x+box.width*.62,y=box.y+box.height*.48;
  if(touch){
    const session=await page.context().newCDPSession(page);
    const pad=await page.locator('#pad').boundingBox();
    const px=pad.x+pad.width/2,py=pad.y+pad.height/2;
    const finger=(id,x,y)=>({id,x,y,radiusX:3,radiusY:3});
    const send=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
    await send('touchStart',[finger(1,px,py)]);
    await send('touchMove',[finger(1,px,py-pad.height*.38)]);
    await delay(440);const forward=await state();assert(dist(entry.pose,forward.pose)>.015,'Touch joystick must move the eye');
    await send('touchStart',[finger(1,px,py-pad.height*.38),finger(2,x,y)]);
    await send('touchMove',[finger(1,px,py-pad.height*.38),finger(2,x+55,y-18)]);
    await delay(150);const turned=await state();assert.notDeepEqual(turned.pose.slice(0,12),forward.pose.slice(0,12),'Second finger must look while walking');
    await send('touchEnd',[]);await session.detach();
  }else{
    await key('w',470);const forward=await state();assert(forward.walkPosition[2]>entry.walkPosition[2]+.02,'W must take a step into the gate');
    await key('s',300);const back=await state();assert(back.walkPosition[2]<forward.walkPosition[2]-.01);
    await key('a',250);const left=await state();await key('d',250);const right=await state();assert(dist(left.pose,right.pose)>.008);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y-25,{steps:5});await page.mouse.up();
    const looked=await state();assert(dist(looked.pose,right.pose)<1e-6,'Looking should rotate in place');
    assert.notDeepEqual(looked.pose.slice(0,12),right.pose.slice(0,12));
  }
  const moved=await state();assert.equal(moved.progress,orig.progress,'Exploring should not change film time');
  await delay(160);assert.deepEqual((await state()).pose,moved.pose,'Input held after release');
  if(out){
    await page.evaluate(()=>window.soleCityWaitForDetail?.());
    await page.screenshot({path:path.join(out,device+'-free-walk.jpg'),type:'jpeg',quality:85});
  }
  await click(street);assert.deepEqual((await state()).pose,orig.pose,'Exit restores exact saved viewpoint');
  await click(street);assert.deepEqual((await state()).pose,entry.pose,'Revisit must reset inputs and view');
  const next=page.locator('#next-stop');
  await click(next);
  const shop=await state();
  assert.equal(shop.onBridge,false);
  assert.equal(shop.mode,'walk');
  await page.evaluate(()=>window.soleCityWaitForDetail());
  if(out)await page.screenshot({path:path.join(out,device+'-herbal-shop.jpg'),type:'jpeg',quality:90});
  await click(next);
  const lookout=await state();
  assert.equal(lookout.onBridge,true);
  assert(dist(shop.pose,lookout.pose)>.1,'Landmark shortcuts must move between the street and the bridge deck');
  await page.evaluate(()=>window.soleCityWaitForDetail());
  if(out)await page.screenshot({path:path.join(out,device+'-street-end.jpg'),type:'jpeg',quality:90});
  if(out && device==='desktop')await page.locator('#stage').screenshot({
    path:path.join(out,'album-street-end.png'),style:'#pad, .album-head { visibility: hidden !important }'});
  await click(next);assert.deepEqual((await state()).pose,shop.pose,'Revisiting the herbal shop should reset the viewpoint');
  await click(page.locator('#home'));const home=await state();assert.equal(home.progress,0);assert.equal(home.mode,'film');
  return {entry:entry.walkPosition,afterInput:moved.walkPosition};
};
