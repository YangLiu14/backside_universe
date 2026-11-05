import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {bookView} from '../dist/holiday-assets/bookroom-book.js';
import {sourceCrop} from '../dist/marble-transition-lab/journey.js';
import {createBookPortal} from '../dist/holiday-assets/bookroom-portal.js';

test('the book uses the unchanged input photo and original desk GLB',()=>{
 const hash=path=>createHash('sha256').update(readFileSync(new URL(path,import.meta.url))).digest('hex');
 assert.equal(hash('../dist/assets/desk-original.jpg'),'a5a2ad89c596347fb97f38b9741b2d5e831f657cefa33b4150d7709c8d9365a0');
 assert.equal(hash('../dist/holiday-assets/assets/bookroom/desk.glb'),'c9d8f42646681e4d1c0f366acd88f1de724d84f9d746e9f8bcd37866855cab8f');
});

test('zoomed book crop reaches all four GS viewport corners, at phone and desktop aspects',()=>{
 for(const aspect of [.55,.78,1.25,1.7,2.95])for(const scale of [.063,.084])for(const angle of [0,Math.PI,.67]){
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,.2,angle));
  const center=new THREE.Vector3(.02,.12,-.48),right=new THREE.Vector3(.125*scale,0,0).applyQuaternion(q),up=new THREE.Vector3(0,.125*1739/1320*scale,0).applyQuaternion(q),normal=right.clone().cross(up).normalize();
  const frame={center,right,up,normal},pose=bookView(frame,aspect,true);
  const camera=new THREE.PerspectiveCamera(pose.fov,aspect,.0001,30);camera.position.copy(pose.position);camera.quaternion.copy(pose.quaternion);camera.updateMatrixWorld();
  const [x,y,w,h]=sourceCrop(aspect);
  for(const [u,v,expectedX,expectedY] of [[x,y,-1,1],[x+w,y,1,1],[x,y+h,-1,-1],[x+w,y+h,1,-1]]){
   const p=center.clone().addScaledVector(right,u-.5).addScaledVector(up,.5-v).project(camera);
   assert(Math.abs(p.x-expectedX)<1e-9);assert(Math.abs(p.y-expectedY)<1e-9);
  }
  const reading=bookView(frame,aspect,false);
  assert(reading.position.distanceTo(center)>pose.position.distanceTo(center));
  assert(reading.position.toArray().every(Number.isFinite));
 }
});

function harness(t){
 const saved=Object.fromEntries(['window','document','location'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let receive;const frames=[],changes=[],errors=[];let revisits=0;
 const origin='http://127.0.0.1:9988';
 globalThis.window={addEventListener(type,fn){if(type==='message')receive=fn;}};
 globalThis.location={origin};
 globalThis.document={createElement(){const frame={sent:[],removed:false,contentWindow:{postMessage(data,target){assert.equal(target,origin);frame.sent.push(data);},focus(){}},remove(){frame.removed=true;}};frames.push(frame);return frame;}};
 const container={dataset:{},style:{},attributes:{},inert:true,setAttribute(k,v){this.attributes[k]=v;},replaceChildren(frame){this.frame=frame;}};
 const portal=createBookPortal(container,{onChange:s=>changes.push(s),onRevisit:()=>revisits++,onError:e=>errors.push(e.message)});
 t.after(()=>{for(const [k,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k];}});
 return {portal,container,frames,changes,errors,get revisits(){return revisits;},message(data,source=frames.at(-1).contentWindow,from=origin){receive({data,source,origin:from});}};
}

test('one iframe survives repeat visits; only the intended frame can complete a handoff',async t=>{
 const h=harness(t),{portal}=h,first=portal.preload();
 assert.equal(portal.preload(),first);assert.equal(h.frames.length,1);
 h.message({type:'book-world:ready'},{},'http://elsewhere.test');assert.equal(portal.state,'loading');
 h.message({type:'book-world:ready'},{},'http://127.0.0.1:9988');assert.equal(portal.state,'loading');
 h.message({type:'book-world:ready'});await first;assert.equal(portal.state,'ready');
 for(let i=0;i<3;i++){
  let resolved=false;const prepared=portal.prepare(i===2).then(()=>{resolved=true;});await Promise.resolve();
  const request=h.frames[0].sent.at(-1);assert.equal(request.type,'book-world:prepare');assert.equal(request.reduced,i===2);
  h.message({type:'book-world:prepared',id:request.id+1});await Promise.resolve();assert(!resolved);
  h.message({type:'book-world:prepared',id:request.id});await prepared;
  portal.show();assert.equal(portal.state,'active');assert.equal(h.container.inert,false);
  h.message({type:'book-world:revisit'});portal.hide();assert.equal(portal.state,'ready');assert.equal(h.container.inert,true);
 }
 assert.equal(h.frames.length,1);assert.equal(h.revisits,3);assert.equal(h.errors.length,0);
});

test('load failure is recoverable and late replies from the removed frame are ignored',async t=>{
 const h=harness(t),first=h.portal.preload(),failed=assert.rejects(first,/未能载入/);
 h.message({type:'book-world:error'});await failed;assert.equal(h.portal.state,'error');assert(h.frames[0].removed);
 assert.throws(()=>h.portal.show(),/连接已中断/);
 const retry=h.portal.preload();assert.equal(h.frames.length,2);
 h.message({type:'book-world:ready'},h.frames[0].contentWindow);assert.equal(h.portal.state,'loading');
 h.message({type:'book-world:ready'});await retry;assert.equal(h.portal.state,'ready');
});

test('loading and prepare timeouts both release pending work and allow retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness(t),load=h.portal.preload(),timedOut=assert.rejects(load,/载入时间较长/);
 t.mock.timers.tick(90001);await timedOut;assert.equal(h.portal.state,'error');
 const retry=h.portal.preload();h.message({type:'book-world:ready'});await retry;
 const prepare=h.portal.prepare(false),prepareFailed=assert.rejects(prepare,/暂未准备好/);await Promise.resolve();
 t.mock.timers.tick(20001);await prepareFailed;assert.equal(h.portal.state,'error');
 assert(h.frames.every(f=>f.removed));
});
