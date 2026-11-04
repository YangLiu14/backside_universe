import * as THREE from 'three';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
import {projectionBounds} from '../marble-lab/camera.js';
import {createObjects,createDesktop} from './objects.js';
import {createObjects as createBaselineObjects} from './baseline-objects.js';
import {orbitPose,clampRoom} from './orbit.js';

const $=s=>document.querySelector(s),crops={full:[0,0,1,1],desk:[.09,.30,.89,.31],laptop:[.34,.35,.25,.15],cup:[.52,.35,.18,.13]};
let meta,renderer,scene,camera,original,cleaned,support,objects,home,orientation,pivot,basePivot,baselineObjects,baselineSupport;
let ready=false,variant='hybrid',mode='limited',crop='desk',angle=0,playing=false,phase=0,last=0;
const yAxis=new THREE.Vector3(0,1,0);let limit=12;
function publishPose(){if(!camera)return;$('#world').dataset.camera=JSON.stringify(camera.matrixWorld.toArray());$('#world').dataset.projection=JSON.stringify(camera.projectionMatrix.toArray());}
function stop(){playing=false;$('#play').textContent='播放往返';$('#play').setAttribute('aria-pressed','false');publishPose();}
function setAngle(value,manual=true){
  if(!ready||!Number.isFinite(Number(value)))return;if(manual)stop();
  angle=THREE.MathUtils.clamp(Number(value),-limit,limit);
  const pose=orbitPose(meta.calibration.parameters,angle,mode==='wide');
  camera.position.copy(pose.position);camera.quaternion.copy(pose.quaternion);camera.updateMatrixWorld(true);pivot.copy(pose.pivot);
  $('#angle').value=angle;$('#angle-value').textContent=`${angle>0?'+':''}${angle.toFixed(2)}°`;
  $('#angle-label').textContent=`${variant==='hybrid'?'融合优化':'上一版'} · ${angle.toFixed(2)}°`;
  document.querySelectorAll('[data-angle]').forEach(b=>b.setAttribute('aria-current',String(Math.abs(angle-Number(b.dataset.angle))<.01)));
  if(manual)publishPose();
}
function reset(){stop();setAngle(0);if(mode==='free')$('#angle-label').textContent='自由机位 · 已复位';}
function resize(){
  const [x,y,w,h]=crops[crop];document.documentElement.style.setProperty('--aspect',String(1320*w/(1739*h)));
  Object.assign($('#reference').style,{width:`${100/w}%`,height:`${100/h}%`,left:`${-x/w*100}%`,top:`${-y/h*100}%`});
  if(!renderer)return;const rect=$('#result-frame').getBoundingClientRect();renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
  if(mode==='limited')camera.projectionMatrix.makePerspective(...projectionBounds(meta.calibration.parameters,crops[crop],1320,1739,camera.near),camera.near,camera.far);
  else{camera.aspect=rect.width/rect.height;camera.fov=68;camera.updateProjectionMatrix();}
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  publishPose();
}
function setCrop(name){if(!crops[name])return;crop=name;document.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crop===name)));resize();}
function updateVisibility(){if(!ready)return;original.visible=baselineSupport.visible=baselineObjects.group.visible=variant==='original';cleaned.visible=support.visible=variant==='hybrid';objects.group.visible=variant==='hybrid'&&$('#objects-visible').checked;}
function setVariant(name){if(!ready||!['original','hybrid'].includes(name))return;stop();variant=name;updateVisibility();
  document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===name)));
  $('#variant-label').textContent=name==='hybrid'?'02 / 融合优化':'02 / 上一版';
  $('#angle-label').textContent=mode==='free'?'自由机位':`${name==='hybrid'?'融合优化':'上一版'} · ${angle.toFixed(2)}°`;
}
function setMode(name){if(!ready||!['limited','wide','free'].includes(name))return;stop();const previous=mode;mode=name;limit=name==='limited'?12:120;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  document.body.classList.toggle('explore',mode!=='limited');$('#move-pad').hidden=mode!=='free';
  $('#scrub').hidden=mode==='free';$('#play').disabled=mode==='free';$('#angle').min=-limit;$('#angle').max=limit;
  $('#min-angle').textContent=`−${limit}°`;$('#max-angle').textContent=`+${limit}°`;
  document.querySelectorAll('.wide-stop').forEach(b=>b.hidden=mode!=='wide');
  $('#mode-hint').textContent=mode==='free'?'拖动画面原地转头；滚轮或下方按钮前后移动；右键 / Shift 拖动平移，WASD / QE 也可移动。Home 回到原照。已限制大致房间边界，家具仍可能被穿过。':mode==='wide'?'超过 12° 后逐渐靠近桌面，沿小半径绕行至 ±120°。需要继续转头或前后探索，可切换自由移动；新露表面仍是近似。':'左右拖动，或使用滑杆。切换版本保留当前机位。';
  if(mode==='free'){$('#angle-label').textContent='自由机位';setCrop('full');}
  else if(previous==='free')reset();else setAngle(angle);
  if(mode!=='limited')setCrop('full');else resize();
}
async function boot(){
  meta=await fetch('./assets/scene.json').then(r=>{if(!r.ok)throw new Error('混合资产尚未就绪');return r.json();});
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(60,1,.015,1000);
  const p=meta.calibration.parameters;home=new THREE.Vector3(p.x,p.y,p.z);orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(p.pitch),THREE.MathUtils.degToRad(p.yaw),THREE.MathUtils.degToRad(p.roll),'YXZ'));
  basePivot=new THREE.Vector3(0,0,-p.distance).applyQuaternion(orientation).add(home);pivot=basePivot.clone();camera.position.copy(home);camera.quaternion.copy(orientation);camera.updateMatrixWorld(true);
  renderer=new THREE.WebGLRenderer({canvas:$('#world'),antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  const spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:.3,enableLod:false,sortRadial:false});scene.add(spark);
  const makeWorld=url=>{const o=new SplatMesh({url,lod:false});o.scale.setScalar(meta.semantics_metadata.metric_scale_factor);o.rotation.x=Math.PI;o.position.y=meta.semantics_metadata.ground_plane_offset;scene.add(o);return o;};
  cleaned=makeWorld('./assets/room-without-objects.spz');original=makeWorld('../marble-hybrid-lab/assets/room-without-objects.spz');original.visible=false;
  baselineSupport=new SplatMesh({url:'../marble-hybrid-lab/assets/support.ply',lod:false});
  const R=meta.source_camera_to_world,C=meta.source_camera_position;
  baselineSupport.matrix.set(R[0][0],R[0][1],R[0][2],C[0],R[1][0],R[1][1],R[1][2],C[1],R[2][0],R[2][1],R[2][2],C[2],0,0,0,1);baselineSupport.matrixAutoUpdate=false;baselineSupport.visible=false;scene.add(baselineSupport);
  resize();const sourceCamera=camera.clone();sourceCamera.projectionMatrix.makePerspective(...projectionBounds(p,[0,0,1,1],1320,1739,sourceCamera.near),sourceCamera.near,sourceCamera.far);sourceCamera.projectionMatrixInverse.copy(sourceCamera.projectionMatrix).invert();sourceCamera.updateMatrixWorld(true);
  renderer.setAnimationLoop(t=>{const dt=Math.max(0,Math.min((t-last)/1000,.05));last=t;if(playing){phase+=dt*2*Math.PI/8;setAngle(limit*Math.sin(phase),false);}renderer.render(scene,camera);});
  await Promise.all([cleaned.initialized,original.initialized,baselineSupport.initialized]);objects=await createObjects(renderer,scene,meta,sourceCamera);baselineObjects=await createBaselineObjects(renderer,scene,meta,sourceCamera);support=await createDesktop(scene);
  ready=true;$('#loading').hidden=true;document.querySelectorAll('button:disabled,input:disabled').forEach(b=>b.disabled=false);updateVisibility();reset();
  $('#status').textContent='局部融合优化 · 同机位对照';
  $('#asset-details').textContent=`保留原 Marble 与上一版文件。当前衍生场景清理 ${meta.removed_total.toLocaleString()} 个局部 Gaussian；桌面补面匹配周边颜色与高度，杯柄和书边分别处理。新增生成费用：0。`;
  $('#review-note').textContent=meta.review?.summary||'正在进行局部视觉验收；大角度隐藏面为推断，不能视作真实拍摄。';
  const query=new URLSearchParams(location.search),initialMode=query.get('mode');
  if(['wide','free'].includes(initialMode)){setMode(initialMode);if(initialMode==='wide'&&query.has('angle'))setAngle(Number(query.get('angle')));}
}
window.__marbleHybrid={setAngle,setCrop,setMode,setVariant,reset,
  get state(){return{ready,variant,mode,angle,crop,playing,camera:camera?.matrixWorld.toArray(),projection:camera?.projectionMatrix.toArray(),objectsVisible:objects?.group.visible,photoMaterial:$('#photo-material').checked};},
  get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},get meta(){return meta;},get objects(){return objects;}};
document.querySelectorAll('[data-crop]').forEach(b=>b.addEventListener('click',()=>setCrop(b.dataset.crop)));
document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>setVariant(b.dataset.variant)));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
document.querySelectorAll('[data-angle]').forEach(b=>b.addEventListener('click',()=>{if(mode==='free')setMode('limited');setAngle(b.dataset.angle);}));
$('#angle').addEventListener('input',e=>setAngle(e.target.value));$('#reset').addEventListener('click',reset);
$('#play').addEventListener('click',()=>{if(playing)return stop();playing=true;phase=Math.asin(angle/limit);$('#play').textContent='暂停';$('#play').setAttribute('aria-pressed','true');});
$('#objects-visible').addEventListener('change',updateVisibility);$('#photo-material').addEventListener('change',e=>objects.setPhoto(e.target.checked));$('#inspect').addEventListener('change',e=>objects.setInspection(e.target.checked));$('#gaps').addEventListener('change',e=>$('#result-frame').classList.toggle('gaps',e.target.checked));
let drag=null;
const canvas=$('#world');canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(!ready)return;stop();canvas.focus();drag={id:e.pointerId,x:e.clientX,y:e.clientY,angle,pan:e.button===2||e.shiftKey};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y,w=Math.max(1,canvas.clientWidth);
  if(mode!=='free'){setAngle(drag.angle-dx/w*limit*2);return;}
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0);
  if(drag.pan){camera.position.addScaledVector(right,-dx/w*1.8).addScaledVector(up,dy/w*1.8);clampRoom(camera.position);}
  else{const rotation=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');rotation.y-=dx/w*Math.PI;rotation.x=THREE.MathUtils.clamp(rotation.x-dy/w*Math.PI,-1.4,1.2);rotation.z=0;camera.quaternion.setFromEuler(rotation);}
  camera.updateMatrixWorld(true);publishPose();drag.x=e.clientX;drag.y=e.clientY;$('#angle-label').textContent='自由机位';
});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>drag=null);
function moveFree(x,y,z,amount=.09){if(!ready||mode!=='free')return;stop();const delta=new THREE.Vector3(x,0,z).applyQuaternion(camera.quaternion);delta.y+=y;camera.position.addScaledVector(delta,amount);clampRoom(camera.position);camera.updateMatrixWorld(true);publishPose();$('#angle-label').textContent='自由机位';}
canvas.addEventListener('wheel',e=>{if(mode!=='free'||!ready)return;e.preventDefault();moveFree(0,0,Math.sign(e.deltaY),Math.min(Math.abs(e.deltaY)*.001,.10));},{passive:false});
canvas.addEventListener('keydown',e=>{if(!ready)return;if(e.key==='Home'){e.preventDefault();reset();return;}
  if(mode!=='free'){if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setAngle(angle+(e.key==='ArrowLeft'?-.5:.5));}return;}
  const directions={w:[0,0,-1],s:[0,0,1],a:[-1,0,0],d:[1,0,0],q:[0,-1,0],e:[0,1,0]},v=directions[e.key.toLowerCase()];
  if(v){e.preventDefault();moveFree(...v,.06);}
});
document.querySelectorAll('[data-move]').forEach(b=>b.addEventListener('click',()=>moveFree(...b.dataset.move.split(',').map(Number))));
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});resize();boot().catch(e=>{$('#status').textContent='加载失败';$('#loading').textContent=e.message;console.error(e);});
