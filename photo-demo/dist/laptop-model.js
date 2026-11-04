import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** Canonical generated models do not inherit a photo's pose. Register this one
 * to the rigid chassis/hinge fit before it joins the shared tabletop scene. */
export async function createLaptopModel(scene,room,fit){
 const result={source:'calibrated',bounds:null,triangles:0};
 if(new URLSearchParams(location.search).get('laptop')==='calibrated')return result;
 try{
  const {scene:model}=await new GLTFLoader().loadAsync('./assets/laptop-hi3d.glb');
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  const [x,z,yaw,width,depth,tilt]=fit.fit;
  const lidHeight=width/fit.screenAspect,back=-Math.sin(tilt)*lidHeight,top=.055+Math.cos(tilt)*lidHeight,bottom=.041;
  const scaling=new THREE.Vector3(width/size.x,(top-bottom)/size.y,(depth-back)/size.z);
  model.scale.copy(scaling);
  model.position.set(-(bounds.min.x+bounds.max.x)/2*scaling.x,bottom-bounds.min.y*scaling.y,back-bounds.min.z*scaling.z);
  const registered=new THREE.Group();registered.name='SAM segmented Hi3D laptop registered to source photograph';registered.position.set(x,0,z);registered.rotation.y=yaw;registered.add(model);
  model.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;result.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.envMapIntensity=.9;if(m.map)m.map.anisotropy=8;}});
  scene.add(registered);registered.updateMatrixWorld(true);
  const fitted=new THREE.Box3().setFromObject(registered);result.bounds={min:fitted.min.toArray(),max:fitted.max.toArray()};result.source='hi3d';
  for(const object of room.laptopObjects)object.visible=false;
  return result;
 }catch(error){console.warn('Hi3D laptop unavailable; retaining calibrated photo-textured laptop.',error);return result;}
}
