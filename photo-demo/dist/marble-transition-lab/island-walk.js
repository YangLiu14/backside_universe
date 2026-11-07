import * as T from 'three';
import {MeshBVH} from '../vendor/mesh-bvh/index.module.js';

const cache=new WeakMap();
const arrows={w:'arrowup',s:'arrowdown',a:'arrowleft',d:'arrowright'};
const settings={
  cup:{size:.091,at:[.55,.30],toward:[.55,.51],height:.23},
  'blue-book':{size:.040,start:[.305,.055,.012],aim:[.291,.055,-.018]},
  'orange-book':{size:.046,start:[.036,.15,.0883],aim:[.142,.18,.10685]},
  phone:{size:.040,start:[.042,.071,.066],aim:[.027,.072,.007]},
  grotto:{size:.037,at:[.54,.072],toward:[.545,.16],height:.11},
  office:{eyeHeight:1.62},interior:{eyeHeight:1.55},reef:{size:.048,at:[.29,.36],toward:[.57,.54],height:.05},
};

async function indexMeshes(meshes,signal){
  const missing=[...new Set(meshes.map(m=>m.geometry))].filter(g=>!cache.has(g));
  if(!missing.length)return;
  const data=missing.map(g=>{
    const p=g.attributes.position;
    const positions=p.isInterleavedBufferAttribute?Float32Array.from({length:p.count*3},(_,i)=>p.getComponent(Math.floor(i/3),i%3)):p.array.slice();
    return {positions,indices:g.index?.array.slice()};
  });
  const worker=new Worker(new URL('./walk-worker.js',import.meta.url),{type:'module'});
  await new Promise((resolve,reject)=>{
    function done(error){worker.terminate();signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();}
    function abort(){done(new DOMException('Cancelled','AbortError'));}
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=event=>done(new Error(event.message));
    worker.onmessage=({data:trees})=>{
      try{trees.forEach((tree,i)=>cache.set(missing[i],MeshBVH.deserialize(tree,missing[i],{setIndex:false})));done();}
      catch(error){done(error);}
    };
    if(signal.aborted){abort();return;}
    worker.postMessage(data,data.flatMap(d=>d.indices?[d.positions.buffer,d.indices.buffer]:[d.positions.buffer]));
  });
}

// Navigation uses the actual tide-fitted exterior, including bridge undersides,
// openings and independent overlapping floors. One BVH per shared geometry.
export async function createIslandWalk({id,model,frame,camera,sea,aspect,reduced,signal,spawn}){
  const meshes=[];model.updateWorldMatrix(true,true);
  model.traverseVisible(o=>{
    if(!o.isMesh||o.name.includes('olive_foliage'))return;
    if(id==='reef'&&!['Rippled sand shelf','Limestone outcrops','Terraced plate coral','Branching coral'].includes(o.name))return;
    meshes.push(o);
  });
  await indexMeshes(meshes,signal);
  const box=new T.Box3().setFromObject(model,true),parts=[];
  for(const mesh of meshes){
    const g=mesh.geometry;
    if(!g.boundingBox)g.computeBoundingBox();
    const add=matrix=>{
      const bounds=g.boundingBox.clone().applyMatrix4(matrix),inverse=matrix.clone().invert();
      parts.push({tree:cache.get(g),matrix,inverse,bounds,normal:new T.Matrix3().getNormalMatrix(matrix),
        lengthScale:new T.Vector3(0,-1,0).applyMatrix3(new T.Matrix3().setFromMatrix4(inverse)).length(),radiusScale:inverse.getMaxScaleOnAxis()});
    };
    if(mesh.isInstancedMesh){
      for(let i=0;i<mesh.count;i++){const m=new T.Matrix4();mesh.getMatrixAt(i,m);add(m.premultiply(mesh.matrixWorld));}
    }else add(mesh.matrixWorld);
  }
  const fit=settings[id],extent=box.getSize(new T.Vector3()),span=Math.max(extent.x,extent.z);
  const height=fit.eyeHeight||span*fit.size,radius=height*.155,rise=height*.245,drop=height*.39;
  const ray=new T.Ray(),down=new T.Vector3(0,-1,0),point=new T.Vector3(),normal=new T.Vector3();
  const line=new T.Line3(),bounds=new T.Box3();
  function floors(x,z,top,bottom,all=false){
    const hits=[];
    for(const p of parts){
      const {min,max}=p.bounds;
      if(x<min.x||x>max.x||z<min.z||z>max.z||top<min.y||bottom>max.y)continue;
      ray.origin.set(x,top,z).applyMatrix4(p.inverse);ray.direction.copy(down).transformDirection(p.inverse);
      const far=(top-bottom)*p.lengthScale;
      const first=all?null:p.tree.raycastFirst(ray,T.DoubleSide,0,far);
      for(const h of all?p.tree.raycast(ray,T.DoubleSide,0,far):first?[first]:[]){
        if(normal.copy(h.face.normal).applyNormalMatrix(p.normal).y<.48)continue;
        const y=point.copy(h.point).applyMatrix4(p.matrix).y;
        if(y>=sea(x,z)-height*.08)hits.push(y);
      }
    }
    return hits;
  }
  function clearance(x,y,z){
    for(const p of parts){
      const b=p.bounds;
      if(x+radius<b.min.x||x-radius>b.max.x||z+radius<b.min.z||z-radius>b.max.z||y+height*1.1<b.min.y||y+rise>b.max.y)continue;
      line.start.set(x,y+rise+radius,z).applyMatrix4(p.inverse);
      line.end.set(x,y+height-radius*.35,z).applyMatrix4(p.inverse);
      const r=radius*p.radiusScale;
      bounds.makeEmpty().expandByPoint(line.start).expandByPoint(line.end).expandByScalar(r);
      if(p.tree.shapecast({intersectsBounds:b=>b.intersectsBox(bounds),
        intersectsTriangle:tri=>tri.closestPointToSegment(line,null,null)<r}))return false;
    }
    return true;
  }
  const at=(uv,h)=>new T.Vector3(box.min.x+uv[0]*extent.x,box.min.y+h*extent.y,box.min.z+uv[1]*extent.z);
  const start=spawn?.start||(fit.start?frame.localToWorld(new T.Vector3(...fit.start)):at(fit.at,fit.height));
  const aim=spawn?.aim||(fit.aim?frame.localToWorld(new T.Vector3(...fit.aim)):at(fit.toward,fit.height));
  function place(origin){
    let best,cost=Infinity;
    for(let ring=0;ring<=9;ring++){
      const count=ring?12:1;
      for(let i=0;i<count;i++){
        const x=origin.x+Math.cos(i*2*Math.PI/count)*ring*height*.46,z=origin.z+Math.sin(i*2*Math.PI/count)*ring*height*.46;
        for(const y of floors(x,z,box.max.y+height,box.min.y-height,true)){
          const score=Math.abs(y-origin.y)+ring*height*.48;
          if(score<cost&&clearance(x,y,z)){best=new T.Vector3(x,y,z);cost=score;}
        }
      }
      if(cost<(ring+1)*height*.46)break;
    }
    if(!best)throw new Error('这座岛暂时没有安全的落脚点');
    return best;
  }
  const foot=place(start),keys=new Set(),angles=new T.Euler(0,0,0,'YXZ');
  let eyeY=foot.y+height,yaw=Math.atan2(start.x-aim.x,start.z-aim.z),pitch=spawn?.pitch??-.055,speedX=0,speedZ=0;
  function move(dx,dz){
    const x=foot.x+dx,z=foot.z+dz;
    const hits=floors(x,z,foot.y+rise,foot.y-drop);
    const center=hits.length?Math.max(...hits):null;
    if(center!==null&&center>=foot.y&&clearance(x,center,z)){foot.set(x,center,z);return true;}
    // A capsule meets a tread with its toes before its centre crosses the
    // scanned riser. Require two supported toes and a clear head/body to
    // step onto it; never lift into an unsupported gap or through a wall.
    const n=Math.hypot(dx,dz);if(!n)return false;
    const tx=dx/n*radius*.72,tz=dz/n*radius*.72;
    const sx=-dz/n*radius*.28,sz=dx/n*radius*.28;
    const left=floors(x+tx+sx,z+tz+sz,foot.y+rise,foot.y-height*.02);
    const right=floors(x+tx-sx,z+tz-sz,foot.y+rise,foot.y-height*.02);
    if(left.length&&right.length){
      const step=Math.min(Math.max(...left),Math.max(...right));
      if(clearance(x,step,z)){foot.set(x,step,z);return true;}
    }
    if(center!==null&&clearance(x,center,z)){foot.set(x,center,z);return true;}
    // A crack can expose rock below the deck. Keep support from both ends
    // of the sole even when the centre ray hits that lower, unusable surface.
    const heelX=dx/n*radius*.90,heelZ=dz/n*radius*.90;
    const fore=floors(x+heelX,z+heelZ,foot.y+rise,foot.y-drop,true);
    const aft=floors(x-heelX,z-heelZ,foot.y+rise,foot.y-drop,true);
    if(!fore.length||!aft.length)return false;
    const frontY=Math.max(...fore),backY=Math.max(...aft),supported=Math.max(frontY,backY);
    if(Math.abs(frontY-backY)>drop||!clearance(x,supported,z))return false;
    foot.set(x,supported,z);return true;
  }
  function clear(){keys.clear();speedX=speedZ=0;}
  const held=k=>keys.has(k)||keys.has(arrows[k]);
  const axis=(positive,negative)=>Number(held(positive))-Number(held(negative));
  function tick(dt){
    yaw+=axis('j','l')*dt*1.65;pitch=T.MathUtils.clamp(pitch+axis('i','k')*dt*1.3,-1.38,1.38);
    const right=axis('d','a'),forward=axis('w','s');
    const length=Math.max(1,Math.hypot(right,forward)),speed=height*.99/length;
    const ease=1-Math.exp(-dt*16);
    speedX+=((right*Math.cos(yaw)-forward*Math.sin(yaw))*speed-speedX)*ease;
    speedZ+=((-right*Math.sin(yaw)-forward*Math.cos(yaw))*speed-speedZ)*ease;
    const count=Math.max(1,Math.ceil(Math.hypot(speedX,speedZ)*dt/(radius*.45)));
    for(let i=0;i<count;i++){
      const dx=speedX*dt/count,dz=speedZ*dt/count;
      if(Math.abs(dx)+Math.abs(dz)<height*1e-7)break;
      if(!move(dx,dz)){if(dx)move(dx,0);if(dz)move(0,dz);}
    }
    eyeY=T.MathUtils.lerp(eyeY,foot.y+height,reduced()?1:1-Math.exp(-dt*18));
    camera.position.set(foot.x,eyeY,foot.z);camera.quaternion.setFromEuler(angles.set(pitch,yaw,0,'YXZ'));
    const ratio=aspect();
    if(camera.aspect!==ratio||camera.fov!==66||camera.near!==height*.025){
      camera.aspect=ratio;camera.fov=66;camera.near=height*.025;camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
  }
  return {id,tick,clear,key(k,on){if(on)keys.add(k);else keys.delete(k);},
    relocate(origin,target,tilt=-.05){
      const next=place(origin);clear();foot.copy(next);eyeY=foot.y+height;
      yaw=Math.atan2(foot.x-target.x,foot.z-target.z);
      pitch=tilt??Math.atan2(target.y-eyeY,Math.hypot(target.x-foot.x,target.z-foot.z));tick(0);
    },
    look(dx,dy){yaw-=dx*.004;pitch=T.MathUtils.clamp(pitch-dy*.004,-1.38,1.38);},
    get state(){return {id,foot:foot.toArray(),height,yaw,pitch};}};
}
