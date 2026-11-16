import * as T from 'three';

export const measuredBasket=Object.freeze({
  rimLocal:Object.freeze([-.00579160655824285,.2308898154089621,.38505407941799635]),
  innerRadius:.3281,netBottomY:2.383355823856124,netDepth:.784644176143876,
});

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const u=clamp((x-a)/(b-a),0,1);return u*u*(3-2*u);};

// Deform the actual Hi3D ropes, retaining their topology, UVs and material.
// The measured rim, mounting hooks, backboard and post are fixed boundaries.
export function createBasketNet(hoop,worldRim,flight) {
  hoop.updateWorldMatrix(true,true);
  const rim=worldRim.clone(),parts=[],point=new T.Vector3();
  let bottom=Infinity,vertexCount=0,triangleCount=0;
  const meshes=[];hoop.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
  for(const mesh of meshes){
    const source=mesh.geometry,position=source.attributes.position,indices=source.index;
    if(!position||!indices)continue;
    const ids=[],restWorld=[],weights=[],mask=new Uint8Array(position.count);
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      const depth=rim.y-point.y,radial=Math.hypot(point.x-rim.x,point.z-rim.z);
      // This tapered region was measured and checked against the original
      // source from front/side: no board, support, ring or upper hook is inside.
      if(depth<=.034||depth>=.73||radial>=.435-.43*Math.min(depth+.011,.45))continue;
      ids.push(i);restWorld.push(point.x,point.y,point.z);mask[i]=1;
      weights.push(smooth(.034,.16,depth));bottom=Math.min(bottom,point.y);
    }
    if(!ids.length)continue;
    const triangles=[];
    for(let i=0;i<indices.count;i+=3){
      const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
      if(mask[a]||mask[b]||mask[c])triangles.push(a,b,c);
    }
    // Isolate the original rope triangles so animated uploads contain only
    // ropes. The other goal shares source geometry and remains unchanged.
    const sourceIds=[...new Set(triangles)],remap=new Map(sourceIds.map((id,i)=>[id,i]));
    const geometry=new T.BufferGeometry(),fixed=source.clone();
    for(const [name,attribute] of Object.entries(source.attributes)){
      const values=new attribute.array.constructor(sourceIds.length*attribute.itemSize);
      for(let i=0;i<sourceIds.length;i++)for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=attribute.array[sourceIds[i]*attribute.itemSize+k];
      geometry.setAttribute(name,new T.BufferAttribute(values,attribute.itemSize,attribute.normalized));
    }
    const movingIndex=[],fixedIndex=[];
    const groups=source.groups.length?source.groups:[{start:0,count:indices.count,materialIndex:0}];
    fixed.clearGroups();
    for(const group of groups){
      const ns=movingIndex.length,fs=fixedIndex.length;
      for(let i=group.start;i<group.start+group.count;i+=3){
        const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
        if(mask[a]||mask[b]||mask[c])movingIndex.push(remap.get(a),remap.get(b),remap.get(c));
        else fixedIndex.push(a,b,c);
      }
      if(movingIndex.length>ns)geometry.addGroup(ns,movingIndex.length-ns,group.materialIndex);
      if(fixedIndex.length>fs)fixed.addGroup(fs,fixedIndex.length-fs,group.materialIndex);
    }
    geometry.setIndex(movingIndex);fixed.setIndex(fixedIndex);mesh.geometry=fixed;
    const ropes=new T.Mesh(geometry,mesh.material);ropes.name=(mesh.name||'Basket')+'Net';
    ropes.position.copy(mesh.position);ropes.quaternion.copy(mesh.quaternion);ropes.scale.copy(mesh.scale);
    ropes.castShadow=mesh.castShadow;ropes.receiveShadow=mesh.receiveShadow;mesh.parent.add(ropes);ropes.updateWorldMatrix(true,false);
    geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    geometry.attributes.normal?.setUsage(T.DynamicDrawUsage);
    geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.18;
    const compactMask=new Uint8Array(sourceIds.map(id=>mask[id]));
    parts.push({mesh:ropes,geometry,ids:ids.map(id=>remap.get(id)),restWorld:new Float32Array(restWorld),weights,
      triangles:movingIndex,rest:geometry.attributes.position.array.slice(),restNormals:geometry.attributes.normal?.array.slice(),mask:compactMask,inverse:ropes.matrixWorld.clone().invert()});
    vertexCount+=ids.length;triangleCount+=triangles.length/3;
  }
  if(!parts.length)throw new Error('The measured Hi3D basket net was not found.');
  const radius=flight.sample(flight.hoopTime).physics.radius;
  // Keep contact until the entire sphere has left the actual hanging ropes.
  let lo=flight.hoopTime,hi=lo+.5;
  for(let i=0;i<40;i++){
    const mid=(lo+hi)/2;
    if(flight.sample(mid).position[1]+radius>bottom-.035)lo=mid;else hi=mid;
  }
  const releaseTime=(lo+hi)/2,release=flight.sample(releaseTime);
  const releaseOffset=new T.Vector3(release.position[0]-rim.x,0,release.position[2]-rim.z);
  const releaseVelocity=new T.Vector3(release.velocity[0],0,release.velocity[2]);
  const bottomDepth=rim.y-bottom,maxTime=releaseTime+1.5;
  let lastTime=NaN,active=false,lastBall=new T.Vector3(),maximumDisplacement=0;
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),nearest=new T.Vector3(),triangle=new T.Triangle();
  const shape=(time,ball)=>{
    if(time<flight.hoopTime||time>=maxTime)return {x:0,z:0,pull:0};
    if(time<=releaseTime){
      const engage=smooth(.16,.32,rim.y-ball.y);
      return {x:(ball.x-rim.x)*engage,z:(ball.z-rim.z)*engage,pull:.025*engage};
    }
    const u=time-releaseTime,fade=1-smooth(1.05,1.5,u),decay=Math.exp(-4*u)*fade;
    const cs=Math.cos(12*u),sn=Math.sin(12*u);
    return {x:decay*(releaseOffset.x*cs+(releaseVelocity.x+4*releaseOffset.x)/12*sn),
      z:decay*(releaseOffset.z*cs+(releaseVelocity.z+4*releaseOffset.z)/12*sn),
      pull:decay*.025*(cs+4/12*sn)};
  };
  function update(time,ballPosition){
    const ball=ballPosition?.isVector3?ballPosition:new T.Vector3(...(ballPosition||flight.sample(time).position));
    lastBall.copy(ball);
    if(time===lastTime)return;
    lastTime=time;
    const s=shape(time,ball),moving=Math.abs(s.x)+Math.abs(s.z)+Math.abs(s.pull)>1e-9;
    if(!moving&&!active)return;
    maximumDisplacement=0;
    for(const part of parts){
      const {geometry,ids,restWorld,weights,rest}=part,positions=geometry.attributes.position;
      for(let j=0;j<ids.length;j++){
        const i=ids[j],k=j*3;
        if(!moving){positions.setXYZ(i,rest[i*3],rest[i*3+1],rest[i*3+2]);continue;}
        const rx=restWorld[k],ry=restWorld[k+1],rz=restWorld[k+2],depth=rim.y-ry;
        const bend=smooth(.034,bottomDepth,depth)*weights[j];
        point.set(rx+s.x*bend,ry-s.pull*bend,rz+s.z*bend);
        // Resolve the full sphere against the original rope surface. A small
        // radial envelope also covers triangle chords between source vertices.
        const dy=point.y-ball.y,envelope=radius+.009;
        if(time<=releaseTime&&Math.abs(dy)<envelope){
          const dx=point.x-ball.x,dz=point.z-ball.z,r=Math.hypot(dx,dz);
          const wanted=Math.sqrt(envelope*envelope-dy*dy);
          if(r<wanted){
            const ux=r>1e-8?dx/r:(rx-rim.x)/Math.max(1e-8,Math.hypot(rx-rim.x,rz-rim.z));
            const uz=r>1e-8?dz/r:(rz-rim.z)/Math.max(1e-8,Math.hypot(rx-rim.x,rz-rim.z));
            point.x+=ux*(wanted-r)*weights[j];point.z+=uz*(wanted-r)*weights[j];
          }
        }
        maximumDisplacement=Math.max(maximumDisplacement,Math.hypot(point.x-rx,point.y-ry,point.z-rz));
        point.applyMatrix4(part.inverse);positions.setXYZ(i,point.x,point.y,point.z);
      }
      positions.needsUpdate=true;
      if(!moving&&part.restNormals){
        geometry.attributes.normal.array.set(part.restNormals);geometry.attributes.normal.needsUpdate=true;
      }else{
        geometry.computeVertexNormals();
        // Preserve authored normals on the fixed attachment boundary.
        if(part.restNormals){const normals=geometry.attributes.normal;for(let i=0;i<part.mask.length;i++)if(!part.mask[i])normals.setXYZ(i,part.restNormals[i*3],part.restNormals[i*3+1],part.restNormals[i*3+2]);}
      }
    }
    active=moving;
  }
  function details(){
    let distance=Infinity,originalDistance=Infinity;
    for(const part of parts){
      const pos=part.geometry.attributes.position,{rest,mesh,triangles}=part;
      for(let i=0;i<triangles.length;i+=3){
        a.fromBufferAttribute(pos,triangles[i]).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(pos,triangles[i+1]).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(pos,triangles[i+2]).applyMatrix4(mesh.matrixWorld);
        triangle.set(a,b,c).closestPointToPoint(lastBall,nearest);distance=Math.min(distance,nearest.distanceTo(lastBall));
        a.fromArray(rest,triangles[i]*3).applyMatrix4(mesh.matrixWorld);
        b.fromArray(rest,triangles[i+1]*3).applyMatrix4(mesh.matrixWorld);
        c.fromArray(rest,triangles[i+2]*3).applyMatrix4(mesh.matrixWorld);
        triangle.set(a,b,c).closestPointToPoint(lastBall,nearest);originalDistance=Math.min(originalDistance,nearest.distanceTo(lastBall));
      }
    }
    return {vertexCount,triangleCount,bottomY:bottom,rim:rim.toArray(),radius,releaseTime,
      active,maximumDisplacement,ballClearance:distance-radius,originalBallClearance:originalDistance-radius};
  }
  return {update,details};
}
