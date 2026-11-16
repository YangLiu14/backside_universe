// The window and the visitor's camera look into this same metre-scale scene.
import * as T from 'three';
import {cloneCampusActor,dressRiggedActor,animateRiggedActor,actorAnchor,rigDetails,actorSurfacePoints,sampleRig} from './rigged-actors.js';
import {duration} from './memory.js';
import {basketballFlight} from './ball-flight.js';
import {createBasketNet,measuredBasket} from './basket-net.js';
import {dressCourt} from './court-edges.js';
import {restoreGymWindows} from './gym-windows.js';
import {restoreClassroomWindows} from './classroom-windows.js';
import {createRoomWalk} from './room-walk.js';
import {campusSun,campusSunColor,campusSunIntensity} from './campus-light.js';
import {plantCampusTrees} from './campus-trees.js';

const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
export const threshold = V(8.5,2.55,11.2);
export const landing = V(8.0,1.65,7.6);
export const landingLook = V(9.1,1.72,-1.4);

export function makeCampus(pieces, textures, calibration) {
  const scene=new T.Scene();scene.name='放学后的校园';
  scene.background=textures.sky;scene.environment=textures.sky;scene.environmentIntensity=.70;
  scene.fog=new T.FogExp2(0xd5b5a5,.0035);
  scene.add(new T.HemisphereLight(0xb8c8eb,0xb99b79,.85));
  const sun=new T.DirectionalLight(campusSunColor,campusSunIntensity);
  sun.position.copy(campusSun);sun.castShadow=true;sun.shadow.mapSize.setScalar(innerWidth<650?1024:2048);
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
      mat.side=T.DoubleSide;mat.roughness=.94;mat.metalness=0;
      mat.bumpMap=textures.aggregate;mat.bumpScale=.007;
      mat.onBeforeCompile=shader=>{
        shader.uniforms.courtTop={value:textures.surface};
        shader.uniforms.aggregate={value:textures.aggregate};
        shader.vertexShader='varying vec2 floorUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloorUV=vec2(.5+position.x,.5-position.z);');
        shader.fragmentShader='uniform sampler2D courtTop; uniform sampler2D aggregate; varying vec2 floorUV;\n'+shader.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec2 metres=floorUV*vec2(31.9,18.1);
            vec3 surface=texture2D(courtTop,clamp(floorUV,0.,1.)).rgb;
            float grains=texture2D(aggregate,metres*.72).r;
            float whiteLine=smoothstep(.34,.56,dot(surface,vec3(.30,.59,.11)));
            float paintWear=smoothstep(.18,.74,texture2D(aggregate,metres*.054+vec2(.17,.34)).g);
            diffuseColor.rgb=surface*mix(vec3(.78,.86,.92),vec3(1.),whiteLine)*(.92+.13*grains+.08*paintWear);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor=mix(.78+.18*grains,.65+.13*paintWear,whiteLine);`)
          .replace('#include <normal_fragment_maps>', `
            vec2 grainUV=metres*3.6;
            float grainHeight=.012*mix(1.,.35,whiteLine);
            float centreHeight=texture2D(aggregate,grainUV).r;
            vec2 gradient=vec2(texture2D(aggregate,grainUV+dFdx(grainUV)).r-centreHeight,texture2D(aggregate,grainUV+dFdy(grainUV)).r-centreHeight)*grainHeight;
            normal=perturbNormalArb(-vViewPosition,normal,gradient,faceDirection);`);

      };
    }
  });
  function building(model,x,z,w,h,d,yaw){
    place(model,x,h/2-.09,z,w,h,d,yaw);
    const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
    obstacles.push([x,z,(c*w+s*d)/2+.32,(s*w+c*d)/2+.32]);
  }
  // The painted plaster has a finer grain than the atlas of the whole building.
  // Keep the original window, drainpipe and door finishes on their darker texels.
  for(const part of pieces.classblock.children){
    for(const material of [].concat(part.material)){
      material.bumpMap=textures.plaster;material.bumpScale=.005;
      material.onBeforeCompile=shader=>{
        shader.uniforms.wallGrain={value:textures.aggregate};
        shader.uniforms.wallFinish={value:textures.plaster};
        shader.vertexShader='varying vec3 wallPoint;varying vec3 wallAxis;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwallPoint=position;wallAxis=normal;');
        shader.fragmentShader='varying vec3 wallPoint;varying vec3 wallAxis; uniform sampler2D wallGrain; uniform sampler2D wallFinish;\n'+shader.fragmentShader
          .replace('#include <color_fragment>',`#include <color_fragment>
            float oldTone=dot(diffuseColor.rgb,vec3(.3,.59,.11));
            float facade=smoothstep(.12,.19,wallPoint.z)*(1.-smoothstep(.452,.48,wallPoint.y));
            float doorBay=step(-.468,wallPoint.x)*step(wallPoint.x,-.414)
              +step(-.156,wallPoint.x)*step(wallPoint.x,-.135)
              +step(.137,wallPoint.x)*step(wallPoint.x,.161)
              +step(.392,wallPoint.x)*step(wallPoint.x,.422);
            float upperDoor=(step(-.139,wallPoint.y)*step(wallPoint.y,.079)
              +step(.152,wallPoint.y)*step(wallPoint.y,.370))*(1.-smoothstep(.28,.34,wallPoint.z));
            facade*=1.-min(1.,doorBay*upperDoor);
            float plaster=max(facade,smoothstep(.12,.42,oldTone));
            vec2 wallMetres=abs(wallAxis.y)>.65?vec2(wallPoint.x*39.,wallPoint.z*8.6):vec2(wallPoint.x*39.+wallPoint.z*8.6,wallPoint.y*11.1);
            float grit=texture2D(wallGrain,wallMetres*.96).r;
            float lime=texture2D(wallGrain,wallMetres*.14).g;
            vec3 closeFinish=texture2D(wallFinish,wallMetres*.80).rgb;
            diffuseColor.rgb*=mix(vec3(1.),closeFinish/vec3(.79,.73,.62),plaster*.85);
            // The original facade atlas is stretched across the entire block.
            // Preserve its broad age pattern as a restrained tint, while real
            // plaster grain and the grey mineral plinth carry the close view.
            float plinth=1.-smoothstep(-.365,-.345,wallPoint.y);
            vec3 paint=closeFinish*mix(vec3(.92,.92,.89),vec3(.39,.46,.51),plinth);
            paint*=mix(.76,1.,smoothstep(.025,.45,oldTone));
            diffuseColor.rgb=mix(diffuseColor.rgb,paint,facade*.82);
            diffuseColor.rgb*=1.+plaster*(.07*(grit-.5)+.08*(lime-.5));`)
          .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(max(.42,roughnessFactor),.89+.075*grit,plaster);')
          .replace('#include <normal_fragment_maps>',`
            vec2 finishUV=wallMetres*.80;
            float centre=texture2D(wallFinish,finishUV).r;
            vec2 heightChange=vec2(texture2D(wallFinish,finishUV+dFdx(finishUV)).r-centre,texture2D(wallFinish,finishUV+dFdy(finishUV)).r-centre);
            normal=perturbNormalArb(-vViewPosition,normal,heightChange*.045*plaster,faceDirection);`);
      };
    }
  }
  building(pieces.classblock,-1,-19.2,39,11.1,8.6,0);
  restoreClassroomWindows(pieces.classblock,textures);
  building(pieces.classblock.clone(true),-24.2,4.2,27.5,8.6,6.6,Math.PI/2);
  building(pieces.gymhall,25.8,-1.7,25,7.35,10.1,-Math.PI/2);
  // Reuse the physical broadcast booth for the face visible when looking back from the court.
  const booth=pieces.interior.clone(true);
  const boothNative=pieces.interior.userData.native;
  place(booth,threshold.x,2.2,12.83,7.4,7.4*boothNative[1]/boothNative[0],7.4*boothNative[2]/boothNative[0],0);
  const studioWing=pieces.gymhall.clone(true);
  // The radio booth uses its own cropped copy of the original hall exterior.
  restoreGymWindows(pieces.gymhall,textures);
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
  // Give the mature crowns clearance from the classroom and hall facades.
  // The tree pits and surrounding paving use these same positions.
  const beds=[[-17.4,-10.7,7.4,.42],[-6.5,-10.9,6.8,2.6],[17.4,-9.8,6.5,1.8],[-16.6,9.8,6.2,3.5],[-8,13.3,7.1,5.1],[16.7,7.4,6.7,4.2]];
  dressCourt(scene,beds,obstacles,textures);
  const foliage=plantCampusTrees(scene,pieces['campus-tree'],pieces['campus-foliage'],beds,textures);
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
  // Aim at the fitted inner circle of the actual mesh, not the old asset pivot.
  const rim=goals[0].localToWorld(V(...measuredBasket.rimLocal));
  const companion=cloneCampusActor(pieces.walker);
  const player=pieces.shooter,walkers=[pieces.walker,companion];
  dressRiggedActor(player,pieces['shooter-head'],'shooter',textures.actorStructure);
  dressRiggedActor(walkers[0],pieces['walker-head'],'walker',textures.actorStructure);
  dressRiggedActor(walkers[1],pieces['companion-head'],'walker',textures.actorStructure,1);
  place(player,7.15,0,.45,1,1,1,1.65);
  const actorPosition=w=>actorAnchor(w,w.userData.actorMotion.rootBone);
  walkers.forEach((w,i)=>{
    const scale=(i?1.66:1.6)/w.userData.actorMotion.height;
    place(w,0,0,0,scale,scale,scale,Math.PI/2);
    // Retain the approved first four seconds and their original campus placement.
    animateRiggedActor(w,4);const end=actorPosition(w);
    w.position.x=7.98+i*1.1-end.x;w.position.z=-3.5-i*.8-end.z;
  });
  const ball=place(pieces.ball,0,0,0,.242,.242,.242),hand=V();
  const contacts=[patch(1.05,.69),patch(.72,.46),patch(.72,.46)];
  const release=player.userData.actorMotion.releaseTime;
  const ballSocket=()=>actorAnchor(player,player.userData.actorMotion.ballSocket);
  animateRiggedActor(player,release);
  const from=ballSocket(),flight=basketballFlight({from:from.toArray(),rim:rim.toArray(),releaseTime:release,rimRadius:measuredBasket.innerRadius,netDepth:measuredBasket.netDepth});
  const net=createBasketNet(goals[0],rim,flight);
  let ballState=flight.sample(0);
  const launch=flight.events[0].velocityAfter,airSpinAxis=V(-launch[2],0,launch[0]).normalize();
  const groundVelocity=flight.events.find(e=>e.type==='ground-impact').velocityAfter;
  const rollSpinAxis=V(groundVelocity[2],0,-groundVelocity[0]).normalize(),rollRotation=new T.Quaternion();
  const handContacts=()=>actorSurfacePoints(player,'hand').map(p=>{
    const point=V(...p.position),direction=point.clone().sub(ball.position),signedGap=direction.length()-.121;
    return {id:p.id,side:p.side,point:p.position,gap:Math.abs(signedGap),signedGap,
      ballPoint:direction.normalize().multiplyScalar(.121).add(ball.position).toArray()};
  });
  function animate(t) {
    foliage.update(t);
    animateRiggedActor(player,t);hand.copy(ballSocket());
    ballState=flight.sample(t);
    if(t<=release)ball.position.copy(hand);
    else ball.position.fromArray(ballState.position);
    ball.quaternion.setFromAxisAngle(airSpinAxis,ballState.airSpin);
    ball.quaternion.premultiply(rollRotation.setFromAxisAngle(rollSpinAxis,ballState.rollSpin));
    net.update(t,ball.position);
    walkers.forEach(w=>animateRiggedActor(w,t));
    [player,...walkers].forEach((actor,i)=>{const p=actorPosition(actor);contacts[i].position.x=p.x;contacts[i].position.z=p.z;});
  }
  function canStandAt(x,z){
    return x> -30.5&&x<32&&z> -26&&z<19.3&&!obstacles.some(([cx,cz,rx,rz])=>Math.abs(x-cx)<rx&&Math.abs(z-cz)<rz)
      && Math.hypot(x-actorPosition(player).x,z-actorPosition(player).z)>.5
      && walkers.every(w=>{const p=actorPosition(w);return Math.hypot(x-p.x,z-p.z)>.43;});
  }
  const walk=createRoomWalk({canStandAt,minEye:1.1,maxEye:1.85,standingEye:1.65,crouchingEye:1.12,stride:4.45,collisionStep:.12});
  animate(0);
  return {scene,walk,booth,studioWing,animate,ball,hand,rim,walkers,canStandAt,
    ballPhysics:()=>ballState.physics,
    actorDetails:()=>[player,...walkers].map(rigDetails),walkerPositions:()=>walkers.map(actorPosition),handContacts,
    motionSample:t=>({duration,net:net.details(),ballPhysics:ballState.physics,time:t,holding:t<=release,releaseTime:release,actors:[player,...walkers].map((w,i)=>sampleRig(w,i?'walker-'+(i-1):'shooter')),handContacts:handContacts(),ball:ball.position.toArray()}),
    foliageDetails:foliage.details,enableDetailSelection:foliage.enableDetailSelection,
    get palmGap(){const points=handContacts();return Math.max(...['L','R'].map(side=>Math.min(...points.filter(p=>p.side===side).map(p=>p.gap))));}};
}
