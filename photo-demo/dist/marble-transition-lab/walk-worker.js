import {BufferGeometry,BufferAttribute} from '../vendor/three.module.js';
import {MeshBVH} from '../vendor/mesh-bvh/index.module.js';

// Build against copies of the seated positions. Never reorder or detach the
// live renderer's indices. The main thread reuses the trees on later visits.
self.onmessage=({data:meshes})=>{
  const trees=meshes.map(({positions,indices})=>{
    const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(positions,3));
    if(indices)geometry.setIndex(new BufferAttribute(indices,1));
    const tree=MeshBVH.serialize(new MeshBVH(geometry,{indirect:true,targetLeafSize:12}),{cloneBuffers:false});
    tree.index=null;
    return tree;
  });
  self.postMessage(trees,trees.flatMap(t=>[...t.roots,t.indirectBuffer.buffer]));
};
