import * as THREE from 'three';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
import {projectionBounds} from '../marble-lab/camera.js';
import {createObjects} from './objects.js';

const $=s=>document.querySelector(s),crops={full:[0,0,1,1],desk:[.09,.30,.89,.31],laptop:[.34,.35,.25,.15],cup:[.52,.35,.18,.13]};
let meta,renderer,scene,camera,original,cleaned,support,objects,home,orientation,pivot,basePivot;
let ready=false,variant='hybrid',mode='limited',crop='desk',angle=0,playing=false,phase=0,last=0;
const yAxis=new THREE.Vector3(0,1,0);let limit=12;
function publishPose(){if(!camera)return;$('#world').dataset.camera=JSON.stringify(camera.matrixWorld.toArray());$('#world').dataset.projection=JSON.stringify(camera.projectionMatrix.toArray());}
function stop(){playing=false;$('#play').textContent='播放往返';$('#play').setAttribute('aria-pressed','false');publishPose();}
function setAngle(value,manual=true){
  if(!ready||!Number.isFinite(Number(value)))return;if(manual)stop();
  angle=THREE.MathUtils.clamp(Number(value),-limit,limit);
  const turn=new THREE.Quaternion().setFromAxisAngle(yAxis,THREE.MathUtils.degToRad(angle));
  camera.position.copy(home).sub(basePivot).applyQuaternion(turn).add(basePivot);
  camera.quaternion.copy(turn).multiply(orientation);camera.updateMatrixWorld(true);pivot.copy(basePivot);
  $('#angle').value=angle;$('#angle-value').textContent=`${angle>0?'+':''}${angle.toFixed(2)}°`;
  $('#angle-label').textContent=`${variant==='hybrid'?'替换版':'Marble 原版'} · ${angle.toFixed(2)}°`;
  document.querySelectorAll('[data-angle]').forEach(b=>b.setAttribute('aria-current',String(Math.abs(angle-Number(b.dataset.angle))<.01)));
  if(manual)publishPose();
}
function reset(){stop();setAngle(0);if(mode==='free')$('#angle-label').textContent='自由机位 · 已复位';}
function resize(){
  const [x,y,w,h]=crops[crop];document.documentElement.style.setProperty('--aspect',String(1320*w/(1739*h)));
  Object.assign($('#reference').style,{width:`${100/w}%`,height:`${100/h}%`,left:`${-x/w*100}%`,top:`${-y/h*100}%`});
  if(!renderer)return;const rect=$('#result-frame').getBoundingClientRect();renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
  camera.projectionMatrix.makePerspective(...projectionBounds(meta.calibration.parameters,crops[crop],1320,1739,camera.near),camera.near,camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  publishPose();
}
function setCrop(name){if(!crops[name])return;crop=name;document.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crop===name)));resize();}
function updateVisibility(){if(!ready)return;original.visible=variant==='original';cleaned.visible=support.visible=variant==='hybrid';objects.group.visible=variant==='hybrid'&&$('#objects-visible').checked;}
function setVariant(name){if(!ready||!['original','hybrid'].includes(name))return;stop();variant=name;updateVisibility();
  document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===name)));
  $('#variant-label').textContent=name==='hybrid'?'02 / 替换物件版':'02 / Marble 原版';
  $('#angle-label').textContent=mode==='free'?'自由机位':`${name==='hybrid'?'替换版':'Marble 原版'} · ${angle.toFixed(2)}°`;
}
function setMode(name){if(!ready||!['limited','wide','free'].includes(name))return;stop();const previous=mode;mode=name;limit=name==='limited'?12:180;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('#scrub').hidden=mode==='free';$('#play').disabled=mode==='free';$('#angle').min=-limit;$('#angle').max=limit;
  $('#min-angle').textContent=`−${limit}°`;$('#max-angle').textContent=`+${limit}°`;
  document.querySelectorAll('.wide-stop').forEach(b=>b.hidden=mode!=='wide');
  $('#mode-hint').textContent=mode==='free'?'左键拖动转向，右键或 Shift 拖动平移，滚轮前后移动；WASD / QE 移动，Home 返回。自由模式不检测碰撞。':mode==='wide'?'探索范围 ±180°。书桌靠墙，固定半径绕行在 90°–180° 可能穿墙；可返回原机位，改用自由观察平移。':'左右拖动，或使用滑杆。切换版本保留当前机位。';
  if(mode==='free'){$('#angle-label').textContent='自由机位';setCrop('full');}
  else if(previous==='free')reset();else setAngle(angle);
}
async function boot(){
  meta=await fetch('./assets/scene.json').then(r=>{if(!r.ok)throw new Error('混合资产尚未就绪');return r.json();});
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(60,1,.015,1000);
  const p=meta.calibration.parameters;home=new THREE.Vector3(p.x,p.y,p.z);orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(p.pitch),THREE.MathUtils.degToRad(p.yaw),THREE.MathUtils.degToRad(p.roll),'YXZ'));
  basePivot=new THREE.Vector3(0,0,-p.distance).applyQuaternion(orientation).add(home);pivot=basePivot.clone();camera.position.copy(home);camera.quaternion.copy(orientation);camera.updateMatrixWorld(true);
  renderer=new THREE.WebGLRenderer({canvas:$('#world'),antialias:false,alpha:true,preserveDrawingBuffer:true});renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  const spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:.3,enableLod:false,sortRadial:false});scene.add(spark);
  const makeWorld=url=>{const o=new SplatMesh({url,lod:false});o.scale.setScalar(meta.semantics_metadata.metric_scale_factor);o.rotation.x=Math.PI;o.position.y=meta.semantics_metadata.ground_plane_offset;scene.add(o);return o;};
  cleaned=makeWorld('./assets/room-without-objects.spz');original=makeWorld('../marble-lab/assets/desk-full_res.spz');original.visible=false;
  support=new SplatMesh({url:'./assets/support.ply',lod:false});
  const R=meta.source_camera_to_world,C=meta.source_camera_position;
  support.matrix.set(R[0][0],R[0][1],R[0][2],C[0],R[1][0],R[1][1],R[1][2],C[1],R[2][0],R[2][1],R[2][2],C[2],0,0,0,1);support.matrixAutoUpdate=false;scene.add(support);
  resize();const sourceCamera=camera.clone();sourceCamera.projectionMatrix.makePerspective(...projectionBounds(p,[0,0,1,1],1320,1739,sourceCamera.near),sourceCamera.near,sourceCamera.far);sourceCamera.projectionMatrixInverse.copy(sourceCamera.projectionMatrix).invert();sourceCamera.updateMatrixWorld(true);
  renderer.setAnimationLoop(t=>{const dt=Math.max(0,Math.min((t-last)/1000,.05));last=t;if(playing){phase+=dt*2*Math.PI/8;setAngle((mode==='limited'?12:180)*Math.sin(phase),false);}renderer.render(scene,camera);});
  await Promise.all([cleaned.initialized,original.initialized,support.initialized]);objects=await createObjects(renderer,scene,meta,sourceCamera);
  ready=true;$('#loading').hidden=true;document.querySelectorAll('button:disabled,input:disabled').forEach(b=>b.disabled=false);updateVisibility();reset();
  $('#status').textContent='Marble 房间 · 三件原照物件';
  $('#asset-details').textContent=`复用已有 Marble 世界，清理 ${meta.removed_total.toLocaleString()} 个前景 Gaussian；补充局部桌面。电脑/杯子沿用已校准实体几何，纸页沿用已生成 Hi3D 模型，书本同步校准以承托纸页。本轮新增生成费用：0。`;
  $('#review-note').textContent=meta.review?.summary||'正在进行局部视觉验收；大角度隐藏面为推断，不能视作真实拍摄。';
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
  const radius=camera.position.distanceTo(pivot),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  if(drag.pan){const delta=right.multiplyScalar(-dx/w*radius*1.3).addScaledVector(up,dy/w*radius*1.3);camera.position.add(delta);pivot.add(delta);}
  else{const yaw=new THREE.Quaternion().setFromAxisAngle(yAxis,-dx/w*Math.PI),pitch=new THREE.Quaternion().setFromAxisAngle(right,-dy/w*Math.PI);const turn=pitch.multiply(yaw);camera.position.sub(pivot).applyQuaternion(turn).add(pivot);camera.quaternion.premultiply(turn);}
  camera.updateMatrixWorld(true);publishPose();drag.x=e.clientX;drag.y=e.clientY;$('#angle-label').textContent='自由机位';
});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>drag=null);
canvas.addEventListener('wheel',e=>{if(mode!=='free'||!ready)return;e.preventDefault();stop();const offset=camera.position.clone().sub(pivot),distance=THREE.MathUtils.clamp(offset.length()*Math.exp(e.deltaY*.001),.18,8);camera.position.copy(pivot).add(offset.setLength(distance));camera.updateMatrixWorld(true);publishPose();},{passive:false});
canvas.addEventListener('keydown',e=>{if(!ready)return;if(e.key==='Home'){e.preventDefault();reset();return;}
  if(mode!=='free'){if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setAngle(angle+(e.key==='ArrowLeft'?-.5:.5));}return;}
  const directions={w:[0,0,-1],s:[0,0,1],a:[-1,0,0],d:[1,0,0],q:[0,-1,0],e:[0,1,0]},v=directions[e.key.toLowerCase()];
  if(v){e.preventDefault();const delta=new THREE.Vector3(...v).applyQuaternion(camera.quaternion).multiplyScalar(.07);camera.position.add(delta);pivot.add(delta);camera.updateMatrixWorld(true);publishPose();}
});
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});resize();boot().catch(e=>{$('#status').textContent='加载失败';$('#loading').textContent=e.message;console.error(e);});
