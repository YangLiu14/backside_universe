import * as THREE from 'three';
import {createRoom} from './room.js';
import {createHolidayWorld} from './island.js';
import {createPhotoVolume} from './photo-volume.js';
import {createSeamRenderer} from './seam.js';
import {createDeskHoliday} from './desk-holiday.js';
import {createLaptopModel} from './laptop-model.js';
import {createGeneratedFurniture} from './generated-furniture.js';
import {JOURNEY_MS,clamp01,smoothRange,sampleJourney,orbitPose,framingFov} from './journey.js';

const $=id=>document.getElementById(id);
const referenceView=new URLSearchParams(location.search).get('view')==='room';
const stage=$('experience'),canvas=$('world'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#b1bfbd');scene.fog=null;renderer.setClearColor(0x000000,0);renderer.info.autoReset=false;
const studio=new THREE.Scene();studio.background=new THREE.Color('#8e9695');
for(const [position,size,color,intensity] of [[[-3,4,-3],[8,5],'#eef4f4',2.6],[[4,1,4],[5,5],'#c8c3b7',1]]){
 const pane=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}));pane.position.set(...position);pane.lookAt(0,0,0);studio.add(pane);
}
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.12).texture;pmrem.dispose();scene.environmentIntensity=.75;
scene.add(new THREE.HemisphereLight('#e3e9e6','#8d8574',1.0));
const sun=new THREE.DirectionalLight('#f2f0e8',1.1);sun.position.set(-3,6,-4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-4,right:5,top:4,bottom:-4});sun.shadow.normalBias=.003;sun.shadow.bias=-.0001;sun.shadow.radius=3;scene.add(sun,sun.target);
const [calibration,texture]=await Promise.all([fetch('./assets/calibration.json').then(r=>r.json()),new THREE.TextureLoader().loadAsync('./assets/desk-original.jpg')]);
texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const original=new THREE.PerspectiveCamera(calibration.fov,calibration.width/calibration.height,.01,80);original.position.fromArray(calibration.position);original.quaternion.fromArray(calibration.quaternion);original.updateMatrixWorld();
const loader=new THREE.TextureLoader(),assets={};
await Promise.all(Object.entries({screen:'laptop-screen',deck:'laptop-deck',book:'book-cover',desk:'desk-surface',window:'window-surface',memo:'memo-paper',wood:'cabinet-wood',orange:'orange-book'}).map(async([key,file])=>{const t=await loader.loadAsync('./assets/objects/'+file+'.png');if(key!=='foreground')t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();assets[key]=t;}));
[assets.laptopFit,assets.cupFit,assets.furnitureFit,assets.detailFit]=await Promise.all(['laptop-fit','cup-fit','furniture-fit','desk-details-fit'].map(f=>fetch('./assets/'+f+'.json').then(r=>r.json())));
const camera=original.clone(),room=createRoom(scene,original,texture,assets);room.photoPlane.visible=false;
const volume=await createPhotoVolume(original,texture,room.point);
const island=await createHolidayWorld(THREE,room.worldParent,{islandUrl:'./assets/holiday-island.glb'});
const holiday=createDeskHoliday(scene,room,texture);const [,,laptopModel,furnitureModels]=await Promise.all([island.ready,holiday.ready,createLaptopModel(scene,room,assets.laptopFit),createGeneratedFurniture(scene,room)]);
// Fixed geometry, including solid rear shells, supplies all side/back views.
// The photograph is retired before side/back views; it is never a backdrop at 90–180°.
room.cup.rotation.y=room.frontAngle+Math.PI;room.worldParent.scale.setScalar(.10);
const seam=createSeamRenderer(renderer,{discoveryGroups:[holiday.group,island.group],shadowLight:sun});
const center=new THREE.Vector3(.94,.23,-.29);
const homeTarget=original.position.clone().addScaledVector(original.getWorldDirection(new THREE.Vector3()),original.position.distanceTo(center));
const aim=new THREE.Vector3(),focusPoint=new THREE.Vector3(),tempCamera=new THREE.PerspectiveCamera();
const initialRadius=original.position.distanceTo(center);
let width=1,height=1,progress=referenceView?1:0,target=progress,playing=false,animation=null,motion=!reduced&&!referenceView,clock=0,last=performance.now(),lastRendered=-1;
let dragging=false,pinchDistance=0;const pointers=new Map();
const frameTimes=[];let lastRecord=0;
function resize(){width=stage.clientWidth;height=stage.clientHeight;renderer.setSize(width,height,false);seam.resize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();lastRendered=-1;}
new ResizeObserver(resize).observe(stage);resize();
// Compile/upload before starting the 4.5s clock, not at the first reveal frame.
holiday.update(0,1);await Promise.all([renderer.compileAsync(scene,camera),renderer.compileAsync(volume.scene,camera)]);
renderer.shadowMap.needsUpdate=true;seam.render(volume.scene,scene,camera,sampleJourney(.72),10,reduced);holiday.update(0,0);
function playLabel(){const text=playing?'暂停转场':progress>.995?'重看转场':'播放转场';if($('play').getAttribute('aria-label')===text&&$('play').hasAttribute('aria-pressed'))return;$('play').setAttribute('aria-label',text);$('play').title=text;$('play').setAttribute('aria-pressed',String(playing));$('play').innerHTML=playing?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>';}
function stop(){animation=null;playing=false;target=progress;playLabel();}
function travel(to){stop();if(reduced){progress=target=to;return;}animation={from:progress,to,start:performance.now(),duration:JOURNEY_MS*Math.max(.08,Math.abs(to-progress))};playing=true;playLabel();}
function play(){if(playing){stop();return;}if(progress>.995)progress=target=0;travel(1);}
function scrub(value){stop();target=clamp01(value);}
$('play').addEventListener('click',play);$('explore').addEventListener('click',play);$('home').addEventListener('click',()=>{if(referenceView){stop();progress=target=progress>0?0:1;lastRendered=-1;}else travel(0);});
$('timeline').addEventListener('input',e=>scrub(Number(e.target.value)/1000));
canvas.addEventListener('pointerdown',e=>{if(referenceView)return;stop();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragging=true;canvas.classList.add('dragging');if(pointers.size===2){const a=[...pointers.values()];pinchDistance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const previous=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const a=[...pointers.values()],distance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(pinchDistance>0)target=clamp01(target+Math.log(distance/pinchDistance)*.75);pinchDistance=distance;}else{target=clamp01(target-(e.clientX-previous.x)/Math.min(width*.72,850));}});
function endPointer(e){pointers.delete(e.pointerId);pinchDistance=0;if(!pointers.size){dragging=false;canvas.classList.remove('dragging');}}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',endPointer);
canvas.addEventListener('wheel',e=>{if(referenceView)return;e.preventDefault();const current=target;stop();target=clamp01(current+e.deltaY*.00065);},{passive:false});
canvas.addEventListener('keydown',e=>{if(referenceView){if(e.key===' '||e.key==='Enter'){e.preventDefault();$('home').click();}return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(e.key))return;e.preventDefault();if(e.key==='Home')travel(0);else if(e.key==='End')travel(1);else if(e.key==='Enter'||e.key===' ')play();else scrub(target+(['ArrowRight','ArrowUp'].includes(e.key)?.035:-.035));});
$('about-button').addEventListener('click',()=>{$('about').hidden=!$('about').hidden;$('about-button').setAttribute('aria-expanded',String(!$('about').hidden));});
function closeAbout(){$('about').hidden=true;$('about-button').setAttribute('aria-expanded','false');$('about-button').focus();}
$('about-close').addEventListener('click',closeAbout);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('about').hidden)closeAbout();});
function motionLabel(){$('motion').setAttribute('aria-pressed',String(motion));$('motion').setAttribute('aria-label',motion?'暂停海面动态':'开启海面动态');$('motion').title=motion?'暂停海面动态':'开启海面动态';$('motion').innerHTML=motion?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>';}
$('motion').addEventListener('click',()=>{motion=!motion;motionLabel();});motionLabel();playLabel();
let audio,volumeGain,audioOn=false;
$('sound').addEventListener('click',async()=>{try{if(!audio){audio=new AudioContext();const buffer=audio.createBuffer(1,audio.sampleRate*18,audio.sampleRate),data=buffer.getChannelData(0);let noise=0;for(let i=0;i<data.length;i++){noise=(noise+.025*(Math.random()*2-1))/1.025;data[i]=noise*(.6+.4*Math.sin(i/audio.sampleRate*.47));}const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;const low=audio.createBiquadFilter();low.type='lowpass';low.frequency.value=850;volumeGain=audio.createGain();volumeGain.gain.value=0;source.connect(low).connect(volumeGain).connect(audio.destination);source.start();}await audio.resume();audioOn=!audioOn;volumeGain.gain.setTargetAtTime(audioOn?.28:0,audio.currentTime,.6);$('sound').setAttribute('aria-pressed',String(audioOn));$('sound').setAttribute('aria-label',audioOn?'关闭海浪声':'开启海浪声');}catch{$('sound').title='声音暂不可用';}});
$('retry').addEventListener('click',()=>location.reload());
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();last=performance.now();});
let lastTitle='';
function render(now){requestAnimationFrame(render);if(document.hidden)return;const elapsed=now-last,dt=Math.min(elapsed/1000,.05);last=now;renderer.info.reset();
  if(animation){const t=clamp01((now-animation.start)/animation.duration);progress=THREE.MathUtils.lerp(animation.from,animation.to,t);target=progress;if(t===1){animation=null;playing=false;playLabel();}}
  else{progress=THREE.MathUtils.lerp(progress,target,reduced?1:1-Math.exp(-dt*(dragging?22:16)));if(Math.abs(progress-target)<.0001)progress=target;}
  const state=sampleJourney(progress),portrait=width/height<.9;
  if(referenceView)Object.assign(state,{seam:progress>0?1:0,holiday:0,title:0,turn:0,approach:0,aim:0,framing:0});
  const pose=orbitPose(state,original.position.toArray(),center.toArray(),portrait);
  camera.position.fromArray(pose.position);aim.copy(homeTarget).lerp(center,state.aim);tempCamera.position.copy(camera.position);tempCamera.lookAt(aim);camera.quaternion.copy(original.quaternion).slerp(tempCamera.quaternion,state.aim);
  const ratio=calibration.width/calibration.height,fit=Math.max(1,ratio/(width/height));
  const homeFov=2*Math.atan(Math.tan(THREE.MathUtils.degToRad(calibration.fov/2))*fit)*180/Math.PI;
  camera.fov=framingFov(state,homeFov,initialRadius,pose.radius,portrait);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const focusDepth=-focusPoint.copy(center).applyMatrix4(camera.matrixWorldInverse).z;
  // Cutaway room walls stop occluding the tabletop when the camera goes behind them.
  for(const wall of room.windowObjects)wall.visible=camera.position.z>-1.15;
  room.sideWall.visible=camera.position.x<3.65;
  room.poster.visible=room.sideWall.visible;
  for(const arm of room.armObjects)arm.visible=true;
  if(motion)clock+=dt;island.update(clock);island.setLight(.5+state.holiday*.25);holiday.update(clock,state.holiday);
  sun.intensity=1.1;
  if(progress!==0||lastRendered!==0){if(referenceView){seam.renderReference(scene,camera);}else seam.render(volume.scene,scene,camera,state,focusDepth,reduced);lastRendered=progress;}
  const photo=$('photograph');photo.style.opacity=progress===0?'1':'0';
  const marginX=Math.max(0,(width-height*ratio)/2),marginY=Math.max(0,(height-width/ratio)/2),clip=referenceView?1:1-smoothRange(progress,0,.26);
  $('scene-wrap').style.clipPath=`inset(${marginY*clip}px ${marginX*clip}px)`;
  $('intro').style.opacity=String(1-smoothRange(progress,0,.15));$('intro').style.visibility=progress>.16?'hidden':'visible';
  $('island-message').style.opacity=String(state.title);
  const degrees=Math.round(state.turn*180);
  $('timeline').value=String(Math.round(progress*1000));$('timeline').setAttribute('aria-valuetext',`${degrees}度，${state.seam<1?'照片进入空间':degrees<100?'绕过物件侧面':'背后的度假世界'}`);
  $('elapsed').textContent=degrees+'° · '+(progress*JOURNEY_MS/1000).toFixed(1)+' / 4.5 s';
  const title=progress<.12?'一张日常照片':state.seam<1?'靠近桌面':degrees<100?'绕过物件侧面':'原来，背面是一片海';if(title!==lastTitle){$('view-label').textContent=title;lastTitle=title;}
  stage.dataset.stage=progress===0?'photo':degrees>160?'backside':'transition';stage.dataset.progress=progress.toFixed(4);stage.dataset.angle=String(degrees);stage.dataset.asset=island.source;stage.dataset.depth='da3';
  if(referenceView){$('view-label').textContent=progress>0?'3D还原 · 原照机位':'原照片';const label=progress>0?'查看原照片':'查看3D还原';$('home').querySelector('span').textContent=label;$('home').setAttribute('aria-label',label);$('home').title=label;}
  playLabel();if(now-lastRecord>250){frameTimes.push(elapsed);if(frameTimes.length>120)frameTimes.shift();lastRecord=now;}
}
// Read-only QA telemetry; interaction tests use the same public slider as visitors.
window.backsideDiagnostics=()=>({progress,target,playing,referenceView,transition:{...sampleJourney(progress),...seam.stats},depth:volume.fit,details:{...room.details.measurements,armVisible:room.details.arm.visible},furnitureModels,furniture:{chairPosition:room.chair.position.toArray(),chairYaw:room.chair.rotation.y,chairFront:room.chair.userData.front,notePosition:room.note.position.toArray(),noteRotation:room.note.rotation.toArray().slice(0,3),sideboardPosition:room.sideboard.position.toArray(),sideboardYaw:room.sideboard.rotation.y,sideboardVisible:room.sideboard.visible},laptop:{source:laptopModel.source,bounds:laptopModel.bounds,triangles:laptopModel.triangles,base:room.laptopPoints.map(v=>v.toArray()),screen:room.screenPoints.map(v=>v.toArray()),fit:assets.laptopFit.rms},asset:island.source,cottage:holiday.cottageReady,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),center:center.toArray(),fov:camera.fov,angle:referenceView?0:sampleJourney(progress).turn*180},photoContribution:1-sampleJourney(progress).seam,discovery:referenceView?0:sampleJourney(progress).holiday,render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},frameMs:frameTimes.slice()});
$('asset-credit').textContent=Object.values(furnitureModels).every(m=>m.source==='hi3d')?'原照在本机用 SAM 2.1 分割。电脑、椅子、台灯和书上小物件由 Hi3D 生成后校准；纸页和台灯材质经过修正。长臂灯、手机与耳机按原照补建；隐藏面仍有近似。':laptopModel.source==='hi3d'?'原照在本机用 SAM 2.1 分割，电脑由 Hi3D 生成后重新标定。书封保留原图纹理，桌面遮挡区经过补绘。':'原照在本机用 SAM 2.1 分割，电脑使用校准几何和原图纹理。Hi3D 景观与实时海水组成桌面假期。';
if(referenceView){for(const element of [$('intro'),$('island-message'),document.querySelector('.scrubber'),$('motion'),$('sound'),$('elapsed')])element.hidden=true;canvas.setAttribute('aria-label','固定原照机位的三维还原对照。点击右下角按钮或按空格切换原照片和3D。');canvas.style.cursor='default';$('home').querySelector('span').style.display='inline';$('loading').hidden=true;}
$('loading').classList.add('done');$('explore').disabled=false;$('play').disabled=false;$('timeline').disabled=false;last=performance.now();requestAnimationFrame(render);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stop();$('error').hidden=false;});
