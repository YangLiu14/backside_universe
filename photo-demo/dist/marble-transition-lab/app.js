import * as THREE from 'three';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
import {projectionBounds} from '../marble-lab/camera.js';
import {createObjects,createDesktop} from './objects.js';
import {createHoliday} from './holiday.js';
import {auditSourceOcclusion} from './hidden-world.js';
import {createCompositor} from './compositor.js';
import {DURATION,clamp01,smooth,sampleJourney,cameraPose,applyProjection} from './journey.js';

const $=id=>document.getElementById(id),canvas=$('world'),stage=$('stage');
let ready=false,progress=0,playing=null,variant='transition',meta,renderer,camera,compositor,objects,desktop,holiday,realScene,dreamScene;
let width=1,height=1,frameTimes=[],lastFrame=0,settleUntil=0;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function status(message){$('status').textContent=message;}
function stop(){playing=null;$('play-icon').innerHTML='<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg>';$('play-label').textContent=progress>=1?'返回实景':'播放转场';$('play').setAttribute('aria-pressed','false');$('play').setAttribute('aria-label',progress>=1?'返回实景':'播放转场');canvas.dataset.frameTimes=JSON.stringify(frameTimes);settleUntil=performance.now()+450;}
function setProgress(value,manual=true){
  if(!ready||!Number.isFinite(Number(value)))return;if(manual)stop();progress=clamp01(Number(value));
  settleUntil=performance.now()+450;
  const state=sampleJourney(progress),pose=cameraPose(meta.calibration.parameters,progress);
  camera.position.copy(pose.position);camera.quaternion.copy(pose.quaternion);camera.updateMatrixWorld(true);
  applyProjection(camera,meta.calibration.parameters,progress,width/height);holiday.update(state.time,camera,state.sea);
  $('progress').value=Math.round(progress*1000);$('progress').style.setProperty('--progress',`${progress*100}%`);
  $('phase').textContent=state.label;$('angle').textContent=`${state.angle.toFixed(0)}°`;$('elapsed').textContent=`${(progress*DURATION/1000).toFixed(1)} / 4.8 s`;
  $('gesture').hidden=progress>.03;document.querySelectorAll('[data-progress]').forEach(b=>b.setAttribute('aria-current',String(Math.abs(progress-Number(b.dataset.progress))<.01)));
  canvas.dataset.camera=JSON.stringify(camera.matrixWorld.toArray());canvas.dataset.projection=JSON.stringify(camera.projectionMatrix.toArray());canvas.dataset.progress=String(progress);canvas.dataset.seaAmount=String(state.sea);
  if(!playing)stop();
}
function travel(to){stop();if(reduce){setProgress(to);return;}frameTimes=[];lastFrame=0;playing={from:progress,to,start:performance.now(),duration:Math.max(400,DURATION*Math.abs(to-progress))};$('play-icon').innerHTML='<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';$('play-label').textContent='暂停';$('play').setAttribute('aria-pressed','true');$('play').setAttribute('aria-label','暂停转场');}
function setVariant(value){if(!ready||!['transition','real','dream'].includes(value))return;stop();variant=value;document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===value)));}
function resize(){const rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);if(!renderer)return;renderer.setSize(width,height,false);compositor?.resize(width,height);if(ready)setProgress(progress,false);}
function frame(now){
  if(document.hidden)return;
  const wasPlaying=!!playing;
  if(playing){const t=clamp01((now-playing.start)/playing.duration),{from,to}=playing;setProgress(THREE.MathUtils.lerp(from,to,smooth(0,1,t)),false);if(t===1)stop();}
  if(!ready||(!playing&&now>settleUntil))return;
  // Keep Spark updated after camera changes; water/palms use progress time, so
  // a paused or reversed frame has exactly the same scene state.
  renderer.info.reset();compositor.render(camera,sampleJourney(progress),variant,$('softness').checked&&!reduce);
  if(wasPlaying&&lastFrame){frameTimes.push(now-lastFrame);if(frameTimes.length>1000)frameTimes.shift();}lastFrame=now;
  canvas.dataset.frameTimes=JSON.stringify(frameTimes);
}
async function boot(){
  meta=await fetch('../marble-refined-lab/assets/scene.json').then(r=>{if(!r.ok)throw Error('未找到保留的 Marble 场景记录');return r.json();});
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  realScene=new THREE.Scene();realScene.background=new THREE.Color('#bfc8c3');dreamScene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(50,1,.012,30);const p=meta.calibration.parameters;
  camera.position.set(p.x,p.y,p.z);camera.quaternion.setFromEuler(new THREE.Euler(...[p.pitch,p.yaw,p.roll].map(THREE.MathUtils.degToRad),'YXZ'));camera.updateMatrixWorld(true);
  const spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:.3,enableLod:false,sortRadial:false});realScene.add(spark);
  const room=new SplatMesh({url:'../marble-refined-lab/assets/room-without-objects.spz',lod:false});room.scale.setScalar(meta.semantics_metadata.metric_scale_factor);room.rotation.x=Math.PI;room.position.y=meta.semantics_metadata.ground_plane_offset;realScene.add(room);
  const sourceCamera=camera.clone();sourceCamera.projectionMatrix.makePerspective(...projectionBounds(p,[0,0,1,1],1320,1739,sourceCamera.near),sourceCamera.near,sourceCamera.far);sourceCamera.projectionMatrixInverse.copy(sourceCamera.projectionMatrix).invert();sourceCamera.updateMatrixWorld(true);
  status('正在对齐电脑、书本和杯子…');
  const registered=createObjects(renderer,realScene,meta,sourceCamera);
  [objects,desktop,holiday]=await Promise.all([registered,createDesktop(realScene),registered.then(o=>createHoliday(dreamScene,meta,o,renderer)),room.initialized]);
  realScene.environment=holiday.environment;realScene.environmentIntensity=.75;
  const realSun=holiday.sun.clone();realSun.castShadow=false;realSun.target=holiday.sun.target.clone();
  realScene.add(realSun,realSun.target,new THREE.HemisphereLight('#e3e9e6','#8d8574',1.0));
  objects.meshes.forEach(o=>o.castShadow=true);
  compositor=createCompositor(renderer,{objects:objects.group,desktop},realScene,dreamScene,holiday);resize();
  status('正在准备转场画面…');
  dreamScene.add(objects.group);await renderer.compileAsync(dreamScene,camera);realScene.add(objects.group);await renderer.compileAsync(realScene,camera);
  ready=true;setProgress(0);
  await spark.update({scene:realScene,camera});
  renderer.setAnimationLoop(frame);
  // A first dream frame uploads model textures before the user can scrub there.
  renderer.shadowMap.needsUpdate=true;compositor.render(camera,sampleJourney(0),'dream');compositor.render(camera,sampleJourney(0),'real');
  settleUntil=performance.now()+1200;
  document.querySelectorAll('button:disabled,input:disabled').forEach(el=>el.disabled=false);$('loading').hidden=true;
  $('diagnostic-status').textContent='同一桌面逐步成为海面 · 电脑、书本、杯子组成群岛 · 正面隐藏约束保留 · 沿用已有 Hi3D 资产';
  canvas.dataset.island=holiday.islandSource;canvas.dataset.sceneRevision='desktop-archipelago';
  canvas.dataset.frontOcclusion=JSON.stringify(auditSourceOcclusion(renderer,dreamScene,objects.group,holiday.group,sourceCamera));
  const value=new URLSearchParams(location.search).get('progress');if(value!==null)setProgress(Number(value));
}
$('progress').addEventListener('input',e=>setProgress(Number(e.target.value)/1000));
$('play').addEventListener('click',()=>playing?stop():travel(progress>.995?0:1));$('home').addEventListener('click',()=>setProgress(0));
document.querySelectorAll('[data-progress]').forEach(b=>b.addEventListener('click',()=>setProgress(Number(b.dataset.progress))));
document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>setVariant(b.dataset.variant)));
$('softness').addEventListener('change',stop);
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(!ready||e.button!==0)return;stop();canvas.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,progress};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)setProgress(drag.progress-(e.clientX-drag.x)/Math.max(250,width*.72));});
function endDrag(e){if(drag?.id===e.pointerId)drag=null;}
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endDrag);
canvas.addEventListener('wheel',e=>{if(!ready)return;e.preventDefault();setProgress(progress+e.deltaY*.00065);},{passive:false});
canvas.addEventListener('keydown',e=>{if(!ready||!['ArrowLeft','ArrowRight','Home','End',' ','Enter'].includes(e.key))return;e.preventDefault();if(e.key==='Home')setProgress(0);else if(e.key==='End')setProgress(1);else if(e.key===' '||e.key==='Enter')playing?stop():travel(progress>.995?0:1);else setProgress(progress+(e.key==='ArrowRight'?.01:-.01));});
new ResizeObserver(resize).observe(stage);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.__marbleTransition={setProgress,setVariant,stop,get state(){return{ready,progress,variant,playing:!!playing,...sampleJourney(progress),camera:camera?.matrixWorld.toArray(),projection:camera?.projectionMatrix.toArray(),compositor:compositor?.stats,houseReady:holiday?.houseReady,frames:frameTimes.slice()};},get renderer(){return renderer;},get scene(){return realScene;},get dreamScene(){return dreamScene;},get camera(){return camera;},get objects(){return objects;}};
boot().catch(error=>{console.error(error);status(`加载未完成：${error.message}。请恢复本地资产后刷新。`);$('loading').dataset.error='true';});
