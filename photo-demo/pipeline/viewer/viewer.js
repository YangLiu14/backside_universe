import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {SparkRenderer, SplatMesh} from '@sparkjsdev/spark';

const $ = id => document.getElementById(id);
const ease = (a,b,t) => T.MathUtils.smoothstep(t,a,b);
const yAxis = new T.Vector3(0,1,0);
const rad = T.MathUtils.degToRad;

async function boot() {
  const response = await fetch('./scene.json');
  if (!response.ok) throw new Error('读取场景规格失败');
  const spec = await response.json(), room = spec.room;
  document.title = spec.title;
  $('title').textContent = spec.title;
  $('photo').src = spec.photo;
  await $('photo').decode();
  const camera = new T.PerspectiveCamera(45,1,.001,1000);
  const real = new T.Scene(), miniature = new T.Scene();
  const makeRenderer = id => {
    const renderer = new T.WebGLRenderer({canvas:$(id),alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    renderer.setClearColor(0x000000,0);
    return renderer;
  };
  const gs = makeRenderer('world'), mesh = makeRenderer('mesh');
  mesh.localClippingEnabled = true;
  mesh.toneMapping = T.ACESFilmicToneMapping;
  mesh.toneMappingExposure = .94;
  const studio = new RoomEnvironment(), pmrem = new T.PMREMGenerator(mesh);
  miniature.environment = pmrem.fromScene(studio,.04).texture;
  studio.dispose(); pmrem.dispose();
  const sky = new T.HemisphereLight(0xfff4dc,0x838e91,.8);
  const sun = new T.DirectionalLight(0xffeed4,1.35);
  sun.position.set(2,4,3); miniature.add(sky,sun);
  const spark = new SparkRenderer({renderer:gs,enableLod:false,sortRadial:false,blurAmount:.3});
  const splat = new SplatMesh({url:room.file,lod:false,extSplats:true});
  const axes = new T.Group();
  axes.rotation.x = Math.PI;
  const aligned = new T.Group();
  if (room.rawToCamera) {
    aligned.quaternion.fromArray(room.rawToCamera);
    splat.position.fromArray(room.rawCenter).negate();
  }
  aligned.add(splat); axes.add(aligned); real.add(spark,axes);

  const [fx,fy,cx,cy] = room.intrinsics;
  const [px,py,pz] = room.pivot_opencv;
  const pivot = new T.Vector3(px,-py,-pz);
  const box = spec.box;
  const height = (box[3]-box[1]) * room.height * pz/fy;
  const width = (box[2]-box[0]) * room.width * pz/fx;
  const focus = new T.Vector3(...spec.focus).multiplyScalar(height).add(pivot);
  const finalNormal = pivot.clone().negate().applyAxisAngle(yAxis,rad(spec.revealDeg)).normalize();
  const tangent = new T.Vector3().crossVectors(yAxis,finalNormal).normalize();
  const draco = new DRACOLoader().setDecoderPath('./vendor/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const photoTexture = await new T.TextureLoader().loadAsync(spec.photo);
  photoTexture.colorSpace=T.SRGBColorSpace;
  const photographMix={value:1};
  function sourceProjection(material) {
    material.onBeforeCompile = shader => {
      shader.uniforms.sourcePhoto={value:photoTexture}; shader.uniforms.photoMix=photographMix;
      shader.uniforms.sourceK={value:new T.Vector4(fx/room.width,fy/room.height,cx/room.width,cy/room.height)};
      shader.vertexShader='varying vec3 sourcePosition;\n'+shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nsourcePosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader='uniform sampler2D sourcePhoto; uniform float photoMix; uniform vec4 sourceK; varying vec3 sourcePosition;\n'+shader.fragmentShader.replace('#include <tonemapping_fragment>',
        `#include <tonemapping_fragment>
         vec2 imageUV=sourcePosition.xy/max(0.0001,-sourcePosition.z)*sourceK.xy+vec2(sourceK.z,1.0-sourceK.w);
         if(all(greaterThanEqual(imageUV,vec2(0.0))) && all(lessThanEqual(imageUV,vec2(1.0))))
           gl_FragColor.rgb=mix(gl_FragColor.rgb,texture2D(sourcePhoto,imageUV).rgb,photoMix);`);
    };
  }
  const objects = {};
  let triangleCount = 0;
  async function fit(role, desc) {
    const gltf = await loader.loadAsync(desc.file);
    const model = new T.Group(); model.add(gltf.scene);
    const inner = role === 'interior';
    model.rotation.order = 'YXZ';
    model.rotation.y = rad(inner ? spec.insertYaw : spec.yaw);
    model.rotation.x = rad(inner ? 0 : spec.pitch);
    model.rotation.z = rad(inner ? 0 : spec.roll || 0);
    const bounds = new T.Box3().setFromObject(model,true);
    const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
    const scale = inner ? height*spec.insertScale/Math.max(size.x,size.y,size.z) :
      Math.min(width/Math.max(size.x,1e-8),height/Math.max(size.y,1e-8));
    if (!Number.isFinite(scale) || bounds.isEmpty()) throw new Error('模型缺少可见几何');
    model.scale.setScalar(scale);
    model.position.copy(inner ? focus : pivot).addScaledVector(center,-scale);
    const group = new T.Group();
    group.add(model); miniature.add(group);
    model.traverse(o=>{
      if (!o.isMesh) return;
      triangleCount += (o.geometry.index?.count ?? o.geometry.attributes.position.count)/3;
      if (!inner) for (const material of [].concat(o.material)) sourceProjection(material);
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    });
    objects[role] = group;
  }
  await Promise.all([splat.initialized, ...Object.entries(spec.models).map(([role,model])=>fit(role,model))]);
  const aperture = new T.Plane();
  if (objects.shell) {
    const planes = [aperture];
    for (const [axis,radius] of [[tangent,.34],[yAxis,.26]]) {
      for (const sign of [-1,1]) {
        const normal = axis.clone().multiplyScalar(sign);
        planes.push(new T.Plane(normal,-normal.dot(focus)-height*radius));
      }
    }
    objects.shell.traverse(o=>{
      if (!o.isMesh) return;
      for (const material of [].concat(o.material)) {
        material.clippingPlanes = planes; material.clipIntersection = true;
        material.side = T.DoubleSide;
      }
    });
  }
  const lamp = new T.PointLight(0xffad59,0);
  lamp.position.copy(focus).addScaledVector(finalNormal,height*.18);
  miniature.add(lamp);
  let progress=0, close=false, acted=false, inspectYaw=0, inspectPitch=0;
  const handoffEnd=.44;
  function drawPose(present=true) {
    const p=progress, u=T.MathUtils.clamp((p-handoffEnd)/(1-handoffEnd),0,1), s=ease(0,1,u);
    // Remain on the measured photo arc throughout the wipe. The cubic back arc
    // starts with that same angular velocity and comes to rest at the reveal.
    const speed=spec.handoffDeg/handoffEnd;
    const degrees=p<=handoffEnd?speed*p:spec.handoffDeg+(Math.abs(spec.revealDeg)-spec.handoffDeg)*s+
      speed*(1-handoffEnd)*u*(1-u)**2;
    const angle=rad(Math.sign(spec.revealDeg)*degrees);
    const offset=pivot.clone().negate().applyAxisAngle(yAxis,angle);
    const fullDistance=Math.max(height*fy/room.height,width*fx/room.width)*1.5;
    offset.setLength(T.MathUtils.lerp(offset.length(),fullDistance,s));
    camera.position.copy(pivot).add(offset);
    const natural=new T.Quaternion().setFromAxisAngle(yAxis,angle);
    camera.lookAt(pivot);
    // Rotate around the off-centre source ray first, then compose the miniature centrally.
    camera.quaternion.slerp(natural,1-ease(.14,.95,p));
    if (close) {
      const direction=finalNormal.clone().applyAxisAngle(yAxis,inspectYaw);
      direction.applyAxisAngle(tangent,inspectPitch);
      camera.position.copy(focus).addScaledVector(direction,Math.max(.28,height*fy/room.height*.67));
      camera.lookAt(focus);
    }
    const n=camera.near, blend=close ? 1 : s;
    const principalX=T.MathUtils.lerp(cx,room.width/2,blend), principalY=T.MathUtils.lerp(cy,room.height/2,blend);
    camera.projectionMatrix.makePerspective(-principalX*n/fx,(room.width-principalX)*n/fx,
      principalY*n/fy,-(room.height-principalY)*n/fy,n,camera.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld(true);
    aperture.setFromNormalAndCoplanarPoint(finalNormal.clone().negate(),
      focus.clone().addScaledVector(finalNormal,height*T.MathUtils.lerp(1,-.23,ease(.45,.84,p))));
    const reveal=ease(.25,handoffEnd,p);
    photographMix.value=1-ease(.40,.60,p);
    if (objects.interior) objects.interior.visible=p>.45;
    if(!present)return;
    $('world').style.opacity=p>=handoffEnd ? 0 : 1;
    $('world').style.clipPath='inset(0 '+(reveal*100)+'% 0 0)';
    $('photo').style.opacity=1-ease(.015,.15,p);
    // The shared front camera is fully established before the shell is revealed.
    $('mesh').style.opacity=p>=.24 ? 1 : 0;
    $('progress').value=Math.round(p*1000);
    $('progress').disabled=close;
    $('enter').disabled=p<.8;
    $('enter').textContent=close?'返回全景':'近看';
    $('action').hidden=!close;
    $('action').textContent=spec.actionLabel;
    $('action').setAttribute('aria-pressed',String(acted));
    $('caption').textContent=close ? (acted ? spec.actionResult : spec.actionLabel) : spec.story;
  }
  function seek(value) {
    progress=T.MathUtils.clamp(value,0,1); close=false; acted=false;
    lamp.intensity=0; inspectYaw=inspectPitch=0;
    drawPose();
  }
  function visit() {
    if(progress<.8) return;
    close=!close; acted=false; lamp.intensity=0; inspectYaw=inspectPitch=0; drawPose();
  }
  function act() {
    if(!close) return;
    acted=!acted;
    if(spec.action==='light') lamp.intensity=acted ? 1.5*height*height : 0;
    if(spec.action==='turn') inspectYaw=acted ? .45 : 0;
    if(spec.action==='chime' && acted) {
      const ac=new AudioContext(), gain=ac.createGain(), osc=ac.createOscillator();
      osc.type='sine'; osc.frequency.setValueAtTime(392,ac.currentTime);
      gain.gain.setValueAtTime(.14,ac.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.8);
      osc.connect(gain).connect(ac.destination); osc.start(); osc.stop(ac.currentTime+.8); osc.onended=()=>ac.close();
    }
    drawPose();
  }
  function resize(present=true) {
    const rect=$('stage').getBoundingClientRect(), fit=Math.min(rect.width/room.width,rect.height/room.height);
    const w=Math.max(1,Math.round(room.width*fit)), h=Math.max(1,Math.round(room.height*fit));
    Object.assign($('frame').style,{width:w+'px',height:h+'px'});
    gs.setSize(w,h,false); mesh.setSize(w,h,false); drawPose(present);
  }
  // Keep the opaque source photo and disabled controls up until both sets of
  // materials, geometry and textures have actually been drawn on this GPU.
  resize(false);progress=1;drawPose(false);
  await mesh.compileAsync(miniature,camera);
  const culled=[];
  miniature.traverse(o=>{if(o.isMesh&&o.frustumCulled){culled.push(o);o.frustumCulled=false;}});
  mesh.render(miniature,camera);
  for(const o of culled)o.frustumCulled=true;
  progress=0;drawPose(false);mesh.render(miniature,camera);
  real.updateMatrixWorld(true);await spark.update({scene:real,camera});gs.render(real,camera);
  $('progress').oninput=e=>seek(Number(e.target.value)/1000);
  $('home').onclick=()=>seek(0); $('enter').onclick=visit; $('action').onclick=act;
  let drag=null;
  const stage=$('stage');
  stage.onpointerdown=e=>{if(!e.isPrimary||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,p:progress,yaw:inspectYaw,pitch:inspectPitch};
    stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{
    if(!drag || drag.id!==e.pointerId)return;
    const dx=(e.clientX-drag.x)/stage.clientWidth,dy=(e.clientY-drag.y)/stage.clientHeight;
    if(close){inspectYaw=drag.yaw-dx*2;inspectPitch=T.MathUtils.clamp(drag.pitch+dy,-.65,.65);drawPose();}
    else seek(drag.p-dx*1.5);
  };
  stage.onpointerup=e=>{
    if(!drag)return;
    if(!close && progress>=.8 && Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5){
      const rect=$('mesh').getBoundingClientRect(), ray=new T.Raycaster();
      ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
      if(ray.intersectObject(objects.interior||objects.world,true).length)visit();
    }
    drag=null;
  };
  stage.onlostpointercapture=stage.onpointercancel=()=>{drag=null;};
  stage.onkeydown=e=>{
    if(e.key==='Home'){e.preventDefault();seek(0);}
    else if(e.key==='Escape' && close)visit();
    else if(!close && ['ArrowLeft','ArrowRight','End'].includes(e.key)){
      e.preventDefault();seek(e.key==='End'?1:progress+(e.key==='ArrowLeft'?-.02:.02));
    }
  };
  new ResizeObserver(()=>resize()).observe(stage);
  $('home').disabled=false; resize();
  gs.setAnimationLoop(()=>{
    if(progress<handoffEnd) gs.render(real,camera);
    if(progress>=.24) mesh.render(miniature,camera);
  });
  window.universeState=()=>({progress,close,acted,pose:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),
    splats:splat.numSplats,triangles:triangleCount,roles:Object.keys(objects).sort()});
}
boot().catch(e=>{console.error(e);$('caption').textContent='作品加载失败 · '+e.message;});
