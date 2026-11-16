// Animated characters keep their bind pose and hierarchy. Static prop baking
// must never run on these GLBs: it discards the skeleton and animation clips.
import * as T from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {sampleArmRecovery,sampleArmRest} from './arm-surface-audit.js';
const V=(...v)=>new T.Vector3(...v),controllers=new WeakMap();
function finishMaterial(m,head=false){
  m.metalness=0;m.metalnessMap=null;if(head)m.normalScale?.setScalar(.55);
  m.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`
    #include <roughnessmap_fragment>
    float actorSkin=smoothstep(.015,.07,diffuseColor.r-diffuseColor.g)*smoothstep(.03,.11,diffuseColor.r-diffuseColor.b);
    roughnessFactor=max(mix(.90,${head?'.58':'.57'},actorSkin),roughnessFactor);`);};
  m.customProgramCacheKey=()=>`rigged-campus-${head}`;
}

export function prepareCampusActor(role,gltf,metadata){
  if(!metadata)throw Error(role+' 缺少骨骼动作制作记录');
  let skins=0;
  gltf.scene.traverse(o=>{if(o.isSkinnedMesh)skins++;});
  if(!skins||!gltf.animations.some(a=>a.name===metadata.clip))throw Error(role+' 缺少蒙皮或指定动作');
  const root=new T.Group();root.name=role;root.add(gltf.scene);
  root.animations=gltf.animations;root.userData.actorMotion=metadata;
  root.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;o.frustumCulled=false;
    o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
    for(const m of [].concat(o.material))finishMaterial(m);
  });
  return root;
}

export function cloneCampusActor(source){
  const copy=cloneSkeleton(source);copy.animations=source.animations;
  return copy;
}

export function dressRiggedActor(body,head,role,structure,variant=0){
  const data=body.userData.actorMotion;
  if(variant&&data.satchelMesh){
    const satchel=body.getObjectByName(data.satchelMesh);
    const panels=[];satchel?.traverse(o=>{if(o.isMesh)panels.push(o);});
    if(!panels.length)throw Error('书包分件缺失');
    for(const panel of panels){
      panel.material=[].concat(panel.material).map(source=>{
        const m=source.clone();finishMaterial(m);
        const finish=m.onBeforeCompile;
        m.onBeforeCompile=s=>{finish(s);s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          diffuseColor.rgb=mix(diffuseColor.rgb,dot(diffuseColor.rgb,vec3(.3,.59,.11))*vec3(.68,.88,1.08),.78);`);};
        m.customProgramCacheKey=()=> 'campus-satchel-blue';return m;
      });
      if(panel.material.length===1)panel.material=panel.material[0];
    }
  }
  const bone=body.getObjectByName(data.headBone);
  if(!bone?.isBone)throw Error(role+' 缺少头颈骨挂点');
  const headRole=role==='shooter'?'shooter-head':variant?'companion-head':'walker-head';
  const landmark=structure[headRole],height=data.height;
  const scalar=height*(role==='shooter'?.102:.107)/landmark.faceWidth;
  const physical=V(...head.userData.native).multiplyScalar(scalar),neck=V(...landmark.neck);
  for(const mesh of head.children){
    const g=mesh.geometry,remove=new Set(landmark.removeTriangles||[]),index=g.index,keep=[];
    for(let f=0;f<index.count/3;f++)if(!remove.has(f))keep.push(index.getX(f*3),index.getX(f*3+1),index.getX(f*3+2));
    g.setIndex(keep);
    if(role==='shooter'){
      const a=g.attributes.position;
      for(let i=0;i<a.count;i++){
        // Fit the cropped neck base to this body's collar; facial vertices
        // stay outside the weighting band and retain their approved shape.
        const w=1-T.MathUtils.smoothstep(a.getY(i),-.48,-.25);
        const rear=T.MathUtils.smoothstep(neck.z-a.getZ(i),0,.2);
        a.setXYZ(i,neck.x+(a.getX(i)-neck.x)*(1+.24*w),a.getY(i)-.035/physical.y*w,
          neck.z+(a.getZ(i)-neck.z)*(1+.25*w)+((data.neckForwardMetres||0)+(data.neckRearInsetMetres||0)*rear)/physical.z*w);
      }
      a.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
    }
  }
  head.scale.copy(physical);head.position.copy(neck.multiply(physical).negate());
  head.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
    for(const m of [].concat(o.material))finishMaterial(m,true);
  });
  const mount=new T.Group();mount.name=headRole+' / animated neck';
  mount.position.fromArray(data.restHeadMount);mount.rotation.y=role==='shooter'?0:variant?-.20:-.12;
  mount.add(head);body.add(mount);body.updateMatrixWorld(true);bone.attach(mount);
  const clipName=variant&&data.companionClip?data.companionClip:data.clip;
  const mixer=new T.AnimationMixer(body),clip=body.animations.find(a=>a.name===clipName);
  if(!clip)throw Error('人物缺少动作 '+clipName);
  const declaredDuration=data.clips?.[clipName]?.duration??data.duration;
  if(Number.isFinite(declaredDuration)&&Math.abs(clip.duration-declaredDuration)>1e-5)
    throw Error('人物动作时长与制作记录不一致 '+clipName);
  const action=mixer.clipAction(clip).setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const surfaces=(data.clips?.[clipName]?.surfaceSamples||(variant&&data.companionSurfaceSamples)||data.surfaceSamples||[]).map(sample=>{
    const mesh=body.getObjectByName(sample.mesh);
    if(!mesh?.isSkinnedMesh)throw Error('接触采样缺少蒙皮网格 '+sample.mesh);
    let index=sample.index;
    if(index===undefined){
      const p=mesh.geometry.attributes.position,target=V(...sample.position),v=V();let best=Infinity;
      for(let i=0;i<p.count;i++){const d=v.fromBufferAttribute(p,i).distanceToSquared(target);if(d<best){best=d;index=i;}}
    }
    if(!Number.isInteger(index)||index<0||index>=mesh.geometry.attributes.position.count)throw Error('接触顶点无效');
    return {...sample,mesh,index};
  });
  const soles=(data.soleRegions||[]).map(region=>{
    const mesh=body.getObjectByName(region.mesh);
    if(!mesh?.isSkinnedMesh)throw Error('鞋底范围缺少蒙皮网格');
    const p=mesh.geometry.attributes.position,indices=[],lo=region.min,hi=region.max;
    for(let i=0;i<p.count;i++)if(p.getX(i)>=lo[0]&&p.getX(i)<=hi[0]&&p.getY(i)>=lo[1]&&p.getY(i)<=hi[1]&&p.getZ(i)>=lo[2]&&p.getZ(i)<=hi[2])indices.push(i);
    if(!indices.length)throw Error('鞋底范围没有真实顶点');
    return {mesh,indices};
  });
  controllers.set(body,{mixer,action,clip,data,surfaces,soles,time:0});
  body.userData.actorRole=role;body.userData.headRole=headRole;
  body.userData.removedHeadTriangles=data.removedHeadTriangles;
  body.userData.removedDebrisTriangles=data.removedDebrisTriangles||0;
}

export function animateRiggedActor(body,t){
  const c=controllers.get(body);
  // LoopOnce pauses at its end. Reset that action state before every absolute
  // sample so jumping backwards is identical to reaching that time forwards.
  c.action.reset();c.mixer.timeScale=1;c.mixer.setTime(T.MathUtils.clamp(t,0,c.clip.duration));
  c.time=T.MathUtils.clamp(t,0,c.clip.duration);
  body.updateMatrixWorld(true);
}

export function actorAnchor(body,name,offset=[0,0,0]){
  const bone=body.getObjectByName(name);
  if(!bone)throw Error('人物缺少动作挂点 '+name);
  return bone.localToWorld(V(...offset));
}

export function rigDetails(body){
  const c=controllers.get(body),bones=[];let skins=0;
  body.traverse(o=>{if(o.isSkinnedMesh)skins++;if(o.isBone)bones.push(o);});
  const root=body.getObjectByName(c.data.rootBone);
  return {role:body.userData.actorRole,head:body.userData.headRole,
    removedHeadTriangles:body.userData.removedHeadTriangles,removedDebrisTriangles:body.userData.removedDebrisTriangles,
    sourceReplaced:c.data.sourceReplaced===true,noDetachedHandFragments:c.data.noDetachedHandFragments===true,
    position:(root?root.getWorldPosition(V()):body.getWorldPosition(V())).toArray(),
    worldPosition:(root?root.getWorldPosition(V()):body.getWorldPosition(V())).toArray(),
    scale:body.scale.toArray(),yaw:body.rotation.y,skins,skinnedMeshes:skins,bones:bones.length,clips:body.animations.length,clip:c.clip.name,clipDuration:c.clip.duration,declaredClipDuration:c.data.clips?.[c.clip.name]?.duration??c.data.duration,
    bonePose:bones.map(b=>[b.name,...b.getWorldPosition(V()).toArray(),...b.getWorldQuaternion(new T.Quaternion()).toArray()])};
}

export function actorSurfacePoints(body,kind){
  const c=controllers.get(body);
  return c.surfaces.filter(s=>!kind||s.kind===kind).map(s=>{
    const position=s.mesh.localToWorld(s.mesh.getVertexPosition(s.index,V()));
    const window=(s.planted||[]).findIndex(([start,end])=>c.time>=start&&c.time<=end);
    return {id:s.id,side:s.side,position:position.toArray(),planted:window>=0,contactId:s.id+':'+window};
  });
}

export function sampleRig(body,id){
  const c=controllers.get(body),bones={};
  body.traverse(o=>{if(o.isBone)bones[o.name]=o.matrixWorld.toArray();});
  let minY=Infinity,maxY=-Infinity,vertexCount=0;const point=V();
  for(const {mesh,indices} of c.soles)for(const index of indices){
    mesh.localToWorld(mesh.getVertexPosition(index,point));minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);vertexCount++;
  }
  const armRecovery=sampleArmRecovery(body,c);
  return {id,jump:c.data.jump||null,armRecovery,armRest:sampleArmRest(body,c,armRecovery),root:actorAnchor(body,c.data.rootBone).toArray(),bones,contacts:actorSurfacePoints(body,'foot'),
    soleBounds:vertexCount?{minY,maxY,vertexCount}:null};
}
