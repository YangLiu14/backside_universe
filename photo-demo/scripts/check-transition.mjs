import assert from 'node:assert/strict';
import {sampleJourney} from '../dist/journey.js';
// The handoff must continue changing framing or orbit; a still interval reads
// as two separate shots even if both individual easing curves are smooth.
for(let p=.16;p<.45;p+=.005){
 const a=sampleJourney(p),b=sampleJourney(p+.005);
 const motion=Math.hypot(...['aim','framing','approach','turn'].map(k=>b[k]-a[k]));
 assert.ok(motion>1e-5,`Camera handoff stalls at progress ${p.toFixed(3)}`);
}
console.log('PASS: no static interval in the first two seconds of the handoff.');

const {orbitPose,framingFov,discoveryWeight}=await import('../dist/journey.js');
const origin=[-3.1359539820995392,5.244107503198223,9.66299647221417],center=[.94,.23,-.29],radius=Math.hypot(...origin.map((v,i)=>v-center[i]));
for(const portrait of [false,true]){
 const homeFov=portrait?66.6:43.5873080583;let lastHalf=Infinity;const frames=[];
 for(let i=0;i<=1000;i++){
  const state=sampleJourney(i/1000),pose=orbitPose(state,origin,center,portrait),fov=framingFov(state,homeFov,radius,pose.radius,portrait),half=pose.radius*Math.tan(fov*Math.PI/360);
  assert.ok(Number.isFinite(fov)&&fov>5&&fov<90);assert.ok(half<=lastHalf+1e-9,'Framing must not zoom backwards at the handoff');lastHalf=half;
  if(i<=390)assert.ok(Math.hypot(...pose.position.map((v,j)=>v-origin[j]))<1e-8,'Never translate the depth photo');
  if(i===0)assert.ok(Math.abs(fov-homeFov)<1e-8,'Original photograph camera must match');
  frames.push({pose,fov});
 }
 for(let i=1000;i>=0;i--){const s=sampleJourney(i/1000),pose=orbitPose(s,origin,center,portrait);assert.deepEqual({pose,fov:framingFov(s,homeFov,radius,pose.radius,portrait)},frames[i]);}
}
for(const x of [-1,-.3,.2,1,1.8,3]){
 let prior=0;
 for(let i=0;i<=1000;i++){const weight=discoveryWeight(i/1000,x);assert.ok(weight>=prior&&weight-prior<.008,'Discovery must not switch on as a whole group');prior=weight;}
 assert.equal(discoveryWeight(0,x),0);assert.equal(discoveryWeight(1,x),1);
}
console.log('PASS: framing monotonic, source projection fixed, exact reverse path, continuous spatial discovery.');
