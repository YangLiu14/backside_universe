// Additional masonry and fittings meet the original Hi3D gate at the outsides
// of its stone posts. All lengths below are in the gate's outsole-local frame.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

function enamelNumber() {
  const c=document.createElement('canvas');c.width=320;c.height=180;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#315565';ctx.fillRect(0,0,320,180);
  ctx.strokeStyle='#d0ccad';ctx.lineWidth=3;ctx.strokeRect(9,9,302,162);
  ctx.fillStyle='#e5dfc5';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 121px Georgia,serif';ctx.fillText('17',160,96);
  for(const x of [21,299]){ctx.fillStyle='#272d26';ctx.beginPath();ctx.arc(x,90,4,0,2*Math.PI);ctx.fill();}
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  return new T.MeshStandardMaterial({map,metalness:.19,roughness:.48});
}

async function loadFinishes() {
  const loader=new T.TextureLoader();
  const [albedo,relief,grain]=await Promise.all(['gate-limewash.jpg','gate-lime-relief.jpg','shop-metal-grain.jpg'].map(p=>loader.loadAsync('./'+p)));
  for(const map of [albedo,relief,grain]){map.wrapS=T.RepeatWrapping;map.anisotropy=8;}
  albedo.colorSpace=grain.colorSpace=T.SRGBColorSpace;
  const material=(name,color,roughness,metalness=0)=>new T.MeshStandardMaterial({name,color,map:grain,roughness,metalness});
  return {
    lime:new T.MeshStandardMaterial({name:'受潮石灰墙身',map:albedo,roughness:1,roughnessMap:relief,bumpMap:relief,bumpScale:.00018}),
    slab:material('凿面青石',0x938c78,.85), mortar:material('老灰缝',0x716e60,.98),
    tile:material('灰陶披水瓦',0x666861,.81), slate:material('瓦垄与滴水',0x535b59,.79),
    iron:material('旧铁与水泥固定耳',0x545953,.78,.41),
    green:material('旧绿漆信箱',0x768474,.72,.15),
    dark:material('收进阴影的铁口',0x363a34,.92,.12), enamel:enamelNumber(),
  };
}

let buildingFinishes;
export function courtyardFinishes() {
  return buildingFinishes??=loadFinishes();
}

// Emit one mesh per finish, including true returns, tile ends and metal lips.
// streetGround slices these same meshes when constructing its collision layer.
export async function entryCourt() {
  const mat=await courtyardFinishes(),pieces=new Map();
  const root=new T.Group();root.name='后巷院门两翼与入户门槛';
  function add(geometry,finish){
    if(!pieces.has(finish))pieces.set(finish,[]);
    pieces.get(finish).push(geometry);
  }
  function block(finish,x,y,z,w,h,d,yaw=0,pitch=0){
    const g=new T.BoxGeometry(w,h,d);
    g.rotateX(pitch);g.rotateY(yaw);g.translate(x,y,z);add(g,finish);
  }
  function span(x1,z1,x2,z2){
    const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);
    const u=dx/length,v=dz/length;
    return {length,yaw:-Math.atan2(dz,dx),at:(s,t)=>[x1+u*s-v*t,z1+v*s+u*t]};
  }
  function roofTile(run,start,end,height){
    const half=.0048,lip=.00085,top=.00185;
    const points=[[start,height,-half],[end,height,-half],[start,height+top,0],[end,height+top,0],
      [start,height,half],[end,height,half],[start,height-lip,half],[end,height-lip,half],
      [start,height-lip,-half],[end,height-lip,-half]];
    const p=[];
    for(const [a,b,c,d] of [[0,2,3,1],[2,4,5,3],[4,6,7,5],[8,0,1,9],[6,8,9,7],[0,8,6,4],[1,5,7,9]]) {
      for(const i of [a,b,d,b,c,d]){
        const [s,y,t]=points[i],[x,z]=run.at(s,t);p.push(x,y,z);
      }
    }
    // close the triangles between the sloping halves at each gable end
    for(const tri of [[0,4,2],[1,3,5]])for(const i of tri){
      const [s,y,t]=points[i],[x,z]=run.at(s,t);p.push(x,y,z);
    }
    const geom=new T.BufferGeometry();
    geom.setAttribute('position',new T.Float32BufferAttribute(p,3));
    const uv=[];for(let i=0;i<p.length;i+=3)uv.push(p[i]/.013,(p[i+1]+p[i+2])/.013);
    geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geom.computeVertexNormals();
    add(geom,mat.tile);
  }
  function wall(x1,z1,x2,z2,top,seed,{pier=true,coping=true}={}){
    const s=span(x1,z1,x2,z2),[cx,cz]=s.at(s.length/2,0);
    const base=-.0028,thick=.0058;
    const body=new T.BoxGeometry(s.length,top-base,thick);
    const pos=body.attributes.position,normal=body.attributes.normal,uv=body.attributes.uv;
    for(let i=0;i<pos.count;i++){
      const flank=Math.abs(normal.getX(i))>.5;
      uv.setXY(i,seed+(flank?pos.getZ(i):pos.getX(i))/.125+(normal.getZ(i)>0?.32:0),(pos.getY(i)/(top-base))+.5);
    }
    body.rotateY(s.yaw);body.translate(cx,(top+base)/2,cz);add(body,mat.lime);
    if(coping){
      const n=Math.ceil(s.length/.0088);
      block(mat.slate,cx,top,cz,s.length,.0011,.0088,s.yaw);
      for(let i=0;i<n;i++)roofTile(s,s.length*i/n+.00012,s.length*(i+1)/n-.00012,top+.0005+.00010*Math.sin(2.1*i+seed));
    }else block(mat.slab,cx,top+.00055,cz,s.length,.0015,.0074,s.yaw);
    if(pier&&s.length>.06){
      const [x,z]=s.at(s.length*.73,0);
      block(mat.lime,x,(top+base)/2,z,.0068,top-base,.0079,s.yaw);
      block(mat.slab,x,top+.0008,z,.0086,.0018,.0093,s.yaw);
    }
  }

  // Across the frontage, then back into the measured end walls of the clock
  // shop and the bicycle shop. Leave the gate leaves and their real clear gap.
  const postLine=.0035;
  wall(-.038,postLine,-.095,postLine,.035,.32);
  wall(-.095,postLine,-.095,.036,.035,.75);
  wall(.037,postLine,.086,postLine,.031,.62);
  wall(.086,postLine,.086,.035,.031,.39);

  // Leave an actual open approach between the two returns. The low stone
  // boundary behind it catches the view from inside at pedestrian eye level.
  // The film descends over that kerb with a sightline down to the gate sill.
  wall(-.085,-.094,-.034,-.094,.033,.95);
  wall(.043,-.094,.071,-.094,.032,.37);
  wall(-.034,-.100,.043,-.100,.0255,.84,{pier:false,coping:false});
  wall(-.085,-.094,-.105,-.071,.034,.33);
  wall(.071,-.094,.090,-.072,.033,.18);
  wall(-.105,-.071,-.110,-.048,.029,.48,{pier:false});
  wall(.090,-.072,.100,-.049,.027,.67,{pier:false});

  // Stones are bedded across the existing kerb height. Small chamfers on their
  // edges catch skylight without a line painted across the runner's route.
  const thresholdZ=-.0003,depth=.009,top=-.00065;
  block(mat.mortar,0,top-.0012,thresholdZ,.077,.0019,depth+.0006);
  for(const [left,right] of [[-.039,-.0235],[-.0233,-.0074],[-.0072,.0102],[.0104,.026],[.0262,.039]]){
    const g=new T.BoxGeometry(right-left,.002,depth,1,1,1);
    const s=g.attributes.position;
    for(let i=0;i<s.count;i++)if(s.getY(i)>0){
      const h=top+.00015*Math.cos((left+right)*90);
      s.setY(i,h);s.setX(i,s.getX(i)*.985);s.setZ(i,s.getZ(i)*.966);
    }else s.setY(i,-.003);
    g.translate((left+right)/2,0,thresholdZ);g.computeVertexNormals();add(g,mat.slab);
  }

  // Two wall-mounted letterboxes with open posting slots and folded rain lips,
  // at hand height just inside. The number plate sits flat on the outer wall.
  for(const x of [-.062,-.0512]){
    block(mat.dark,x,.022,postLine+.0038,.0107,.013,.0029);
    block(mat.green,x,.022,postLine+.0053,.0100,.0123,.00165);
    block(mat.dark,x,.0246,postLine+.00617,.0078,.00082,.00026);
    block(mat.green,x,.0252,postLine+.00648,.0085,.00044,.00094,0,.14);
    block(mat.iron,x+.0029,.0190,postLine+.00623,.0012,.0016,.0004);
    block(mat.iron,x-.0004,.0215,postLine+.00619,.0043,.0017,.00038);
    block(mat.slab,x-.0004,.0215,postLine+.00641,.0036,.00094,.00018);
    block(mat.slate,x,.02865,postLine+.0051,.0112,.00070,.0047,0,-.12);
  }
  block(mat.iron,.049,.0229,postLine-.00315,.0079,.0046,.00075);
  const plaque=new T.PlaneGeometry(.0075,.0042);plaque.rotateY(Math.PI);plaque.translate(.049,.0229,postLine-.00356);add(plaque,mat.enamel);

  // Recessed barred window in the former yard office. Its sill and iron bars
  // project separate silhouettes; the dark reveal and painted panel sit behind.
  const officeX=-.066,officeZ=-.090,officeW=.036,officeHeight=.044;
  block(mat.lime,officeX,officeHeight/2,officeZ,officeW,officeHeight,.0138);
  const recess=officeZ+.0071;
  block(mat.dark,officeX,.024,recess,.025,.014,.0011);
  for(const x of [-.0077,0,.0077])block(mat.green,officeX+x,.024,recess+.0008,.0067,.0127,.0004);
  for(const x of [-.0129,-.0064,0,.0064,.0129])block(mat.iron,officeX+x,.024,recess+.0018,.0006,.0144,.0007);
  for(const y of [.0175,.023,.0305])block(mat.iron,officeX,y,recess+.00175,.0265,.0007,.0009);
  block(mat.slab,officeX,.01645,recess+.0014,.0285,.0012,.0042);
  block(mat.slate,officeX,officeHeight+.0011,officeZ+.0006,officeW+.005,.002,.018,0,-.16);
  for(const [finish,parts] of pieces){
    // Generated triangles for tiled coping are non-indexed; each other finish
    // uses matching indexed primitives. Merge separately from the source GLB.
    const merged=mergeGeometries(parts);
    const mesh=new T.Mesh(merged,finish);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
    for(const g of parts)g.dispose();
  }
  return root;
}
