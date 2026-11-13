import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
import {assemble} from './assembly.js';
import {classroom} from './desk.js';
import {memoryClock,sample,clamp} from './memory.js';
import {makeCampus} from './campus.js';
import {campusTour} from './campus-tour.js';
import {sound} from './sound.js';
import {roomVisible,onRoomVisibility} from './cinema/room.js';
const $=id=>document.getElementById(id), V=(...a)=>new T.Vector3(...a),ease=(a,b,t)=>T.MathUtils.smoothstep(t,a,b);
async function boot(){
 const load=async file=>{const r=await fetch(file);if(!r.ok)throw Error(file+' 未能加载');return r.json();};
 const [spec,a]=await Promise.all([load('./scene.json'),load('./alignment.json'),$('photo').decode()]);
 const room=spec.room,stage=$('stage'),frame=$('frame'),real=new T.Scene(),tiny=new T.Scene(),cam=new T.PerspectiveCamera(40,1,.0005,100);
 const renderer=id=>{const r=new T.WebGLRenderer({canvas:$(id),alpha:true,antialias:true});r.setPixelRatio(Math.min(devicePixelRatio,1.8));r.setClearColor(0,0);return r;};
 const gs=renderer('world'),mesh=renderer('mesh');mesh.toneMapping=T.ACESFilmicToneMapping;mesh.toneMappingExposure=1.01;mesh.shadowMap.enabled=true;mesh.shadowMap.type=T.PCFSoftShadowMap;
 const studio=new RoomEnvironment(),pm=new T.PMREMGenerator(mesh),env=pm.fromScene(studio,.035);tiny.environment=env.texture;tiny.environmentIntensity=.65;studio.dispose();pm.dispose();
 tiny.add(new T.HemisphereLight(0xfff5df,0x829390,.85));const key=new T.DirectionalLight(0xffdea6,2.05);key.position.set(-1,2,.4);tiny.add(key);
 key.castShadow=true;key.shadow.mapSize.setScalar(innerWidth<650?1024:2048);key.shadow.bias=-.0004;key.shadow.normalBias=.00014;
 Object.assign(key.shadow.camera,{left:-.16,right:.16,top:.16,bottom:-.16,near:.02,far:1.2});key.shadow.camera.updateProjectionMatrix();tiny.add(key.target);
 const rim=new T.DirectionalLight(0xc0dbea,.78);rim.position.set(1,1,-1);tiny.add(rim);
 const spark=new SparkRenderer({renderer:gs,enableLod:false,sortRadial:false,blurAmount:.3}),splats=new SplatMesh({url:room.file,lod:false,extSplats:true});
 const axis=new T.Group(),alignment=new T.Group();axis.rotation.x=Math.PI;
 if(room.rawToCamera){alignment.quaternion.fromArray(room.rawToCamera);splats.position.fromArray(room.rawCenter).negate();}
 alignment.add(splats);axis.add(alignment);real.add(axis,spark);
 const loader=new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('./vendor/draco/'));
 const contextPromise=classroom(tiny,room,a);
 const entries=await Promise.all(Object.entries(spec.models).map(async([role,g])=>[role,await loader.loadAsync(g.file)]));
 const textureLoader=new T.TextureLoader();
 const [sky,ground,surface,brick,calibration]=await Promise.all([textureLoader.loadAsync('school-sky.jpg'),textureLoader.loadAsync('school-ground.jpg'),textureLoader.loadAsync('playing-surface.jpg'),textureLoader.loadAsync('courtyard-brick.jpg'),load('./campus-assets.json')]);
 for(const tex of [sky,ground,surface,brick]){tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=Math.min(8,mesh.capabilities.getMaxAnisotropy());}
 brick.wrapS=brick.wrapT=T.MirroredRepeatWrapping;sky.mapping=T.EquirectangularReflectionMapping;ground.wrapS=ground.wrapT=T.MirroredRepeatWrapping;ground.repeat.set(70,60);
 const assembly=assemble({...spec,calibration},a,Object.fromEntries(entries),tiny);
 const campus=makeCampus(assembly.sources,{sky,ground,surface,brick},env.texture,calibration),tour=campusTour(mesh,assembly,campus,a.unit);
 const [context]=await Promise.all([contextPromise,splats.initialized]);
 for(const role of ['shell','pencil','reel'])context.registerSource(assembly.sources[role]);
 const clock=memoryClock(),tape=sound(),pivot=V(...a.position),Y=V(0,1,0),end=.44,fx=room.intrinsics[0],fy=room.intrinsics[1],cx=room.intrinsics[2],cy=room.intrinsics[3];
 let progress=0,close=false,drag=null,inspectX=0,inspectY=0,last=null,ready=false;
 const clampAngle=x=>Math.atan2(Math.sin(x),Math.cos(x)),front=pivot.clone().negate(),rear=V(-.085,.12,1).normalize();
 let frameWidth=0,frameHeight=0;
 function projection(s){
  const n=cam.near,x=T.MathUtils.lerp(cx,room.width/2,s),y=T.MathUtils.lerp(cy,room.height/2,s);
  const aspect=frameWidth/frameHeight,sourceAspect=room.width/room.height;
  const crop=aspect<sourceAspect-.01?.93:1;
  const vertical=crop*sourceAspect/aspect;
  cam.projectionMatrix.makePerspective(-x*n/fx*crop,(room.width-x)*n/fx*crop,y*n/fy*vertical,-(room.height-y)*n/fy*vertical,n,cam.far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
 }
 const pointPx=(pt,camera=cam)=>{const p=pt.clone().project(camera),r=frame.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width*.5,y:r.top+(1-p.y)*r.height*.5};};
 function fitFrame(){
  const r=stage.getBoundingClientRect(),aspect=room.width/room.height;
  const k=Math.min(r.width/room.width,r.height/room.height),w=Math.round(k*room.width);
  const h=close&&r.width<650?Math.round(r.height):Math.round(w/aspect);
  if(frameWidth===w&&frameHeight===h)return;
  frameWidth=w;frameHeight=h;frame.style.width=w+'px';frame.style.height=h+'px';gs.setSize(w,h,false);mesh.setSize(w,h,false);
 }
 function draw(present=true){
  fitFrame();
  const p=progress;assembly.stand(p);
  key.target.position.copy(assembly.root.position);
  key.position.copy(V(-.21,.28,.27).applyQuaternion(assembly.rear.getWorldQuaternion(new T.Quaternion()))).add(key.target.position);
  const u=clamp((p-end)/(1-end)),s=ease(0,1,u);
  const angle=(p<=end?3*p/end:3+(spec.revealDeg-3)*s+3/end*(1-end)*u*(1-u)**2)*Math.PI/180;
  const delta=front.clone().applyAxisAngle(Y,angle),target=assembly.target();
  const outerDir=rear.clone();
  outerDir.applyQuaternion(assembly.rear.getWorldQuaternion(new T.Quaternion()));
  const mid=delta.clone().normalize().lerp(outerDir,ease(.55,1,u)).normalize();
  const look=pivot.clone().lerp(target,s*.65);cam.position.copy(look).addScaledVector(mid,T.MathUtils.lerp(front.length(),a.unit*156,s));
  cam.up.copy(Y).lerp(V(0,1,0).applyQuaternion(assembly.root.quaternion),s).normalize();cam.lookAt(look);
  const srcQ=new T.Quaternion().setFromAxisAngle(Y,angle);cam.quaternion.slerp(srcQ,1-ease(.1,.85,p));
  if(close){const q=assembly.rear.getWorldQuaternion(new T.Quaternion());const d=V(-.06+inspectX,.055+inspectY,1).normalize().applyQuaternion(q);
   cam.position.copy(target).addScaledVector(d,a.unit*84);cam.lookAt(target);}
  projection(close?1:s);cam.updateMatrixWorld();assembly.cut(p);context.update(p,assembly);
  if(!present)return;
  const wipe=ease(.25,end,p);$('world').style.opacity=String(1-wipe);
  $('mesh').style.opacity=p>=.24?'1':'0';$('photo').style.opacity=1-ease(.012,.15,p);
  $('progress').value=Math.round(p*1000);$('progress').disabled=!ready||close;$('enter').disabled=!ready||p<.8;$('enter').textContent=close?'返回全景':'靠近广播室';
  $('grip').hidden=$('action').hidden=!close;
  if(close){const r=stage.getBoundingClientRect(),g=pointPx(assembly.gripPoint());$('grip').style.left=clamp(g.x-r.left,24,r.width-24)+'px';$('grip').style.top=clamp(g.y-r.top,22,r.height-22)+'px';$('grip').textContent=g.x<r.left+r.width/2?'拧笔 →':'← 拧笔';}
  $('caption').textContent=close?(stage.clientWidth<650?'按住笔杆，向箭头方向拖动倒带，松手续播。':'转动笔杆，或沿箭头拖动「拧笔」。松手续播，也可按住 R 键。'):p<.15?'向左拖动，绕过磁带。':p<.8?'沿着透明壳的边缘，继续绕到背面。':'广播室在两只带轮之间。';tourUI();
 }
 let shownMode=null;
 function tourUI(){
  const mode=tour.mode(),out=tour.active();shownMode=mode;
  $('yard').hidden=!close;$('yard').textContent=out?'返回广播室':'穿过窗户';$('yard').disabled=mode==='inbound'||mode==='returning';
  $('stick').hidden=mode!=='court'||!(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints);
  $('enter').hidden=out;$('progress').hidden=out;$('grip').hidden=!close||out;
  if(out)$('caption').textContent=mode==='court'?(navigator.maxTouchPoints?'左侧摇杆行走，拖动画面环顾。':'WASD 行走，拖动画面或用方向键环顾。'):(mode==='outbound'?'穿过广播室窗户…':'沿来路回到窗前…');
 }
 function update(){const s=sample(clock.time);assembly.animate(clock.time);campus.animate(clock.time);$('counter').textContent='A　00:0'+Math.floor(clock.time)+'·'+Math.floor(clock.time*10)%10;
  $('sub').textContent=close&&(!tour.active()||clock.time<3.995)?s.caption:'';$('action').setAttribute('aria-pressed',String(!!clock.held));$('grip').dataset.held=String(clock.held==='pencil');tape.update(clock.time,roomVisible()&&close&&clock.playing,roomVisible()&&close&&!!clock.held);}
 function release(){clock.release();drag=null;update();}
 function seek(n){tour.reset();if(close)clock.leave();close=false;drag=null;inspectX=inspectY=0;progress=clamp(n);if(n===0)clock.restart();draw();update();}
 function visit(){if(tour.active()){tour.back();tourUI();return;}if(progress<.8)return;if(close){clock.leave();close=false;}else{close=true;clock.enter();}drag=null;inspectX=inspectY=0;draw();update();}
 draw(false);progress=1;draw(false);assembly.animate(4);campus.animate(4);await mesh.compileAsync(tiny,cam);const culled=[];
 for(const scene of [tiny,campus.scene])scene.traverse(o=>{if(o.isMesh&&o.frustumCulled){o.frustumCulled=false;culled.push(o);}});
 tour.update(0,cam,frameWidth/frameHeight);tour.render(cam,tiny,true,frameWidth/frameHeight);
 for(const o of culled)o.frustumCulled=true;
 assembly.animate(0);campus.animate(0);for(const checkpoint of [.74,1,0]){progress=checkpoint;draw(false);tour.update(0,cam,frameWidth/frameHeight);tour.render(cam,tiny,assembly.rear.visible,frameWidth/frameHeight);}
 real.updateMatrixWorld(true);await spark.update({scene:real,camera:cam});gs.render(real,cam);
 const ray=new T.Raycaster();function hitsPen(e){const r=frame.getBoundingClientRect();ray.setFromCamera(new T.Vector2(2*(e.clientX-r.left)/r.width-1,1-2*(e.clientY-r.top)/r.height),cam);return ray.intersectObject(assembly.pencil,true).length>0;}
 stage.onpointerdown=e=>{if(e.button!==0||(!tour.active()&&!e.isPrimary))return;
  if(tour.active()){
   if(tour.mode()!=='court'||drag)return;
   drag={kind:'campus',id:e.pointerId,x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);e.preventDefault();return;
  }
  const g=pointPx(assembly.hubPoint()),on=close&&(e.target===$('grip')||hitsPen(e));
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,p:progress,sx:inspectX,sy:inspectY,g,theta:Math.atan2(e.clientY-g.y,e.clientX-g.x),kind:on?'pencil':close?'look':'orbit',sign:e.clientX<stage.getBoundingClientRect().left+stage.clientWidth/2?-1:1,linear:e.pointerType==='touch'||e.target===$('grip')};
  if(on){clock.begin('pencil');update();}stage.setPointerCapture(e.pointerId);e.preventDefault();};
 stage.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;const d=drag,dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(d.kind==='campus'){tour.look(dx/stage.clientWidth,dy/stage.clientHeight,e.pointerType);d.x=e.clientX;d.y=e.clientY;}
  else if(d.kind==='orbit'){progress=clamp(d.p-dx/stage.clientWidth*1.55);draw();}
  else if(d.kind==='look'){inspectX=clamp(d.sx-dx/stage.clientWidth,-.22,.22);inspectY=clamp(d.sy+dy/stage.clientHeight*.4,-.10,.18);draw();}
  else{const th=Math.atan2(e.clientY-d.g.y,e.clientX-d.g.x);clock.scrub(d.linear?d.sign*(e.clientX-d.lastX)/stage.clientWidth*11:-clampAngle(th-d.theta)*1.65);d.theta=th;d.lastX=e.clientX;update();}
 };
 const endDrag=e=>{if(drag&&(!e||e.pointerId===drag.id))release();};stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=endDrag;
 const action=$('action');action.onpointerdown=e=>{if(!e.isPrimary||e.button!==0)return;e.preventDefault();action.setPointerCapture(e.pointerId);clock.begin('button');update();};action.onpointerup=action.onpointercancel=action.onlostpointercapture=()=>{if(clock.held==='button')release();};
 window.addEventListener('keydown',e=>{if(!ready||e.ctrlKey||e.metaKey||e.altKey)return;if(tour.key(e.code,true)){e.preventDefault();return;}if(close&&(e.code==='KeyR'||e.code==='Space'&&(e.target===stage||e.target===action))){e.preventDefault();if(!e.repeat)clock.begin('button');return;}
  if(e.key==='Escape'&&close)visit();if(e.target===stage){if(e.key==='Home')seek(0);if(!close&&e.key==='End')seek(1);if(!close&&['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();seek(progress+(e.key==='ArrowRight'?.025:-.025));}}});
 window.addEventListener('keyup',e=>{tour.key(e.code,false);if(['KeyR','Space'].includes(e.code)&&clock.held==='button')release();});window.addEventListener('blur',()=>{tour.clear();release();});onRoomVisibility(visible=>{last=null;if(!visible){tour.clear();release();}});
 const windowHit=new T.Raycaster();
 function goToCourt(){release();if(tour.active())tour.back();else if(close)tour.start(cam);tourUI();stage.focus({preventScroll:true});}
 $('yard').onclick=goToCourt;
 stage.addEventListener('dblclick',e=>{
  if(!close||tour.active())return;
  const r=frame.getBoundingClientRect();windowHit.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),cam);
  const hits=windowHit.intersectObjects(assembly.rear.children,true);
  if(hits[0]?.object.name==='操场窗口')goToCourt();
 });
 const stick=$('stick'),nub=stick.querySelector('i');let stickId=null;
 function steer(e){const r=stick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/30,y=(e.clientY-r.top-r.height/2)/30,n=Math.max(1,Math.hypot(x,y));
  tour.stick(x/n,y/n);nub.style.transform='translate('+x/n*24+'px,'+y/n*24+'px)';}
 stick.onpointerdown=e=>{e.stopPropagation();if(stickId!==null)return;e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);steer(e);};
 stick.onpointermove=e=>{if(e.pointerId===stickId){e.stopPropagation();steer(e);}};
 stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=e=>{if(e.pointerId===stickId){e.stopPropagation();stickId=null;tour.stick(0,0);nub.style.transform='';}};
 $('home').onclick=()=>seek(0);$('enter').onclick=visit;$('progress').oninput=e=>seek(+e.target.value/1000);$('sound').onclick=()=>{const on=tape.enable();$('sound').textContent=on?'关闭广播':'开启广播';$('sound').setAttribute('aria-pressed',String(on));update();};
 new ResizeObserver(()=>draw()).observe(stage);ready=true;$('home').disabled=false;seek(0);let triangles=0;for(const scene of [tiny,campus.scene])scene.traverse(o=>{if(o.geometry)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
 stage.dataset.ready='true';
 mesh.setAnimationLoop(now=>{
  if(!roomVisible())return;
  const dt=last===null?0:clamp((now-last)/1000,0,.1);last=now;
  if(close&&!document.hidden){clock.advance(dt);update();}
  tour.update(dt,cam,frameWidth/frameHeight);
  if(tour.mode()!==shownMode){draw();tourUI();}
  if(progress<end)gs.render(real,cam);
  if(progress>=.24)tour.render(cam,tiny,assembly.rear.visible,frameWidth/frameHeight);
 });
 const yardPixel=p=>pointPx(p,tour.camera);
 window.rewindState=()=>({progress,close,held:clock.held,time:clock.time,palmGap:campus.palmGap,ballCount:1,pose:(tour.active()?tour.camera:cam).matrixWorld.toArray(),projection:(tour.active()?tour.camera:cam).projectionMatrix.toArray(),splats:splats.numSplats,triangles,roles:Object.keys(spec.models),sound:tape.enabled,voiceTime:tape.voiceTime,voicePaused:tape.paused,ball:yardPixel(campus.ball.position),hand:yardPixel(campus.hand),rim:yardPixel(campus.rim),walkers:campus.walkers.map(w=>yardPixel(w.position)),tour:tour.mode(),eye:tour.camera.position.toArray()});

}
boot().catch(e=>{console.error(e);$('caption').textContent='这盘磁带未能加载：'+e.message;});
