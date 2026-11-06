import * as THREE from '../vendor/three.module.js';
import {grottoDraft} from './harbor-waterline.js';

// Rigid registration to the photographed lid: preserve every generated rock,
// the room proportions and the retained hardware's measured opening angle.
export function registerGrotto(positions){
 const v=i=>new THREE.Vector3().fromArray(positions,i*3);
 const lower=v(6).add(v(7)).multiplyScalar(.5),upper=v(4).add(v(5)).multiplyScalar(.5);
 const right=v(5).sub(v(4)).normalize(),up=upper.clone().sub(lower).normalize();
 const front=right.clone().cross(up).normalize();up.crossVectors(front,right).normalize();
 const angle=Math.atan(.465),sourceUp=new THREE.Vector3(0,Math.cos(angle),-Math.sin(angle));
 const sourceBasis=new THREE.Matrix4().makeBasis(new THREE.Vector3(1,0,0),sourceUp,new THREE.Vector3(0,Math.sin(angle),Math.cos(angle)));
 const rotation=new THREE.Matrix4().makeBasis(right,up,front).multiply(sourceBasis.invert());
 const scale=v(5).distanceTo(v(4))/.93;
 const sourceLower=new THREE.Vector3(0,-.2926877737,-.2559156716);
 const matrix=rotation.clone().scale(new THREE.Vector3(scale,scale,scale));
 matrix.setPosition(lower.clone().sub(sourceLower.applyMatrix4(matrix)));
 return {matrix,scale,lower,upper,right,up,front};
}

export function roomFrame(layout){
 const {scale:s,translation:t}=layout.worldFromRoom;
 return new THREE.Matrix4().compose(new THREE.Vector3(t[0],t[2],-t[1]),new THREE.Quaternion(),new THREE.Vector3(s[0],s[2],s[1]));
}

// Seat the front shore on the real desk. Matching the lid hinge alone buries
// the generated diorama's lower harbor, whose base extends below that hinge.
export function seatGrotto(registration,surface){
 const shore=new THREE.Vector3(0,-.36,-1).applyMatrix4(registration.matrix);
 const lift=surface(shore.x,shore.z)-.005-grottoDraft-shore.y;
 registration.matrix.elements[13]+=lift;
 registration.shoreLift=lift;
 return registration;
}
