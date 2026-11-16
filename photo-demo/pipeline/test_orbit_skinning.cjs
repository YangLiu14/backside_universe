// Real WebGL regression for the narrow bone-texture exception in coldOrbit.
// Run after vendor preparation: node photo-demo/pipeline/test_orbit_skinning.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {once}=require('node:events');
const {playwright,installedBrowser}=require('./verify.cjs');
const {coldOrbit}=require('./qa/orbit.cjs');

const fixture=`<!doctype html><meta charset="utf-8">
<canvas id="mesh" width="192" height="192"></canvas>
<input id="progress" type="range" min="0" max="100" value="0">
<script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>
<script type="module">
import * as T from 'three';
const mode=new URL(location.href).searchParams.get('mode');
const canvas=document.getElementById('mesh'),slider=document.getElementById('progress');
const renderer=new T.WebGLRenderer({canvas,antialias:false});renderer.setSize(192,192,false);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,20);
camera.position.set(0,0,4);
const geometry=new T.BoxGeometry(.6,1.5,.2),indices=[],weights=[];
for(let i=0;i<geometry.attributes.position.count;i++){
  const amount=T.MathUtils.clamp(geometry.attributes.position.getY(i)+.5,0,1);
  indices.push(0,1,0,0);weights.push(1-amount,amount,0,0);
}
geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));
geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
const root=new T.Bone(),tip=new T.Bone();tip.position.y=.5;root.add(tip);
const skeleton=new T.Skeleton([root,tip]);skeleton.computeBoneTexture();
// This material texture deliberately has the bone texture's exact dimensions,
// typed-array class, format and type. Only its data-array identity is different.
const size=skeleton.boneTexture.image.width;
const materialData=new Float32Array(size*size*4).fill(1);
const map=new T.DataTexture(materialData,size,size,T.RGBAFormat,T.FloatType);
map.needsUpdate=true;
const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial({map}));
mesh.add(root);mesh.bind(skeleton);mesh.frustumCulled=false;scene.add(mesh);
let progress=0,dirty=false;
slider.addEventListener('input',()=>{
  progress=Number(slider.value)/Number(slider.max);
  camera.position.x=progress*.35;camera.lookAt(0,0,0);camera.updateMatrixWorld();
  if(mode==='material'&&!dirty&&progress>=.55){
    materialData[0]=.25;map.needsUpdate=true;dirty=true;
  }
});
let frame;
function render(){tip.rotation.z=Math.sin(progress*Math.PI)*.4;renderer.render(scene,camera);frame=requestAnimationFrame(render);}
render();
// Allocate the program, geometry, material texture and bone texture before QA.
await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const gl=renderer.getContext(),names=['linkProgram','bufferData','texImage2D','texSubImage2D','texStorage2D'];
const witness={boneUploads:0,materialUploads:0};
const upload=gl.texSubImage2D;
gl.texSubImage2D=function(...args){
  if(args.at(-1)===skeleton.boneTexture.image.data)witness.boneUploads++;
  if(args.at(-1)===materialData)witness.materialUploads++;
  return upload.apply(this,args);
};
const baseline=Object.fromEntries(names.map(name=>[name,gl[name]]));
const skeletonUpdate=T.Skeleton.prototype.update;
window.fixtureState=()=>{
  if(mode==='throw'&&progress>=.45)throw Error('intentional fixture state failure');
  return {progress,pose:camera.matrixWorld.toArray()};
};
window.fixtureWitness=()=>({...witness,materialWasDirtied:dirty,
  equalTextureShape:map.image.width===skeleton.boneTexture.image.width&&map.image.height===skeleton.boneTexture.image.height,
  separateFloatArrays:materialData instanceof Float32Array&&skeleton.boneTexture.image.data instanceof Float32Array&&materialData!==skeleton.boneTexture.image.data});
window.fixtureHooks=()=>Object.fromEntries([...names.map(name=>[name,gl[name]===baseline[name]]),['Skeleton.update',T.Skeleton.prototype.update===skeletonUpdate]]);
window.stopFixture=()=>cancelAnimationFrame(frame);
window.fixtureReady=true;
</script>`;

async function main(){
  const vendor=process.env.THREE_VENDOR_DIR||path.resolve(__dirname,'../dist/vendor');
  const modules=await Promise.all(['three.module.js','three.core.js'].map(async name=>[name,await fs.readFile(path.join(vendor,name))]));
  const files=new Map(modules.map(([name,data])=>['/vendor/'+name,data]));
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/'){response.setHeader('Content-Type','text/html');response.end(fixture);}
    else if(files.has(pathname)){response.setHeader('Content-Type','text/javascript');response.end(files.get(pathname));}
    else{response.statusCode=404;response.end();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  let browser;
  const errors=[],summary=[];
  const orbit={range:'progress',state:'fixtureState',pose:'pose',handoff:[.25,.44],canvas:'mesh',skinnedMotion:true};
  async function restored(page){
    const hooks=await page.evaluate(()=>fixtureHooks());
    assert(Object.values(hooks).every(Boolean),'QA did not restore hooks: '+JSON.stringify(hooks));
  }
  async function run(name,mode,check){
    const page=await browser.newPage();
    page.on('pageerror',error=>errors.push(name+': '+error.message));
    page.on('console',message=>{if(/Shader Error|VALIDATE_STATUS|WebGL: INVALID/i.test(message.text()))errors.push(name+': '+message.text());});
    try{
      await page.goto('http://127.0.0.1:'+server.address().port+'/?mode='+mode);
      await page.waitForFunction(()=>window.fixtureReady===true);
      await check(page);await restored(page);summary.push(name);
    }finally{await page.close();}
  }
  try{
    browser=await playwright().chromium.launch({headless:true,executablePath:await installedBrowser(),
      args:process.platform==='darwin'?['--use-angle=metal']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    await run('bone updates accepted','normal',async page=>{
      const result=await coldOrbit(page,orbit),witness=await page.evaluate(()=>fixtureWitness());
      assert(result.boneTextureUpdates>0,'The fixture must perform real bone-texture uploads');
      assert(witness.boneUploads>=result.boneTextureUpdates);
      assert.equal(witness.materialUploads,0);
      assert(Object.values(result.calls).every(n=>n===0));
    });
    await run('exception remains opt-in','normal',async page=>{
      await assert.rejects(coldOrbit(page,{...orbit,skinnedMotion:false}),/first orbit uploaded static mesh resources/);
      assert((await page.evaluate(()=>fixtureWitness())).boneUploads>0);
    });
    await run('same-format material upload rejected','material',async page=>{
      await assert.rejects(coldOrbit(page,orbit),error=>{
        const match=error.message.match(/first orbit uploaded static mesh resources: (\{[^\n]+\})/);
        assert(match,'Failure must be the static-upload gate: '+error.message);
        const calls=JSON.parse(match[1]);assert.equal(calls.texSubImage2D,1);
        for(const [name,count] of Object.entries(calls))if(name!=='texSubImage2D')assert.equal(count,0,name);
        return true;
      });
      const witness=await page.evaluate(()=>fixtureWitness());
      assert(witness.equalTextureShape&&witness.separateFloatArrays&&witness.materialWasDirtied);
      assert.equal(witness.materialUploads,1,'The delayed material update must really reach WebGL');
    });
    await run('hooks restored after in-page exception','throw',async page=>{
      await assert.rejects(coldOrbit(page,orbit),/intentional fixture state failure/);
      assert((await page.evaluate(()=>fixtureWitness())).boneUploads>0);
    });
    assert.deepEqual(errors,[]);
    console.log('PASS orbit skinning regression: '+summary.join('; '));
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
