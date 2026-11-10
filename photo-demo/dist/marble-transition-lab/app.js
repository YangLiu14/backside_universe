import {t,sourceText,onLanguageChange} from '../i18n/core.js';
import {createModelPreparation} from '../cinema/prepare-model.js';
import {createJoysticks} from '../cinema/joysticks.js';
import {onRoomVisibility,roomVisible,resizeScreen} from '../cinema/room.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createDeskModelLoader} from './model-loader.js';
import {SparkRenderer} from '@sparkjsdev/spark';
import {loadMarbleRoom} from '../marble-detail/room.js';
import {projectionBounds} from '../marble-lab/camera.js';
import {createObjects,createDesktop} from './objects.js';
import {createHoliday} from './holiday.js';
import {auditSourceOcclusion} from './hidden-world.js';
import {createCompositor} from './compositor.js';
import {initialDaylight} from './lamp-sun.js';
import {DURATION,clamp01,smooth,sampleJourney,cameraPose,applyProjection,sourceCrop} from './journey.js';
import {createDeskExplore,exploreGestures,isTravelKey} from './desk-explore.js';
import {approachPath,createBookroomVisit} from './bookroom-visit.js';

import {createStoryTour} from './story-tour.js';
import {islandCrossing} from './island-crossing.js';
import {createCupHarbor} from './cup-harbor.js';
import {createLoadingProgress} from './loading-progress.js';

const $=id=>document.getElementById(id),canvas=$('world'),stage=$('stage');
const loadingProgress=createLoadingProgress();
const joysticks=createJoysticks(stage);
const embedded=new URLSearchParams(location.search).get('portal')==='book'&&parent!==window;
document.body.classList.toggle('book-portal',embedded);
let embedActive=!embedded,spark,visit,islandVisit,cupHarbor,lastTick=performance.now();
const tellParent=(type,detail={})=>{if(embedded)parent.postMessage({type,...detail},location.origin);};
let visitReturnProgress=1,visitReturnView,explore,gestures,islandOptions,entryFeedback=false;
let officeCollider,walker=null,walkRequest=null,walkOrigin=null,walkDrag=null;
const browsing=()=>ready&&progress===1&&!visit?.active&&!islandVisit?.active&&!walkOrigin;
let ready=false,progress=0,playing=null,variant='transition',meta,modelLoader,renderer,camera,compositor,objects,desktop,holiday,realScene,dreamScene;
let width=1,height=1,frameTimes=[],visitFrames=[],lastFrame=0,settleUntil=0;
onLanguageChange(()=>{settleUntil=performance.now()+500;});
let oceanTime=0;
let reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function status(message){loadingProgress.phase(message);}
function fitBookPhoto(){const [x,y,w,h]=sourceCrop(width/height);Object.assign($('book-photo').style,{width:`${100/w}%`,height:`${100/h}%`,left:`${-x/w*100}%`,top:`${-y/h*100}%`});}
const storyEntries={'blue-book':'走到白崖望远镜前','orange-book':'走近峡谷里的书签',phone:'走到手机静音键旁'};
const storyVisits=new Map();
let guideIslandFactory;
let guideArrival=null,crossingFrame=null;
const tour=createStoryTour({
  bar:$('story-tour'),button:$('tour-next'),exit:$('tour-exit'),position:$('tour-position'),title:$('tour-title'),label:$('tour-label'),
  location(){
    const room=visit?.state;
    return {ready,embedded,cycles:room?.cycles||0,busy:!!room?.busy,
      id:islandVisit?.active?(islandVisit.id||'cup'):visit?.active?'grotto':null,
      phase:islandVisit?.active?islandVisit.phase:room?.stage};
  },
  open:openTourStop,
  act(command){
    if(command==='fold')cupHarbor.fold();
    else if(command==='release')cupHarbor.release();
    else if(command==='sight')islandVisit.action(cupHarbor.boatAtSea);
    else if(command==='action')islandVisit.action();
    else visit.actions[command]();
  },
  onExit(){visit?.cancelEntry();canvas.focus({preventScroll:true});},
});
tour.refresh();
const destinationButtons=new Map([...document.querySelectorAll('[data-destination]')].map(button=>[button.dataset.destination,button]));
const walkPlaces=new Map([['office','3DGS 工位']]);
for(const [id,entry] of destinationButtons){
  const name=sourceText(entry.textContent);
  walkPlaces.set(id,name);
  const button=document.createElement('button');
  button.type='button';button.dataset.walkPlace=id;button.textContent=name;
  $('walk-islands').append(button);
}
let selectedDestination='',walkPreparation=null;

function showDirectory(open){
  $('destination-list').hidden=!open;
  $('destination-toggle').setAttribute('aria-expanded',String(open));
}
function updateIslandEntrances(){
  const id=selectedDestination;
  const show=browsing()&&variant!=='real'&&!tour.active;
  const portalDoor=embedded&&(!id||id==='grotto')&&progress>=.97&&!visit?.active&&!islandVisit?.active;
  const story=id==='cup'?'走到蓝杯海滩':storyEntries[id];
  $('destination-card').hidden=!(show&&id&&(!embedded||story)||portalDoor);
  $('destination-name').textContent=destinationButtons.get(id||'grotto')?.textContent||'';
  $('walk-start').hidden=!show||!id||embedded;
  $('walk-start').firstElementChild.textContent=t(id==='reef'?'潜入海底':'上岛游玩');
  $('enter-bookroom').hidden=!(show&&id==='grotto'||portalDoor);
  $('enter-island-story').hidden=!show||!story;
  if(story)$('enter-island-story').textContent=t(story);
  for(const [key,button] of destinationButtons)button.setAttribute('aria-pressed',String(key===id));
}
function selectDestination(id=''){
  if(!$('destination-list').hidden)showDirectory(false);
  if(selectedDestination===id)return;
  cancelWalkPreparation();
  selectedDestination=id;
  updateIslandEntrances();
  if(id&&!embedded&&browsing()&&!tour.active&&variant!=='real')prepareLanding(id);
}
function browseUI(){
 const free=browsing();
 if(!free)showDirectory(false);
 updateIslandEntrances();
 $('office-walk').hidden=!ready||progress!==0||embedded||tour.active;
 $('daylight-tools').hidden=!free||variant==='real';
 $('explore-tools').hidden=!free;$('explore-help').hidden=!free||!!visit?.state.preparing||entryFeedback;
 $('visit-feedback').hidden=!$('explore-help').hidden;
 stage.dataset.browsing=String(free);
 if(free){
  $('phase').textContent='点选景点，探索群岛';$('angle').hidden=true;
  canvas.setAttribute('aria-label','群岛自由浏览。拖动或用 IJKL 环顾，按住方向键或 WASD 移动，Q 下降、E 上升，滚轮或加减键推近拉远，Escape 回到全景，Home 回到实景。');
 }else if(!visit?.active){
  $('angle').hidden=false;canvas.setAttribute('aria-label','左右拖动探索书桌背面；方向键微调，Home 回到实景，End 到度假世界，空格播放或暂停');
 }
}
function visitUI(state){
 if(state.stage!=='desk'||state.preparing)cancelWalkPreparation();
 const active=state.stage!=='desk';stage.dataset.visit=state.stage;canvas.dataset.visit=state.stage;canvas.dataset.visitBusy=String(state.busy);canvas.dataset.cycles=String(state.cycles);
 canvas.setAttribute('aria-label',active?'海风书屋；拖动环顾，WASD 或方向键移动，Esc 逐步退出，阅读时 Enter 进入书页':'左右拖动探索书桌背面；方向键微调，Home 回到实景，End 到度假世界，空格播放或暂停');
 $('desk-transport').hidden=active;$('visit-transport').hidden=!active;$('visit-caption').hidden=!active;$('visit-move-pad').hidden=state.busy||!['terrace','inside'].includes(state.stage);
 $('enter-bookroom').disabled=state.busy||state.preparing;
 const show={door:['terrace','inside'],enter:['terrace'],read:['inside'],leave:['book'],photo:['book'],exit:['inside'],desktop:['terrace','inside','book']};
 for(const button of document.querySelectorAll('[data-visit-action]')){button.hidden=!show[button.dataset.visitAction]?.includes(state.stage);button.disabled=state.busy;}
 $('visit-door').textContent=state.doorOpen?'关上房门':'打开房门';
 for(const el of document.querySelectorAll('#desk-transport button,#desk-transport input,.inspection button,.inspection input'))el.disabled=!ready||active||state.busy;
 $('reduce-motion').setAttribute('aria-pressed',String(reduce));
 if(active){$('gesture').hidden=true;$('angle').hidden=true;$('phase').textContent={approaching:'沿海湾，走向电脑背后的书屋',terrace:'二层露台 · 绿门前',inside:'海风书屋',book:'第一页 · 故事的起点',returning:'又回到熟悉的书桌',departing:'沿原路回到群岛'}[state.stage];}
 else{$('angle').hidden=false;$('phase').textContent=sampleJourney(progress).label;$('gesture').hidden=progress>.03;}
 $('visit-hint').textContent=state.stage==='book'?'点击右页照片，走进最初的空间':state.busy?'慢慢靠近，看看这一段风景':matchMedia('(any-pointer: coarse)').matches?'左摇杆移动，右摇杆环顾。':'拖动环顾 · WASD / 方向键移动';
 browseUI();
 tour.refresh();
 if(active&&!state.busy&&!tour.active)canvas.focus({preventScroll:true});
}
function stop(stopExplore=true){if(stopExplore&&!visit?.active)explore?.stop();playing=null;$('play-icon').innerHTML='<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg>';$('play-label').textContent=progress>=1?'返回实景':progress>0?'继续放映':'开始放映';$('play').setAttribute('aria-pressed','false');$('play').setAttribute('aria-label',progress>=1?'返回实景':progress>0?'继续放映':'开始放映');canvas.dataset.frameTimes=JSON.stringify(frameTimes);settleUntil=performance.now()+450;}
function setProgress(value,manual=true){
  if(walkOrigin||islandVisit?.active)return;
  if(visit?.active&&visit.state.stage!=='returning')return;
  if(!ready||!Number.isFinite(Number(value)))return;if(manual)stop();const requested=clamp01(Number(value));
  if(requested<.97)visit?.cancelEntry();
  if(requested!==1){explore?.stop();gestures?.clear();entryFeedback=false;}
  const arriving=progress<1&&requested===1;
  const atEndpoint=progress===1||requested===1;
  progress=requested;
  stage.toggleAttribute('data-cover',progress===0);
  settleUntil=performance.now()+450;
  const state=sampleJourney(progress),pose=cameraPose(meta.calibration.parameters,progress,width/height);
  camera.position.copy(pose.position);camera.quaternion.copy(pose.quaternion);camera.updateMatrixWorld(true);
  if(requested===1)explore.setHome(pose);
  if(requested!==1||arriving)selectDestination();
  applyProjection(camera,meta.calibration.parameters,progress,width/height);holiday.update(state.time,camera,state.sea);
  if(manual)holiday.daylight.invalidateShadows();
  $('progress').value=Math.round(progress*1000);$('progress').style.setProperty('--progress',`${progress*100}%`);
  $('phase').textContent=state.label;$('angle').textContent=`${state.angle.toFixed(0)}°`;$('elapsed').textContent=`${(progress*DURATION/1000).toFixed(1)} / 4.8 s`;
  $('gesture').hidden=progress>.03;document.querySelectorAll('[data-progress]').forEach(b=>b.setAttribute('aria-current',String(Math.abs(progress-Number(b.dataset.progress))<.01)));
  $('office-walk').hidden=progress!==0||embedded||tour.active;
  if(embedded)updateIslandEntrances();
  canvas.dataset.camera=JSON.stringify(camera.matrixWorld.toArray());canvas.dataset.projection=JSON.stringify(camera.projectionMatrix.toArray());canvas.dataset.progress=String(progress);canvas.dataset.seaAmount=String(state.sea);
  if(!playing)stop(false);
  if(visit?.active)visitUI(visit.state);else if(atEndpoint)browseUI();
  if(arriving)guideArrival?.();
  if(arriving&&embedActive&&document.activeElement?.matches('body,#play,[data-progress]'))canvas.focus({preventScroll:true});
}
async function travel(to){visit?.cancelEntry();stop();
 if(to===0&&browsing()&&explore.modified&&!reduce){if(!await explore.overview())return;}
 if(reduce){setProgress(to);return;}frameTimes=[];lastFrame=0;playing={from:progress,to,start:performance.now(),duration:Math.max(400,DURATION*Math.abs(to-progress))};$('play-icon').innerHTML='<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';$('play-label').textContent='暂停';$('play').setAttribute('aria-pressed','true');$('play').setAttribute('aria-label','暂停转场');}
function setVariant(value){if(!ready||walkOrigin||islandVisit?.active||!['transition','real','dream'].includes(value))return;stop();variant=value;browseUI();document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===value)));}
function resize(){const rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);fitBookPhoto();if(!renderer)return;resizeScreen(renderer,width,height);compositor?.resize(width,height);if(walkOrigin){
   if(walker)walker.tick(0);
   else {
     const preview=walkOrigin.clone();
     applyProjection(preview,meta.calibration.parameters,progress,width/height);
     compositor.render(preview,sampleJourney(progress),progress===0?'real':'dream',false);
   }
   return;
 }if(visit?.active)visit.resize();else if(islandVisit?.active||(browsing()&&explore.modified)){
   explore.setHome(cameraPose(meta.calibration.parameters,1,width/height),true);
   applyProjection(camera,meta.calibration.parameters,1,width/height);settleUntil=performance.now()+450;
   canvas.dataset.projection=JSON.stringify(camera.projectionMatrix.toArray());
 }else if(ready)setProgress(progress,false);}
function updateIslands(amount){
  if(holiday.islands.update(amount,holiday.sea,reduce))holiday.daylight.invalidateShadows();
  if(guideIslandFactory&&storyVisits.size<holiday.islands.destinations.length){
    for(const [id,berth] of holiday.islands.destinations){
      if(berth.landed&&!storyVisits.has(id))getIslandStory(id,guideIslandFactory).prepare(false);
    }
  }
  if(browsing())for(const {root,option} of islandOptions){
    if(option.disabled===root.visible)option.disabled=!root.visible;
  }
}
function animateOcean(dt,amount){
  if(amount>0&&!reduce)oceanTime+=dt;
  holiday.animateOcean(oceanTime,amount);
  cupHarbor?.updateDrift(reduce?0:dt,oceanTime,amount);
}
function frame(now){
  const frameMs=now-lastTick,dt=Math.min(frameMs/1000,.05);lastTick=now;
  if(!roomVisible()||!embedActive)return;
  const owner = walkOrigin ? (walker && !walker.busy ? walker : null)
    : visit?.canWalk ? visit : browsing() && !tour.active && !playing ? explore : null;
  const sticks = joysticks.activate(owner);
  if(walkOrigin){
    if(!walker)return; // Hold the current view while the collision worker builds the landing.
    walker.tick(dt,sticks);renderer.info.reset();
    if(walker?.scene){renderer.setRenderTarget(null);renderer.render(walker.scene,camera);return;}
    if(stage.dataset.walk==='office'){compositor.render(camera,sampleJourney(0),'real',false);return;}
    animateOcean(dt,1);holiday.update(sampleJourney(1).time,camera,1);updateIslands(1);
    holiday.legacy.visible=false;
    if(stage.dataset.walk==='reef')compositor.render(camera,sampleJourney(1),'dream',false);
    else compositor.renderVisit(camera);
    return;
  }
  if(islandVisit?.active){
    animateOcean(dt,1);
    const changed=islandVisit.tick(dt,oceanTime);
    const transit=crossingFrame?.(dt);
    if(!changed&&!transit&&now>settleUntil)return;
    holiday.update(sampleJourney(1).time,camera,1);
    updateIslands(1);
    if(islandVisit.id==='blue-book')$('scope-lens').style.opacity=String(islandVisit.lens*(1-(transit?.withdrawal||0)));
    renderer.info.reset();
    if(islandVisit.ashore||tour.active){
      if(islandVisit.ashore||islandVisit.id)holiday.legacy.visible=false;
      compositor.renderVisit(camera);
    }
    else compositor.render(camera,sampleJourney(1),'dream',false);
    canvas.dataset.camera=JSON.stringify(camera.matrixWorld.toArray());return;
  }
  if (owner === explore && sticks && (sticks.move.x || sticks.move.y || sticks.look.x || sticks.look.y)) {
    visit?.cancelEntry();
    explore.steer(dt,sticks);
  }
  explore?.tick(dt,now);visit?.tick(dt,owner===visit ? sticks : null);
  if(visit?.active){
    const phase=visit.state.stage;holiday.update(sampleJourney(progress).time,camera,phase==='returning'?0:1);
    updateIslands(phase==='returning'?0:1);
    animateOcean(dt,phase==='returning'?0:1);
    renderer.info.reset();
    if(phase==='returning')compositor.render(camera,sampleJourney(0),'transition',false);
    else if(tour.active&&['approaching','terrace'].includes(phase)){holiday.legacy.visible=false;compositor.renderVisit(camera);}
    else if(['approaching','departing','terrace'].includes(phase))compositor.render(camera,sampleJourney(1),'dream',false);
    else compositor.renderVisit(camera);
    canvas.dataset.camera=JSON.stringify(camera.matrixWorld.toArray());canvas.dataset.localCamera=JSON.stringify(visit.state.localCamera);
    visitFrames.push(frameMs);if(visitFrames.length>180)visitFrames.shift();canvas.dataset.visitFrames=JSON.stringify(visitFrames);return;
  }
  // A hidden tab pauses playback; resume the guided crossing on its next visible frame.
  if(guideArrival&&!playing&&progress!==1)travel(1);
  const wasPlaying=!!playing;
  if(playing){const t=clamp01((now-playing.start)/playing.duration),{from,to}=playing;setProgress(THREE.MathUtils.lerp(from,to,smooth(0,1,t)),false);if(t===1)stop();}
  if(!ready)return;
  const journey=sampleJourney(progress),live=journey.sea>0&&!reduce&&variant!=='real';
  if(!playing&&!live&&now>settleUntil)return;
  animateOcean(variant==='real'?0:dt,journey.sea);
  // Moving water alone does not change the registered island poses.
  if(wasPlaying || now<=settleUntil)updateIslands(journey.sea);
  renderer.info.reset();compositor.render(camera,journey,variant,$('softness').checked&&!reduce);
  if(wasPlaying&&lastFrame){frameTimes.push(now-lastFrame);if(frameTimes.length>1000)frameTimes.shift();}lastFrame=now;
  if(wasPlaying)canvas.dataset.frameTimes=JSON.stringify(frameTimes);
}
async function boot(){
  meta=await fetch('../marble-refined-lab/assets/scene.json').then(r=>{if(!r.ok)throw Error('未找到保留的 Marble 场景记录');return r.json();});
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  realScene=new THREE.Scene();realScene.background=new THREE.Color('#bfc8c3');dreamScene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(50,1,.012,30);const p=meta.calibration.parameters;
  camera.position.set(p.x,p.y,p.z);camera.quaternion.setFromEuler(new THREE.Euler(...[p.pitch,p.yaw,p.roll].map(THREE.MathUtils.degToRad),'YXZ'));camera.updateMatrixWorld(true);
  spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:.3,enableLod:false,sortRadial:false});realScene.add(spark);
  const originalRoom = '../marble-refined-lab/assets/room-without-objects.spz';
  const baseline = new URLSearchParams(location.search).get('detail') === '0';
  const loadRoom = path => loadMarbleRoom(path, meta.semantics_metadata, loadingProgress.download);
  const roomReady = (baseline ? loadRoom(originalRoom) :
    loadRoom('../marble-detail/assets/room-detail.spz').catch(() => loadRoom(originalRoom)))
    .then(room => {realScene.add(room);status('正在搭建桌面与群岛…');});
  const sourceCamera=camera.clone();sourceCamera.projectionMatrix.makePerspective(...projectionBounds(p,[0,0,1,1],1320,1739,sourceCamera.near),sourceCamera.near,sourceCamera.far);sourceCamera.projectionMatrixInverse.copy(sourceCamera.projectionMatrix).invert();sourceCamera.updateMatrixWorld(true);
  status('正在对齐电脑、书本和杯子…');
  modelLoader=await createDeskModelLoader();
  const registered=createObjects(renderer,realScene,meta,sourceCamera,modelLoader,!baseline);
  [objects,desktop,holiday]=await Promise.all([registered,createDesktop(realScene),registered.then(o=>createHoliday(dreamScene,meta,o,renderer,modelLoader,{
    prepareGPU:createModelPreparation(renderer,model=>compositor.compileModel(model,camera)),
    invalidate:()=>{settleUntil=performance.now()+450;},
    report:message=>{$('island-feedback').textContent=message;$('island-retry').hidden=!message;},
  })),roomReady]);
  realScene.environment=holiday.environment;realScene.environmentIntensity=.75;
  const realSun=holiday.sun.clone();realSun.castShadow=false;realSun.target=holiday.sun.target.clone();
  realScene.add(realSun,realSun.target,new THREE.HemisphereLight('#e3e9e6','#8d8574',1.0));
  objects.meshes.forEach(o=>o.castShadow=!['book','note'].includes(o.userData.kind));
  compositor=createCompositor(renderer,{objects:objects.group,desktop},realScene,dreamScene,holiday);resize();
  explore=createDeskExplore(camera,holiday,objects,dreamScene,{reduced:()=>reduce,changed:()=>{
    settleUntil=performance.now()+450;
    holiday.update(sampleJourney(1).time,camera,1);
    canvas.dataset.camera=JSON.stringify(camera.matrixWorld.toArray());
  }});
  gestures=exploreGestures(canvas,explore,id=>{
    if(variant!=='real'&&!tour.active)selectDestination(id);
  });
  islandOptions=holiday.islands.destinations.map(([id,{root}])=>({root,option:destinationButtons.get(id)}));

  visit=createBookroomVisit(holiday.grotto,camera,{aspect:()=>width/height,reduced:()=>reduce,onChange:visitUI,
    onStatus:message=>{$('visit-feedback').textContent=message;entryFeedback=true;if(ready)browseUI();},
    beforeApproach:fromWalk=>{
      gestures.clear();explore.clearKeys();visitReturnView=progress===1&&explore.modified?explore.state:null;
      return visitReturnView&&!tour.active&&!fromWalk?explore.overview():undefined;
    },
    onPhoto:opacity=>{fitBookPhoto();$('book-photo-bridge').style.opacity=String(opacity);},
    onExit:()=>{camera.up.set(0,1,0);setProgress(visitReturnProgress);if(visitReturnView&&progress===1)explore.move(visitReturnView);visitReturnView=null;},
    onReturn:async()=>{visitReturnView=null;camera.up.set(0,1,0);camera.near=.012;camera.far=30;variant='transition';setProgress(0);await spark.update({scene:realScene,camera});compositor.render(camera,sampleJourney(0),'transition',false);settleUntil=performance.now()+1200;},
  });
  status('正在准备转场画面…');
  holiday.islands.prepare();
  dreamScene.add(objects.group);await renderer.compileAsync(dreamScene,camera);realScene.add(objects.group);await renderer.compileAsync(realScene,camera);
  ready=true;setProgress(0);
  await spark.update({scene:realScene,camera});
  onRoomVisibility(active=>renderer.setAnimationLoop(active?frame:null));
  // Draw the revealed coast while the loading cover is still up. Use its real
  // camera, materials and shadow passes, then restore the source before paint.
  const back=sampleJourney(.75),preview=camera.clone();
  const pose=cameraPose(p,back.progress,width/height);
  preview.position.copy(pose.position);preview.quaternion.copy(pose.quaternion);
  preview.updateMatrixWorld(true);applyProjection(preview,p,back.progress,width/height);
  holiday.update(back.time,preview,back.sea);holiday.animateOcean(0,back.sea);
  updateIslands(back.sea);renderer.shadowMap.needsUpdate=true;
  compositor.render(preview,back,'dream');
  const front=sampleJourney(0);
  holiday.update(front.time,camera,0);holiday.animateOcean(0,0);updateIslands(0);
  compositor.render(camera,front,'real');
  settleUntil=performance.now()+1200;
  document.querySelectorAll('button:disabled,input:disabled').forEach(el=>el.disabled=false);loadingProgress.finish();delete stage.dataset.loading;
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
  if(!embedded&&new URLSearchParams(location.search).get('tour')==='start')$('tour-next').click();
}
function islandVisitUI(phase,hint){
  settleUntil=performance.now()+300;
  const active=phase!=='desk';
  if(active)cancelWalkPreparation();
  stage.dataset.harbor=phase;
  stage.dataset.islandStory=active?(islandVisit.id||'cup'):'';
  $('scope-lens').hidden=!(active&&islandVisit.id==='blue-book');
  $('scope-optics').hidden=phase!=='looking';
  if(phase==='looking')showScopePower(islandVisit.magnification);
  $('port-sound').hidden=!(active&&islandVisit.audio);
  soundUI();
  $('harbor-controls').hidden=!active;
  $('harbor-ending').hidden=phase!=='farewell';
  $('harbor-hint').textContent=hint;
  const action=islandVisit.id?islandVisit.actionLabel:({note:'折成纸船',boat:'推向海面'}[phase]);
  $('harbor-action').hidden=!active||!action;
  if(action)$('harbor-action').textContent=action;
  $('harbor-controls').setAttribute('aria-label',islandVisit.id?islandVisit.label:'蓝杯港湾');
  document.querySelector('.inspection').hidden=active;
  tour.refresh();
  if(!active){visitUI(visit.state);return;}
  browseUI();
  for(const id of ['desk-transport','enter-bookroom','visit-feedback','angle'])$(id).hidden=true;
  $('phase').textContent=islandVisit.id?islandVisit.label:'蓝杯港湾';canvas.setAttribute('aria-label',islandVisit.label);
}
function enterCup(){
  if(!browsing()||variant==='real')return false;
  beginBrowseInput();gestures.clear();explore.clearKeys();
  cupHarbor??=createCupHarbor({cup:objects.group.getObjectByName('cup-wall'),holiday,scene:dreamScene,camera,canvas,
    reduced:()=>reduce,changed:islandVisitUI,returned:returnToIslands});
  islandVisit=cupHarbor;islandVisit.enter();applyProjection(camera,meta.calibration.parameters,1,width/height);
  if(!tour.active)canvas.focus({preventScroll:true});
  return true;
}
function returnToIslands(){
  applyProjection(camera,meta.calibration.parameters,1,width/height);
  explore.resume();if(!tour.active)canvas.focus({preventScroll:true});
}
function getIslandStory(id,createIslandVisit){
  if(!storyVisits.has(id)){
    const island=holiday.islands.destinations.find(([key])=>key===id)[1].root;
    // A just-retried GLB may not have drawn its first frame. Ground picking
    // needs the entire model in its final world pose before building the visit.
    island.updateWorldMatrix(true,true);
    storyVisits.set(id,createIslandVisit({id,island,holiday,scene:dreamScene,camera,canvas,reduced:()=>reduce,changed:islandVisitUI,returned:returnToIslands}));
  }
  return storyVisits.get(id);
}
function startIslandStory(destination,landed=false){
  islandVisit=destination;islandVisit.enter(landed);
  if(!tour.active)canvas.focus({preventScroll:true});
}
function crossToIslands(signal){
  if(progress===1)return;
  return new Promise(resolve=>{
    function arrived(){
      guideArrival=null;signal.removeEventListener('abort',cancel);resolve();
    }
    function cancel(){stop();arrived();}
    guideArrival=arrived;signal.addEventListener('abort',cancel,{once:true});travel(1);
  });
}
// The existing render loop owns the camera and keeps the sea and the departing
// island alive throughout the crossing. Cancelling returns control to that visit.
async function sailToIsland(id,landing,signal){
  const source=islandVisit,start=camera.clone();
  const advance=islandCrossing(camera,source,id,explore.bounds,landing,()=>width/height);
  let cancel;
  try{
    const dissolve=await new Promise(resolve=>{
      cancel=()=>resolve(false);
      signal.addEventListener('abort',cancel,{once:true});
      crossingFrame=dt=>{
        const sample=advance(reduce?0:dt);
        if(reduce||sample.done)resolve(reduce);
        return sample;
      };
    });
    if(dissolve&&!signal.aborted){
      // A visitor can request less motion in mid-flight. Hold the last
      // painted pose while it fades, even as the source story keeps ticking.
      crossingFrame=()=>advance(0);
      const still=document.createElement('canvas');
      still.width=canvas.width;still.height=canvas.height;
      still.getContext('2d').drawImage(canvas,0,0);
      const lens=$('scope-lens').cloneNode(true);lens.removeAttribute('id');
      $('crossing-veil').replaceChildren(still,lens);
      await fadeCrossing(0,1,signal);
      if(!signal.aborted)advance(Infinity);
    }
    return dissolve;
  }finally{
    crossingFrame=null;signal.removeEventListener('abort',cancel);
    if(signal.aborted){
      camera.position.copy(start.position);camera.quaternion.copy(start.quaternion);
      camera.fov=start.fov;camera.near=start.near;camera.aspect=width/height;camera.updateProjectionMatrix();
      if(source===cupHarbor)applyProjection(camera,meta.calibration.parameters,1,camera.aspect);
      camera.updateMatrixWorld(true);source.withdraw?.(0);settleUntil=performance.now()+450;
    }
  }
}
async function fadeCrossing(from,to,signal){
  const veil=$('crossing-veil');
  const fade=veil.animate([{opacity:from},{opacity:to}],{duration:280,easing:'ease-in-out',fill:'forwards'});
  const cancel=()=>fade.cancel();
  signal.addEventListener('abort',cancel,{once:true});
  try{await fade.finished;veil.style.opacity=String(to);}
  catch(error){if(!signal.aborted)throw error;}
  finally{signal.removeEventListener('abort',cancel);fade.cancel();}
}
async function openTourStop(id,signal){
  if(variant!=='transition')setVariant('transition');
  await crossToIslands(signal);
  if(signal.aborted)return;
  if(id==='cup'){
    // Set the fixtures on the registered shores during the first wide view,
    // including islands that finish loading later on a slow connection.
    const module=await import('./island-visit.js');
    if(signal.aborted)return;
    guideIslandFactory=module.createIslandVisit;updateIslands(1);
    if(!enterCup())throw Error('蓝杯入口尚未准备好');
    return;
  }
  // Keep the previous stop usable until the destination assets are ready.
  const room=id==='grotto';
  if(room)await holiday.grotto.prepareVisit();
  else await holiday.islands.prepareDestination(id);
  if(signal.aborted)return;
  let destination;
  try{
    let landing;
    if(room){
      const grotto=holiday.grotto;
      grotto.closeView(true);
      const [,bay,balcony,eye]=approachPath(grotto,camera.position);
      landing=()=>({via:[bay,balcony],eye,target:grotto.toWorld(grotto.entryTarget),fov:88,fit:false,near:.00001});
    }else{
      updateIslands(1);
      destination=getIslandStory(id,guideIslandFactory);
      landing=destination.prepare();
    }
    stage.dataset.crossing=id;
    const dissolve=await sailToIsland(id,landing,signal);
    if(signal.aborted)return;
    const landed=camera.clone();
    islandVisit.leave();
    gestures.clear();explore.stop();
    // The bookroom still needs a desk pose for its independent reverse walk.
    const desk=room?{position:camera.position.clone(),quaternion:camera.quaternion.clone(),near:camera.near,
      fov:THREE.MathUtils.radToDeg(2*Math.atan(1/camera.projectionMatrix.elements[5]))}:null;
    camera.position.copy(landed.position);camera.quaternion.copy(landed.quaternion);
    camera.fov=landed.fov;camera.aspect=width/height;
    if(room)camera.near=landed.near;
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    if(destination)startIslandStory(destination,true);
    else{
      visitReturnProgress=progress;await visit.start(desk);
      if(!signal.aborted&&visit.state.stage!=='terrace')throw Error('未能抵达书屋露台');
    }
    if(dissolve&&!signal.aborted)await fadeCrossing(1,0,signal);
  }finally{
    if(!room&&!destination?.active)destination?.stopPreview();
    if(room&&!visit.active)holiday.grotto.closeView(false);
    delete stage.dataset.crossing;$('crossing-veil').style.opacity='0';$('crossing-veil').replaceChildren();
  }
}
$('enter-island-story').addEventListener('click',async()=>{
  const id=selectedDestination;
  if(id==='cup'){enterCup();return;}
  if(!storyEntries[id]||!browsing()||variant==='real')return;
  beginBrowseInput();gestures.clear();explore.clearKeys();
  try{
    const [{createIslandVisit}]=await Promise.all([import('./island-visit.js'),holiday.islands.prepareDestination(id)]);
    if(tour.active||!browsing()||variant==='real'||selectedDestination!==id||visit.state.preparing)return;
    updateIslands(1);
    startIslandStory(getIslandStory(id,createIslandVisit));
  }catch(err){entryFeedback=true;$('visit-feedback').textContent='这座岛的故事未能载入，再点入口即可重试。';browseUI();console.error(err);}
});
function showScopePower(value){
  const slider=$('scope-power');
  slider.value=String(value);slider.setAttribute('aria-valuetext',value+' 倍');
  slider.style.setProperty('--progress',((value-slider.min)/(slider.max-slider.min)*100)+'%');
  $('scope-reading').value=value+'×';
}
$('scope-power').addEventListener('input',event=>{
  if(!islandVisit?.active||islandVisit.phase!=='looking')return;
  islandVisit.setMagnification(event.target.valueAsNumber);
  showScopePower(islandVisit.magnification);
});
function soundUI(){
  const on=!!islandVisit?.audio?.on;
  $('port-sound').setAttribute('aria-pressed',String(on));$('port-sound').textContent=on?'关闭港湾环境声':'开启港湾环境声';
}
$('port-sound').addEventListener('click',()=>{islandVisit?.audio?.toggle();soundUI();});
$('harbor-action').addEventListener('click',()=>{
  if(islandVisit?.id)islandVisit.action();else if(islandVisit?.phase==='note')islandVisit.fold();else if(islandVisit?.phase==='boat')islandVisit.release();
  canvas.focus({preventScroll:true});
});
$('harbor-exit').addEventListener('click',()=>islandVisit?.leave());
function setDaylight(phase){
  if(!browsing()||variant==='real')return;
  holiday.daylight.setPhase(phase);
  showDaylight(phase);settleUntil=performance.now()+450;
}
function showDaylight(phase){
  const minutes=360+Math.round(720*phase);
  const time=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  $('lamp-time').value=time;$('lamp-position').value=String(Math.round(phase*1000));
  $('lamp-position').setAttribute('aria-valuetext',time);
}
showDaylight(initialDaylight);
$('lamp-position').addEventListener('input',e=>{if(browsing()){beginBrowseInput();setDaylight(Number(e.target.value)/1000);}});
function beginBrowseInput(){
 visit.cancelEntry();stop(false);explore.cancelMotion();
 if(entryFeedback){entryFeedback=false;browseUI();}
}
function roomUI(){
 const info=walker?.info,sights=$('walk-sights');
 sights.hidden=!info||info.inside;
 $('walk-room-exit').hidden=!info?.inside;
 $('walk-story').hidden=!!info?.inside;
 if(!info)return;
 for(const button of sights.children){
   const atDoor=info.key===button.dataset.sight&&info.near;
   if(atDoor)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
   button.setAttribute('aria-disabled',String(info.busy));
   button.querySelector('.sight-action').textContent=atDoor?'进入参观':'前往门口';
 }
 $('walk-room-exit').disabled=info.busy;$('walk-story').disabled=info.busy;
 $('phase').textContent=info.inside?info.name:walkPlaces.get(walker.id)+' · 漫步';
 const touch=matchMedia('(pointer:coarse)').matches;
 let hint=touch?'左摇杆移动，右摇杆环顾。':'WASD 或方向键步行，拖动或 IJKL 环顾。';
 if(info.inside)hint=touch?'走出门口即可返回岛上。':'步行探索，走出门口或按 Esc 返回岛上。';
 else if(info.near)hint=touch?'点门或点「进入参观」。':'点门或按 E 进入。';
 $('walk-hint').textContent=info.notice||hint;
 stage.dataset.room=info.inside?info.key:'';
}
function showWalkPlaces(open){
 $('walk-islands').hidden=!open;
 $('walk-place').setAttribute('aria-expanded',String(open));
}
function discardWalk(){
 walker?.clear();walker?.dispose?.();walker=null;
 delete stage.dataset.room;roomUI();
}
function leaveWalk(){
 if(!walkOrigin)return;
 walkRequest?.abort();walkRequest=null;cancelWalkPreparation();discardWalk();
 $('landing-status').hidden=true;
 if(walkDrag&&canvas.hasPointerCapture(walkDrag.id))canvas.releasePointerCapture(walkDrag.id);
 walkDrag=null;
 camera.near=walkOrigin.near;camera.far=walkOrigin.far;camera.fov=walkOrigin.fov;walkOrigin=null;
 delete stage.dataset.walk;$('walk-tools').hidden=true;
 if(progress===0)setProgress(0,false);else returnToIslands();
 visitUI(visit.state);settleUntil=performance.now()+450;
 canvas.focus({preventScroll:true});
}
// The selection and its entry button share one cancellable landing calculation.
function cancelWalkPreparation(){
  walkPreparation?.controller.abort();
  walkPreparation=null;
}
function prepareLanding(id){
  if(walkPreparation?.id===id)return walkPreparation;
  cancelWalkPreparation();
  const controller=new AbortController();
  const job={id,controller};
  walkPreparation=job;
  job.ready=buildLanding(id,controller.signal).catch(error=>{
    if(walkPreparation===job)walkPreparation=null;
    throw error;
  });
  // A speculative selection can fail before anyone presses the entry button.
  job.ready.catch(()=>{});
  return job;
}
async function buildLanding(id,signal){
  // Let the destination card or feedback paint before touching any geometry.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(signal.aborted)return;
  const {createIslandWalk}=await import('./island-walk.js');
  if(signal.aborted)return;
  let model,frame,spawn,storyFactory,surfaceOverride;
  if(id==='office'){
   officeCollider??=new GLTFLoader().loadAsync('../marble-lab/assets/world-collider.glb').then(({scene})=>{
    scene.rotation.x=Math.PI;scene.scale.setScalar(meta.semantics_metadata.metric_scale_factor);
    scene.position.y=meta.semantics_metadata.ground_plane_offset;scene.updateMatrixWorld(true);return scene;
   }).catch(error=>{officeCollider=null;throw error;});
   model=await officeCollider;
   const c=meta.calibration.parameters;
   spawn={start:new THREE.Vector3(c.x,c.y-1.62,c.z),aim:new THREE.Vector3(c.x,0,c.z-2),pitch:-.30};
  }else if(id==='reef')model=holiday.ocean.root;
  else if(id==='cup')model=holiday.group.getObjectByName('Hi3D miniature holiday island');
  else if(id==='grotto'){
   model=holiday.grotto.root;surfaceOverride=await holiday.grotto.prepareWalkSurface();
  }
  else{
   const [{createIslandVisit}]=await Promise.all([import('./island-visit.js'),holiday.islands.prepareDestination(id)]);
   if(signal.aborted)return;
   updateIslands(1);
   const berth=holiday.islands.destinations.find(([key])=>key===id)[1];
   frame=berth.root;model=berth.exterior;storyFactory=createIslandVisit;
  }
  if(signal.aborted)return;
  const sea=id==='office'||id==='reef'?()=>-Infinity:holiday.surface;
  const walk=await createIslandWalk({id,model,frame,camera,spawn,sea,surfaceOverride,aspect:()=>width/height,reduced:()=>reduce,signal});
  if(signal.aborted)return;
  return {walk,model,frame,storyFactory};
}
async function startWalk(id){
 if(!ready||embedded||tour.active||visit.active)return;
 if(id==='office'?progress!==0:progress!==1||variant==='real')return;
 islandVisit?.leave();beginBrowseInput();gestures.clear();explore.clearKeys();
 walkOrigin??=camera.clone();walkRequest?.abort();
 const token=new AbortController();walkRequest=token;discardWalk();
 const {signal}=token;
 stage.dataset.walk=id;stage.dataset.browsing='false';$('walk-tools').hidden=false;$('walk-story').disabled=true;
 showWalkPlaces(false);
 $('walk-place-name').textContent=walkPlaces.get(id);
 $('walk-place').disabled=id==='office';
 for(const button of $('walk-islands').children)button.disabled=button.dataset.walkPlace===id;
 $('walk-story').textContent=({grotto:'走进书屋',reef:'回到海面',office:'绕到群岛'})[id]||'体验本站故事';
 $('walk-exit').textContent=id==='office'?'返回工位全景':'返回群岛';
 $('landing-name').textContent=walkPlaces.get(id);
 $('landing-status').hidden=false;$('walk-hint').textContent='';$('visit-move-pad').hidden=true;
 $('phase').textContent='第一人称漫步';$('angle').hidden=true;$('explore-help').hidden=true;
 canvas.setAttribute('aria-label','第一人称漫步。WASD 或方向键步行，拖动或 IJKL 环顾，Esc 返回全景。');
 try{
  const job=prepareLanding(id);
  const landing=await job.ready;
  if(signal.aborted||!landing)return;
  walkPreparation=null;
  const {walk,model,frame,storyFactory}=landing;
  if(storyFactory)getIslandStory(id,storyFactory).prepare(false);
  if(id==='office'||id==='reef')walker=walk;
  else{
   const {withIslandDoors}=await import('./island-doors.js');if(signal.aborted)return;
   let bookroom;
   if(id==='grotto'){
    const g=holiday.grotto,sill=model.worldToLocal(g.toWorld(new THREE.Vector3(.043,.038,-.684)));
    const lintel=model.worldToLocal(g.toWorld(new THREE.Vector3(.043,.142,-.684)));
    bookroom={sill:sill.toArray(),height:lintel.y-sill.y,enter:async()=>{
     const position=camera.position.clone(),rotation=camera.quaternion.clone();
     leaveWalk();camera.position.copy(position);camera.quaternion.copy(rotation);camera.updateMatrixWorld(true);
     visitReturnProgress=1;await visit.start(null,true);
     if(visit.state.stage==='terrace')await visit.actions.enter();
    }};
   }
   walker=withIslandDoors({outside:walk,frame:frame||model,camera,world:dreamScene,renderer,aspect:()=>width/height,reduced:()=>reduce,
    dayColor:holiday.daylight.color,modelLoader,bookroom,changed:roomUI,veil:value=>{$('room-veil').style.opacity=String(value);}});
  }
  walker.tick(0);$('landing-status').hidden=true;$('visit-move-pad').hidden=false;$('walk-story').disabled=false;
  $('phase').textContent=walkPlaces.get(id)+' · 漫步';
  $('walk-hint').textContent=matchMedia('(pointer:coarse)').matches?'左摇杆移动，右摇杆环顾。':'WASD 或方向键步行，拖动或 IJKL 环顾。';
  $('walk-sights').replaceChildren(...(walker.rooms||[]).map(room=>{
    const button=$('walk-sight-template').content.firstElementChild.cloneNode(true);
    button.dataset.sight=room.key;button.querySelector('strong').textContent=room.name;
    return button;
  }));
  roomUI();
  canvas.focus({preventScroll:true});
 }catch(error){if(!signal.aborted){leaveWalk();entryFeedback=true;browseUI();$('visit-feedback').textContent='步行入口未能打开。请重新选择岛屿后再试。';console.error(error);}}
}
$('office-walk').addEventListener('click',()=>startWalk('office'));
$('walk-start').addEventListener('click',()=>{
 if(selectedDestination&&browsing())startWalk(selectedDestination);
});
$('harbor-walk').addEventListener('click',()=>startWalk(islandVisit?.id||'cup'));
$('walk-place').addEventListener('click',()=>showWalkPlaces($('walk-islands').hidden));
$('walk-islands').addEventListener('click',event=>{
 const button=event.target.closest('[data-walk-place]');
 if(button)startWalk(button.dataset.walkPlace);
});
$('walk-sights').addEventListener('click',event=>{
 const button=event.target.closest('[data-sight]'),info=walker?.info;
 if(!button||!info||info.busy||info.inside)return;
 if(info.near&&info.key===button.dataset.sight){
   walker.action();canvas.focus({preventScroll:true});
 }else{
   walker.approach(button.dataset.sight);
   if(event.detail)canvas.focus({preventScroll:true});
 }
});
$('walk-room-exit').addEventListener('click',()=>{walker?.action?.();canvas.focus({preventScroll:true});});
$('walk-exit').addEventListener('click',leaveWalk);
$('walk-story').addEventListener('click',()=>{
 if(!walker)return;
 const {id}=walker,position=camera.position.clone(),rotation=camera.quaternion.clone();
 leaveWalk();if(id==='office'){travel(1);return;}if(id==='reef'){explore.overview();return;}
 camera.position.copy(position);camera.quaternion.copy(rotation);camera.fov=66;camera.aspect=width/height;
 camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 if(id==='grotto'){visitReturnProgress=1;visit.start(null,true);}
 else if(id==='cup')enterCup();
 else startIslandStory(storyVisits.get(id));
});
function returnToOverview(){
  beginBrowseInput();selectDestination();explore.overview();canvas.focus({preventScroll:true});
}
$('explore-overview').addEventListener('click',()=>{if(browsing())returnToOverview();});
$('destination-toggle').addEventListener('click',()=>showDirectory($('destination-list').hidden));
$('destination-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-destination]');
  if(!button||!browsing())return;
  const id=button.dataset.destination;
  beginBrowseInput();selectDestination(id);explore.focus(id);
  const next=$('walk-start').hidden?canvas:$('walk-start');
  next.focus({preventScroll:true});
});
document.addEventListener('pointerdown',event=>{
  if(!$('destination-list').hidden&&!event.target.closest('#explore-tools'))showDirectory(false);
  if(!$('walk-islands').hidden&&!event.target.closest('#walk-place,#walk-islands'))showWalkPlaces(false);
});
$('explore-tools').addEventListener('focusout',event=>{
  if(!event.currentTarget.contains(event.relatedTarget))showDirectory(false);
});
$('explore-tools').addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('destination-list').hidden){
    event.preventDefault();event.stopPropagation();showDirectory(false);$('destination-toggle').focus();
  }
});
$('island-retry').addEventListener('click',()=>holiday?.islands.retryMissing());
$('enter-bookroom').addEventListener('click',()=>{stop();if(embedded)tellParent('book-world:revisit');else{visitReturnProgress=progress;visit.start();}});
for(const button of document.querySelectorAll('[data-visit-action]'))button.addEventListener('click',()=>visit?.actions[button.dataset.visitAction]());
$('reduce-motion').addEventListener('click',()=>{reduce=!reduce;if(walkOrigin){$('reduce-motion').setAttribute('aria-pressed',String(reduce));return;}if(reduce)stop();if(islandVisit?.active)$('reduce-motion').setAttribute('aria-pressed',String(reduce));else if(visit)visitUI(visit.state);});
for(const button of document.querySelectorAll('[data-walk]')){
 button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);if(walker)walker.key(button.dataset.walk,true);else visit?.key(button.dataset.walk,true);});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{walker?.key(button.dataset.walk,false);visit?.key(button.dataset.walk,false);});
}
window.addEventListener('message',async event=>{
 if(!embedded||event.origin!==location.origin||event.source!==parent||!ready)return;
 const data=event.data;
 if(data?.type==='book-world:active'){
  embedActive=!!data.active;if(!embedActive){joysticks.activate(null);stop();islandVisit?.audio?.stop();soundUI();}else{settleUntil=performance.now()+1000;canvas.focus({preventScroll:true});}
 }else if(data?.type==='book-world:motion'){
  reduce=!!data.reduced;if(reduce)stop();
 }else if(data?.type==='book-world:prepare'){
  try{
   islandVisit?.leave();reduce=!!data.reduced;stop();variant='transition';setProgress(0);resize();
   await spark.update({scene:realScene,camera});
   compositor.render(camera,sampleJourney(0),'transition',false);
   tellParent('book-world:prepared',{id:data.id});
  }catch(error){console.error(error);tellParent('book-world:error');}
 }
});
canvas.addEventListener('webglcontextlost',()=>tellParent('book-world:error'));
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&walkOrigin&&!$('walk-islands').hidden){
   event.preventDefault();event.stopImmediatePropagation();showWalkPlaces(false);$('walk-place').focus();return;
 }
 if(event.key==='Escape'&&walkOrigin){event.preventDefault();event.stopImmediatePropagation();if(!walker?.escape?.())leaveWalk();return;}
 if(event.key==='Escape'&&tour.active){event.preventDefault();event.stopPropagation();tour.end();}
},true);
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&islandVisit?.active){event.preventDefault();islandVisit.leave();return;}if(event.key==='Escape'&&embedded&&!visit?.active){event.preventDefault();tellParent('book-world:leave');}});
$('progress').addEventListener('input',e=>setProgress(Number(e.target.value)/1000));
$('play').addEventListener('click',()=>playing?stop():travel(progress>.995?0:1));$('home').addEventListener('click',()=>setProgress(0));
document.querySelectorAll('[data-progress]').forEach(b=>b.addEventListener('click',()=>setProgress(Number(b.dataset.progress))));
document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>setVariant(b.dataset.variant)));
$('softness').addEventListener('change',stop);
let drag=null,lastTimelineWheel=0;
canvas.addEventListener('contextmenu',e=>{if(browsing())e.preventDefault();});
canvas.addEventListener('pointerdown',e=>{
 if(tour.moving)return;
 if(walkOrigin){
  if(walker&&e.button===0&&!walkDrag){walkDrag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);}
  return;
 }
 if(islandVisit?.active){islandVisit.down(e);return;}
 if(!ready||visit?.busy||drag)return;
 const free=browsing();
 if(e.button!==0&&!(free&&e.button===2))return;
 canvas.focus({preventScroll:true});
 if(free){
  beginBrowseInput();
  const rect=canvas.getBoundingClientRect();
  if(variant!=='real'&&e.isPrimary&&e.button===0&&!e.shiftKey&&holiday.canGrabLamp(camera,rect,e.clientX,e.clientY,e.pointerType==='touch')){
    explore.clearKeys();drag={id:e.pointerId,lamp:holiday.daylight.dragStart(camera,rect,e.clientX,e.clientY)};
    canvas.setPointerCapture(e.pointerId);canvas.classList.add('moving-lamp');return;
  }
  gestures.down(e);return;
 }
 stop();
 drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,progress,visit:visit.active};
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(walkOrigin){if(walker&&walkDrag?.id===e.pointerId){walkDrag.moved||=Math.hypot(e.clientX-walkDrag.startX,e.clientY-walkDrag.startY)>5;walker.look(e.clientX-walkDrag.x,e.clientY-walkDrag.y);walkDrag.x=e.clientX;walkDrag.y=e.clientY;}return;}
 if(islandVisit?.active){islandVisit.move(e);return;}
 if(gestures?.has(e.pointerId)){if(browsing())gestures.move(e);return;}
 if(drag?.id!==e.pointerId)return;
 if(drag.lamp){setDaylight(drag.lamp(e.clientX,e.clientY));return;}
 if(drag.visit&&visit.active)visit.rotate(e.clientX-drag.lastX,e.clientY-drag.lastY);
 else if(!drag.visit)setProgress(drag.progress-(e.clientX-drag.x)/Math.max(250,width*.72));
 drag.lastX=e.clientX;drag.lastY=e.clientY;
});
function endDrag(e){
 if(walkOrigin){if(walkDrag?.id===e.pointerId){
   if(e.type==='pointerup'&&!walkDrag.moved){const rect=canvas.getBoundingClientRect();walker?.hitDoor?.(new THREE.Vector2((e.clientX-rect.x)*2/rect.width-1,1-(e.clientY-rect.y)*2/rect.height));}
   walkDrag=null;
 }return;}
 if(islandVisit?.active){islandVisit.end(e);return;}
 if(gestures?.has(e.pointerId)){if(browsing())gestures.end(e);else gestures.clear();return;}
 if(drag?.id!==e.pointerId)return;
 if(e.type==='pointerup'&&drag.visit&&visit.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5){
  const r=canvas.getBoundingClientRect();visit.click(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2));
 }
 drag=null;canvas.classList.remove('moving-lamp');
}
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endDrag);
canvas.addEventListener('wheel',e=>{
 if(tour.moving||walkOrigin){e.preventDefault();return;}
 if(!ready||visit?.active||islandVisit?.active)return;
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
 if(!ready||tour.moving)return;
 if(walkOrigin){const k=e.key.toLowerCase();if(k==='e'&&walker?.action){e.preventDefault();if(!e.repeat)walker.action();}else if(isTravelKey(k)){e.preventDefault();walker?.key(k,true);}return;}
 if(islandVisit?.active){
   if(islandVisit.id&&e.key.startsWith('Arrow')){e.preventDefault();islandVisit.key(e.key);return;}
   if(['Enter',' '].includes(e.key)){e.preventDefault();if(!e.repeat)$('harbor-action').click();}
   return;
 }
 if(visit.active){const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();visit.key(key,true);}if(e.key==='Escape'){e.preventDefault();const phase=visit.state.stage;visit.actions[phase==='book'?'leave':phase==='inside'?'exit':'desktop']();}if(e.key==='Enter'&&visit.state.stage==='book'){e.preventDefault();visit.actions.photo();}return;}
 if(browsing()){
  const key=e.key.toLowerCase();
  if(isTravelKey(key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
   e.preventDefault();
   if(!e.repeat){beginBrowseInput();explore.key(key,true);}
   return;
  }
  const action={
   '+':()=>explore.zoom(.85),'=':()=>explore.zoom(.85),'-':()=>explore.zoom(1/.85),escape:returnToOverview
  }[key];
  if(action){e.preventDefault();beginBrowseInput();action();return;}
 }
 if(!['ArrowLeft','ArrowRight','Home','End',' ','Enter'].includes(e.key))return;e.preventDefault();if(e.key==='Home')setProgress(0);else if(e.key==='End')setProgress(1);else if(e.key===' '||e.key==='Enter')playing?stop():travel(progress>.995?0:1);else setProgress(progress+(e.key==='ArrowRight'?.01:-.01));
});
window.addEventListener('keyup',event=>{
 const key=event.key.toLowerCase();walker?.key(key,false);explore?.key(key,false);visit?.key(key,false);
});
canvas.addEventListener('blur',()=>{walker?.clear();explore?.clearKeys();});
window.addEventListener('blur',()=>{walker?.clear();walkDrag=null;islandVisit?.cancelHand();drag=null;canvas.classList.remove('moving-lamp');gestures?.clear();explore?.clearKeys();visit?.clearKeys();});
new ResizeObserver(resize).observe(stage);onRoomVisibility(active=>{if(!active){if(!walkOrigin)cancelWalkPreparation();walker?.clear();walkDrag=null;stop();visit?.clearKeys();islandVisit?.cancelHand();islandVisit?.audio?.stop();soundUI();}else{lastTick=performance.now();settleUntil=lastTick+450;}});
window.__marbleTransition={setProgress,setVariant,stop,get visit(){return visit;},get grotto(){return holiday?.grotto;},get state(){return{ready,progress,variant,walk:walker?.state||null,browsing:browsing(),playing:!!playing,...sampleJourney(progress),visit:visit?.state,camera:camera?.matrixWorld.toArray(),projection:camera?.projectionMatrix.toArray(),compositor:compositor?.stats,houseReady:holiday?.houseReady,frames:frameTimes.slice()};},get islands(){return holiday?.islands.state;},get renderer(){return renderer;},get scene(){return realScene;},get dreamScene(){return dreamScene;},get camera(){return camera;},get objects(){return objects;}};
boot().catch(error=>{console.error(error);loadingProgress.fail();tellParent('book-world:error');});
