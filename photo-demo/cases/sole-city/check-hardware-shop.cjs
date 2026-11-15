// Run against the same built release a visitor opens. Check each shell separately
// so a solid facade in the distant LOD cannot hide behind a passing close-up.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { playwright, installedBrowser } = require('../../pipeline/verify.cjs');
const { observeScenes } = require('../../pipeline/qa/clearance.cjs');

async function sampleWindows(page) {
  return page.evaluate(async () => {
    const T = await import('three');
    const placed = window.qaScenes.map(scene => scene.getObjectByName('桥脚转角店')).find(Boolean);
    const shop = placed.children[0]; // Unit box, local +Z faces the street.
    shop.updateWorldMatrix(true, true);
    const inverse = shop.matrixWorld.clone().invert();
    const lod = shop.getObjectByProperty('isLOD', true);
    const shells = new Set();
    lod.traverse(obj => shells.add(obj));
    const furnishings = [];
    shop.traverse(obj => { if (obj.isMesh && !shells.has(obj)) furnishings.push(obj); });
    const samples = [], corners = [];
    for (const [index, level] of lod.levels.entries()) {
      const meshes = [...furnishings];
      level.object.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
      // The same unoccupied part of the room is visible through both openings.
      // A line outside the side opening must instead terminate on an inner wall.
      const front = new T.Vector3(.21, .285, .425), side = new T.Vector3(.425, .285, .118);
      const jamb = new T.Vector3(.151, .28, .39);
      const door = height => [new T.Vector3(-.26, height, .55), new T.Vector3(-.26, height, 0)];
      for (const [name, start, end] of [
        ['front-to-side', front, side], ['side-to-front', side, front],
        ['opaque-return', jamb, jamb.clone().add(new T.Vector3(.32, 0, -1).multiplyScalar(.77))],
        ['green-door-lower', ...door(.245)], ['green-door-upper', ...door(.30)]
      ]) {
        const origin = start.clone().applyMatrix4(shop.matrixWorld);
        const delta = end.clone().applyMatrix4(shop.matrixWorld).sub(origin);
        const ray = new T.Raycaster(origin, delta.clone().normalize(), 0, delta.length());
        const hit = ray.intersectObjects(meshes, false)[0];
        corners.push({level:index, name, surface:hit?.object.name ?? null, exterior:!!hit && shells.has(hit.object),
          point:hit ? hit.point.applyMatrix4(inverse).toArray() : null});
      }
      for (const face of ['front', 'side']) {
        for (const angle of [-.32, 0, .32]) {
          const direction = face === 'front' ? new T.Vector3(angle, 0, -1) : new T.Vector3(-1, 0, -angle);
          const worldDirection = direction.clone().transformDirection(shop.matrixWorld);
          const ray = new T.Raycaster();
          const depths = [], gaps = [];
          for (let row = 0; row < 6; row++) {
            const height = .22 + row * .02;
            for (let col = 0; col < 13; col++) {
              const across = -.113 + col * .024;
              const atWindow = face === 'front' ? new T.Vector3(across, height, .39) : new T.Vector3(.39, height, -across);
              const origin = atWindow.addScaledVector(direction, -.23).applyMatrix4(shop.matrixWorld);
              ray.set(origin, worldDirection);
              const hit = ray.intersectObjects(meshes, false)[0];
              if (hit) {
                const local = hit.point.applyMatrix4(inverse);
                depths.push(.39 - (face === 'front' ? local.z : local.x));
              } else {
                // An oblique ray at the outside corner can legitimately escape
                // through the other open window. Test where it crosses that face.
                const returning = face === 'front' ? angle > 0 : angle < 0;
                const toOther = face === 'front' ? (.375 - across) / angle : (.376 + across) / -angle;
                const exit = .39 - toOther;
                const [low, high] = face === 'front' ? [-.245, .266] : [-.175, .282];
                if (!returning || exit < low || exit > high) gaps.push({across, height});
              }
            }
          }
          depths.sort((a, b) => a - b);
          samples.push({ level: index, face, angle, hits: depths.length, gaps, median: depths[Math.floor(depths.length / 2)],
            near: depths[Math.floor(depths.length * .1)], far: depths[Math.floor(depths.length * .9)] });
        }
      }
    }
    return { samples, corners };
  });
}

async function main(url, output) {
  const browser = await playwright().chromium.launch({ executablePath: await installedBrowser(),
    args: process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    await observeScenes(page);
    const entry = new URL(url);
    entry.searchParams.set('explore', 'bridge');
    await page.goto(entry.href);
    await page.waitForFunction(() => window.soleCityState?.().mode === 'walk', null, { timeout: 120000 });
    const {samples, corners} = await sampleWindows(page);
    assert.equal(samples.length, 12, 'Both shop windows need front and oblique views in both LODs');
    for (const sample of samples) {
      const where = JSON.stringify(sample);
      assert.equal(sample.gaps.length, 0, 'View through the room into an uncovered void: ' + where);
      assert(sample.far > .25, 'Window closed by a shallow facade: ' + where);
      assert(sample.far - sample.near > .10, 'Window contents flattened onto one plane: ' + where);
    }
    for (const sample of corners) {
      const message = JSON.stringify(sample);
      if (sample.name === 'opaque-return') {
        assert(sample.point && sample.point[0] >= .34 && sample.point[0] <= .395 && sample.point[2] <= -.244, 'Opaque return leaked: ' + message);
      } else if (sample.name.startsWith('green-door')) {
        assert(sample.exterior, 'Interior finish covers the Hi3D green door: ' + message);
      } else {
        assert.equal(sample.surface, null, 'Clear window-to-window view blocked: ' + message);
      }
    }
    const report = {release: entry.pathname, unit: 'fraction of total shop depth', samples, corners};
    if (output) await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}

if (require.main === module) main(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
