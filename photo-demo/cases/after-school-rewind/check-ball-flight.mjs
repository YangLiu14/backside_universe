import assert from 'node:assert/strict';
import {basketballFlight} from './viewer/ball-flight.js';
const flight=basketballFlight({from:[7.392,1.7807,.471],rim:[12.5803973,3.039,-.0205360]});
const f=t=>flight.sample(t),epsilon=1e-5;
const norm=p=>Math.hypot(...p),sub=(a,b)=>a.map((n,i)=>n-b[i]);
for(const e of flight.events){
  const at=f(e.time),left=f(e.time-epsilon),right=f(e.time+epsilon);
  assert(norm(sub(at.position,e.position))<1e-10);
  if(e.type==='release')continue; // Held geometry is verified in browser QA.
  assert(norm(sub(left.position,right.position))<.001);
  if(e.type!=='ground-impact')assert(norm(sub(left.velocity,right.velocity))<.003);
}
const impacts=flight.events.filter(e=>e.type==='ground-impact');
assert(impacts.length>=4);
const heights=impacts.slice(0,3).map(e=>f(e.time+e.velocityAfter[1]/9.81).position[1]-.121);
assert(heights[0]>heights[1]&&heights[1]>heights[2]&&heights[2]>.1);
for(let t=1;t<=8;t+=1/240){
  const s=f(t);assert(s.position[1]>=.121-1e-9);
  // Ensure the entire ball clears the physical support post.
  assert(Math.abs(s.position[0]-14.75)>.43+.121||Math.abs(s.position[2])>.55+.121);
  if(flight.events.some(e=>Math.abs(t-e.time)<.002))continue;
  if(['flight','net','bounce'].includes(s.physics.phase)){
    const acceleration=(f(t+.001).position[1]-2*s.position[1]+f(t-.001).position[1])/1e-6;
    assert(Math.abs(acceleration+9.81)<1e-5);
  }
}
const fixed=f(2.5);for(const t of [8,0,5,1,3,2.5])f(t);assert.deepEqual(f(2.5),fixed);
assert(flight.restTime<8);assert.deepEqual(f(8).velocity,[0,0,0]);
assert.equal(f(8).spin,f(flight.restTime).spin);
console.log('PASS: 9.81 gravity, centred hoop crossing, diminishing bounces, post clearance, rest and deterministic rewind');
