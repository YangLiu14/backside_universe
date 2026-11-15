import * as T from 'three';
import {filmTiming,revealStart} from './film-time.js';
import {makeCity,mainLane,smooth} from './city.js';
import {streetWalk} from './street-walk.js';
import {frontPhoto} from './front.js';
import {morningLight} from './street-light.js';
import {fitStreetSky} from './eave-light.js';
import {roomVisible,onRoomVisibility} from './cinema/room.js';
import {createFilmLoading} from './cinema/loading.js';
const preparation=createFilmLoading();
const $=id=>document.getElementById(id),v=(x,y,z)=>new T.Vector3(x,y,z);
const UP=v(0,1,0),DOWN=v(0,-1,0);
const samplePhoto=`
      uniform sampler2D sourcePhoto,warpTex;
      uniform vec4 warpRect;
      uniform vec2 imageSize;
      uniform float photoWeight,photoAlign;
      vec3 registeredColor(vec2 uv){
        vec2 pixel=vec2(uv.x,1.-uv.y)*imageSize;
        vec2 st=(pixel-warpRect.xy)/warpRect.zw;
        vec2 offset=texture2D(warpTex,vec2(st.x,1.-st.y)).rg*255.-128.;
        return texture2D(sourcePhoto,uv+photoAlign*offset*vec2(1.,-1.)/imageSize).rgb;
      }
`;
async function boot(){
  const response=await fetch('scene.json');
  if(!response.ok)throw Error('Scene configuration: '+response.status);
  const spec=await response.json();
  preparation.phase('正在载入照片与鞋底');
  const duration=spec.animation.durationSeconds, timing=filmTiming(duration);
  const renderer=new T.WebGLRenderer({canvas:$('mesh'),antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.localClippingEnabled=true;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  const scene=new T.Scene();scene.background=new T.Color(0x29251f);
  const source=new T.PerspectiveCamera(42,1.5,.006,80);
  source.position.set(0,7,4.4);source.lookAt(0,0,0);source.updateMatrixWorld();
  const camera=source.clone(),ray=new T.Raycaster(),plane=new T.Plane(UP,0);
  function onFloor(px,py){ray.setFromCamera(new T.Vector2(px/600-1,1-py/400),source);return ray.ray.intersectPlane(plane,v(0,0,0));}
  const boundary=[[0,0],[1200,0],[1200,800],[0,800]].map(([x,y])=>onFloor(x,y));
  const heel=onFloor(...spec.anchorsPx.heel),toe=onFloor(...spec.anchorsPx.toe);
  const center=heel.clone().lerp(toe,.5),unit=heel.distanceTo(toe)/2;
  const long=toe.clone().sub(heel).normalize(),across=DOWN.clone().cross(long).normalize();
  const registration=spec.models?await (await fetch('./registration-models.json')).json():null;
  const city=new T.Group();city.position.copy(center);city.position.y=-.12;
  city.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(across,DOWN,long));city.scale.setScalar(unit);scene.add(city);city.updateMatrixWorld();
  if(registration){
    const {scale,length,offsetX:dx,offsetZ:dz,yaw}=registration.shoeFit;
    city.position.addScaledVector(across,-dx*unit).addScaledVector(long,dz*unit);city.rotateY(-yaw);city.scale.multiplyScalar(scale*length/2);
  }
  city.position.y-=city.scale.y*.040;city.updateMatrixWorld();
  const fromCity=(x,y,z)=>city.localToWorld(v(x,y,z));
  const photos=new T.TextureLoader(),floorTex=await photos.loadAsync(spec.models?'floor-clean.jpg':spec.photo);
  floorTex.colorSpace=T.SRGBColorSpace;
  // A projective lookup preserves the source pixels even for the oblique top surface.
  const sourceProjection=source.projectionMatrix.clone().multiply(source.matrixWorldInverse);
  const top=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{photo:{value:floorTex},sourceP:{value:sourceProjection}},
    vertexShader:'uniform mat4 sourceP; varying vec4 sourceClip; void main(){ vec4 w=modelMatrix*vec4(position,1.);sourceClip=sourceP*w;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:`${spec.models?samplePhoto:''}
      varying vec4 sourceClip;
      uniform sampler2D photo;
      void main(){
        vec2 uv=.5+.5*sourceClip.xy/sourceClip.w;
        gl_FragColor=texture2D(photo,uv);
        ${spec.models?'gl_FragColor.rgb=mix(gl_FragColor.rgb,registeredColor(uv),photoWeight);':''}
        #include <colorspace_fragment>
      }`});
  const wood=await photos.loadAsync('wood.jpg');wood.colorSpace=T.SRGBColorSpace;wood.wrapS=wood.wrapT=T.RepeatWrapping;
  const back=boundary.map(p=>p.clone().addScaledVector(DOWN,.12));
  const reliefResponse=await fetch('relief.bin');
  if(!reliefResponse.ok)throw Error('缺少原照深度');
  const samples=new Uint16Array(await reliefResponse.arrayBuffer());
  const positions=[],faces=[];
  for(let row=0;row<=160;row++)for(let col=0;col<=240;col++){
    const i=row*241+col,px=col*5,py=row*5;
    // The final foreground shoe is a separate GLB; keep only its mate in the photo relief.
    const replaced=spec.models&&px>403&&px<690&&py>338;
    const lift=replaced?0:samples[i]/65535;
    positions.push(...onFloor(px,py).lerp(source.position,lift).toArray());
    if(row<160&&col<240)faces.push(i,i+241,i+1,i+1,i+241,i+242);
  }
  const surface=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
  const roomExterior=new T.Group();
  const timberMaterials=[];
  surface.setIndex(faces);roomExterior.add(new T.Mesh(surface,top));scene.add(roomExterior);
  function timber(corners,repeatX,repeatY,color){
    const geom=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(corners.flatMap(p=>p.toArray()),3));
    geom.setAttribute('uv',new T.Float32BufferAttribute([0,1,repeatX,1,repeatX,1-repeatY,0,1-repeatY],2));
    geom.setIndex([0,2,1,0,3,2]);geom.computeVertexNormals();
    const material=new T.MeshBasicMaterial({map:wood,color,side:T.DoubleSide});
    timberMaterials.push(material);roomExterior.add(new T.Mesh(geom,material));
  }
  timber(back,8,4,0x766457);
  for(let i=0;i<4;i++){const j=(i+1)%4;timber([boundary[i],boundary[j],back[j],back[i]],6,.16,0xa58362);}
  const hemi=new T.HemisphereLight(0xffedde,0xc8bdad,1.35);scene.add(hemi);
  const roomSun=fromCity(-2.3,3.15,-1.15), streetSun=fromCity(-.78,1.42,3.65);
  const sun=new T.DirectionalLight(0xffe6c9,2.05);sun.position.copy(roomSun);sun.target.position.copy(city.position);scene.add(sun,sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  const S=city.scale.x;Object.assign(sun.shadow.camera,{left:-1.14*S,right:1.14*S,top:1.14*S,bottom:-1.14*S,near:2*S,far:7*S});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00008;sun.shadow.normalBias=.00024*S;
  const streetDirection=streetSun.clone().sub(city.position).normalize();
  const sky=morningLight(renderer,scene,city,streetDirection);
  const frontAmbient=new T.Color(0xffedde), streetAmbient=new T.Color(0xaccce9);
  const woodBounce=new T.Color(0xc8bdad), streetBounce=new T.Color(0xb89e84);
  const roomKey=new T.Color(0xffe6c9), streetKey=new T.Color(0xffd7a2);
  function illuminate(phase){
    sky(phase);
    streetSky(phase);
    // Looking across the little town from the bridge, the distant wooden
    // board would otherwise read as a vertical brown band behind the houses.
    const roomOpacity=1-smooth(.735,.79,phase);
    roomExterior.visible=roomOpacity>0;
    for(const material of timberMaterials){
      const fading=roomOpacity>0 && roomOpacity<1;
      if(material.transparent!==fading){material.transparent=fading;material.depthWrite=!fading;material.needsUpdate=true;}
      material.opacity=roomOpacity;
    }
    const turn=smooth(.27,.45,phase);
    const dawn=smooth(revealStart,.68,phase);
    sun.position.lerpVectors(roomSun,streetSun,dawn);
    sun.color.lerpColors(roomKey,streetKey,dawn);
    sun.intensity=T.MathUtils.lerp(2.05,4.65,dawn);
    // Turn the hemisphere with the viewer. Keep its vector nonzero at the horizon.
    hemi.position.set(Math.sin(turn*Math.PI),Math.cos(turn*Math.PI),0);
    hemi.color.lerpColors(frontAmbient,streetAmbient,turn);
    hemi.groundColor.lerpColors(woodBounce,streetBounce,turn);
    hemi.intensity=T.MathUtils.lerp(1.35,.70,turn)-.20*dawn;
  }
  const [layout,front]=await Promise.all([
    makeCity(city,spec.models,registration,preparation),
    spec.room?frontPhoto(spec.room,source,$('gaussian')):null
  ]);
  preparation.phase('正在准备光影');
  await new Promise(requestAnimationFrame);
  // The registered photograph, rubber and front shoe retain their calibrated
  // response. Filmic highlight rolloff is applied to the growing world only.
  const streetMaterials=new Set();
  for(const child of city.children) {
    if(child.userData.feature||child.userData.roadTiming||child.userData.pavementDetail||child.userData.outsoleSurface==='pavement')
      child.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))streetMaterials.add(m);});
  }
  scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material)){
    if(!streetMaterials.has(m)&&m.type!=='ShaderMaterial')m.toneMapped=false;
  }});
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
  const streetSky=await fitStreetSky(city,!!spec.models,streetDirection,sun.shadow.matrix);
  const photoWeight={value:1},photoAlign={value:0};
  let frontLight,contactShadow;
  if(layout.shell){
    const shell=layout.shell.clone();const base=new T.Group();base.name='Fitted running shoe';base.position.copy(center);
    const aboveX=UP.clone().cross(long);base.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(aboveX,UP,long));
    const {scale,offsetX:dx,offsetZ:dz,yaw}=registration.shoeFit;
    shell.scale.setScalar(scale*unit);shell.rotation.y=yaw;
    shell.position.set(dx*unit,0,dz*unit);base.add(shell);roomExterior.add(base);
    const shoeLight=new T.DirectionalLight(0xffedd1,2.1);
    shoeLight.position.copy(center).addScaledVector(UP,4*unit)
      .addScaledVector(long,-1.7*unit).addScaledVector(aboveX,2.1*unit);
    shoeLight.target.position.copy(center);shoeLight.castShadow=true;frontLight=shoeLight;
    shoeLight.shadow.mapSize.set(1024,1024);shoeLight.shadow.radius=3.5;
    Object.assign(shoeLight.shadow.camera,{left:-1.75*unit,right:1.75*unit,top:1.75*unit,bottom:-1.75*unit,near:unit,far:8*unit});
    shoeLight.shadow.camera.updateProjectionMatrix();shoeLight.shadow.bias=-.00006;
    base.traverse(o=>{if(o.isMesh){o.castShadow=true;o.layers.set(1);}});
    // Restrict illumination to the front shoe. The separate receiving surface
    // shares layer 1, keeping the hidden neighborhood out of the shoe's shadow.
    shoeLight.layers.set(1);hemi.layers.enable(1);camera.layers.enable(1);

    scene.add(shoeLight,shoeLight.target);
    const contact=new T.Mesh(new T.PlaneGeometry(3.8*unit,4.2*unit),
      new T.ShadowMaterial({opacity:.62,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    contact.rotation.x=-Math.PI/2;contact.position.copy(center);contact.position.y=.00012*unit;
    contactShadow=contact.material;contact.layers.set(1);contact.receiveShadow=true;contact.name='Shoe shadow on timber';roomExterior.add(contact);
    // During the fixed-camera handoff the shoe and floor sample the same source
    // image. The colour handoff finishes before the orbit reveals the sides.
    const {file,rect}=registration.shoeFit.handoff;
    const [sourceTex,warpTex]=await Promise.all([photos.loadAsync(spec.photo),photos.loadAsync(file)]);
    sourceTex.colorSpace=T.SRGBColorSpace;warpTex.generateMipmaps=false;warpTex.minFilter=T.LinearFilter;
    const photoUniforms={sourcePhoto:{value:sourceTex},warpTex:{value:warpTex},
      warpRect:{value:new T.Vector4(...rect)},imageSize:{value:new T.Vector2(...spec.anchorsPx.imageSize)},
      photoWeight,photoAlign};
    Object.assign(top.uniforms,photoUniforms);
    base.traverse(o=>{
      if(!o.isMesh)return;
      for(const material of [].concat(o.material)){
        material.toneMapped=false;
        material.onBeforeCompile=shader=>{
          Object.assign(shader.uniforms,photoUniforms,{shoeProjection:{value:sourceProjection}});
          shader.vertexShader='uniform mat4 shoeProjection; varying vec4 photoClip;\n'+shader.vertexShader.replace('#include <project_vertex>',
            '#include <project_vertex>\n photoClip=shoeProjection*modelMatrix*vec4(transformed,1.);');
          shader.fragmentShader=samplePhoto+'varying vec4 photoClip;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',
            'outgoingLight=mix(outgoingLight,registeredColor(photoClip.xy/photoClip.w*.5+.5),photoWeight);\n#include <opaque_fragment>');
        };
      }
    });
  }
  function pose(position,aim,up){
    const m=new T.Matrix4().lookAt(position,aim,up);return {p:position,q:new T.Quaternion().setFromRotationMatrix(m)};
  }
  const localPose=(pos,target,up=DOWN)=>pose(fromCity(...pos),fromCity(...target),up);
  const rim=boundary[2].clone().lerp(boundary[3],.42);
  const sourcePose=pose(source.position.clone(),v(0,0,0),UP);
  const faceUp=long.clone();
  const knots=[
    [0,sourcePose],
    [.057,sourcePose],
    [.068,pose(source.position.clone().add(v(.16,-.09,-.10)),v(-.026,0,.026),UP)],
    [.12,pose(center.clone().add(v(.34,3.9,3.15)),center,UP)],
    [.26,pose(rim.clone().add(v(.7,1.25,1.35)),center,UP)],
    [.36,pose(rim.clone().add(v(.5,-.53,1.15)),center,v(0,.45,-1))],
    [.439,localPose([.18,2.68,-1.09],[0,0,-.12],faceUp)],
    [.59,localPose([.98,1.78,-1.65],[0,.07,-.01],DOWN)],
    [.72,localPose([.91,1.05,-1.69],[0,.07,-.04],DOWN)],
    [.79,localPose([mainLane(-.94),.068,-1.065],[mainLane(-.62),.043,-.62])],
    [.82,localPose([mainLane(-.83),.048,-.83],[mainLane(-.58),.046,-.58])],
    [.86,localPose([mainLane(-.48),.044,-.48],[mainLane(-.23),.045,-.23])],
    [.90,localPose([mainLane(-.12),.043,-.12],[mainLane(.12),.052,.12])],
    [.94,localPose([mainLane(.09),.033,.09],[mainLane(.23)+.02,.039,.23])],
    [.97,localPose([mainLane(.168)-.014,.038,.168],[mainLane(.224)+.065,.031,.224])],
    [.991,localPose([mainLane(.201)-.023,.035,.201],[mainLane(.224)+.065,.031,.224])],
    [1,localPose([mainLane(.207)-.023,.035,.207],[mainLane(.224)+.065,.031,.224])]
  ];
  const roomColor=new T.Color(0x29251f),morningSky=new T.Color(0xb9cdd0);
  let progress=0,scenePhase=0,stats,playing=false,previousTime=0,playFrame=0,shadowPhase=-1;
  const stage=$('stage'),slider=$('progress');
  let exploring=false,streamingEnabled=false,ready=false;
  const streaming=layout.streaming;
  function drawScene(streetView){
    if(ready&&!roomVisible())return;
    if(streamingEnabled)streaming?.update(camera,streetView);
    renderer.render(scene,camera);
  }
  streaming?.setCallbacks(streetSky.fit,()=>{
    renderer.shadowMap.needsUpdate=true;
    if(roomVisible())renderer.render(scene,camera);
  });
  const walk=streetWalk(stage,$('pad'),layout,(eye,target)=>{
    camera.position.copy(city.localToWorld(eye.clone()));camera.up.copy(DOWN);
    camera.lookAt(city.localToWorld(target));camera.updateMatrixWorld();drawScene(true);
  });
  // Round the two corners of the board-to-sole move. Adjacent tangents meet
  // at the same speed on both sides, including when scrubbing backwards.
  const corners = [.36,.439].map(at => {
    const i=knots.findIndex(([p])=>p===at);
    const [lo,A]=knots[i-1], [,B]=knots[i], [hi,C]=knots[i+1];
    const span=.019;
    function between(a,b,t) {return {p:a.p.clone().lerp(b.p,t),q:a.q.clone().slerp(b.q,t)};}
    return {at,span,from:between(B,A,span/(at-lo)),mid:B,to:between(B,C,span/(hi-at))};
  });
  const nextOrientation=new T.Quaternion();
  function cameraPose(p,position,quaternion){
    const corner=corners.find(({at,span})=>Math.abs(p-at)<span);
    if(corner){
      const {at,span,from,mid,to}=corner,t=(p-at+span)/(2*span),u=1-t;
      position.copy(from.p).multiplyScalar(u*u).addScaledVector(mid.p,2*t*u).addScaledVector(to.p,t*t);
      quaternion.slerpQuaternions(from.q,mid.q,t);
      nextOrientation.slerpQuaternions(mid.q,to.q,t);
      quaternion.slerp(nextOrientation,t);return;
    }
    const i=Math.max(1,knots.findIndex(k=>k[0]>=p)),[a,A]=knots[i-1],[b,B]=knots[i];
    const t=(p-a)/(b-a);position.lerpVectors(A.p,B.p,t);quaternion.slerpQuaternions(A.q,B.q,t);
  }
  function renderAtPhase(phase){render(timing.progressAt(phase));}
  function render(value){
    progress=T.MathUtils.clamp(value,0,1);slider.value=ready?1000*progress:0;
    slider.style.setProperty('--progress',`${ready?progress*100:0}%`);
    stage.toggleAttribute('data-cover',progress===0&&!exploring);
    scenePhase=timing.phaseAt(progress);
    projection();cameraPose(scenePhase,camera.position,camera.quaternion);
    camera.updateMatrixWorld();stats=layout.update(scenePhase);
    photoAlign.value=smooth(.024,.054,scenePhase);
    photoWeight.value=1-smooth(.043,.059,scenePhase);
    if(contactShadow)contactShadow.opacity=.62*(1-photoWeight.value);
    if(frontLight)frontLight.intensity=2.1*(1-smooth(.27,.35,scenePhase));
    const lightingPose=T.MathUtils.clamp(scenePhase,.41,.72);
    if(shadowPhase!==lightingPose){renderer.shadowMap.needsUpdate=true;shadowPhase=lightingPose;}
    $('photo').style.opacity=spec.models?1-smooth(0,.008,scenePhase):Number(scenePhase===0);
    $('phase').textContent=!ready||scenePhase===0?'原照':scenePhase<.25?'靠近鞋跟':scenePhase<.42?'绕到地板背面':scenePhase<=revealStart?'橡胶鞋底':scenePhase<.71?'鞋底街区生长':scenePhase<.79?'鞋底全貌':scenePhase<.96?'穿过街巷':'豆浆摊';
    scene.background.copy(roomColor).lerp(morningSky,smooth(.725,.805,scenePhase));
    illuminate(scenePhase);
    drawScene(scenePhase>.74);if(!ready||roomVisible())front?.render(camera,scenePhase);
  }
  function projection(){
    const {width,height}=stage.getBoundingClientRect(),aspect=width/height;
    const near=exploring?.0015*city.scale.x:source.near;
    // The photo needs its full landscape width. A vertical outsole can fill
    // a portrait frame once the camera is underneath, then ease back for the tour.
    const outsoleView=smooth(.36,.439,scenePhase)*(1-smooth(revealStart,.74,scenePhase));
    const fitWidth=T.MathUtils.lerp(1.5,.69,outsoleView);
    const fov=exploring?(aspect<1?78:60):T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(21))*Math.max(1,fitWidth/aspect)));
    if(camera.aspect===aspect && camera.near===near && camera.fov===fov)return;
    camera.aspect=aspect;camera.near=near;camera.fov=fov;camera.updateProjectionMatrix();
  }
  const resize=()=>{const {width,height}=stage.getBoundingClientRect();if(!width||!height||(ready&&!roomVisible()))return;
    renderer.setSize(width,height,false);front?.resize(width,height);
    projection();if(exploring)walk.draw();else render(progress);};
  new ResizeObserver(resize).observe(stage);resize();
  const ambience=new Audio('./morning.m4a');ambience.preload='metadata';
  function syncAudio(){ambience.currentTime=progress*duration;if(roomVisible()&&!ambience.muted)ambience.play().catch(()=>{});}
  $('sound').onclick=()=>{ambience.muted=!ambience.muted;$('sound').setAttribute('aria-pressed',String(!ambience.muted));
    $('sound').textContent=ambience.muted?'声音关':'声音开';if(playing&&!ambience.muted)syncAudio();};
  function playState(label,icon){$('play-label').textContent=label;$('playMark').dataset.icon=icon;$('play').setAttribute('aria-pressed',String(playing));}
  function stop(){cancelAnimationFrame(playFrame);ambience.pause();playing=false;playState(progress===0?'开始放映':'继续放映','play');}
  function step(time){if(!roomVisible()){stop();return;}if(!playing)return;const dt=(time-previousTime)/1000;previousTime=time;render(progress+dt/duration);
    if(progress>=1)stop();else playFrame=requestAnimationFrame(step);}
  function play(){if(playing){stop();return;}if(!roomVisible())return;if(progress===1)render(0);playing=true;syncAudio();playState('暂停','pause');previousTime=performance.now();playFrame=requestAnimationFrame(step);}
  let drag=null;
  function walkMode(on){
    exploring=on;document.body.classList.toggle('walking',on);$('street').setAttribute('aria-pressed',String(on));
    stage.toggleAttribute('data-walk',on);stage.toggleAttribute('data-cover',!on&&progress===0);
    $('street').textContent=on?'退出探索':'自由探索';
    stage.setAttribute('aria-label',on?'街区自由探索：移动并环顾':'拖动绕到地板背面');projection();
  }
  function enterWalk(entry){
    stop();drag=null;
    const eye=v(mainLane(-.923),.033,-.923),target=v(mainLane(-.69),.033,-.69);
    const deck=entry==='bridge-view'||entry==='street-end';
    // Dropping in mid-tour keeps the viewer near the shop they were looking at.
    if(entry==='bridge'){eye.copy(layout.bridge.westEntry);target.copy(eye).add(v(1,.035,0));}
    else if(deck||entry==='herbal-shop'){
      // Sightlines from the walkable deck and the pavement opposite the shop.
      const [x,z,heading,elevation]=entry==='herbal-shop'?[.01589638,.5425,-105.3,0]:
        entry==='street-end'?[-.007,layout.bridge.z,173,-4]:[.006,layout.bridge.z,139,-21];
      const yaw=T.MathUtils.degToRad(heading),pitch=T.MathUtils.degToRad(elevation);
      eye.set(x,.033,z);
      target.copy(eye).add(v(Math.sin(yaw),Math.tan(pitch),-Math.cos(yaw)));
    }
    else if(entry==='drygoods'&&layout.drygoodsView){
      eye.copy(layout.drygoodsView.eye);target.copy(layout.drygoodsView.target);
    }
    else if(entry==='hardware-shop'){
      eye.set(.004,.033,.217);
      target.copy(eye).add(v(-.945,-.208,.253));
    }
    else if(entry==='bridge-stall'){
      // Start under the span, looking toward the same stall as the review walk.
      eye.set(layout.bridge.x-.0076,.033,layout.bridge.z-.0105);
      target.copy(eye).add(v(.407,.070,.914));
    }
    else if(entry==='bridge-road'){
      eye.set(mainLane(layout.bridge.z)-.007,.033,layout.bridge.z-.004);
      target.set(mainLane(.199)+.0068,.009,.199);
    }
    else if(entry==='teahouse-road'){
      eye.set(.008,.033,.796);
      target.set(mainLane(.841)+.0053,.008,.841);
    }
    else if(entry==='pavement'){
      const lid=layout.inspectionLid;
      eye.set(mainLane(lid.z-.043),.033,lid.z-.043);target.set(lid.x,.006,lid.z+.013);
    }
    else if(scenePhase>=.82){
      const here=city.worldToLocal(camera.position.clone());
      if(layout.canStandAt(here.x,here.z)){
        const ahead=city.worldToLocal(camera.getWorldDirection(v(0,0,0)).add(camera.position));
        eye.set(here.x,.033,here.z);target.set(ahead.x,.033,ahead.z);
      }
    }
    walkMode(true);
    if(frontLight)frontLight.intensity=0;
    stats=layout.update(1);if(shadowPhase!==.72){renderer.shadowMap.needsUpdate=true;shadowPhase=.72;}
    scene.background.copy(morningSky);illuminate(1);$('photo').style.opacity=0;$('gaussian').style.opacity=0;
    const nextStop=$('next-stop');
    const stops={'bridge-road':['teahouse-road','去茶楼前'],'teahouse-road':['bridge-road','回桥下'],
      'herbal-shop':['street-end','去天桥']};
    const [destination,label]=stops[entry]??['herbal-shop','去药材铺'];
    nextStop.dataset.entry=destination;nextStop.textContent=label;
    stage.focus({preventScroll:true});walk.start(eye,target,deck);
  }
  function leaveWalk(p=progress){walk.stop();walkMode(false);camera.up.copy(UP);render(p);}
  $('next-stop').onclick=()=>enterWalk($('next-stop').dataset.entry);
  $('play').onclick=play;$('street').onclick=()=>{if(exploring){leaveWalk();$('street').focus();}else enterWalk();};
  $('home').onclick=()=>{stop();if(exploring)leaveWalk(0);else render(0);};
  slider.oninput=()=>{stop();if(exploring)leaveWalk(slider.value/1000);else render(slider.value/1000);};
  stage.onpointerdown=e=>{if(!ready||exploring||e.button!==0||drag)return;stop();drag={x:e.clientX,p:progress,id:e.pointerId};stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{if(!exploring&&drag?.id===e.pointerId)render(drag.p+(drag.x-e.clientX)/stage.clientWidth);};
  stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=e=>{if(drag?.id===e.pointerId)drag=null;};
  window.addEventListener('keydown',e=>{if(exploring&&e.key==='Escape'){e.preventDefault();leaveWalk();$('street').focus();}});
  stage.onkeydown=e=>{if(!ready||exploring)return;const keys={ArrowLeft:progress-.02,ArrowRight:progress+.02,Home:0,End:1};if(e.key in keys){e.preventDefault();stop();render(keys[e.key]);}};
  const readState=()=>({progress,scenePhase,playing,audioPaused:ambience.paused,audioMuted:ambience.muted,audioTime:ambience.currentTime,roomVisible:roomVisible(),walkActive:walk.active,mode:exploring?'walk':'film',walkPosition:exploring?walk.position.toArray():null,onBridge:exploring&&walk.onBridge,pose:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),cameraY:camera.position.y,opening:exploring||scenePhase>.41,...stats});
  window.soleCityCheckStreet=()=>{
    const saved=progress;render(1);scene.updateMatrixWorld(true);
    const features=city.children.filter(child=>child.userData.feature);
    const probe=new T.Raycaster(),start=new T.Vector3(),finish=new T.Vector3(),delta=new T.Vector3(),q=new T.Quaternion(),collisions=[];
    for(let n=0;n<112;n++){
      const p=.72+n*.0025;cameraPose(p,start,q);cameraPose(p+.0025,finish,q);delta.subVectors(finish,start);
      probe.far=delta.length()+unit*.001;probe.near=0;probe.set(start,delta.normalize());
      const hit=probe.intersectObjects(features,true)[0];if(hit){
        let o=hit.object;while(o.parent&&!o.userData.feature)o=o.parent;
        collisions.push({p,feature:o.userData.feature});
      }
    }
    render(saved);return {samples:112,collisions};
  };
  window.soleCityWaitForDetail=async()=>{
    if(!streaming?.pending())return;
    await streaming.ready();
    // Recorders copy the default framebuffer in this JS task after awaiting.
    renderer.render(scene,camera);
  };
  window.soleCityDetailState=()=>streaming?.status()??null;
  if(new URLSearchParams(location.search).has('export')){
    window.soleCityLoadInspection=role=>streaming?.authoring(role);
    window.soleCityBake=async role=>{
      const {bake,bakeStorefront}=await import('./bake.js');
      await window.soleCityLoadInspection(role);
      return role?bakeStorefront(city,role):bake(city,layout,()=>render(progress));
    };
  }
  // Prewarm every order of material before the first user-driven orbit.
  for(const p of [.59,.72,.765,.94]){renderAtPhase(p);await new Promise(requestAnimationFrame);}
  if(new URLSearchParams(location.search).has('bake-contact')){
    const contact=layout.reflect(renderer,scene,true);
    window.soleCityContactBake={...contact,task:(spec.models?.['soy-cart-dawn']||spec.models?.stall)?.task};
    return;
  }
  layout.reflect(renderer,scene);
  // At this approach the mirror sees another puddle. Compile its linear HDR
  // reflection-pass material as well as the direct framebuffer variant.
  for(const p of [.72,.765,.915,.94,0]){renderAtPhase(p);await new Promise(requestAnimationFrame);}
  streamingEnabled=true;
  // A public player state denotes a usable scene, not an intermediate warm-up camera.
  ready=true;render(0);window.soleCityState=readState;
  $('notice').textContent=spec.models?'':'动画预演 · 占位模型';
  for(const id of ['play','street','home','progress','sound'])$(id).disabled=false;
  const params=new URLSearchParams(location.search);
  if(params.has('play'))play();
  else if(params.has('explore'))enterWalk(params.get('explore'));
  else if(params.get('view')==='sole')renderAtPhase(.45);
  else if(params.get('view')==='shoe')renderAtPhase(.26);
  else if(params.get('view')==='upper')renderAtPhase(.12);
  else if(params.get('view')==='street')renderAtPhase(.865);
  preparation.finish();
  onRoomVisibility(visible=>{
    if(!visible){
      stop();walk.stop();
      const pointer=drag?.id;drag=null;
      if(pointer!=null&&stage.hasPointerCapture(pointer))stage.releasePointerCapture(pointer);
      return;
    }
    resize();
    if(exploring)walk.resume();
  });
}
boot().catch(error=>preparation.fail(error));
