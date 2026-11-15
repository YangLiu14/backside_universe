const assert = require('node:assert/strict');

const ready = '#stage[data-ready="true"]';
const roomSelector = 'iframe[data-screening-room="sole-city"]';
const state = doc => doc.evaluate(() => window.soleCityState());
const moved = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

async function soleDocument(page) {
  const frame = await page.locator(roomSelector).elementHandle();
  const doc = await frame.contentFrame();
  assert(doc, 'The running-shoe screening must have a document');
  return doc;
}

exports.checkSoleAlbum = async function(page, open, back) {
  const room = await open('sole-city', ready);
  const doc = await soleDocument(page);
  const canvas = await room.locator('#mesh').elementHandle();
  await doc.waitForFunction(() => document.documentElement.lang === 'en');
  assert.equal((await state(doc)).progress, 0);

  await room.locator('#play').click();
  await doc.waitForFunction(() => {
    const current = window.soleCityState();
    return current.playing && current.progress > .025 && !current.audioPaused;
  });
  await back(room);
  await doc.waitForFunction(() => {
    const current = window.soleCityState();
    return !current.roomVisible && !current.playing && current.audioPaused;
  });
  const paused = await state(doc);
  // Allow enough real time to expose a surviving movie or audio clock.
  await page.waitForTimeout(350);
  const hidden = await state(doc);
  assert.equal(hidden.progress, paused.progress, 'Hidden film advanced behind the album');
  assert.deepEqual(hidden.pose, paused.pose, 'Hidden film changed its camera');
  assert(Math.abs(hidden.audioTime - paused.audioTime) < .01, 'Hidden ambience kept playing');

  await open('sole-city', ready);
  assert(await canvas.evaluate(element => element === document.querySelector('#mesh')));
  assert.equal((await state(doc)).progress, paused.progress, 'Reopening reset the movie progress');
  await room.locator('#home').click();
  await room.locator('#street').click();
  await doc.waitForFunction(() => window.soleCityState().mode === 'walk');
  const entry = await state(doc);
  await room.locator('#stage').focus();
  await page.keyboard.down('KeyW');
  try {
    await doc.waitForFunction(z => window.soleCityState().walkPosition[2] > z + .015,
      entry.walkPosition[2]);
    // Leave while a key is held, as can happen when the user clicks Back.
    await back(room);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await doc.waitForFunction(() => {
    const current = window.soleCityState();
    return !current.roomVisible && !current.walkActive;
  });
  const parked = await state(doc);
  assert.equal(parked.mode, 'walk');
  assert.equal(parked.walkActive, false, 'Hidden exploration must stop its animation loop');
  assert(moved(entry.walkPosition, parked.walkPosition) > .015);
  await page.waitForTimeout(350);
  assert.deepEqual((await state(doc)).walkPosition, parked.walkPosition,
    'Hidden exploration retained movement input');
  await open('sole-city', ready);
  await doc.waitForFunction(() => window.soleCityState().walkActive);
  assert(await canvas.evaluate(element => element === document.querySelector('#mesh')));
  assert.deepEqual((await state(doc)).walkPosition, parked.walkPosition);
  assert.deepEqual((await state(doc)).pose, parked.pose);
  await page.waitForTimeout(200);
  assert.deepEqual((await state(doc)).walkPosition, parked.walkPosition,
    'Reopening resumed a movement key held before returning');
  await back(room);
  console.log('The running-shoe card preserves the film and walking position; hidden playback and input stop.');
};

exports.checkSoleDeepLink = async function(browser, origin) {
  const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if(response.status() >= 400) errors.push(response.status() + ' ' + new URL(response.url()).pathname);
  });
  try {
    await page.goto(origin + '/?lang=en#sole-city');
    const room = page.frameLocator(roomSelector);
    await room.locator(ready).waitFor({timeout:150000});
    const doc = await soleDocument(page);
    await doc.waitForFunction(() => document.documentElement.lang === 'en');
    assert.match(await room.locator('[data-album-back]').innerText(), /Back/i);
    assert(!/[\u3400-\u9fff]/.test(await room.locator('nav').innerText()),
      'The English deep link must translate its visible controls');
    await room.locator('#street').tap();
    await doc.waitForFunction(() => window.soleCityState().mode === 'walk');
    const first = await state(doc);
    const pad = await room.locator('#pad').boundingBox();
    assert(pad);
    const session = await page.context().newCDPSession(page);
    const x = pad.x + pad.width / 2, y = pad.y + pad.height / 2;
    try {
      await session.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
      await session.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x,y:y-pad.height*.38}]});
      await doc.waitForFunction(z => window.soleCityState().walkPosition[2] > z + .015,
        first.walkPosition[2]);
    } finally {
      await session.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      await session.detach();
    }
    const walked = await state(doc);
    assert(moved(walked.walkPosition, first.walkPosition) > .015);
    for(const viewport of [{width:844,height:390},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      await doc.waitForFunction(width => innerWidth === width, viewport.width);
      for(const selector of ['[data-album-back]','#street','#home','#pad']) {
        const box = await room.locator(selector).boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= viewport.width + 1, selector + ' exceeds the screen width');
        assert(box.y >= 0 && box.y + box.height <= viewport.height + 1, selector + ' exceeds the screen height');
      }
      assert(await doc.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual((await state(doc)).walkPosition, walked.walkPosition);
    }
    await room.locator('[data-album-back]').tap();
    await page.locator('#album:visible').waitFor();
    assert.equal(new URL(page.url()).hash, '');
    await page.locator('[data-work="sole-city"]').tap();
    await room.locator(ready).waitFor();
    assert.deepEqual((await state(doc)).walkPosition, walked.walkPosition);
    await room.locator('[data-album-back]').tap();
    await page.locator('#album:visible').waitFor();
    assert.deepEqual(errors, []);
    console.log('The running-shoe English deep link supports touch walking, orientation changes and return.');
  } finally {
    await page.close();
  }
};
