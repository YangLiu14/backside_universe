import assert from 'node:assert/strict';
import {orbitPose,projectionBounds} from '../dist/marble-lab/camera.js';
const c={x:.1,y:1.4,z:.2,yaw:34,pitch:-25,roll:1,fov:58.46,distance:2.7};
const home=orbitPose(c,0),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
assert.ok(distance(home.position,[c.x,c.y,c.z])<1e-12);
let prior=orbitPose(c,-12);
for(let angle=-12;angle<=12;angle+=.025){
  const pose=orbitPose(c,angle);
  assert.ok(Math.abs(distance(pose.position,pose.pivot)-c.distance)<1e-10);
  assert.ok(distance(prior.position,pose.position)<.002);
  assert.ok(pose.quaternion.every(Number.isFinite));
  assert.deepEqual(pose.pivot,home.pivot);
  prior=pose;
}
const before=orbitPose(c,6);orbitPose(c,-12);assert.deepEqual(orbitPose(c,6),before);
assert.notDeepEqual(orbitPose(c,-12).position,orbitPose(c,12).position);
for(const crop of [[0,0,1,1],[.09,.30,.89,.31],[.34,.35,.25,.15],[.52,.35,.18,.13]]){
 const [l,r,t,b]=projectionBounds(c,crop);assert.ok(l<r&&t>b);
}
assert.throws(()=>orbitPose({...c,distance:0},0));
console.log('Marble camera: fixed-pivot orbit, continuity, exact return and crop projection passed.');
