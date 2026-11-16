// Recording-only director. The interactive viewer and its immutable assets are unchanged.
import * as T from 'three';

export const promoTimeline=Object.freeze({duration:42,photoHold:1,orbitEnd:8,approachEnd:14,firstRewindEnd:20,playbackEnd:28,returnOrbitStart:35,returnEnd:41});
export const promoFinalShot=Object.freeze({eye:[15.7,1.65,2.3],target:[3.5,1.9,-7],fov:60});
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const V=(...a)=>new T.Vector3(...a);
const up=V(0,1,0);
const facing=(eye,target)=>new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(eye,target,up));
const snapshot=c=>({position:c.position.clone(),quaternion:c.quaternion.clone(),projection:c.projectionMatrix.clone()});
const setPose=(c,s)=>{c.position.copy(s.position);c.quaternion.copy(s.quaternion);c.projectionMatrix.copy(s.projection);c.projectionMatrixInverse.copy(c.projectionMatrix).invert();c.updateMatrixWorld(true);};
function mixPose(a,b,n){
  const result={position:a.position.clone().lerp(b.position,n),quaternion:a.quaternion.clone().slerp(b.quaternion,n),projection:a.projection.clone()};
  for(const i of [0,5,8,9])result.projection.elements[i]=T.MathUtils.lerp(a.projection.elements[i],b.projection.elements[i],n);
  return result;
}
export async function createPromoDirector({gs,mesh,spark,real,tiny,cam,assembly,campus,tour,a,photo,setBase,getFrameSize}){
  mesh.setAnimationLoop(null);
  // Force the already-prewarmed close foliage in this offline film. Hysteresis
  // must not make reverse sampling select a different geometry at the same pose.
  campus.scene.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>{l.object.visible=i===0;});}});
  // The interactive progress is highly nonuniform in angular distance. A
  // camera-derived lookup spreads that same path over the film's allotted time,
  // while a progress floor preserves breathing room for the photo/GS handoff.
  const orbitSamples=1000,progressWeightDegrees=100,orbitDistances=[0];
  setBase(0,false);let previousOrientation=cam.quaternion.clone(),orbitAngle=0;
  for(let i=1;i<=orbitSamples;i++){
    setBase(i/orbitSamples,false);
    const angle=T.MathUtils.radToDeg(previousOrientation.angleTo(cam.quaternion));
    orbitAngle+=angle;orbitDistances.push(orbitDistances.at(-1)+angle+progressWeightDegrees/orbitSamples);
    previousOrientation.copy(cam.quaternion);
  }
  const orbitLength=orbitDistances.at(-1);
  function orbitProgress(amount){
    const wanted=clamp(amount)*orbitLength;let lo=0,hi=orbitSamples;
    while(hi-lo>1){const middle=(lo+hi)>>1;if(orbitDistances[middle]<wanted)lo=middle;else hi=middle;}
    const fraction=(wanted-orbitDistances[lo])/(orbitDistances[hi]-orbitDistances[lo]);
    return (lo+fraction)/orbitSamples;
  }
  setBase(1,false);const outer=snapshot(cam);
  setBase(1,true);const booth=snapshot(cam);
  setBase(1,false);tour.reset();tour.update(0,cam,getFrameSize().width/getFrameSize().height);
  const rotation=assembly.rear.getWorldQuaternion(new T.Quaternion()),inverse=rotation.clone().invert();
  const origin=assembly.rear.localToWorld(V(3.45,6.1,-5.8)),threshold=V(8.5,2.55,11.2),scale=a.unit*3.45;
  const toCampus=p=>p.clone().sub(origin).applyQuaternion(inverse).divideScalar(scale).add(threshold);
  const toMini=p=>p.clone().sub(threshold).multiplyScalar(scale).applyQuaternion(rotation).add(origin);
  const boothCampus={position:toCampus(booth.position),quaternion:inverse.clone().multiply(booth.quaternion),projection:booth.projection.clone()};
  const landing=V(8,1.65,7.6),landingLook=V(9.1,1.72,-1.4);
  const finishEye=V(...promoFinalShot.eye),finishQ=facing(finishEye,V(...promoFinalShot.target));
  const lens=new T.PerspectiveCamera(promoFinalShot.fov,getFrameSize().width/getFrameSize().height,.035,185);
  const landingShot={position:landing,quaternion:facing(landing,landingLook),projection:lens.projectionMatrix.clone()};
  const passage=new T.CatmullRomCurve3([boothCampus.position,V(7.3,2.2,29),V(8.5,2.55,14),threshold,landing],false,'centripetal');
  const courtPath=new T.CatmullRomCurve3([landing,V(10.5,1.65,6.7),V(13.3,1.65,4.2),finishEye],false,'centripetal');
  const output=document.createElement('canvas'),ctx=output.getContext('2d',{alpha:false});
  let last=null;
  function cameraAt(t){
    const dimensions=getFrameSize(),aspect=dimensions.width/dimensions.height;
    if(t<=8){
      const p=orbitProgress(smooth((t-1)/7));setBase(p,false);tour.reset();tour.update(0,cam,aspect);
      return {progress:p,kind:'orbit',outside:false};
    }
    setBase(1,false);
    if(t<=14){
      setPose(cam,mixPose(outer,booth,smooth((t-8)/6)));
      tour.reset();tour.update(0,cam,aspect);
      return {progress:1,kind:'approach',outside:false};
    }
    let pose;
    if(t<=20){
      const n=smooth((t-14)/6);pose=mixPose(boothCampus,landingShot,n);pose.position.copy(passage.getPointAt(n));
    }else{
      const n=smooth((t-20)/8);pose={position:courtPath.getPointAt(n),quaternion:landingShot.quaternion.clone().slerp(finishQ,n),projection:landingShot.projection.clone()};
    }
    // The miniature camera is the exact inverse registration of the same campus
    // camera. The renderer switches only after the portal fills the whole view.
    tour.directShot(pose.position.toArray(),pose.quaternion.toArray(),pose.projection.toArray());
    const mini={position:toMini(pose.position),quaternion:rotation.clone().multiply(pose.quaternion),projection:pose.projection};setPose(cam,mini);
    return {progress:1,kind:t<=20?'passage':'court',outside:pose.position.z<=threshold.z+.20};
  }
  function timing(raw){
    const t=clamp(raw,0,42),returning=t>=28;
    // Reserve six seconds for the actual orbit on the return. The forward
    // camera already eases orbit time, so the reverse route clock here is
    // linear: applying another smoothstep would concentrate the angular turn.
    const routeTime=t<28?t:t<35?28-20*smooth((t-28)/7):8-7*clamp((t-35)/6);
    const memory=t<8?8:t<20?8*(1-(t-8)/12):t<28?t-20:8*(1-clamp((t-28)/13));
    // Rotors start in the photo-aligned orientation. Rewinding is negative;
    // absolute phase prevents a jump at either reversal of the narrative clock.
    const phase=t<8?0:t<20?-(8-memory)*2.55:t<28?(memory-8)*2.55:-(8-memory)*2.55;
    return {time:t,routeTime,memory,phase,returning,chapter:t<1?'photo':t<8?'orbit':t<14?'booth':t<20?'first-rewind':t<28?'playback':t<41?'second-rewind-return':'photo-end'};
  }
  async function frame(t,options={}){
    const state=timing(t),view=cameraAt(state.routeTime),p=view.progress;
    campus.animate(state.memory);assembly.directTape(state.phase);
    const worldAlpha=1-T.MathUtils.smoothstep(p,.25,.44),meshAlpha=p>=.24?1:0,photoAlpha=1-T.MathUtils.smoothstep(p,.012,.15);
    document.getElementById('world').style.opacity=String(worldAlpha);
    document.getElementById('mesh').style.opacity=String(meshAlpha);
    photo.style.opacity=String(photoAlpha);
    if(p<.44){real.updateMatrixWorld(true);await spark.update({scene:real,camera:cam});gs.render(real,cam);}
    if(p>=.24)tour.render(cam,tiny,assembly.rear.visible,getFrameSize().width/getFrameSize().height);
    const camera=tour.active()?tour.camera:cam;
    last={...state,...view,camera:{space:tour.active()?'campus':'miniature',position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray()},miniCamera:{position:cam.position.toArray(),quaternion:cam.quaternion.toArray()},layers:{worldAlpha,meshAlpha,photoAlpha},ball:campus.ball.position.toArray(),walkers:campus.walkerPositions().map(p=>p.toArray())};
    if(options.capture===false)return last;
    const source=mesh.domElement;output.width=source.width;output.height=source.height;
    ctx.globalAlpha=1;ctx.fillStyle='#151b18';ctx.fillRect(0,0,output.width,output.height);
    if(meshAlpha){ctx.globalAlpha=meshAlpha;ctx.drawImage(source,0,0,output.width,output.height);}
    if(worldAlpha){ctx.globalAlpha=worldAlpha;ctx.drawImage(gs.domElement,0,0,output.width,output.height);}
    if(photoAlpha){
      ctx.globalAlpha=photoAlpha;const ratio=Math.max(output.width/photo.naturalWidth,output.height/photo.naturalHeight),w=photo.naturalWidth*ratio,h=photo.naturalHeight*ratio;
      ctx.drawImage(photo,(output.width-w)/2,(output.height-h)/2,w,h);
    }
    ctx.globalAlpha=1;
    const image=output.toDataURL(options.capture||'image/jpeg',options.quality??.96).split(',')[1];
    return {...last,width:output.width,height:output.height,image};
  }
  await frame(0,{capture:false});
  return {duration:promoTimeline.duration,frame,timeline:promoTimeline,orbitPath:{samples:orbitSamples,angularLengthDegrees:orbitAngle,weightedLength:orbitLength,progressWeightDegrees,forwardAngularSpeedBound:orbitLength*1.5/7,returnAngularSpeedBound:orbitLength*1.5/6},finalShot:promoFinalShot,state:()=>last,anchors:{outer:outer.position.toArray(),booth:booth.position.toArray(),boothCampus:boothCampus.position.toArray(),threshold:threshold.toArray(),landing:landing.toArray()}};
}
