import * as T from 'three';
import {landing,landingLook,threshold} from './campus.js';

const V=(...n)=>new T.Vector3(...n), ease=t=>t*t*(3-2*t);
const up=V(0,1,0),forward=V(0,0,-1);
function lens(from,to){
  for(const i of [0,5,8,9])to.projectionMatrix.elements[i]=from.projectionMatrix.elements[i];
  to.projectionMatrixInverse.copy(to.projectionMatrix).invert();
}
function facing(eye,target){return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(eye,target,up));}

export function campusTour(renderer, assembly, campus, unit) {
  const scale=unit*3.45,rotation=new T.Quaternion(),origin=V(),inv=new T.Quaternion();
  const pane=V(3.45,6.1,-5.8),anchor=assembly.rear;
  function register(){
    anchor.getWorldQuaternion(rotation);inv.copy(rotation).invert();origin.copy(anchor.localToWorld(pane.clone()));
  }
  const toCampus=p=>p.clone().sub(origin).applyQuaternion(inv).divideScalar(scale).add(threshold);
  const toMini=p=>p.clone().sub(threshold).multiplyScalar(scale).applyQuaternion(rotation).add(origin);
  const size=renderer.getDrawingBufferSize(new T.Vector2());
  const target=new T.WebGLRenderTarget(1024,Math.min(1024,Math.round(1024*size.y/Math.max(1,size.x))),{type:T.HalfFloatType});
  const glass=new T.Mesh(new T.PlaneGeometry(32.8,21.8),new T.ShaderMaterial({
    uniforms:{school:{value:target.texture}},
    vertexShader:'varying vec4 clip;void main(){clip=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=clip;}',
    fragmentShader:'uniform sampler2D school;varying vec4 clip;void main(){gl_FragColor=texture2D(school,clip.xy/clip.w*.5+.5);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
  }));
  glass.name="操场窗口";glass.position.copy(pane);anchor.add(glass);
  const camera=new T.PerspectiveCamera(57,1,.035,185);
  const clip=[new T.Plane(V(0,0,-1),threshold.z+.03)];
  let mode='booth',trip=0,recall=0,curve,firstQ,firstLens,visitorQ,backPath,backDuration;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let trail=[],axis={x:0,y:0};
  function fromBooth(cam){
    register();camera.position.copy(toCampus(cam.position));camera.quaternion.copy(inv).multiply(cam.quaternion);
    camera.updateProjectionMatrix();lens(cam,camera);camera.updateMatrixWorld();
  }
  function start(cam) {
    if(mode!=='booth')return;
    fromBooth(cam);firstQ=camera.quaternion.clone();firstLens=camera.projectionMatrix.clone();
    curve=new T.CatmullRomCurve3([camera.position.clone(),threshold.clone().add(V(0,.1,2.6)),threshold.clone(),landing.clone()]);
    trip=0;trail=[landing.clone()];mode='outbound';
  }
  function back(){
    if(mode==='outbound'){mode='inbound';return;}
    if(mode!=='court')return;
    campus.walk.clear();axis={x:0,y:0};visitorQ=camera.quaternion.clone();
    backPath=new T.CurvePath();
    const route=[camera.position.clone(),...trail.slice().reverse()];
    for(let i=1;i<route.length;i++)if(route[i].distanceTo(route[i-1])>.001)backPath.add(new T.LineCurve3(route[i-1],route[i]));
    backDuration=backPath.curves.length?T.MathUtils.clamp(backPath.getLength()/13,.28,2.6):.28;recall=0;mode='returning';
  }
  function reset(){campus.walk.clear();axis={x:0,y:0};mode='booth';trip=0;trail=[];}
  function update(dt,cam,aspect){
    if(mode==='booth'){fromBooth(cam);return;}
    camera.aspect=aspect;camera.fov=aspect<1?69:57;camera.updateProjectionMatrix();
    const endQ=facing(landing,landingLook);
    if(mode==='court'){
      campus.walk.update(dt,{move:axis,look:{x:0,y:0}});
      camera.position.copy(campus.walk.position);camera.quaternion.copy(facing(camera.position,campus.walk.target()));
      if(camera.position.distanceTo(trail.at(-1))>.55)trail.push(camera.position.clone());
    } else if(mode==='returning'){
      recall=Math.min(1,recall+(reduced.matches?1:dt/backDuration));
      if(backPath.curves.length)camera.position.copy(backPath.getPoint(ease(recall)));else camera.position.copy(landing);
      camera.quaternion.slerpQuaternions(visitorQ,endQ,ease(recall));
      if(recall===1){trip=1;mode='inbound';}
    } else {
      trip=T.MathUtils.clamp(trip+(reduced.matches?1:dt/2.55)*(mode==='outbound'?1:-1),0,1);
      const u=ease(trip);camera.position.copy(curve.getPointAt(u));
      const aligned=new T.Quaternion().setFromUnitVectors(forward,V(0,-.05,-1).normalize());
      camera.quaternion.slerpQuaternions(firstQ,aligned,T.MathUtils.smoothstep(u,0,.70));
      camera.quaternion.slerp(endQ,T.MathUtils.smoothstep(u,.72,1));
      for(const i of [0,5,8,9])camera.projectionMatrix.elements[i]=T.MathUtils.lerp(firstLens.elements[i],camera.projectionMatrix.elements[i],u);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      if(trip===1&&mode==='outbound'){camera.position.copy(landing);camera.quaternion.copy(endQ);campus.walk.start(landing,landingLook);mode='court';}
      if(trip===0&&mode==='inbound'){reset();fromBooth(cam);return;}
    }
    camera.updateMatrixWorld();
  }
  const miniature=new T.PerspectiveCamera(40,1,.00012,100);
  function indoorView(cam){
    if(mode==='booth')return cam;
    miniature.position.copy(toMini(camera.position));miniature.quaternion.copy(rotation).multiply(camera.quaternion);
    miniature.updateProjectionMatrix();lens(camera,miniature);miniature.updateMatrixWorld();return miniature;
  }
  function render(cam,miniScene,visible,aspect){
    const outside=mode==='court'||mode==='returning'||(mode!=='booth'&&camera.position.z<=threshold.z+.85);
    campus.booth.visible=campus.studioWing.visible=outside && (mode==='court'||mode==='returning');
    if(outside){renderer.render(campus.scene,camera);return;}
    if(visible){
      const w=innerWidth<650?650:1280,h=Math.min(1600,Math.max(300,Math.round(w/aspect)));
      if(target.width!==w||target.height!==h)target.setSize(w,h);
      renderer.clippingPlanes=clip;renderer.setRenderTarget(target);renderer.render(campus.scene,camera);
      renderer.setRenderTarget(null);renderer.clippingPlanes=[];
    }
    renderer.render(miniScene,indoorView(cam));
  }
  return {start,back,reset,update,render,toMini,camera,
    active:()=>mode!=='booth',mode:()=>mode,indoorView,
    key:(code,down)=>mode==='court'&&campus.walk.key(code,down),
    clear:()=>{campus.walk.clear();axis={x:0,y:0};},
    stick:(x,y)=>{axis={x,y};}, look:(x,y,type)=>{if(mode==='court')campus.walk.dragLook(x,y,type);}};
}
