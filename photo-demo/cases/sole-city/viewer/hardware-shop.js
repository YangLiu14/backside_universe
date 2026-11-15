// Keep the photographed Hi3D exterior, including its green door, fluted counter
// and timber transoms. These volumes are measured in the shop's normalized frame.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {lightHardwareInterior} from './hardware-light.js';

const openings=[
  [[-.175,.183,-.320],[.282,.346,.414]], // main (+Z) serving hatch
  [[-.320,.182,-.245],[.414,.344,.266]], // return (+X) serving hatch
  [[-.343,.074,-.329],[.345,.390,.338]], // space occupied by the shared room
];

// Clip only crossing triangles. Whole triangles outside the apertures keep
// their original indices, normals, UVs and material. Interpolated edges meet
// the original lintels even on the coarser LOD's large scan triangles.
function cutShell(mesh){
  const transform=mesh.matrixWorld;
  const g=mesh.geometry.clone().applyMatrix4(transform),idx=g.index.array;
  const position=Array.from(g.attributes.position.array),normal=Array.from(g.attributes.normal.array),uv=Array.from(g.attributes.uv.array);
  const output=[];
  function divide(poly,axis,bound,sign){
    const inside=[],outside=[];let a=poly.at(-1),distA=(position[a*3+axis]-bound)*sign;
    for(const b of poly){
      const distB=(position[b*3+axis]-bound)*sign;
      if((distA<0)!==(distB<0)){
        const t=distA/(distA-distB);let v;
        if(t<1e-8)v=a;
        else if(t>1-1e-8)v=b;
        else {
          v=position.length/3;
          for(const [values,size] of [[position,3],[normal,3],[uv,2]])
            for(let k=0;k<size;k++)values.push(T.MathUtils.lerp(values[a*size+k],values[b*size+k],t));
        }
        inside.push(v);outside.push(v);
      }
      (distB<0?outside:inside).push(b);a=b;distA=distB;
    }
    return [inside,outside];
  }
  function subtract(poly,box){
    const [lo,hi]=box;
    if([0,1,2].some(k=>poly.every(i=>position[i*3+k]<=lo[k])||poly.every(i=>position[i*3+k]>=hi[k])))return [poly];
    if(poly.every(i=>[0,1,2].every(k=>position[i*3+k]>=lo[k]&&position[i*3+k]<=hi[k])))return [];
    const kept=[];let inside=poly;
    for(let k=0;k<3&&inside.length>=3;k++){
      for(const [bound,sign] of [[lo[k],1],[hi[k],-1]]){
        const [part,off]=divide(inside,k,bound,sign);if(off.length>=3)kept.push(off);
        inside=part;if(inside.length<3)break;
      }
    }
    return kept;
  }
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i],b=idx[i+1],c=idx[i+2];
    if(Math.min(position[a*3+1],position[b*3+1],position[c*3+1])>=.390 ||
       Math.max(position[a*3+1],position[b*3+1],position[c*3+1])<=.074){output.push(a,b,c);continue;}
    let pieces=[[a,b,c]];
    for(const box of openings)pieces=pieces.flatMap(poly=>subtract(poly,box));
    for(const poly of pieces)for(let j=2;j<poly.length;j++)
      if(poly[0]!==poly[j-1]&&poly[0]!==poly[j]&&poly[j]!==poly[j-1])output.push(poly[0],poly[j-1],poly[j]);
  }
  g.setAttribute('position',new T.Float32BufferAttribute(position,3));
  g.setAttribute('normal',new T.Float32BufferAttribute(normal,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setIndex(output);g.normalizeNormals();g.applyMatrix4(transform.clone().invert());
  mesh.geometry=g;
}

function finish(name,color,roughness,metalness=0){
  return new T.MeshStandardMaterial({name,color,roughness,metalness});
}
function paintedGrain(name,base,roughness,wood){
  const c=document.createElement('canvas');c.width=384;c.height=192;
  const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,c.width,c.height);
  let seed=936;const next=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<3600;i++){
    const x=next()*384,y=next()*192;
    g.fillStyle=i%3?'rgba(54,42,26,.09)':'rgba(255,235,195,.12)';
    g.fillRect(x,y,wood?4+next()*68:1+next()*5,1+next());
  }
  if(wood)for(let i=0;i<38;i++){
    const x=next()*384,y=next()*192,l=50+next()*280;
    g.strokeStyle=i%3?'rgba(50,35,25,.13)':'rgba(247,215,167,.11)';
    g.beginPath();g.moveTo(x-30,y);
    g.bezierCurveTo(x+l*.24,y+next()*7,x+l*.62,y-next()*6,x+l,y+next()*4);g.stroke();
  }
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
  return new T.MeshStandardMaterial({name,map,roughness});
}
function interior(){
  const room=new T.Group();room.name='五金铺内室';room.userData.hardwareInterior=true;
  const timber=paintedGrain('旧杉木货架','#947654',.78,true);
  const oak=paintedGrain('柜台上油木料','#72543b',.57,true);
  const plaster=paintedGrain('店内旧石灰','#bcad92',.93,false);
  const green=paintedGrain('旧青绿墙裙','#80938a',.81,false);
  const floor=paintedGrain('室内水泥','#968b79',.90,false);
  const dark=finish('货架角钢','#525a54',.61,.44),steel=finish('镀锌零件','#abb3ab',.36,.77);
  const brass=finish('黄铜接头','#b19358',.35,.79),enamel=finish('蓝灰搪瓷','#768e93',.43,.07);
  const copper=finish('旧铜线','#b27748',.41,.64),rubber=finish('墨绿软管','#425b50',.49);
  const cord=finish('麻绳','#af956a',.87),paper=finish('牛皮纸盒','#c0a078',.86),cream=finish('纸签','#ded0ab',.9);
  const oxblood=finish('红褐色铁盒','#92634e',.63,.18),ink=finish('黑铁','#444b49',.56,.54);
  const endwood=paintedGrain('磨亮的木柜包边','#aa8960',.49,true);
  const labelCanvas=document.createElement('canvas');labelCanvas.width=192;labelCanvas.height=80;
  const label=labelCanvas.getContext('2d');
  label.fillStyle='#c8b799';label.fillRect(0,0,192,80);
  label.strokeStyle='#975e46';label.lineWidth=3;label.strokeRect(5,5,182,70);
  label.font='bold 29px "Songti SC",serif';label.fillStyle='#694a33';label.textAlign='center';label.fillText('机 床 油',96,42);
  label.fillRect(35,51,122,2);label.fillRect(51,59,90,2);
  const decal=new T.CanvasTexture(labelCanvas);decal.colorSpace=T.SRGBColorSpace;decal.anisotropy=4;
  const oldLabel=new T.MeshStandardMaterial({name:'旧机油纸标',map:decal,roughness:.91});
  const box=new T.BoxGeometry(),wall=new T.BoxGeometry(1,1,1,32,18,1);
  const longBoard=new T.BoxGeometry(1,1,1,32,1,12),crossBoard=new T.BoxGeometry(1,1,1,12,1,32);
  const drum=new T.CylinderGeometry(1,1,1,20),nut=new T.CylinderGeometry(1,1,1,6);
  const euler=new T.Euler(),quat=new T.Quaternion(),scale=new T.Vector3(),loc=new T.Vector3(),matrix=new T.Matrix4();
  const bins=new Map();let section;
  function item(shape,m,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
    if(!bins.has(m))bins.set(m,[]);
    matrix.compose(loc.set(x,y,z),quat.setFromEuler(euler.set(rx,ry,rz)),scale.set(sx,sy,sz));
    const g=shape.index?shape.toNonIndexed():shape.clone();g.applyMatrix4(matrix);bins.get(m).push(g);
  }
  function apply(name){
    section=new T.Group();section.name=name;room.add(section);
    for(const [mat,items] of bins){
      const g=mergeGeometries(items);const m=new T.Mesh(g,mat);m.name=mat.name;section.add(m);
      for(const each of items)each.dispose();
    }
    bins.clear();
  }
  function plank(m,x,y,z,w,h,d){
    const shape=w>.4?longBoard:d>.4?crossBoard:box;
    item(shape,m,x,y,z,w,h,d);
  }
  function cylinder(m,x,y,z,r,h){item(drum,m,x,y,z,r,h,r);}
  function rollEdge(m,x,y,z,r,gauge){
    const ring=new T.TorusGeometry(r,gauge,5,28);item(ring,m,x,y,z,1,1,1,Math.PI/2);ring.dispose();
  }
  function tin(x,base,z,r,h,body){
    cylinder(body,x,base+h/2,z,r,h);
    rollEdge(steel,x,base+.001,z,r,.0014);
    rollEdge(steel,x,base+h,z,r+.0005,.0016);
    cylinder(steel,x,base+h+.0003,z,r*.9,.001);
    rollEdge(dark,x,base+h+.0011,z,r*.74,.0007);
    cylinder(ink,x+r*.38,base+h+.002,z,r*.17,.0022);
    const wrap=new T.CylinderGeometry(1,1,1,14,1,true,-.79,1.6);
    item(wrap,oldLabel,x,base+h*.49,z,r+.00034,h*.57,r+.00034);
    wrap.dispose();
  }
  function woundWire(m,x,y,z,r,tube,t0,t1,height){
    const path=[];
    for(let i=0;i<=96;i++){
      const t=i/96,a=T.MathUtils.lerp(t0,t1,t);
      path.push(new T.Vector3(r*Math.cos(a),height*t,r*Math.sin(a)));
    }
    const strand=new T.TubeGeometry(new T.CatmullRomCurve3(path),124,tube,5,false);
    item(strand,m,x,y,z);strand.dispose();
  }
  // Only the front and right walls are open. Both look into these same floor,
  // back shelves, racks and open center rather than two independent display bays.
  item(wall,plaster,.012,.268,-.345,.731,.286,.012);
  item(wall,green,.012,.093,-.342,.731,.093,.012);
  item(wall,plaster,-.351,.268,.014,.73,.286,.012,0,Math.PI/2);
  item(wall,green,-.348,.093,.014,.73,.093,.012,0,Math.PI/2);
  // Close only the opaque wall returns behind the scan. At an oblique angle
  // the inner surface must still stop the eye outside the adjacent window.
  // These are the room-facing surfaces of the existing masonry, recessed
  // behind the original glass, green door and sills on both exterior faces.
  const innerFace=new T.PlaneGeometry(1,1,12,6);
  for(const [start,end] of [[-.350,-.245],[.266,.384]])
    item(innerFace,plaster,.345,.278,(start+end)/2,end-start,.186,1,0,-Math.PI/2);
  for(const [start,end] of [[-.352,-.175],[.282,.380]])
    item(innerFace,plaster,(start+end)/2,.278,.345,end-start,.186,1,0,Math.PI);
  // Jambs span the reveal to the inner finish, perpendicular to the glass.
  // Otherwise a grazing ray can slip between the recessed lining and brick.
  for(const [z,turn] of [[-.245,0],[.266,Math.PI]])
    item(innerFace,oak,.370,.263,z,.050,.161,1,0,turn);
  for(const [x,turn] of [[-.175,Math.PI/2],[.282,-Math.PI/2]])
    item(innerFace,oak,x,.264,.370,.050,.163,1,0,turn);
  innerFace.dispose();
  item(wall,floor,.014,.050,.016,.744,.73,.012,-Math.PI/2);
  item(wall,plaster,.014,.402,.016,.744,.73,.009,-Math.PI/2);
  plank(oak,.055,.180,.333,.473,.012,.111);plank(oak,.332,.179,.006,.112,.012,.524);
  plank(timber,.055,.158,.282,.471,.038,.012);plank(timber,.278,.158,.006,.012,.038,.524);
  plank(endwood,.055,.184,.384,.474,.004,.006);plank(endwood,.383,.183,.006,.006,.004,.524);
  // Original shop window includes a small check-out partition just inside the
  // right facade. Keep that post open on both sides down to counter height.
  plank(oak,.361,.260,-.192,.023,.157,.016);
  apply('连通的铺面、墙裙与两侧柜板');

  for(const x of [-.28,-.09,.10,.287])plank(dark,x,.220,-.27,.009,.310,.030);
  for(const h of [.108,.194,.273,.347])plank(timber,.004,h,-.266,.60,.010,.114);
  for(const z of [-.189,.006,.208])plank(oak,-.264,.223,z,.022,.304,.014);
  for(const h of [.114,.208,.295])plank(timber,-.270,h,.009,.124,.012,.429);
  plank(timber,-.012,.27,-.304,.592,.122,.012);
  apply('后货架与左墙货架');

  // Four drawer fronts on each lower shelf with a finger pull and little paper
  // labels, rather than an image of a shelf printed behind the window.
  for(const [j,h] of [.136,.219].entries())for(let i=0;i<4;i++){
    const x=-.237+i*.089+(j?.033:0),z=-.231;
    plank(j?oxblood:oak,x,h,z,.080,.042,.094);
    plank(cream,x-.014,h+.001,z+.048,.026,.010,.0017);
    plank(dark,x+.012,h+.007,z+.050,.020,.003,.004);
  }
  for(let i=0;i<4;i++){
    const x=.104+i*.044,h=.030+(i%2)*.013;
    tin(x,.199,-.245,.017,h,i%2?enamel:steel);
  }
  for(let i=0;i<6;i++){
    const x=-.246+i*.079,w=i%2?.065:.054,z=-.267+(i%2)*.014;
    plank(paper,x,.300,z,w,.044,.066);
    plank(cream,x-.008,.296,z+.0338,w*.42,.013,.0016);
    if(i%3===0)plank(paper,x-.003,.332,z+.002,.042,.019,.048);
  }
  for(let i=0;i<5;i++){
    const z=-.147+i*.071,m=i%2?oxblood:enamel;
    tin(-.264,.215,z,.024,.045,m);
  }
  apply('料斗、带拉手的木抽屉与铁罐');

  // Coils are continuous three-dimensional helices. Varying winding pitch,
  // hanging depth and end lengths make the three materials distinguishable.
  function coil(m,cx,cy,cz,rx,ry,tube,loops){
    const pts=[];
    for(let i=0;i<=loops*30;i++){
      const t=i/(loops*30),a=t*loops*Math.PI*2+.8;
      pts.push(new T.Vector3(cx+rx*Math.cos(a)*(1+.045*Math.sin(a*2)),
        cy+ry*Math.sin(a),cz+(t-.5)*tube*loops*1.58+.0017*Math.sin(a+.4)));
    }
    const last=pts.at(-1);pts.push(last.clone().add(new T.Vector3(.006,-.011,.003)),last.clone().add(new T.Vector3(.005,-.027,.005)));
    const g=new T.TubeGeometry(new T.CatmullRomCurve3(pts),loops*42+8,tube,7,false);
    item(g,m,0,0,0);g.dispose();
    plank(dark,cx,cy+ry+.021,cz,.004,.042,.004);
    cylinder(steel,cx,cy+ry+.003,cz,.005,.006);
  }
  plank(oak,-.052,.378,.011,.463,.012,.022);
  coil(rubber,-.161,.293,.009,.052,.064,.0062,4);
  coil(copper,-.018,.304,-.020,.040,.053,.0038,5);
  coil(cord,.112,.312,.013,.024,.045,.0037,4);
  // The side window sees these from another axis and can see through the loops.
  apply('悬挂软管、铜线和麻绳');

  function spool(x,h,z,r,height,wire){
    cylinder(oak,x,h+.003,z,r,.006);cylinder(wire,x,h+height/2,z,r*.72,height-.006);
    woundWire(wire,x,h+.005,z,r*.74,.0011,.4,Math.PI*21,height-.011);
    cylinder(timber,x,h+height-.002,z,r,.005);rollEdge(endwood,x,h+height,z,r*.97,.0012);
    cylinder(steel,x,h+height+.0005,z,r*.22,.0015);
    cylinder(ink,x,h+height+.0015,z,r*.13,.0010);
    plank(cream,x-r*.46,h+height+.0016,z+r*.12,r*.23,.0008,r*.33);
  }
  spool(.004,.186,.267,.035,.044,copper);spool(.092,.186,.283,.023,.034,dark);
  // A shallow metal tray, L-shaped brass pipe fittings and several hex nuts.
  plank(steel,-.108,.192,.316,.096,.004,.062);
  for(const x of [-.155,-.061])plank(steel,x,.198,.316,.003,.012,.060);
  for(const z of [.286,.346])plank(steel,-.108,.198,z,.094,.012,.003);
  for(let i=0;i<5;i++){
    const x=-.138+(i%3)*.027,z=.302+Math.floor(i/3)*.023;
    item(nut,brass,x,.201,z,.008+.001*(i%2),.010,.008+.001*(i%2));
    cylinder(ink,x,.2062,z,.0032,.00065);
  }
  for(const z of [-.112,-.074,.022]){cylinder(brass,.326,.200,z,.010,.029);item(drum,brass,.318,.200,z,.008,.018,.008,0,0,Math.PI/2);}
  for(let i=0;i<2;i++){const z=.106+i*.064;tin(.334,.184,z,.019,.049,i?oxblood:enamel);}
  // Retain open air behind handles and between each hung tool and the left rack.
  plank(timber,-.224,.344,.094,.018,.013,.181);
  for(let i=0;i<4;i++){
    const z=.029+i*.038;
    plank(i%2?rubber:oak,-.211,.290,z,.010,.053,.012);
    plank(steel,-.211,.326,z,.006,.024,.007);
    if(i%2===0)plank(steel,-.211,.339,z,.023,.010,.018);
    else {plank(steel,-.21,.339,z-.004,.009,.012,.004);plank(steel,-.21,.340,z+.004,.009,.011,.004);}
  }
  apply('柜台前景五金、线轴与挂钩上的工具');
  for(const shape of [box,wall,longBoard,crossBoard,drum,nut])shape.dispose();
  return lightHardwareInterior(room);
}
export function fitHardwareShop(model){
  model.updateWorldMatrix(true,true);
  model.traverse(mesh=>{if(mesh.isMesh)cutShell(mesh);});
  model.add(interior());
  return model;
}
