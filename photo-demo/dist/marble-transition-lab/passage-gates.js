import * as T from 'three';

// Clip just the surveyed opening out of the scanned balustrade. Keep the
// outside fragments of crossing triangles, including their original UVs.
function openGate(mesh,gateFromMesh,box){
  const g=mesh.geometry,position=g.attributes.position,mask=new Uint8Array(position.count);
  const point=new T.Vector3(),cuts=[];
  for(const axis of ['x','y','z'])cuts.push([axis,box.min[axis],1],[axis,box.max[axis],-1]);
  for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).applyMatrix4(gateFromMesh);
    mask[i]=(point.x<box.min.x)|((point.x>box.max.x)<<1)|((point.y<box.min.y)<<2)|
      ((point.y>box.max.y)<<3)|((point.z<box.min.z)<<4)|((point.z>box.max.z)<<5);
  }
  const index=g.getIndex(),count=index?.count??position.count,out=[],extra=[],groups=[];
  const face=[0,0,0],axes=['x','y','z'];
  function emit(polygon){
    if(polygon.length<3)return;
    for(const v of polygon)if(v.index===undefined){
      v.index=position.count+extra.length;extra.push({face:face.slice(),weights:v.weights});
    }
    for(let j=2;j<polygon.length;j++)out.push(polygon[0].index,polygon[j-1].index,polygon[j].index);
  }
  let changed=false;
  for(const group of g.groups.length?g.groups:[{start:0,count}]){
    const start=out.length;
    for(let i=group.start;i<group.start+group.count;i+=3){
      for(let k=0;k<3;k++)face[k]=index?index.getX(i+k):i+k;
      if(mask[face[0]]&mask[face[1]]&mask[face[2]]){out.push(...face);continue;}
      changed=true;
      let inside=face.map((i,k)=>({index:i,p:new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(gateFromMesh),
        weights:new T.Vector3().setComponent(k,1)}));
      for(const [axis,edge,sign] of cuts){
        if(!inside.length)break;
        if(inside.every(v=>(v.p[axis]-edge)*sign>=0))continue;
        if(inside.every(v=>(v.p[axis]-edge)*sign<=0)){emit(inside);break;}
        const outside=[],next=[];
        for(let k=0;k<inside.length;k++){
          const a=inside[k],b=inside[(k+1)%inside.length],da=(a.p[axis]-edge)*sign,db=(b.p[axis]-edge)*sign;
          (da<0?outside:next).push(a);
          if((da<0&&db>0)||(db<0&&da>0)){
            const t=da/(da-db),v={p:a.p.clone().lerp(b.p,t),weights:a.weights.clone().lerp(b.weights,t)};
            outside.push(v);next.push(v);
          }else if(da===0)outside.push(a);
        }
        emit(outside);inside=next;
      }
    }
    if(g.groups.length)groups.push({start,count:out.length-start,materialIndex:group.materialIndex});
  }
  if(!changed)return;
  const geometry=new T.BufferGeometry();
  for(const [name,src] of Object.entries(g.attributes)){
    const ArrayType=(src.array||src.data.array).constructor;
    const dst=new T.BufferAttribute(new ArrayType((position.count+extra.length)*src.itemSize),src.itemSize,src.normalized);
    if(!src.isInterleavedBufferAttribute)dst.array.set(src.array);
    else for(let i=0;i<src.count;i++)for(let j=0;j<src.itemSize;j++)dst.setComponent(i,j,src.getComponent(i,j));
    for(let i=0;i<extra.length;i++)for(let j=0;j<src.itemSize;j++){
      const {face,weights}=extra[i];
      dst.setComponent(position.count+i,j,face.reduce((sum,k,n)=>sum+src.getComponent(k,j)*weights[axes[n]],0));
    }
    geometry.setAttribute(name,dst);
  }
  geometry.setIndex(out);geometry.groups=groups;mesh.geometry=geometry;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
}

export function openPassageGates(root,gates){
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert();
  for(const [low,high,frame] of gates){
    // Some landings meet a curved wall on a diagonal. Clip in the landing's
    // own frame so the back of the cut stays parallel to the doorway.
    const toGate=frame?new T.Matrix4().makeRotationY(frame.yaw)
      .setPosition(...frame.origin).invert().multiply(inverse):inverse;
    const gate=new T.Box3(new T.Vector3(...low),new T.Vector3(...high));
    root.traverse(o=>{
      if(!o.isMesh)return;
      const m=toGate.clone().multiply(o.matrixWorld),g=o.geometry;
      if(!g.boundingBox)g.computeBoundingBox();
      if(g.boundingBox.clone().applyMatrix4(m).intersectsBox(gate))openGate(o,m,gate);
    });
  }
}
