import * as THREE from '../vendor/three.module.js';
import {P,room,eyeHeight} from '../holiday-assets/bookroom-interior.js';
import {canStandInRoom,planWalk} from '../holiday-assets/bookroom-navigation.js';
import {bookView} from '../holiday-assets/bookroom-book.js';

export function approachPath({layout,toWorld,islandToWorld},start){
 return [start.clone(),islandToWorld(P(.02,1.32,.11)),toWorld(P(-.13,.79,.19)),toWorld(P(layout.terraceX,layout.terraceY,eyeHeight(layout.terraceY)))];
}

// A visit moves the main renderer's existing camera through the actual room.
// There is no second canvas, iframe, duplicated island or alternate-scale room.
export function createBookroomVisit(grotto,camera,{aspect,reduced,onChange,onStatus,onPhoto,onReturn,onExit,beforeApproach}){
 const {interior,layout,toWorld,toRoom,worldFromRoom}=grotto;
 let stage='desk',busy=false,doorOpen=false,tween=null,returnPose,readingReturn,yaw=0,pitch=0,cycles=0;
 let approachPoints=[],lastWalkPath=[],pendingEntry=null;
 const keys=new Set(),ray=new THREE.Raycaster(),openAngle=layout.doorOpenAngle;
 const walkable=(x,y)=>canStandInRoom(x,y,{room,terraceMaxY:layout.terraceMaxY,openAngle,doorOpen,furniture:interior.furniture});
 const changed=()=>onChange(api.state);
 function pose(){return {position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:THREE.MathUtils.radToDeg(2*Math.atan(1/camera.projectionMatrix.elements[5])),near:camera.near};}
 function apply(p){camera.position.copy(p.position);camera.quaternion.copy(p.quaternion);camera.fov=p.fov;camera.near=p.near??.00001;camera.aspect=aspect();camera.updateProjectionMatrix();camera.updateMatrixWorld();}
 function animate(duration,update){return new Promise(resolve=>{tween={duration:reduced()?1:duration,time:0,update,resolve};});}
 function angles(){const p=toRoom(camera.position),target=toRoom(camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()))),d=target.sub(p).normalize();yaw=Math.atan2(d.x,-d.z);pitch=Math.asin(THREE.MathUtils.clamp(d.y,-1,1));}
 function look(){const p=toRoom(camera.position),d=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));camera.up.set(0,1,0).transformDirection(worldFromRoom);camera.lookAt(toWorld(p.add(d)));camera.updateMatrixWorld();}
 async function perform(fn){
  if(busy)return;busy=true;keys.clear();changed();
  try{await fn();}catch(error){onStatus(error.message);if(stage==='returning'){stage='book';apply(bookView(interior.book.frame(),aspect(),false));onPhoto(0);}}
  finally{busy=false;changed();}
 }
 async function fly(points,target,duration=2000,walking=false,fov=67){
  const from=pose(),positions=[from.position,...points],curve=walking?null:new THREE.CatmullRomCurve3(positions,false,'centripetal');
  const distances=positions.slice(1).map((p,i)=>p.distanceTo(positions[i])),total=distances.reduce((a,b)=>a+b,0);
  const startTarget=from.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(.1*grotto.registration.scale));
  const pointAt=t=>{if(!walking)return curve.getPoint(t);if(t>=1)return positions.at(-1);let d=total*t;for(let i=0;i<distances.length;i++){if(d<=distances[i])return positions[i].clone().lerp(positions[i+1],distances[i]?d/distances[i]:0);d-=distances[i];}return positions.at(-1);};
  await animate(duration,t=>{
   const p=pointAt(t);if(walking){const local=toRoom(p);local.y=eyeHeight(-local.z);p.copy(toWorld(local));}
   const up=new THREE.Vector3(0,1,0).transformDirection(worldFromRoom);
   // The offshore eye travels past its initial forward point. Keep the door
   // in sight on approach instead of turning back towards that point at sea.
   const aim=walking?startTarget.clone().lerp(target,t):target;
   const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p,aim,up));
   if(!walking)q.slerp(from.quaternion,1-THREE.MathUtils.smoothstep(t,0,.22));
   apply({position:p,quaternion:q,fov:THREE.MathUtils.lerp(from.fov,fov,t),near:THREE.MathUtils.lerp(from.near,.00001,t)});
  });angles();
 }
 async function walkTo(destination,target,fov=67){
  const p=toRoom(camera.position),route=planWalk([p.x,-p.z],destination,walkable,interior.furniture);
  if(!route)throw Error('前方没有安全通道，请稍微退后再试。');
  lastWalkPath=route;let length=0;for(let i=1;i<route.length;i++)length+=Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]);
  await fly(route.slice(1).map(([x,y])=>toWorld(P(x,y,eyeHeight(y)))),target,Math.max(450,length/.07*1000),true,fov);
 }
 async function door(open){const from=interior.pivot.rotation.y;await animate(800,t=>interior.pivot.rotation.y=THREE.MathUtils.lerp(from,open?openAngle:0,t));doorOpen=open;}
 async function focusBook(zoom){
  const from=pose();await animate(zoom?2600:1700,t=>{
   const target=bookView(interior.book.frame(),aspect(),zoom);
   apply({position:from.position.clone().lerp(target.position,t),quaternion:from.quaternion.clone().slerp(target.quaternion,t),fov:THREE.MathUtils.lerp(from.fov,target.fov,t)});
   if(zoom)onPhoto(THREE.MathUtils.smoothstep(t,.86,1));
  });
 }
 async function leaveBook(){
  const from=pose();await animate(1000,t=>apply({position:from.position.clone().lerp(readingReturn.position,t),quaternion:from.quaternion.clone().slerp(readingReturn.quaternion,t),fov:THREE.MathUtils.lerp(from.fov,readingReturn.fov,t)}));stage='inside';angles();
 }
 async function terrace(){if(stage==='book')await leaveBook();if(!doorOpen)await door(true);await walkTo([layout.terraceX,layout.terraceY],toWorld(P(.043,.674,.092)),88);stage='terrace';}
 const actions={
  door:()=>perform(async()=>{if(!['terrace','inside'].includes(stage))return;const p=toRoom(camera.position),y=-p.z;if(doorOpen&&y<.696&&Math.hypot(p.x-.011,y-.684)<.073){onStatus('请先离开门扇的转动范围。');return;}await door(!doorOpen);onStatus(doorOpen?'门已打开，可以走进书屋。':'房门已关上。');}),
  enter:()=>perform(async()=>{if(stage!=='terrace')return;if(!doorOpen)await door(true);await walkTo([.063,.610],toWorld(P(.135,.537,.070)));stage='inside';onStatus('你已经走进桌上这座书屋。拖动环顾，或走近窗边的书。');}),
  read:()=>perform(async()=>{if(stage!=='inside')return;await walkTo([.030,.610],interior.book.frame().center);readingReturn=pose();stage='book';changed();await focusBook(false);onStatus('这张书桌，正是故事开始的地方。点击右页照片，走回最初的空间。');}),
  leave:()=>perform(async()=>{if(stage!=='book')return;await leaveBook();onStatus('回到窗边书桌旁。');}),
  exit:()=>perform(async()=>{if(!['inside','book'].includes(stage))return;await terrace();onStatus('已经回到露台，书屋仍在这台电脑背后。');}),
  desktop:()=>perform(async()=>{
   if(stage==='book'||stage==='inside')await terrace();
   if(stage!=='terrace')return;
   await walkTo([layout.terraceX,layout.terraceY],toWorld(grotto.entryTarget),88);
   stage='departing';changed();
   const from=pose(),points=[camera.position.clone(),...approachPoints.slice(0,-1).reverse()],curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
   await animate(3000,t=>apply({position:curve.getPoint(t),quaternion:from.quaternion.clone().slerp(returnPose.quaternion,t),fov:THREE.MathUtils.lerp(from.fov,returnPose.fov,t),near:THREE.MathUtils.lerp(from.near,returnPose.near,t)}));
   grotto.closeView?.(false);stage='desk';onExit();onStatus('回到桌面的群岛。可以继续绕行，也可以再去书屋。');
  }),
  photo:()=>perform(async()=>{
   if(stage!=='book')return;
   await focusBook(true);stage='returning';changed();await onReturn();
   await animate(1000,t=>onPhoto(1-t));cycles++;grotto.closeView?.(false);stage='desk';doorOpen=false;interior.pivot.rotation.y=0;
   onStatus('又回到最初的书桌。下一次绕到电脑背后，书屋还在那里。');
  }),
 };
 const api={
  get active(){return stage!=='desk';},get busy(){return busy;},
  get state(){return{stage,busy,preparing:!!pendingEntry,doorOpen,cycles,localCamera:toRoom(camera.position).toArray(),lastWalkPath};},
  walkable,actions,
  cancelEntry(){
   if(!pendingEntry)return;
   pendingEntry=null;onStatus('可以继续绕行，回到电脑背后时再进入书屋。');changed();
  },
  async start(landedFrom=null,fromWalk=false){
   if(stage!=='desk'||busy||pendingEntry)return;
   if(grotto.prepareVisit){
    const request={};pendingEntry=request;changed();onStatus('正在准备书屋近景，可以继续绕行。');
    try{await grotto.prepareVisit();}
    catch{
     if(pendingEntry===request){pendingEntry=null;onStatus('书屋近景未能载入，点击入口可重试。');changed();}
     return;
    }
    if(pendingEntry!==request)return;
    pendingEntry=null;grotto.closeView(true);
   }
   return perform(async()=>{
    stage='approaching';changed();
    if(beforeApproach)await beforeApproach(fromWalk);
    returnPose=landedFrom||pose();onStatus('沿着电脑背后的海湾，靠近二层绿门。');
    approachPoints=approachPath(grotto,returnPose.position);
    if(landedFrom)angles();
    else{
     const terrace=approachPoints.at(-1),nearDoor=fromWalk&&camera.position.distanceTo(terrace)<grotto.registration.scale*.24;
     await fly(nearDoor?[terrace]:approachPoints.slice(1),toWorld(grotto.entryTarget),nearDoor?600:4200,false,88);
    }
    stage='terrace';onStatus('来到电脑背后的露台。推开绿门，走进书屋。');
   });
  },
  resize(){if(!api.active)return;camera.aspect=aspect();if(stage==='book'&&!busy)apply(bookView(interior.book.frame(),aspect(),false));else camera.updateProjectionMatrix();},
  rotate(dx,dy){if(busy||!['terrace','inside'].includes(stage))return;yaw-=dx*.005;pitch=THREE.MathUtils.clamp(pitch-dy*.004,-1.1,1.1);look();},
  key(key,pressed){if(pressed)keys.add(key);else keys.delete(key);},clearKeys(){keys.clear();},
  click(ndc){
   if(busy||!['terrace','inside','book'].includes(stage))return;
   ray.setFromCamera(ndc,camera);const hits=ray.intersectObject(grotto.root,true),hit=hits.find(h=>!(h.object.material?.transparent&&h.object.material.opacity<.2));
   if(hit?.object===interior.book.photo){if(stage==='book')actions.photo();else if(stage==='inside')actions.read();}
   else if(hit){let object=hit.object;while(object&&object!==interior.pivot)object=object.parent;if(object===interior.pivot)actions.door();}
  },
  tick(dt){
   if(tween){tween.time+=dt*1000;const t=Math.min(1,tween.time/tween.duration);tween.update(t*t*(3-2*t));if(t===1){const done=tween.resolve;tween=null;done();}}
   if(busy||!['terrace','inside'].includes(stage))return;
   let f=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),r=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
   if(!f&&!r)return;const n=Math.hypot(f,r);f/=n;r/=n;
   const p=toRoom(camera.position),dx=(Math.sin(yaw)*f+Math.cos(yaw)*r)*dt*.055,dz=(-Math.cos(yaw)*f+Math.sin(yaw)*r)*dt*.055;
   if(walkable(p.x+dx,-p.z))p.x+=dx;if(walkable(p.x,-p.z-dz))p.z+=dz;p.y=eyeHeight(-p.z);camera.position.copy(toWorld(p));look();
   const next=-p.z<.66?'inside':-p.z>.716?'terrace':stage;if(next!==stage){stage=next;changed();}
  },
 };
 return api;
}
