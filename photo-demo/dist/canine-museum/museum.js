import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {buildModel,addCoat,addFlank} from './model.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {rooms} from './collection.js';
const $=s=>document.querySelector(s),stage=$('#stage'),pins=$('#pins'),range=$('#angle');
const params=new URLSearchParams(location.search),marbleOnly=params.get('view')==='marble',reviewId=params.get('review');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=(a,l=0,h=1)=>Math.min(h,Math.max(l,a)),mix=T.MathUtils.lerp,radians=T.MathUtils.degToRad;
const ease=x=>{x=clamp(x);return x*x*(3-2*x);},band=(a,b,x)=>ease((x-a)/(b-a));
const V=(x,y,z)=>new T.Vector3(x,y,z);
const pictograms=[
'M18 28C13 25 5 19 6 11q1-6 7-4l2-4 4 1-1 5q6-4 8 1c2 7-3 14-8 18Zm-2-18-3 7 5 3-1 5M20 9l2-5 3 1-1 5',
'M15 5v8l-4 4m7-12v8l4 4M13 8C8 7 4 18 4 25c0 3 6 1 9-2l1-11m5-4c5-1 9 10 9 17 0 3-6 1-9-2l-1-11',
'M3 20c0-7 6-13 14-13 5 0 10 2 12 6-1 4-5 5-9 6l-5 6-3-4c-3 3-6 5-9 4Zm16-11q-1 6-5 11',
'M9 4h4v7c2 5 4 7 7 3l3-4c4-2 6 3 5 7-2 8-9 12-16 8-4-2-6-6-7-8l-3-1 1-4 5 2q2 1 3 4',
'M11 7c-5-2-9 4-8 11 0 5 4 9 8 7 4-2 2-6 1-8-2-4 3-7-1-10Zm10 0c5-2 9 4 8 11 0 5-4 9-8 7-4-2-2-6-1-8 2-4-3-7 1-10Zm-8 8 3 3v10m4-13-4 4',
'M6 6h19q4 0 4 4v13q0 4-4 4H8q-4 0-4-4V10q0-4 3-4Zm2 5h14q3 0 3 2t-3 2H10q-3 0-3 2t3 2h12q3 0 3 2t-3 2H11'];
const dom=new Map(),installed=new Set();
let focusYaw=0,focusPitch=.08,focusZoom=1,worldId=null;
rooms.forEach((r,i)=>{
 let b=document.createElement('button');b.className='entry';b.disabled=true;b.style.setProperty('--c',r.color);b.dataset.room=r.id;b.setAttribute('aria-pressed','false');
 b.innerHTML='<span class="num">'+r.n+'</span><svg viewBox="0 0 32 32" aria-hidden="true"><path d="'+pictograms[i]+'"/></svg><span><strong>'+r.name+'</strong><small>'+r.organ+'</small></span><span class="go" aria-hidden="true">↗</span>';
 $('#catalog').append(b);let pin=document.createElement('button');pin.className='pin';pin.textContent=r.n;pin.hidden=true;pin.setAttribute('aria-label',r.organ+' · '+r.name);pins.append(pin);
 for(const btn of [b,pin])btn.addEventListener('click',()=>visit(r));dom.set(r.id,{b,pin});
});
let renderer,camera,realCamera,marbleLens=[1,1],real,model,screen,blend,realRT,modelRT,reg,root,skin,flankTravel,gaussian,spark,gsOkay=false,ready=false;
let angle=0,selected=null,pending=null,focus=0,focusTween=null,travel=null,drag=null,last=0,dirty=true,aspect=1;
const sourceQ=new T.Quaternion(),sourcePos=V(),srcLook=V(),look=V(),overviewPos=V(),baseTarget=V(),sideTarget=V(-.04,1.27,-.19);
const overviewButton=$('#overview'), turn=$('#turn');
function controls(){
 range.value=angle;$('#degrees').textContent=String(Math.round(angle)).padStart(3,'0')+'°';
 const move=travel!==null;
 $('#playLabel').textContent=move?'暂停绕行':angle>=89.99?'回到原照':'绕到右侧';
 $('#playMark').textContent=move?'Ⅱ':angle>=89.99?'↶':'↻';
 $('#viewName').textContent=selected&&focus>.5?selected.name:angle<.3?'原照机位':angle<13&&gsOkay?'实景视差':angle<66?'绕行观察':'侧面剖景';
 if(marbleOnly)$('#viewName').textContent='Marble 实景';
 overviewButton.hidden=!selected;$('#focusZoom').hidden=!selected;
 if(dom.lastSelection!==selected){dom.lastSelection=selected;$('#tag').textContent=selected?('GALLERY '+selected.n+' / '+selected.en):'CURATOR’S NOTE';
 $('#labelTitle').textContent=selected?selected.organ+' · '+selected.name:'一张照片，两种尺度';
 $('#labelText').textContent=selected?selected.text:installed.size?'转到小狗侧面，点选编号进入展区。':'侧面可观察脊椎、肋骨和四肢。六件器官模型尚未入馆。';
 for(const [id,d] of dom)d.b.setAttribute('aria-pressed',String(selected?.id===id));}
 if(ready){const hint=marbleOnly?'拖动查看 Marble 生成的房间与小狗。':selected?'拖动看两侧，滚轮或加减键推近。':angle>=82?(installed.size?'点选展区编号，近看馆藏。':'骨架剖面 · 器官筹备中'):'拖动画面或滑杆，自由绕行。';if($('#hint').textContent!==hint)$('#hint').textContent=hint;}
}
function framePose(){
 const p=angle/90, w=ease(p),a0=Math.atan2(sourcePos.x-srcLook.x,sourcePos.z-srcLook.z);
 const pitch0=Math.asin((sourcePos.y-srcLook.y)/sourcePos.distanceTo(srcLook));
 const az=mix(a0,Math.PI/2,.23*p+.77*ease(p)), elev=mix(pitch0,.113,w),dist=mix(sourcePos.distanceTo(srcLook),4.78,w);
 baseTarget.copy(srcLook).lerp(sideTarget,w);overviewPos.set(Math.sin(az)*Math.cos(elev),Math.sin(elev),Math.cos(az)*Math.cos(elev)).multiplyScalar(dist).add(baseTarget);
 camera.position.copy(overviewPos);look.copy(baseTarget);
 const fx=reg.intrinsics[0][0],fy=reg.intrinsics[1][1],[W,H]=reg.source;
 // Fit all four source corners exactly as object-fit: contain, including tablet crops.
 const srcHoriz=W/(2*fx),srcVert=H/(2*fy),sourceAspect=W/H;
 const ax=srcHoriz*Math.max(1,aspect/sourceAspect),ay=srcVert*Math.max(1,sourceAspect/aspect);
 const sideY=Math.max(.395,.49/aspect);
 const breathingRoom=.086*Math.sin(p*Math.PI);
 let hx=mix(ax,sideY*aspect,w)+breathingRoom*aspect,hy=mix(ay,sideY,w)+breathingRoom;
 if(selected&&focus>0){
   const room=selected,S=V(...room.pos),t=ease(focus);
   const target=S.clone().add(V(.022,0,0)),radius=Math.max(.24,room.size[1]*1.45,room.size[0]*1.58/aspect);
   const eye=target.clone().add(V(Math.cos(focusYaw)*Math.cos(focusPitch),Math.sin(focusPitch),-Math.sin(focusYaw)*Math.cos(focusPitch)).multiplyScalar(2.85*radius*focusZoom));
   camera.position.lerp(eye,t);look.lerp(target,t);hx=mix(hx,.329*aspect,t);hy=mix(hy,.329,t);
 }
 camera.lookAt(look);camera.updateMatrixWorld(true);
 let n=camera.near;camera.projectionMatrix.makePerspective(-n*hx,n*hx,n*hy,-n*hy,n,camera.far);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 const show=!marbleOnly&&angle>=77&&!selected;let sw=stage.clientWidth,sh=stage.clientHeight;
 for(const room of rooms){const pin=dom.get(room.id).pin;pin.hidden=!show||!installed.has(room.id);if(!pin.hidden){
   const pos=V(...room.pos).add(V(.12,-room.size[1]*.55,-room.size[0]*.61)).project(camera);
   pin.style.left=((pos.x+1)*.5*sw)+'px';pin.style.top=((1-pos.y)*.5*sh)+'px';
 }}
}
function render(){
 framePose();if(gsOkay){realCamera.copy(camera,false);realCamera.projectionMatrix.elements[0]*=marbleLens[0];realCamera.projectionMatrix.elements[5]*=marbleLens[1];realCamera.projectionMatrixInverse.copy(realCamera.projectionMatrix).invert();}const g=gsOkay?1-band(5.2,14.5,angle):0;
 const photo=marbleOnly&&gsOkay?0:gsOkay?1-band(.08,2.4,angle):1-band(.08,15,angle);$('#photo').style.opacity=photo;$('#photo').style.visibility=photo===0?'hidden':'visible';
 flankTravel.travel.value=band(8,66,angle);const slice=mix(2.2,-2.5,band(24,79,angle));flankTravel.slice.value=slice;root.cut(slice);skin.coat.material.opacity=1-band(10,26,angle);skin.coat.visible=skin.coat.material.opacity>.001;
 if(photo>=1)return;
 if(marbleOnly&&gsOkay){renderer.setRenderTarget(null);renderer.render(real,realCamera);return;}
 if(g<=0||g>=1){renderer.setRenderTarget(null);renderer.render(g>0?real:model,g>0?realCamera:camera);return;}
 renderer.setRenderTarget(realRT);renderer.render(real,realCamera);
 renderer.setRenderTarget(modelRT);renderer.render(model,camera);
 blend.uniforms.weight.value=g;renderer.setRenderTarget(null);renderer.render(screen,screen.userData.eye);
}
function resize(){
 if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
 aspect=w/h;renderer.setSize(w,h,false);let s=renderer.getDrawingBufferSize(new T.Vector2());realRT?.setSize(s.x,s.y);modelRT?.setSize(s.x,s.y);dirty=true;
}
function clearFocus(){selected=null;pending=null;focusTween=null;focus=0;}
function manual(a){travel=null;clearFocus();angle=clamp(a,0,90);dirty=true;controls();}
function startTravel(to,after=null){
 travel=null;clearFocus();pending=after;
 if(reduced.matches||Math.abs(to-angle)<.04){angle=to;finishTravel();return;}
 travel={from:angle,to,elapsed:0,duration:Math.max(.36,Math.abs(to-angle)/90*4.25)};dirty=true;controls();
}
function finishTravel(){travel=null;let r=pending;pending=null;if(r)startFocus(r);dirty=true;controls();}
function startFocus(room){
 focusYaw=0;focusPitch=.08;focusZoom=1;
 selected=room;focus=0;focusTween=reduced.matches?null:{from:0,to:1,elapsed:0,duration:.82};
 if(reduced.matches)focus=1;dirty=true;controls();
}
function visit(r){
 if(!ready||!installed.has(r.id))return;
 if(selected?.id===r.id)return;
 if(selected&&!reduced.matches){focusTween={from:focus,to:0,elapsed:0,duration:.36,afterRoom:r};dirty=true;return;}
 if(selected){focus=0;selected=null;focusTween=null;}
 if(angle<89.99)startTravel(90,r);else startFocus(r);
}
function leave(){
 if(!selected)return;
 if(reduced.matches){clearFocus();}else focusTween={from:focus,to:0,elapsed:0,duration:.65};
 dirty=true;controls();
}
function direction(to){
 if(selected&&!reduced.matches){focusTween={from:focus,to:0,elapsed:0,duration:.43,after:to};dirty=true;return;}
 startTravel(to);
}
turn.addEventListener('click',()=>{if(travel){travel=null;pending=null;controls();}else direction(angle>=89.99?0:90);});
for(const [id,factor] of [['#nearer',.82],['#farther',1.22]])$(id).addEventListener('click',()=>{focusZoom=clamp(focusZoom*factor,.46,1.28);dirty=true;});
overviewButton.addEventListener('click',leave);range.addEventListener('input',()=>manual(+range.value));
stage.addEventListener('pointerdown',e=>{if(!ready||e.target.closest('button'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,a:angle,yaw:focusYaw,pitch:focusPitch,moved:false};stage.setPointerCapture(e.pointerId);});
stage.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;let dx=e.clientX-drag.x;let dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4){drag.moved=true;if(selected){focusYaw=clamp(drag.yaw+dx/stage.clientWidth*1.8,-.65,.65);focusPitch=clamp(drag.pitch+dy/stage.clientHeight*.8,-.25,.38);dirty=true;}else manual(drag.a+dx/stage.clientWidth*106);}});
stage.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const click=!drag.moved;drag=null;
 if(click&&ready&&angle>=77&&!selected){
  const rect=stage.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera({x:(e.clientX-rect.left)/rect.width*2-1,y:1-(e.clientY-rect.top)/rect.height*2},camera);
  const hits=ray.intersectObjects([...root.anchors.values()],true);
  if(hits.length){let o=hits[0].object;while(o&&!root.anchors.has(o.name))o=o.parent;if(o)visit(rooms.find(r=>r.id===o.name));}
 }});
for(const ev of ['pointercancel','lostpointercapture'])stage.addEventListener(ev,()=>drag=null);
stage.addEventListener('wheel',e=>{if(!selected)return;e.preventDefault();focusZoom=clamp(focusZoom*Math.exp(e.deltaY*.0017),.46,1.28);dirty=true;},{passive:false});
stage.addEventListener('keydown',e=>{if(!ready||e.target!==stage)return;if(selected&&['ArrowLeft','ArrowRight','+','=','-'].includes(e.key)){e.preventDefault();if(e.key.startsWith('Arrow'))focusYaw=clamp(focusYaw+(e.key==='ArrowLeft'?-.1:.1),-.65,.65);else focusZoom=clamp(focusZoom*(e.key==='-'?1.12:.89),.46,1.28);dirty=true;return;}let a={ArrowLeft:angle-3,ArrowRight:angle+3,Home:0,End:90}[e.key];if(a!==undefined){e.preventDefault();manual(a);}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected){leave();stage.focus({preventScroll:true});}});
function tick(t){
 const dt=Math.min((t-last)*.001,.08);last=t;if(document.hidden)return;
 if(travel){let j=travel;j.elapsed+=dt;angle=mix(j.from,j.to,ease(j.elapsed/j.duration));if(j.elapsed>=j.duration){angle=j.to;finishTravel();}controls();dirty=true;}
 if(focusTween){let j=focusTween;j.elapsed+=dt;focus=mix(j.from,j.to,ease(j.elapsed/j.duration));if(j.elapsed>=j.duration){focus=j.to;focusTween=null;if(focus===0){clearFocus();if(j.after!==undefined)startTravel(j.after);else if(j.afterRoom)startFocus(j.afterRoom);}controls();}dirty=true;}

 if(dirty||marbleOnly||angle>0&&angle<15){render();dirty=false;}
}
async function checked(url,kind){let r=await fetch(url);if(!r.ok)throw Error(url+' '+r.status);return r[kind]();}
async function boot(){
 let [registration,bytes,texture,flank,fbytes,profile,catalog]=await Promise.all([checked('./assets/registration.json','json'),checked('./assets/visible-coat.bin','arrayBuffer'),new T.TextureLoader().loadAsync('./assets/original.jpg'),checked('./assets/flank.json','json'),checked('./assets/flank.bin','arrayBuffer'),new T.TextureLoader().loadAsync('./assets/flank.webp'),checked('./assets/organs/catalog.json','json')]);
 reg=registration;texture.colorSpace=T.SRGBColorSpace;renderer=new T.WebGLRenderer({canvas:$('#world'),antialias:true,alpha:false,preserveDrawingBuffer:true});
 renderer.localClippingEnabled=true;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.outputColorSpace=T.SRGBColorSpace;
 camera=new T.PerspectiveCamera(40,1,.015,90);realCamera=new T.PerspectiveCamera();sourcePos.fromArray(reg.origin);sourceQ.fromArray(reg.quaternion);srcLook.set(0,0,-4.75).applyQuaternion(sourceQ).add(sourcePos);
 model=new T.Scene();model.background=new T.Color('#e0e4d7');root=buildModel();model.add(root.world);skin=addCoat(root.world,reg,bytes,texture);profile.colorSpace=T.SRGBColorSpace;flankTravel=addFlank(root.world,flank,fbytes,profile,texture);
 const envGen=new T.PMREMGenerator(renderer),studio=new RoomEnvironment(),env=envGen.fromScene(studio,.035);model.environment=env.texture;model.environmentIntensity=.64;studio.dispose();envGen.dispose();
 const sky=new T.HemisphereLight(0xfff7e9,0x96aa9b,1.05);model.add(sky);
 for(const [pos,color,intens] of [[[-4,7,3],0xfff2dc,1.65],[[3,4,-3],0xffe9cb,1.05],[[-2,2,-5],0xd6e4db,.68]]){
   let l=new T.DirectionalLight(color,intens);l.position.fromArray(pos);model.add(l);
 }
 const ground=new T.Mesh(new T.PlaneGeometry(80,80),new T.ShaderMaterial({vertexShader:'varying vec3 p; void main(){p=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}',fragmentShader:`varying vec3 p;void main(){ float d=length(vec2(p.x*1.0,(p.z+.19)*.48));float shadow=.19*exp(-pow(max(0.,d-.74)*3.,2.));float outer=smoothstep(.9,7.,d);vec3 c=mix(vec3(.78,.805,.73),vec3(.745,.776,.680),outer)-vec3(shadow);gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
 }`}));
 ground.rotation.x=-Math.PI/2;ground.position.y=-.18;model.add(ground);
 real=new T.Scene();real.background=new T.Color('#dfe1d6');
 realRT=new T.WebGLRenderTarget(1,1);modelRT=new T.WebGLRenderTarget(1,1,{samples:2});
 screen=new T.Scene();screen.userData.eye=new T.OrthographicCamera(-1,1,1,-1,0,1);
 blend=new T.ShaderMaterial({uniforms:{real:{value:realRT.texture},art:{value:modelRT.texture},weight:{value:0}},vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 p;uniform sampler2D real,art;uniform float weight;void main(){gl_FragColor=vec4(mix(texture2D(art,p).rgb,texture2D(real,p).rgb,weight),1.);
 #include <colorspace_fragment>
 }`,depthWrite:false,depthTest:false});
 screen.add(new T.Mesh(new T.PlaneGeometry(2,2),blend));resize();new ResizeObserver(resize).observe(stage);
 try{
   const {SparkRenderer,SplatMesh}=await import('@sparkjsdev/spark');
   const [meta,fit]=await Promise.all([checked('./assets/marble/scene.json','json'),checked('./assets/marble/registration.json','json')]);
   const variant=meta.variants.full_res;
   if(fit.world_id!==meta.world_id||fit.source_sha256!==reg.files['original.jpg'].sha256||fit.full_sha256!==variant.sha256)throw Error('Marble registration mismatch');
   const file=window.matchMedia('(max-width: 640px)').matches ? meta.variants['500k'].file : variant.file;
   spark=new SparkRenderer({renderer,apertureAngle:0,blurAmount:0,enableLod:false,sortRadial:false});real.add(spark);
   gaussian=new SplatMesh({url:'./assets/marble/'+file,lod:false,extSplats:true});
   const holder=new T.Group(),lens=new T.Group(),inverse=new T.Group();
   holder.position.copy(sourcePos);holder.quaternion.copy(sourceQ);real.add(holder);holder.add(lens);
   lens.scale.setScalar(fit.camera_scale[2]);marbleLens=fit.camera_scale.slice(0,2).map(n=>n/fit.camera_scale[2]);lens.rotation.x=Math.PI;lens.add(inverse);
   inverse.quaternion.fromArray(fit.cv_to_raw_quaternion).invert();
   inverse.position.fromArray(fit.raw_center).negate().applyQuaternion(inverse.quaternion);
   inverse.add(gaussian);await gaussian.initialized;gsOkay=gaussian.numSplats>0;worldId=meta.world_id;
 }catch(e){console.warn('Gaussian unavailable; original photo and modeled galleries remain available.',e);$('#failure').textContent='实景视差未载入，仍可从原照进入展馆。';$('#failure').hidden=false;}
 const draco=new DRACOLoader().setDecoderPath('../vendor/draco/'),loader=new GLTFLoader().setDRACOLoader(draco);
 await Promise.all(rooms.map(async room=>{
  const entry=catalog.organs[room.id],{b}=dom.get(room.id);
  if((entry?.state==='approved'&&entry.sha256||entry?.state==='staged'&&reviewId===room.id)&&entry.task_id){
    try{const {scene}=await loader.loadAsync('./assets/organs/'+room.id+'.glb');root.install(room,scene,entry.rotation??[0,0,0]);installed.add(room.id);b.disabled=false;return;}catch(e){console.error('Organ failed to load',room.id,e);}
  }
  b.querySelector('small').textContent=room.organ+' · 筹备中';b.querySelector('.go').textContent='—';
 }));
 draco.dispose();ready=true;stage.dataset.ready='true';turn.disabled=false;range.disabled=false;if(marbleOnly){document.querySelector('.track span').textContent='右侧实景';$('#modeLink').textContent='回到剖景展台 ↗';$('#modeLink').href='./cutaway.html';}
 if(params.get('angle')==='90')manual(90);
 controls();renderer.setAnimationLoop(tick);if(reviewId&&installed.has(reviewId))visit(rooms.find(r=>r.id===reviewId));
 window.__canine={get state(){return{angle,focus,room:selected?.id??null,splats:gaussian?.numSplats??0,
  worldId,installed:[...installed],camera:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),gsOkay,drawCalls:renderer.info.render.calls};}};
}
boot().catch(err=>{console.error(err);$('#hint').textContent='三维展台未就绪';$('#failure').textContent='三维展台暂不可用。请检查本地展件资产与 WebGL，刷新后重试。';$('#failure').hidden=false;});
