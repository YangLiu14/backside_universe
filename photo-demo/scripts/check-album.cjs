const assert = require('node:assert/strict');
const {baseURL, launchBrowser} = require('./marble-browser.cjs');

// Simulate adding the last published work without changing the album shell.
async function checkCatalogUpdate(browser) {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  try {
    const response = await page.request.get(baseURL + '/catalog/works.json');
    assert(response.ok(), 'The published work catalog must be reachable');
    const catalog = await response.json();
    const added = catalog.works.at(-1);
    let edition = 'before';
    await page.route('**/catalog/works.json', route => {
      if (edition === 'offline') return route.fulfill({status:503,body:''});
      const works = edition === 'before' ? catalog.works.slice(0,-1) : catalog.works;
      return route.fulfill({json:{works}});
    });
    await page.goto(baseURL + '/?lang=en');
    await page.locator('.preview-switch:visible').waitFor();
    assert.equal(await page.locator('[data-work]').count(), catalog.works.length - 1);
    edition = 'offline';
    await page.reload();
    await page.locator('#catalog-retry:visible').waitFor();
    edition = 'after';
    await page.locator('#catalog-retry').click();
    const title = page.locator('[data-work="' + added.id + '"] h2');
    assert.equal(await title.innerText(), added.title.en);
    await page.getByRole('button',{name:'中文'}).click();
    assert.equal(await title.innerText(), added.title.zh);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await page.close();
  }
}

async function checkAlbum(browser) {
  const page = await browser.newPage({reducedMotion:'reduce'});
  const errors = [];
  const binaries = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\.(glb|spz|ply|splat|bin|wasm|part\d+)$/.test(new URL(request.url()).pathname)) binaries.push(request.url());
  });
  await page.goto(baseURL+'/?lang=zh');
  const prints = page.locator('.print img');
  const sources = () => prints.evaluateAll(images => images.map(image => image.getAttribute('src')));
  await page.locator('.preview-switch:visible').waitFor();
  const fronts = await sources();
  await page.getByRole('button',{name:'背面剧照'}).click();
  await prints.evaluateAll(images => Promise.all(images.map(image => image.decode())));
  assert.deepEqual(await sources(), await prints.evaluateAll(images => images.map(image => image.dataset.still)));
  await page.getByRole('button',{name:'原照片'}).click();
  assert.deepEqual(await sources(), fronts);
  assert.equal(await page.locator('iframe[data-screening-room]').count(),0);
  assert.deepEqual(binaries,[]);

  const open = async (id, ready) => {
    await page.locator('[data-work="'+id+'"]').click();
    const room = page.frameLocator('iframe[data-screening-room="'+id+'"]');
    await room.locator(ready).waitFor({timeout:150000});
    return room;
  };
  const back = async room => {
    await room.locator('[data-album-back]').click();
    await page.locator('#album:visible').waitFor();
  };
  const desk = await open('desk','#world[data-ready=true]');
  assert(!binaries.some(url=>url.includes('/canine-museum/')));
  await desk.locator('#play').click();
  await desk.locator('#world[data-progress="1"]').waitFor();
  await back(desk);

  const dog = await open('canine','#stage[data-ready=true]');
  await dog.locator('#turn').click();
  await dog.locator('#stage[data-browsing=true]').waitFor();
  const dogFrame = page.frames().find(frame=>frame.url().includes('/canine-museum/index.html'));
  await dogFrame.waitForFunction(()=>window.__photoOrbit.state.installed.length===6);
  await back(dog);

  // Neither a new document nor a second download should be needed to revisit.
  const before = new Set(binaries);
  const deskDocument = page.frames().find(frame=>frame.url().includes('/marble-transition-lab/index.html'));
  const deskCanvas = await deskDocument.locator('#world').elementHandle();
  const requests = binaries.length;
  await open('desk','#world[data-ready=true]');
  assert(await deskCanvas.evaluate(canvas=>canvas===document.querySelector('#world')));
  assert.equal(await desk.locator('#world').getAttribute('data-progress'),'1');
  await page.goBack();
  await page.locator('#album:visible').waitFor();
  await open('canine','#stage[data-ready=true]');
  assert.equal(await dog.locator('#degrees').textContent(),'090°');
  assert.deepEqual(binaries.slice(requests).filter(url=>before.has(url)),[]);
  await back(dog);
  assert(!binaries.some(url=>url.includes('/grandmas-table/')));
  const dinner=await open('grandmas-table','#stage[data-ready=true]');
  await dinner.locator('#turn').click();
  await dinner.locator('#explore:visible').waitFor();
  await dinner.locator('#explore').click();
  const diningDoc=page.frames().find(frame=>frame.url().includes('/grandmas-table/index.html'));
  await diningDoc.waitForFunction(()=>window.dinnerState().phase==='explore');
  await back(dinner);
  const diningRequests=binaries.length;
  await open('grandmas-table','#stage[data-ready=true]');
  assert.equal(await diningDoc.evaluate(()=>window.dinnerState().phase),'explore');
  assert.equal(binaries.length,diningRequests);
  await dinner.locator('[data-language=en]').click();
  await back(dinner);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert(!binaries.some(url=>url.includes('/after-school-rewind/')));
  const rewind = await open('after-school-rewind','#stage[data-ready=true]');
  const cassetteDoc = page.frames().find(frame=>frame.url().includes('/after-school-rewind/index.html'));
  await cassetteDoc.waitForFunction(()=>document.documentElement.lang === 'en');
  await rewind.locator('#progress').fill('1000');
  await rewind.locator('#enter').click();
  await rewind.locator('#yard').click();
  await cassetteDoc.waitForFunction(()=>window.rewindState().tour === 'court');
  const eye = await cassetteDoc.evaluate(()=>window.rewindState().eye);
  await rewind.locator('#stage').focus();
  await page.keyboard.down('KeyD');
  try {
    await cassetteDoc.waitForFunction(x=>window.rewindState().eye[0] > x + 1,eye[0]);
  } finally {
    await page.keyboard.up('KeyD');
  }
  await cassetteDoc.waitForFunction(()=>window.rewindState().time === 4);
  const position = await cassetteDoc.evaluate(()=>window.rewindState().eye);
  const screen = await rewind.locator('#world').elementHandle();
  const campusRequests = binaries.length;
  await back(rewind);
  await open('after-school-rewind','#stage[data-ready=true]');
  assert(await screen.evaluate(canvas=>canvas === document.querySelector('#world')));
  assert.deepEqual(await cassetteDoc.evaluate(()=>window.rewindState().eye),position);
  assert.equal(binaries.length,campusRequests);
  await back(rewind);
  assert.equal(Number(await page.locator('.edition b').innerText()), await page.locator('.leaf').count());
  assert.deepEqual(errors,[]);
  console.log('All four screenings load on demand. Revisiting the cassette restores the same court position.');
  await page.close();
}

async function checkCassetteDeepLink(browser) {
  const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  try {
    await page.goto(baseURL + '/?lang=zh#after-school-rewind');
    const room = page.frameLocator('iframe[data-screening-room="after-school-rewind"]');
    await room.locator('#stage[data-ready=true]').waitFor({timeout:150000});
    await room.locator('#progress').fill('1000');
    await room.locator('#enter').tap();
    await room.locator('#yard').tap();
    const doc = page.frames().find(frame=>frame.url().includes('/after-school-rewind/index.html'));
    await doc.waitForFunction(()=>window.rewindState().tour === 'court');
    for (const viewport of [{width:844,height:390},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      await doc.waitForFunction(width=>innerWidth === width, viewport.width);
      const controls = await room.locator('#yard').boundingBox();
      assert(controls && controls.x >= 0 && controls.x + controls.width <= viewport.width + 1);
      assert(controls.y >= 0 && controls.y + controls.height <= viewport.height + 1);
      assert(await room.locator('#stick').isVisible());
    }
    await room.locator('[data-album-back]').tap();
    await page.locator('#album:visible').waitFor();
    assert.equal(new URL(page.url()).hash,'');
    console.log('The cassette deep link opens on touch, rotates on court and returns to the album.');
  } finally {
    await page.close();
  }
}

(async()=>{
  const browser = await launchBrowser();
  try {
    await checkCatalogUpdate(browser);
    await checkAlbum(browser);
    await checkCassetteDeepLink(browser);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error); process.exitCode=1;});
