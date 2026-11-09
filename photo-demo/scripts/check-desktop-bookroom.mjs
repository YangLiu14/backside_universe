import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {createBookroomVisit,approachPath} from '../dist/marble-transition-lab/bookroom-visit.js';
import {registerGrotto,roomFrame,seatGrotto} from '../dist/marble-transition-lab/grotto-registration.js';
import {P} from '../dist/holiday-assets/bookroom-interior.js';
import {cameraPose,applyProjection} from '../dist/marble-transition-lab/journey.js';
const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const layout={...json('../dist/holiday-assets/assets/bookroom/grotto-layout.json'),terraceX:.043};
const positions=json('../dist/marble-refined-lab/assets/objects.json').parts.find(p=>p.name==='laptop-lid').positions;
const meta=json('../dist/marble-refined-lab/assets/scene.json'),parameters=meta.calibration.parameters;
const normal=new T.Vector3(...meta.support_plane).applyMatrix3(new T.Matrix3().set(...meta.source_camera_to_world.flat())),constant=1+normal.dot(new T.Vector3(...meta.source_camera_position));
const surface=(x,z)=>(constant-normal.x*x-normal.z*z)/normal.y;
function fixture(){
 const registration=seatGrotto(registerGrotto(positions),surface),worldFromRoom=registration.matrix.clone().multiply(roomFrame(layout)),inverse=worldFromRoom.clone().invert();
 const toWorld=p=>p.clone().applyMatrix4(worldFromRoom),toRoom=p=>p.clone().applyMatrix4(inverse);
 const center=toWorld(P(.030,.550,.055)),right=new T.Vector3(.008,0,0).transformDirection(worldFromRoom).multiplyScalar(.002),up=new T.Vector3(0,0,-1).transformDirection(worldFromRoom).multiplyScalar(.00264);
 const frame={center,right,up,normal:right.clone().cross(up).normalize()};
 return {layout,registration,worldFromRoom,toWorld,toRoom,islandToWorld:p=>p.clone().applyMatrix4(registration.matrix),entryTarget:P(.043,.672,.092),interior:{pivot:new T.Group(),furniture:[],book:{frame:()=>frame}}};
}
function harness({reduced=false,failReturn=false}={}){
 const grotto=fixture(),camera=new T.PerspectiveCamera(50,2.95,.012,30),states=[],messages=[],photos=[];let returned=0,exited=0;
 function desk(progress){const pose=cameraPose(parameters,progress);camera.position.copy(pose.position);camera.quaternion.copy(pose.quaternion);camera.near=.012;applyProjection(camera,parameters,progress,2.95);camera.updateMatrixWorld();}
 desk(1);const original=camera.matrixWorld.toArray();
 const visit=createBookroomVisit(grotto,camera,{aspect:()=>2.95,reduced:()=>reduced,onChange:s=>states.push(s.stage),onStatus:s=>messages.push(s),onPhoto:x=>photos.push(x),onReturn:async()=>{if(failReturn)throw Error('GS unavailable');returned++;desk(0);},onExit:()=>{exited++;desk(1);}});
 async function run(action){const promise=action();for(let i=0;visit.busy&&i<1000;i++){visit.tick(.05);await Promise.resolve();assert(camera.position.toArray().every(Number.isFinite));assert(camera.near>0);assert(Math.abs(camera.quaternion.length()-1)<1e-6);}assert(!visit.busy,'action should settle');await promise;}
 return {visit,grotto,camera,original,run,states,messages,photos,desk,get returned(){return returned;},get exited(){return exited;}};
}

test('grotto registration preserves shape and aligns the lid hinge and width',()=>{
 const {registration:r,worldFromRoom,toWorld,toRoom}=fixture(),a=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();r.matrix.decompose(a,q,s);
 assert(Math.abs(s.x-s.y)<1e-12&&Math.abs(s.x-s.z)<1e-12);assert(r.matrix.determinant()>0);
 assert(new T.Vector3(0,-.2926877737,-.2559156716).applyMatrix4(r.matrix).distanceTo(r.lower.clone().add(new T.Vector3(0,r.shoreLift,0)))<1e-10);
 const shore=new T.Vector3(0,-.36,-1).applyMatrix4(r.matrix);
 const depth=surface(shore.x,shore.z)-shore.y;
 assert(depth>.010 && depth<.012,'front base should sit just under the live water');
 assert(Math.abs(.93*s.x-new T.Vector3().fromArray(positions,15).distanceTo(new T.Vector3().fromArray(positions,12)))<1e-10);
 for(const p of [P(.043,.724,.1275),P(.030,.610,.100),P(.200,.530,.045)])assert(toRoom(toWorld(p)).distanceTo(p)<1e-12);
 assert(worldFromRoom.determinant()>0);
});

test('the offshore approach keeps the bookroom door in view',async()=>{
 const {visit,camera,grotto}=harness();
 camera.position.set(-.27,1.13,-2.49);camera.lookAt(-.20,.93,-2.20);camera.updateMatrixWorld();
 const door=grotto.toWorld(grotto.entryTarget),entry=visit.start();
 for(let i=0;i<105;i++){
  visit.tick(.04);await Promise.resolve();
  if(i>=40){
   const target=door.clone().project(camera);
   assert(target.z>-1&&target.z<1&&Math.abs(target.x)<.4&&Math.abs(target.y)<.4,'door left the approach shot');
  }
 }
 await entry;
});

test('dragging right and left turns toward that side on the terrace and inside',async()=>{
 const {visit,camera,run}=harness({reduced:true});
 for(const action of [visit.start,visit.actions.enter]){
  await run(action);
  for(const dx of [40,-40]){
   const position=camera.position.clone();
   const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion);
   visit.rotate(dx,0);
   assert(camera.getWorldDirection(new T.Vector3()).dot(right)*Math.sign(dx)>.05,'turn toward the dragged side');
   assert(camera.position.equals(position),'turn in place');
  }
 }
});

test('same camera completes repeated door, room, book and original-GS loops',async()=>{
 for(const reduced of [false,true]){
  const h=harness({reduced}),{visit:v}=h;
  for(let cycle=1;cycle<=2;cycle++){
   h.desk(1);await h.run(v.start);assert.equal(v.state.stage,'terrace');assert(!v.walkable(.043,.682),'closed door blocks manual walking');
   await h.run(v.actions.enter);assert.equal(v.state.stage,'inside');assert(v.state.doorOpen);
   const p=h.grotto.toRoom(h.camera.position);assert(Math.hypot(p.x-.063,-p.z-.610)<1e-9);
   await h.run(v.actions.read);assert.equal(v.state.stage,'book');
   await h.run(v.actions.photo);assert.equal(v.state.stage,'desk');assert.equal(v.state.cycles,cycle);assert(!v.state.doorOpen);assert.equal(h.photos.at(-1),0);
   const expected=cameraPose(parameters,0).position;assert(h.camera.position.distanceTo(expected)<1e-9);
  }
  assert.equal(h.returned,2);assert.equal(h.exited,0);
 }
});

test('reverse exit walks through the doorway and returns to the table pose',async()=>{
 const h=harness(),v=h.visit;await h.run(v.start);await h.run(v.actions.enter);await h.run(v.actions.read);
 await h.run(v.actions.desktop);assert.equal(v.state.stage,'desk');assert.equal(h.exited,1);assert.deepEqual(h.camera.matrixWorld.toArray(),h.original);
 assert(h.states.includes('departing'));assert.equal(v.state.cycles,0);
});

test('failed GS preparation keeps a readable book and a working way out',async()=>{
 const h=harness({reduced:true,failReturn:true}),v=h.visit;await h.run(v.start);await h.run(v.actions.enter);await h.run(v.actions.read);await h.run(v.actions.photo);
 assert.equal(v.state.stage,'book');assert.equal(v.state.cycles,0);assert.equal(h.photos.at(-1),0);assert(h.messages.includes('GS unavailable'));
 await h.run(v.actions.desktop);assert.equal(v.state.stage,'desk');assert.equal(h.exited,1);
});

test('busy actions cannot launch a second camera flight',async()=>{
 const h=harness(),v=h.visit;const start=v.start();await v.actions.enter();await v.actions.photo();assert.equal(v.state.stage,'approaching');
 for(let i=0;v.busy&&i<120;i++){v.tick(.05);await Promise.resolve();}await start;assert.equal(v.state.stage,'terrace');assert(!v.state.doorOpen);
});

// Export the runtime curve, in the GLB's Blender coordinates, for optional
// mesh-level verification with check-desktop-bookroom-path.py.
if(process.argv.includes('--export-path')){
 const g=fixture(),curve=new T.CatmullRomCurve3(approachPath(g,cameraPose(parameters,1).position),false,'centripetal'),inverse=g.registration.matrix.clone().invert();
 const samples=Array.from({length:1601},(_,i)=>{const p=curve.getPoint(i/1600).applyMatrix4(inverse);return[p.x,-p.z,p.y];});
 const out=new URL('../evidence/desktop-bookroom/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('approach-path.json',out),JSON.stringify({samples},null,2));
}
