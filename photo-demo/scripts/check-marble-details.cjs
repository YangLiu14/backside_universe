const assert = require('node:assert/strict');
const {baseURL, launchBrowser} = require('./marble-browser.cjs');

async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const waitLab = () => page.waitForFunction(() => window.__marbleLab?.state.ready);
    const originalCount = 1920000;

    await page.goto(baseURL + '/marble-lab/index.html?detail=1&crop=carpet');
    await waitLab();
    const enhancedCount = await page.evaluate(() => window.__marbleLab.state.splats);
    assert(enhancedCount > originalCount);
    assert.equal(await page.getAttribute('[data-crop="carpet"]', 'aria-pressed'), 'true');
    await page.click('[data-angle="12"]');

    const pose = () => page.evaluate(() => {
      const {angle, crop, camera, projection} = window.__marbleLab.state;
      return {angle, crop, camera, projection};
    });
    const before = await pose();
    assert.equal(before.crop, 'carpet');
    for (const expected of [originalCount, enhancedCount]) {
      await page.click('#detail');
      await page.waitForFunction(n => !document.querySelector('#detail').disabled && window.__marbleLab.state.splats === n, expected);
      assert.deepEqual(await pose(), before);
    }

    await page.click('[data-crop="laptop"]');
    assert.equal((await pose()).crop, 'laptop');

    await page.route('**/desk-detail.spz', route => route.fulfill({status: 404, body: ''}));
    await page.reload();
    await waitLab();
    assert.equal(await page.evaluate(() => window.__marbleLab.state.splats), originalCount);
    assert.equal(await page.isChecked('#detail'), false);

    const office = baseURL + '/marble-transition-lab/index.html';
    const officeState = () => page.evaluate(() => {
      const app = window.__marbleTransition;
      const room = app.scene.children.find(o => o.numSplats > 1000000);
      const laptop = app.objects.meshes.findIndex(o => o.userData.kind === 'laptop');
      return {splats: room.numSplats, textureWidth: app.objects.materials[laptop].uniforms.sourcePhoto.value.image.width,
        progress: app.state.progress};
    });
    await page.goto(office);
    await page.waitForFunction(() => window.__marbleTransition?.state.ready);
    const mainRoom = await officeState();
    assert(mainRoom.splats > originalCount && mainRoom.splats < enhancedCount);
    assert.equal(mainRoom.progress, 0);
    assert.equal(mainRoom.textureWidth, 2640);
    await page.click('#office-walk');
    await page.waitForFunction(() => window.__marbleTransition.state.walk?.id === 'office');
    await page.click('#walk-exit');
    await page.waitForFunction(() => !window.__marbleTransition.state.walk);
    await page.route('**/room-detail.spz', route => route.fulfill({status: 404, body: ''}));
    await page.route('**/desk-super-resolution-2x.jpg', route => route.fulfill({status: 404, body: ''}));
    await page.reload();
    await page.waitForFunction(() => window.__marbleTransition?.state.ready);
    const fallback = await officeState();
    assert.equal(fallback.splats, originalCount);
    assert.equal(fallback.textureWidth, 1320);
    assert.deepEqual(errors, []);
    console.log('Marble detail and original loaded at the same camera, main office walk and missing-file fallbacks passed.');
  } finally {
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
