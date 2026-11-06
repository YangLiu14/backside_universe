import * as THREE from 'three';

const {lerp,smoothstep,radToDeg,degToRad}=THREE.MathUtils;
const up=new THREE.Vector3(0,1,0);
const offshore={
  cup:[-.95,1.15,-.35],
  'blue-book':[-.62,.62,.53],
  'orange-book':[-.20,.61,-.84],
  phone:[.63,.90,-1.16],
  grotto:[-.17,.66,-.93],
};
function coastView(id,box){
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const eye=new THREE.Vector3(...offshore[id]).multiplyScalar(Math.max(size.x,size.z)).add(center);
  return {eye,center};
}

// Space the camera samples by apparent travel: a centimetre at the eyepiece
// deserves more time than a centimetre out at sea. One clock runs to the prop.
function flightTrack(points,origin,subject){
  const path=new THREE.CatmullRomCurve3(points,false,'centripetal');
  const costs=[0],samples=192,p=points[0].clone(),previous=p.clone();
  for(let i=1;i<=samples;i++){
    path.getPoint(i/samples,p);
    const depth=Math.max(.031,Math.min(p.distanceTo(origin),p.distanceTo(subject)));
    costs.push(costs[i-1]+p.distanceTo(previous)/Math.sqrt(depth));
    previous.copy(p);
  }
  let index=0;
  return (progress,out)=>{
    const cost=progress*costs[samples];
    while(index<samples-1&&cost>costs[index+1])index++;
    const fraction=(cost-costs[index])/(costs[index+1]-costs[index]||1);
    path.getPoint((index+fraction)/samples,out);
  };
}
function unwrap(angle,reference){return reference+Math.atan2(Math.sin(angle-reference),Math.cos(angle-reference));}
function fittedFov(fov,aspect){return Math.max(fov,radToDeg(2*Math.atan(Math.tan(degToRad(fov)/2)/aspect)));}

export function islandCrossing(camera,source,id,bounds,landing,aspect){
  const from=coastView(source.id||'cup',bounds(source.id||'cup')),to=coastView(id,bounds(id));
  const distance=from.center.distanceTo(to.center),middle=from.center.clone().lerp(to.center,.5);
  const seaward=new THREE.Vector3().subVectors(to.center,from.center);
  seaward.set(seaward.z,0,-seaward.x).normalize();
  if(seaward.z>.15)seaward.negate();
  const overlook=middle.clone().addScaledVector(seaward,.13+.31*distance);
  overlook.y=Math.max(from.eye.y,to.eye.y)+.035+.13*distance;
  const initial=camera.position.clone(),angles=new THREE.Euler(0,0,0,'YXZ'),look=new THREE.Matrix4();
  const start=angles.clone().setFromQuaternion(camera.quaternion,'YXZ');
  const across=angles.clone().setFromRotationMatrix(look.lookAt(overlook,middle.clone().lerp(to.center,.18),up),'YXZ');
  across.y=unwrap(across.y,start.y);
  const startFov=radToDeg(2*Math.atan(1/camera.projectionMatrix.elements[5])),startNear=camera.near;
  let shot,track,lastAspect,elapsed=0;
  const duration=4.9+Math.min(distance*1.65,2)+(id==='grotto'?1.5:0);
  function frame(dt){
    elapsed=Math.min(duration,elapsed+dt);
    const t=elapsed/duration,progress=t-Math.sin(2*Math.PI*t)/(2*Math.PI);
    const ratio=aspect();
    if(ratio!==lastAspect){
      shot=landing();
      const points=[initial,...source.departure.points,from.eye,overlook,to.eye,...(shot.via||[]),shot.eye]
        .filter((p,i,list)=>!i||p.distanceToSquared(list[i-1])>1e-9);
      track=flightTrack(points,from.center,shot.target);
      lastAspect=ratio;
    }
    track(progress,camera.position);
    const turn=smoothstep(t,.02,.64),dock=smoothstep(t,.37,.89);
    // Lead the destination from a wide view, then keep the prop in sight.
    // Nearby waypoint look-at points used to pull the eye back over its shoulder.
    angles.setFromRotationMatrix(look.lookAt(camera.position,shot.target,up),'YXZ');
    const yaw=unwrap(angles.y,across.y);
    angles.set(lerp(lerp(start.x,across.x,turn),angles.x,dock),
      lerp(lerp(start.y,across.y,turn),yaw,dock),lerp(start.z,0,turn),'YXZ');
    camera.quaternion.setFromEuler(angles);
    const cruise=fittedFov(50,ratio),end=shot.fit===false?shot.fov:fittedFov(shot.fov,ratio);
    camera.aspect=ratio;
    camera.fov=lerp(lerp(startFov,cruise,smoothstep(t,0,.48)),end,smoothstep(t,.56,1));
    camera.near=lerp(startNear,shot.near??.00055,smoothstep(t,.44,.95));
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const withdrawal=smoothstep(t,0,.27);
    source.withdraw?.(withdrawal);
    return {done:elapsed===duration,withdrawal};
  }
  return frame;
}
