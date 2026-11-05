import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/kloping/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL(process.env.COASTAL_EVIDENCE||'../evidence/holiday-assets-v1/laptop/spatial-v5/browser/',import.meta.url);await mkdir(out,{recursive:true});
const model=process.argv[2]||'/holiday-assets/assets/laptop/model-spatial-v5.glb';
const html=`<!doctype html><html><head><style>body{margin:0;overflow:hidden}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script></head><body><script type="module">
import * as T from 'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{DRACOLoader}from'three/addons/loaders/DRACOLoader.js';import{RoomEnvironment}from'three/addons/environments/RoomEnvironment.js';
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#e9e6df');const env=new RoomEnvironment(),pm=new T.PMREMGenerator(renderer);scene.environment=pm.fromScene(env,.04).texture;scene.environmentIntensity=.4;env.dispose();pm.dispose();
const sun=new T.DirectionalLight('#fff2d8',2.2);sun.position.set(.3,1.3,-.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-.8,right:.8,top:.8,bottom:-.8,near:.01,far:4});sun.shadow.bias=-.0001;sun.shadow.normalBias=.0002;scene.add(sun,new T.HemisphereLight('#c2daea','#78684b',.65));
const camera=new T.OrthographicCamera();const P=(x,y,z)=>new T.Vector3(x,z,-y);const loader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/vendor/draco/'));
const gltf=await loader.loadAsync(${JSON.stringify(model)});let triangles=0,meshes=0;gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});scene.add(gltf.scene);
window.preview={scene,stats:{triangles,meshes},view(position,target,span=1.1){const a=innerWidth/innerHeight;Object.assign(camera,{left:-span*a/2,right:span*a/2,top:span/2,bottom:-span/2,near:.01,far:20});camera.position.copy(P(...position));camera.lookAt(P(...target));camera.updateProjectionMatrix();renderer.render(scene,camera);},ready:true};
</script></body></html>`;
const browser=await chromium.launch({headless:true,executablePath:'/Users/kloping/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/coastal-check',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://127.0.0.1:9988/coastal-check');await page.waitForFunction(()=>window.preview?.ready,{},{timeout:120000});
 for(const [name,position,target,span] of (process.env.COASTAL_VIEWS?JSON.parse(process.env.COASTAL_VIEWS):[['rear',[0,2,.15],[0,.46,-.05],.88],['quarter',[1.25,1.8,.8],[0,.40,-.04],1.05],['side',[1.9,.5,.32],[0,.28,-.04],1.05],['front',[0,-1.9,.28],[0,.25,-.04],1.05],['top',[.1,.7,1.9],[.1,.50,-.1],1.05],['detail',[.85,1.4,.4],[.08,.6,-.13],.72]])){
  const fittedSpan=model.includes('v6')&&['quarter','side','top'].includes(name)?1.4:span;
  await page.evaluate(({position,target,span})=>window.preview.view(position,target,span),{position,target,span:fittedSpan});await page.locator('canvas').screenshot({path:new URL(name+'.png',out).pathname});
 }
 const report={model,stats:await page.evaluate(()=>window.preview.stats),errors};await writeFile(new URL('render-report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(errors.length)throw Error('Rendering errors');
}finally{await browser.close();}
