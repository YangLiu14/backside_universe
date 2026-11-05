import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {buildInterior,P,room,eyeHeight} from './bookroom-interior.js';
import {planWalk} from './bookroom-navigation.js';
const $=id=>document.getElementById(id),host=$('scene');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e6df');
const camera=new THREE.PerspectiveCamera(44,1,.001,30);
const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();scene.environment=pmrem.fromScene(environment,.04).texture;scene.environmentIntensity=.32;environment.dispose();pmrem.dispose();
const sun=new THREE.DirectionalLight('#fff2d8',2.2);sun.position.set(.3,1.3,-.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-.65,right:.65,top:.65,bottom:-.65,near:.01,far:4});sun.shadow.bias=-.0001;sun.shadow.normalBias=.0002;scene.add(sun,new THREE.HemisphereLight('#c2daea','#78684b',.65));
const loader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('../vendor/draco/'));
const center=P(0,.30,-.04);let orbit={yaw:.62,pitch:.43,distance:1.95};
let interior,ready=false,busy=false,stage='overview',doorOpen=false,yaw=Math.PI,pitch=0,drag=null,lastTime=performance.now();
let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,tween=null;
const keys=new Set(),touchMoves=new Set();
const startPose=()=>{camera.fov=44;camera.updateProjectionMatrix();camera.position.copy(center).add(new THREE.Vector3(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),-Math.cos(orbit.yaw)*Math.cos(orbit.pitch)).multiplyScalar(orbit.distance));camera.lookAt(center);};startPose();
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(host);resize();
function status(message){$('status').textContent=message;}
function ui(){
 $('approach').hidden=stage!=='overview';$('approach').disabled=!ready||busy;
 $('door').hidden=stage==='overview';$('door').disabled=busy||!ready;$('door').textContent=doorOpen?'关上房门':'打开房门';
 $('enter').hidden=stage!=='terrace';$('enter').disabled=busy||!doorOpen;
 $('exit').hidden=stage!=='inside';$('exit').disabled=busy;
 $('overview').hidden=stage==='overview';$('overview').disabled=busy;
 $('walk-pad').hidden=stage==='overview'||busy;$('inside-views').hidden=stage!=='inside';
 for(const b of document.querySelectorAll('[data-look]'))b.disabled=busy;
 for(const li of document.querySelectorAll('[data-step]'))li.classList.toggle('active',li.dataset.step===stage);
 $('location-name').textContent={overview:'小岛全景',terrace:'二层露台',inside:'海风书屋 · 室内'}[stage];
 $('hint').textContent=stage==='overview'?'拖动旋转，滚轮缩放。':'拖动环顾 · WASD / 方向键移动 · 右下角也可移动';
 $('motion').setAttribute('aria-pressed',String(reduced));
}
function animate(duration,update){return new Promise(resolve=>{tween={start:performance.now(),duration:reduced?1:duration,update,resolve};});}
function lookAngles(target){const d=target.clone().sub(camera.position).normalize();yaw=Math.atan2(d.x,-d.z);pitch=Math.asin(d.y);}
function look(){camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))));}
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
async function perform(fn){if(busy||!ready)return;busy=true;keys.clear();touchMoves.clear();ui();try{await fn();}finally{busy=false;ui();host.focus({preventScroll:true});}}
async function setDoor(open){const a=interior.pivot.rotation.y,b=open?Math.PI*.57:0;await animate(950,t=>interior.pivot.rotation.y=THREE.MathUtils.lerp(a,b,t));doorOpen=open;}
$('approach').onclick=()=>perform(async()=>{stage='terrace';status('沿露台靠近绿色房门');await travel([P(-.13,.79,.19),P(.043,.751,eyeHeight(.751))],P(.043,.672,.092),2900);status('点击房门或“打开房门”，然后进入书屋。');});
$('door').onclick=()=>perform(async()=>{const y=-camera.position.z;if(doorOpen&&y>.664&&y<.718&&camera.position.x<.09){status('请先离开门扇转动的范围，再关门。');return;}await setDoor(!doorOpen);status(doorOpen?'门已打开，可以走进书屋。':'房门已关闭。');});
$('enter').onclick=()=>perform(async()=>{if(!doorOpen)return;await walkTo([.063,.610],P(.135,.537,.070));stage='inside';status('已进入书屋。拖动环顾，或用方向键慢慢走动。');});
$('exit').onclick=()=>perform(async()=>{if(!doorOpen)await setDoor(true);await walkTo([.043,.751],P(.043,.674,.085));stage='terrace';status('已回到露台。可关门或返回小岛全景。');});
$('overview').onclick=()=>perform(async()=>{if(stage==='inside'){if(!doorOpen)await setDoor(true);await walkTo([.043,.751],P(.043,.674,.085));}stage='overview';const pos=center.clone().add(new THREE.Vector3(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),-Math.cos(orbit.yaw)*Math.cos(orbit.pitch)).multiplyScalar(orbit.distance));await travel([P(-.12,.84,.23),pos],center,2500);startPose();status('书屋与小岛在同一场景中，随时可以再次进入。');});
$('motion').onclick=()=>{reduced=!reduced;ui();};
const targets={shelves:P(.135,.535,.072),reading:P(-.020,.582,.050),outside:P(.043,.80,.085)};
for(const b of document.querySelectorAll('[data-look]'))b.onclick=()=>perform(async()=>{const d=camera.getWorldDirection(new THREE.Vector3()),start=camera.position.clone().add(d.multiplyScalar(.15)),target=targets[b.dataset.look];await animate(650,t=>camera.lookAt(start.clone().lerp(target,t)));lookAngles(target);status(b.textContent);});
const raycaster=new THREE.Raycaster();host.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};host.setPointerCapture(e.pointerId);host.focus({preventScroll:true});});
host.addEventListener('pointermove',e=>{if(!drag||busy)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(stage==='overview'){orbit.yaw-=dx*.006;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+dy*.005,-.15,1.2);startPose();}else{yaw-=dx*.005;pitch=THREE.MathUtils.clamp(pitch-dy*.004,-1.1,1.1);look();}drag.x=e.clientX;drag.y=e.clientY;});
host.addEventListener('pointerup',e=>{if(drag&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5&&ready&&!busy&&stage!=='overview'){const r=host.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);if(raycaster.intersectObject(interior.pivot,true).length)$('door').click();}drag=null;});
for(const event of ['pointercancel','lostpointercapture'])host.addEventListener(event,()=>drag=null);
host.addEventListener('wheel',e=>{if(stage!=='overview'||busy)return;e.preventDefault();orbit.distance=THREE.MathUtils.clamp(orbit.distance*Math.exp(e.deltaY*.001),.65,3.5);startPose();},{passive:false});
const movementKeys=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
host.addEventListener('keydown',e=>{if(movementKeys.includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}if(e.key==='Escape'&&!busy&&stage==='inside')$('exit').click();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();touchMoves.clear();});
for(const b of document.querySelectorAll('[data-move]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touchMoves.add(b.dataset.move);};for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>touchMoves.delete(b.dataset.move));}
function walkable(x,y){
 const m=.007,inside=x>room.minX+m&&x<room.maxX-m&&y>room.minY+m&&y<room.maxY-m;
 const terrace=x>-.052&&x<.100&&y>.700&&y<.784;
 const passage=x>room.doorMin+m&&x<room.doorMax-m&&y>.657&&y<.727;
 if(!(inside||terrace||passage))return false;
 if(!doorOpen&&y>.665&&y<.702)return false;
 if(doorOpen){const ax=.011,ay=.684,bx=ax+.064*Math.cos(Math.PI*.57),by=ay+.064*Math.sin(Math.PI*.57),dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));if(Math.hypot(x-ax-t*dx,y-ay-t*dy)<.008)return false;}
 for(const f of interior?.furniture||[]){const b=f.bounds;if(x>b.min[0]-.006&&x<b.max[0]+.006&&-y>b.min[2]-.006&&-y<b.max[2]+.006)return false;}
 return true;
}
function move(dt){if(!ready||busy||stage==='overview')return;let f=Number(keys.has('w')||keys.has('arrowup')||touchMoves.has('forward'))-Number(keys.has('s')||keys.has('arrowdown')||touchMoves.has('back'));let r=Number(keys.has('d')||keys.has('arrowright')||touchMoves.has('right'))-Number(keys.has('a')||keys.has('arrowleft')||touchMoves.has('left'));if(!f&&!r)return;const norm=Math.hypot(f,r);f/=norm;r/=norm;const dx=(Math.sin(yaw)*f+Math.cos(yaw)*r)*dt*.055,dz=(-Math.cos(yaw)*f+Math.sin(yaw)*r)*dt*.055;if(walkable(camera.position.x+dx,-camera.position.z))camera.position.x+=dx;if(walkable(camera.position.x,-camera.position.z-dz))camera.position.z+=dz;camera.position.y=eyeHeight(-camera.position.z);look();const next=-camera.position.z<.66?'inside':-camera.position.z>.716?'terrace':stage;if(next!==stage){stage=next;ui();}}
const debug={get state(){return{ready,busy,stage,doorOpen,doorAngle:interior?.pivot.rotation.y,camera:camera.position.toArray(),yaw,pitch,reduced};},walkable,get lastWalkPath(){return lastWalkPath;},get furniture(){return interior?.furniture;},get scene(){return scene;}};window.bookroom=debug;
function frame(now){const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(tween){const t=Math.min(1,(now-tween.start)/tween.duration),e=t*t*(3-2*t);tween.update(e);if(t===1){const done=tween.resolve;tween=null;done();}}move(dt);renderer.render(scene,camera);requestAnimationFrame(frame);}requestAnimationFrame(frame);ui();
try{
 const [shell,built]=await Promise.all([loader.loadAsync('assets/bookroom/shell.glb'),buildInterior(scene,loader)]);interior=built;shell.scene.name='approved-island-with-openings';shell.scene.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=true;}});scene.add(shell.scene);ready=true;$('loading').hidden=true;status('书屋已准备好。从露台开始这段小小的年假。');ui();
}catch(error){$('loading').textContent='书屋未能完整载入，请刷新页面重试。';status(error.message);console.error(error);}
