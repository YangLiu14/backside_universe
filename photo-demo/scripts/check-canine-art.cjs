const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {playwright, installedBrowser} = require('../pipeline/verify.cjs');

const [base, destination, device = 'desktop'] = process.argv.slice(2);
if (!base || !destination || !['desktop', 'mobile'].includes(device)) {
  throw Error('Usage: node check-canine-art.cjs <versioned-base-url> <evidence-directory> [desktop|mobile]');
}
const mobile = device === 'mobile';
const galleries = ['heart', 'lungs', 'liver', 'stomach', 'kidney', 'gut'];
const stations = ['mouth', 'esophagus', 'stomach', 'small-intestine', 'colon', 'rectum'];
const branches = [
  ['chest', 15.65, ['lungs', 'heart']],
  ['upper', 23.75, ['liver', 'stomach']],
  ['bowel', 37.4, ['kidney', 'gut']]
];

async function inspect(browser) {
  await fs.mkdir(destination, {recursive: true});
  const context = await browser.newContext({
    viewport: mobile ? {width:390, height:845} : {width:1100, height:800},
    isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const errors = [];
  context.on('page', tab => listen(tab));
  function listen(tab) {
    tab.on('pageerror', error => errors.push(error.message));
    tab.on('console', message => {
      if (/Shader Error|VALIDATE_STATUS|WebGL: INVALID|Exhibit illumination unavailable/.test(message.text())) errors.push(message.text());
    });
    tab.on('response', result => {if (result.status() >= 400) errors.push(result.status()+' '+result.url());});
  }
  listen(page);
  const stage = page.locator('#stage');
  const state = () => page.evaluate(() => window.__photoOrbit.state);
  const screen = (label, tab=page) => tab.locator('#stage').screenshot({
    path:path.join(destination, device+'-'+label+'.jpg'),quality:91
  });
  const frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const tap = el => mobile ? el.tap() : el.click();
  const wait = async (predicate, argument) => {
    try {await page.waitForFunction(predicate, argument, {timeout:75000});}
    catch (error) {
      console.error('Last browser state', await page.evaluate(() => ({
        runtime:window.__photoOrbit?.state, status:document.querySelector('#hint')?.textContent
      })), errors);
      throw error;
    }
  };
  const language = mobile ? 'en' : 'zh';
  await page.goto(base+'/canine-museum/index.html?lang='+language);
  await wait(() => window.__photoOrbit?.state.installed.length === 6);
  assert.equal(await page.evaluate(() => window.__universeLanguage.current), language);
  assert.equal((await state()).angle, 0);
  await screen('photo');
  await page.locator('#angle').fill('45');
  await wait(() => window.__photoOrbit.state.angle === 45);
  await frames(); await screen('handoff');
  await page.locator('#angle').fill('90');
  await wait(() => window.__photoOrbit.state.free);
  await frames(); await screen('overview');
  const [modelTab] = await Promise.all([context.waitForEvent('page'), tap(page.locator('a[href*="dog.html"]'))]);
  await modelTab.waitForFunction(() => window.assetModelStats?.triangles > 0);
  const dogGeometry = await modelTab.evaluate(() => window.assetModelStats);
  await screen('dog', modelTab);
  await tap(modelTab.locator('[data-pose=back]'));
  await screen('dog-back', modelTab);
  await modelTab.close();

  for (const id of galleries) {
    await tap(page.locator('.gallery-entry[data-gallery='+id+']'));
    await wait(id => window.__photoOrbit.state.focus === 1 && window.__photoOrbit.state.detail.includes(id), id);
    await frames(); await screen(id);
    await tap(page.locator('#gallery-back'));
    await wait(() => !window.__photoOrbit.state.selected && window.__photoOrbit.state.focus === 0);
  }
  await tap(page.locator('#food-start'));
  await wait(() => window.__photoOrbit.state.tour.active);
  if ((await state()).tour.playing) await tap(page.locator('#tour-play'));
  await wait(() => !window.__photoOrbit.state.tour.playing);
  for (const [index, t] of [4.2,11.8,21.4,31.4,44.5,56.1].entries()) {
    await page.locator('#tour-time').fill(String(t));
    await wait(id => window.__photoOrbit.state.tour.channels.includes(id), stations[index]);
    await frames(); await screen('clay-'+stations[index]);
  }

  // A real pointer or CDP touch drag produces the same normalized angular travel
  // at any viewport size. No state is set programmatically on the scene.
  async function turn() {
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    const x=box.x+box.width*.57, y=box.y+box.height*.43, end=x+box.width*.07;
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints:points});
      await touch('touchStart',[{x,y}]); await touch('touchMove',[{x:end,y}]); await touch('touchEnd',[]);
      await cdp.detach();
    } else {
      await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(end,y,{steps:3}); await page.mouse.up();
    }
    await frames();
  }

  const returns = [], cameras = {};
  const captionOverlaps = [];
  async function checkDoorLabels(shot) {
    const overlap = await page.evaluate(() => {
      const top=document.querySelector('#tour-heading').parentElement.getBoundingClientRect().top;
      return Array.from(document.querySelectorAll('.tour-door')).some(button=>
        button.getClientRects().length && button.getBoundingClientRect().bottom>top-.5);
    });
    if (overlap) captionOverlaps.push(shot);
  }
  for (const [zone, t, ids] of branches) {
    await page.locator('#tour-time').fill(String(t));
    await wait(() => !document.querySelector('#tour-doorways').hidden);
    await frames();
    const parked = await state();
    assert.deepEqual(parked.tour.nearby, ids);
    await screen(zone+'-approach');
    await checkDoorLabels(zone);
    for (const id of ids) {
      await tap(page.locator('.tour-door[data-organ='+id+']'));
      await wait(id => window.__photoOrbit.state.free && window.__photoOrbit.state.tour.visiting === id && window.__photoOrbit.state.detail.includes(id), id);
      await frames();
      const pose = (await state()).camera;
      cameras[id] = pose;
      await screen(id+'-interior');
      await turn();
      assert.notDeepEqual((await state()).camera,pose,id+' did not orbit');
      if (id === 'heart') await screen('heart-oblique');
      await tap(page.locator('#tour-room-back'));
      await wait(() => !window.__photoOrbit.state.tour.visiting);
      await frames();
      const back = await state();
      assert.equal(back.tour.elapsed,parked.tour.elapsed);
      assert.deepEqual(back.camera,parked.camera);
      returns.push(id);
    }
  }
  // With the tour moving, collect presentation intervals from the browser.
  // These measure this machine and renderer, not a physical phone's GPU.
  await page.locator('#tour-time').fill('4.2');
  await tap(page.locator('#tour-play'));
  await wait(() => window.__photoOrbit.state.tour.playing);
  const frameTime = await page.evaluate(() => new Promise(resolve => {
    let last;
    const intervals=[];
    function frame(t) {
      if(last!==undefined) intervals.push(t-last);
      last=t;
      if(intervals.length<100) requestAnimationFrame(frame);
      else {
        intervals.sort((a,b)=>a-b);
        resolve({n:intervals.length,medianMs:intervals[50],p95Ms:intervals[94]});
      }
    }
    requestAnimationFrame(frame);
  }));
  await tap(page.locator('#tour-exit'));
  assert.equal((await state()).tour.active,false);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(destination,device+'.json'),JSON.stringify({
    device,language,base,dogGeometry,galleries,stations,returns,cameras,captionOverlaps,frameTime,errors
  },null,2)+'\n');
  if (path.basename(destination)==='after') assert.deepEqual(captionOverlaps,[]);
  await context.close();
}

(async () => {
  const browser = await playwright().chromium.launch({executablePath:await installedBrowser(),args:['--use-angle=metal']});
  try {await inspect(browser); console.log('Passed '+device+' '+base);}
  finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
