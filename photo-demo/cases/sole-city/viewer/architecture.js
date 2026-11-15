// Architectural alterations to the two Hi3D building shells. Coordinates within
// each plot run from -0.5 to 0.5, with the entrance facing local +Z.
import * as T from 'three';
import {roofSurface} from './roof-surfaces.js';

const clearPaneDepth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,opacity:0,alphaTest:.5});
const rectangle = (x,z,w,d) => [[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
const names = ['红砖木窗','白灰花窗','厂房钢窗','水刷石住宅','绿釉砖横窗','石砌拱窗'];
const shopTypes = ['车间气楼','菜场凉棚','茶楼外廊','双坡粮仓','退台书局','裁缝阁楼',
  '白墙面馆','锯齿厂房','街角钟楼','窑作工坊','花房暖棚','药铺山墙'];
const towerTypes = ['旧式阳台住宅','转角邮务楼','阶梯公寓','双翼里院','红砖水塔楼','廊式宿舍','竖窗报馆'];
const shopHeights = [1.05,.86,1.22,1.02,1.38,1.10,.96,1.06,1.55,1.04,1.10,1.16];
const towerRoles=['flat-balcony','flat-post','flat-terrace','flat-court','flat-watertower','flat-gallery','flat-press'];
// Yaw in the source coordinate system as viewed from the fitted street front.
// Filled from orthographic inspections of delivered whole-building meshes.
const buildingFrontYaw={};
export function buildingFrontAngle(role){return (buildingFrontYaw[role]??0)*Math.PI/180;}

// The scans already contain a photograph's deep baked shadows. Recover
// diffuse detail under the eave before the renderer calculates new shadows.
// Restrict it to dark texels inside the opening, preserving outside exposure.
export function recoverShopInterior(root){
  root.updateWorldMatrix(true,true);
  root.traverse(o=>{
    if(!o.isMesh)return;
    // The detached hierarchy maps the overview and near geometry into the
    // same unit frontage coordinates before each placement is cloned.
    const toBay=o.matrixWorld.clone();
    for(const m of [].concat(o.material)){
      m.onBeforeCompile=shader=>{
        shader.uniforms.toShopBay={value:toBay};
        shader.vertexShader='uniform mat4 toShopBay; varying vec3 shopBay;\n'+shader.vertexShader
          .replace('#include <begin_vertex>','#include <begin_vertex>\nshopBay=(toShopBay*vec4(transformed,1.)).xyz;');
        shader.fragmentShader='varying vec3 shopBay;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          float aperture=(1.-smoothstep(.36,.46,abs(shopBay.x)))*smoothstep(.015,.07,shopBay.y)*(1.-smoothstep(.59,.77,shopBay.y));
          float dark=1.-smoothstep(.045,.27,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));
          float shelter=smoothstep(.015,.22,.5-shopBay.z);
          diffuseColor.rgb*=1.+aperture*shelter*dark*2.25;`);
      };
      m.customProgramCacheKey=()=>'hi3d-shop-bay-diffuse-1';
    }
  });
}
export function towerProfile(row,side,col){
  const type=towerRows[row-5][(side>0?(row===5?2:3):0)+col];
  return {type,name:towerTypes[type],role:towerRoles[type]};
}
// Assign a particular building to each occupied tower plot, in walking order.
const towerRows = [
  [5,3,1,0], [6,2,3,1,4,0], [0,5,4,2,1,3], [1,6,2,0,5,4], [3,4,5,6,2,1]
];
function ceramic(name,color,kind){
  if(kind==='tile'||kind==='metal')return roofSurface(name,color,kind);
  const size=128,c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,size,size);
  let seed=43;
  const random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  for(let i=0;i<3500;i++){
    ctx.fillStyle=i%2?'rgba(24,22,18,.065)':'rgba(255,233,202,.09)';
    ctx.fillRect(random()*size,random()*size,1+random()*3,1+random()*1.5);
  }
  if(kind==='glass'){
    for(let x=0;x<size;x+=32){
      ctx.fillStyle='rgba(19,37,38,.47)';ctx.fillRect(x,0,2.2,size);
      ctx.fillStyle='rgba(212,229,212,.24)';ctx.fillRect(x+2.2,0,1.4,size);
    }
    for(let y=0;y<size;y+=48){ctx.fillStyle='#516763';ctx.fillRect(0,y,size,2);}
  }
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
  const material=new T.MeshStandardMaterial({map,side:T.DoubleSide,roughness:kind==='glass'?.4:.88});
  material.name=name;return material;
}
function clockFace(){
  const c=document.createElement('canvas');c.width=c.height=192;
  const g=c.getContext('2d');g.translate(96,96);
  g.fillStyle='#a48b62';g.fillRect(-96,-96,192,192);
  g.fillStyle='#433e34';g.beginPath();g.arc(0,0,94,0,2*Math.PI);g.fill();
  g.fillStyle='#e4d6ae';g.beginPath();g.arc(0,0,84,0,2*Math.PI);g.fill();
  for(let i=0;i<60;i++){g.fillStyle='#514331';const h=i%5===0?14:5;g.fillRect(i%5===0?-2:-1,-78,i%5===0?4:2,h);g.rotate(Math.PI/30);}
  g.lineCap='round';g.strokeStyle='#483927';g.lineWidth=6;g.beginPath();g.moveTo(-32,-23);g.lineTo(0,0);g.lineTo(34,-42);g.stroke();
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
  const m=new T.MeshStandardMaterial({map,side:T.DoubleSide,roughness:.75});m.name='铜圈钟盘';return m;
}
// Glazing borders traced on the six photographed wall tiles in 274-unit
// tile coordinates. Sills and mullions stay rough while panes reflect the sky.
const glazing=[
  {x:[[48,103],[174,226]],y:[[35,105],[164,240]],posts:[.25,.54,.76],bars:[.46]},
  {x:[[48,100],[169,221]],y:[[34,89],[165,218]],posts:[.31,.53,.73],bars:[.42,.78]},
  {x:[[27,117],[158,247]],y:[[27,106],[159,239]],posts:[.25,.51,.76],bars:[.30,.68]},
  {x:[[38,109],[166,238]],y:[[25,106],[165,235]],posts:[.48],bars:[.24]},
  {x:[[22,120],[153,250]],y:[[38,100],[166,230]],posts:[.33,.68],bars:[.25]},
  {x:[[40,105],[171,234]],y:[[27,107],[160,239]],posts:[.46,.54],bars:[.30,.55,.77],arched:true}
];
function facadeRoughness(tile,index){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=tile.width;
  const ctx=canvas.getContext('2d'),pixels=tile.getContext('2d').getImageData(0,0,tile.width,tile.height);
  const pane=glazing[index];
  for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
    // The albedo crop removes three source pixels of bleed on all four sides.
    const u=1.5+(x+.5)/tile.width*271,v=1.5+(y+.5)/tile.height*271;
    const xb=pane.x.find(([a,b])=>u>=a&&u<b),yb=pane.y.find(([a,b])=>v>=a&&v<b);
    const offset=4*(y*tile.width+x),luma=pixels.data[offset+1]/255;
    let rough=.86+.10*luma;
    if(xb&&yb){
      const fx=(u-xb[0])/(xb[1]-xb[0]),fy=(v-yb[0])/(yb[1]-yb[0]);
      const inset=!pane.arched||fy>.30||((fx-.5)/.5)**2+((fy-.30)/.30)**2<1;
      const frame=pane.posts.some(at=>Math.abs(fx-at)<.025)||pane.bars.some(at=>Math.abs(fy-at)<.021);
      if(inset)rough=frame?.66:.20+.18*luma;
    }
    pixels.data.fill(Math.round(255*rough),offset,offset+3);
  }
  ctx.putImageData(pixels,0,0);
  const map=new T.CanvasTexture(canvas);map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=8;
  return map;
}
async function materials(){
  const image=await new T.ImageLoader().loadAsync('./building-walls.jpg');
  const cw=image.width/3,ch=image.height/2;
  const walls=names.map((name,i)=>{
    const c=document.createElement('canvas');c.width=c.height=512;
    c.getContext('2d').drawImage(image,cw*(i%3)+3,ch*Math.floor(i/3)+3,cw-6,ch-6,0,0,512,512);
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=8;
    const mat=new T.MeshStandardMaterial({map,side:T.DoubleSide,roughness:1,roughnessMap:facadeRoughness(c,i)});mat.name=name;return mat;
  });
  function masonry(name,sx,sy,sw,sh){
    const c=document.createElement('canvas');c.width=384;c.height=256;
    const ctx=c.getContext('2d');
    for(let y=0;y<2;y++)for(let x=0;x<6;x++)ctx.drawImage(image,sx*cw,sy*ch,sw*cw,sh*ch,x*64,y*128,64,128);
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=8;
    const mat=new T.MeshStandardMaterial({map,roughness:.9,side:T.DoubleSide});mat.name=name;return mat;
  }
  const plinth={brick:masonry('铺面旧红砖',.006,.10,.097,.33),lime:masonry('店面灰泥',1.02,.04,.088,.35)};
  const sash=new T.MeshStandardMaterial({name:'旧木窗框侧边',color:0x554d3f,roughness:.65,side:T.DoubleSide});
  const reveal=new T.MeshStandardMaterial({name:'窗套内壁',color:0x8d8171,roughness:.87,side:T.DoubleSide});
  const room=new T.MeshStandardMaterial({name:'窗内背墙',color:0x70624d,roughness:.92,side:T.DoubleSide});
  const pane=new T.MeshStandardMaterial({name:'上层平板玻璃',color:0x99a9a1,transparent:true,opacity:.17,
    depthWrite:false,roughness:.15,metalness:.17,side:T.DoubleSide,envMapIntensity:1.15});
  const linen=ceramic('窗内垂布','#aa9d83');
  return {walls,plinth,sash,reveal,room,pane,linen,clock:clockFace(),slate:ceramic('烟灰筒瓦','#555954','tile'),clay:ceramic('赭红陶瓦','#855646','tile'),
    zinc:ceramic('氧化锌板','#707c77','metal'),glass:ceramic('温室夹丝玻璃','#8ea8a0','glass'),
    lime:ceramic('米灰石灰','#c3b79f'),stone:ceramic('浅砂岩','#ab977a'),brick:ceramic('砌砖端墙','#976448'),
    dark:ceramic('深色木料','#56483b'),teal:ceramic('灰绿漆钢','#496a62'),iron:ceramic('铸铁','#494d48'),
    rubber:ceramic('胎纹压顶','#454745')};
}

// Batch flat faces by finish within this one building, keeping its parts
// editable. Texture density is measured in city units before the plot scales.
class Builder {
  constructor(parent,size,materials){
    this.parent=parent;this.size=size;this.m=materials;this.parts=new Map();
  }
  face(material,vertices,uv=[[0,0],[1,0],[1,1],[0,1]]){
    if(!this.parts.has(material))this.parts.set(material,{p:[],uv:[]});
    const out=this.parts.get(material);
    for(let i=1;i<vertices.length-1;i++)for(const k of [0,i,i+1]){out.p.push(...vertices[k]);out.uv.push(...uv[k]);}
  }
  // Build a recessed opening and an outward sill for each photographed bay.
  // The UVs stay continuous over the masonry, reveals and inset panes.
  bays(wall,a,b,bottom,top,u,v){
    const [x,z]=a,[nx,nz]=b;
    const width=Math.hypot((nx-x)*this.size[0],(nz-z)*this.size[2]);
    const outwardX=(nz-z)*this.size[2]/width/this.size[0];
    const outwardZ=-(nx-x)*this.size[0]/width/this.size[2];
    const columns=Math.round(u*2),floors=Math.round(v*2);
    const brick=this.m.walls.indexOf(wall);
    const bounds=[[.29,.78,.21,.79],[.29,.78,.23,.80],[.16,.86,.19,.82],
      [.22,.78,.21,.78],[.17,.84,.23,.74],[.29,.77,.21,.67]][brick];
    for(let row=0;row<floors;row++)for(let col=0;col<columns;col++){
      const surface=(coords,finish=wall)=>{
        const vertices=[],uv=[];
        for(const [i,j,depth=0] of coords){
          const f=(col+i)/columns, g=(row+j)/floors;
          vertices.push([T.MathUtils.lerp(x,nx,f)+outwardX*depth,T.MathUtils.lerp(bottom,top,g),T.MathUtils.lerp(z,nz,f)+outwardZ*depth]);
          uv.push([u*f,v*g]);
        }
        this.face(finish,vertices,uv);
      };
      const [l,r,lo,hi]=bounds, bay=width/columns;
      const deep=-Math.min(.0042,bay*.15),sill=Math.min(.0015,bay*.065);
      const flat=(lx,rx,ly,ry,d=0,finish=wall)=>surface([[lx,ly,d],[lx,ry,d],[rx,ry,d],[rx,ly,d]],finish);
      flat(0,l,0,1);flat(r,1,0,1);flat(l,r,hi,1);flat(l,r,0,lo-.04);
      const address=Math.round(width*4621+bottom*257+x*93+z*175+this.size[1]*2369);
      const dwelling=Math.abs(address*7+col*5+row*11)%11;
      flat(l,r,lo,hi,deep,row>=2?wall:this.m.room);
      for(const i of [l,r])surface([[i,lo,sill],[i,hi],[i,hi,deep],[i,lo,deep]],this.m.reveal);
      surface([[l,hi,deep],[l,hi],[r,hi],[r,hi,deep]],this.m.reveal);
      surface([[l,lo,sill],[l,lo,deep],[r,lo,deep],[r,lo,sill]],this.m.stone);
      surface([[l,lo-.04],[l,lo,sill],[r,lo,sill],[r,lo-.04]],this.m.stone);
      // Lower rooms have a sill, glazing and a wall at three real depths. Vary
      // occupied covers independently of the source photograph's repeated bays.
      if(row<2 && dwelling<8){
        const clothEnd=l+(r-l)*(.30+.065*dwelling);
        for(let k=0;k<6;k++){
          const x0=T.MathUtils.lerp(l,clothEnd,k/6),x1=T.MathUtils.lerp(l,clothEnd,(k+1)/6);
          const d0=deep*(k%2?.66:.50),d1=deep*(k%2?.50:.66);
          surface([[x0,lo+.08,d0],[x0,hi,d0],[x1,hi,d1],[x1,lo+.08+.016*((k+1)%2),d1]],this.m.linen);
        }
      }
      const rz=deep*.20, edge=.013;
      for(const i of [l+edge,r-edge,(l+r)/2])flat(i-edge,i+edge,lo,hi,rz,this.m.sash);
      for(const j of [lo+edge,hi-edge,hi-(hi-lo)*.28])flat(l,r,j-edge,j+edge,rz+.00008,this.m.sash);
      flat(l+edge,r-edge,lo+edge,hi-edge,deep*.27,this.m.pane);
      // Add a few real domestic fittings to occupied street-facing bays. Their
      // dimensions are measured against the bay and their backs meet the masonry.
      if(outwardZ<=0 || ![0,1,3,4].includes(brick) || top-bottom<.16)continue;
      const unit=(address+col*19+row*37)%17;
      if(unit!==1 && unit!==5)continue;
      const project=(lx,rx,ly,ry,back,front,mat)=>{
        surface([[lx,ly,front],[lx,ry,front],[rx,ry,front],[rx,ly,front]],mat);
        surface([[lx,ry,back],[rx,ry,back],[rx,ry,front],[lx,ry,front]],mat);
        surface([[lx,ly,back],[lx,ly,front],[rx,ly,front],[rx,ly,back]],mat);
        for(const i of [lx,rx])surface([[i,ly,back],[i,ry,back],[i,ry,front],[i,ly,front]],mat);
      };
      if(unit===1){
        // Folded green sun blind, level front rail and two triangular returns.
        const near=hi+.042,outer=hi-.12,over=.005;
        surface([[l-.04,near],[l-.04,outer,over],[r+.04,outer,over],[r+.04,near]],this.m.teal);
        for(const i of [l-.04,r+.04])surface([[i,near],[i,outer],[i,outer,over]],this.m.teal);
        project(l-.04,r+.04,outer-.008,outer,over-.0003,over+.0003,this.m.iron);
      }else{
        // Outdoor compressor on two brackets. Separate dark louvres cast a
        // changing highlight and reveal the gap to the side of the window.
        project(.10,.13,.065,.13,0,.0027,this.m.iron);
        project(.34,.37,.065,.13,0,.0027,this.m.iron);
        project(.078,.394,.102,.264,.0006,.0038,this.m.lime);
        for(const y of [.132,.163,.194,.225])project(.11,.335,y,y+.009,.0038,.0041,this.m.dark);
      }
    }
  }
  prism(polygon,bottom,top,wall,cap=this.m.stone){
    const sy=this.size[1],tiled=this.m.walls.includes(wall);
    const v=tiled?Math.max(.5,Math.round((top-bottom)*sy/.027)*.5):1;
    for(let i=0;i<polygon.length;i++){
      const [x,z]=polygon[i],[nx,nz]=polygon[(i+1)%polygon.length];
      const span=Math.hypot((nx-x)*this.size[0],(nz-z)*this.size[2]);
      const u=tiled?Math.max(.5,Math.round(span/.024)*.5):1;
      if(tiled){this.bays(wall,[x,z],[nx,nz],bottom,top,u,v);continue;}
      this.face(wall,[[x,bottom,z],[x,top,z],[nx,top,nz],[nx,bottom,nz]],[[0,0],[0,v],[u,v],[u,0]]);
    }
    const points=polygon.map(([x,z])=>new T.Vector2(x,z));
    for(const tri of T.ShapeUtils.triangulateShape(points,[])){
      const face=tri.reverse().map(i=>[polygon[i][0],top,polygon[i][1]]);
      this.face(cap,face,face.map(([x,,z])=>[x+.5,z+.5]));
      const underside=face.reverse().map(([x,,z])=>[x,bottom,z]);
      this.face(cap,underside,underside.map(([x,,z])=>[x+.5,z+.5]));
    }
  }
  box(x,z,w,d,bottom,top,wall,cap){this.prism(rectangle(x,z,w,d),bottom,top,wall,cap??(this.m.walls.includes(wall)?this.m.stone:wall));}
  drum(x,z,rx,rz,bottom,top,finish,n=12){
    this.prism(Array.from({length:n},(_,i)=>[x+rx*Math.cos(i*2*Math.PI/n),z+rz*Math.sin(i*2*Math.PI/n)]),bottom,top,finish,finish);
  }
  // Extruded roof profile; each intermediate point defines a real ridge,
  // valley, or sawtooth light, with closed gable ends.
  roof(x,z,w,d,bottom,profile,skin,end,alongX=false){
    const point=(u,h,v)=>alongX?[x+v*w,bottom+h,z+u*d]:[x+u*w,bottom+h,z+v*d];
    const outline=[[-.5,-.012],...profile,[.5,-.012]];
    for(const v of [-.5,.5]){
      const poly=outline.map(([u,h])=>new T.Vector2(u,h));
      for(const tri of T.ShapeUtils.triangulateShape(poly,[])){
        const face=tri.map(i=>point(...outline[i],v));this.face(end,face,tri.map(i=>[outline[i][0]+.5,outline[i][1]+.2]));
      }
    }
    const underside=(u,v)=>point(u,-.012,v);
    this.face(end,[underside(-.5,-.5),underside(-.5,.5),underside(.5,.5),underside(.5,-.5)]);
    for(const [u,h] of [profile[0],profile.at(-1)]){
      this.face(end,[underside(u,-.5),point(u,h,-.5),point(u,h,.5),underside(u,.5)]);
    }
    for(let i=1;i<profile.length;i++){
      const [a,b]=profile.slice(i-1,i+1);
      const m=Math.abs(a[0]-b[0])<.07?end:skin;
      const halfSpan=alongX?d*this.size[2]:w*this.size[0];
      const across=alongX?w*this.size[0]:d*this.size[2];
      const pitch=Math.hypot((b[0]-a[0])*halfSpan,(b[1]-a[1])*this.size[1]);
      const u=m===skin?pitch/.038:1,v=m===skin?across/.033:1;
      this.face(m,[point(...a,-.5),point(...b,-.5),point(...b,.5),point(...a,.5)],
        [[0,0],[u,0],[u,v],[0,v]]);
    }
  }
  balcony(x,z,w,d,y,height,finish){
    const m=this.m;
    this.box(x,z,w,d,y-.014,y,finish);
    this.box(x,z+d*.46,w,.014,y+height-.009,y+height,finish);
    for(let i=0;i<=8;i++)this.box(x+w*(i/8-.5)*.96,z+d*.46,.009,.012,y,y+height,m.iron);
    for(const side of [-1,1])this.box(x+side*w*.48,z,.012,d,y+height-.009,y+height,finish);
  }
  faceClock(x,z,y,r){
    const ry=r*this.size[0]/this.size[1],v=[[x-r,y-ry,z],[x+r,y-ry,z],[x+r,y+ry,z],[x-r,y+ry,z]];
    this.face(this.m.clock,v);
  }
  finish(){
    for(const [m,data] of this.parts){
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.p,3));
      g.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));g.computeVertexNormals();
      const mesh=new T.Mesh(g,m);mesh.name=m.name;
      if(m===this.m.pane)mesh.customDepthMaterial=clearPaneDepth;
      this.parent.add(mesh);
    }
  }
}

const gable=[[-.5,0],[0,.22],[.5,0]];
const shallow=[[-.5,0],[0,.11],[.5,0]];
const barrel=Array.from({length:13},(_,i)=>[-.5*Math.cos(i*Math.PI/12),.245*Math.sin(i*Math.PI/12)]);
function designShop(b,type,edition){
  const m=b.m,W=m.walls,flip=edition%2?-1:1;
  const eave=.47; // Above the Hi3D entrance, lettering and folded awning.
  switch(type){
    case 0: { // Cycle repair: long zinc-roofed hall, raised north light, square vent.
      b.box(0,-.02,.91,.84,eave,.64,W[2]);b.roof(0,-.02,.96,.89,.64,shallow,m.zinc,m.stone,true);
      b.box(.06,0,.60,.35,.70,.83,W[2]);b.roof(.06,0,.65,.38,.83,shallow,m.zinc,m.teal,true);
      b.box(-.32,-.31,.085,.10,.72,1.01,m.brick);break;
    }
    case 1: { // Open market canopy with exposed posts and a narrow glazed ridge.
      b.box(0,-.18,.89,.51,eave,.66,W[1]);
      for(const x of [-.42,-.15,.15,.42])b.box(x,.31,.026,.029,eave,.70,m.teal);
      b.roof(0,0,.98,.88,.69,gable,m.zinc,m.teal,true);
      b.box(.01,-.03,.69,.15,.87,.96,m.glass);b.box(.01,-.03,.73,.19,.96,.98,m.zinc);break;
    }
    case 2: { // Timber tea house with a shaded front veranda and two tiled eaves.
      b.box(0,-.13,.84,.56,eave,.89,W[1]);b.balcony(0,.215,.91,.25,.52,.108,m.dark);
      for(const x of [-.425,-.14,.14,.425])b.box(x,.315,.019,.025,.51,.93,m.dark);
      b.roof(0,-.015,.97,.91,.91,gable,m.slate,m.dark,true);
      b.roof(0,.24,.93,.38,.51,[[-.5,.095],[.5,0]],m.slate,m.dark,true);break;
    }
    case 3: { // A pair of independently ridged storage bays with a loading loft.
      for(const x of [-.228,.228]){
        b.box(x,-.05,.44,.77,eave,.76,W[0]);b.roof(x,-.05,.465,.83,.76,gable,m.clay,m.brick);
      }
      b.box(flip*.23,.29,.255,.13,.65,.82,m.dark);
      b.box(flip*.23,.39,.20,.16,.81,.83,m.zinc);break;
    }
    case 4: { // Bookshop: stone street wall, setbacks and a raised reading room.
      b.box(0,-.045,.90,.82,eave,.79,W[5]);
      b.box(0,-.08,.94,.84,.78,.813,m.stone);
      b.box(-flip*.08,-.16,.68,.51,.813,1.02,W[5]);
      b.box(-flip*.08,-.16,.72,.55,1.02,1.045,m.lime);
      for(const x of [-.38,.38])b.box(x,.37,.035,.027,eave,.82,m.lime);break;
    }
    case 5: { // Seamstress's attic, two dormer windows and a roof over the entry.
      b.box(0,-.04,.85,.80,eave,.67,W[1]);b.roof(0,-.04,.94,.85,.67,[[-.5,0],[0,.38],[.5,0]],m.clay,m.lime,true);
      for(const x of [-.22,.22]){b.box(x,.19,.20,.23,.73,.87,W[1]);b.roof(x,.19,.24,.28,.87,shallow,m.slate,m.lime);}
      break;
    }
    case 6: { // Noodle kitchen with a lower courtyard wing, stove flue and cap.
      b.box(-flip*.13,-.06,.60,.79,eave,.79,W[1]);b.roof(-flip*.13,-.06,.66,.84,.79,gable,m.slate,m.lime);
      b.box(flip*.315,-.13,.25,.61,eave,.61,m.lime);b.roof(flip*.315,-.13,.28,.66,.61,shallow,m.clay,m.lime);
      b.box(flip*.32,-.26,.092,.11,.69,1.02,m.brick);b.box(flip*.32,-.26,.11,.13,1.02,1.045,m.dark);break;
    }
    case 7: { // Sawtooth workshop: three north-facing lights, exposed brick piers.
      b.box(0,-.035,.91,.80,eave,.69,W[2]);const saw=[[-.5,0]];
      for(let i=0;i<3;i++)saw.push([-.5+(i+.83)/3,.23],[-.5+(i+1)/3,0]);
      b.roof(0,-.035,.94,.83,.69,saw,m.zinc,m.glass);
      for(const x of [-.44,0,.44])b.box(x,.365,.027,.025,eave,.71,m.brick);break;
    }
    case 8: { // Clockmaker: stepped shoulders and a roof dial above the corner.
      b.box(0,-.045,.88,.79,eave,.72,W[5]);b.box(0,-.045,.92,.83,.715,.74,m.lime);
      const x=flip*.21;b.box(x,.055,.36,.42,.74,1.10,m.stone);b.box(x,.055,.39,.45,1.085,1.115,m.lime);
      b.faceClock(x,.268, .93,.103);
      b.box(x,.055,.29,.32,1.115,1.17,m.stone);b.roof(x,.055,.32,.36,1.17,shallow,m.zinc,m.lime);break;
    }
    case 9: { // Pottery workshop with a kiln chimney alongside a lean-to.
      b.box(-.08,-.03,.66,.78,eave,.75,W[0]);b.roof(-.08,-.03,.71,.83,.75,shallow,m.clay,m.brick,true);
      b.box(.32,-.10,.19,.55,eave,.59,m.brick);
      b.drum(.31,-.21,.067,.080,.58,1.10,m.brick);b.drum(.31,-.21,.075,.089,1.075,1.11,m.dark);break;
    }
    case 10: { // Garden shop: curved greenhouse roof with projecting steel glazing bars.
      b.box(0,-.035,.82,.76,eave,.66,m.glass);b.roof(0,-.035,.84,.78,.66,barrel,m.glass,m.glass);
      for(const z of [-.42,-.23,-.035,.16,.35])b.roof(0,z,.855,.016,.665,barrel,m.teal,m.teal);
      for(const x of [-.42,.42])b.box(x,-.035,.02,.79,.64,.67,m.teal);break;
    }
    case 11: { // Apothecary: tiled roof between stepped masonry fire walls.
      b.box(0,-.06,.82,.74,eave,.80,W[1]);b.roof(0,-.06,.84,.78,.80,gable,m.slate,m.lime,true);
      for(const x of [-.43,.43])for(const [d,top] of [[.86,.86],[.60,.97],[.34,1.08]]){
        b.box(x,-.06,.038,d,eave,top,m.lime);b.box(x,-.06,.056,d+.016,top,top+.016,m.slate);
      }break;
    }
  }
}

function designTower(b,type,flip,variant) {
  const m=b.m,W=m.walls,base=.217;
  switch(type){
    case 1:{ // Chamfered post-office corner and a taller stair tower on the return.
      const outline=[[-.43,-.39],[.42,-.39],[.42,.20],[.25,.39],[-.31,.39],[-.43,.26]];
      b.prism(outline,base,.67,W[4]);b.prism(outline,.67,.681,m.lime);
      b.box(-flip*.14,-.09,.51,.53,.68,.94,W[4]);
      b.box(-flip*.14,-.09,.55,.57,.94,.955,m.lime);
      for(const x of [-.23,0,.23])b.box(x,.394,.021,.022,base,.66,m.stone);
      break;
    }
    case 2:{ // Stepped apartments; the roof of each lower wing is an open terrace.
      b.box(0,-.03,.90,.83,base,.48,W[3]);
      b.box(-flip*.08,-.10,.72,.65,.48,.72,W[3]);
      b.box(-flip*.18,-.17,.48,.45,.72,.96,W[0]);
      for(const [x,z,w,d,y] of [[0,.385,.90,.014,.48],[-flip*.08,.225,.72,.014,.72],[-flip*.18,-.17,.51,.48,.96]]){
        b.box(x,z,w,d,y,y+.017,m.stone);
      }
      b.balcony(flip*.02,.29,.52,.16,.51,.048,m.teal);break;
    }
    case 3:{ // The lower link recedes between two wings of different heights.
      for(const [side,h] of [[-1,.93],[1,.69]]){
        const x=side*flip*.263;
        b.box(x,-.045,.345,.76,base,h,W[side<0?0:1]);b.roof(x,-.045,.375,.80,h,shallow,m.slate,m.brick);
      }
      b.box(0,-.215,.26,.39,base,.53,W[1]);b.box(0,-.215,.29,.42,.53,.55,m.zinc);
      b.balcony(0,-.015,.31,.10,.40,.043,m.dark);break;
    }
    case 4:{ // Water tank on an open four-legged frame, set into an old works building.
      b.box(0,-.045,.84,.76,base,.49,W[0]);b.box(0,-.045,.88,.79,.49,.51,m.stone);
      const x=flip*.12;
      for(const dx of [-.14,.14])for(const z of [-.15,.15])b.box(x+dx,z,.044,.053,.51,.77,m.brick);
      b.box(x,0,.40,.43,.69,.715,m.iron);
      b.drum(x,0,.224,.25,.75,.925,m.zinc,20);
      for(const y of [.755,.84,.922])b.drum(x,0,.234,.26,y,y+.010,m.iron,20);
      b.drum(x,0,.16,.19,.931,.951,m.zinc,20);break;
    }
    case 5:{ // A long access gallery, visibly open all the way through its end bays.
      b.box(0,-.12,.84,.54,base,.855,W[3]);
      const levels=variant%2?5:4;
      for(let i=0;i<levels;i++)b.balcony(0,.228,.86,.20,.275+i*(.52/levels),.046,m.teal);
      for(const x of [-.40,-.13,.14,.40])b.box(x,.32,.020,.024,base,.87,m.lime);
      b.box(0,-.02,.91,.78,.85,.88,m.zinc);
      b.box(-flip*.23,-.14,.29,.32,.88,.965,W[2]);break;
    }
    case 6:{ // Vertical stone piers either side of a narrow, set-back central crown.
      b.box(0,-.04,.82,.73,base,.69,W[5]);b.box(0,-.09,.58,.56,.69,.88,W[5]);
      b.box(0,-.106,.39,.41,.88,1.025,W[2]);b.box(0,-.106,.425,.445,1.025,1.039,m.stone);
      for(const x of [-.34,-.20,.20,.34]){
        const h=Math.abs(x)>.3?.73:.93;
        b.box(x,.325,.031,.055,base,h,m.lime);
      }
      break;
    }
  }
}

// Trim the unused storeys exactly where the replacement roof or upper rooms begin.
export function firstStorey(source, cornice, top=.205) {
  const {position,normal,uv}=source.attributes,index=source.index;
  const positions=[],normals=[],texcoords=[];
  const vertex=i=>[position.getX(i),position.getY(i),position.getZ(i),normal.getX(i),normal.getY(i),normal.getZ(i),uv.getX(i),uv.getY(i)];
  const add=v=>{positions.push(v[0],v[1],v[2]);normals.push(v[3],v[4],v[5]);texcoords.push(v[6],v[7]);};
  const count=index?.count??position.count;
  for(let j=0;j<count;j+=3){
    const tri=[0,1,2].map(k=>index?index.getX(j+k):j+k);
    if(tri.every(i=>position.getY(i)>top))continue;
    const verts=tri.map(vertex),poly=[];
    for(let k=0;k<3;k++){
      const a=verts[k],b=verts[(k+1)%3],inside=a[1]<=top;
      if(inside)poly.push(a);
      if(inside!==(b[1]<=top)){
        const f=(top-a[1])/(b[1]-a[1]),v=a.map((value,i)=>value+(b[i]-value)*f);
        poly.push(v);cornice.push([v[0],v[2]]);
      }
    }
    for(let i=1;i<poly.length-1;i++){add(poly[0]);add(poly[i]);add(poly[i+1]);}
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(texcoords,2));
  return g;
}
export function corniceHull(points){
  const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  function edge(input){
    const pts=[];
    for(const p of input){
      while(pts.length>1){
        const a=pts.at(-2),b=pts.at(-1);
        if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>0)break;
        pts.pop();
      }
      pts.push(p);
    }
    pts.pop();return pts;
  }
  return [...edge(sorted),...edge(sorted.slice().reverse())];
}

export async function architecture(towerSource){
  const finishes=await materials();
  towerSource.updateWorldMatrix(true,true);
  const podium=new T.Group(),cornice=[];
  towerSource.traverse(part=>{
    if(!part.isMesh)return;
    const aligned=part.geometry.clone().applyMatrix4(part.matrixWorld);
    const mesh=new T.Mesh(firstStorey(aligned,cornice),part.material);aligned.dispose();
    mesh.name='原住宅首层与基座';podium.add(mesh);
  });
  if(cornice.length>=3){
    const ledge=new Builder(podium,[1,1,1],finishes);
    ledge.prism(corniceHull(cornice),.2049,.218,finishes.stone);
    ledge.finish();
  }
  return {
    plinth:finishes.plinth,finishes,
    shop(front,type,edition,size){
      const result=new T.Group();result.add(front);
      // Alternate a wide, shallow shopfront and a narrow room with a side return.
      const frontage=[.88,.97,.93,.90,.96,.82,.84,.95,.86,.91,.82,.93][type];
      front.scale.set(frontage,1,.92);front.position.set((1-frontage)*(type%2?-.32:.32),0,-.014);
      const attic=new T.Group();attic.name='上层与屋面';result.add(attic);
      const builder=new Builder(attic,size,finishes);
      builder.box(0,-.025,.90,.81,.451,.471,finishes.stone,finishes.rubber);
      designShop(builder,type,edition);builder.finish();
      if(edition){
        // The narrow side-street lots have a service wing or open lean-to
        // beside their upper rooms, with the kitchens facing the back lane.
        const side=(type+edition)%2?1:-1;
        attic.scale.set(.68,1,.90);attic.position.set(-side*.14,0,-.025);
        const wing=new Builder(result,size,finishes);
        const x=side*.32, wall=finishes.walls[(type+edition)%finishes.walls.length];
        if((type+edition)%3===0){
          wing.box(x,-.20,.245,.40,.445,.85,wall);
          wing.roof(x,-.20,.26,.43,.85,shallow,finishes.clay,finishes.lime);
          wing.balcony(x,.09,.25,.20,.51,.10,finishes.dark);
        }else if((type+edition)%3===1){
          wing.box(x,-.18,.245,.49,.445,.61,finishes.lime);
          wing.box(x,.12,.22,.20,.447,.475,finishes.stone);
          for(const dx of [-.092,.092])wing.box(x+dx,.21,.018,.021,.475,.67,finishes.dark);
          wing.roof(x,-.06,.26,.62,.67,[[-.5,.09],[.5,0]],finishes.slate,finishes.dark,true);
        }else{
          wing.box(x,-.09,.24,.65,.445,.73,wall);
          wing.roof(x,-.09,.275,.69,.73,gable,finishes.zinc,finishes.stone);
          wing.drum(x,-.24,.046,.058,.82,1.04,finishes.brick);
        }
        wing.finish();
      }
      return result;
    },
    tower(row,side,col,size){
      const {type}=towerProfile(row,side,col);
      const result=new T.Group();
      if(type===0){
        // Keep a few of the original mustard tread crowns as a visual echo of the sole.
        result.add(towerSource.clone());
      }else{
        result.add(podium.clone());
        const b=new Builder(result,size,finishes);designTower(b,type,(row+col)%2?-1:1,row+col);b.finish();
      }
      return {mesh:result,name:towerTypes[type]};
    }
  };
}
export function shopProfile(type){return {name:shopTypes[type],height:shopHeights[type]};}
