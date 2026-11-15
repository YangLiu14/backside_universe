// Export the expanded, full-detail streets in local tread coordinates for baking.
const {playwright, installedBrowser} = require('../../pipeline/verify.cjs');
const {observeScenes} = require('../../pipeline/qa/clearance.cjs');
const fs = require('node:fs/promises');

async function main(url, file, scope) {
  const browser = await playwright().chromium.launch({executablePath: await installedBrowser(), args: ['--use-angle=metal']});
  try {
    const p = await browser.newPage();
    await observeScenes(p);
    p.on('pageerror',error=>console.error('Scene:',error.message));
    p.on('console',msg=>{if(msg.type()==='error')console.error('Browser:',msg.text());});
    await p.goto(new URL('?explore=bridge-stall&export=1', url).href);
    await p.waitForFunction(() => window.soleCityState?.().mode === 'walk' || document.querySelector('#notice')?.textContent.includes('加载失败'), null, {timeout: 180000});
    const failure=await p.locator('#notice').textContent();
    if(failure.includes('加载失败'))throw Error(failure);
    const length = await p.evaluate(async () => {
      await window.soleCityLoadInspection?.();
      const T = await import('three');
      const city = window.qaScenes.map(s => s.getObjectByName('蓝栏杆步行天桥')).find(Boolean).parent;
      city.updateWorldMatrix(true, true);
      window.streetExport = {T, nodes: city.children.filter(o => o.userData.feature), inv: city.matrixWorld.clone().invert()};
      return window.streetExport.nodes.length;
    });
    const output = await fs.open(file, 'w');
    let size = 0;
    try {
      for (let i = 0; i < length; i += 3) {
        const slices = await p.evaluate(({i, wide}) => {
          const {T, nodes, inv} = window.streetExport;
          const matrix = new T.Matrix4(), pos = new T.Vector3(), slices = [];
          function visit(mesh) {
            if (mesh.isLOD) { visit(mesh.levels[0].object); return; }
            if (mesh.isMesh) {
              const g = mesh.geometry, attr = g.attributes.position, index = g.index;
              matrix.multiplyMatrices(inv, mesh.matrixWorld);
              if (!g.boundingBox) g.computeBoundingBox();
              const b = g.boundingBox.clone().applyMatrix4(matrix);
              if (wide || (b.max.x > -.31 && b.min.x < .31 && b.max.z > -.05 && b.min.z < .51 && b.min.y < .48 && b.max.y > -.012)) {
                const world = new Float32Array(attr.count * 3);
                for (let k = 0; k < attr.count; k++) pos.fromBufferAttribute(attr, k).applyMatrix4(matrix).toArray(world, k * 3);
                const count = index?.count ?? attr.count;
                for (let first = 0; first < count; first += 4095) {
                  const n = Math.min(4095, count - first), tri = new Float32Array(n * 3);
                  for (let k = 0; k < n; k++) {
                    const v = 3 * (index ? index.getX(first + k) : first + k);
                    tri[k*3] = world[v]; tri[k*3+1] = world[v+1]; tri[k*3+2] = world[v+2];
                  }
                  slices.push(btoa(String.fromCharCode(...new Uint8Array(tri.buffer))));
                }
              }
            }
            for (const child of mesh.children) visit(child);
          }
          nodes.slice(i, i + 3).forEach(visit);
          return slices;
        }, {i, wide: scope === '--city'});
        const chunk = Buffer.concat(slices.map(s => Buffer.from(s, 'base64')));
        await output.writeFile(chunk); size += chunk.length;
      }
    } finally { await output.close(); }
    console.log('triangles:', size / 36);
  } finally { await browser.close(); }
}
main(...process.argv.slice(2)).catch(e => {console.error(e); process.exitCode = 1;});
