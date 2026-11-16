import * as T from 'three';

// Remove the old fused actor in the room's measured coordinates. Keep the desk,
// the back wall and the new independent broadcast equipment.
export function installAnnouncer(booth, announcer, rear, head) {
  if (!announcer) return -15.72;
  const point = new T.Vector3();
  for (const mesh of booth.children) {
    if (!mesh.isMesh) continue;
    const g = mesh.geometry, pos = g.attributes.position, index = g.index, keep = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i+1), c = index.getX(i+2);
      point.set(pos.getX(a)+pos.getX(b)+pos.getX(c), pos.getY(a)+pos.getY(b)+pos.getY(c), pos.getZ(a)+pos.getZ(b)+pos.getZ(c));
      point.multiplyScalar(1/3).multiply(booth.scale).add(booth.position);
      const {x,y,z} = point;
      const actor = x > -26.5 && x < -3.8 && z > 11.5 && z < 35.2
        && (y > -9.75 || y < -11.35 || x < -17.25);
      const lowFurniture = y < -11.35 && x > -26.5 && x < 17 && z > 2.1;
      const oldManuscript = x > -13 && x < 2.5 && z > 23.5 && z < 34 && y > -9.6 && y < -7.5;
      const oldFloor = y < -15.3 || (z > 35.2 && y < -13.8);
      const frontPosts = Math.abs(x)>26.5 && z>34.5;
      const damagedLeftWall=x < -25.5 && z > -1.8;
      if (!actor && !lowFurniture && !oldManuscript && !oldFloor && !frontPosts && !damagedLeftWall) keep.push(a,b,c);
    }
    g.setIndex(keep);
  }
  const height = 38.4, native = announcer.userData.native;
  if (head) removeOriginalHead(announcer);
  announcer.scale.set(height*native[0]/native[1]/.88, height, height*native[2]/native[1]/.82);
  announcer.position.set(-15.5, -8.0, 26);
  announcer.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    for (const material of [].concat(mesh.material)) {
      material.metalness = 0;
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          roughnessFactor=max(.48,roughnessFactor);
        `);
      };
      material.customProgramCacheKey = () => 'announcer-dielectric-v1';
    }
  });
  rear.add(announcer);rear.updateWorldMatrix(true,true);booth.attach(announcer);
  if(head){
    const size=head.userData.native,height=14,neck=new T.Vector3(-18.1,2,26);
    head.scale.set(height*size[0]/size[1]/.88,height,height*size[2]/size[1]/.82);
    head.position.set(-20,6.3,26).sub(neck).applyAxisAngle(new T.Vector3(0,0,1),-.10).add(neck);
    head.rotation.z=-.10;
    head.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.castShadow=mesh.receiveShadow=true;
      for(const material of [].concat(mesh.material)){
        material.metalness=0;
        material.onBeforeCompile=shader=>{
          shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
            #include <roughnessmap_fragment>
            roughnessFactor=max(.52,roughnessFactor);
          `);
        };
        material.customProgramCacheKey=()=> 'announcer-head-dielectric-v1';
      }
    });
    rear.add(head);rear.updateWorldMatrix(true,true);booth.attach(head);
  }
  return -27.35;
}

function removeOriginalHead(body) {
  // Measured on the preserved body master before its +90° Y normalization.
  // Keep the sloping jacket collar; replace the complete old face and ponytail.
  const native=body.userData.native;
  let removed=0;
  for(const mesh of body.children){
    if(!mesh.isMesh)continue;
    const g=mesh.geometry,p=g.attributes.position,index=g.index,keep=[];
    for(let i=0;i<index.count;i+=3){
      const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
      const y=(p.getY(a)+p.getY(b)+p.getY(c))/3*native[1]-.000345;
      const z=(p.getX(a)+p.getX(b)+p.getX(c))/3*native[0]+.00024;
      const face=y>.315||y+.7*z>.25;
      const ponytail=y>.17&&z<-.20+.60*(y-.20);
      if(!face&&!ponytail)keep.push(a,b,c);
    }
    removed+=(index.count-keep.length)/3;
    g.setIndex(keep);
  }
  body.userData.removedHeadTriangles=removed;
}
