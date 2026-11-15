const assert = require('node:assert/strict');
const path = require('node:path');
const {observeScenes} = require('../../pipeline/qa/clearance.cjs');

async function poolView(page, name) {
  return page.evaluate(async name => {
    const T = await import('three');
    const {pose, projection, walkPosition} = window.soleCityState();
    const pools = [];
    for (const scene of window.qaScenes) {
      scene.traverseVisible(object => {
        if (object.isMesh && object.name.startsWith('坑内积水')) pools.push(object);
      });
    }
    const eye = new T.Vector3().fromArray(walkPosition);
    const pool = name ? pools.find(o => o.name === name) :
      pools.sort((a, b) => a.position.distanceToSquared(eye) - b.position.distanceToSquared(eye))[0];
    if (!pool) throw Error('路面机位没有可见的积水网格');
    const camera = new T.Matrix4().fromArray(pose);
    const forward = new T.Vector3(0, 0, -1).transformDirection(camera)
      .transformDirection(pool.parent.matrixWorld.clone().invert());
    const toward = pool.position.clone().sub(eye).normalize();
    const yaw = dir => Math.atan2(dir.x, -dir.z);
    const turn = yaw(toward) - yaw(forward);
    const center = pool.getWorldPosition(new T.Vector3()).applyMatrix4(camera.invert())
      .applyMatrix4(new T.Matrix4().fromArray(projection));
    return {name:pool.name, eye:walkPosition, center:center.toArray(),
      turn:Math.atan2(Math.sin(turn), Math.cos(turn)), tilt:Math.asin(toward.y)-Math.asin(forward.y)};
  }, name);
}

exports.checkWater = async function(page, device, out) {
  await observeScenes(page);
  await page.goto(new URL('./?explore=bridge-road', page.url()).href);
  await page.waitForFunction(() => window.soleCityState?.().mode === 'walk', null, {timeout:120000});
  async function record(label, name) {
    await page.evaluate(() => window.soleCityWaitForDetail());
    const view = await poolView(page, name);
    const [x,y,z] = view.center;
    assert(Math.abs(x)<.9 && Math.abs(y)<.9 && Math.abs(z)<1, label+' 的积水中心应在取景内');
    await page.screenshot({path:path.join(out,device+'-'+label+'.jpg'),type:'jpeg',quality:90});
    return view;
  }

  const bridge = await record('bridge-road');
  const touch = device === 'mobile';
  const next = page.getByRole('button', {name:'去茶楼前'});
  if (touch) await next.tap(); else await next.click();
  const tea = await record('teahouse-water');
  assert.notEqual(tea.name, bridge.name);

  const pad = await page.locator('#pad').boundingBox();
  const stage = await page.locator('#stage').boundingBox();
  const session = touch ? await page.context().newCDPSession(page) : null;
  async function press(x,y) {
    if (touch) await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    else { await page.mouse.move(x,y); await page.mouse.down(); }
  }
  async function move(x,y) {
    if (touch) await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
    else await page.mouse.move(x,y);
  }
  async function release() {
    if (touch) await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await page.mouse.up();
  }
  try {
    // A shallow sideways/forward joystick movement keeps the speed controllable
    // across devices. Stop at a world position rather than after a fixed delay.
    const x=pad.x+pad.width/2, y=pad.y+pad.height/2;
    await press(x,y);
    try {
      await move(x+pad.width*.065, y-pad.height*.043);
      await page.waitForFunction(start => window.soleCityState().walkPosition[0] < start-.026, tea.eye[0]);
    } finally { await release(); }

    const offset = await poolView(page, tea.name);
    const cx=stage.x+stage.width*.5, cy=stage.y+stage.height*.48;
    const sign = touch ? -1 : 1;
    await press(cx,cy);
    try {
      await move(cx+sign*stage.width*offset.turn/3.8,cy-sign*stage.height*offset.tilt/2.25);
    } finally { await release(); }
    const side = await record('teahouse-water-sidestep', tea.name);
    assert(Math.abs(side.eye[0]-tea.eye[0])>.025);
    return {bridge, tea, side};
  } finally { if (session) await session.detach(); }
};
