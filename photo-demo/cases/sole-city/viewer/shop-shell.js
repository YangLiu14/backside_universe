// Refit the original shop bays while retaining their masonry and metal frames.
// Interpolate attributes across each cut in the Hi3D triangle mesh.
import * as T from 'three';
import {firstStorey,corniceHull} from './architecture.js';

function compact(source,indices){
  const old=source.attributes, positions=[], normals=[], uvs=[], out=[],lookup=new Map();
  for(const index of indices){
    if(!lookup.has(index)){
      const x=old.position.getX(index),y=old.position.getY(index),z=old.position.getZ(index);
      lookup.set(index,positions.length/3);positions.push(x,y,z);
      normals.push(old.normal.getX(index),old.normal.getY(index),old.normal.getZ(index));
      uvs.push(old.uv.getX(index),old.uv.getY(index));
    }
    out.push(lookup.get(index));
  }
  const g=new T.BufferGeometry();g.setIndex(out);
  for(const [k,a,n] of [['position',positions,3],['normal',normals,3],['uv',uvs,2]])g.setAttribute(k,new T.Float32BufferAttribute(a,n));
  return g;
}
// Side glass and its baked shop interior occupy this rectangular reveal on the
// Hi3D shell. Retain the scanned masonry and the nearby planter. Split crossing
// triangles at all four edges so the jamb never shows a triangular tear.
function openSideWindow(ground){
  const {position,normal,uv}=ground.attributes, p=[],n=[],tex=[];
  const read=i=>[position.getX(i),position.getY(i),position.getZ(i),normal.getX(i),normal.getY(i),normal.getZ(i),uv.getX(i),uv.getY(i)];
  const emit=polygon=>{
    for(let j=1;j+1<polygon.length;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]]){
      p.push(...v.slice(0,3));n.push(...v.slice(3,6));tex.push(v[6],v[7]);
    }
  };
  const limits=[[0,-.445,1],[0,-.286,-1],[1,.168,1],[1,.343,-1],[2,-.102,1],[2,.057,-1]];
  for(let j=0;j<position.count;j+=3){
    let poly=[read(j),read(j+1),read(j+2)];
    if(limits.some(([axis,edge,sign])=>poly.every(v=>(v[axis]-edge)*sign<0))){emit(poly);continue;}
    for(const [axis,edge,sign] of limits){
      const inside=[],outside=[];
      for(let k=0;k<poly.length;k++){
        const a=poly[k],b=poly[(k+1)%poly.length],da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;
        (da>=0?inside:outside).push(a);
        if((da>=0)!==(db>=0)){
          const f=da/(da-db),intersect=a.map((v,i)=>v+(b[i]-v)*f);
          inside.push(intersect);outside.push(intersect);
        }
      }
      emit(outside);poly=inside;if(poly.length<3)break;
    }
  }
  const g=new T.BufferGeometry();
  for(const [name,data,size] of [['position',p,3],['normal',n,3],['uv',tex,2]])g.setAttribute(name,new T.Float32BufferAttribute(data,size));
  return g;
}
function shopCornice(points){
  const shape=new T.Shape(corniceHull(points).map(([x,z])=>new T.Vector2(x,-z)));
  const g=new T.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false,curveSegments:1});
  g.rotateX(-Math.PI/2);g.translate(0,.454,0);
  const mat=new T.MeshStandardMaterial({name:'首层水泥压边',color:0x8b8271,roughness:.86});
  return new T.Mesh(g,mat);
}
export function fittedShell(model){
  model.updateMatrixWorld(true);
  let surface;model.traverse(o=>{if(o.isMesh)surface=o;});
  const geometry=surface.geometry.clone().applyMatrix4(surface.matrixWorld);
  const probe=new T.Mesh(geometry,surface.material),caster=new T.Raycaster(),sampleCache=new Map();
  function depth(x,y){
    const key=x.toFixed(5)+'/'+y.toFixed(5);
    if(!sampleCache.has(key)){
      caster.set(new T.Vector3(x,y,.85),new T.Vector3(0,0,-1));
      const hit=caster.intersectObject(probe)[0];sampleCache.set(key,hit?.point.z??null);
    }
    return sampleCache.get(key);
  }
  const pos=geometry.attributes.position,idx=geometry.index.array,lists=[[],[],[],[],[]];
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i],b=idx[i+1],c=idx[i+2],u=.5+(pos.getX(a)+pos.getX(b)+pos.getX(c))/3,
      y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3,z=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
    let part=0;
    if(u>.114&&u<.387&&y>.014&&y<.132&&z>-.193)part=4;
    else if(u>.466&&u<.928&&y>.267+.064*(u-.466)&&y<.386+.087*(u-.466)&&z>.246-.25*(u-.466))part=3;
    else if(u>.491&&u<.895&&y>.076&&y<.273+.019*(u-.49)&&z>-.15&&z<.235&&!(u>.749&&u<.762))part=2;
    else if(u>.125&&u<.381&&y>.070&&y<.278&&z>-.16&&z<.129&&!(u>.224&&u<.232))part=1;
    lists[part].push(a,b,c);
  }
  const body=new T.Mesh(compact(geometry,lists[0]),surface.material);body.name='原楼砖墙窗框与胎块屋顶';
  const fabric=compact(geometry,lists[3]);
  const cycle=new T.Mesh(compact(geometry,lists[4]),surface.material);cycle.name='修车铺的旧单车';
  const cut=[],ground=new T.Group();
  const trimmed=firstStorey(body.geometry,cut,.454);
  const groundWall=new T.Mesh(openSideWindow(trimmed),body.material);
  groundWall.name='原砖墙与窗洞';ground.add(groundWall,shopCornice(cut));trimmed.dispose();
  ground.name='原店面与铺顶压边';
  return {body,ground,fabric,cycle,depth};
}
