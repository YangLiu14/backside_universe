import * as THREE from 'three';
import {harborFits,seatHarborBase} from './harbor-waterline.js';
import {buildInterior,P} from '../holiday-assets/bookroom-interior.js';
import {registerGrotto,roomFrame,seatGrotto} from './grotto-registration.js';

export async function createGrotto(registered,surface,loader){
 const root=new THREE.Group();root.name='Unified grotto and enterable bookroom on the registered laptop';
 const lid=registered.group.getObjectByName('laptop-lid');
 const registration=seatGrotto(registerGrotto(lid.geometry.attributes.position.array),surface);
 async function shell(path){
  const asset=await loader.loadAsync('../holiday-assets/assets/'+path);
  const environment=asset.scene.getObjectByName('tripo-unified-grotto-bookhouse-harbor');
  if(!environment)throw Error('未找到新版洞窟外壳');
  environment.removeFromParent();
  seatHarborBase(environment,registration.matrix,surface,harborFits.grotto);
  return environment;
 }
 const [overview,layout,interior]=await Promise.all([
  shell('laptop/desktop-grotto.glb'),
  fetch('../holiday-assets/assets/bookroom/grotto-layout.json').then(r=>{if(!r.ok)throw Error('洞窟布局未能载入');return r.json();}),
  buildInterior(root,loader,{furnitureWidthScale:.75,grotto:true,deferFurniture:true}),
 ]);
 root.add(overview);
 const localRoom=roomFrame(layout),worldFromRoom=registration.matrix.clone().multiply(localRoom),roomFromWorld=worldFromRoom.clone().invert();
 interior.root.applyMatrix4(localRoom);root.applyMatrix4(registration.matrix);root.updateMatrixWorld(true);
 interior.root.traverse(o=>{if(o.isPointLight){const s=.75*registration.scale;o.intensity*=s*s;o.distance*=s;}});
 function prepareMeshes(group,exterior=false){
  group.traverse(o=>{
   if(!o.isMesh)return;
   o.layers.enable(3);o.castShadow=exterior;o.receiveShadow=true;
   for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map)m.map.anisotropy=8;
  });
 }
 prepareMeshes(overview,true);prepareMeshes(interior.root);
 let shellRequest,detail,showingDetail=false;
 async function prepareVisit(){
  if(detail)return;
  if(!shellRequest)shellRequest=shell('bookroom/shell-grotto-v6.glb').catch(error=>{shellRequest=null;throw error;});
  const [environment]=await Promise.all([shellRequest,interior.loadFurniture()]);
  prepareMeshes(environment,true);prepareMeshes(interior.contents);
  detail=environment;
 }
 function closeView(on){
  if(!detail||on===showingDetail)return;
  showingDetail=on;
  // Only the active shell is attached, so door picking sees the same geometry as the camera.
  root.remove(on?overview:detail);root.add(on?detail:overview);
  interior.contents.visible=on;
  root.updateWorldMatrix(true,true);
 }
 return {root,interior,prepareVisit,closeView,get environment(){return showingDetail?detail:overview;},
  layout:{...layout,terraceX:.043},registration,
  toWorld:p=>p.clone().applyMatrix4(worldFromRoom),toRoom:p=>p.clone().applyMatrix4(roomFromWorld),
  islandToWorld:p=>p.clone().applyMatrix4(registration.matrix),
  roomFromWorld,worldFromRoom,entryTarget:P(.043,.672,.092),
 };
}
