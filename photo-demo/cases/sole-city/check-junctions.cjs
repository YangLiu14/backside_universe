// Check the actual textured street meshes after growth, from above each junction.
const assert = require('node:assert/strict');
const { playwright, installedBrowser } = require('../../pipeline/verify.cjs');
const { observeScenes } = require('../../pipeline/qa/clearance.cjs');

async function inspect(page) {
  return page.evaluate(async () => {
    const T = await import('three');
    const { mainLane } = await import('./city.js');
    const city = window.qaScenes.map(scene => scene.getObjectByName('Recessed pavement')?.parent).find(Boolean);
    const roads = city.children.filter(mesh => mesh.userData.roadTiming);
    const down = new T.Vector3(0, -1, 0).transformDirection(city.matrixWorld);
    const ray = new T.Raycaster();
    const issues = [];
    let samples = 0;
    for (let row = 0; row < 9; row++) {
      const crossing = -.7055 + row * .169;
      for (const dz of [-.0107, -.0071, .00043, .0073, .0107]) {
        const z = crossing + dz;
        for (let i = -30; i <= 30; i++) {
          const x = mainLane(z) + (i + .17) * .0019;
          ray.set(city.localToWorld(new T.Vector3(x, .09, z)), down);
          const count = new Set(ray.intersectObjects(roads, false).map(hit => hit.object)).size;
          samples++;
          if (count !== 1) issues.push({row, x, z, count});
        }
      }
    }
    const cornerKey = (positions, i) => [positions.getX(i), positions.getY(i), positions.getZ(i)].join('/');
    const trunk = roads[0].geometry.attributes.position;
    const trunkVertices = new Set(Array.from({length: trunk.count}, (_, i) => cornerKey(trunk, i)));
    const looseCorners = roads.slice(1).flatMap(road => [0, 1].filter(i =>
      !trunkVertices.has(cornerKey(road.geometry.attributes.position, i))));
    return { roads: roads.length, samples, issues, looseCorners: looseCorners.length };
  });
}

async function main(){
  const [url, capture] = process.argv.slice(2);
  const browser = await playwright().chromium.launch({executablePath: await installedBrowser(), args: ['--use-angle=metal']});
  try {
    const page = await browser.newPage({viewport: {width: 1152, height: 700}});
    await observeScenes(page);
    await page.goto(url);
    await page.locator('#progress:enabled').waitFor({timeout: 120000});
    await page.locator('#progress').fill('770.4');
    await page.locator('#street').click();
    const bounds = await page.locator('#stage').boundingBox();
    await page.mouse.move(bounds.width * .07, bounds.height * .29);
    await page.mouse.down();
    await page.mouse.move(bounds.width * (.07 + Math.PI / 3.8), bounds.height * .64, {steps: 6});
    await page.mouse.up();
    if (capture) {
      await page.evaluate(()=>window.soleCityWaitForDetail?.());
      await page.screenshot({path: capture});
    }
    const { roads, samples, issues, looseCorners } = await inspect(page);
    console.log(JSON.stringify({roads, samples, gaps:issues.filter(p=>!p.count).length, overlaps:issues.filter(p=>p.count>1).length}));
    assert.equal(roads, 19);
    assert.equal(looseCorners, 0, 'Alleys must share their two mouth corners with the trunk');
    assert.deepEqual(issues.slice(0, 1), [], 'Open or overlapping pavement at junction');
    await page.locator('#street').click();
    const shapeAt = async value => {
      await page.locator('#progress').fill(String(value));
      return page.evaluate(() => {
        const city = window.qaScenes.map(s => s.getObjectByName('Recessed pavement')?.parent).find(Boolean);
        return city.children.filter(obj => obj.userData.roadTiming && obj.visible).map(obj => {
          const g = obj.geometry;
          return Array.from(g.attributes.position.array);
        });
      });
    };
    await shapeAt(0);
    const growing = await shapeAt(329.4);
    assert(growing.some(strip => strip.some((value,i) => i%3 === 1 && value > .008)), 'Rolled leading edge is missing');
    await shapeAt(900);
    assert.deepEqual(await shapeAt(329.4), growing, 'Road changes shape when rewinding to the same frame');
    console.log('36 shared corners; rolled edges and rewind verified');
  } finally {
    await browser.close();
  }
}
if (require.main === module) main().catch(error => {console.error(error.message); process.exitCode=1;});
