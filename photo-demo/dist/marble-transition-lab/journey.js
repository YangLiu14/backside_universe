import * as THREE from '../vendor/three.module.js';
import {orbitPose as registeredOrbit} from '../marble-refined-lab/orbit.js';
import {projectionBounds} from '../marble-lab/camera.js';

export const DURATION = 4800;
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const smooth = (a, b, x) => {const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);};

// Everything is a pure function of progress, including the optical handoff.
// No trigger, accumulated rotation, random reveal or delayed camera catch-up.
export function sampleJourney(value) {
  const progress=clamp01(value), angle=progress*180;
  return {progress, angle, handoff:smooth(52,82,angle), sea:smooth(68,132,angle), time:progress*12,
    label:angle<40?'熟悉的书桌':angle<82?'沿着桌面，走向背后':angle<132?'桌面漫成海，物件成为岛':'原来，书桌是一片群岛'};
}

export function cameraPose(parameters, progress) {
  const {angle}=sampleJourney(progress);
  const pose=registeredOrbit(parameters,angle,true);
  const t=smooth(40,110,angle),a=THREE.MathUtils.degToRad(angle);
  const target=new THREE.Vector3(.04,.89,-2.36);
  const close=new THREE.Vector3(target.x+.80*Math.sin(a),1.27,target.z+.92*Math.cos(a));
  const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(close,target,new THREE.Vector3(0,1,0)));
  pose.position.lerp(close,t);pose.quaternion.slerp(q,t);pose.pivot.lerp(target,t);
  return pose;
}

export function applyProjection(camera,parameters,progress,aspect) {
  // Begin in the registered photograph's tabletop crop. Gradually return to a
  // centred perspective as the camera approaches; no projection-mode switch.
  const height=Math.min(.80,1320/(1739*aspect)),width=Math.min(1,1739*height*aspect/1320);
  const crop=[(1-width)/2,Math.max(0,.46-height/2),width,height];
  const start=projectionBounds(parameters,crop,1320,1739,camera.near);
  const portraitFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(55)/2)/aspect));
  const fov=Math.max(portraitFov,THREE.MathUtils.lerp(56,39,smooth(85,150,progress*180)));
  const top=camera.near*Math.tan(THREE.MathUtils.degToRad(fov)/2),end=[-top*aspect,top*aspect,top,-top];
  const t=smooth(3,55,progress*180),bounds=start.map((v,i)=>THREE.MathUtils.lerp(v,end[i],t));
  camera.projectionMatrix.makePerspective(...bounds,camera.near,camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return crop;
}
