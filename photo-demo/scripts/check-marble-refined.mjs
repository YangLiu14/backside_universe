import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orbitPose,clampRoom} from '../dist/marble-refined-lab/orbit.js';
import {orbitPose as oldPose} from '../dist/marble-lab/camera.js';
import * as THREE from '../dist/vendor/three.module.js';

const meta=JSON.parse(readFileSync(new URL('../dist/marble-refined-lab/assets/scene.json',import.meta.url)));
const p=meta.calibration.parameters;
let maxStep=0,maxAngularStep=0,previous;
for(let a=-120;a<=120.001;a+=.1){
  const current=orbitPose(p,a,true);
  assert(current.position.toArray().every(Number.isFinite));
  assert(Math.abs(current.quaternion.length()-1)<1e-9);
  if(previous){maxStep=Math.max(maxStep,current.position.distanceTo(previous.position));maxAngularStep=Math.max(maxAngularStep,current.quaternion.angleTo(previous.quaternion));}
  if(Math.abs(a)<=12){const old=oldPose(p,a);assert(current.position.distanceTo(new THREE.Vector3(...old.position))<1e-9);assert(current.quaternion.angleTo(new THREE.Quaternion(...old.quaternion))<1e-7);}
  previous=current;
}
assert(maxStep<.02,`Camera jumps ${maxStep} m at a 0.1-degree step`);
assert(maxAngularStep<.02,`Camera orientation jumps ${maxAngularStep} radians`);
for(const a of [-120,-60,-12,0,12,60,120]){
  const first=orbitPose(p,a,true);orbitPose(p,-a,true);const again=orbitPose(p,a,true);
  assert.deepEqual(first.position.toArray(),again.position.toArray());assert.deepEqual(first.quaternion.toArray(),again.quaternion.toArray());
}
const bounded=clampRoom(new THREE.Vector3(999,-999,-999));assert.deepEqual(bounded.toArray(),[1.1,.96,-2.58]);
console.log(JSON.stringify({samples:2401,validatedSmallOrbitMatches:true,maxStepMetres:maxStep,maxStepRadians:maxAngularStep,reversible:true,bounds:true},null,2));
