// Dimensions in the same local units as the shoe. Both the mesh and the walk
// controller use these dimensions; no scaling of an assembled staircase.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {bridgeFinishes} from './bridge-paint.js';

export function footbridgePlan(x,z){
  const width=.028,span=.055,run=.109,rise=.052,steps=16,toe=span+run,landing=.012;
  const rim=width/2,body=.0028,clear=rim-body,rail=.018;
  const slope=u=>rise*T.MathUtils.clamp((toe-Math.abs(u))/run,0,1);
  const piers=[-span+.004,span-.004];
  const height=(x)=>slope(x-plan.x);
  function support(px,pz,above){
    const u=Math.abs(px-x), v=Math.abs(pz-z);
    if(above){
      if(u>=toe && (u>=toe+landing || v>clear))return 'street';
      if(v>clear)return null;
      return 'bridge';
    }
    if(u>toe+landing||v>rim+body)return 'street';
    if(u>=toe-run/steps && v<=clear)return 'bridge';
    if(u>=toe)return 'street';
    if(piers.some(p=>Math.abs(Math.abs(p)-u)<.005 && Math.abs(v-(rim-.0018))<.005))return null;
    // Below midspan there is headroom. At each lower flight, the stringers
    // and underside block sideways entry before the walker's head would clip.
    return slope(u)-.006 > .035?'street':null;
  }
  const plan={x,z,width,span,run,rise,steps,toe,landing,rail,height,support,
    westEntry:new T.Vector3(x-toe-landing-.010,.033,z)};
  return plan;
}

async function treadMaterial(){
  const c=document.createElement('canvas');c.width=128;c.height=64;
  const ctx=c.getContext('2d'),p=ctx.createImageData(128,64);
  let s=37;
  for(let i=0;i<p.data.length;i+=4){
    s=(Math.imul(1664525,s)+1013904223)>>>0;
    const n=(s/4294967296-.5)*25;
    p.data.set([171+n,158+n,132+n,255],i);
  }
  ctx.putImageData(p,0,0);const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
  const normal=await new T.TextureLoader().loadAsync('./cement-normal.jpg');
  normal.wrapS=normal.wrapT=T.RepeatWrapping;normal.anisotropy=8;
  return new T.MeshStandardMaterial({name:'预制水泥踏步',map,normalMap:normal,normalScale:new T.Vector2(.21,.21),roughness:.88});
}

// Refit the original Hi3D ironwork as two thin ornamental panels outside
// the level span. The handrails, landings and load-bearing frame have exact
// dimensions and the original jagged stairs are removed.
function originalPanels(group,source,p){
  if(!source)return;
  source.updateWorldMatrix(true,true);
  let shell;source.traverse(o=>{if(o.isMesh)shell=o;});if(!shell)return;
  const g=shell.geometry.clone().applyMatrix4(shell.matrixWorld);
  const pos=g.attributes.position,uv=g.attributes.uv;
  const out=[],tex=[],index=g.index;
  const samples=[];
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i);
    if(Math.abs(x)<.22&&y>.73)samples.push([x,pos.getZ(i)]);
  }
  if(!samples.length){g.dispose();return;}
  const avg=(f)=>samples.reduce((a,v)=>a+f(...v),0)/samples.length;
  const x0=avg(x=>x),z0=avg((x,z)=>z),k=avg((x,z)=>(x-x0)*(z-z0))/avg(x=>(x-x0)**2);
  function side(x,z){return z-z0-k*(x-x0);}
  for(let i=0;i<(index?.count??pos.count);i+=3){
    const tri=[0,1,2].map(j=>index?index.getX(i+j):i+j);
    if(!tri.every(j=>Math.abs(pos.getX(j))<.219&&pos.getY(j)>.737&&side(pos.getX(j),pos.getZ(j))>.014))continue;
    for(const j of tri){
      const x=pos.getX(j),y=pos.getY(j),z=pos.getZ(j);
      out.push(x/.22*(p.span-.002),p.rise+.002+(y-.737)/.263*(p.rail-.004),side(x,z)*.003);
      tex.push(uv.getX(j),uv.getY(j));
    }
  }
  g.dispose();if(!out.length)return;
  const panel=new T.BufferGeometry();panel.setAttribute('position',new T.Float32BufferAttribute(out,3));panel.setAttribute('uv',new T.Float32BufferAttribute(tex,2));panel.computeVertexNormals();
  const paint=shell.material.clone();paint.side=T.DoubleSide;
  for(const side of [-1,1]){
    const mesh=new T.Mesh(panel,paint);mesh.name='原天桥蓝漆花栏';mesh.position.z=side*(p.width/2+.0007);mesh.scale.z=side;group.add(mesh);
  }
}

export async function makeFootbridge(source,p){
  const group=new T.Group(),parts=new Map();
  const finish=(color,roughness,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
  const stone=await treadMaterial(),steel=finish(0x527d80,.63),light=finish(0x839a97,.40,.24),iron=finish(0x494e49,.71,.54),nosings=finish(0xb9ad86,.83);
  const box=new T.BoxGeometry(),rod=new T.CylinderGeometry(1,1,1,8);
  const matrix=new T.Matrix4(),up=new T.Vector3(0,1,0),rot=new T.Quaternion();
  function add(material,shape,position,scale,rotation=new T.Quaternion()){
    const g=shape.clone().applyMatrix4(matrix.compose(position,rotation,scale));
    if(!parts.has(material))parts.set(material,[]);parts.get(material).push(g);
  }
  const v=(x,y,z)=>new T.Vector3(x,y,z);
  function slab(mat,x,y,z,w,h,d){add(mat,box,v(x,y,z),v(w,h,d));}
  function member(mat,a,b,r,shape=rod,depth=r){
    const dir=b.clone().sub(a);rot.setFromUnitVectors(up,dir.clone().normalize());
    add(mat,shape,a.clone().lerp(b,.5),v(r,dir.length(),depth),rot);
  }
  const {width,span,run,rise,steps,toe,landing,rail}=p,stepRun=run/steps,stepRise=rise/steps;
  const deck=.0035,lip=.00028,half=width/2;
  // Top surfaces start at the pavement. Each riser meets the next solid tread.
  slab(stone,0,rise-deck/2,0,span*2,deck,width);
  // Exposed steel below the concrete landing: two flanged longitudinal girders
  // tied by lateral diaphragms. Keep the lower flanges above pedestrian headroom.
  for(const side of [-1,1]){
    const z=side*width*.29;
    slab(steel,0,rise-.0060,z,span*2,.0056,.00073);
    slab(light,0,rise-.0088,z,span*2,.0008,.00275);
    for(const x of [-.043,-.021,0,.021,.043]){
      slab(steel,x,rise-.0061,z,.00069,.0044,.0026);
    }
  }
  for(const x of [-.043,-.021,0,.021,.043]){
    slab(steel,x,rise-.0052,0,.00068,.0034,width*.58);
    slab(steel,x,rise-.0068,0,.00185,.00048,width*.58);
  }
  for(const sign of [-1,1]){
    slab(stone,sign*(toe+landing/2),-.00004,0,landing,.00032,width);
    for(let i=0;i<steps;i++){
      const x=sign*(toe-(i+.5)*stepRun),h=(i+1)*stepRise;
      slab(stone,x,h-(stepRise+deck)/2,0,stepRun,stepRise+deck,width);
      slab(nosings,x+sign*(stepRun/2-.00043),h+lip/2,0,.00082,lip,width-.002);
    }
    for(const side of [-1,1]){
      const z=side*(half-.00065);
      member(steel,v(sign*toe,-.001,z),v(sign*span,rise-.001,z),.0035,box,.0018);
      for(const level of [.48,1]){
        const y=rail*level,r=level===1?.00086:.00055;
        member(level===1?light:steel,v(sign*(toe+landing*.65),y,z),v(sign*toe,y,z),r);
        member(level===1?light:steel,v(sign*toe,y,z),v(sign*span,rise+y,z),r);
      }
      for(let i=0;i<=steps;i++){
        const x=sign*(toe-i*stepRun),h=i*stepRise;
        member(steel,v(x,h,z),v(x,h+rail,z),i%4===0?.00071:.00032);
      }
      const postX=sign*(span-.004);
      slab(iron,postX,.0013,z,.0055,.0026,.0045);
      slab(steel,postX,(rise-deck)/2,z,.0046,rise-deck,.0036);
      slab(steel,postX,rise-.0093,z,.008,.0013,.0057);
    }
  }
  for(const side of [-1,1]){
    const z=side*(half-.00065);
    slab(steel,0,rise-.002,z,span*2,.005,.0023);
    for(const level of [.48,1])member(level===1?light:steel,v(-span,rise+rail*level,z),v(span,rise+rail*level,z),level===1?.00086:.00048);
    for(let i=1;i<12;i++)member(steel,v(-span+i*span/6,rise,z),v(-span+i*span/6,rise+rail,z),i%3===0?.00072:.0004);
  }
  const labels=['踏步与平台','蓝钢梁架','圆钢扶手','柱脚','踏步前缘'];
  const mats=[stone,steel,light,iron,nosings];
  const weather=bridgeFinishes();
  for(const [mat,geoms] of parts){
    const mesh=new T.Mesh(mergeGeometries(geoms),mat);mesh.name=labels[mats.indexOf(mat)];group.add(mesh);
    if(mat===steel||mat===light||mat===iron)weather(mesh,mat===light?'handrail':'structure');
    for(const g of geoms)g.dispose();
  }
  box.dispose();rod.dispose();originalPanels(group,source,p);return group;
}
