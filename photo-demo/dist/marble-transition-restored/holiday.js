import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRoom} from '../room.js';
import {createHolidayWorld} from '../island.js';
import {createDeskHoliday} from './restored-coast.js';
import {photographicMaterial} from '../photographic-material.js';

// The original art direction and complete Hi3D island, registered to Marble.
// No replacement toy landscape; the old room and coast remain the source.
export async function createHoliday(scene,meta,registeredObjects,renderer){
  const json=path=>fetch('../assets/'+path+'.json').then(r=>{if(!r.ok)throw Error('缺少原版场景资产：'+path);return r.json();});
  const loader=new THREE.TextureLoader();
  const texture=async path=>{const t=await loader.loadAsync('../assets/'+path);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;};
  const [calibration,photo,laptopFit,cupFit,furnitureFit,detailFit,generatedFit]=await Promise.all([
    json('calibration'),texture('desk-original.jpg'),json('laptop-fit'),json('cup-fit'),json('furniture-fit'),json('desk-details-fit'),json('generated-furniture-fit')]);
  const assets={laptopFit,cupFit,furnitureFit,detailFit};
  await Promise.all(Object.entries({screen:'laptop-screen',deck:'laptop-deck',book:'book-cover',desk:'desk-surface',window:'window-surface',memo:'memo-paper',wood:'cabinet-wood',orange:'orange-book'}).map(async([name,file])=>assets[name]=await texture('objects/'+file+'.png')));
  const original=new THREE.PerspectiveCamera(calibration.fov,calibration.width/calibration.height,.01,80);original.position.fromArray(calibration.position);original.quaternion.fromArray(calibration.quaternion);original.updateMatrixWorld(true);
  const legacy=new THREE.Group();legacy.name='Restored original modeled room';scene.add(legacy);
  const room=createRoom(legacy,original,photo,assets);room.photoPlane.visible=false;

  const R=new THREE.Matrix3().set(...meta.source_camera_to_world.flat());
  const normal=new THREE.Vector3(...meta.support_plane).applyMatrix3(R);
  const constant=1+normal.dot(new THREE.Vector3(...meta.source_camera_position));
  const surface=(x,z)=>(constant-normal.x*x-normal.z*z)/normal.y;
  // Least-squares registration of the original photographed desk corners.
  const a=.3244249964464748,b=.13054014775421732,c=-.1540560265008364,d=.38141956173533403,tx=-.13091503437647292,tz=-2.036425280221;
  const scale=Math.sqrt(a*d-b*c),vertical=new THREE.Vector3(0,scale,0);
  const xAxis=new THREE.Vector3(a,-(normal.x*a+normal.z*c)/normal.y,c),zAxis=new THREE.Vector3(b,-(normal.x*b+normal.z*d)/normal.y,d);
  legacy.matrix.makeBasis(xAxis,vertical,zAxis).setPosition(tx,surface(tx,tz),tz);legacy.matrixAutoUpdate=false;legacy.updateMatrixWorld(true);
  const inverse=legacy.matrix.clone().invert();
  const center=name=>new THREE.Box3().setFromObject(registeredObjects.group.getObjectByName(name)).getCenter(new THREE.Vector3());
  const cupCenter=center('cup-wall'),bookCenter=center('book-cover');
  // The old coast's endpoints are registered against the shared real objects.
  room.cupPosition.copy(cupCenter).applyMatrix4(inverse);room.cupPosition.y=.025;
  room.books.position.copy(bookCenter).applyMatrix4(inverse);room.books.position.y=.028;
  room.cup.visible=false;room.books.visible=false;room.note.visible=false;
  for(const object of room.laptopObjects)object.visible=false;

  // Keep the original well-developed furniture, including the photographed lamp.
  await Promise.all(['chair','lamp'].map(async name=>{
    const fit=generatedFit[name],{scene:model}=await new GLTFLoader().loadAsync('../assets/'+fit.file);
    model.scale.setScalar(fit.scale);model.position.fromArray(fit.sourceOrigin).multiplyScalar(-fit.scale);
    const object=new THREE.Group();object.name='Original Hi3D '+name;object.position.fromArray(fit.position);object.rotation.y=fit.yaw;object.add(model);room.root.add(object);room[name].visible=false;
    model.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){
      m.envMapIntensity=name==='lamp'?1.2:.65;if(m.map)m.map.anisotropy=8;
      if(name==='chair'){m.metalness=.15;m.roughness=Math.max(.62,m.roughness);m.color.multiplyScalar(1.35);}
      else{m.metalness=.65;m.roughness=Math.max(.36,m.roughness);}
    }});
  }));

  const coast=createDeskHoliday(legacy,room,photo);await coast.ready;coast.group.visible=true;
  const islandSlot=new THREE.Group();islandSlot.name='Complete original Hi3D island inside cup';scene.add(islandSlot);
  const cupBounds=new THREE.Box3().setFromObject(registeredObjects.group.getObjectByName('cup-wall'));
  islandSlot.position.set(cupCenter.x,cupBounds.min.y+.008,cupCenter.z);
  islandSlot.rotation.y=Math.PI;islandSlot.scale.setScalar(.039);
  const island=await createHolidayWorld(THREE,islandSlot,{islandUrl:'../assets/holiday-island.glb',houseUrl:'../assets/holiday-house.glb'});await island.ready;
  if(island.source!=='hi3d-island')throw Error('完整 Hi3D 海岛未加载；保留实景，不能用简化场景替代。');
  for(const root of [coast.group,islandSlot])root.traverse(o=>{if(o.isMesh)o.layers.enable(2);});

  // Render the original desk texture on its photographed outline, not a giant
  // blank polygon enlarged to accommodate a different landscape.
  room.desktop.visible=false;
  const K=meta.intrinsics,plane=new THREE.Vector3(...meta.support_plane),C=new THREE.Vector3(...meta.source_camera_position);
  const corners=calibration.corners.map(([u,v])=>{const ray=new THREE.Vector3((u-K[2])/K[0],(v-K[3])/K[1],1);return ray.multiplyScalar(1/plane.dot(ray)).applyMatrix3(R).add(C);});
  const shape=new THREE.Shape();corners.forEach((p,i)=>{const enter=p.clone().lerp(corners[(i+3)%4],.035),leave=p.clone().lerp(corners[(i+1)%4],.035);if(!i)shape.moveTo(enter.x,-enter.z);else shape.lineTo(enter.x,-enter.z);shape.quadraticCurveTo(p.x,-p.z,leave.x,-leave.z);});shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.026,bevelSize:.004,bevelThickness:.004,bevelEnabled:true,bevelSegments:4,curveSegments:16});geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i),local=new THREE.Vector3(x,surface(x,z),z).applyMatrix4(inverse);
    pos.setY(i,pos.getY(i)+surface(x,z)-.030);uv.setXY(i,(local.x+2.1)/4.2,1-(local.z+.85)/1.7);
  }geo.computeVertexNormals();
  const tableMat=photographicMaterial(assets.desk,{roughness:.8,retention:.88});
  const table=new THREE.Mesh(geo,tableMat);table.name='Photographed tabletop with original material';table.receiveShadow=true;scene.add(table);

  const studio=new THREE.Scene();studio.background=new THREE.Color('#8e9695');
  for(const [position,size,color,intensity] of [[[-3,4,-3],[8,5],'#eef4f4',2.6],[[4,1,4],[5,5],'#c8c3b7',1]]){
    const pane=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}));pane.position.set(...position);pane.lookAt(0,0,0);studio.add(pane);
  }
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.12).texture;pmrem.dispose();
  scene.environment=environment;scene.environmentIntensity=.75;scene.background=new THREE.Color('#b1bfbd');
  const sun=new THREE.DirectionalLight('#f2f0e8',1.1);sun.position.set(-1.1,3.1,-3.4);sun.target.position.set(0,.82,-2.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1.5,right:1.5,top:1.5,bottom:-1.5,near:.1,far:7});sun.shadow.normalBias=.001;sun.shadow.bias=-.00015;sun.shadow.radius=3;
  scene.add(sun,sun.target,new THREE.HemisphereLight('#e3e9e6','#8d8574',1.0));
  // Scale physical light power to the new metric dimensions.
  room.lampLight.intensity=.20;room.lampLight.distance=1.5;
  return {group:coast.group,table,houseReady:coast.cottageReady,islandSource:island.source,surface,environment,sun,legacy,
    update(time,view){
      coast.update(time,1);room.lampLight.intensity=.22;room.lampLight.distance=1.5;island.update(time);island.setLight(.65);
      if(view){const local=view.position.clone().applyMatrix4(inverse);for(const wall of room.windowObjects)wall.visible=local.z>-1.15;room.sideWall.visible=local.x<3.65;room.poster.visible=room.sideWall.visible;}
    }};
}
