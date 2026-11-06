import * as THREE from 'three';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
import {projectionBounds} from '../marble-lab/camera.js';
import {createObjects,createDesktop} from './objects.js';
import {createHoliday} from './holiday.js';
import {auditSourceOcclusion} from './hidden-world.js';
import {createCompositor} from './compositor.js';
import {DURATION,clamp01,smooth,sampleJourney,cameraPose,applyProjection,sourceCrop} from './journey.js';
import {createDeskExplore,exploreGestures,isTravelKey} from './desk-explore.js';
import {createBookroomVisit} from './bookroom-visit.js';

const $=id=>document.getElementById(id),canvas=$('world'),stage=$('stage');
const embedded=new URLSearchParams(location.search).get('portal')==='book'&&parent!==window;
document.body.classList.toggle('book-portal',embedded);
let embedActive=!embedded,spark,visit,lastTick=performance.now();
const tellParent=(type,detail={})=>{if(embedded)parent.postMessage({type,...detail},location.origin);};
let visitReturnProgress=1,visitReturnView,explore,gestures,islandOptions,entryFeedback=false;
const browsing=()=>ready&&progress===1&&!visit?.active;
// Direct seeks may arrive before the small overview models. Hold the last dry
// frame and honour the latest seek (including Home) when decoding completes.
const islandGate=.33;
let pendingIslandSeek=null,waitingForIslands=false,islandGateReleased=false;
let ready=false,progress=0,playing=null,variant='transition',meta,renderer,camera,compositor,objects,desktop,holiday,realScene,dreamScene;
let width=1,height=1,frameTimes=[],visitFrames=[],lastFrame=0,settleUntil=0;
let oceanTime=0;
let reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function status(message){$('status').textContent=message;}
function fitBookPhoto(){const [x,y,w,h]=sourceCrop(width/height);Object.assign($('book-photo').style,{width:`${100/w}%`,height:`${100/h}%`,left:`${-x/w*100}%`,top:`${-y/h*100}%`});}
function browseUI(){
 const free=browsing();
 $('explore-tools').hidden=!free;$('explore-help').hidden=!free||!!visit?.state.preparing||entryFeedback;
 $('visit-feedback').hidden=!$('explore-help').hidden;
 stage.dataset.browsing=String(free);
 if(free){
  $('phase').textContent='群岛 · 自由浏览';$('angle').hidden=true;
  canvas.setAttribute('aria-label','群岛自由浏览。拖动或用 IJKL 环顾，按住方向键或 WASD 移动，Q 下降、E 上升，滚轮或加减键推近拉远，Escape 回到全景，Home 回到实景。');
 }else if(!visit?.active){
  $('angle').hidden=false;canvas.setAttribute('aria-label','左右拖动探索书桌背面；方向键微调，Home 回到实景，End 到度假世界，空格播放或暂停');
 }
}
function visitUI(state){
 const active=state.stage!=='desk';stage.dataset.visit=state.stage;canvas.dataset.visit=state.stage;canvas.dataset.visitBusy=String(state.busy);canvas.dataset.cycles=String(state.cycles);
 canvas.setAttribute('aria-label',active?'海风书屋；拖动环顾，WASD 或方向键移动，Esc 逐步退出，阅读时 Enter 进入书页':'左右拖动探索书桌背面；方向键微调，Home 回到实景，End 到度假世界，空格播放或暂停');
 $('desk-transport').hidden=active;$('visit-transport').hidden=!active;$('visit-caption').hidden=!active;$('visit-move-pad').hidden=state.busy||!['terrace','inside'].includes(state.stage);
 $('enter-bookroom').hidden=active||progress<.97;$('enter-bookroom').disabled=state.busy||state.preparing;
 const show={door:['terrace','inside'],enter:['terrace'],read:['inside'],leave:['book'],photo:['book'],exit:['inside'],desktop:['terrace','inside','book']};
 for(const button of document.querySelectorAll('[data-visit-action]')){button.hidden=!show[button.dataset.visitAction]?.includes(state.stage);button.disabled=state.busy;}
 $('visit-door').textContent=state.doorOpen?'关上房门':'打开房门';
 for(const el of document.querySelectorAll('#desk-transport button,#desk-transport input,.inspection button,.inspection input'))el.disabled=!ready||active||state.busy;
 $('reduce-motion').setAttribute('aria-pressed',String(reduce));
 if(active){$('gesture').hidden=true;$('angle').hidden=true;$('phase').textContent={approaching:'沿海湾，走向电脑背后的书屋',terrace:'二层露台 · 绿门前',inside:'海风书屋',book:'第一页 · 故事的起点',returning:'又回到熟悉的书桌',departing:'沿原路回到群岛'}[state.stage];}
 else{$('angle').hidden=false;$('phase').textContent=sampleJourney(progress).label;$('gesture').hidden=progress>.03;}
 $('visit-hint').textContent=state.stage==='book'?'点击右页照片，走进最初的空间':state.busy?'慢慢靠近，看看这一段风景':'拖动环顾 · WASD / 方向键移动';
 browseUI();
 if(active&&!state.busy)canvas.focus({preventScroll:true});
}
function stop(cancelSeek=true){if(cancelSeek){pendingIslandSeek=null;if(!visit?.active)explore?.stop();}playing=null;$('play-icon').innerHTML='<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg>';$('play-label').textContent=progress>=1?'返回实景':'播放转场';$('play').setAttribute('aria-pressed','false');$('play').setAttribute('aria-label',progress>=1?'返回实景':'播放转场');canvas.dataset.frameTimes=JSON.stringify(frameTimes);settleUntil=performance.now()+450;}
function setProgress(value,manual=true){
  if(visit?.active&&visit.state.stage!=='returning')return;
  if(!ready||!Number.isFinite(Number(value)))return;if(manual)stop();let requested=clamp01(Number(value));
  if(requested<.97)visit?.cancelEntry();
  if(requested>0&&!holiday.islands.prepared){
    const loading=holiday.islands.prepare();
    if(requested>islandGate&&!islandGateReleased){
      pendingIslandSeek=requested;
      requested=islandGate;
      if(playing&&!playing.waitStart)playing.waitStart=performance.now();
      if(!waitingForIslands){
        waitingForIslands=true;
        const release=()=>{
          if(!waitingForIslands)return;
          islandGateReleased=true;
          if(playing?.waitStart){playing.start+=performance.now()-playing.waitStart;delete playing.waitStart;}
          waitingForIslands=false;
          const target=pendingIslandSeek;pendingIslandSeek=null;
          if(target!==null)setProgress(target,false);
        };
        const deadline=setTimeout(release,850);
        loading.then(()=>{clearTimeout(deadline);release();});
      }
    }
  }
  if(requested!==1){explore?.stop();gestures?.clear();entryFeedback=false;}
  const arriving=progress<1&&requested===1;
  const atEndpoint=progress===1||requested===1;
  progress=requested;
  settleUntil=performance.now()+450;
  const state=sampleJourney(progress),pose=cameraPose(meta.calibration.parameters,progress,width/height);
  camera.position.copy(pose.position);camera.quaternion.copy(pose.quaternion);camera.updateMatrixWorld(true);
  if(requested===1){explore.setHome(pose);$('explore-island').value='';}
  applyProjection(camera,meta.calibration.parameters,progress,width/height);holiday.update(state.time,camera,state.sea);
  $('progress').value=Math.round(progress*1000);$('progress').style.setProperty('--progress',`${progress*100}%`);
  $('phase').textContent=state.label;$('angle').textContent=`${state.angle.toFixed(0)}°`;$('elapsed').textContent=`${(progress*DURATION/1000).toFixed(1)} / 4.8 s`;
  $('gesture').hidden=progress>.03;document.querySelectorAll('[data-progress]').forEach(b=>b.setAttribute('aria-current',String(Math.abs(progress-Number(b.dataset.progress))<.01)));
  $('enter-bookroom').hidden=progress<.97;
  canvas.dataset.camera=JSON.stringify(camera.matrixWorld.toArray());canvas.dataset.projection=JSON.stringify(camera.projectionMatrix.toArray());canvas.dataset.progress=String(progress);canvas.dataset.seaAmount=String(state.sea);
  if(!playing)stop(false);
  if(visit?.active)visitUI(visit.state);else if(atEndpoint)browseUI();
  if(arriving&&embedActive&&document.activeElement?.matches('body,#play,[data-progress]'))canvas.focus({preventScroll:true});
}
async function travel(to){visit?.cancelEntry();stop();
 if(to===0&&browsing()&&explore.modified&&!reduce){if(!await explore.overview())return;}
 if(reduce){setProgress(to);return;}frameTimes=[];lastFrame=0;playing={from:progress,to,start:performance.now(),duration:Math.max(400,DURATION*Math.abs(to-progress))};$('play-icon').innerHTML='<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';$('play-label').textContent='暂停';$('play').setAttribute('aria-pressed','true');$('play').setAttribute('aria-label','暂停转场');}
function setVariant(value){if(!ready||!['transition','real','dream'].includes(value))return;stop();variant=value;document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===value)));}
function resize(){const rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);fitBookPhoto();if(!renderer)return;renderer.setSize(width,height,false);compositor?.resize(width,height);if(visit?.active)visit.resize();else if(browsing()&&explore.modified){
   explore.setHome(cameraPose(meta.calibration.parameters,1,width/height),true);
   applyProjection(camera,meta.calibration.parameters,1,width/height);settleUntil=performance.now()+450;
   canvas.dataset.projection=JSON.stringify(camera.projectionMatrix.toArray());
 }else if(ready)setProgress(progress,false);}
function updateIslands(amount,allowDetail){
  holiday.islands.update(amount,camera,height*renderer.getPixelRatio(),allowDetail,holiday.sea,reduce);
  if(browsing())for(const {root,option} of islandOptions){
    if(option.disabled===root.visible)option.disabled=!root.visible;
  }
}
function animateOcean(dt,amount){
  if(amount>0&&!reduce)oceanTime+=dt;
  holiday.animateOcean(oceanTime,amount);
}
function frame(now){
  const frameMs=now-lastTick,dt=Math.min(frameMs/1000,.05);lastTick=now;
  if(document.hidden||!embedActive)return;
  explore?.tick(dt,now);visit?.tick(dt);
  if(visit?.active){
    const phase=visit.state.stage;holiday.update(sampleJourney(progress).time,camera,phase==='returning'?0:1);
    updateIslands(phase==='returning'?0:1,false);
    animateOcean(dt,phase==='returning'?0:1);
    renderer.info.reset();
    if(phase==='returning')compositor.render(camera,sampleJourney(0),'transition',false);
    else if(['approaching','departing','terrace'].includes(phase))compositor.render(camera,sampleJourney(1),'dream',false);
    else compositor.renderVisit(camera);
    canvas.dataset.camera=JSON.stringify(camera.matrixWorld.toArray());canvas.dataset.localCamera=JSON.stringify(visit.state.localCamera);
    visitFrames.push(frameMs);if(visitFrames.length>180)visitFrames.shift();canvas.dataset.visitFrames=JSON.stringify(visitFrames);return;
  }
  const wasPlaying=!!playing;
  if(playing&&pendingIslandSeek===null){const t=clamp01((now-playing.start)/playing.duration),{from,to}=playing;setProgress(THREE.MathUtils.lerp(from,to,smooth(0,1,t)),false);if(t===1&&pendingIslandSeek===null)stop();}
  if(!ready)return;
  const journey=sampleJourney(progress),live=journey.sea>0&&!reduce&&variant!=='real';
  if(!playing&&!live&&now>settleUntil)return;
  animateOcean(variant==='real'?0:dt,journey.sea);
  // Moving water alone does not change screen-space LOD or the island poses.
  if(wasPlaying || now<=settleUntil)updateIslands(journey.sea,!playing&&variant!=='real'&&now>settleUntil-300);
  renderer.info.reset();compositor.render(camera,journey,variant,$('softness').checked&&!reduce);
  if(wasPlaying&&lastFrame){frameTimes.push(now-lastFrame);if(frameTimes.length>1000)frameTimes.shift();}lastFrame=now;
  if(wasPlaying)canvas.dataset.frameTimes=JSON.stringify(frameTimes);
}
async function boot(){
  meta=await fetch('../marble-refined-lab/assets/scene.json').then(r=>{if(!r.ok)throw Error('未找到保留的 Marble 场景记录');return r.json();});
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  realScene=new THREE.Scene();realScene.background=new THREE.Color('#bfc8c3');dreamScene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(50,1,.012,30);const p=meta.calibration.parameters;
  camera.position.set(p.x,p.y,p.z);camera.quaternion.setFromEuler(new THREE.Euler(...[p.pitch,p.yaw,p.roll].map(THREE.MathUtils.degToRad),'YXZ'));camera.updateMatrixWorld(true);
  spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:.3,enableLod:false,sortRadial:false});realScene.add(spark);
  const room=new SplatMesh({url:'../marble-refined-lab/assets/room-without-objects.spz',lod:false});room.scale.setScalar(meta.semantics_metadata.metric_scale_factor);room.rotation.x=Math.PI;room.position.y=meta.semantics_metadata.ground_plane_offset;realScene.add(room);
  const sourceCamera=camera.clone();sourceCamera.projectionMatrix.makePerspective(...projectionBounds(p,[0,0,1,1],1320,1739,sourceCamera.near),sourceCamera.near,sourceCamera.far);sourceCamera.projectionMatrixInverse.copy(sourceCamera.projectionMatrix).invert();sourceCamera.updateMatrixWorld(true);
  status('正在对齐电脑、书本和杯子…');
  const registered=createObjects(renderer,realScene,meta,sourceCamera);
  [objects,desktop,holiday]=await Promise.all([registered,createDesktop(realScene),registered.then(o=>createHoliday(dreamScene,meta,o,renderer,{
    invalidate:()=>{settleUntil=performance.now()+450;},
    report:message=>{$('island-feedback').textContent=message;$('island-retry').hidden=!message;},
  })),room.initialized]);
  realScene.environment=holiday.environment;realScene.environmentIntensity=.75;
  const realSun=holiday.sun.clone();realSun.castShadow=false;realSun.target=holiday.sun.target.clone();
  realScene.add(realSun,realSun.target,new THREE.HemisphereLight('#e3e9e6','#8d8574',1.0));
  objects.meshes.forEach(o=>o.castShadow=!['book','note'].includes(o.userData.kind));
  compositor=createCompositor(renderer,{objects:objects.group,desktop},realScene,dreamScene,holiday);resize();
  explore=createDeskExplore(camera,holiday,objects,dreamScene,{reduced:()=>reduce,changed:view=>{
    $('explore-island').value=view.focus;settleUntil=performance.now()+450;
    holiday.update(sampleJourney(1).time,camera,1);
    canvas.dataset.camera=JSON.stringify(camera.matrixWorld.toArray());
  }});
  gestures=exploreGestures(canvas,explore);
  islandOptions=holiday.islands.destinations.map(([id,{root}])=>({root,option:$('explore-island').querySelector('option[value="'+id+'"]')}));

  visit=createBookroomVisit(holiday.grotto,camera,{aspect:()=>width/height,reduced:()=>reduce,onChange:visitUI,
    onStatus:message=>{$('visit-feedback').textContent=message;entryFeedback=true;if(ready)browseUI();},
    beforeApproach:()=>{
      gestures.clear();explore.clearKeys();visitReturnView=progress===1&&explore.modified?explore.state:null;
      return visitReturnView?explore.overview():undefined;
    },
    onPhoto:opacity=>{fitBookPhoto();$('book-photo-bridge').style.opacity=String(opacity);},
    onExit:()=>{camera.up.set(0,1,0);setProgress(visitReturnProgress);if(visitReturnView&&progress===1)explore.move(visitReturnView);visitReturnView=null;},
    onReturn:async()=>{visitReturnView=null;camera.up.set(0,1,0);camera.near=.012;camera.far=30;variant='transition';setProgress(0);await spark.update({scene:realScene,camera});compositor.render(camera,sampleJourney(0),'transition',false);settleUntil=performance.now()+1200;},
  });
  status('正在准备转场画面…');
  dreamScene.add(objects.group);await renderer.compileAsync(dreamScene,camera);realScene.add(objects.group);await renderer.compileAsync(realScene,camera);
  ready=true;setProgress(0);
  await spark.update({scene:realScene,camera});
  renderer.setAnimationLoop(frame);
  // A first dream frame uploads model textures before the user can scrub there.
  renderer.shadowMap.needsUpdate=true;compositor.render(camera,sampleJourney(0),'dream');compositor.render(camera,sampleJourney(0),'real');
  settleUntil=performance.now()+1200;
  document.querySelectorAll('button:disabled,input:disabled').forEach(el=>el.disabled=false);$('loading').hidden=true;delete stage.dataset.loading;
  $('diagnostic-status').textContent='从蓝书白崖、橙书峡谷和手机潮港，可以望见电脑洞窟。绕到背后即可进入书屋。';
  canvas.dataset.island=holiday.islandSource;canvas.dataset.sceneRevision='desktop-grotto-and-three-islands';
  canvas.dataset.grottoRegistration=JSON.stringify(holiday.grotto.registration.matrix.toArray());
  if(new URLSearchParams(location.search).has('audit')){
    canvas.dataset.frontOcclusion=JSON.stringify(auditSourceOcclusion(renderer,dreamScene,objects.group,holiday.group,sourceCamera));
    canvas.dataset.sourceComposite=JSON.stringify(compositor.auditSourceFrame(camera,sampleJourney(0)));
  }
  const value=new URLSearchParams(location.search).get('progress');if(value!==null)setProgress(Number(value));
  canvas.dataset.ready='true';tellParent('book-world:ready');
  visitUI(visit.state);
}
function beginBrowseInput(){
 visit.cancelEntry();stop(false);explore.cancelMotion();
 if(entryFeedback){entryFeedback=false;browseUI();}
}
$('explore-overview').addEventListener('click',()=>{if(browsing()){beginBrowseInput();explore.overview();canvas.focus({preventScroll:true});}});
$('explore-island').addEventListener('change',e=>{if(browsing()){beginBrowseInput();explore.focus(e.target.value);canvas.focus({preventScroll:true});}});
$('island-retry').addEventListener('click',()=>holiday?.islands.retryMissing());
$('enter-bookroom').addEventListener('click',()=>{stop();if(embedded)tellParent('book-world:revisit');else{visitReturnProgress=progress;visit.start();}});
for(const button of document.querySelectorAll('[data-visit-action]'))button.addEventListener('click',()=>visit?.actions[button.dataset.visitAction]());
$('reduce-motion').addEventListener('click',()=>{reduce=!reduce;if(reduce)stop();if(visit)visitUI(visit.state);});
for(const button of document.querySelectorAll('[data-walk]')){
 button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);visit?.key(button.dataset.walk,true);});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>visit?.key(button.dataset.walk,false));
}
window.addEventListener('message',async event=>{
 if(!embedded||event.origin!==location.origin||event.source!==parent||!ready)return;
 const data=event.data;
 if(data?.type==='book-world:active'){
  embedActive=!!data.active;if(!embedActive)stop();else{settleUntil=performance.now()+1000;canvas.focus({preventScroll:true});}
 }else if(data?.type==='book-world:motion'){
  reduce=!!data.reduced;if(reduce)stop();
 }else if(data?.type==='book-world:prepare'){
  try{
   reduce=!!data.reduced;stop();variant='transition';setProgress(0);resize();
   await spark.update({scene:realScene,camera});
   compositor.render(camera,sampleJourney(0),'transition',false);
   tellParent('book-world:prepared',{id:data.id});
  }catch(error){console.error(error);tellParent('book-world:error');}
 }
});
canvas.addEventListener('webglcontextlost',()=>tellParent('book-world:error'));
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&embedded&&!visit?.active){event.preventDefault();tellParent('book-world:leave');}});
$('progress').addEventListener('input',e=>setProgress(Number(e.target.value)/1000));
$('play').addEventListener('click',()=>playing?stop():travel(progress>.995?0:1));$('home').addEventListener('click',()=>setProgress(0));
document.querySelectorAll('[data-progress]').forEach(b=>b.addEventListener('click',()=>setProgress(Number(b.dataset.progress))));
document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>setVariant(b.dataset.variant)));
$('softness').addEventListener('change',stop);
let drag=null,lastTimelineWheel=0;
canvas.addEventListener('contextmenu',e=>{if(browsing())e.preventDefault();});
canvas.addEventListener('pointerdown',e=>{
 if(!ready||visit?.busy||drag)return;
 const free=browsing();
 if(e.button!==0&&!(free&&e.button===2))return;
 canvas.focus({preventScroll:true});
 if(free){beginBrowseInput();gestures.down(e);return;}
 stop();
 drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,progress,visit:visit.active};
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(gestures?.has(e.pointerId)){if(browsing())gestures.move(e);return;}
 if(drag?.id!==e.pointerId)return;
 if(drag.visit&&visit.active)visit.rotate(e.clientX-drag.lastX,e.clientY-drag.lastY);
 else if(!drag.visit)setProgress(drag.progress-(e.clientX-drag.x)/Math.max(250,width*.72));
 drag.lastX=e.clientX;drag.lastY=e.clientY;
});
function endDrag(e){
 if(gestures?.has(e.pointerId)){if(browsing())gestures.end(e);else gestures.clear();return;}
 if(drag?.id!==e.pointerId)return;
 if(e.type==='pointerup'&&drag.visit&&visit.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5){
  const r=canvas.getBoundingClientRect();visit.click(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2));
 }
 drag=null;
}
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endDrag);
canvas.addEventListener('wheel',e=>{
 if(!ready||visit?.active)return;
 e.preventDefault();
 const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?height:1);
 if(browsing()){
  // An inertial scroll that just completed the tour should finish before zoom takes over.
  if(lastTimelineWheel&&e.timeStamp-lastTimelineWheel<140){lastTimelineWheel=e.timeStamp;return;}
  lastTimelineWheel=0;beginBrowseInput();explore.zoom(Math.exp(THREE.MathUtils.clamp(dy*.0018,-1,1)));return;
 }
 lastTimelineWheel=e.timeStamp;setProgress(progress+dy*.00065);
},{passive:false});
canvas.addEventListener('keydown',e=>{
 if(!ready)return;
 if(visit.active){const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();visit.key(key,true);}if(e.key==='Escape'){e.preventDefault();const phase=visit.state.stage;visit.actions[phase==='book'?'leave':phase==='inside'?'exit':'desktop']();}if(e.key==='Enter'&&visit.state.stage==='book'){e.preventDefault();visit.actions.photo();}return;}
 if(browsing()){
  const key=e.key.toLowerCase();
  if(isTravelKey(key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
   e.preventDefault();
   if(!e.repeat){beginBrowseInput();explore.key(key,true);}
   return;
  }
  const action={
   '+':()=>explore.zoom(.85),'=':()=>explore.zoom(.85),'-':()=>explore.zoom(1/.85),escape:()=>explore.overview()
  }[key];
  if(action){e.preventDefault();beginBrowseInput();action();return;}
 }
 if(!['ArrowLeft','ArrowRight','Home','End',' ','Enter'].includes(e.key))return;e.preventDefault();if(e.key==='Home')setProgress(0);else if(e.key==='End')setProgress(1);else if(e.key===' '||e.key==='Enter')playing?stop():travel(progress>.995?0:1);else setProgress(progress+(e.key==='ArrowRight'?.01:-.01));
});
window.addEventListener('keyup',event=>{
 const key=event.key.toLowerCase();explore?.key(key,false);visit?.key(key,false);
});
canvas.addEventListener('blur',()=>explore?.clearKeys());
window.addEventListener('blur',()=>{drag=null;gestures?.clear();explore?.clearKeys();visit?.clearKeys();});
new ResizeObserver(resize).observe(stage);document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();visit?.clearKeys();}else{lastTick=performance.now();settleUntil=lastTick+450;}});
window.__marbleTransition={setProgress,setVariant,stop,get visit(){return visit;},get grotto(){return holiday?.grotto;},get state(){return{ready,progress,variant,browsing:browsing(),playing:!!playing,...sampleJourney(progress),visit:visit?.state,camera:camera?.matrixWorld.toArray(),projection:camera?.projectionMatrix.toArray(),compositor:compositor?.stats,houseReady:holiday?.houseReady,frames:frameTimes.slice()};},get islands(){return holiday?.islands.state;},get renderer(){return renderer;},get scene(){return realScene;},get dreamScene(){return dreamScene;},get camera(){return camera;},get objects(){return objects;}};
boot().catch(error=>{console.error(error);status(`加载未完成：${error.message}。请恢复本地资产后刷新。`);$('loading').dataset.error='true';tellParent('book-world:error');});
