import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../dist/vendor/three.module.js';

const source=await readFile(new URL('../pipeline/viewer/room-walk.js',import.meta.url),'utf8');
const moduleSource=source.replace("'three'",JSON.stringify(new URL('../dist/vendor/three.module.js',import.meta.url).href));
const {createRoomWalk}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
const V=(...v)=>new T.Vector3(...v);

test('each WASD key moves in its camera-relative direction, then stops on release',()=>{
  const walk=createRoomWalk({canStandAt:()=>true,minEye:1.1,maxEye:1.85,standingEye:1.65,crouchingEye:1.12,stride:4.45});
  for(const yaw of [0,.122,Math.PI/2,Math.PI,-Math.PI/2]) {
    const front=V(Math.sin(yaw),0,-Math.cos(yaw)),right=V(Math.cos(yaw),0,Math.sin(yaw));
    for(const [key,direction] of [['KeyW',front],['KeyS',front.clone().negate()],['KeyA',right.clone().negate()],['KeyD',right]]) {
      const start=V(8,1.65,7.6);walk.start(start,start.clone().add(front));
      walk.key(key,true);walk.update(.1,{move:{x:0,y:0},look:{x:0,y:0}});walk.key(key,false);
      const delta=walk.position.clone().sub(start);
      assert(delta.clone().normalize().dot(direction)>.999,`${key} must move ${direction.toArray()}, got ${delta.toArray()}`);
      const released=walk.position.clone();walk.update(.1,{move:{x:0,y:0},look:{x:0,y:0}});
      assert(walk.position.distanceTo(released)<1e-10,`${key} must stop on release`);
    }
  }
});
