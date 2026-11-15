import * as T from 'three';

// The two counter openings, in the fitted building's local coordinates. Winding
// gives each aperture an outward normal. The side window has a solid upright.
function front(x0,x1,y0,y1,z){
  return [[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]];
}
function side(z0,z1,y0,y1,x){
  return [[x,y0,z1],[x,y0,z0],[x,y1,z0],[x,y1,z1]];
}
const openings=[
  front(-.173,.281,.187,.343,.395),
  side(-.245,-.204,.185,.341,.390),
  side(-.184,.260,.185,.341,.390)
].map(quad=>quad.map(v=>new T.Vector3(...v)));

// Integrate the projected solid angle of a rectangular opening over the unit
// sphere. The result is its share of a surface's diffuse sky irradiance. Edge
// integrals stay well behaved as the observer approaches a jamb.
function skyFraction(point,normal,dirs,cross){
  let total=0;
  for(const quad of openings){
    for(let j=0;j<4;j++)dirs[j].copy(quad[j]).sub(point).normalize();
    let projected=0;
    for(let j=0;j<4;j++){
      const a=dirs[j],b=dirs[(j+1)%4];
      cross.crossVectors(a,b);
      const length=cross.length();
      if(length>1e-7)projected+=normal.dot(cross)*Math.atan2(length,a.dot(b))/length;
    }
    total+=Math.max(0,projected)/(2*Math.PI);
  }
  return Math.min(1,total);
}

// Bake a short-range ambient visibility field from the actual contents. A
// shelf darkens the wall behind it; stock on the counter shades the timber.
// A small binary volume keeps the calculation independent of browser GPU.
function localVisibility(room,inverse){
  const h=.012, nx=76,ny=38,nz=76,ox=-.45,oy=.013,oz=-.45,vox=new Uint8Array(nx*ny*nz);
  const t=new T.Triangle(),probe=new T.Vector3(),closest=new T.Vector3(),mat=new T.Matrix4();
  room.traverse(o=>{
    if(!o.isMesh)return;
    const p=o.geometry.attributes.position, idx=o.geometry.index, count=idx?.count??p.count;
    mat.multiplyMatrices(inverse,o.matrixWorld);
    for(let i=0;i<count;i+=3){
      for(const [j,v] of [[0,t.a],[1,t.b],[2,t.c]])v.fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(mat);
      // Reject degenerate triangles (e.g. the pole of a turned spindle).
      if(t.getArea()<1e-12)continue;
      const lo=[...['x','y','z'].map((k,j)=>Math.max(0,Math.floor((Math.min(t.a[k],t.b[k],t.c[k])-[ox,oy,oz][j])/h-.16)))];
      const hi=['x','y','z'].map((k,j)=>Math.min([nx,ny,nz][j]-1,Math.floor((Math.max(t.a[k],t.b[k],t.c[k])-[ox,oy,oz][j])/h+.16)));
      for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
        const id=(z*ny+y)*nx+x;if(vox[id])continue;
        probe.set(ox+(x+.5)*h,oy+(y+.5)*h,oz+(z+.5)*h);
        if(t.closestPointToPoint(probe,closest).distanceToSquared(probe)<.72*h*h)vox[id]=1;
      }
    }
  });
  const tangent=new T.Vector3(),bitangent=new T.Vector3(),dir=new T.Vector3(),origin=new T.Vector3();
  const rays=Array.from({length:10},(_,i)=>{
    const z=Math.sqrt((i+.5)/10),r=Math.sqrt(1-z*z),a=2.39996*i;
    return [r*Math.cos(a),r*Math.sin(a),z];
  });
  const cached=new Map();
  return (point,normal)=>{
    const x=Math.floor((point.x-ox)/h), y=Math.floor((point.y-oy)/h), z=Math.floor((point.z-oz)/h);
    const key=((((z*ny+y)*nx+x)*7+Math.round((normal.x+1)*3))*7+Math.round((normal.y+1)*3))*7+Math.round((normal.z+1)*3);
    if(cached.has(key))return cached.get(key);
    tangent.set(Math.abs(normal.y)>.9?1:0,Math.abs(normal.y)>.9?0:1,0).cross(normal).normalize();
    bitangent.crossVectors(normal,tangent);origin.copy(point).addScaledVector(normal,1.55*h);
    let blocked=0;
    for(const [a,b,c] of rays){
      dir.copy(tangent).multiplyScalar(a).addScaledVector(bitangent,b).addScaledVector(normal,c);
      for(let i=1;i<=11;i++){
        const d=h*i,ix=Math.floor((origin.x+d*dir.x-ox)/h),iy=Math.floor((origin.y+d*dir.y-oy)/h),iz=Math.floor((origin.z+d*dir.z-oz)/h);
        if(ix<0||ix>=nx||iy<0||iy>=ny||iz<0||iz>=nz)break;
        if(vox[(iz*ny+iy)*nx+ix]){blocked+=(12-i)/11;break;}
      }
    }
    const value=1-blocked/rays.length;cached.set(key,value);return value;
  };
}

export function lightHardwareInterior(room){
  room.updateWorldMatrix(true,true);
  const inverse=room.matrixWorld.clone().invert(),matrix=new T.Matrix4(),normals=new T.Matrix3();
  const p=new T.Vector3(),n=new T.Vector3(),cross=new T.Vector3();
  const dirs=Array.from({length:4},()=>new T.Vector3());
  const visibility=localVisibility(room,inverse);
  const finishes=new Map();
  function withColors(material){
    if(!finishes.has(material)){
      const lit=material.clone();lit.vertexColors=true;
      finishes.set(material,lit);
    }
    return finishes.get(material);
  }
  room.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry.attributes.normal)return;
    const g=mesh.geometry.clone(),attrs=g.attributes;
    matrix.multiplyMatrices(inverse,mesh.matrixWorld);normals.getNormalMatrix(matrix);
    const rgb=new Float32Array(attrs.position.count*3);
    for(let i=0;i<attrs.position.count;i++){
      p.fromBufferAttribute(attrs.position,i).applyMatrix4(matrix);
      n.fromBufferAttribute(attrs.normal,i).applyNormalMatrix(normals);
      const sky=skyFraction(p,n,dirs,cross);
      // Diffuse interreflection from the light plaster and timber retains fill
      // at the rear. Vertex colours and glTF COLOR_0 are linear multipliers.
      const direct=Math.min(1,1.28*Math.sqrt(sky)), k=1-direct;
      const ambient=.37+.63*visibility(p,n);
      rgb[3*i]=(attrs.color?.getX(i)??1)*(1-.72*k)*ambient;
      rgb[3*i+1]=(attrs.color?.getY(i)??1)*(1-.735*k)*ambient;
      rgb[3*i+2]=(attrs.color?.getZ(i)??1)*(1-.75*k)*ambient;
    }
    g.setAttribute('color',new T.BufferAttribute(rgb,3));mesh.geometry=g;
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(withColors):withColors(mesh.material);
  });
  return room;
}
