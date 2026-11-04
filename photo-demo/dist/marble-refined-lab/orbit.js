import * as THREE from '../vendor/three.module.js';

// Keep the validated ±12° path exactly. Beyond that, approach the objects before
// circling them, instead of carrying the original room-sized radius through walls.
export function orbitPose(parameters, degrees, wide=false){
  const p=parameters,home=new THREE.Vector3(p.x,p.y,p.z);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...[p.pitch,p.yaw,p.roll].map(THREE.MathUtils.degToRad),'YXZ'));
  const pivot=new THREE.Vector3(0,0,-p.distance).applyQuaternion(q).add(home);
  const a=THREE.MathUtils.degToRad(degrees),turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a);
  const position=home.clone().sub(pivot).applyQuaternion(turn).add(pivot),quaternion=turn.clone().multiply(q);
  if(wide){
    const t=THREE.MathUtils.smoothstep(Math.abs(degrees),12,45),target=new THREE.Vector3(.06,.94,-2.20);
    const radiusZ=Math.cos(a)>=0?.60:.28;
    const close=new THREE.Vector3(target.x+.54*Math.sin(a),1.48,target.z+radiusZ*Math.cos(a));
    const view=new THREE.Matrix4().lookAt(close,target,new THREE.Vector3(0,1,0));
    position.lerp(close,t);quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(view),t);pivot.lerp(target,t);
  }
  return{position,quaternion,pivot};
}

export function clampRoom(position){
  position.x=THREE.MathUtils.clamp(position.x,-1.05,1.1);
  position.y=THREE.MathUtils.clamp(position.y,.96,2.5);
  position.z=THREE.MathUtils.clamp(position.z,-2.58,.55);
  return position;
}
