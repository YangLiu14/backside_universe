import {createModelPreparation} from '../cinema/prepare-model.js';
import {createJoysticks} from '../cinema/joysticks.js';
import {onRoomVisibility,resizeScreen} from '../cinema/room.js';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {BrowseCamera,bindBrowseGestures} from './browse-camera.js';
import {createDigestiveMap} from './digestive-map.js';
import {createFoodTour} from './food-tour.js';
import {createFlankMuseum} from './flank-museum.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const assets='./assets/', stage=document.querySelector('#stage'), photo=document.querySelector('#photo');
const slider=document.querySelector('#angle'), play=document.querySelector('#turn'), hint=document.querySelector('#hint');
const label=document.querySelector('#playLabel'), mark=document.querySelector('#playMark'), plate=document.querySelector('#viewName');
const rad=T.MathUtils.degToRad, mix=T.MathUtils.lerp, clamp=T.MathUtils.clamp;
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
let angle=0, journey=null, ready=false, dirty=true, lastTime=0;
let museum=null,viewCamera=null,selected=null,pending=null,focus=0,focusGoal=0,showSkin=false;
let foodTour=null,routeMap=null;
let sideRig=null,galleryRig=null,returnRig=null;
const drawnTarget=vec(),usesTouch=matchMedia('(any-pointer: coarse)');
const joysticks=createJoysticks(stage);
const inspectingRoom=()=>foodTour?.visiting||selected;
const browsing=()=>ready&&(foodTour?.active?foodTour.inspecting:(selected?focus===1&&focusGoal===1:angle>=89.99&&!journey));
function rig(){
  if(!browsing())return null;
  if(foodTour.visiting)return foodTour.galleryRig();
  if(selected)return galleryRig??=new BrowseCamera(viewCamera.position,drawnTarget);
  return sideRig??=new BrowseCamera(viewCamera.position,drawnTarget);
}
function moveCamera(action){
  const r=rig();if(!r)return;
  action(r);dirty=true;if(foodTour.visiting)return;document.querySelector(selected?'#gallery-reset':'#side-reset').hidden=false;
}
function resetView(){
  if(foodTour?.visiting){foodTour.resetRig();dirty=true;return;}
  if(selected)galleryRig=null;else sideRig=null;
  document.querySelector(selected?'#gallery-reset':'#side-reset').hidden=true;dirty=true;
}
const resetInspection=()=>{if(selected)museum.showTitle(null);selected=null;pending=null;galleryRig=null;focus=0;focusGoal=0;};
function selectGallery(id){
  if(!museum?.exhibits.has(id))return;
  showSkin=false;
  if(angle<89.99){resetInspection();pending=id;journey={from:angle,to:90,elapsed:0,duration:reduce.matches?0:Math.max(.4,(90-angle)/90*3.2)};}
  else if(selected&&selected!==id&&focus>.001){pending=id;focusGoal=0;}
  else{selected=id;pending=null;focusGoal=1;galleryRig=null;document.querySelector('#gallery-reset').hidden=true;museum.showTitle(id);stage.focus({preventScroll:true});}
  dirty=true;updateControls();
}
function leaveGallery(){pending=null;focusGoal=0;dirty=true;}
function zoom(factor,{x=0,y=0}={}){moveCamera(r=>r.dolly(factor,x,y,viewCamera.projectionMatrix));}
function pan(dx,dy){moveCamera(r=>r.translate(dx,dy,viewCamera.projectionMatrix));}
function orbit(dx,dy){moveCamera(r=>r.orbit(dx,dy));}
function frame(ndc){const hit=museum.surface(ndc,viewCamera,inspectingRoom());if(hit)moveCamera(r=>r.frame(hit.point));}
const updateControls=()=>{
  stage.toggleAttribute('data-cover',angle===0&&!journey&&!selected);
  slider.style.setProperty('--progress',angle/90*100+'%');
  slider.value=angle;
  document.querySelector('#degrees').textContent=String(Math.round(angle)).padStart(3,'0')+'°';
  plate.textContent=selected?museum.exhibits.get(selected).room.name:angle===0?'原照':angle>=89.99?(showSkin?'右侧外观':'内脏博物馆'):'向右绕行';
  const free=Boolean(selected)||angle>=89.99;stage.dataset.browsing=String(free);
  if(ready)hint.textContent=free?(usesTouch.matches?'左摇杆平移或推近，右摇杆环绕':'拖动环绕 · 滚轮或触控板捏合缩放 · 右键或 Shift 拖动平移 · 按住 WASD 移动、方向键环绕')+(selected?' · 双击展品对焦':' · 点器官进入'):'向右拖动画面绕到剖面，也可用滑杆原路返回。';
  label.textContent=journey?'暂停':angle>=89.99?'回到原照':angle===0?'开始放映':'继续放映';
  mark.dataset.icon=journey?'pause':angle>=89.99?'return':'play';
};
function seek(a){resetInspection();sideRig=null;returnRig=null;document.querySelector('#side-reset').hidden=true;journey=null;angle=clamp(a,0,90);dirty=true;updateControls();}
function playOrbit(){
  resetInspection();
  if(journey){seek(angle);return;}
  const to=angle>=89.99?0:90;
  if(reduce.matches){seek(to);return;}
  returnRig=to===0?sideRig:null;sideRig=null;document.querySelector('#side-reset').hidden=true;
  journey={from:angle,to,elapsed:0,duration:Math.max(.4,Math.abs(to-angle)/90*6.8)};updateControls();
}
play.addEventListener('click',playOrbit);
slider.addEventListener('input',()=>seek(Number(slider.value)));
bindBrowseGestures(stage,{
  ready:()=>ready&&(!foodTour?.active||foodTour.inspecting),browsing,angle:()=>angle,selected:inspectingRoom,orbit,zoom,pan,seek,frame,
  pause:()=>{if(journey){journey=null;pending=null;updateControls();}},
  pick:ndc=>{if(!showSkin&&viewCamera&&!routeMap?.enabled){const id=museum.hit(ndc,viewCamera);if(id)selectGallery(id);}}
});
for(const id of ['gallery-reset','side-reset'])document.getElementById(id).onclick=resetView;
const movementKeys=new Set(['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d','q','e']);
const heldKeys=new Set();
function advanceNavigation(dt){
  const sticks=joysticks.activate(browsing() ? inspectingRoom() || 'overview' : null);
  if(!heldKeys.size && !(sticks && (sticks.move.x||sticks.move.y||sticks.look.x||sticks.look.y)))return;
  if(!browsing()){heldKeys.clear();return;}
  const axis=(positive,negative)=>Number(heldKeys.has(positive))-Number(heldKeys.has(negative));
  const turn=axis('arrowleft','arrowright')-(sticks?.look.x||0),tilt=axis('arrowup','arrowdown')-(sticks?.look.y||0);
  const across=axis('d','a')+(sticks?.move.x||0),up=axis('e','q'),forward=axis('w','s')-(sticks?.move.y||0);
  const stride=dt/Math.max(1,Math.hypot(across,up,forward));
  if(turn||tilt)orbit(turn*1.35*dt,tilt*1.15*dt);
  if(across||up)pan(across*1.35*stride,up*1.35*stride);
  if(forward)zoom(Math.exp(-forward*1.15*stride));
}
window.addEventListener('keyup',e=>heldKeys.delete(e.key.toLowerCase()));
stage.addEventListener('blur',()=>heldKeys.clear());
window.addEventListener('blur',()=>heldKeys.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden)heldKeys.clear();});
stage.addEventListener('keydown',e=>{
  if(!ready||(foodTour?.active&&!foodTour.inspecting)||e.target!==stage||e.ctrlKey||e.metaKey||e.altKey)return;
  if(browsing()){
    const key=e.key.toLowerCase();
    if(movementKeys.has(key)){
      e.preventDefault();
      if(!e.repeat&&!heldKeys.has(key)){
        const first=heldKeys.size===0;
        heldKeys.add(key);
        if(first)advanceNavigation(1/60); // A tap between frames still moves the camera.
      }
      return;
    }
    if(key==='r'){e.preventDefault();heldKeys.clear();resetView();return;}
  }
  if(foodTour?.active)return;
  if(e.code==='Space'){e.preventDefault();playOrbit();return;}
  const to={ArrowLeft:angle-3,ArrowRight:angle+3,Home:0,End:90}[e.key];
  if(to!==undefined){e.preventDefault();seek(to);}
});
window.addEventListener('keydown',e=>{if(foodTour?.active){foodTour.key(e);return;}if(e.key==='Escape'&&selected){leaveGallery();stage.focus({preventScroll:true});}});
async function json(name){const r=await fetch(assets+name);if(!r.ok)throw Error(name+' '+r.status);return r.json();}
const loader=new T.TextureLoader();
function texture(path,srgb=false){return loader.loadAsync(assets+path).then(t=>{if(srgb)t.colorSpace=T.SRGBColorSpace;return t;});}

// The small displacement field aligns the photographed face and feet at the source camera.
// Both projected color and alignment are released as that camera moves around the mesh.
function fitCoat(scene, uniforms){
  scene.traverse(o=>{
    if(!o.isMesh)return;
    o.material.onBeforeCompile=s=>{
      Object.assign(s.uniforms,uniforms);
      s.vertexShader=`uniform mat4 cameraToSource, sourceToCamera;
uniform vec2 sourceFocal, warpRange;
uniform sampler2D fitMap;
uniform float alignAmount; uniform vec3 rugPlane, soleGap;
varying vec2 sourceUv; varying vec2 depthUv; varying float sourceDepth; varying vec3 nativePoint;
`+s.vertexShader.replace('#include <project_vertex>',`
nativePoint=position;
vec4 worldPoint=modelMatrix*vec4(transformed,1.);
vec4 sourcePoint=cameraToSource*worldPoint;
vec3 footprint=vec3(worldPoint.xz,1.);
float aboveRug=worldPoint.y-dot(rugPlane,footprint);
vec3 eye=sourceToCamera[3].xyz;
float eyeHeight=eye.y-dot(rugPlane,vec3(eye.xz,1.));
float gap=clamp(dot(soleGap,footprint),0.,.75)*(1.-smoothstep(.35,1.77,aboveRug));
float depth=-sourcePoint.z;
vec2 uv0=.5+sourceFocal*sourcePoint.xy/depth;
vec2 delta=(texture2D(fitMap,clamp(uv0,0.,1.)).rg*255.-128.)/127.*warpRange;
sourceUv=uv0+delta; depthUv=uv0; sourceDepth=depth;
sourcePoint.xy+=delta*depth/sourceFocal*alignAmount;
sourcePoint.xyz*=1.+gap/max(.7,eyeHeight-aboveRug);
vec4 mvPosition=viewMatrix*sourceToCamera*sourcePoint;
gl_Position=projectionMatrix*mvPosition;`);
      s.fragmentShader=`uniform sampler2D photoMap, surfaceMap, apertureMap; uniform float openAmount;
uniform float photoAmount;
varying vec2 sourceUv; varying vec2 depthUv; varying float sourceDepth; varying vec3 nativePoint;
`+s.fragmentShader.replace('#include <opaque_fragment>',`
if(openAmount>0.&&nativePoint.x>-.085 && nativePoint.z>mix(.315,-.275,openAmount)
 && texture2D(apertureMap,.5+nativePoint.zy/vec2(1.10,.96)).r>.47)discard;
float inside=step(0.,sourceUv.x)*step(0.,sourceUv.y)*step(sourceUv.x,1.)*step(sourceUv.y,1.);
vec2 encoded=texture2D(surfaceMap,clamp(depthUv,0.,1.)).rg;
float visibleDepth=dot(encoded,vec2(256.,1.))*255.*12./65535.;
float front=1.-smoothstep(.024,.070,sourceDepth-visibleDepth);
float coat=smoothstep(.03,.82,texture2D(surfaceMap,clamp(sourceUv,0.,1.)).b);
outgoingLight=mix(outgoingLight,texture2D(photoMap,clamp(sourceUv,0.,1.)).rgb,photoAmount*inside*front*coat);
#include <opaque_fragment>`);
    };
  });
}

async function start(){
  const decoder=new DRACOLoader().setDecoderPath('../vendor/draco/');
  const gltf=new GLTFLoader().setDRACOLoader(decoder);
  const dogFile=usesTouch.matches?'hi3d-orbit-mobile.glb':'hi3d-orbit.glb';
  const [reg,fit,marble,model,source,warp,surface,shadow,aperture,ring,{SparkRenderer,SplatMesh}]=await Promise.all([
    json('registration.json'),json('transition/dog-fit.json'),json('marble/registration.json'),
    gltf.loadAsync(assets+'transition/'+dogFile),texture('original.jpg',true),texture('transition/source-warp.png'),texture('transition/source-surface.png'),texture('transition/contact.png'),texture('hi3d-galleries/flank-mask.png'),json('hi3d-galleries/rim.json'),import('@sparkjsdev/spark')
  ]);

  if(fit.worldId!==marble.world_id)throw Error('Room and dog registrations differ');
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('#world'),antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.autoClear=false;
  renderer.outputColorSpace=T.SRGBColorSpace;
  const camera=new T.PerspectiveCamera(45,1,.025,150), roomCam=new T.PerspectiveCamera();
  const origin=vec().fromArray(reg.origin), orientation=new T.Quaternion().fromArray(reg.quaternion);
  const sourceMatrix=new T.Matrix4().compose(origin,orientation,vec(1,1,1));
  const [W,H]=reg.source, fx=reg.intrinsics[0][0],fy=reg.intrinsics[1][1];
  const uniforms={
    apertureMap:{value:aperture},openAmount:{value:0},photoMap:{value:source},fitMap:{value:warp},surfaceMap:{value:surface},cameraToSource:{value:sourceMatrix.clone().invert()},sourceToCamera:{value:sourceMatrix},
    sourceFocal:{value:new T.Vector2(fx/W,fy/H)},warpRange:{value:new T.Vector2(fit.warpRange/fit.warpGrid[0],-fit.warpRange/fit.warpGrid[1])},
    alignAmount:{value:1},photoAmount:{value:1},rugPlane:{value:vec(...fit.rugPlane)},soleGap:{value:vec(...fit.soleGap)}
  };
  const dogScene=new T.Scene(),dog=model.scene;
  const [yaw,pitch,roll]=fit.eulerYXZ.map(rad);
  dog.rotation.set(pitch,yaw,roll,'YXZ');dog.scale.setScalar(fit.scale);dog.position.fromArray(fit.position);
  fitCoat(dog,uniforms);dogScene.add(dog);
  const studio=new RoomEnvironment(),gen=new T.PMREMGenerator(renderer),env=gen.fromScene(studio,.04);
  dogScene.environment=env.texture;dogScene.environmentIntensity=.33;studio.dispose();gen.dispose();
  dogScene.add(new T.HemisphereLight(0xfff1db,0x8f7d68,1.18));
  const light=new T.DirectionalLight(0xfff2dd,1.45);light.position.set(-3,7,3);dogScene.add(light);
  const room=new T.Scene(),spark=new SparkRenderer({renderer,enableLod:false,sortRadial:false,blurAmount:0});
  room.add(spark);
  const holder=new T.Group(),lens=new T.Group(),inverse=new T.Group();
  holder.position.copy(origin);holder.quaternion.copy(orientation);room.add(holder);holder.add(lens);
  lens.scale.setScalar(marble.camera_scale[2]);lens.rotation.x=Math.PI;lens.add(inverse);
  inverse.quaternion.fromArray(marble.cv_to_raw_quaternion).invert();
  inverse.position.fromArray(marble.raw_center).negate().applyQuaternion(inverse.quaternion);
  const splats=new SplatMesh({url:assets+'transition/room.spz',lod:false,extSplats:true});
  inverse.add(splats);await splats.initialized;
  if(splats.numSplats!==fit.keptSplats)throw Error('Unexpected room asset');

  // Fill disoccluded surfaces behind the retained Marble splats. The two planes
  // follow the measured carpet and wall, including the skirting at their junction.
  const backing=new T.Scene(),wallPlane=new T.Vector4(...fit.wallPlane);
  const fillMaterial=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{
    inverseProjection:{value:new T.Matrix4()},eyeMatrix:{value:new T.Matrix4()},panel:{value:wallPlane},
    rugPlane:{value:vec(...fit.rugPlane)},photoMap:{value:source},sourceView:{value:uniforms.cameraToSource.value},focal:{value:uniforms.sourceFocal.value}
  },vertexShader:`varying vec2 screen;void main(){screen=position.xy;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`varying vec2 screen;uniform mat4 inverseProjection,eyeMatrix,sourceView;uniform vec4 panel;uniform vec3 rugPlane;uniform vec2 focal;uniform sampler2D photoMap;
void main(){
 vec3 eye=eyeMatrix[3].xyz;
 vec4 view=inverseProjection*vec4(screen,-1.,1.);
 vec3 ray=normalize(mat3(eyeMatrix)*view.xyz);
 vec3 fn=vec3(-rugPlane.x,1.,-rugPlane.y);
 float floorT=(rugPlane.z-dot(fn,eye))/dot(fn,ray);
 vec4 wall=panel;wall.w+=.045;
 float wallT=-(dot(wall.xyz,eye)+wall.w)/dot(wall.xyz,ray);
 vec3 hit=eye+ray*wallT;
 bool onWall=wallT>0.&&hit.x<.64-.13*hit.y;
 vec3 color=vec3(.046,.038,.030);
 if(floorT>0.&&(!onWall||floorT<wallT)){
  vec3 floorHit=eye+ray*floorT;
  vec4 pt=sourceView*vec4(floorHit,1.);vec2 projected=.5+focal*pt.xy/max(.01,-pt.z);
  vec2 tile=abs(fract(floorHit.xz*vec2(.61,.57))-.5)*2.;
  vec3 rug=texture2D(photoMap,vec2(.729,.112)+tile*vec2(.143,.145)).rgb;
  vec3 wood=texture2D(photoMap,vec2(.715,.66)+tile*vec2(.17,.13)).rgb;
  color=mix(rug,wood,smoothstep(.003,.015,projected.y-(.748-.287*projected.x)));
 }else if(onWall){
  float h=dot(fn,hit)-rugPlane.z;
  vec2 sampleUv=vec2(.09,.67)+vec2(.1,.19)*abs(fract(hit.xy*.32)-.5)*2.;
  color=texture2D(photoMap,sampleUv).rgb;
  color=mix(vec3(.017,.015,.012),color,smoothstep(.113,.129,h));
 }
 gl_FragColor=vec4(color,1.);
 #include <colorspace_fragment>
}`,depthWrite:false,depthTest:false});
  const backingQuad=new T.Mesh(new T.PlaneGeometry(2,2),fillMaterial);backingQuad.frustumCulled=false;backing.add(backingQuad);
  const rug=new T.PlaneGeometry(9,10);rug.rotateX(-Math.PI/2);
  const rugMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{photoMap:{value:source},floor:{value:vec(...fit.rugPlane)},shadowMap:{value:shadow}},
    vertexShader:`uniform vec3 floor;varying vec3 wp;void main(){wp=position;wp.y=dot(floor,vec3(wp.x,wp.z,1.));gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader:`varying vec3 wp;uniform sampler2D photoMap,shadowMap;
void main(){
 vec2 q=wp.xz;
 float radius=length((q-vec2(-.22,.18))/vec2(1.55,2.15));
 float alpha=1.-smoothstep(.72,1.18,radius);if(alpha<.002)discard;
 vec2 tile=abs(fract(q*vec2(.61,.57))-.5)*2.;
 vec3 color=texture2D(photoMap,vec2(.729,.112)+tile*vec2(.143,.145)).rgb;
 float shade=texture2D(shadowMap,vec2(.5+q.x/6.,.5-q.y/6.)).r;
 color*=1.-shade;
 gl_FragColor=vec4(color,alpha);
 #include <colorspace_fragment>
}`});
  const patch=new T.Mesh(rug,rugMat);patch.renderOrder=-2;dogScene.add(patch);
  const prepareGallery=createModelPreparation(renderer,model=>renderer.compileAsync(model,camera,dogScene));
  museum=createFlankMuseum({dog,fit,origin,ring,requestFrame:()=>{dirty=true;},onSelect:selectGallery,onExit:leaveGallery,
    onReveal:()=>{showSkin=!showSkin;dirty=true;updateControls();},
    load:async(id,lod)=>{
      const variant=usesTouch.matches&&lod==='detail'?'detail-mobile':lod;
      const result=await gltf.loadAsync(assets+'hi3d-galleries/'+id+'-'+variant+'.glb');
      if(lod==='overview')await prepareGallery(result.scene);
      return result;
    }});
  await renderer.compileAsync(museum.group,camera,dogScene);
  viewCamera=camera;
  const [stops,profile,captions]=await Promise.all([json('digestion/stops.json'),json('digestion/profile.json'),json('digestion/galleries/captions.json')]);
  foodTour=createFoodTour({stops,profile,captions,museum,onExit:()=>{if(selected)museum.loadDetail(selected);},onChange:()=>{dirty=true;}});
  routeMap=createDigestiveMap({stops,worldFromNative:museum.worldFromNative,enter:i=>foodTour.begin(true,i),onChange:()=>{dirty=true;}});
  const target0=vec(0,0,-4.75).applyQuaternion(orientation).add(origin);
  const target1=vec(dog.position.x,1.40,dog.position.z-.08);
  const off=origin.clone().sub(target0),startHeading=Math.atan2(off.x,off.z),startPitch=Math.asin(off.y/off.length());
  const lensX=marble.camera_scale[0]/marble.camera_scale[2],lensY=marble.camera_scale[1]/marble.camera_scale[2];
  let aspect=W/H;
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;resizeScreen(renderer,w,h);aspect=w/h;dirty=true;}
  new ResizeObserver(resize).observe(stage);resize();
  function draw(){
    if(foodTour.active&&foodTour.render(renderer,aspect)){
      photo.style.visibility='hidden';return;
    }
    const p=angle/90,b=smooth(0,1,p);
    const moving=smooth(0,15,angle),az=mix(startHeading,Math.PI/2+yaw,p)*moving+startHeading*(1-moving);
    const el=mix(startPitch,.185,b),distance=mix(off.length(),5.55,b),target=target0.clone().lerp(target1,b);
    camera.position.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(distance).add(target);
    const side=sideRig||returnRig;
    if(side){const t=smooth(73,90,angle);camera.position.lerp(side.eye,t);target.lerp(side.target,t);}
    if(selected&&focus>0){
      const pose=galleryRig||museum.focusPose(selected,aspect),weight=smooth(0,1,focus);
      camera.position.lerp(pose.eye,weight);target.lerp(pose.target,weight);
    }
    const inCutaway=foodTour.inCutaway;
    const approach=foodTour.active&&!inCutaway?foodTour.entryPose(camera.position,target):0;
    if(inCutaway){
      const pose=foodTour.galleryPose();camera.position.copy(pose.eye);target.copy(pose.target);
    }
    drawnTarget.copy(target);
    camera.lookAt(target);camera.updateMatrixWorld();
    // Match the opening photograph's centered cover crop as the splats take over.
    let hy=mix(H/(2*fy)*Math.min(1,(W/H)/aspect),Math.max(.325,.40/aspect),b);
    hy=inCutaway?mix(Math.max(.44,.52/aspect),.40,foodTour.visitWeight):mix(hy,.375,smooth(0,1,focus));
    const hx=hy*aspect*(inCutaway?1:mix(fy/fx,1,b)),n=camera.near=inCutaway?.0015:mix(.025,.0015,Math.max(focus,sideRig?smooth(74,90,angle):0));
    camera.projectionMatrix.makePerspective(-hx*n,hx*n,hy*n,-hy*n,n,camera.far);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    roomCam.copy(camera,false);roomCam.projectionMatrix.elements[0]*=lensX;roomCam.projectionMatrix.elements[5]*=lensY;roomCam.projectionMatrixInverse.copy(roomCam.projectionMatrix).invert();
    uniforms.openAmount.value=inCutaway?1:showSkin?0:smooth(58,86,angle);
    if(inCutaway)museum.update(1,camera,90,foodTour.visiting,foodTour.visitWeight,false);
    else museum.update(uniforms.openAmount.value,camera,angle,selected,focus,showSkin);
    routeMap.draw(camera,angle>=85&&!selected&&!showSkin&&!foodTour.active);
    uniforms.alignAmount.value=inCutaway?0:1-smooth(2,13,angle);uniforms.photoAmount.value=inCutaway?0:1-smooth(.6,8,angle);
    const opacity=inCutaway?0:(1-smooth(.15,4,angle))*(1-approach);photo.style.opacity=opacity;photo.style.visibility=opacity===0?'hidden':'visible';
    if(inCutaway)foodTour.beginWorld(renderer);
    renderer.setClearColor(0x403a33);renderer.clear();fillMaterial.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    fillMaterial.uniforms.eyeMatrix.value.copy(camera.matrixWorld);
    renderer.render(backing,camera);renderer.render(room,roomCam);
    renderer.clearDepth();renderer.render(dogScene,camera);
    if(inCutaway)foodTour.afterWorld(renderer,camera,aspect);
  }
  // Allow Spark to finish camera-dependent sorting at a stationary slider position.
  let settle=0;
  function renderFrame(time){
    const elapsedSeconds=Math.max(0,(time-lastTime)*.001),dt=Math.min(.08,elapsedSeconds);lastTime=time;if(document.hidden)return;
    advanceNavigation(dt);
    if(foodTour.active){
      if(foodTour.moving){foodTour.advance(Math.min(.5,elapsedSeconds));dirty=true;}
      if(dirty){draw();dirty=false;}
      return;
    }
    if(journey){journey.elapsed+=dt;const f=journey.duration===0?1:clamp(journey.elapsed/journey.duration,0,1);angle=mix(journey.from,journey.to,smooth(0,1,f));if(f>=1){journey=null;returnRig=null;if(pending)selectGallery(pending);}dirty=true;updateControls();}
    if(focus!==focusGoal){
      const step=reduce.matches?1:dt/.95;
      focus+=Math.sign(focusGoal-focus)*Math.min(step,Math.abs(focusGoal-focus));dirty=true;
    }
    if(selected&&focusGoal===0&&focus===0){selected=null;galleryRig=null;museum.showTitle(null);if(pending)selectGallery(pending);updateControls();}
    if(dirty){settle=18;dirty=false;}
    if(settle>0){settle--;draw();}
  }
  onRoomVisibility(active=>{
    heldKeys.clear();lastTime=performance.now();dirty=true;
    renderer.setAnimationLoop(active?renderFrame:null);
  });
  const ids=[...museum.exhibits.keys()];
  const loadNext=async()=>{while(ids.length)await museum.loadOverview(ids.shift());};
  void Promise.all([loadNext(),loadNext()]);
  const query=new URLSearchParams(location.search);
  if(query.get('map')==='food')routeMap.set(true);
  if(query.get('map')==='food'||query.get('tour')==='food'||query.get('angle')==='90'||query.get('view')==='cutaway'||query.has('gallery'))angle=90;
  if(query.has('gallery'))selectGallery(query.get('gallery'));
  if(query.get('tour')==='food'){
    const station=stops.findIndex(stop=>stop.id===query.get('station'));
    foodTour.begin(false,station<0?0:station);
    if(query.has('stop'))foodTour.startAtLanding(query.get('stop'));
  }
  ready=true;stage.removeAttribute('aria-busy');stage.dataset.ready='true';play.disabled=false;slider.disabled=false;updateControls();
  window.__photoOrbit={get state(){return{tour:foodTour.state,angle,selected,focus,free:browsing(),focusYaw:(selected?galleryRig:sideRig)?.yaw||0,focusZoom:(selected?galleryRig:sideRig)?.zoom??1,target:drawnTarget.toArray(),open:uniforms.openAmount.value,installed:[...museum.exhibits].filter(([,e])=>e.overview).map(([id])=>id),detail:[...museum.exhibits].filter(([,e])=>e.detail).map(([id])=>id),world:fit.worldId,dogTriangles:dog.getObjectByName('geometry_0').geometry.index.count/3,splats:splats.numSplats,photoOpacity:photo.style.opacity,camera:camera.matrixWorld.toArray()};}};
}
document.querySelector('#retry-film').addEventListener('click',()=>location.reload());
start().catch(err=>{
  console.error(err);stage.removeAttribute('aria-busy');hint.textContent='三维场景暂未载入。';
  document.querySelector('#retry-film').hidden=false;
});
