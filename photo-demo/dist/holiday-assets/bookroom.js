import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {buildInterior,P,room,eyeHeight} from './bookroom-interior.js';
import {planWalk} from './bookroom-navigation.js';
import {sourceCrop} from '../marble-transition-lab/journey.js';
import {createBookPortal} from './bookroom-portal.js';
import {bookView} from './bookroom-book.js';
const $=id=>document.getElementById(id),host=$('scene');
const grotto=new URLSearchParams(location.search).get('island')!=='v3';
const layout=grotto?await fetch('assets/bookroom/grotto-layout.json').then(r=>{if(!r.ok)throw Error('书屋布局未能载入');return r.json();}):null;
const frameTransform=new THREE.Matrix4();
if(layout){const {scale:s,translation:t}=layout.worldFromRoom;frameTransform.compose(P(...t),new THREE.Quaternion(),new THREE.Vector3(s[0],s[2],s[1]));}
const versionLink=$('island-version');versionLink.href=grotto?'?island=v3':'bookroom.html';versionLink.textContent=grotto?'对比旧版书屋':'返回洞窟书屋';
$('back-to-island').href=grotto?'laptop-unified.html':'laptop-spatial.html';$('back-to-island').textContent=grotto?'← 回到洞窟':'← 回到原版小岛';
const inverseFrame=frameTransform.clone().invert();
const toWorld=p=>p.clone().applyMatrix4(frameTransform),toRoom=p=>p.clone().applyMatrix4(inverseFrame);
const terraceX=layout?.terraceX??.043,terraceY=layout?.terraceY??.751,terraceMaxY=layout?.terraceMaxY??.784,openAngle=layout?.doorOpenAngle??Math.PI*.57;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e6df');
const camera=new THREE.PerspectiveCamera(44,1,.001,30),worldCamera=new THREE.PerspectiveCamera(44,1,.001,30);
const worldDirection=new THREE.Vector3();
function syncCamera(){worldCamera.position.copy(toWorld(camera.position));worldCamera.up.copy(camera.up).transformDirection(frameTransform);camera.getWorldDirection(worldDirection);worldCamera.lookAt(toWorld(camera.position.clone().add(worldDirection)));worldCamera.fov=camera.fov;worldCamera.aspect=camera.aspect;worldCamera.updateProjectionMatrix();worldCamera.updateMatrixWorld();}
const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();scene.environment=pmrem.fromScene(environment,.04).texture;scene.environmentIntensity=.32;environment.dispose();pmrem.dispose();
const sun=new THREE.DirectionalLight('#fff2d8',2.2);sun.position.set(.3,1.3,-.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1.2,right:1.2,top:1.2,bottom:-1.2,near:.01,far:4});sun.shadow.bias=-.0001;sun.shadow.normalBias=.0002;scene.add(sun,new THREE.HemisphereLight('#c2daea','#78684b',.65));
const loader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('../vendor/draco/'));
const center=layout?toRoom(P(...layout.overviewWorldTarget)):P(0,.30,-.04);let orbit=layout?{yaw:.35,pitch:.18,distance:2.0}:{yaw:.62,pitch:.43,distance:1.95};
let interior,ready=false,busy=false,stage='overview',doorOpen=false,yaw=Math.PI,pitch=0,drag=null,lastTime=performance.now();
let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,tween=null;
const keys=new Set(),touchMoves=new Set();
const startPose=()=>{camera.up.set(0,1,0);camera.fov=44;camera.updateProjectionMatrix();camera.position.copy(center).add(new THREE.Vector3(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),-Math.cos(orbit.yaw)*Math.cos(orbit.pitch)).multiplyScalar(orbit.distance*(grotto?Math.max(1,1/camera.aspect):1)));camera.lookAt(center);};startPose();
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(stage==='overview')startPose();if(stage==='book'&&!busy&&interior?.book)setWorldPose(bookPose(false));fitPhotoBridge();}new ResizeObserver(resize).observe(host);resize();
function status(message){$('status').textContent=message;}
const portal=createBookPortal($('world-portal'),{
 onChange(value){if(value==='leave'){$('return-book').click();return;}ui();if(stage==='book'&&!busy&&value==='ready')status('照片里是最初的书桌。点击书页，回到故事的起点。');},
 onRevisit(){perform(revisitBookroom);},
 onError(error){if(stage==='world'){portal.hide();stage='book';setWorldPose(bookPose(false));ui();}status(error.message);},
});
function ui(){
 host.parentElement.dataset.stage=stage;host.dataset.busy=String(busy);host.dataset.ready=String(ready);host.tabIndex=stage==='world'?-1:0;
 $('approach').hidden=stage!=='overview';$('approach').disabled=!ready||busy;
 $('door').hidden=!['terrace','inside'].includes(stage);$('door').disabled=busy||!ready;$('door').textContent=doorOpen?'关上房门':'打开房门';
 $('enter').hidden=stage!=='terrace';$('enter').disabled=busy||!doorOpen;
 $('exit').hidden=stage!=='inside';$('exit').disabled=busy;
 $('overview').hidden=!['terrace','inside'].includes(stage);$('overview').disabled=busy;
 $('walk-pad').hidden=!['terrace','inside'].includes(stage)||busy;$('inside-views').hidden=stage!=='inside';
 $('read-book').hidden=stage!=='inside';$('read-book').disabled=busy;
 $('enter-photo').hidden=stage!=='book';$('enter-photo').disabled=busy||portal.state==='loading';
 $('enter-photo').textContent=portal.state==='loading'?'照片里的房间正在准备…':portal.state==='error'?'重试载入原空间':'进入书页 →';
 $('leave-book').hidden=stage!=='book';$('leave-book').disabled=busy;
 $('return-book').hidden=stage!=='world';$('return-book').disabled=busy;
 for(const b of document.querySelectorAll('[data-look]'))b.disabled=busy;
 for(const li of document.querySelectorAll('[data-step]'))li.classList.toggle('active',li.dataset.step===stage);
 $('location-name').textContent={overview:grotto?'洞窟小岛':'原版小岛',terrace:'二层露台',inside:'海风书屋 · 室内',book:'第一页 · 故事的起点',world:'又回到熟悉的书桌'}[stage];
 $('hint').textContent=stage==='overview'?'拖动旋转，滚轮缩放。':stage==='book'?'点击照片，走进书页里的空间 · Esc 离开书桌':'拖动环顾 · WASD / 方向键移动 · 右下角也可移动';
 $('motion').setAttribute('aria-pressed',String(reduced));
}
function animate(duration,update){return new Promise(resolve=>{tween={start:performance.now(),duration:reduced?1:duration,update,resolve};});}
function lookAngles(target){const d=target.clone().sub(camera.position).normalize();yaw=Math.atan2(d.x,-d.z);pitch=Math.asin(d.y);}
function look(){camera.up.set(0,1,0);camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))));}
async function travel(points,target,duration=2200,walking=false){
 const positions=[camera.position.clone(),...points];
 const curve=walking?null:new THREE.CatmullRomCurve3(positions,false,'centripetal');
 const segments=positions.slice(1).map((p,i)=>p.distanceTo(positions[i])),total=segments.reduce((sum,n)=>sum+n,0);
 const pointAt=t=>{if(!walking)return curve.getPoint(t);if(t>=1)return positions.at(-1);let d=t*total;for(let i=0;i<segments.length;i++){if(d<=segments[i])return positions[i].clone().lerp(positions[i+1],segments[i]?d/segments[i]:0);d-=segments[i];}return positions.at(-1);};
 const currentTarget=camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(.13));
 const fov=camera.fov;
 await animate(duration,t=>{camera.position.copy(pointAt(t));if(walking)camera.position.y=eyeHeight(-camera.position.z);camera.lookAt(currentTarget.clone().lerp(target,t));camera.fov=THREE.MathUtils.lerp(fov,stage==='overview'?44:67,t);camera.updateProjectionMatrix();});lookAngles(target);
}
let lastWalkPath=[];
async function walkTo(destination,target){
 const route=planWalk([camera.position.x,-camera.position.z],destination,walkable,interior.furniture);
 if(!route)throw Error('没有找到安全通道，请稍微退后再试。');
 lastWalkPath=route;let length=0;for(let i=1;i<route.length;i++)length+=Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]);
 await travel(route.slice(1).map(([x,y])=>P(x,y,eyeHeight(y))),target,Math.max(500,length/.07*1000),true);
}
async function perform(fn){if(busy||!ready)return;busy=true;keys.clear();touchMoves.clear();drag=null;ui();try{await fn();}catch(error){status(error.message);}finally{busy=false;ui();if(stage==='world')portal.focus();else host.focus({preventScroll:true});}}
async function setDoor(open){const a=interior.pivot.rotation.y,b=open?openAngle:0;await animate(950,t=>interior.pivot.rotation.y=THREE.MathUtils.lerp(a,b,t));doorOpen=open;}
$('approach').onclick=()=>perform(async()=>{stage='terrace';status('沿露台靠近绿色房门');await travel([P(-.13,.79,.19),P(terraceX,terraceY,eyeHeight(terraceY))],P(.043,.672,.092),2900);status('点击房门或“打开房门”，然后进入书屋。');});
$('door').onclick=()=>perform(async()=>{const y=-camera.position.z;if(doorOpen&&(grotto?y<.696&&Math.hypot(camera.position.x-.011,y-.684)<.073:y>.664&&y<.718&&camera.position.x<.09)){status('请先离开门扇转动的范围，再关门。');return;}await setDoor(!doorOpen);status(doorOpen?'门已打开，可以走进书屋。':'房门已关闭。');});
$('enter').onclick=()=>perform(async()=>{if(!doorOpen)return;await walkTo([.063,.610],P(.135,.537,.070));stage='inside';status('已进入书屋。拖动环顾，或用方向键慢慢走动。');});
$('exit').onclick=()=>perform(async()=>{if(!doorOpen)await setDoor(true);await walkTo([terraceX,terraceY],P(.043,.674,.085));stage='terrace';status('已回到露台。可关门或返回小岛全景。');});
$('overview').onclick=()=>perform(async()=>{if(stage==='inside'){if(!doorOpen)await setDoor(true);await walkTo([terraceX,terraceY],P(.043,.674,.085));}stage='overview';const pos=center.clone().add(new THREE.Vector3(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),-Math.cos(orbit.yaw)*Math.cos(orbit.pitch)).multiplyScalar(orbit.distance*(grotto?Math.max(1,1/camera.aspect):1)));await travel([P(-.12,.84,.23),pos],center,2500);startPose();status('书屋与小岛在同一场景中，随时可以再次进入。');});
$('motion').onclick=()=>{reduced=!reduced;portal.setReduced(reduced);ui();};
let readingReturn;
function fitPhotoBridge(){
 const [x,y,w,h]=sourceCrop(camera.aspect),img=$('photo-bridge').firstElementChild;
 Object.assign(img.style,{width:`${100/w}%`,height:`${100/h}%`,left:`${-x/w*100}%`,top:`${-y/h*100}%`});
}
function worldPose(){syncCamera();return{position:worldCamera.position.clone(),quaternion:worldCamera.quaternion.clone(),fov:worldCamera.fov};}
function setWorldPose({position,quaternion,fov}){
 camera.position.copy(toRoom(position));camera.up.set(0,1,0).applyQuaternion(quaternion).transformDirection(inverseFrame);
 camera.lookAt(toRoom(position.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(quaternion))));camera.fov=fov;camera.updateProjectionMatrix();
}
function bookPose(zoom){
 return bookView(interior.book.frame(),camera.aspect,zoom);
}
async function focusBook(zoom,duration){
 const from=worldPose();await animate(duration,t=>{
  // Recompute on every frame so a viewport resize during a zoom stays aligned.
  const to=bookPose(zoom);
  setWorldPose({position:from.position.clone().lerp(to.position,t),quaternion:from.quaternion.clone().slerp(to.quaternion,t),fov:THREE.MathUtils.lerp(from.fov,to.fov,t)});
  if(zoom)$('photo-bridge').style.opacity=String(THREE.MathUtils.smoothstep(t,.86,1));
 });
}
function preloadWorld(){portal.preload().catch(()=>{});}
$('read-book').onclick=()=>perform(async()=>{
 if(stage!=='inside')return;
 const target=toRoom(interior.book.frame().center);status('走到窗边，看看摊开的第一页。');
 await walkTo([.030,.610],target);readingReturn=worldPose();stage='book';ui();preloadWorld();
 await focusBook(false,1800);status(portal.state==='ready'?'照片里是最初的书桌。点击书页，回到故事的起点。':'书页上印着最初的照片。照片里的房间正在准备。');
});
$('leave-book').onclick=()=>perform(async()=>{
 if(stage!=='book')return;
 const from=worldPose();await animate(1100,t=>setWorldPose({position:from.position.clone().lerp(readingReturn.position,t),quaternion:from.quaternion.clone().slerp(readingReturn.quaternion,t),fov:THREE.MathUtils.lerp(from.fov,readingReturn.fov,t)}));
 stage='inside';camera.up.set(0,1,0);lookAngles(camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3())));status('仍在窗边的书桌旁。可以继续看书，也可以回到露台。');
});
$('enter-photo').onclick=()=>{
 if(stage!=='book')return;
 if(portal.state==='error'||portal.state==='idle'){preloadWorld();return;}
 perform(async()=>{
  status('走进这一页，回到最初的房间。');await portal.prepare(reduced);
  try{
   await focusBook(true,2600);portal.show();stage='world';ui();
   await animate(1000,t=>$('photo-bridge').style.opacity=String(1-t));
   if(stage==='world')status('又回到了最初的书桌。绕到背面的假期，还可以再次走进洞窟书屋。');
  }catch(error){portal.hide();stage='book';$('photo-bridge').style.opacity='0';setWorldPose(bookPose(false));throw error;}
 });
};
$('return-book').onclick=()=>perform(async()=>{
 if(stage!=='world')return;
 // A quiet chapter fade works from every GS angle, including the sea side.
 await animate(350,t=>$('chapter-veil').style.opacity=String(t));portal.hide();stage='book';setWorldPose(bookPose(false));ui();
 await animate(500,t=>$('chapter-veil').style.opacity=String(1-t));status('回到摊开的书页。你可以再次进入照片，或离开书桌。');
});
async function revisitBookroom(){
 if(stage!=='world')return;
 await animate(350,t=>$('chapter-veil').style.opacity=String(t));
 portal.hide();stage='overview';doorOpen=false;interior.pivot.rotation.y=0;startPose();ui();
 await animate(600,t=>$('chapter-veil').style.opacity=String(1-t));
 status('海风书屋又在眼前。推门进去，那张照片还在书页上。');
}
const targets={shelves:P(.135,.535,.072),reading:P(-.020,.582,.050),outside:P(.043,.80,.085)};
for(const b of document.querySelectorAll('[data-look]'))b.onclick=()=>perform(async()=>{const d=camera.getWorldDirection(new THREE.Vector3()),start=camera.position.clone().add(d.multiplyScalar(.15)),target=targets[b.dataset.look];await animate(650,t=>camera.lookAt(start.clone().lerp(target,t)));lookAngles(target);status(b.textContent);});
const raycaster=new THREE.Raycaster();host.addEventListener('pointerdown',e=>{if(busy||stage==='world'||e.button!==0)return;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};host.setPointerCapture(e.pointerId);host.focus({preventScroll:true});});
host.addEventListener('pointermove',e=>{if(!drag||busy||stage==='book')return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(stage==='overview'){orbit.yaw-=dx*.006;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+dy*.005,-.15,1.2);startPose();}else{yaw-=dx*.005;pitch=THREE.MathUtils.clamp(pitch-dy*.004,-1.1,1.1);look();}drag.x=e.clientX;drag.y=e.clientY;});
host.addEventListener('pointerup',e=>{if(drag&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5&&ready&&!busy&&stage!=='overview'){
 const r=host.getBoundingClientRect();syncCamera();raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),worldCamera);
 const page=raycaster.intersectObject(interior.book.photo)[0];
 const obstruction=page&&raycaster.intersectObjects(scene.children,true).find(hit=>hit.object.isMesh&&hit.object.material?.opacity!==0&&!(hit.object.material?.transparent&&hit.object.material.opacity<.2));
 if(page&&(!obstruction||page.distance<=obstruction.distance+.00005)){if(stage==='inside')$('read-book').click();else if(stage==='book')$('enter-photo').click();}
 else if(['inside','terrace'].includes(stage)&&raycaster.intersectObject(interior.pivot,true).length)$('door').click();
 }drag=null;});
for(const event of ['pointercancel','lostpointercapture'])host.addEventListener(event,()=>drag=null);
host.addEventListener('wheel',e=>{if(stage!=='overview'||busy)return;e.preventDefault();orbit.distance=THREE.MathUtils.clamp(orbit.distance*Math.exp(e.deltaY*.001),.65,3.5);startPose();},{passive:false});
const movementKeys=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
host.addEventListener('keydown',e=>{if(movementKeys.includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}if(e.key==='Escape'&&!busy){if(stage==='inside')$('exit').click();if(stage==='book')$('leave-book').click();}if(e.key==='Enter'&&stage==='book')$('enter-photo').click();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();touchMoves.clear();});
for(const b of document.querySelectorAll('[data-move]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touchMoves.add(b.dataset.move);};for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>touchMoves.delete(b.dataset.move));}
function walkable(x,y){
 const m=.007,inside=x>room.minX+m&&x<room.maxX-m&&y>room.minY+m&&y<room.maxY-m;
 const terrace=x>-.052&&x<.100&&y>.700&&y<terraceMaxY;
 const passage=x>room.doorMin+m&&x<room.doorMax-m&&y>.657&&y<.727;
 if(!(inside||terrace||passage))return false;
 if(!doorOpen&&y>.665&&y<.702)return false;
 if(doorOpen){const ax=.011,ay=.684,bx=ax+.064*Math.cos(openAngle),by=ay+.064*Math.sin(openAngle),dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));if(Math.hypot(x-ax-t*dx,y-ay-t*dy)<.008)return false;}
 for(const f of interior?.furniture||[]){const b=f.bounds;if(x>b.min[0]-.006&&x<b.max[0]+.006&&-y>b.min[2]-.006&&-y<b.max[2]+.006)return false;}
 return true;
}
function move(dt){if(!ready||busy||!['inside','terrace'].includes(stage))return;let f=Number(keys.has('w')||keys.has('arrowup')||touchMoves.has('forward'))-Number(keys.has('s')||keys.has('arrowdown')||touchMoves.has('back'));let r=Number(keys.has('d')||keys.has('arrowright')||touchMoves.has('right'))-Number(keys.has('a')||keys.has('arrowleft')||touchMoves.has('left'));if(!f&&!r)return;const norm=Math.hypot(f,r);f/=norm;r/=norm;const dx=(Math.sin(yaw)*f+Math.cos(yaw)*r)*dt*.055,dz=(-Math.cos(yaw)*f+Math.sin(yaw)*r)*dt*.055;if(walkable(camera.position.x+dx,-camera.position.z))camera.position.x+=dx;if(walkable(camera.position.x,-camera.position.z-dz))camera.position.z+=dz;camera.position.y=eyeHeight(-camera.position.z);look();const next=-camera.position.z<.66?'inside':-camera.position.z>.716?'terrace':stage;if(next!==stage){stage=next;ui();}}
const debug={get state(){return{ready,busy,stage,doorOpen,doorAngle:interior?.pivot.rotation.y,camera:camera.position.toArray(),yaw,pitch,reduced,portalState:portal.state,islandVersion:grotto?'v6':'v3',worldCamera:worldCamera.position.toArray(),terraceX,terraceY};},walkable,get lastWalkPath(){return lastWalkPath;},get furniture(){return interior?.furniture;},get book(){return interior?.book;},get scene(){return scene;},get layout(){return layout;},get camera(){return worldCamera;},toWorld,toRoom};window.bookroom=debug;
function frame(now){const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(tween){const t=Math.min(1,(now-tween.start)/tween.duration),e=t*t*(3-2*t);tween.update(e);if(t===1){const done=tween.resolve;tween=null;done();}}if(stage!=='world'){move(dt);syncCamera();renderer.render(scene,worldCamera);}requestAnimationFrame(frame);}requestAnimationFrame(frame);ui();
try{
 const [shell,built]=await Promise.all([loader.loadAsync(grotto?'assets/bookroom/shell-grotto-v6.glb':'assets/bookroom/shell.glb'),buildInterior(scene,loader,{furnitureWidthScale:layout?.furnitureWidthScale??1,grotto})]);interior=built;interior.root.applyMatrix4(frameTransform);if(grotto)interior.root.traverse(o=>{if(o.isPointLight)o.intensity*=.75*.75;});interior.root.updateMatrixWorld(true);shell.scene.name='approved-island-with-openings';shell.scene.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=true;}});scene.add(shell.scene);ready=true;$('loading').hidden=true;status(grotto?'洞窟书屋已准备好。从露台推开绿门。':'原版书屋已准备好。从露台开始参观。');ui();
}catch(error){$('loading').textContent='书屋未能完整载入，请刷新页面重试。';status(error.message);console.error(error);}
