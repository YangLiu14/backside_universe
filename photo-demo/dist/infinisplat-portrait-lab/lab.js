import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

const $ = s => document.querySelector(s);
const crops = {full:[0,0,1,1],desk:[.09,.30,.89,.31],laptop:[.34,.35,.25,.15],cup:[.52,.35,.18,.13]};
let meta, renderer, scene, camera, splat, spark, angle = 0, cropName = 'full', ready = false, playing = false, phase = 0, lastTime = 0;
const origin = new THREE.Vector3(), pivot = new THREE.Vector3(), yAxis = new THREE.Vector3(0,1,0);

function stop(){playing=false;$('#play').textContent='播放往返';$('#play').setAttribute('aria-pressed','false');}
function setAngle(value,manual=true){
  if(manual) stop();
  angle=Math.min(12,Math.max(-12,Number(value)));
  $('#angle').value=angle;
  $('#angle-value').textContent=`${angle>0?'+':''}${angle.toFixed(2)}°`;
  $('#angle-label').textContent=Math.abs(angle)<.005?'原始视角 · 0°':`水平绕行 · ${angle>0?'+':''}${angle.toFixed(2)}°`;
  document.querySelectorAll('[data-angle]').forEach(b=>b.setAttribute('aria-current',String(Math.abs(angle-Number(b.dataset.angle))<.01)));
  if(!camera)return;
  const radians=THREE.MathUtils.degToRad(angle);
  camera.position.copy(origin).sub(pivot).applyAxisAngle(yAxis,radians).add(pivot);
  camera.quaternion.setFromAxisAngle(yAxis,radians);
  camera.updateMatrixWorld(true);
}

function resize(){
  if(!meta)return;
  const [x,y,w,h]=crops[cropName], W=meta.width, H=meta.height;
  document.documentElement.style.setProperty('--aspect',(W*w/(H*h)).toString());
  const img=$('#reference');Object.assign(img.style,{width:`${100/w}%`,height:`${100/h}%`,left:`${-x/w*100}%`,top:`${-y/h*100}%`});
  const rect=$('#result-frame').getBoundingClientRect();
  renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
  const [fx,fy,cx,cy]=meta.intrinsics, n=camera.near;
  // Preserve off-axis intrinsics and use exactly the same source rectangle on both sides.
  const left=(x*W-cx)/fx*n,right=((x+w)*W-cx)/fx*n;
  const top=-(y*H-cy)/fy*n,bottom=-((y+h)*H-cy)/fy*n;
  camera.projectionMatrix.makePerspective(left,right,top,bottom,n,camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

async function boot(){
  const response=await fetch('./assets/scene.json');if(!response.ok)throw new Error('场景资产尚未生成。');meta=await response.json();
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(50,1,.001,1000);
  renderer=new THREE.WebGLRenderer({canvas:$('#world'),antialias:false,alpha:true,preserveDrawingBuffer:true});
  renderer.setClearColor(0x000000,0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.toneMapping=THREE.NoToneMapping;
  // PLY stores photograph sRGB values as SH; Spark keeps them in display space.
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:0,enableLod:false,sortRadial:false});scene.add(spark);
  splat=new SplatMesh({url:'./assets/desk-gaussian.ply',lod:false,extSplats:true,onProgress:e=>{
    if(e.total)$('#loading').textContent=`正在读取 Gaussian · ${Math.round(e.loaded/e.total*100)}%`;
  }});
  splat.rotation.x=Math.PI;scene.add(splat);
  const p=meta.pivot_opencv;pivot.set(p[0],-p[1],-p[2]);
  resize();setAngle(0);
  renderer.setAnimationLoop(time=>{
    const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
    if(playing){phase+=dt*2*Math.PI/8;setAngle(12*Math.sin(phase),false);}
    renderer.render(scene,camera);
  });
  await splat.initialized;
  ready=true;$('#loading').hidden=true;$('#loading').style.display='none';
  document.querySelectorAll('button:disabled,input:disabled').forEach(b=>b.disabled=false);
  $('#status').textContent=`InfiniSplat v1 · ${(meta.gaussian_count/10000).toFixed(1)} 万个 Gaussian`;
  $('#asset-details').textContent=`${meta.model} · ${meta.width} × ${meta.height} · ${meta.inference_seconds.toFixed(2)} 秒场景推理。使用与基线相同的相机内参；尺度来自深度预测，未经实测标定。原图 SHA256：${meta.source_sha256}。`;
  window.__gsLab={setAngle,resize,setCrop:name=>selectCrop(name),get state(){return{ready,angle,playing,crop:cropName,splats:splat.numSplats,camera:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),size:renderer.getSize(new THREE.Vector2()).toArray()};},renderer,scene,camera,meta};
}

function selectCrop(name){if(!crops[name])return;cropName=name;document.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crop===name)));resize();}
document.querySelectorAll('[data-crop]').forEach(b=>b.addEventListener('click',()=>selectCrop(b.dataset.crop)));
document.querySelectorAll('[data-angle]').forEach(b=>b.addEventListener('click',()=>setAngle(b.dataset.angle)));
$('#angle').addEventListener('input',e=>setAngle(e.target.value));
$('#reset').addEventListener('click',()=>setAngle(0));
$('#gaps').addEventListener('change',e=>$('#result-frame').classList.toggle('gaps',e.target.checked));
$('#play').addEventListener('click',()=>{if(playing)return stop();playing=true;phase=Math.asin(angle/12);$('#play').textContent='暂停';$('#play').setAttribute('aria-pressed','true');});
let drag=null;
$('#world').addEventListener('pointerdown',e=>{if(!ready)return;stop();drag={id:e.pointerId,x:e.clientX,angle};e.currentTarget.setPointerCapture(e.pointerId);});
$('#world').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;setAngle(drag.angle-(e.clientX-drag.x)/Math.max(1,$('#world').clientWidth)*24);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('#world').addEventListener(event,()=>{drag=null;});
$('#world').addEventListener('keydown',e=>{if(!ready)return;if(e.key==='ArrowLeft'){e.preventDefault();setAngle(angle-.5);}if(e.key==='ArrowRight'){e.preventDefault();setAngle(angle+.5);}if(e.key==='Home'){e.preventDefault();setAngle(0);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('resize',resize);
boot().catch(error=>{console.error(error);stop();$('#status').textContent='场景加载失败';$('#status').classList.add('error');$('#loading').textContent=error.message;});
