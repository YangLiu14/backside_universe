import * as THREE from 'three';

export const vec=(x,y,z)=>new THREE.Vector3(x,y,z);
export const surface=(color,metalness=0,roughness=.67)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
export function piece(parent,geometry,material,x=0,y=0,z=0){
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);
  mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function rod(parent,a,b,ra,rb,material){
  const delta=b.clone().sub(a);
  const mesh=piece(parent,new THREE.CylinderGeometry(rb,ra,delta.length(),20),material);
  mesh.position.copy(a).lerp(b,.5);mesh.quaternion.setFromUnitVectors(vec(0,1,0),delta.normalize());return mesh;
}
// Shoot along the island's own up axis, including the tilt of the photographed desk.
export function bedrock(island,x,z){
  const top=island.localToWorld(vec(x,1,z)),down=vec(0,-1,0).transformDirection(island.matrixWorld);
  const model=island.children.find(o=>o.visible&&o.isGroup);
  const hit=new THREE.Raycaster(top,down).intersectObject(model,true)[0];
  if(!hit)throw Error('未能定位岛岸上的落脚点');
  return island.worldToLocal(hit.point);
}
