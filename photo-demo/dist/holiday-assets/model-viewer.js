import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
export function createViewer(host,{shadows=false,fitToViewport=false,groundShadow=false,exposure}={}){
 const draco=new DRACOLoader().setDecoderPath('../vendor/draco/');
 const loader=new GLTFLoader().setDRACOLoader(draco);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeae2');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.append(renderer.domElement);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
 const camera=new THREE.PerspectiveCamera(38,1,.01,100);const light=new THREE.DirectionalLight('#fff3dc',2.3);light.position.set(3,5,4);scene.add(light,new THREE.HemisphereLight('#f6faff','#837f72',1.5));
 if(shadows){renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;scene.environmentIntensity=.4;light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.1,far:15});light.shadow.bias=-.0001;light.shadow.normalBias=.0003;}
 if(exposure!==undefined)renderer.toneMappingExposure=exposure;
 if(groundShadow&&shadows){
   const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({opacity:.20}));
   ground.rotation.x=-Math.PI/2;ground.position.y=-.006;ground.receiveShadow=true;scene.add(ground);
 }
 let model,angle=0,pitch=.27,distance=3.4,centerY=.8,active=true,serial=0;
 const render=()=>{if(!active)return;const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const radius=distance*(fitToViewport?Math.max(1,h/w):1);camera.position.set(radius*Math.sin(angle)*Math.cos(pitch),centerY+radius*Math.sin(pitch),radius*Math.cos(angle)*Math.cos(pitch));camera.lookAt(0,centerY,0);renderer.render(scene,camera);};
 new ResizeObserver(render).observe(host);
 let drag=null;host.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};host.setPointerCapture(e.pointerId);});host.addEventListener('pointermove',e=>{if(!drag)return;angle-=(e.clientX-drag.x)*.009;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-drag.y)*.006,-.4,1.3);drag={x:e.clientX,y:e.clientY};render();});for(const type of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(type,()=>drag=null);
 host.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),1.4,8);render();},{passive:false});host.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')angle-=.12;if(e.key==='ArrowRight')angle+=.12;if(e.key==='ArrowUp')pitch=Math.min(1.3,pitch+.1);if(e.key==='ArrowDown')pitch=Math.max(-.4,pitch-.1);render();});
 function dispose(object){object.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[])){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
 return {async load(url,yaw=0){const token=++serial;const gltf=await loader.loadAsync(url);if(token!==serial){dispose(gltf.scene);return;}if(model){scene.remove(model);dispose(model);}model=new THREE.Group();model.add(gltf.scene);const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());gltf.scene.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));model.scale.setScalar(1.7/Math.max(size.x,size.y,size.z));centerY=size.y*model.scale.y*.5;model.rotation.y=yaw;scene.add(model);active=true;angle=0;pitch=.27;distance=3.4;render();window.assetModelStats={meshes:0,triangles:0};model.traverse(o=>{if(o.isMesh){if(shadows)o.castShadow=o.receiveShadow=true;window.assetModelStats.meshes++;window.assetModelStats.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});if(shadows)render();},setView(options={}){angle=options.angle??angle;pitch=options.pitch??pitch;distance=options.distance??distance;active=true;render();},pause(){active=false;serial++;},reset(){angle=0;pitch=.27;distance=3.4;active=true;render();},turn(){angle+=Math.PI;active=true;render();}};
}
