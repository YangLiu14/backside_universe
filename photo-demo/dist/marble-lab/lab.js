import * as THREE from 'three';
import { SparkRenderer } from '@sparkjsdev/spark';
import {loadMarbleRoom} from '../marble-detail/room.js';
import { orbitPose, projectionBounds, validateCalibration } from './camera.js';

const $=s=>document.querySelector(s);
const crops={full:[0,0,1,1],desk:[.09,.30,.89,.31],laptop:[.34,.35,.25,.15],cup:[.52,.35,.18,.13],carpet:[.31,.80,.28,.155]};
let meta,renderer,scene,camera,splat,calibration,originalCalibration;
let ready=false,loading=false,playing=false,phase=0,lastTime=0,angle=0,cropName='full',storageKey='';
let manifestStatus='pending';

function stop(){playing=false;$('#play').textContent='播放往返';$('#play').setAttribute('aria-pressed','false');}
function hideReference(){ $('#alignment-reference').hidden=true;$('#toggle-reference').setAttribute('aria-pressed','false'); }
function setAngle(value,manual=true){
  if(!Number.isFinite(Number(value)))return;
  if(manual)stop();
  hideReference();
  angle=Math.max(-12,Math.min(12,Number(value)));
  $('#angle').value=angle;
  $('#angle-value').textContent=`${angle>0?'+':''}${angle.toFixed(2)}°`;
  if(ready)$('#angle-label').textContent=`${Math.abs(angle)<.005?'参考机位':'水平绕行'} · ${angle.toFixed(2)}°`;
  document.querySelectorAll('[data-angle]').forEach(b=>b.setAttribute('aria-current',String(Math.abs(angle-Number(b.dataset.angle))<.01)));
  if(!camera||!calibration)return;
  const pose=orbitPose(calibration,angle);
  camera.position.fromArray(pose.position);camera.quaternion.fromArray(pose.quaternion);camera.updateMatrixWorld(true);
}

function resize(){
  const [x,y,w,h]=crops[cropName],W=1320,H=1739;
  document.documentElement.style.setProperty('--aspect',String(W*w/(H*h)));
  for(const img of [$('#reference'),$('#alignment-reference')])Object.assign(img.style,
    {width:`${100/w}%`,height:`${100/h}%`,left:`${-x/w*100}%`,top:`${-y/h*100}%`});
  if(!renderer||!camera||!calibration)return;
  const rect=$('#result-frame').getBoundingClientRect();
  renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
  camera.projectionMatrix.makePerspective(...projectionBounds(calibration,crops[cropName],W,H,camera.near),camera.near,camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
function selectCrop(name){if(!crops[name])return;cropName=name;document.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crop===name)));resize();}
function fillCalibration(){document.querySelectorAll('[data-cal]').forEach(el=>el.value=calibration[el.dataset.cal]);}
function calibrationChanged(value){
  try{calibration=validateCalibration(value);setAngle(0);resize();fillCalibration();$('#calibration-status').textContent='· 本机调整，尚未保存';$('#calibration-note').textContent='当前为人工调整机位。请检查多个物件的共同对齐，避免只对准电脑而让桌沿偏移。';}
  catch(error){$('#calibration-note').textContent=error.message;}
}
function validAssetPath(name){
  if(!/^[a-zA-Z0-9_-]+\.spz$/.test(name||''))throw new Error('场景资产路径不正确。');
  return './assets/'+name;
}

async function loadScene(manifest){
  loading=true;meta=manifest;
  const semantics=meta.semantics_metadata||{},scale=semantics.metric_scale_factor,ground=semantics.ground_plane_offset;
  if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(ground))throw new Error('缺少场景比例或坐标元数据。');
  const variant=meta.variants?.full_res||meta.variants?.['500k'];
  const url=validAssetPath(variant?.file);
  // Ground alignment happens in raw OpenCV coordinates, followed by the X-axis flip.
  // R_x(pi) * (scale*p - [0,ground,0]) = scale*R_x(pi)*p + [0,ground,0].
  originalCalibration={x:0,y:ground,z:0,yaw:0,pitch:0,roll:0,
    fov:THREE.MathUtils.radToDeg(2*Math.atan(1739/(2*1553.64794921875))),distance:3};
  if(meta.calibration?.parameters)originalCalibration=validateCalibration(meta.calibration.parameters);
  calibration={...originalCalibration};storageKey='backside-marble-camera-'+meta.world_id;
  let saved=false;
  try{const v=JSON.parse(localStorage.getItem(storageKey));if(v){calibration=validateCalibration(v);saved=true;}}catch{/* Ignore stale or unavailable local storage. */}
  fillCalibration();
  $('#status').textContent='正在加载 Marble Gaussian 场景…';$('#loading').textContent='正在读取本地 SPZ 资产';
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(60,1,.01,1000);
  renderer=new THREE.WebGLRenderer({canvas:$('#world'),antialias:false,alpha:true,preserveDrawingBuffer:true});
  renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
  // Keep Spark's 0.3 px² covariance antialiasing, including opacity correction.
  // Disabling it undersamples small splats on narrow screens. No depth-of-field
  // or image-space blur is used to conceal reconstruction errors.
  const spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:.3,enableLod:false,sortRadial:false});scene.add(spark);
  let detail = new URLSearchParams(location.search).get('detail') === '1';
  const detailUrl = '../marble-detail/assets/desk-detail.spz';
  const onProgress = e => {
    if (e.total) $('#loading').textContent = `正在读取本地 SPZ 资产 · ${Math.round(e.loaded / e.total * 100)}%`;
  };
  const load = enhanced => loadMarbleRoom(enhanced ? detailUrl : url, semantics, onProgress);
  let fallback = false;
  try {
    splat = await load(detail);
  } catch (error) {
    if (!detail) throw error;
    detail = false;
    fallback = true;
    splat = await load(false);
  }
  scene.add(splat);
  const checkbox = $('#detail');
  function showVersion() {
    checkbox.checked = detail;
    $('#result-note').textContent = detail
      ? '已用原照片细化赛车画、书页、屏幕和地毯织纹。可绕行观察，或关闭增强在同一机位比较。'
      : (meta.review?.summary || '已载入原始 Marble 场景。');
    $('#status').textContent = `Marble 1.1 · ${detail ? '细节增强' : '原始场景'} · ${(splat.numSplats / 10000).toFixed(1)} 万个高斯点`;
  }
  checkbox.addEventListener('change', async () => {
    const requested = checkbox.checked;
    checkbox.disabled = true;
    stop();
    hideReference();
    $('#status').textContent = '正在切换场景…';
    try {
      const next = await load(requested);
      scene.add(next);
      scene.remove(splat);
      splat.dispose();
      splat = next;
      detail = requested;
      const link = new URL(location.href);
      link.searchParams.set('detail', detail ? '1' : '0');
      history.replaceState(null, '', link);
      showVersion();
    } catch {
      showVersion();
      $('#status').textContent += ' · 切换失败，可重试';
    } finally {
      checkbox.disabled = false;
    }
  });
  resize();setAngle(0);
  renderer.setAnimationLoop(time=>{
    const dt=Math.max(0,Math.min((time-lastTime)/1000,.05));lastTime=time;
    if(playing){phase+=dt*2*Math.PI/8;setAngle(12*Math.sin(phase),false);}
    renderer.render(scene,camera);
  });
  ready=true;$('#loading').hidden=true;
  document.querySelectorAll('button:disabled,input:disabled,fieldset:disabled').forEach(el=>el.disabled=false);
  showVersion();
  if (fallback) $('#status').textContent += ' · 增强文件未载入';
  $('#calibration-status').textContent=saved?'· 已载入本机校准':meta.calibration?'· 已载入记录':'· 需要检查';
  if(meta.calibration&&!saved)$('#calibration-note').textContent='已按原照共同特征校准机位与视角，并人工检查整体构图。物件形状仍有差异；这是近似配准，不是精确实景重建。';
  $('#asset-details').textContent=`原始导出 · ${meta.model} · 完整原照片 1320 × 1739 · ${(variant.bytes/1024/1024).toFixed(1)} MiB。使用服务返回的场景比例与坐标信息。${meta.cost?.total_credits!=null?'本次生成消耗 '+meta.cost.total_credits+' credits。':''} 原图 SHA256：${meta.source_sha256}`;
  if(!saved&&!meta.calibration)$('#calibration-panel').open=true;
  setAngle(0);
}

async function checkScene(){
  if(ready||loading)return;
  try{
    const response=await fetch('./assets/scene.json',{cache:'no-store'});
    if(!response.ok)throw new Error('无法读取本地场景记录。');
    const manifest=await response.json();manifestStatus=manifest.status;
    if(manifest.status==='generated'){await loadScene(manifest);return;}
    const statusResponse=await fetch('./assets/status.json',{cache:'no-store'});
    const status=statusResponse.ok?await statusResponse.json():null;
    $('#status').textContent=status?.message||'尚未提交生成';
    $('#loading').textContent=status?.status==='generating'?'正在生成完整书桌空间\n完成后将在这里自动载入。':'尚无 Marble 场景\n等待生成完成后检查原图对齐与绕行。';
    $('#result-note').textContent=status?.message||'尚未提交生成，等待本机配置 API key。';
  }catch(error){
    $('#status').textContent='场景尚未就绪';$('#status').classList.add('error');$('#loading').textContent=error.message;
    if(loading){stop();renderer?.setAnimationLoop(null);console.error(error);}
  }
}

window.__marbleLab={setAngle,setCrop:selectCrop,resize,calibrate:calibrationChanged,
  get state(){return{ready,angle,playing,crop:cropName,status:manifestStatus,calibration,
    splats:splat?.numSplats||0,camera:camera?.matrixWorld.toArray(),projection:camera?.projectionMatrix.toArray(),
    referenceVisible:!$('#alignment-reference').hidden};},
  get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},get meta(){return meta;}};
document.querySelectorAll('[data-crop]').forEach(button => button.addEventListener('click', () => {
  selectCrop(button.dataset.crop);
  const url = new URL(location.href);
  if (cropName === 'full') url.searchParams.delete('crop');
  else url.searchParams.set('crop',cropName);
  history.replaceState(null,'',url);
}));
document.querySelectorAll('[data-angle]').forEach(b=>b.addEventListener('click',()=>setAngle(b.dataset.angle)));
$('#angle').addEventListener('input',e=>setAngle(e.target.value));$('#reset').addEventListener('click',()=>setAngle(0));
$('#gaps').addEventListener('change',e=>$('#result-frame').classList.toggle('gaps',e.target.checked));
$('#play').addEventListener('click',()=>{if(playing)return stop();hideReference();playing=true;phase=Math.asin(angle/12);$('#play').textContent='暂停';$('#play').setAttribute('aria-pressed','true');});
let drag=null;
$('#world').addEventListener('pointerdown',e=>{if(!ready)return;stop();drag={id:e.pointerId,x:e.clientX,angle};e.currentTarget.setPointerCapture(e.pointerId);});
$('#world').addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)setAngle(drag.angle-(e.clientX-drag.x)/Math.max(1,$('#world').clientWidth)*24);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('#world').addEventListener(event,()=>drag=null);
$('#world').addEventListener('keydown',e=>{if(!ready)return;if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();setAngle(e.key==='Home'?0:angle+(e.key==='ArrowLeft'?-.5:.5));}});
document.querySelectorAll('[data-cal]').forEach(el=>el.addEventListener('change',()=>{
  const value=Object.fromEntries([...document.querySelectorAll('[data-cal]')].map(input=>[input.dataset.cal,Number(input.value)]));calibrationChanged(value);
}));
$('#toggle-reference').addEventListener('click',()=>{const show=$('#alignment-reference').hidden;setAngle(0);$('#alignment-reference').hidden=!show;$('#toggle-reference').setAttribute('aria-pressed',String(show));});
$('#save-calibration').addEventListener('click',()=>{
  try{localStorage.setItem(storageKey,JSON.stringify(validateCalibration(calibration)));$('#calibration-status').textContent='· 已保存本机校准';}
  catch{$('#calibration-note').textContent='本机存储不可用，请导出校准记录。';}
});
$('#clear-calibration').addEventListener('click',()=>{try{localStorage.removeItem(storageKey);}catch{}calibrationChanged(originalCalibration);});
$('#export-calibration').addEventListener('click',()=>{
  const record={world_id:meta.world_id,source_sha256:meta.source_sha256,parameters:calibration,method:'manual camera registration',verified:false};
  const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='marble-calibration.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('resize',resize);
const initialCrop = new URLSearchParams(location.search).get('crop');
selectCrop(Object.hasOwn(crops,initialCrop) ? initialCrop : 'full');
checkScene();setInterval(checkScene,8000);
