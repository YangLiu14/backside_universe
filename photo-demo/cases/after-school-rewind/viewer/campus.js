// The window and the visitor's camera look into this same metre-scale scene.
import * as T from 'three';
import {applyActor, palmLandmark, poseActor} from './props.js';
import {sample} from './memory.js';
import {createRoomWalk} from './room-walk.js';

const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
export const threshold = V(8.5,2.55,11.2);
export const landing = V(8.0,1.65,7.6);
export const landingLook = V(9.1,1.72,-1.4);

function treeFromCourt(court) {
  const tree = new T.Group();
  for (const part of court.children) {
    const g=part.geometry, pos=g.attributes.position, index=g.index, keep=[];
    for(let i=0;i<(index?.count??pos.count);i+=3){
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      const x=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3,y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3,z=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
      if(y>-.448 && z>-.241 && x<.008 && (y>.045||x<-.257))keep.push(a,b,c);
    }
    if(!keep.length)continue;
    const crown=g.clone();crown.setIndex(keep);crown.translate(.428,.445,.12);
    tree.add(new T.Mesh(crown,part.material));
  }
  return tree;
}

export function makeCampus(pieces, textures, env, calibration) {
  const scene=new T.Scene();scene.name='放学后的校园';
  scene.background=textures.sky;scene.environment=env;scene.environmentIntensity=.47;
  scene.fog=new T.FogExp2(0xc9c8af,.007);
  scene.add(new T.HemisphereLight(0xe1edff,0xbb9976,.92));
  const sun=new T.DirectionalLight(0xffe2af,2.65);
  sun.position.set(-28,35,21);sun.castShadow=true;sun.shadow.mapSize.setScalar(innerWidth<650?1024:2048);
  Object.assign(sun.shadow.camera,{left:-35,right:35,top:31,bottom:-31,near:.5,far:115});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00028;sun.shadow.normalBias=.021;
  scene.add(sun,sun.target);
  const ground=new T.Mesh(new T.PlaneGeometry(170,145),new T.MeshStandardMaterial({color:0xb4aca0,map:textures.ground,roughness:.97}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.102;ground.receiveShadow=true;scene.add(ground);
  const obstacles=[];
  function place(model,x,y,z,width,height,depth,yaw=0) {
    scene.add(model);model.position.set(x,y,z);model.scale.set(width,height,depth);model.rotation.y=yaw;
    model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    return model;
  }
  const field=place(pieces.field,0,-.077,0,31.9,.15,18.1);
  field.traverse(o=>{
    if(!o.isMesh)return;
    o.castShadow=false;
    for(const mat of [].concat(o.material)){
      mat.side=T.DoubleSide;mat.roughness=.94;
      mat.onBeforeCompile=shader=>{
        shader.uniforms.courtTop={value:textures.surface};
        shader.vertexShader='varying vec2 floorUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloorUV=vec2(.5+position.x,.5-position.z);');
        shader.fragmentShader='uniform sampler2D courtTop; varying vec2 floorUV;\n'+shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=texture2D(courtTop,clamp(floorUV,0.,1.)).rgb;');
      };
    }
  });
  function building(model,x,z,w,h,d,yaw){
    place(model,x,h/2-.09,z,w,h,d,yaw);
    const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
    obstacles.push([x,z,(c*w+s*d)/2+.32,(s*w+c*d)/2+.32]);
  }
  building(pieces.classblock,-1,-19.2,39,11.1,8.6,0);
  building(pieces.classblock.clone(true),-24.2,4.2,27.5,8.6,6.6,Math.PI/2);
  building(pieces.gymhall,25.8,-1.7,25,7.35,10.1,-Math.PI/2);
  // Reuse the physical broadcast booth for the face visible when looking back from the court.
  const booth=pieces.interior.clone(true);
  place(booth,threshold.x,2.2,12.83,7.4,4.55,3.1,0);
  const studioWing=pieces.gymhall.clone(true);
  building(studioWing,threshold.x,15.62,21.4,6.3,8.0,Math.PI);
  for(const part of studioWing.children){
    const trim=source=>{
      const mat=source.clone();
      mat.onBeforeCompile=s=>{
        s.vertexShader='varying vec3 studioPoint;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nstudioPoint=position;');
        s.fragmentShader='varying vec3 studioPoint;\n'+s.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(studioPoint.z>.30 && abs(studioPoint.x)<.126 && studioPoint.y>-.285 && studioPoint.y<.14)discard;');
      };return mat;
    };
    part.material=Array.isArray(part.material)?part.material.map(trim):trim(part.material);
  }
  const boundary=new T.MeshStandardMaterial({color:0x8c7b6a,roughness:.98,map:textures.brick});
  const cap=new T.MeshStandardMaterial({color:0x88877d,roughness:.92});
  function wall(x,z,length,angle){
    const wall=new T.Group();scene.add(wall);wall.position.set(x,0,z);wall.rotation.y=angle;
    function block(x,y,w,h,d,mat){
      const g=new T.BoxGeometry(w,h,d);
      if(mat===boundary){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*w/2.5,uv.getY(i)*h/1.5);}
      const m=new T.Mesh(g,mat);m.position.set(x,y,0);m.castShadow=m.receiveShadow=true;wall.add(m);
    }
    block(0,.70,length,1.6,.27,boundary);block(0,1.53,length,.10,.39,cap);
    for(let x=-length/2;x<=length/2;x+=4)block(x,.75,.41,1.69,.43,boundary);
  }
  wall(0,21.5,70,0);wall(0,-26.8,70,0);wall(33,0,53.8,Math.PI/2);wall(-31.5,0,53.8,Math.PI/2);
  const tree=treeFromCourt(pieces.court);
  for(const [i,[x,z,h,angle]] of [[-17.4,-10.7,7.4,.42],[-6.5,-12.1,6.8,2.6],[17.4,-9.8,6.5,1.8],[-17,9.8,6.2,3.5],[-8,13.3,7.1,5.1],[19,11,6.7,4.2]].entries()){
    const plant=i?tree.clone(true):tree;
    place(plant,x,-.09,z,h*1.57,h,h*2.25,angle);
    obstacles.push([x,z,.34,.34]);
  }
  const rimLocal=V(...calibration.basket.rim),size=calibration.basket.dimensions;
  const goals=[];
  for(const side of [1,-1]){
    const hoop=side===1?pieces.basket:pieces.basket.clone(true),yaw=-side*Math.PI/2;
    const base=V(side*12.43,3.05,0),offset=rimLocal.clone().multiply(V(...size)).applyAxisAngle(V(0,1,0),yaw);
    const pos=base.clone().sub(offset);place(hoop,pos.x,pos.y,pos.z,...size,yaw);
    goals.push(hoop);obstacles.push([side*14.75,0,.43,.55]);
  }
  // Soft contact at the post and feet sits just above the irregular scanned asphalt.
  const stamp=document.createElement('canvas');stamp.width=stamp.height=96;
  const ctx=stamp.getContext('2d'),shade=ctx.createRadialGradient(48,48,2,48,48,46);
  shade.addColorStop(0,'rgba(40,31,24,.63)');shade.addColorStop(.42,'rgba(52,44,34,.32)');shade.addColorStop(1,'rgba(55,47,38,0)');
  ctx.fillStyle=shade;ctx.fillRect(0,0,96,96);
  const contactMat=new T.MeshBasicMaterial({map:new T.CanvasTexture(stamp),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const patch=(width,depth)=>{const m=new T.Mesh(new T.PlaneGeometry(width,depth),contactMat);m.rotation.x=-Math.PI/2;m.position.y=.012;scene.add(m);return m;};
  const rim=goals[0].localToWorld(rimLocal.clone());
  const player=place(pieces.shooter,7.15,.85,.45,.65,1.7,.46,1.65);poseActor(player,'shooter');
  const walkers=[place(pieces.walker,4,.80,-3.5,.52,1.6,.40),place(pieces.walker.clone(true),5.1,.83,-4.3,.55,1.66,.41)];
  for(const walker of walkers)poseActor(walker,'walker');
  const ball=place(pieces.ball,0,0,0,.242,.242,.242),mark=palmLandmark(player),hand=V();
  const contacts=[patch(1.05,.69),patch(.72,.46),patch(.72,.46)];
  const touch=w=>mark.rest.clone().addScaledVector(mark.delta,w).multiply(player.scale).applyQuaternion(player.quaternion).add(player.position);
  const from=touch(1).add(V(.121,0,0)),peak=Math.max(from.y,rim.y)+1.38;
  function animate(t) {
    const s=sample(t),pose=s.reach+.12*s.follow;applyActor(player,pose);hand.copy(touch(pose));
    if(t<=1)ball.position.copy(hand).x+=.121;
    else {
      const dt=t-1;ball.position.lerpVectors(from,rim,dt/3);
      ball.position.y=dt<=1.3?peak-(peak-from.y)*(1-dt/1.3)**2:peak-(peak-rim.y)*((dt-1.3)/1.7)**2;
    }
    ball.rotation.z=-s.backspin;
    walkers.forEach((w,i)=>{w.position.x=5.9+i*1.1+t*.52;w.position.y=w.scale.y/2+s.students[i].lift*.018;applyActor(w,s.students[i].step);});
    [player,...walkers].forEach((actor,i)=>{contacts[i].position.x=actor.position.x;contacts[i].position.z=actor.position.z;});
  }
  function canStandAt(x,z){
    return x> -30.5&&x<32&&z> -26&&z<19.3&&!obstacles.some(([cx,cz,rx,rz])=>Math.abs(x-cx)<rx&&Math.abs(z-cz)<rz)
      && Math.hypot(x-player.position.x,z-player.position.z)>.5
      && walkers.every(w=>Math.hypot(x-w.position.x,z-w.position.z)>.43);
  }
  const walk=createRoomWalk({canStandAt,minEye:1.1,maxEye:1.85,standingEye:1.65,crouchingEye:1.12,stride:4.45,collisionStep:.12});
  animate(0);
  return {scene,walk,booth,studioWing,animate,ball,hand,rim,walkers,canStandAt,
    get palmGap(){return Math.abs(hand.distanceTo(ball.position)-.121);}};
}
