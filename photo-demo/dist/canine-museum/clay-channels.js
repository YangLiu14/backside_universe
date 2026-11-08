import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {createFoyer} from './gallery-foyer.js';

// Positions are in the normalized source GLB, facing its open +Z side.
const rooms=[
  {id:'mouth',tint:'#fff9f4',sky:'#fff1eb'},
  {id:'esophagus',tint:'#edf5e7',sky:'#d8eee5',zone:'chest'},
  {id:'stomach',tint:'#edb6a1',sky:'#ffdfbb',zone:'upper'},
  {id:'small-intestine',tint:'#ffecce',sky:'#fff0cf',zone:'bowel'},
  {id:'colon',tint:'#e8edcd',sky:'#eaf1d6',zone:'bowel'},
  {id:'rectum',tint:'#f4e6ff',sky:'#f7ebee'}
];
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
const dir='./assets/digestion/channels/';

function install(source,spec,points){
  const scene=new T.Scene(),bounds=new T.Box3().setFromObject(source),size=bounds.getSize(v()),center=bounds.getCenter(v());
  const scale=2/size.x, container=new T.Group();
  container.scale.setScalar(scale);container.position.copy(center).multiplyScalar(-scale);
  container.add(source);scene.add(container);
  source.traverse(o=>{
    if(!o.isMesh)return;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      m.color?.multiply(new T.Color(spec.tint));m.roughness=.94;m.metalness=0;
      m.roughnessMap=null;m.metalnessMap=null;
      m.emissive.set(spec.tint);m.emissiveMap=m.map;m.emissiveIntensity=.23;
      if(spec.zone==='upper'){
        m.onBeforeCompile=shader=>{
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
            '#include <map_fragment>\nfloat clayLight=dot(diffuseColor.rgb,vec3(.3,.59,.11));diffuseColor.rgb=mix(clayLight*vec3(1.13,.85,.73),diffuseColor.rgb,.61);');
        };
      }
      if(m.normalScale)m.normalScale.multiplyScalar(.52);
    }
  });
  const path=new T.CatmullRomCurve3(points.map(p=>v(...p)),false,'centripetal');
  const gateAt=spec.zone==='chest'?.59:spec.zone==='upper'?.65:.70;
  const aperture=spec.id==='stomach'?v(.61,-.31,.11):path.getPoint(gateAt);
  let doorway=null;
  if(spec.zone){
    doorway=createFoyer(spec.zone);
    doorway.scale.setScalar(spec.zone==='upper'?.205:.30);doorway.position.copy(aperture);
    doorway.lookAt(spec.id==='stomach'?aperture.clone().add(v(-.15,.04,1)):path.getPoint(gateAt-.15));scene.add(doorway);
  }
  scene.background=new T.Color(spec.sky);
  scene.add(new T.HemisphereLight('#fff3dc','#d4b3a3',2.08));
  const sun=new T.DirectionalLight('#fff4de',1.60);
  sun.position.set(-1.5,2,3);scene.add(sun);
  const lamp=new T.PointLight(spec.zone==='upper'?'#ffb16b':'#fff1cc',.85,5);
  lamp.position.copy(aperture).add(v(-.16,.22,.17));scene.add(lamp);
  return {scene,path,aperture,doorway,lamp};
}

export function createClayChannels(onChange){
  const loader=new GLTFLoader(),decoder=new DRACOLoader().setDecoderPath('../vendor/draco/').setWorkerLimit(2);
  loader.setDRACOLoader(decoder);
  const loaded=new Map(),pending=new Set(),failed=new Set();
  const camera=new T.PerspectiveCamera(61,1,.009,20),forward=v(),up=v(0,1,0),right=v();
  const anchor=new T.Vector2(.5,.5),extent=new T.Vector2(.25,.34);
  let catalog;
  function getCatalog(){
    catalog??=fetch(dir+'catalog.json').then(r=>{
      if(!r.ok)throw Error('Channel catalog '+r.status);
      return r.json();
    }).catch(e=>{catalog=null;throw e;});
    return catalog;
  }
  function load(i){
    const spec=rooms[i];
    if(!spec||loaded.has(spec.id)||pending.has(spec.id)||failed.has(spec.id))return;
    pending.add(spec.id);
    Promise.all([loader.loadAsync(dir+spec.id+'.glb'),getCatalog()]).then(([g,meta])=>{
      loaded.set(spec.id,install(g.scene,spec,meta.channels[spec.id].camera_path));
    }).catch(()=>{failed.add(spec.id);}).finally(()=>{pending.delete(spec.id);onChange();});
  }
  function prepare(i){load(i);load(i+1);}
  // A new visit can retry a failed fetch. A slow download never blocks the tour controls.
  function retry(){failed.clear();}
  function drawRoom(renderer,i,t,aspect,yaw,pitch,approach){
    const spec=rooms[i],room=loaded.get(spec.id);
    if(!room){anchor.set(.5,.5);extent.set(.15,.21);return false;}
    const {path,aperture,doorway}=room;
    const advance=.025+.92*t;
    camera.fov=2*T.MathUtils.radToDeg(Math.atan(Math.tan(T.MathUtils.degToRad(30.5))*Math.max(1,.92/aspect)));
    camera.aspect=aspect;camera.updateProjectionMatrix();
    camera.position.copy(path.getPoint(advance));
    const dest=path.getPoint(Math.min(1,advance+.21));
    if(doorway){
      doorway.visible=true;
      if(aperture.z<camera.position.z-.04)dest.lerp(aperture,spec.zone==='upper'?.18+approach*.28:approach*.65);
      room.lamp.intensity=.22+approach*.32;
    }
    forward.copy(dest).sub(camera.position);
    if(spec.zone==='upper'&&forward.z<0)forward.x=T.MathUtils.clamp(forward.x,forward.z*.48,-forward.z*.48);
    forward.normalize();
    right.crossVectors(forward,up).normalize();
    forward.applyAxisAngle(up,yaw).applyAxisAngle(right,pitch);
    camera.lookAt(dest.copy(camera.position).add(forward));camera.updateMatrixWorld();
    const projected=aperture.clone().project(camera);
    anchor.set(projected.x*.5+.5,projected.y*.5+.5);
    if(doorway){
      const rightEdge=doorway.localToWorld(v(.98,0,0)).project(camera);
      const topEdge=doorway.localToWorld(v(0,1.04,0)).project(camera);
      extent.set(Math.max(.025,Math.abs(rightEdge.x-projected.x)*.5),Math.max(.035,Math.abs(topEdge.y-projected.y)*.5));
    }
    renderer.setClearColor(room.scene.background);renderer.clear();renderer.render(room.scene,camera);return true;
  }
  // Dissolve only over the shared threshold at a chapter boundary; both sides use
  // their live meshes and the visitor's current head direction.
  let transition;
  function render(renderer,i,t,aspect,yaw,pitch,approach){
    prepare(i);
    if(!drawRoom(renderer,i,t,aspect,yaw,pitch,approach))return false;
    if(t<.91||approach>0||!loaded.has(rooms[i+1]?.id))return true;
    if(!transition){
      const target=new T.WebGLRenderTarget(1,1);
      target.texture.colorSpace=T.SRGBColorSpace;
      const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,
        uniforms:{image:{value:target.texture},weight:{value:0}},
        vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader:'uniform sampler2D image;uniform float weight;varying vec2 st;void main(){gl_FragColor=vec4(texture2D(image,st).rgb,weight);\n#include <colorspace_fragment>\n}'});
      const scene=new T.Scene();scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
      transition={target,scene,material,camera:new T.Camera(),size:new T.Vector2()};
    }
    const {target,scene,material,camera:screen,size}=transition;
    const previous=renderer.getRenderTarget();renderer.getDrawingBufferSize(size);
    if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
    renderer.setRenderTarget(target);
    try{drawRoom(renderer,i+1,0,aspect,yaw,pitch,0);}finally{renderer.setRenderTarget(previous);}
    material.uniforms.weight.value=smooth(.91,1,t);renderer.render(scene,screen);return true;
  }
  return {prepare,retry,render,anchor,extent,get ready(){return [...loaded.keys()];},get failed(){return [...failed];}};
}
