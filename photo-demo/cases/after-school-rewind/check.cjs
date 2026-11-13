const assert = require('node:assert/strict');
const path = require('node:path');

exports.orbit = { range: 'progress', state: 'rewindState', pose: 'pose', handoff: [.25, .44] };

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
  const end = () => page.waitForFunction(() => window.rewindState().time === 4);
  const first = await state();
  for(const role of ['field','basket','classblock','gymhall'])assert(first.roles.includes(role));
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
  assert(Math.hypot(final.ball.x - final.rim.x, final.ball.y - final.rim.y) < .02);
  await shot('court');

  const stage = await page.locator('#stage').boundingBox();
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
    await move(x + inward * ((4 - target) + (target === 0 ? .12 : 0)) * stage.width / 11, y);
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
    assert(s.palmGap < 1e-4);
    if (!inHand) { inHand = s; await shot('in-hand'); }
    else { assert.deepEqual(s.ball, inHand.ball); assert.deepEqual(s.walkers, inHand.walkers); }
    await lift(); await end();
  }

  await page.locator('#sound').click();
  const releases = [];
  for (const [target, label] of [[1, 'release'], [2.3, 'apex']]) {
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
  return {device, viewport, coldOrbit, triangles: first.triangles, splats: first.splats, roles: first.roles, releases, handReturns: 3, campusWalk:{arrival:arrival.eye,west,east,spanMetres:east[0]-west[0]}};
};
