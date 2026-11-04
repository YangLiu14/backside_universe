import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sampleJourney,JOURNEY_MS,orbitPose} from '../dist/journey.js';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const file of readdirSync(root+'dist').filter(f=>f.endsWith('.js')))execFileSync(process.execPath,['--check',root+'dist/'+file]);
assert.ok(JOURNEY_MS>=3000&&JOURNEY_MS<=5000);
let prior=sampleJourney(0);const outward=[];
for(let i=0;i<=1000;i++){
  const state=sampleJourney(i/1000);outward.push(state);
  for(const key of Object.keys(state)){
    assert.ok(Number.isFinite(state[key])&&state[key]>=0&&state[key]<=1);
    assert.ok(state[key]>=prior[key],key+' must not jump backwards while advancing');
    assert.ok(state[key]-prior[key]<.02,key+' must not introduce a visible discontinuity');
  }prior=state;
}
for(let i=1000;i>=0;i--)assert.deepEqual(sampleJourney(i/1000),outward[i],'Scrubbing back must restore the same scene state');
assert.equal(sampleJourney(0).seam,0);assert.equal(sampleJourney(1).seam,1);
const origin=[-3.1359539820995392,5.244107503198223,9.66299647221417],center=[.94,.23,-.29];
const home=orbitPose(sampleJourney(0),origin,center),back=orbitPose(sampleJourney(1),origin,center);
for(let i=0;i<3;i++)assert.ok(Math.abs(home.position[i]-origin[i])<1e-10,'Home must be the calibrated photo camera');
const direction=point=>{const x=point[0]-center[0],z=point[2]-center[2],length=Math.hypot(x,z);return [x/length,z/length];};
const a=direction(home.position),b=direction(back.position);
assert.ok(a[0]*b[0]+a[1]*b[1]<-.999,'The endpoint must physically face the opposite side of fixed objects');
assert.equal(back.angle,Math.PI,'The path must rotate 180 degrees, not just zoom');
assert.equal(sampleJourney(.39).seam,1,'The depth-photo layer must be retired before large-angle orbiting');
assert.equal(sampleJourney(.48).holiday,0,'Do not reveal the holiday in the original front view');
assert.ok(sampleJourney(.7).holiday>.3,'The coast must be discovered while moving behind the objects');
const depth=JSON.parse(readFileSync(root+'dist/assets/desk-depth.json'));
assert.equal(depth.model_license,'Apache-2.0');assert.ok(existsSync(root+'dist/assets/'+depth.browser_file));
const fit=JSON.parse(readFileSync(root+'dist/assets/laptop-fit.json'));
const sub=(a,b)=>a.map((v,i)=>v-b[i]),length=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const horizontal=sub(fit.screen[1],fit.screen[0]),vertical=sub(fit.screen[3],fit.screen[0]);
assert.ok(Math.abs(length(horizontal)/length(vertical)-1.55)<1e-6,'The screen must remain landscape at every viewing angle');
assert.ok(Math.abs(dot(horizontal,vertical))<1e-8,'The display must be rectangular');
assert.ok(Math.abs(dot(sub(fit.base[1],fit.base[0]),sub(fit.base[3],fit.base[0])))<1e-8,'The laptop chassis must be rectangular');
assert.deepEqual(fit.base[0],fit.screen[3]);assert.deepEqual(fit.base[1],fit.screen[2]);
assert.ok(fit.rms<4,'Rigid fit must stay within four source pixels RMS');
for(let i=0;i<=390;i++){const st=sampleJourney(i/1000);assert.equal(st.turn,0);assert.equal(st.approach,0);}
for(const asset of ['laptop-screen','laptop-deck','book-cover','desk-surface','window-surface'])assert.ok(existsSync(root+'dist/assets/objects/'+asset+'.png'));
console.log('Rigid geometry, shared hinge and photo handoff constraints pass.');
console.log('JavaScript parses; 4.5s timeline is continuous/reversible; camera physically orbits 180°; photograph retires before side views; holiday is hidden from the front.');

for(const name of ['laptop','chair','lamp','note']){
 const glb=readFileSync(root+'dist/assets/'+name+'-hi3d.glb');
 assert.equal(glb.toString('ascii',0,4),'glTF');assert.equal(glb.readUInt32LE(4),2);assert.equal(glb.readUInt32LE(8),glb.length,name+' GLB download must be complete');
}
const furniture=JSON.parse(readFileSync(root+'dist/assets/generated-furniture-fit.json'));
for(const name of ['chair','lamp','note']){
 const f=furniture[name];assert.equal(f.file,name+'-hi3d.glb');
 assert.ok(Number.isFinite(f.scale)&&f.scale>0);assert.ok(Number.isFinite(f.yaw));
 assert.ok([...f.position,...f.sourceOrigin].every(Number.isFinite),'All generated model transforms must be finite');
}
console.log('Four Hi3D assets are complete and three furniture registrations are valid.');
