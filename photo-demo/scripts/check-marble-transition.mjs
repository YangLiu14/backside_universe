import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {cameraPose,applyProjection,sampleJourney,DURATION} from '../dist/marble-transition-lab/journey.js';

const meta=JSON.parse(readFileSync(new URL('../dist/marble-refined-lab/assets/scene.json',import.meta.url)));
const p=meta.calibration.parameters,camera=new THREE.PerspectiveCamera(50,1,.012,30);
assert(DURATION>=3000&&DURATION<=5000);
assert.equal(sampleJourney(-1).progress,0);assert.equal(sampleJourney(2).progress,1);
assert.equal(sampleJourney(0).handoff,0);assert.equal(sampleJourney(1).handoff,1);
assert.equal(sampleJourney(0).sea,0,'Original photo view must keep a dry desk');
assert.equal(sampleJourney(1).sea,1,'Backside must complete the tabletop sea');
assert(cameraPose(p,0).position.distanceTo(new THREE.Vector3(p.x,p.y,p.z))<1e-10);
let maxPositionStep=0,maxRotationStep=0,maxProjectionStep=0;
for(const aspect of [.55,1.7,2.95]){
  let prior=null,previousBlend=0,previousSea=0;
  const forward=[];
  for(let i=0;i<=3600;i++){
    const progress=i/3600,state=sampleJourney(progress),pose=cameraPose(p,progress,aspect);
    applyProjection(camera,p,progress,aspect);
    assert(pose.position.toArray().every(Number.isFinite));assert(Math.abs(pose.quaternion.length()-1)<1e-9);
    assert(state.handoff>=previousBlend&&state.handoff<=1);previousBlend=state.handoff;
    assert(state.sea>=previousSea&&state.sea<=1);previousSea=state.sea;
    const record={position:pose.position.toArray(),quaternion:pose.quaternion.toArray(),projection:camera.projectionMatrix.toArray(),state};forward.push(record);
    if(prior){
      maxPositionStep=Math.max(maxPositionStep,pose.position.distanceTo(new THREE.Vector3(...prior.position)));
      maxRotationStep=Math.max(maxRotationStep,pose.quaternion.angleTo(new THREE.Quaternion(...prior.quaternion)));
      maxProjectionStep=Math.max(maxProjectionStep,...record.projection.map((v,j)=>Math.abs(v-prior.projection[j])));
    }
    prior=record;
  }
  for(let i=3600;i>=0;i--){
    const progress=i/3600,pose=cameraPose(p,progress,aspect);applyProjection(camera,p,progress,aspect);
    assert.deepEqual({position:pose.position.toArray(),quaternion:pose.quaternion.toArray(),projection:camera.projectionMatrix.toArray(),state:sampleJourney(progress)},forward[i]);
  }
}
assert(maxPositionStep<.006,'Camera position has a discontinuity');
assert(maxRotationStep<.004,'Camera orientation has a discontinuity');
assert(maxProjectionStep<.008,'Projection jumps during lens framing');
const center=new THREE.Vector3(.04,.89,-2.46),front=cameraPose(p,0).position.sub(center).setY(0).normalize(),back=cameraPose(p,1).position.sub(center).setY(0).normalize();
assert(front.dot(back)<-.99,'Camera must physically arrive behind the fixed objects');
console.log(JSON.stringify({samplesPerAspect:3601,aspects:3,maxPositionStep,maxRotationStep,maxProjectionStep,exactReverse:true,backside:true,durationMs:DURATION},null,2));
