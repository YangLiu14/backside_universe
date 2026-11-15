// The secondary houses of the heel open into walled courts off the tread grooves.
// Sizes are in outsole coordinates, with local +Z facing the cross lane.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function districtHeight(row,side,col,tower,h) {
  // Low workshops give way to the first shophouse flats at the arch.
  // Front rows of the tower quarter step down toward the public street.
  if(!tower&&row===3)return h*(col===1?1.23:1.06);
  if(!tower&&row===4)return h*(side===-1||col===1?1.48:1.17);
  if(tower&&row>=7&&col===0)return h*(side===1?.72:.85);
  return h;
}

export function courtDepth(row,side,col) {
  if(col!==1||row<1||row>4)return 0;
  return (side>0?[.044,.055,.040,.048]:[.051,.040,.052,.041])[row-1];
}

// Beyond the last rows of apartments the avenue becomes a narrower lane.
// Each existing scan keeps its real proportions: doorways, tiles and upper
// balconies appear at three separate depths even when viewed from the bridge.
export function streetEndHouses(pool,place,blocks) {
  const houses=[
    // Role, address, x, z, native isotropic scale, angle from local +Z.
    ['flat-gallery','后街外廊',.130,.843,.122,174],
    ['shop-tailor','巷尾木作门楼',-.105,.850,.071,110],
    ['shop-tea','转巷茶楼',.026,.908,.075,199],
    ['shop-porcelain','背街瓦屋',-.106,.928,.058,171],
    ['flat-gallery','茶楼后进',.011,.970,.083,178],
    ['shop-greens','窑弄东厢',.112,.929,.064,203],
  ];
  for(const [role,name,x,z,factor,degrees] of houses){
    const source=pool[role];if(!source)continue;
    const mesh=source.clone(),lot=new T.Group();
    const [w,h,d]=source.userData.nativeSize.map(size=>size*factor);
    mesh.rotation.y=T.MathUtils.degToRad(degrees);mesh.scale.set(w,h,d);
    lot.name=name;Object.assign(lot.userData,{feature:'courtyard',hi3dRole:role});
    lot.add(mesh);place(lot,x,z);
    // The two angled façades frame a narrow passage. An axis-aligned box
    // around their eaves would close its usable diagonal corners to walkers.
    blocks.push({x,z,w,d,cos:Math.cos(mesh.rotation.y),sin:Math.sin(mesh.rotation.y)});
  }
}

// Two spans follow the eaves and cross only the last part of the avenue.
// Coordinates run the way a lineman would string them, between ceramic heads
// on actual poles. Model their sag in 3D so it survives a turn into the lane.
export function endUtilityLine(materials,place,blocks){
  const poles=[[-.024,.604,.085],[.034,.819,.084],[-.013,.886,.082]];
  const group=new T.Group(),batch=masonryBatch(group);
  const v=(x,y,z)=>new T.Vector3(x,y,z), up=v(0,1,0);
  function member(a,b,topRadius,bottomRadius,material,sides){
    const axis=b.clone().sub(a);
    const g=new T.CylinderGeometry(topRadius,bottomRadius,axis.length(),sides);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up,axis.normalize()));
    const middle=a.clone().lerp(b,.5);g.translate(middle.x,middle.y,middle.z);batch.part(material,g);
  }
  for(const [x,z,height] of poles){
    member(v(x,0,z),v(x,height+.0025,z),.00092,.00148,materials.stone,10);
    batch.box(materials.iron,x,height-.0015,z,.018,.0010,.0014);
    blocks.push({x,z,w:.00296,d:.00296});
    for(const offset of [-.006,0,.006]){
      const px=x+offset;
      member(v(px,height-.0011,z),v(px,height+.00045,z),.00032,.00032,materials.iron,6);
      member(v(px,height+.00035,z),v(px,height+.0018,z),.00073,.00094,materials.teal,8);
      member(v(px,height+.00175,z),v(px,height+.0026,z),.00036,.00062,materials.teal,8);
    }
  }
  for(let i=1;i<poles.length;i++){
    const [ax,az,ay]=poles[i-1],[bx,bz,by]=poles[i];
    for(const offset of [-.006,0,.006]){
      const a=v(ax+offset,ay+.0025,az),b=v(bx+offset,by+.0025,bz);
      const span=b.clone().sub(a).length(),points=[];
      for(let j=0;j<=12;j++){
        const t=j/12,p=a.clone().lerp(b,t);
        p.y-=span*(.048+offset*.25)*4*t*(1-t);points.push(p);
      }
      const curve=new T.CatmullRomCurve3(points);
      batch.part(materials.iron,new T.TubeGeometry(curve,16,.00019,5,false));
    }
  }
  batch.finish();group.name='老街瓷瓶电杆与架空线';group.userData.feature='courtyard';
  // Anchor growth at its first pole, so that the lines cannot sweep in from
  // the middle of the shoe as their surrounding houses rise.
  group.children.forEach(o=>{o.position.z-=poles[0][1];});
  place(group,0,poles[0][1]);
}

function masonryBatch(group) {
  const batches=new Map();
  function part(material,g){
    if(!batches.has(material))batches.set(material,[]);
    batches.get(material).push(g);
  }
  function box(material,x,y,z,w,h,d){
    part(material,new T.BoxGeometry(w,h,d).translate(x,y,z));
  }
  function finish(){
    for(const [material,shapes] of batches){
      const mesh=new T.Mesh(mergeGeometries(shapes),material);mesh.name=material.name;
      group.add(mesh);shapes.forEach(g=>g.dispose());
    }
  }
  return {part,box,finish};
}

// Two terminal sprays sampled from the already registered Hi3D courtyard gate.
// Compact them once; every branch tip reuses the photographed normals, UVs,
// leaf outline and native scale. No camera-facing or opaque crown proxy.
const plantCuttings=new WeakMap();
function gateCuttings(gate) {
  if(plantCuttings.has(gate))return plantCuttings.get(gate);
  gate.updateWorldMatrix(true,true);
  let source;gate.traverse(o=>{if(o.isMesh&&!source)source=o;});
  const aligned=source.geometry.clone().applyMatrix4(source.matrixWorld);
  const pos=aligned.attributes.position, idx=aligned.index;
  const tips=[-1,1].map(side=>{
    const lookup=new Map(),indices=[],attrib={position:[],normal:[],uv:[]};
    for(let n=0;n<idx.count;n+=3){
      const a=idx.getX(n),b=idx.getX(n+1),c=idx.getX(n+2);
      const x=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
      const y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
      const z=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
      if(Math.abs(x-side*.4)>.102||y<.609||y>.725||z<.119)continue;
      for(const id of [a,b,c]){
        if(!lookup.has(id)){
          lookup.set(id,lookup.size);
          for(const [name,out] of Object.entries(attrib)){
            const att=aligned.attributes[name];out.push(att.getX(id),att.getY(id));
            if(att.itemSize===3)out.push(att.getZ(id));
          }
        }
        indices.push(lookup.get(id));
      }
    }
    const g=new T.BufferGeometry();g.setIndex(indices);
    for(const [key,values] of Object.entries(attrib))
      g.setAttribute(key,new T.Float32BufferAttribute(values,key==='uv'?2:3));
    // Undo the non-uniform fit of the gate; keep the native leaf proportions.
    const [gx,gy,gz]=gate.userData.nativeSize;g.scale(gx,gy,gz);
    g.computeBoundingBox();const b=g.boundingBox,mid=b.getCenter(new T.Vector3());
    const factor=1/(b.max.y-b.min.y);
    g.translate(-mid.x,-b.min.y,-mid.z);g.scale(factor,factor,factor);
    return g;
  });
  aligned.dispose();
  const skin=source.material.clone();skin.name='原小区门盆树叶片';skin.color.multiply(new T.Color(0xa5bd91));
  skin.side=T.DoubleSide;
  const palette={tips,skin};plantCuttings.set(gate,palette);return palette;
}

function plantTree(yard,gate,m,x,z,height,lean,seed){
  const {tips,skin}=gateCuttings(gate),twigs=masonryBatch(yard),leaves=[];
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  const v=(x,y,z)=>new T.Vector3(x,y,z);
  const point=(dx,h,dz)=>v(x+height*dx,height*h,z+height*dz);
  function branch(a,b,ra,rb){
    const dir=b.clone().sub(a);
    const g=new T.CylinderGeometry(rb,ra,dir.length(),ra>height*.010?8:5);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(v(0,1,0),dir.normalize()));
    const mid=a.clone().lerp(b,.5);twigs.part(m.dark,g.translate(mid.x,mid.y,mid.z));
  }
  const root=v(x,-.0045,z),elbow=point(-lean*.045,.31,.023),fork=point(lean*.055,.55,.032);
  // The lot datum is .0025 above the concrete, so bury the root below that
  // level. A slightly irregular tree pit and its stone curb explain the joint.
  const bed=new T.CylinderGeometry(.0069,.0069,.00085,12);
  twigs.part(m.dark,bed.translate(x,-.00204,z));
  for(let k=0;k<12;k++){
    const a=k*Math.PI/6, radius=.00735+Math.sin(3*a)*.00018;
    const curb=new T.BoxGeometry(.00372,.0012,.00105);
    curb.rotateY(a);curb.translate(x+Math.sin(a)*radius,-.00185,z+Math.cos(a)*radius);
    twigs.part(m.stone,curb);
  }
  branch(root,elbow,height*.018,height*.014);
  branch(elbow,fork,height*.014,height*.009);
  const tipCount=height>.102?12:10;
  for(let i=0;i<tipCount;i++){
    const azimuth=i*2.399+random()*.43,level=i/(tipCount-1);
    const reach=(.23+.08*random())*(1-.50*level);
    const origin=elbow.clone().lerp(fork,Math.min(1,level*1.72+.10));
    const shoulder=point(lean*.04+Math.cos(azimuth)*reach*.62,.51+.32*level+random()*.04,
      Math.sin(azimuth)*reach*.66);
    branch(origin,shoulder,height*(.009-.004*level),height*.0036);
    for(let n=0;n<5;n++){
      const angle=azimuth+(n-2)*.44+(random()-.5)*.28;
      const spread=(.07+.07*random())*height;
      const end=shoulder.clone().add(v(Math.cos(angle)*spread,height*(.045+.069*random()),Math.sin(angle)*spread));
      branch(shoulder,end,height*.0036,height*.0013);
      const leaf=tips[(n+i)%2].clone(),size=height*(.088+.062*random());
      leaf.scale(size,size,size);
      leaf.rotateZ((random()-.52)*1.25);leaf.rotateX((random()-.46)*1.22);
      leaf.rotateY(angle+random()*.8);leaf.translate(end.x,end.y,end.z);
      leaves.push(leaf);
    }
  }
  twigs.finish();
  const canopy=new T.Mesh(mergeGeometries(leaves),skin);
  canopy.name='原门边绿植叶簇的院角树冠';yard.add(canopy);leaves.forEach(g=>g.dispose());
}

export function rearCourt(materials,finishSet,gateSource,osmanthus,{boundsAt,width,depth,direction,inside,row,side,x,z,blocks}) {
  const yard=new T.Group();
  yard.name='里弄后院_'+row+'_'+(side>0?'东':'西');
  const {box,part,finish}=masonryBatch(yard),m=materials;
  function obstruction(lx,lz,w,d) {
    blocks.push({x:x+direction*lx,z:z+direction*lz,w,d});
  }
  const front=depth*.49,back=-depth*.5,pad=.0028;
  const gate=(side===1?.19:-.17)*width,opening=.026;
  const left=-width/2,right=width/2;
  const h=(row+Number(side>0))%3===0?.041:.032;
  function wall(a,b,z0,wallHeight){
    const span=b-a;
    box(m.plinth.brick,(a+b)/2,.004,z0,span,.009,.0034);
    box(finishSet.lime,(a+b)/2,wallHeight/2+.0034,z0,span,wallHeight-.0068,.003);
    box(m.slate,(a+b)/2,wallHeight+.001,z0,span+.001,.0022,.0049);
    obstruction((a+b)/2,z0,span,.0034);
  }
  wall(left,gate-opening/2,front,h);
  wall(gate+opening/2,right,front,h);
  const gateHead=Math.max(h+.008,.044);
  for(const gx of [gate-opening/2-.0014,gate+opening/2+.0014]){
    box(finishSet.slab,gx,gateHead/2,front,.0034,gateHead,.0046);
    box(m.dark,gx,gateHead-.0038,front,.0044,.002,.0062);
  }
  // A tiled hood above the gate and a separate, lower lean-to at the side.
  // Decking and fascia have thickness and the roll at the eave casts its own shadow.
  function canopy(cx,cz,w,d,high,low,skin) {
    const slope=Math.atan2(high-low,d),length=Math.hypot(d,high-low);
    const board=new T.BoxGeometry(w,.0014,length);
    const uv=board.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getY(i)*length/.046,uv.getX(i)*w/.045);
    part(skin,board.rotateX(slope).translate(cx,(high+low)/2,cz));
    box(m.dark,cx,low-.0012,cz+d/2-.0006,w,.002,.0016);
  }
  canopy(gate,front-.0017,opening+.011,.008,gateHead+.003,gateHead,m.slate);
  box(m.dark,gate,gateHead-.0012,front,opening+.004,.003,.003);
  box(finishSet.slab,gate,-.0004,front,opening,.0022,.0047);
  const wingSide=gate>0?-1:1, wingWidth=Math.min(width*.31,.030);
  const wingX=wingSide*(width/2-wingWidth/2);
  const wingRoof=(row+(side>0?1:0))%3===0?m.clay:m.slate;
  const wingD=depth*.68,wingZ=back+wingD/2;
  const low=.037+(row%2)*.002;
  canopy(wingX,wingZ,wingWidth+.002,wingD+.0028,low+.010,low,wingRoof);
  // Always close the outside of the court, including the section not occupied
  // by the washhouse. The opening on the town side remains a walkable return.
  const outerSide=-inside*direction;
  const edgeX=outerSide*(width/2-.0018);
  const returnH=h+(side===1?.006:.002);
  const returnDepth=depth+.019, returnZ=-.0095;
  box(m.plinth.brick,edgeX,.0045,returnZ,.0036,.009,returnDepth);
  box(finishSet.lime,edgeX,returnH/2+.004,returnZ,.0032,returnH-.008,returnDepth);
  box(m.slate,edgeX,returnH+.001,returnZ,.0054,.0023,returnDepth+.001);
  obstruction(edgeX,returnZ,.0036,returnDepth);
  // The Hi3D frontage is deliberately set back within its lot. Return into
  // its rear wall so the angled view through the gate ends on a real surface.
  const tieWidth=width*.30,tieX=edgeX-outerSide*tieWidth/2,tieZ=back-.016;
  box(finishSet.lime,tieX,returnH/2,tieZ,tieWidth,returnH,.004);
  box(m.slate,tieX,returnH+.001,tieZ,tieWidth+.001,.0022,.0055);
  obstruction(tieX,tieZ,tieWidth,.004);
  const wx=wingSide*(width/2-pad);
  if(wingSide!==outerSide){
    box(m.plinth.brick,wx,.016,wingZ,.0036,.032,wingD);
    box(finishSet.lime,wx,.033,wingZ,.003,.008,wingD);
    obstruction(wx,wingZ,.0036,wingD);
  }
  const postX=wingX-wingSide*(wingWidth/2-.002);
  for(const pz of [back+.003,back+wingD-.0017]){
    box(m.stone,postX,.0027,pz,.0042,.0054,.0042);
    box(m.dark,postX,low/2+.002,pz,.0028,low-.004,.0028);
    obstruction(postX,pz,.0038,.0038);
  }
  // The open side of the return gives a second route to the inter-house passage.
  // Put the linking eave over that strip; the jambs are within the two houses.
  const passageSide=inside*direction;
  const px=passageSide*(width/2+.006), pz=back-.014;
  canopy(px,pz,.024,.019,.050,.046,m.slate);
  box(m.dark,px,.044,pz+.007,.024,.0023,.0018);
  finish();
  // Measured pockets beside the rear wall. Their trunks stay clear of the
  // lane-side door and their spreading tips remain inside the shoe outline.
  const height=(row===1&&side===1)?.106:(row===2&&side===-1)?.090:
    (row===3&&side===1)?.115:(row===4&&side===-1)?.097:0;
  if(height){
    // The spreading east-yard cutting reaches the curved edge at its outer tip.
    // Move its root and its collision footprint together into the yard.
    const setback=!osmanthus&&row===3&&side===1?.004:0;
    const tx=-wingSide*(width/2-.017)-direction*side*setback,tz=front-.016;
    if(osmanthus){
      const tree=osmanthus.clone(),native=tree.userData.nativeSize;
      // Restore the Hi3D model's native proportions and turn each tree toward
      // its own yard. The normalized mesh starts at the bottom of its stone bed.
      tree.rotation.y=side*.81+row*1.47;
      tree.scale.fromArray(native);
      const crown=new T.Box3().setFromObject(tree,true);
      const maxScale=height/native[1],xc=x+direction*tx,zc=z+direction*tz;
      // Keep all of the crown inside the tapered outsole. Look across the full
      // depth of the tree rather than sampling the rubber edge at its trunk.
      const left=direction>0?-crown.min.x:crown.max.x,right=direction>0?crown.max.x:-crown.min.x;
      let fit=maxScale;
      for(const t of [0,.25,.5,.75,1]){
        const dz=T.MathUtils.lerp(crown.min.z,crown.max.z,t);
        const [lo,hi]=boundsAt(zc+direction*dz*maxScale);
        fit=Math.min(fit,(xc-lo-.003)/left,(hi-xc-.003)/right);
      }
      tree.scale.multiplyScalar(fit);
      tree.position.set(tx,-.00265,tz);
      tree.name='院内桂花树与石围_'+row+'_'+side;
      tree.userData.hi3dRole='courtyard-osmanthus';
      yard.add(tree);
    }else{
      plantTree(yard,gateSource,m,tx,tz,height,passageSide,521+row*169+side*17);
    }
    // The flush stone surround is walkable; the solid trunk is the obstacle.
    obstruction(tx,tz,height*.038,height*.038);
  }
  yard.rotation.y=direction===1?0:Math.PI;
  return yard;
}

// Survey every cross-lane end against the fitted shoe. The terminal wall follows
// its curved rim, beyond the last occupied plot, instead of shortening the lane.
export function laneEnd(m,finishSet,boundsAt,blocks,center,side,index) {
  const group=new T.Group();
  const type=(index+(side>0?2:0))%5;
  group.name=['沿巷人字山墙','木作院门','街坊晾台','青砖阶梯墙','后巷粉墙'][type]+'_'+index+'_'+(side>0?'东':'西');
  group.userData.feature='courtyard';
  const {box,part,finish}=masonryBatch(group);
  const rim=dz=>boundsAt(center+dz)[side>0?1:0];
  const baseX=rim(0)-side*.008;
  const span=[.106,.098,.112,.098,.106][type];
  const depth=.004;
  const height=[.067,.053,.069,.059,.052][type];
  const head=(dz)=>{
    const u=Math.abs(dz)/(span/2);
    if(type===0)return height+.021*(1-u);
    if(type===3)return height+(u<.38?.024:u<.72?.012:0);
    return height;
  };
  const edge=dz=>rim(dz)-side*.0075-baseX;
  const doorZ=(index%2?1:-1)*.012;
  const access=type===1||type===4;
  const openings=access?[{z:doorZ,width:type===1?.027:.020,bottom:.003,top:.040}]:[];
  if(type===0||type===2){
    const rows=type===0?[.044]:[.024,.048];
    for(const bottom of rows)for(const dz of (type===0?[-.015,.015]:[-.023,.004,.024])){
      openings.push({z:dz,width:type===0?.010:.014,bottom,top:bottom+(type===0?.012:.014)});
    }
  }
  const coarse=Array.from({length:9},(_,i)=>span*(i/8-.5));
  const cuts=[...new Set([...coarse,...openings.flatMap(o=>[o.z-o.width/2,o.z+o.width/2])])].sort((a,b)=>a-b);
  // Split the full wall at its jambs, not at its panes. Each opening has two
  // returns, a reveal and a shaded setback that can be seen while sidestepping.
  const foot=type===2?.007:access?.009:.013;
  for(let i=1;i<cuts.length;i++){
    const z0=cuts[i-1],z1=cuts[i],zmid=(z0+z1)/2;
    const x0=edge(z0),x1=edge(z1),midX=(x0+x1)/2;
    const slope=Math.atan2(x1-x0,z1-z0),length=Math.hypot(x1-x0,z1-z0);
    const top=head(zmid);
    const wall=type===3||type===0&&index%2===0?m.plinth.brick:finishSet.lime;
    function strip(mat,low,high,w){
      if(high-low<.00001)return;
      const y=(low+high)/2,h=high-low;
      const g=new T.BoxGeometry(w,h,length+.000035);
      const uv=g.attributes.uv,pos=g.attributes.position;
      for(let n=0;n<uv.count;n++)if(Math.abs(g.attributes.normal.getX(n))>.99){
        const physicalZ=zmid+pos.getZ(n);
        uv.setXY(n,physicalZ/(mat===finishSet.lime?.118:.068)+index*.27,
          mat===finishSet.lime?(y+pos.getY(n))/(top+.002):(y+pos.getY(n))/.051);
      }
      part(mat,g.rotateY(slope).translate(midX,y,zmid));
    }
    const breaks=openings.filter(o=>Math.abs(o.z-zmid)<o.width/2);
    let base=0;
    function masonry(low,high){
      strip(m.plinth.brick,low,Math.min(high,foot),depth+.0003);
      strip(wall,Math.max(low,foot),high,depth);
    }
    for(const opening of breaks){masonry(base,opening.bottom);base=opening.top;}
    masonry(base,top);
    strip(type===0||type===3?m.clay:m.slate,top,top+.0022,.0064);
    blocks.push({x:baseX+midX,z:center+zmid,w:depth+Math.abs(x1-x0),d:z1-z0});
  }
  for(const {z,width,bottom,top} of openings){
    const h=top-bottom,y=(bottom+top)/2;
    const angle=Math.atan2(edge(z+width/2)-edge(z-width/2),width);
    const xf=edge(z), recess=.0029;
    function fitting(mat,inset,cy,across,w,height,dz){
      const g=new T.BoxGeometry(w,height,dz);
      g.translate(side*inset,cy,across).rotateY(angle).translate(xf,0,z);
      part(mat,g);
    }
    if(access){
      fitting(finishSet.dark,recess,y,0,.001,h+.001,width+.0013);
      for(let i=0;i<6;i++){
        const offset=width*((i+.5)/6-.5);
        fitting(type===1?m.dark:finishSet.green,recess-.0006,y,offset,.0008,h,width/6-.00025);
      }
      for(const sign of [-1,1]){
        fitting(finishSet.slab,-.001,.022,sign*(width/2+.0011),.006,.043,.0027);
        fitting(finishSet.iron,.0014,top*.53,sign*.0018,.0013,.0021,.0016);
      }
      fitting(m.slate,-.0023,top+.0033,0,type===1?.012:.008,.0027,width+.009);
      fitting(finishSet.slab,-.002,.0015,0,.010,.003,width+.005);
    }else{
      fitting(finishSet.dark,recess+.0005,y,0,.0016,h+.001,width+.0014);
      fitting(type===0?m.iron:m.glass,recess-.00015,y,0,.0007,h,width);
      fitting(finishSet.iron,.001,y,0,.0012,h,.0007);
      if(type===2)fitting(finishSet.green,.0006,y+.001,0,.0013,.0008,width+.001);
      fitting(finishSet.slab,-.002,bottom-.001,0,.006,.0019,width+.004);
      fitting(finishSet.iron,-.001,top+.0007,0,.005,.0011,width+.003);
    }
  }
  finish();group.position.set(baseX,.0025,center);
  return group;
}
