import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
import {makeKettle,makeLip} from './kettle.js';
import {diningRoom} from './dining-room.js';
import {createJoysticks} from './cinema/joysticks.js';
import {onRoomVisibility} from './cinema/room.js';
import {roomWalk} from './walk-camera.js';
import {DinnerSound} from './sound.js';
import {rainfallAt} from './atmosphere.js';

const $=s=>document.getElementById(s), vec=(x,y,z)=>new T.Vector3(x,y,z),up=vec(0,1,0);
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b),mix=T.MathUtils.lerp,rad=T.MathUtils.degToRad;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const film=new URLSearchParams(location.search).has('film');
if(film)document.documentElement.classList.add('film');
const sound=new DinnerSound();
async function boot(){
  const [spec,fit]=await Promise.all(['scene.json','pot-fit.json'].map(f=>fetch(f).then(r=>r.json())));
  const gs=new T.WebGLRenderer({canvas:$('world'),alpha:true,antialias:false});
  const mesh=new T.WebGLRenderer({canvas:$('mesh'),alpha:false,antialias:true});
  for(const renderer of [gs,mesh])renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  mesh.shadowMap.enabled=true;mesh.shadowMap.type=T.PCFSoftShadowMap;
  mesh.shadowMap.autoUpdate=false;mesh.shadowMap.needsUpdate=true;
  mesh.toneMapping=T.ACESFilmicToneMapping;mesh.toneMappingExposure=1;
  const scene=new T.Scene(),reality=new T.Scene();
  scene.background=new T.Color(0xd8cec0);
  const environment=new RoomEnvironment(),pmrem=new T.PMREMGenerator(mesh);
  scene.environment=pmrem.fromScene(environment,.05).texture;scene.environmentIntensity=.40;
  environment.dispose();pmrem.dispose();
  const key=new T.DirectionalLight(0xffe9c8,2.1);key.position.set(-3,5,2.3);key.castShadow=true;
  key.shadow.mapSize.set(1536,1536);Object.assign(key.shadow.camera,{left:-2.6,right:2.6,top:2.8,bottom:-2.8,near:.1,far:15});key.shadow.normalBias=.0015;
  const skyLight=new T.HemisphereLight(0xfef3e4,0x8c9087,1.05);scene.add(key,skyLight);
  const loadTexture=async path=>{const t=await new T.TextureLoader().loadAsync(path);t.colorSpace=T.SRGBColorSpace;return t;};
  const camera=new T.PerspectiveCamera(45,1,.012,150);
  const orig=vec(...fit.position),originTarget=vec(...fit.target), pivot=vec(...fit.photoOrbitTarget);
  const sourceCamera=new T.PerspectiveCamera();sourceCamera.position.copy(orig);sourceCamera.lookAt(originTarget);sourceCamera.updateMatrixWorld();
  const [fx,fy,cx,cy]=fit.projection,[W,H]=fit.size;
  const decoder=new DRACOLoader().setDecoderPath('./vendor/draco/');
  const loader=new GLTFLoader().setDRACOLoader(decoder);
  const models={},downloads=Object.entries(spec.models).map(async([key,d])=>{models[key]=(await loader.loadAsync(d.file)).scene;});
  const splat=new SplatMesh({url:spec.room.file,lod:false,extSplats:true}),spark=new SparkRenderer({renderer:gs,enableLod:false,sortRadial:false,blurAmount:.3});
  const aligned=new T.Group();aligned.position.copy(orig);aligned.quaternion.copy(sourceCamera.quaternion);
  const cameraDepth=-pivot.clone().applyMatrix4(sourceCamera.matrixWorldInverse).z;
  aligned.scale.setScalar(cameraDepth/spec.room.pivot_opencv[2]);splat.rotation.x=Math.PI;
  aligned.add(splat);reality.add(spark,aligned);
  const names=['courtyard','courtyard-depth','window-paint','elm','plaster','family'];
  if(['pork','greens','fish'].some(role=>!spec.models[role]))names.push('supper');
  const textures=Object.fromEntries(await Promise.all(names.map(async name=>{
    const t=await loadTexture('textures/'+name+'.webp');if(name==='courtyard-depth')t.colorSpace=T.NoColorSpace;
    t.anisotropy=Math.min(8,mesh.capabilities.getMaxAnisotropy());
    return [name,t];
  })));
  const [photo,clean]=await Promise.all([loadTexture('photo.jpg'),loadTexture('room-plate.jpg'),splat.initialized,...downloads]);
  const opening=rad(spec.revealDeg),sceneScale=Math.min(fit.dims[2]*.5/1.34,fit.dims[1]*.69/1.38);
  const uniforms={originalPhoto:{value:photo},sourceView:{value:sourceCamera.matrixWorldInverse.clone()},
    intrinsics:{value:new T.Vector4(fx/W,fy/H,cx/W,cy/H)},photoMix:{value:1},cutOpen:{value:0}};
  const pot=makeKettle(models.shell,fit,uniforms,sceneScale,opening);
  scene.add(pot);
  const lip=makeLip(pot,sceneScale,opening);scene.add(lip);
  const room=diningRoom(models,textures);room.group.rotation.y=opening;room.group.scale.setScalar(sceneScale);scene.add(room.group);
  const local=(x,y,z)=>vec(x,y,z).multiplyScalar(sceneScale).applyAxisAngle(up,opening);
  const ground=new T.Mesh(new T.PlaneGeometry(120,120),new T.MeshBasicMaterial({color:0x859ba9,toneMapped:false}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.017;ground.receiveShadow=true;scene.add(ground);
  // The photographed wall meets the tabletop about two pot units behind the center.
  const backMat=new T.MeshBasicMaterial({color:0xd8c8b9,toneMapped:false});
  const backdrop=new T.Mesh(new T.PlaneGeometry(120,14),backMat);scene.add(backdrop);
  for(const o of [ground,backdrop]){
    o.material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms,{plate:{value:clean}});
      shader.vertexShader='varying vec3 stageWorld;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nstageWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader='varying vec3 stageWorld; uniform mat4 sourceView; uniform vec4 intrinsics; uniform sampler2D plate; uniform float photoMix;\n'+shader.fragmentShader.replace('#include <tonemapping_fragment>',`#include <tonemapping_fragment>
        vec4 cv=sourceView*vec4(stageWorld,1.); vec2 uv=cv.xy/max(.001,-cv.z)*intrinsics.xy+vec2(intrinsics.z,1.-intrinsics.w);
        vec3 bg=texture2D(plate,clamp(uv,vec2(.005),vec2(.995))).rgb;
        float lightness=.975+.035*sin(stageWorld.x*.65+.45)+.025*clamp(stageWorld.y,0.,3.);
        gl_FragColor.rgb=mix(gl_FragColor.rgb*lightness,bg,photoMix);`);
    };
  }
  const shadeCanvas=document.createElement('canvas');shadeCanvas.width=shadeCanvas.height=128;
  const ctx=shadeCanvas.getContext('2d'),fade=ctx.createRadialGradient(64,64,10,64,64,64);
  for(const [at,alpha] of [[0,.68],[.62,.42],[.88,.09],[1,0]])fade.addColorStop(at,'rgba(33,28,25,'+alpha+')');
  ctx.fillStyle=fade;ctx.fillRect(0,0,128,128);
  const shadow=new T.Mesh(new T.PlaneGeometry(3.85,3.35),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadeCanvas),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.set(.08,-.013,-.045);scene.add(shadow);
  const stage=$('stage'),sticks=createJoysticks(stage),walk=roomWalk();
  const chairEye=vec(-.095,room.tableY+.33,.706),chairLook=vec(-.045,room.tableY+.025,-.08);
  const asWorld=p=>local(p.x,p.y,p.z);
  let walkEntry=0,fromRoom=null,autoOrbit=false;
  const indoors=()=>phase==='explore'||phase==='seated';
  let progress=0,seatTime=-1,last=performance.now(),phase='orbit',returned=false,spoken=false,delivered=false,subtitleTimer=0;
  let width=1,height=1,srcW=W,srcH=H,srcX=0,srcY=0;
  function resize(){
    width=Math.max(1,stage.clientWidth);height=Math.max(1,stage.clientHeight);
    const ratio=width/height;
    // In portrait keep both ear tips; in landscape keep the source crop centered.
    srcW=ratio>=W/H?W:Math.max(W*.64,H*ratio);srcH=srcW/ratio;
    srcX=(W-srcW)/2;srcY=(H-srcH)/2;
    const img=$('photo');img.style.width=(W/srcW*width)+'px';img.style.height=(H/srcH*height)+'px';
    img.style.left=(-srcX/srcW*width)+'px';img.style.top=(-srcY/srcH*height)+'px';img.style.objectFit='fill';
    // Outside the photographed frame, the studio background remains visible.
    gs.setSize(width,height,false);mesh.setSize(width,height,false);
  }
  new ResizeObserver(resize).observe($('stage'));resize();
  const showLine=(text,seconds)=>{$('subtitle').textContent=text;subtitleTimer=seconds;};
  function syncControls(){
    const inStory=phase==='arriving'||phase==='seated',free=indoors(),ready=progress>=.985;
    const outside=phase==='orbit';
    $('orbit').value=Math.round(progress*1000);$('orbit').disabled=!outside;
    $('track').style.setProperty('--progress',(progress*100)+'%');$('track').hidden=!outside;
    $('turn').hidden=!outside;$('turn').disabled=false;$('turn').textContent=ready?'回到原照':'绕到锅后';
    $('pull').hidden=!ready||inStory||(returned&&outside);
    $('again').hidden=!outside||!returned||!ready;
    $('explore').hidden=!ready||!outside;$('height').hidden=!free;$('back').hidden=outside;
    $('instruction').textContent=free
      ?(matchMedia('(pointer:coarse)').matches?'左摇杆走动，右摇杆或拖动画面环顾。':'左键拖动环顾，右键上拖升高、下拖降低。WASD 走动，滚轮前后移动。')
      :inStory?'正在入座…':ready?'拉出自己的小竹凳，或进屋走走。':'横向拖动，绕到锅的右侧';
    sticks.activate(free?'dining-room':null);
    stage.style.cursor=ready&&outside?'pointer':'grab';
  }
  function seek(p,voice=true){
    progress=T.MathUtils.clamp(p,0,1);
    if(progress>=.985&&!spoken&&phase==='orbit'){
      spoken=true;
      if(voice){sound.start();sound.play('welcome');showLine('回来啦？把你的小凳子拉过来。',4);}
    }
    if(progress<.70){if(spoken)sound.stop();spoken=false;returned=false;showLine('',0);}
    syncControls();
  }
  function enterRoom(){
    if(phase!=='orbit'||progress<.985)return;
    walk.start(vec(.29,1.106,.665),vec(-.12,.94,-.37));
    walkEntry=0;phase='explore';autoOrbit=false;syncControls();stage.focus({preventScroll:true});
  }
  function sit(){
    if(progress<.985||(phase!=='orbit'&&phase!=='explore'))return;
    fromRoom=phase==='explore'?{eye:camera.position.clone(),direction:camera.getWorldDirection(vec(0,0,0))}:null;
    autoOrbit=false;walk.clear();
    sound.start();sound.stop();sound.scrape();phase='arriving';seatTime=0;delivered=false;
    showLine('',0);syncControls();stage.focus({preventScroll:true});
  }
  function back(){
    walk.clear();drag=null;fromRoom=null;walkEntry=0;autoOrbit=false;
    sound.stop();returned=returned||phase==='arriving'||phase==='seated';phase='orbit';seatTime=-1;delivered=false;showLine('',0);syncControls();stage.focus({preventScroll:true});
  }
  let lastSeat=0,lastDelivery=0,weatherTime=12,filmTime=0;
  let lastShadowStool=null,lastShadowDelivery=null,lastShadowOpen=null;
  const handoffEnd=.30;
  function frame(now){
    const dt=Math.min(.08,(now-last)/1000);last=now;
    if(autoOrbit){seek(Math.min(1,progress+dt*(reduced?1.3:.34)));if(progress===1)autoOrbit=false;}
    if(indoors()){walk.update(dt,sticks.activate('dining-room'));
      const low=walk.position.y<.69;
      if($('height').dataset.low!==String(low)){
        $('height').dataset.low=String(low);$('height').textContent=low?'站起来':'蹲下看看';
      }
      walkEntry=Math.min(1,walkEntry+dt*(reduced?4.5:1.45));}
    if(subtitleTimer>0){subtitleTimer-=dt;if(subtitleTimer<=0)$('subtitle').textContent='';}
    if(phase==='arriving'){
      seatTime+=dt*(reduced?2.4:1);
      if(seatTime>=1.68&&!delivered){delivered=true;sound.play('pair');showLine('再添一双筷子。',3.8);}
      if(seatTime>=2.65&&phase==='arriving'){phase='seated';walk.start(chairEye,chairLook);walkEntry=1;fromRoom=null;sound.clink();syncControls();}
    }
    const p=progress;
    const sitProgress=seatTime<0?0:smooth(.22,1.66,seatTime);
    const delivery=seatTime<0?0:smooth(1.76,2.65,seatTime);
    lastSeat=sitProgress;lastDelivery=delivery;
    if(!capturing && p>.39)weatherTime+=dt*(reduced?.40:1);
    room.update(seatTime<0?0:smooth(0,.94,seatTime),delivery,weatherTime);
    const listener=indoors()&&!capturing?walk.position:null;
    sound.rain(p>.59,listener,listener?walk.target().sub(listener):null,rainfallAt(weatherTime));
    const freeBlend=phase==='explore'?smooth(0,1,walkEntry):phase==='seated'&&!capturing?1:0;
    drawMesh(p,sitProgress,delivery,freeBlend);
    const wipe=smooth(.17,handoffEnd,p);
    $('world').style.opacity=p>=handoffEnd?'0':'1';
    $('world').style.clipPath='inset(0 '+(wipe*100)+'% 0 0)';
    $('photo').style.opacity=1-smooth(.01,.085,p);
    if(p<handoffEnd)gs.render(reality,camera);
  }
  function drawMesh(p,sitProgress,delivery,freeBlend){
    // Keep the source camera moving through the wipe, within the measured 3° arc.
    // Blend out that same tangent only once the Gaussian layer is fully covered.
    const settle=smooth(handoffEnd,1,p);
    const angle=rad(mix(spec.handoffDeg*p/handoffEnd,spec.revealDeg,settle));
    const overviewPosition=local(-1.11,1.49,4.68),overviewTarget=local(-.11,.83,-.06);
    const a=orig.clone().sub(pivot).applyAxisAngle(up,angle).add(pivot);
    const finalHigh=orig.clone().sub(pivot).applyAxisAngle(up,opening).add(pivot);
    a.addScaledVector(overviewPosition.clone().sub(finalHigh),settle);
    const target=originTarget.clone().lerp(overviewTarget,settle);
    if(fromRoom){a.copy(fromRoom.eye);target.copy(a).add(fromRoom.direction);}
    a.lerp(asWorld(chairEye),sitProgress);target.lerp(asWorld(chairLook),sitProgress);
    if(freeBlend){a.lerp(asWorld(walk.position),freeBlend);target.lerp(asWorld(walk.target()),freeBlend);}
    // Meeting film inserts from reachable positions in the same room.
    if(capturing&&filmTime>=15&&filmTime<18.3){
      const move=smooth(15,18.3,filmTime);
      a.copy(local(-.67,1.23,-.26-.065*move));target.copy(local(-.31,1.005,-.895));
    }else if(capturing&&filmTime>=18.3&&filmTime<21.5){
      const move=smooth(18.3,21.5,filmTime);
      a.copy(local(.29-.065*move,1.29,.665));target.copy(local(-.035,.88,-.105));
    }
    const warmth=smooth(.48,.87,p);key.intensity=mix(2.1,.46,warmth);skyLight.intensity=mix(1.05,.38,warmth);
    scene.environmentIntensity=mix(.40,.24,warmth);
    camera.position.copy(a);camera.lookAt(target);camera.updateMatrixWorld();
    const horizontal=a.clone().sub(target);horizontal.y=0;horizontal.normalize();
    backdrop.position.set(-horizontal.x*2.06,6.98,-horizontal.z*2.06);
    backdrop.rotation.y=Math.atan2(horizontal.x,horizontal.z);
    const n=camera.near,wide=settle,ratio=width/height;
    const srcL=(srcX-cx)/fx*n,srcR=(srcX+srcW-cx)/fx*n,srcT=(cy-srcY)/fy*n,srcB=(cy-srcY-srcH)/fy*n;
    const revealVFOV=ratio<1?2*Math.atan(Math.tan(rad(45/2))/ratio):rad(40);
    const seatVFOV=ratio<1?rad(68):rad(54);
    const half=Math.tan(mix(revealVFOV,seatVFOV,Math.max(sitProgress,freeBlend))/2)*n;
    camera.projectionMatrix.makePerspective(mix(srcL,-half*ratio,wide),mix(srcR,half*ratio,wide),mix(srcT,half,wide),mix(srcB,-half,wide),n,camera.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    uniforms.photoMix.value=1-smooth(.225,.37,p);shadow.material.opacity=1-uniforms.photoMix.value;
    uniforms.cutOpen.value=angle>rad(52)?1:0;
    lip.visible=room.group.visible=uniforms.cutOpen.value===1;
    if(lastShadowStool!==room.stool.position.z||lastShadowDelivery!==delivery||lastShadowOpen!==room.group.visible){
      mesh.shadowMap.needsUpdate=true;
      lastShadowStool=room.stool.position.z;lastShadowDelivery=delivery;lastShadowOpen=room.group.visible;
    }
    mesh.render(scene,camera);
  }
  let drag=null;
  const capturing=film&&new URLSearchParams(location.search).has('capture');
  // Behind the opaque source photo, draw both light/shadow configurations.
  // Compilation alone doesn't upload the room's textures and vertex buffers.
  await mesh.compileAsync(scene,camera);
  drawMesh(1,0,0,0);
  drawMesh(0,0,0,0);
  reality.updateMatrixWorld(true);
  await spark.update({scene:reality,camera});
  gs.render(reality,camera);
  function hitStool(e){
    const rect=stage.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/width*2-1,1-(e.clientY-rect.top)/height*2),camera);
    return ray.intersectObject(room.stool,true).length>0;
  }
  stage.oncontextmenu=e=>{if(indoors()&&e.button===2)e.preventDefault();};
  stage.onpointerdown=e=>{
    const heightDrag=e.pointerType==='mouse'&&e.button===2&&indoors();
    if(!e.isPrimary||(e.button!==0&&!heightDrag))return;
    autoOrbit=false;sound.start();stage.focus({preventScroll:true});
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,p:progress,heightDrag,onStool:progress>=.985&&phase==='orbit'&&hitStool(e)};
    stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(drag.heightDrag){
      if(indoors()&&(e.buttons&2))walk.lift(-dy/height);
      drag.y=e.clientY;return;
    }
    if(indoors()){
      walk.dragLook(dx/width,dy/height,e.pointerType);
      drag.x=e.clientX;drag.y=e.clientY;
      return;
    }
    if(phase!=='orbit')return;
    if(drag.onStool){if(dy>15||Math.abs(dx)>24){sit();drag=null;}return;}
    seek(drag.p-dx/Math.min(width*.72,600));
  };
  stage.onpointerup=e=>{if(drag?.id!==e.pointerId)return;if(drag.onStool&&phase==='orbit')sit();drag=null;};
  stage.onlostpointercapture=stage.onpointercancel=e=>{if(drag?.id===e.pointerId)drag=null;};
  stage.addEventListener('wheel',e=>{
    if(!indoors())return;
    e.preventDefault();walk.move(0,-T.MathUtils.clamp(e.deltaY*(e.deltaMode?16:1)*.0018,-.20,.20));
  },{passive:false});
  stage.onkeyup=e=>{if(walk.key(e.code,false))e.preventDefault();};
  stage.onblur=()=>{walk.clear();drag=null;};
  stage.onkeydown=e=>{
    sound.start();autoOrbit=false;
    if(indoors()&&walk.key(e.code,true)){e.preventDefault();return;}
    if(phase!=='orbit'){if(e.key==='Escape')back();return;}
    if(['ArrowRight','ArrowLeft','Home','End','Enter',' '].includes(e.key)){
      e.preventDefault();
      if(e.key==='Enter'||e.key===' ')sit();else seek(e.key==='End'?1:e.key==='Home'?0:progress+(e.key==='ArrowRight'?.035:-.035));
    }
  };
  $('turn').onclick=()=>{sound.start();if(progress>=.985){autoOrbit=false;seek(0);}else autoOrbit=true;stage.focus({preventScroll:true});};
  $('explore').onclick=enterRoom;
  $('height').onclick=()=>{walk.toggleHeight();stage.focus({preventScroll:true});};
  $('orbit').oninput=e=>{autoOrbit=false;sound.start();seek(e.target.value/1000);};
  $('pull').onclick=$('again').onclick=sit;$('back').onclick=back;
  $('sound').onclick=()=>{sound.start();const m=sound.mute();$('sound').textContent=m?'声音关':'声音开';$('sound').setAttribute('aria-pressed',m);$('sound').setAttribute('aria-label',m?'开启声音':'静音');};
  stage.dataset.ready='true';stage.setAttribute('aria-busy','false');syncControls();frame(performance.now());
  if(film && new URLSearchParams(location.search).has('capture')){
    // Meeting footage samples this same renderer and camera path at fixed playback times.
    window.dinnerCapture=time=>{
      filmTime=time;weatherTime=12+time;progress=smooth(1.25,7.35,time);seatTime=time<11.1?-1:Math.min(2.75,time-11.1);
      phase=seatTime<0?'orbit':'seated';frame(last);
    };
  }else onRoomVisibility(visible=>{
    walk.clear();drag=null;last=performance.now();
    if(!visible){sound.stop();sound.rain(false);sticks.reset();}
    mesh.setAnimationLoop(visible?frame:null);
  });
  window.dinnerState=()=>{const rect=stage.getBoundingClientRect(),at=room.stool.localToWorld(vec(0,.26,0)).project(camera);
    const screen=o=>{const v=o.getWorldPosition(new T.Vector3()).project(camera);return [rect.left+(v.x+1)*width/2,rect.top+(1-v.y)*height/2];};
    return {weatherTime:room.clock.value,windowScreen:screen(room.glass),plates:room.plates.map(o=>({dish:o.name,screen:screen(o)})),progress,phase,seat:lastSeat,delivery:lastDelivery,returned,stoolZ:room.stool.position.z,
    sticks:room.sticks.visible?room.sticks.children.length:0,eye:camera.position.toArray(),matrix:camera.matrixWorld.toArray(),
    walkPosition:walk.position.toArray(),lookDirection:walk.target().sub(walk.position).toArray(),
    stoolScreen:[rect.left+(at.x+1)*width/2,rect.top+(1-at.y)*height/2],opening:room.group.visible,muted:sound.muted,splats:splat.numSplats};};
}
boot().catch(error=>{console.error(error);$('instruction').textContent='作品载入失败 · '+error.message;});
