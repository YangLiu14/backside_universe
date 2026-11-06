// Exercise the live framebuffer after the camera and all island LODs have settled.
const assert = require('node:assert/strict');
const {baseURL, launchBrowser} = require('./marble-browser.cjs');
const url = baseURL + '/marble-transition-lab/index.html';
const oceanName = 'Ocean beneath the desk';
const pose = page => page.evaluate(() => window.__marbleTransition.state.camera);
const ready = page => page.waitForSelector('#world[data-ready=true]');
const atPose = (page, target) => page.waitForFunction(matrix =>
  window.__marbleTransition.state.camera.every((v, i) => Math.abs(v - matrix[i]) < 1e-9), target);

async function framePair(page, tabletop) {
  return page.evaluate(async tabletop => {
    const app = window.__marbleTransition;
    const shot = document.createElement('canvas');
    shot.width = 520;
    shot.height = Math.round(shot.width * app.renderer.domElement.height / app.renderer.domElement.width);
    const ctx = shot.getContext('2d', {willReadFrequently:true});
    const take = () => {
      ctx.drawImage(app.renderer.domElement, 0, 0, shot.width, shot.height);
      return ctx.getImageData(0, 0, shot.width, shot.height).data;
    };
    const mask = document.createElement('canvas');
    mask.width = shot.width;
    mask.height = shot.height;
    const brush = mask.getContext('2d');
    if (tabletop) {
      const T = await import('/vendor/three.module.js');
      const table = app.dreamScene.getObjectByName('Original tabletop becoming a single sea');
      const p = table.geometry.attributes.position, weights = table.geometry.attributes.waveWeight;
      const q = new T.Vector3();
      // The outer ring is flat at the rim. Its projected footprint excludes the desk cutaway.
      let start = p.count - 1;
      while (start > 0 && weights.getX(start - 1) === 0) start--;
      if (start <= 0 || p.count - start <= 4) throw Error('Missing calibrated water perimeter');
      brush.beginPath();
      for (let i = start; i < p.count; i++) {
        q.fromBufferAttribute(p, i).applyMatrix4(table.matrixWorld).project(app.camera);
        const x = (q.x + 1) * shot.width / 2, y = (1 - q.y) * shot.height / 2;
        if (i === start) brush.moveTo(x, y); else brush.lineTo(x, y);
      }
      brush.closePath();
      brush.fill();
    } else {
      brush.fillRect(0, 0, shot.width, shot.height);
    }
    const cover = brush.getImageData(0, 0, shot.width, shot.height).data;
    const fish = app.dreamScene.getObjectByName('Reef shoal');
    const version = fish.instanceMatrix.version, eye = app.state.camera;
    const a = take();
    await new Promise(done => setTimeout(done, 520));
    const b = take();
    let changed = 0, pixels = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (cover[i + 3] < 250) continue;
      pixels++;
      if (Math.max(...[0, 1, 2].map(c => Math.abs(a[i+c] - b[i+c]))) >= 3) changed++;
    }
    return {pixels, changed, fishFrames:fish.instanceMatrix.version-version,
      stableCamera:eye.every((v, i) => v === app.state.camera[i])};
  }, tabletop);
}

async function tour(browser, mobile) {
  const page = await browser.newPage(mobile ? {viewport:{width:390,height:844},isMobile:true,
    hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'} : {viewport:{width:1280,height:800}});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(url);
    await ready(page);
    const source = await pose(page);
    assert.equal(await page.evaluate(n => window.__marbleTransition.dreamScene.getObjectByName(n).children.length, oceanName), 0);
    await page.click('[data-progress="1"]');
    await page.waitForSelector('#stage[data-browsing=true]');
    await page.waitForFunction(() => window.__marbleTransition.islands.every(e => e.amount === 1));
    await page.waitForTimeout(900);
    const overview = await pose(page);
    if (!mobile) {
      const surface = await framePair(page, true);
      assert(surface.stableCamera && surface.fishFrames > 0 && surface.pixels > 2000 &&
        surface.changed > surface.pixels * .035, JSON.stringify(surface));
      console.log('Stationary surface', surface);
      await page.click('#reduce-motion');
    }
    const reduce = page.locator('#reduce-motion');
    assert.equal(await reduce.getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(600);
    const still = await framePair(page, true);
    assert(still.stableCamera && still.changed === 0 && still.fishFrames === 0, JSON.stringify(still));

    await page.selectOption('#explore-island', 'reef');
    await page.waitForFunction(() => window.__marbleTransition.camera.position.y < .7);
    const dive = await pose(page);
    assert(dive[13] < overview[13] - .1);
    if (!mobile) {
      await reduce.click();
      await page.waitForTimeout(600);
      const underwater = await framePair(page, false);
      assert(underwater.stableCamera && underwater.fishFrames > 0 &&
        underwater.changed > underwater.pixels * .05, JSON.stringify(underwater));
      console.log('Stationary underwater', underwater);
      await page.locator('#world').focus();
      await page.keyboard.down('e');
      try { await page.waitForFunction(y => window.__marbleTransition.camera.position.y > y + .25, dive[13]); }
      finally { await page.keyboard.up('e'); }
      await page.keyboard.down('q');
      try { await page.waitForFunction(y => window.__marbleTransition.camera.position.y < y + .04, dive[13]); }
      finally { await page.keyboard.up('q'); }
    }
    await page.click('#explore-overview');
    await atPose(page, overview);
    await page.click('#home');
    await atPose(page, source);
    await page.waitForFunction(n => !window.__marbleTransition.dreamScene.getObjectByName(n).visible, oceanName);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

(async () => {
  const browser = await launchBrowser();
  try { await tour(browser, false); await tour(browser, true); }
  finally { await browser.close(); }
  console.log('Live ripples, underwater motion, reduced motion, waterline crossing and desktop/touch returns passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
