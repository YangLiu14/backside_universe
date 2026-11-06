import * as THREE from 'three';

const V=THREE.Vector3,up=new V(0,1,0);
const {clamp,lerp,smoothstep}=THREE.MathUtils;
const focus=new V(.065,.837,-2.25);
export const initialDaylight=.26;

// The hand follows the lamp wrist on an arc above the islands.
function wristAt(phase,out=new V()){
  const a=(phase-.5)*2.36;
  return out.set(.13-.32*Math.sin(a),1.021+.103*Math.cos(a)+.064*phase,-2.28+.084*Math.cos(a)+.047*phase);
}
function frame(direction,normal){
  const y=direction.clone().normalize(),x=y.clone().cross(normal).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,x.clone().cross(y)));
}
function setLink(group,restPivot,pivot,restFrame,posedFrame){
  group.quaternion.copy(posedFrame).multiply(restFrame.clone().invert());
  group.position.copy(pivot).sub(restPivot.clone().applyQuaternion(group.quaternion));
}

export function createLampSun(scene,rig,sun,skyLight){
  const {arm,lower,upper,head,bulb,base,elbow,wrist,radius}=rig;
  arm.updateWorldMatrix(true,true);
  const inverse=arm.matrixWorld.clone().invert();
  const first=elbow.clone().sub(base),second=wrist.clone().sub(elbow);
  const lengths=[first.length(),second.length()],restNormal=first.clone().cross(second).normalize();
  const lowerFrame=frame(first,restNormal),upperFrame=frame(second,restNormal);
  const restHead=head.position.clone(),restRotation=head.quaternion.clone();
  const originalSun=sun.position.clone(),originalTarget=sun.target.position.clone();
  const originalSky=scene.background.clone(),originalFill=skyLight.color.clone(),originalGround=skyLight.groundColor.clone();
  const originalSunColor=sun.color.clone(),originalEnvironment=scene.environmentIntensity;
  const direction=new V(),color=new THREE.Color(),waterSky=new THREE.Color();
  const palette=(morning,noon,evening)=>[morning,noon,evening].map(hex=>new THREE.Color(hex));
  const sunlight=palette('#ffbc73','#fff4d7','#ff9258'),sky=palette('#efd0ad','#b9dce2','#d99895');
  const fill=palette('#c7c6da','#d3e7ed','#b6a5d1'),ground=palette('#ad8981','#91aaa6','#936b79');
  const water=palette('#d4b6a4','#9ac7d4','#dc9d86');
  function sample(p,phase,out){
    return phase<.5?out.copy(p[0]).lerp(p[1],smoothstep(phase,0,.5)):
      out.copy(p[1]).lerp(p[2],smoothstep(phase,.5,1));
  }

  // A short, soft pool of luminous air starts at the actual diffuser.
  const beamMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.FrontSide,
    blending:THREE.AdditiveBlending,uniforms:{tint:{value:color},amount:{value:0}},
    vertexShader:'varying vec2 beamUv;void main(){beamUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 beamUv;uniform vec3 tint;uniform float amount;
      void main(){float a=.078*pow(clamp(beamUv.y,0.,1.),2.4)*amount;
      gl_FragColor=vec4(tint,a);}`});
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(radius*.90,radius*2.6,.52,40,1,true),beamMaterial);
  beam.name='Light leaving the task lamp';beam.position.y=bulb.position.y-.26;head.add(beam);
  beam.raycast=()=>{};beam.visible=false;
  bulb.material=bulb.material.clone();

  const domeMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:true,
    uniforms:{horizon:{value:new THREE.Color()},zenith:{value:new THREE.Color()},sunTint:{value:color},sunward:{value:direction}},
    vertexShader:`varying vec3 skyRay;void main(){vec4 w=modelMatrix*vec4(position,1.);
      skyRay=w.xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`varying vec3 skyRay;uniform vec3 horizon,zenith,sunTint,sunward;
      void main(){vec3 ray=normalize(skyRay);
        float elevation=smoothstep(-.34,.42,ray.y);
        vec3 sky=mix(horizon,zenith,elevation);
        sky+=sunTint*.19*pow(max(0.,dot(ray,sunward)),9.);
        gl_FragColor=vec4(sky,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const dome=new THREE.Mesh(new THREE.SphereGeometry(10,32,16),domeMaterial);
  dome.name='Daylight sky';dome.position.copy(focus);dome.renderOrder=-5;dome.raycast=()=>{};scene.add(dome);
  const highSky=palette('#92b6c8','#72b1d0','#a295be');
  scene.fog=new THREE.Fog(originalSky,20,28);
  let phase=initialDaylight,reveal=-1,dirty=true;
  function update(amount){
    if(amount===reveal)return;
    reveal=amount;
    const wet=smoothstep(amount,0,1);
    const neutral=wrist.clone().applyMatrix4(arm.matrixWorld);
    const goal=neutral.lerp(wristAt(phase),wet).applyMatrix4(inverse).sub(base);
    const axis=goal.clone().normalize(),[l1,l2]=lengths;
    const d=clamp(goal.length(),Math.abs(l1-l2)+.00001,l1+l2-.00001);
    const forward=(l1*l1-l2*l2+d*d)/(2*d);
    const bend=up.clone().addScaledVector(axis,-axis.y).normalize();
    const joint=base.clone().addScaledVector(axis,forward).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-forward*forward)));
    const end=base.clone().addScaledVector(axis,d);
    const u=joint.clone().sub(base),v=end.clone().sub(joint),normal=u.clone().cross(v).normalize();
    setLink(lower,base,base,lowerFrame,frame(u,normal));
    setLink(upper,elbow,joint,upperFrame,frame(v,normal));
    // The diffuser is offset from the wrist. Aim its optical axis, not the
    // arm joint, at the desk while the knuckle pivots around the wrist.
    const localFocus=focus.clone().applyMatrix4(inverse);
    const faceOffset=restHead.clone().sub(wrist).applyQuaternion(restRotation.clone().invert()).add(bulb.position);
    const facing=end.clone().sub(localFocus).normalize(),aiming=new THREE.Quaternion();
    for(let i=0;i<4;i++){
      aiming.setFromUnitVectors(up,facing);
      facing.copy(faceOffset).applyQuaternion(aiming).add(end).sub(localFocus).normalize();
    }
    head.quaternion.copy(restRotation).slerp(aiming,wet);
    head.position.copy(restHead).sub(wrist).applyQuaternion(restRotation.clone().invert())
      .applyQuaternion(head.quaternion).add(end);
    if(wet===0){
      lower.position.set(0,0,0);upper.position.set(0,0,0);lower.quaternion.identity();upper.quaternion.identity();
      head.position.copy(restHead);head.quaternion.copy(restRotation);
    }
    const emitter=bulb.getWorldPosition(new V());
    direction.copy(emitter).sub(focus).normalize();
    const elevation=Math.sin(Math.PI*phase);
    sample(sunlight,phase,color);
    sun.target.position.copy(originalTarget).lerp(focus,wet);
    sun.position.copy(originalSun).lerp(focus.clone().addScaledVector(direction,2.8),wet);
    direction.copy(sun.position).sub(sun.target.position).normalize();
    sun.color.copy(originalSunColor).lerp(color,wet);
    sun.intensity=lerp(1.1,1.75+1.1*elevation,wet);
    skyLight.color.copy(originalFill).lerp(sample(fill,phase,waterSky),wet);
    skyLight.groundColor.copy(originalGround).lerp(sample(ground,phase,waterSky),wet);
    skyLight.intensity=lerp(1,.79+.24*elevation,wet);
    scene.background.copy(originalSky).lerp(sample(sky,phase,waterSky),wet);
    scene.environmentIntensity=lerp(originalEnvironment,.43+.24*elevation,wet);
    dome.visible=wet>.001;
    domeMaterial.uniforms.horizon.value.copy(scene.background);
    domeMaterial.uniforms.zenith.value.copy(originalSky).lerp(sample(highSky,phase,waterSky),wet);
    scene.fog.color.copy(scene.background);scene.fog.near=lerp(20,1.20,wet);scene.fog.far=lerp(28,4.9,wet);
    sample(water,phase,waterSky);
    bulb.material.emissive.copy(color);bulb.material.emissiveIntensity=wet*3;
    beam.visible=wet>.01;beamMaterial.uniforms.amount.value=wet;
    dirty=true;
  }

  function screenPoint(point,camera,rect){
    const p=point.clone().project(camera);
    return new THREE.Vector2(rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2);
  }
  function canGrab(camera,rect,x,y,touch,shared){
    for(let node=arm;node;node=node.parent)if(!node.visible)return false;
    const ndc=new THREE.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
    const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
    const lampHit=ray.intersectObject(arm,true)[0],center=head.getWorldPosition(new V());
    const projected=center.clone().project(camera);
    if(!lampHit && (Math.abs(projected.z)>1 || screenPoint(center,camera,rect).distanceTo(new THREE.Vector2(x,y))>(touch?19:12)))return false;
    // A ridge or the desktop itself can hide the lamp from a close-up or a dive.
    const distance=lampHit?.distance??center.distanceTo(camera.position);
    ray.far=distance-.012;
    const blockers=[];
    const collect=o=>{if(o.isMesh&&!o.material.transparent&&o.layers.test(camera.layers))blockers.push(o);};
    scene.traverseVisible(collect);shared.traverseVisible(collect);
    return !ray.intersectObjects(blockers,false).length;
  }
  function dragStart(camera,rect,x,y){
    const curve=Array.from({length:65},(_,i)=>screenPoint(wristAt(i/64),camera,rect));
    const start=screenPoint(wristAt(phase),camera,rect),original=phase;
    return (px,py)=>{
      if(curve[0].distanceTo(curve[64])<32)return clamp(original+(px-x)/Math.max(120,rect.width*.45),0,1);
      const target=start.clone().add(new THREE.Vector2(px-x,py-y));let distance=Infinity,next=original;
      for(let i=1;i<curve.length;i++){
        const a=curve[i-1],delta=curve[i].clone().sub(a);
        const t=clamp(target.clone().sub(a).dot(delta)/Math.max(.0001,delta.lengthSq()),0,1);
        const gap=a.clone().addScaledVector(delta,t).distanceToSquared(target);
        if(gap<distance){distance=gap;next=(i-1+t)/64;}
      }
      return next;
    };
  }
  return {direction,color,waterSky,update,canGrab,dragStart,get phase(){return phase;},
    setPhase(value){
      const next=clamp(value,0,1);if(next===phase)return;
      const amount=Math.max(0,reveal);phase=next;reveal=-1;update(amount);
    },
    invalidateShadows(){dirty=true;},takeShadowUpdate(){const changed=dirty;dirty=false;return changed;}};
}
