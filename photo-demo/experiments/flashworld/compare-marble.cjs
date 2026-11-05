// Compare existing assets only. No API calls, no scene modifications.
const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');const http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');const out=path.join(root,'evidence/flashworld-vs-marble');
const flash=JSON.parse(fs.readFileSync(path.join(__dirname,'output/desk-portrait/run.json')));
const marble=JSON.parse(fs.readFileSync(path.join(root,'dist/marble-lab/assets/scene.json')));
const files={'/flash.ply':path.join(__dirname,'output/desk-portrait/gaussians-standard.ply'),'/marble.spz':path.join(root,'dist/marble-lab/assets/desk-full_res.spz')};
const html=`<!doctype html><html><head><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/","@sparkjsdev/spark":"/spark/spark.module.js"}}</script><style>html,body{margin:0;background:white}canvas{display:block}</style></head><body><canvas id="view"></canvas></body></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost').pathname;if(url==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(html);}
 let file=files[url];for(const [prefix,dir] of [['/vendor/',path.join(root,'dist/vendor')],['/spark/',path.join(root,'dist/gs-lab/vendor')]])if(url.startsWith(prefix)){const candidate=path.resolve(dir,url.slice(prefix.length));if(candidate.startsWith(dir+path.sep))file=candidate;}
 if(!file){res.writeHead(404);return res.end();}const stat=await fsp.stat(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':'application/octet-stream','Content-Length':stat.size});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(String(e));}});
(async()=>{
 await fsp.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const options={headless:true,args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']};if(process.env.CHROMIUM_EXECUTABLE_PATH)options.executablePath=process.env.CHROMIUM_EXECUTABLE_PATH;
 const browser=await chromium.launch(options);const results={scope:'Existing raw Marble 1.1 and FlashWorld portrait; no hybrid objects',settings:{width:480,height:704,blurAmount:.3,apertureAngle:0,shDegree:2},captures:[]};
 try{for(const model of ['marble','flash']){
 const page=await browser.newPage({viewport:{width:960,height:1408},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(url);
 await page.evaluate(async({model,flash,marble})=>{
 const THREE=await import('three');const {SparkRenderer,SplatMesh}=await import('@sparkjsdev/spark');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,480/704,.01,1000);
 const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false,alpha:false,preserveDrawingBuffer:true});renderer.setClearColor('white');renderer.setPixelRatio(1);renderer.setSize(480,704);renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
 const spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:.3,enableLod:false,sortRadial:false});scene.add(spark);
 const mesh=new SplatMesh({url:model==='marble'?'/marble.spz':'/flash.ply',lod:false,extSplats:true});scene.add(mesh);
 let home=new THREE.Vector3(),sourceQ=new THREE.Quaternion(),pivot,fx,fy,cx,cy;
 if(model==='marble'){
  mesh.scale.setScalar(marble.semantics_metadata.metric_scale_factor);mesh.rotation.x=Math.PI;mesh.position.y=marble.semantics_metadata.ground_plane_offset;
  const c=marble.calibration.parameters;home.set(c.x,c.y,c.z);sourceQ.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(c.pitch),THREE.MathUtils.degToRad(c.yaw),THREE.MathUtils.degToRad(c.roll),'YXZ'));
  pivot=new THREE.Vector3(0,0,-c.distance).applyQuaternion(sourceQ).add(home);
  const scale=704/1739;fy=1739/(2*Math.tan(THREE.MathUtils.degToRad(c.fov)/2))*scale;fx=fy*(1650.1209716796875/1553.64794921875);cx=(660-67)*scale;cy=869.5*scale;
 }else{
  const c=flash.ply_cameras_wxyz_xyz_fxfycxcy[12];home.fromArray(c.slice(4,7));sourceQ.set(c[1],c[2],c[3],c[0]);pivot=new THREE.Vector3(0,0,-2.5*flash.T_norm/(flash.T_norm+.01)).applyQuaternion(sourceQ).add(home);[fx,fy,cx,cy]=[c[7]*480,c[8]*704,c[9]*480,c[10]*704];
 }
 function pose(angle){const turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle*Math.PI/180);camera.position.copy(home).sub(pivot).applyQuaternion(turn).add(pivot);camera.quaternion.copy(turn).multiply(sourceQ);camera.updateMatrixWorld(true);}
 function resize(factor){renderer.setSize(480*factor,704*factor);const n=camera.near;camera.projectionMatrix.makePerspective(-cx/fx*n,(480-cx)/fx*n,cy/fy*n,-(704-cy)/fy*n,n,camera.far);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
 resize(1);pose(0);renderer.setAnimationLoop(()=>renderer.render(scene,camera));await mesh.initialized;await spark.update({scene,camera});
 window.compare={pose,resize,renderer,scene,camera,mesh,info:()=>({splats:mesh.numSplats,camera:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),pivot:pivot.toArray(),intrinsics:[fx,fy,cx,cy]})};
 },{model,flash,marble});
 await page.waitForTimeout(1800);
 for(const angle of [0,-12,12]){await page.evaluate(a=>window.compare.pose(a),angle);await page.waitForTimeout(900);await page.locator('canvas').screenshot({path:path.join(out,`${model}-${angle}.png`)});results.captures.push({model,angle,...await page.evaluate(()=>window.compare.info())});}
 // Inspect whether increased output resolution restores model detail.
 await page.evaluate(()=>{window.compare.pose(0);window.compare.resize(2);});await page.waitForTimeout(900);await page.locator('canvas').screenshot({path:path.join(out,`${model}-0-2x.png`)});
 results[model]={errors,renderer:await page.evaluate(()=>{const gl=window.compare.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';})};console.log(model,JSON.stringify(results[model]));await page.close();
 }await fsp.writeFile(path.join(out,'capture.json'),JSON.stringify(results,null,2));}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
