import * as THREE from '../vendor/three.module.js';
import {cupDraft,grottoDraft} from './harbor-waterline.js';

const {clamp, lerp, smoothstep} = THREE.MathUtils;
const up = new THREE.Vector3(0,1,0);
const copy = view => ({...view,position:view.position.clone(),rotation:view.rotation.clone()});
const travelKeys=new Set(['arrowleft','arrowright','arrowup','arrowdown','a','d','w','s','q','e','i','j','k','l']);
export const isTravelKey=key=>travelKeys.has(key);

// Work in desk coordinates on both sides of the islands' tilted waterline.
export function createDeskExplore(camera,holiday,objects,dreamScene,{changed,reduced}){
  const {surface,corners}=holiday;
  const limits=new THREE.Box3().setFromPoints(corners).expandByScalar(1.35);
  const cup=objects.group.getObjectByName('cup-wall');
  const cupBounds=new THREE.Box3().setFromObject(cup,true)
    .expandByObject(objects.group.getObjectByName('cup-handle'),true)
    .expandByObject(objects.group.getObjectByName('saucer'),true);
  const grotto=holiday.grotto.environment;
  const wetBounds=(box,draft)=>box.translate(new THREE.Vector3(0,-draft,0));
  const destinations=new Map([
    ...holiday.islands.destinations,
    ['grotto',{root:grotto,bounds:new THREE.Box3().setFromObject(grotto)}],
    ['cup',{root:cup,bounds:wetBounds(cupBounds,cupDraft)}],
  ]);
  const roots=new Map([...destinations].map(([id,d])=>[d.root,id]));
  roots.set(holiday.grotto.root,'grotto');roots.set(holiday.group,'cup');
  for(const mesh of objects.meshes){
    if(mesh.userData.kind==='cup')roots.set(mesh,'cup');
    if(mesh.userData.kind==='laptop')roots.set(mesh,'grotto');
  }
  const obstacles=[...destinations.values()].map(d=>d.bounds);
  obstacles.push(wetBounds(new THREE.Box3().setFromObject(objects.group.getObjectByName('laptop-lid')),grottoDraft));
  const ray=new THREE.Raycaster();
  const angles=new THREE.Euler(0,0,0,'YXZ');
  const keys=new Set(),velocity=new THREE.Vector3(),desired=new THREE.Vector3(),step=new THREE.Vector3();
  let overview,view,motion,lastKeyTime=0;

  function constrain(eye,previousY=eye.y){
    eye.clamp(limits.min,limits.max);
    const water=surface(eye.x,eye.z)+.035;
    const overReef=holiday.ocean.contains(eye);
    const bed=overReef?holiday.ocean.floor(eye.x,eye.z)+.023:water-.54;
    let floor=bed,ceiling=Infinity;
    for(const {min,max} of obstacles){
      const dx=Math.max(min.x-eye.x,eye.x-max.x,0),dz=Math.max(min.z-eye.z,eye.z-max.z,0);
      const weight=1-smoothstep(Math.hypot(dx,dz),0,.06);
      if(weight>0 && eye.y>min.y-.025){
        if(previousY<=min.y-.025 && dx===0 && dz===0)ceiling=Math.min(ceiling,min.y-.025);
        else floor=Math.max(floor,lerp(bed,max.y+.025,weight));
      }
    }
    eye.y=clamp(eye.y,floor,ceiling);
    return eye;
  }
  function apply(){
    camera.position.copy(view.position);camera.quaternion.copy(view.rotation);
    camera.updateMatrixWorld(true);changed(view);
  }
  function cancelMotion(){
    if(motion){const done=motion.done;motion=null;done(false);}
  }
  function clearKeys(){
    keys.clear();velocity.set(0,0,0);lastKeyTime=0;
  }
  function stop(){cancelMotion();clearKeys();}
  function move(to){
    stop();
    if(reduced() || (!to.modified&&!view.modified)){
      view=copy(to);apply();return Promise.resolve(true);
    }
    const below=p=>holiday.ocean.contains(p)&&p.y<surface(p.x,p.z)-.025;
    const diving=to.focus==='reef'&&!below(view.position),surfacing=view.focus==='reef'&&!below(to.position);
    let waypoint;
    if(diving||surfacing){
      waypoint=(diving?to:view).position.clone();
      waypoint.y=Math.max(view.position.y,to.position.y,surface(waypoint.x,waypoint.z)+.17);
    }
    return new Promise(done=>{motion={from:copy(view),to:copy(to),waypoint,time:0,done};});
  }
  function tick(dt,now){
    if(keys.size)advanceKeys(now);
    if(!motion)return;
    const m=motion;
    m.time+=dt;
    const t=reduced()?1:smoothstep(m.time,0,m.waypoint?1.05:.55);
    if(t===1){view=copy(m.to);motion=null;}
    else{
      if(m.waypoint){
        view.position.copy(m.from.position).multiplyScalar((1-t)**2)
          .addScaledVector(m.waypoint,2*t*(1-t)).addScaledVector(m.to.position,t*t);
      }else view.position.lerpVectors(m.from.position,m.to.position,t);
      constrain(view.position);
      view.rotation.slerpQuaternions(m.from.rotation,m.to.rotation,t);
      view.distance=lerp(m.from.distance,m.to.distance,t);view.modified=true;view.focus=m.to.focus;
    }
    apply();
    if(t===1)m.done(true);
  }
  function setHome({position,quaternion,pivot},keepView=false){
    overview={position:position.clone(),rotation:quaternion.clone(),distance:position.distanceTo(pivot),modified:false,focus:''};
    if(!keepView){stop();view=copy(overview);}
    else if(motion&&!motion.to.modified)motion.to=copy(overview);
  }
  function rotate(dx,dy){
    angles.setFromQuaternion(view.rotation,'YXZ');
    angles.y-=dx;
    angles.x=clamp(angles.x-dy,-Math.PI/2+.015,Math.PI/2-.015);
    view.rotation.setFromEuler(angles);
  }
  function manualChange(){
    view.modified=true;view.focus='';apply();
  }
  function look(dx,dy){
    cancelMotion();rotate(dx,dy);manualChange();
  }
  function zoom(factor){
    cancelMotion();
    const distance=view.distance*factor;
    step.set(0,0,distance-view.distance).applyQuaternion(view.rotation);
    const previousY=view.position.y;constrain(view.position.add(step),previousY);
    view.distance=clamp(distance,.065,1.65);manualChange();
  }
  function pan(right,screenUp){
    cancelMotion();
    step.set(right,screenUp,0).applyQuaternion(view.rotation);
    const previousY=view.position.y;constrain(view.position.add(step),previousY);manualChange();
  }

  function advanceKeys(now){
    // Account for the part of a frame before keyup as well as held frames.
    const dt=clamp((now-lastKeyTime)/1000,0,.05);
    if(!dt)return;
    lastKeyTime=now;
    const axis=(positive,negative)=>Number(positive)-Number(negative);
    const right=axis(keys.has('d')||keys.has('arrowright'),keys.has('a')||keys.has('arrowleft'));
    const forward=axis(keys.has('w')||keys.has('arrowup'),keys.has('s')||keys.has('arrowdown'));
    const rise=axis(keys.has('e'),keys.has('q'));
    const turn=axis(keys.has('l'),keys.has('j')),tilt=axis(keys.has('k'),keys.has('i'));
    if(turn||tilt)rotate(turn*dt*1.65,tilt*dt*1.65);
    desired.set(right,0,-forward).applyQuaternion(view.rotation);
    desired.y+=rise;
    desired.normalize().multiplyScalar(clamp(view.distance*.75,.12,.75));
    // Integrate the short acceleration ramp independently of display refresh.
    const ramp=-Math.expm1(-18*dt);
    step.copy(desired).multiplyScalar(dt-ramp/18).addScaledVector(velocity,ramp/18);
    velocity.lerp(desired,ramp);
    const previousY=view.position.y;
    if(step.lengthSq()>0)constrain(view.position.add(step),previousY);
    manualChange();
  }
  function key(key,down){
    if(!isTravelKey(key)||keys.has(key)===down)return;
    const now=performance.now();
    if(keys.size)advanceKeys(now);else lastKeyTime=now;
    if(down){cancelMotion();keys.add(key);}
    else{keys.delete(key);if(!keys.size)clearKeys();}
  }
  function focus(id){
    if(id==='reef')return move(holiday.ocean.diveView());
    const item=destinations.get(id);
    if(!item)return;
    const target=item.bounds.getCenter(new THREE.Vector3());
    angles.setFromQuaternion(view.rotation,'YXZ');
    const back=new THREE.Vector3().setFromSphericalCoords(1,Math.PI/2-.52,angles.y);
    const right=new THREE.Vector3().crossVectors(up,back).normalize(),vertical=back.clone().cross(right);
    const half=item.bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
    let distance=.09;
    // Fit the projected box in both axes, accounting for its depth. A phone
    // needs a much closer berth than the cave in a wide, shallow viewport.
    for(const x of [-half.x,half.x])for(const y of [-half.y,half.y])for(const z of [-half.z,half.z]){
      const corner=new THREE.Vector3(x,y,z),projection=camera.projectionMatrix.elements;
      const extent=Math.max(Math.abs(corner.dot(right))*projection[0],Math.abs(corner.dot(vertical))*projection[5]);
      distance=Math.max(distance,corner.dot(back)+extent*1.12);
    }
    distance=Math.min(distance,1.65);
    const position=constrain(target.clone().addScaledVector(back,distance));
    const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position,target,up));
    return move({position,rotation,distance,modified:true,focus:id});
  }
  function pick(ndc){
    ray.setFromCamera(ndc,camera);
    const meshes=[];
    const collect=o=>{if(o.isMesh&&o.layers.test(camera.layers))meshes.push(o);};
    // Test the displayed island poses and the intervening furniture. The
    // compositor normally restores the calibrated source objects after drawing.
    holiday.applyPass(true);
    let hit;
    try{
      for(const group of [dreamScene,objects.group]){
        group.updateWorldMatrix(true,true);group.traverseVisible(collect);
      }
      hit=ray.intersectObjects(meshes,false)[0]?.object;
    }finally{holiday.applyPass(false);objects.group.updateWorldMatrix(true,true);}
    while(hit&&!roots.has(hit))hit=hit.parent;
    if(hit)focus(roots.get(hit));
  }
  return {setHome,stop,cancelMotion,clearKeys,tick,key,look,pan,zoom,focus,pick,move,
    overview:()=>move(overview),get distance(){return view.distance;},get projectionY(){return camera.projectionMatrix.elements[5];},
    get modified(){return !!view?.modified;},get state(){return view&&copy(view);}};
}

// Keep a gesture with its original owner even if a timeline drag reaches 180°.
export function exploreGestures(canvas,controls){
  const pointers=new Map();
  const centroid=(a,b)=>a.clone().add(b).multiplyScalar(.5);
  const panPixels=(dx,dy)=>{
    const unit=2*controls.distance/(canvas.clientHeight*controls.projectionY);
    controls.pan(-dx*unit,dy*unit);
  };
  function down(e){
    pointers.set(e.pointerId,{point:new THREE.Vector2(e.clientX,e.clientY),start:new THREE.Vector2(e.clientX,e.clientY),
      pan:e.button===2||e.shiftKey,tap:e.button===0&&!e.shiftKey});
    if(pointers.size>1)for(const p of pointers.values())p.tap=false;
    canvas.setPointerCapture(e.pointerId);
  }
  function move(e){
    const p=pointers.get(e.pointerId),next=new THREE.Vector2(e.clientX,e.clientY);
    if(pointers.size===2){
      const other=[...pointers.values()].find(item=>item!==p).point;
      const mid=centroid(p.point,other),to=centroid(next,other);
      controls.zoom(Math.max(1,p.point.distanceTo(other))/Math.max(1,next.distanceTo(other)));
      panPixels(to.x-mid.x,to.y-mid.y);
    }else if(pointers.size===1){
      if(p.tap&&next.distanceTo(p.start)<5)return;
      p.tap=false;
      const dx=next.x-p.point.x,dy=next.y-p.point.y;
      if(p.pan||e.shiftKey)panPixels(dx,dy);
      else controls.look(dx*3.2/canvas.clientHeight,dy*2.8/canvas.clientHeight);
    }
    p.point.copy(next);
  }
  function end(e){
    const p=pointers.get(e.pointerId);pointers.delete(e.pointerId);
    if(p?.tap&&e.type==='pointerup'&&p.start.distanceTo(new THREE.Vector2(e.clientX,e.clientY))<5){
      const r=canvas.getBoundingClientRect();
      controls.pick(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2));
    }
  }
  function clear(){
    for(const id of pointers.keys())if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    pointers.clear();
  }
  return {down,move,end,clear,has:id=>pointers.has(id)};
}
