const assert = require('node:assert/strict');
const {baseURL, launchBrowser} = require('./marble-browser.cjs');

async function checkAlbum(browser) {
  const page = await browser.newPage({reducedMotion:'reduce'});
  const errors = [];
  const binaries = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\.(glb|spz|ply|splat|bin|wasm|part\d+)$/.test(new URL(request.url()).pathname)) binaries.push(request.url());
  });
  await page.goto(baseURL+'/');
  const prints = page.locator('.print img');
  const sources = () => prints.evaluateAll(images => images.map(image => image.getAttribute('src')));
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
  assert.deepEqual(errors,[]);
  console.log('Album opens projects on demand and restores both live scenes without re-downloading their assets.');
}

(async()=>{
  const browser = await launchBrowser();
  try { await checkAlbum(browser); } finally { await browser.close(); }
})().catch(error=>{console.error(error); process.exitCode=1;});
