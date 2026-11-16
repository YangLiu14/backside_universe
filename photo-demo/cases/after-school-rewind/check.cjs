const assert = require('node:assert/strict');
const path = require('node:path');
const {inspectActors,assertHandContacts,assertDuration}=require('./check-actors.cjs');
const {inspectMotionNumbers}=require('./check-motion.cjs');

exports.orbit = { range: 'progress', state: 'rewindState', pose: 'pose', handoff: [.25, .44], skinnedMotion: true };

exports.check = async function (page, device, viewport, out, url, coldOrbit) {
  const state = () => page.evaluate(() => window.rewindState());
  const shot = label => page.screenshot({path: path.join(out, device + '-' + label + '.jpg'), type: 'jpeg', quality: 94});
  const still = name => page.locator('#frame').screenshot({
    path: path.join(out, 'album-' + name + '.png'),
    style: '#grip, #sub, #stick { visibility: hidden !important }',
  });
  const seek = async value => {
    await page.locator('#progress').fill(String(value));
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  };
  const end = () => page.waitForFunction(() => {const s=window.rewindState();return s.time===s.duration;});
  const first = await state();
  const duration=assertDuration(first);
  const initialMotion=await page.evaluate(()=>rewindMotionSample(0));
  const releaseTime=initialMotion.releaseTime;
  const apexTime=initialMotion.ballPhysics.events.find(e=>e.type==='apex').time;
  for(const role of ['field','basket','classblock','gymhall','console','microphone','announcer','announcer-head','campus-tree','campus-foliage','shooter-head','walker-head','companion-head'])assert(first.roles.includes(role));
  assert(first.headMounted,'Independent head is mounted in the broadcast booth');
  assert(first.oldHeadRemovedTriangles>10000,'The old face and ponytail are removed');
  assert(first.splats > 0 && first.triangles > 0);
  const views = [];
  for (const [value, name] of [[0, 'source'], [200, 'parallax'], [350, 'handoff'], [670, 'edge'], [1000, 'reveal']]) {
    await seek(value);
    await shot(name);
    if(device==='desktop' && name==='reveal')await still('cassette');
    views.push([value, await state()]);
  }

  await page.locator('#enter').click();
  await end();
  const final = await state();
  assert.equal(final.time,duration,'The performance continues through its declared end; ball physics is checked over the complete trajectory below');
  await shot('court');

  const stage = await page.locator('#stage').boundingBox();
  // Look past the front furniture from both sides, then restore the exact
  // arrival before exercising the pencil and the portal.
  const inspection = device === 'mobile' ? await page.context().newCDPSession(page) : null;
  for(const [dx,label] of [[.17,'broadcast-left'],[-.17,'broadcast-right']]) {
    const sx=stage.x+stage.width*.72,sy=stage.y+stage.height*.32;
    if(inspection) {
      await inspection.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]});
      await inspection.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+stage.width*dx,y:sy-18}]});
      await inspection.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      await page.mouse.move(sx,sy);await page.mouse.down();
      await page.mouse.move(sx+stage.width*dx,sy-18,{steps:10});await page.mouse.up();
    }
    assert.notDeepEqual((await state()).pose,final.pose,'The broadcast close-up must have real parallax');
    await shot(label);
    await page.locator('#enter').click();await page.locator('#enter').click();await end();
    assert.deepEqual((await state()).pose,final.pose);
  }
  // The portrait is a real camera view of the independent Hi3D character.
  // Inspect its face and hands from both sides, then recover the room view.
  await page.locator('#portrait').click();
  assert.equal((await state()).portrait,true);
  assert.notDeepEqual((await state()).pose,final.pose);
  await shot('announcer-front');
  for(const [dx,label] of [[.16,'announcer-left'],[-.32,'announcer-right']]) {
    const sx=stage.x+stage.width*.67,sy=stage.y+stage.height*.34;
    if(inspection) {
      await inspection.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]});
      await inspection.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+stage.width*dx,y:sy}]});
      await inspection.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      await page.mouse.move(sx,sy);await page.mouse.down();
      await page.mouse.move(sx+stage.width*dx,sy,{steps:10});await page.mouse.up();
    }
    await shot(label);
  }
  await page.locator('#portrait').click();
  assert.equal((await state()).portrait,false);
  assert.deepEqual((await state()).pose,final.pose,'Leaving the portrait restores the room camera');
  const grip = await page.locator('#grip').boundingBox();
  const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
  const cdp = device === 'mobile' ? await page.context().newCDPSession(page) : null;
  const start = async () => {
    if (cdp) await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    else { await page.mouse.move(x, y); await page.mouse.down(); }
  };
  const move = async (px, py) => {
    if (cdp) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x:px, y:py}]});
    else await page.mouse.move(px, py, {steps: 6});
  };
  const lift = async () => {
    if (cdp) await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    else await page.mouse.up();
  };
  const dragTo = async target => {
    await start();
    assert.equal((await state()).held, 'pencil');
    const inward = x < stage.x + stage.width / 2 ? 1 : -1;
    await move(x + inward * ((duration - target) + (target === 0 ? .12 : 0)) * stage.width / 11, y);
    const s = await state();
    assert(Math.abs(s.time - target) < .04, 'pencil scrub landed at ' + s.time + ' instead of ' + target);
    assert.deepEqual(s.pose, final.pose);
    assert.equal(s.ballCount, 1);
    return s;
  };

  // Revisit the same real hand and both students' feet with three independent grabs.
  let inHand;
  for (let i = 0; i < 3; i++) {
    const s = await dragTo(0);
    assertHandContacts(s);
    if (!inHand) { inHand = s; await shot('in-hand'); }
    else { assert.deepEqual(s.ball, inHand.ball); assert.deepEqual(s.walkers, inHand.walkers); }
    await lift(); await end();
  }

  await page.locator('#sound').click();
  const releases = [];
  for (const [target, label] of [[releaseTime, 'release'], [apexTime, 'apex']]) {
    const before = await dragTo(target);
    assert(before.voicePaused);
    await shot(label);
    if(device==='desktop' && label==='apex')await still('studio');
    await lift();
    await page.waitForFunction(t => {
      const s = window.rewindState();
      return !s.held && s.time > t + .05 && !s.voicePaused && Math.abs(s.time - s.voiceTime) < .19;
    }, target, {timeout: 6000});
    const after = await state();
    assert(after.time < target + .8);
    assert.deepEqual(after.pose, before.pose);
    releases.push({requested: target, grabbed: before.time, resumed: after.time, broadcastTime: after.voiceTime});
    await end();
  }
  await page.locator('#sound').click();
  await page.locator('#stage').focus();
  await page.keyboard.down('r');
  await page.waitForFunction(() => window.rewindState().time === 0);
  assert.equal((await state()).held, 'button');
  await page.keyboard.up('r');
  await page.waitForFunction(() => window.rewindState().time > .06);

  const boothPose=(await state()).pose;
  await page.locator('#yard').click();
  await page.waitForFunction(()=>rewindState().tour==='court');
  const arrival=await state();await shot('sideline');
  if(device==='desktop')await still('court');
  // Walk from one half, across centre court, to both ends using the real controls.
  async function walkAcross(direction,target){
    const key=direction<0?'KeyA':'KeyD';
    if(cdp){
      const stick=await page.locator('#stick').boundingBox();assert(stick,'touch joystick missing');
      const sx=stick.x+stick.width/2,sy=stick.y+stick.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+direction*32,y:sy}]});
    }else await page.keyboard.down(key);
    await page.waitForFunction(([sign,x])=>sign*(rewindState().eye[0]-x)>=0,[direction,target],{timeout:22000});
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up(key);
    return (await state()).eye;
  }
  const west=await walkAcross(-1,-14),east=await walkAcross(1,14);
  assert(east[0]-west[0]>=28);
  const beforeLook=await state();
  if(cdp){
    const sx=stage.x+stage.width*.7,sy=stage.y+stage.height*.44;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx-100,y:sy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await page.mouse.move(stage.x+stage.width*.5,stage.y+stage.height*.5);await page.mouse.down();
    await page.mouse.move(stage.x+stage.width*.7,stage.y+stage.height*.5,{steps:8});await page.mouse.up();
  }
  await page.waitForFunction(p=>rewindState().pose.some((v,i)=>Math.abs(v-p[i])>.015),beforeLook.pose);
  assert(Math.hypot(...(await state()).eye.map((v,i)=>v-beforeLook.eye[i]))<.1);
  await shot('campus');
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='booth');
  assert.deepEqual((await state()).pose,boothPose);
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='court');
  assert.deepEqual((await state()).eye,arrival.eye);
  // Walk to the drain and rest area along the facing direction inherited from
  // the studio window. The other route above stays at the original comparison poses.
  async function approach(z){
    if(cdp){
      const area=await page.locator('#stick').boundingBox();
      const x=area.x+area.width/2,y=area.y+area.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-32}]});
    }else await page.keyboard.down('KeyW');
    try { await page.waitForFunction(z=>rewindState().eye[2]<z,z,{timeout:15000}); }
    finally {
      if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      else await page.keyboard.up('KeyW');
    }
  }
  await approach(-7.65);
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(()=>rewindState().pose[9]>.48);
  await page.keyboard.up('ArrowDown');
  await shot('drain');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(()=>rewindState().pose[9]<.04);
  await page.keyboard.up('ArrowUp');
  await approach(-11.7);
  await shot('rest-area');
  await approach(-14.1);
  await shot('classroom-near');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(()=>rewindState().pose[9]<-.25);
  await page.keyboard.up('ArrowUp');
  await shot('classroom-upper');
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='booth');
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='court');
  await approach(-5.8);
  if(cdp){
    const area=await page.locator('#stick').boundingBox(),x=area.x+area.width/2,y=area.y+area.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+32,y}]});
  }else await page.keyboard.down('KeyD');
  try {await page.waitForFunction(()=>rewindState().eye[0]>16,{timeout:10000});}
  finally {
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await page.keyboard.up('KeyD');
  }
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(()=>rewindState().pose[9]<-.55);
  await page.keyboard.up('ArrowUp');
  await shot('tree-near');
  const nearTree=(await state()).foliage;
  assert(nearTree[2].near && !nearTree[2].far,'Walking up to the eastern tree selects its detailed leaves');
  assert(nearTree.every(t=>t.near!==t.far),'Each tree renders exactly one leaf detail level');
  if(cdp){
    const area=await page.locator('#stick').boundingBox(),x=area.x+area.width/2,y=area.y+area.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-32,y}]});
  }else await page.keyboard.down('KeyA');
  try {await page.waitForFunction(()=>rewindState().eye[0]<12.7,{timeout:10000});}
  finally {
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await page.keyboard.up('KeyA');
  }
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(()=>rewindState().pose[8]<-.58);
  await page.keyboard.up('ArrowRight');
  await shot('tree-side');
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='booth');
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='court');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(()=>rewindState().pose[9]<-.40);
  await page.keyboard.up('ArrowUp');
  assert((await state()).foliage[2].far,'Returning to the window landing restores distant foliage');
  // Eight overlapping azimuths include the original latlong wrap. Keep these
  // real camera captures for visual review of the sunset, tree crown and roofs.
  for(let side=0;side<8;side++){
    await shot('sunset-'+side);
    const before=(await state()).pose;
    const facing=[before[8],before[10]],norm=Math.hypot(...facing);
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(([x,z,n])=>{
      const m=rewindState().pose;
      return (x*m[8]+z*m[10])/(n*Math.hypot(m[8],m[10]))<Math.SQRT1_2;
    },[...facing,norm]);
    await page.keyboard.up('ArrowRight');
  }
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='booth');
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='court');
  const actorViews=await inspectActors(page,out,device);
  const motion=await inspectMotionNumbers(page,out,device);
  await page.locator('#yard').click();await page.waitForFunction(()=>rewindState().tour==='booth');
  await page.locator('#enter').click();
  for (const [value, prev] of views.reverse()) {
    await seek(value);
    const current = await state();
    assert.deepEqual(current.pose, prev.pose);
    assert.deepEqual(current.projection, prev.projection);
  }
  const ox = stage.x + stage.width * .7, oy = stage.y + stage.height / 2;
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:ox,y:oy}]});
    await move(ox - stage.width * .4, oy);
    await lift();
  } else {
    await page.mouse.move(ox, oy); await page.mouse.down(); await move(ox - stage.width * .4, oy); await lift();
  }
  assert((await state()).progress > .4);
  await page.locator('#home').click();
  assert.deepEqual((await state()).pose, first.pose);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  return {device, viewport, coldOrbit, triangles: first.triangles, splats: first.splats, roles: first.roles, releases, handReturns: 3, actorViews, motion:motion.report, campusWalk:{arrival:arrival.eye,west,east,spanMetres:east[0]-west[0]}};
};
