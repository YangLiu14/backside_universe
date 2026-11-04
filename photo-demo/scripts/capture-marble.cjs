// Capture the actual scene for camera registration; never substitutes another model.
const {baseURL,launchBrowser}=require('./marble-browser.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const app=path.resolve(__dirname,'..');
const label=process.argv[2]||'registration';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid capture label');
(async()=>{
 const out=path.join(app,'evidence/marble-lab',label);await fs.mkdir(out,{recursive:true});
 const manifest=JSON.parse(await fs.readFile(path.join(app,'dist/marble-lab/assets/scene.json'),'utf8'));
 if(manifest.status!=='generated')throw new Error('Real Marble asset is not ready');
 const browser=await launchBrowser();
 try{
  const page=await browser.newPage({viewport:{width:1760,height:1700},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${baseURL}/marble-lab/index.html`);
  await page.waitForFunction(()=>window.__marbleLab?.state.ready,{},{timeout:90000});
  await page.waitForTimeout(1600);
  if(process.argv[3]){
   const parameters=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
   await page.evaluate(c=>window.__marbleLab.calibrate(c.parameters||c),parameters);
   await page.waitForTimeout(600);
  }
  await page.locator('#world').screenshot({path:path.join(out,'render.png')});
  await page.locator('#reference-frame').screenshot({path:path.join(out,'reference.png')});
  await page.screenshot({path:path.join(out,'page.png'),fullPage:true});
  const state=await page.evaluate(()=>window.__marbleLab.state);
  await fs.writeFile(path.join(out,'camera.json'),JSON.stringify(state,null,2));
  if(process.argv[4]){
   const matches=JSON.parse(await fs.readFile(process.argv[4],'utf8'));
   const samples=await page.evaluate(async points=>{
    const THREE=await import('/vendor/three.module.js');
    const api=window.__marbleLab,mesh=api.scene.children.find(c=>c.numSplats>0),raycaster=new THREE.Raycaster();
    const hits=[];
    for(const uv of points){
     raycaster.setFromCamera(new THREE.Vector2(uv[0]*2-1,1-uv[1]*2),api.camera);
     const intersections=raycaster.intersectObject(mesh,false);
     hits.push(intersections.length?{point:intersections[0].point.toArray(),distance:intersections[0].distance}:null);
    }
    return hits;
   },matches.render_points.map(p=>[p[0]/matches.render_size[0],p[1]/matches.render_size[1]]));
   await fs.writeFile(path.join(out,'ray-matches.json'),JSON.stringify({...matches,samples},null,2));
   console.log(JSON.stringify({rayMatches:samples.filter(Boolean).length,total:samples.length}));
  }
  console.log(JSON.stringify({capture:label,splats:state.splats,calibration:state.calibration,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
