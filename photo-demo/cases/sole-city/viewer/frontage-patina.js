// Local finishes for the three existing Hi3D scans at the bridge. Positions
// below are unit-box coordinates measured on each scan before street placement.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const textureLoader=new T.TextureLoader();
function colorMap(path){
  const map=textureLoader.load(path);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;return map;
}
let oxide;
function fittings(){
  if(oxide)return oxide;
  const grain=colorMap('./shop-metal-grain.jpg');
  grain.wrapS=grain.wrapT=T.RepeatWrapping;
  const material=(name,color,roughness,metalness)=>new T.MeshStandardMaterial({name,color,map:grain,roughness,metalness});
  oxide={
    zinc:material('风化镀锌落水件',0x90978d,.72,.46),
    iron:material('固定片与旧套箍',0x565648,.67,.48),
    stone:material('踏磨条石',0xa7a698,.89,0),
    cord:material('系棚的旧棉绳',0xb4aa8a,.94,0)
  };return oxide;
}
function random(seed){
  return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}
function canvasSurface(name,w,h,draw){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  draw(c.getContext('2d'),w,h);
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
  return new T.MeshStandardMaterial({name,map,roughness:.88,transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
}
function wornLetters(name,text,ink,seed){
  return canvasSurface(name,640,144,(g,w,h)=>{
    const rng=random(seed);
    g.fillStyle=ink;g.textAlign='center';g.textBaseline='middle';
    g.font='700 101px "STKaiti","Kaiti SC","Songti SC",serif';
    [...text].forEach((c,i)=>{g.fillText(c,w*(i+.5)/text.length,h*.54,w/text.length*.88);});
    g.globalCompositeOperation='destination-out';
    for(let i=0;i<2750;i++){
      g.fillStyle='rgba(0,0,0,'+(.28+.67*rng())+')';
      g.fillRect(w*rng(),h*rng(),.9+4*rng(),.6+2*rng());
    }
    for(let i=0;i<135;i++){
      g.fillStyle='rgba(0,0,0,.28)';g.fillRect(w*rng(),h*rng(),2+11*rng(),1);
    }
  });
}
function exteriorScan(model){
  model.updateWorldMatrix(true,true);
  let lod;model.traverse(o=>{if(o.isLOD)lod=o;});
  let mesh; (lod?lod.levels[0].object:model).traverse(o=>{if(!mesh&&o.isMesh)mesh=o;});
  return mesh;
}
// The decal inherits triangles from the original stone/canvas, including its
// sag or battered edge. Clip crossings to the image rectangle in surface UV.
function project(scan,parent,name,material,front,rect,offset=.00065){
  const [x0,x1,y0,y1,d0,d1]=rect;
  const g=scan.geometry,a=g.attributes.position,index=g.index;
  const pos=a.clone().applyMatrix4(scan.matrixWorld);
  const out=[],uv=[];const count=index?index.count:a.count;
  const u=i=>front?pos.getX(i):-pos.getZ(i),d=i=>front?pos.getZ(i):pos.getX(i);
  function clip(poly,axis,limit,dir){
    const kept=[];let A=poly.at(-1);
    for(const B of poly){
      const da=(A[axis]-limit)*dir,db=(B[axis]-limit)*dir;
      if((da<0)!==(db<0)){const k=da/(da-db);kept.push(A.map((v,i)=>v+(B[i]-v)*k));}
      if(db>=0)kept.push(B);
      A=B;
    }return kept;
  }
  for(let j=0;j<count;j+=3){
    const i=index?index.getX(j):j,b=index?index.getX(j+1):j+1,c=index?index.getX(j+2):j+2;
    if(Math.max(d(i),d(b),d(c))<d0||Math.min(d(i),d(b),d(c))>d1)continue;
    const ua=u(i),ub=u(b),uc=u(c),ya=pos.getY(i),yb=pos.getY(b),yc=pos.getY(c);
    if(Math.max(ua,ub,uc)<=x0||Math.min(ua,ub,uc)>=x1||Math.max(ya,yb,yc)<=y0||Math.min(ya,yb,yc)>=y1)continue;
    if((ub-ua)*(yc-ya)-(uc-ua)*(yb-ya)<=1e-11)continue;
    let poly=[[ua,ya,d(i)],[ub,yb,d(b)],[uc,yc,d(c)]];
    for(const [axis,v,sign] of [[0,x0,1],[0,x1,-1],[1,y0,1],[1,y1,-1],[2,d0,1],[2,d1,-1]]){
      if(!poly.length)break;poly=clip(poly,axis,v,sign);
    }
    for(let k=1;k<poly.length-1;k++)for(const [s,t,z] of [poly[0],poly[k],poly[k+1]]){
      if(front)out.push(s,t,z+offset);else out.push(z+offset,t,-s);
      uv.push((s-x0)/(x1-x0),(t-y0)/(y1-y0));
    }
  }
  if(!out.length)return;
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(out,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
  const m=new T.Mesh(geo,material);m.name=name;m.renderOrder=1;parent.add(m);
}
// Join the downpipe, ferrules and brackets by finish to keep the detailed street cheap to draw.
function metalwork(group){
  const groups=new Map(),point=(x,y,z)=>new T.Vector3(x,y,z);
  function add(shape,material){
    if(!groups.has(material))groups.set(material,[]);groups.get(material).push(shape);
  }
  function pipe(m,p,q,r,segments=12,r2=r){
    const a=point(...p),b=point(...q),d=b.clone().sub(a);
    const g=new T.CylinderGeometry(r2,r,d.length(),segments);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(point(0,1,0),d.normalize())).translate(...a.lerp(b,.5).toArray());add(g,m);
  }
  function box(material,x,y,z,w,h,d){
    add(new T.BoxGeometry(w,h,d).translate(x,y,z),material);
  }
  function finish(){
    for(const [m,all] of groups){const g=mergeGeometries(all);const item=new T.Mesh(g,m);item.name=m.name;group.add(item);all.forEach(a=>a.dispose());}
  }
  return {pipe,box,finish};
}
function stoneStep(parts,x,half,z,yTop,worn){
  // A tapered front edge with a low spot at the repeatedly used end.
  const p=[],idx=[];const zs=[z-.006,z+.019,z+.027,z+.027],heights=[yTop,yTop-.001,yTop-.005,-.008];
  for(let i=0;i<=16;i++)for(let n=0;n<4;n++){
    const xx=x-half+2*half*i/16;
    const lost=.0035*Math.exp(-(((xx-worn)/.055)**2))*(n===1||n===2?1:0);
    p.push(xx,heights[n]-lost,zs[n]+.0007*Math.sin(i*2.39));
    if(i<16&&n<3){const a=4*i+n;idx.push(a,a+1,a+4,a+1,a+5,a+4);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();
  const uv=[];for(let i=0;i<p.length;i+=3)uv.push(p[i]*7,(p[i+1]+p[i+2])*12);
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  const m=new T.Mesh(g,fittings().stone);m.name='门边低处磨圆的石踏步';parts.add(m);
}
export function finishAlleyFrontage(model,role){
  const scan=exteriorScan(model),g=new T.Group(),p=metalwork(g),m=fittings();
  if(role==='bridge-corner-shop'){
    g.name='五金铺门楣和檐沟';
    project(scan,g,'原水泥门额上的褪色漆字',wornLetters('旧褐红门楣漆','五金修配','#715345',526),true,
      [-.115,.085,.411,.455,.398,.426]);
    stoneStep(g,-.248,.093,.403,.019,-.255);
    // The sheet-metal gutter sits just below the scanned leading edge of the metal awning.
    p.pipe(m.zinc,[-.422,.464,.488],[.424,.460,.488],.0062,14);
    for(const x of [-.28,-.075,.138,.326]){
      p.pipe(m.iron,[x,.469,.488],[x,.457,.480],.0030,8);
      p.pipe(m.iron,[x,.457,.480],[x,.467,.458],.0024,8);
    }
    p.pipe(m.zinc,[.373,.456,.485],[.373,.430,.485],.008,12);
    p.pipe(m.zinc,[.373,.430,.485],[.373,.401,.416],.007,12);
    p.pipe(m.zinc,[.373,.401,.416],[.373,.070,.416],.007,14);
    p.pipe(m.zinc,[.373,.070,.416],[.373,.049,.444],.007,12);
    for(const y of [.116,.248,.373]){
      p.box(m.iron,.373,y,.407,.029,.005,.012);
      p.pipe(m.iron,[.373,y-.003,.416],[.373,y+.003,.416],.0086,12);
    }
  }else{
    g.name='粮油铺卷帘与巷侧山墙';
    project(scan,g,'旧遮布上手写的货名',wornLetters('褪墨棉篷字','大米 粮油','#755840',736),true,
      [-.265,.265,.655,.702,.439,.49],.0013);
    const repair=new T.MeshStandardMaterial({name:'剥落石灰露出的江南青红砖与旧砂浆',map:colorMap('./grain-gable-repair.png'),
      roughness:.94,transparent:true,alphaTest:.025,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
    project(scan,g,'支巷山墙剥蚀的灰泥与砖',repair,false,
      [154/1024-.5,570/1024-.5,1-1004/1024,1-492/1024,.435,.47],.00045);
    const damp=new T.MeshStandardMaterial({name:'粮铺后墙的返潮和雨痕',map:colorMap('./grain-alley-damp.png'),
      roughness:.86,transparent:true,depthWrite:false,alphaTest:.018});
    const tide=new T.Mesh(new T.PlaneGeometry(.89,.735),damp);
    tide.name='巷内后墙旧水位盐痕';tide.rotation.y=Math.PI;tide.position.set(0,.371,-.431);g.add(tide);
    const pipeX=-.285;
    p.pipe(m.zinc,[-.435,.737,-.478],[.429,.732,-.476],.0078,12);
    p.pipe(m.zinc,[pipeX,.731,-.479],[pipeX,.689,-.479],.0092,12);
    p.pipe(m.zinc,[pipeX,.689,-.479],[pipeX,.651,-.450],.0092,12);
    p.pipe(m.zinc,[pipeX,.651,-.45],[pipeX,.073,-.45],.0092,14);
    p.pipe(m.zinc,[pipeX,.073,-.45],[pipeX,.052,-.478],.0092,12);
    for(const y of [.153,.374,.612]){
      p.box(m.iron,pipeX,y,-.438,.034,.007,.024);
      p.pipe(m.iron,[pipeX,y-.004,-.451],[pipeX,y+.004,-.451],.011,12);
    }
    // The eave over the rear wall has exposed clips as it turns down into the alley.
    for(const x of [-.393,-.18,.02,.21,.36])
      p.pipe(m.iron,[x,.740,-.459],[x,.730,-.479],.0037,8);
    stoneStep(g,.170,.185,.467,.035,.18);
    // Narrow sliding guides terminate at the sill, with a folded bottom bar in the open shutter.
    for(const x of [-.352,.353])p.box(m.iron,x,.306,.398,.008,.384,.008);
    p.box(m.zinc,0,.497,.392,.70,.005,.009);
    // Let the side-facing gable read at eye level on the lane. A galvanized rain leader
    // follows the alley-side timber post, anchored just under the last tile.
    p.pipe(m.zinc,[.459,.737,.405],[.467,.705,.421],.009);
    p.pipe(m.zinc,[.467,.705,.421],[.467,.111,.421],.009);
    p.pipe(m.zinc,[.467,.111,.421],[.483,.086,.434],.009);
    for(const y of [.155,.405,.647]){
      p.box(m.iron,.460,y,.421,.012,.006,.038);
      p.pipe(m.iron,[.467,y-.005,.421],[.467,y+.005,.421],.0105);
    }
  }
  p.finish();model.add(g);
}
export function finishCanvasHem(stall,scan){
  const g=new T.Group();g.name='豆浆摊棚布的补片和缝线';
  const patch=canvasSurface('旧棉棚的缝补',448,152,(c,w,h)=>{
    const rng=random(427);c.fillStyle='#9c604d';
    c.beginPath();c.moveTo(7,7);c.lineTo(w-11,10);c.lineTo(w-5,h-14);c.lineTo(10,h-5);c.closePath();c.fill();
    c.save();c.clip();
    for(let n=0;n<1400;n++){c.fillStyle=n%2?'rgba(186,140,115,.22)':'rgba(81,58,46,.18)';c.fillRect(rng()*w,rng()*h,3+rng()*22,.8);}
    for(const off of [12,17]){c.strokeStyle=off===12?'#765247':'#b18b70';c.lineWidth=1.8;c.setLineDash([7,4]);c.strokeRect(off,off,w-2*off,h-2*off);}
    c.restore();
  });
  project(scan,g,'靠侧杆的双线帆布补片',patch,true,[-.294,-.144,.712,.745,.458,.5],.0022);
  // A used enamel bowl stands on the actual tabletop nearest the serving edge.
  // Read the supporting height from the finished scan so the rim and tea towel stay clear.
  const support=new T.Raycaster(new T.Vector3(.069,.423,.304),new T.Vector3(0,-1,0)).intersectObject(scan,false)
    .find(hit=>hit.point.y>.337&&hit.point.y<.396);
  if(support){
    const base=support.point.y+.00035,rad=.039;
    const enamel=new T.MeshStandardMaterial({name:'豆花白搪瓷',color:0xd1ceb0,roughness:.39,metalness:.1});
    const lip=new T.MeshStandardMaterial({name:'蓝青搪瓷包边',color:0x405b62,roughness:.4,metalness:.18});
    const bowl=new T.Group();bowl.name='摊沿的旧搪瓷碗';bowl.position.set(.069,base,.304);
    const profile=[[.42,0],[.49,.016],[.53,.19],[.78,.39],[.95,.55],[1,.63],[1,.69],[.95,.69],[.92,.59],[.72,.43],[.45,.25],[.37,.18],[0,.18]];
    const geo=new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r*rad,h*rad)),40);
    bowl.add(new T.Mesh(geo,enamel));
    for(const [radius,y,gauge] of [[1,.66,.032],[.884,.487,.014]]){
      const band=new T.Mesh(new T.TorusGeometry(rad*radius,rad*gauge,6,48),lip);
      band.rotation.x=Math.PI/2;band.position.y=rad*y;bowl.add(band);
    }
    g.add(bowl);
  }
  const p=metalwork(g),m=fittings();
  for(const x of [-.446,.435]){
    const s=x<0?1:-1;
    p.pipe(m.cord,[x,.756,.483],[x+s*.011,.746,.49],.0023,8);
    p.pipe(m.cord,[x+s*.011,.746,.49],[x+s*.005,.735,.489],.0024,8);
    p.pipe(m.cord,[x+s*.005,.735,.489],[x+s*.002,.716,.481],.0022,8);
    p.pipe(m.cord,[x+s*.005,.735,.489],[x+s*.018,.723,.476],.0021,8);
  }
  p.finish();stall.add(g);
}

// A small walled yard closes the eastern end of the actual branch. Doors and
// wall have backs and a tiled coping so the same gate also reads from the bridge.
export function makeAlleyGate(plinth){
  const gate=new T.Group();gate.name='粮油巷尾旧院门';gate.userData.feature='courtyard';
  const p=metalwork(gate),m=fittings(),clay=new T.MeshStandardMaterial({name:'青瓦截面',color:'#646659',roughness:.89});
  const lime=plinth.lime,brick=plinth.brick;
  const doorTexture=canvasSurface('巷尾旧青木门',256,448,(c,w,h)=>{
    c.fillStyle='#57665b';c.fillRect(0,0,w,h);const rng=random(615);
    const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(71,65,51,.35)');g.addColorStop(.55,'rgba(117,110,81,.04)');g.addColorStop(1,'rgba(86,72,53,.52)');c.fillStyle=g;c.fillRect(0,0,w,h);
    for(let i=0;i<3500;i++){c.fillStyle=i%3?'rgba(37,46,40,.16)':'rgba(179,148,99,.18)';c.fillRect(rng()*w,rng()*h,.6+rng()*2,rng()**3*29+1);}
    for(let i=1;i<7;i++){const x=w*i/7;c.fillStyle='#404c42';c.fillRect(x,0,2,h);c.fillStyle='#6e7968';c.fillRect(x+2,0,1,h);}
  });
  doorTexture.transparent=false;doorTexture.depthWrite=true;
  const width=.118,height=.059;
  for(const side of [-1,1])p.box(brick,0,.007,side*.0395,.007,.014,.039);
  for(const side of [-1,1]){
    p.box(lime,0,.033,side*.042,.006,.042,.034);
    p.box(lime,-.0006,.030,side*.022,.009,.060,.007);
    p.box(m.stone,-.001,.0042,side*.022,.011,.0084,.008);
    p.box(doorTexture,.0006,.026,side*.0097,.0035,.0413,.0190);
    p.box(m.iron,-.00149,.0245,side*.0028,.001,.0018,.0037);
    p.pipe(m.iron,[-.00172,.024,side*.0028],[-.00172,.021,side*.0028],.00055,8);
    p.box(clay,-.012,.056,side*.055,.026,.003,.005);
    p.box(lime,-.013,.028,side*.055,.028,.054,.004);
  }
  p.box(lime,0,.051,0,.006,.010,.042);
  p.box(m.stone,-.003,.004,0,.018,.008,.044);
  p.box(clay,-.001,height,0,.012,.003,width+.003);
  // Two banks of tile carry rain from the ridge to their short drip edges.
  for(let i=-25;i<=25;i++){
    const z=i*.00237;const d=.00094;
    p.pipe(clay,[-.0008,.064,z],[-.008,.0593,z],d,8);
    p.pipe(clay,[-.0008,.064,z],[.006,.060,z],d,8);
  }
  p.pipe(clay,[-.0008,.064,-.061],[-.0008,.064,.061],.0014,10);
  p.finish();return gate;
}
