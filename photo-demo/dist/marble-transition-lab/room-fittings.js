// Furniture and architectural joinery, in metres. Static surfaces are batched
// by finish so hundreds of small tiles, books and fasteners share draw calls.
import * as T from 'three';
import {mergeGeometries} from '../vendor/addons/utils/BufferGeometryUtils.js';

const tiles=new Map();
function surfaceMap(kind){
  if(tiles.has(kind))return tiles.get(kind);
  const n=256, canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(n,n);
  let seed=18431;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=x/n*Math.PI*2,v=y/n*Math.PI*2;
    let value=216+(random()-.5)*18;
    if(kind==='wood'){
      const rings=Math.cos(19*v+.7*Math.sin(u)+2.1*Math.sin(v)+.25*Math.cos(2*u+v));
      value+=15*rings-38*Math.max(0,rings)**7+9*Math.sin(70*v+Math.sin(u));
    }else if(kind==='cloth')value+=10*Math.sin(70*u)*Math.sin(70*v)+5*Math.cos(91*v);
    else value+=6*Math.cos(2*u+v)+4*Math.cos(4*v-u)+3*Math.sin(8*u+6*v);
    const at=(y*n+x)*4;pixels.data.set([value,value,value,255],at);
  }
  ctx.putImageData(pixels,0,0);
  const tex=new T.CanvasTexture(canvas);tex.wrapS=tex.wrapT=T.RepeatWrapping;
  tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;tiles.set(kind,tex);return tex;
}

export function workshop(root,timberMaps){
  const materials=new Map(),batches=new Map(),up=new T.Vector3(0,1,0);
  const cube=new T.BoxGeometry(),post=new T.CylinderGeometry(1,1,1,16);
  const wood=(color)=>finish(color,'wood'),cloth=color=>finish(color,'cloth');
  function finish(color,kind='matte'){
    const key=kind+color;if(materials.has(key))return materials.get(key);
    const metal=kind==='metal',glaze=kind==='glaze';
    const mat=new T.MeshStandardMaterial({color,roughness:metal?.38:glaze?.22:.82,metalness:metal?.68:0});
    if(kind==='wood'&&timberMaps){
      [mat.map,mat.normalMap,mat.roughnessMap]=timberMaps;mat.normalScale.set(.31,.31);
      mat.userData.surface='timber';mat.roughness=.76;
    }else if(['wood','stone','cloth'].includes(kind)){
      mat.map=mat.bumpMap=surfaceMap(kind);mat.bumpScale=kind==='stone'?.018:.006;
    }
    materials.set(key,mat);return mat;
  }
  function put(geometry,material,x,y,z,sx=1,sy=1,sz=1,rot=0){
    const g=geometry.index?geometry.toNonIndexed():geometry.clone();
    const q=typeof rot==='number'?new T.Quaternion().setFromAxisAngle(up,rot):rot;
    if(material.userData.surface==='timber'){
      const {position:p,normal:n,uv}=g.attributes,offset=(Math.abs(x*17+z*11+y*3)%11+.18)/12;
      for(let i=0;i<p.count;i++){
        if(geometry===cube){
          const X=p.getX(i)*sx,Y=p.getY(i)*sy,Z=p.getZ(i)*sz;
          const along=sx>=sy&&sx>=sz?X:sy>=sz?Y:Z;
          const across=Math.abs(n.getY(i))>.6?(sx>=sz?Z:X):Math.abs(n.getX(i))>.6?(sy>=sz?Z:Y):(sx>=sy?Y:X);
          uv.setXY(i,along/2.2+x*.31,offset+Math.tanh(across*5)*.027);
        }else uv.setXY(i,uv.getX(i)*.82+x*.31,offset+(uv.getY(i)-.5)*.050);
      }
    }
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x,y,z),q,new T.Vector3(sx,sy,sz)));
    if(material.userData.surface==='deck'||material.userData.surface==='plaster'){
      const {position:p,normal:n,uv}=g.attributes;
      for(let i=0;i<p.count;i++){
        if(material.userData.surface==='deck')uv.setXY(i,p.getZ(i)/3.35,p.getX(i)/2.72);
        else if(Math.abs(n.getY(i))>.7)uv.setXY(i,p.getX(i)/2.8,p.getZ(i)/2.8);
        else uv.setXY(i,(Math.abs(n.getX(i))>.7?p.getZ(i):p.getX(i))/2.8,p.getY(i)/2.8);
      }
    }
    if(!batches.has(material))batches.set(material,[]);batches.get(material).push(g);
  }
  function scanned(surface,color,maps){
    const [map,normalMap,roughnessMap]=maps;
    const mat=new T.MeshStandardMaterial({color,map,normalMap,roughnessMap,roughness:.86,
      normalScale:new T.Vector2(.67,.67)});
    mat.userData.surface=surface;materials.set(mat,mat);return mat;
  }
  const box=(x,y,z,w,h,d,m,rot=0)=>put(cube,m,x,y,z,w,h,d,rot);
  function slab(x,y,z,w,h,d,edge,m){
    const e=Math.min(edge,h*.32),shape=new T.Shape(),a=w*.5-e,b=d*.5-e;
    shape.moveTo(-a,-b);shape.lineTo(a,-b);shape.lineTo(a,b);shape.lineTo(-a,b);shape.closePath();
    const g=new T.ExtrudeGeometry(shape,{depth:h-e*2,bevelEnabled:true,bevelThickness:e,bevelSize:e,bevelSegments:3});
    g.rotateX(-Math.PI/2);put(g,m,x,y-h/2+e,z);g.dispose();
  }
  function weave(base,accent){
    const key='woven'+base+accent;if(materials.has(key))return materials.get(key);
    const c=document.createElement('canvas');c.width=768;c.height=512;const ctx=c.getContext('2d');
    ctx.fillStyle=base;ctx.fillRect(0,0,768,512);ctx.fillStyle=accent;
    for(const [y,h] of [[22,4],[35,10],[62,3],[447,3],[467,10],[486,4]])ctx.fillRect(0,y,768,h);
    function diamond(x,y,w,h){
      ctx.beginPath();ctx.moveTo(x-w,y);ctx.lineTo(x,y-h);ctx.lineTo(x+w,y);ctx.lineTo(x,y+h);ctx.closePath();ctx.stroke();
    }
    ctx.strokeStyle=accent;ctx.lineWidth=5;
    for(let k=0;k<5;k++){
      const x=(k+.5)*768/5;diamond(x,256,74,100);diamond(x,256,54,73);diamond(x,256,20,28);
      for(const y of [106,406])diamond(x,y,19,17);
    }
    ctx.fillStyle='rgba(247,229,183,.12)';for(let y=1;y<512;y+=3)ctx.fillRect(0,y,768,1);
    ctx.fillStyle='rgba(38,34,28,.13)';for(let x=1;x<768;x+=3)ctx.fillRect(x,0,1,512);
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    const mat=new T.MeshStandardMaterial({map,bumpMap:surfaceMap('cloth'),bumpScale:.005,roughness:.95,side:T.DoubleSide});
    materials.set(key,mat);return mat;
  }
  function cover(x,y,z,width,depth,m){
    // Woven throw follows the mattress edge and falls in soft folds on either side.
    const positions=[],uv=[],index=[],columns=32,rows=16;
    for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
      const u=i/columns,v=j/rows,s=2*u-1,flap=Math.max(0,(Math.abs(s)-.82)/.18);
      const px=Math.sign(s)*(Math.min(Math.abs(s),.82)*width/.82*.5+Math.sin(flap*1.49)*.077);
      const folds=(.006+.013*flap)*Math.sin(v*25+s*3)+.007*Math.cos(s*16+v*3);
      positions.push(px,y-.23*flap*flap+folds,(v-.5)*depth+.016*Math.sin(s*13));uv.push(u,1-v);
    }
    for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const a=j*(columns+1)+i;index.push(a,a+columns+1,a+1,a+1,a+columns+1,a+columns+2);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setIndex(index);g.computeVertexNormals();put(g,m,x,0,z);g.dispose();
  }
  function rod(a,b,r,m){
    const v=new T.Vector3(...a),delta=new T.Vector3(...b).sub(v),length=delta.length();
    const q=new T.Quaternion().setFromUnitVectors(up,delta.normalize());v.addScaledVector(delta,length/2);put(post,m,v.x,v.y,v.z,r,length,r,q);
  }
  function turned(x,y,z,profile,m,segments=32){
    const g=new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r,h)),segments);put(g,m,x,y,z);g.dispose();
  }
  function ring(x,y,z,r,t,m,rot=0){
    const g=new T.TorusGeometry(r,t,8,48);put(g,m,x,y,z,1,1,1,rot);g.dispose();
  }
  function painting(x,y,z,w,h,draw,ry=0){
    const c=document.createElement('canvas');c.width=768;c.height=Math.max(220,Math.round(768*h/w));
    draw(c.getContext('2d'),c.width,c.height);const map=new T.CanvasTexture(c);
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
    const m=new T.MeshStandardMaterial({map,roughness:.84});materials.set(map,m);
    const g=new T.PlaneGeometry(w,h);put(g,m,x,y,z,1,1,1,ry);g.dispose();
  }
  const oak=wood('#bd8e60'),dark=wood('#70503b'),brass=finish('#b79050','metal'),ivory=finish('#f3e3bf','glaze');
  function table(x,z,w,d,h=.80){
    slab(x,h,z,w,.085,d,.016,oak);
    for(const side of [-1,1]){
      box(x,h-.13,z+side*(d/2-.08),w-.14,.16,.045,dark);
      for(const end of [-1,1])turned(x+end*(w/2-.12),0,z+side*(d/2-.10),[[.055,0],[.067,.06],[.042,.14],[.05,h*.65],[.069,h-.12],[.065,h]],dark,12);
    }
  }
  function bench(x,z,w,ry=0){
    const pos=(u,v)=>[x+u*Math.cos(ry)+v*Math.sin(ry),z-u*Math.sin(ry)+v*Math.cos(ry)];
    for(let i=0;i<3;i++){const [a,b]=pos(0,(i-1)*.132);box(a,.46,b,w,.065,.124,oak,ry);}
    for(const side of [-1,1]){
      const u=side*(w/2-.14),[a,b]=pos(u,0);box(a,.37,b,.105,.15,.35,dark,ry);
      for(const end of [-1,1]){
        const [ax,az]=pos(u+side*.055,end*.178),[bx,bz]=pos(u,end*.123);
        rod([ax,.02,az],[bx,.394,bz],.039,dark);
        const [px,pz]=pos(u,end*.131);turned(px,.489,pz,[[.010,0],[.012,.003],[.009,.005]],brass,10);
      }
    }
    box(x,.22,z,w-.28,.052,.05,dark,ry);
  }
  function curtain(x,top,z,width,height,yaw,tint){
    const p=[],uv=[],index=[],nx=30,ny=18,m=cloth(tint);m.side=T.DoubleSide;
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const u=i/nx,t=j/ny,fold=Math.cos(u*Math.PI*10+.26*Math.sin(t*4+u*5));
      p.push((u-.5)*width*(.82+.18*t)+.027*Math.sin(t*2.8),
        -height*t+.018*t*t*fold,.044*fold*(.65+.55*t)+.028*Math.sin(t*4+u*2));
      uv.push(u,1-t);
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;index.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setIndex(index);g.computeVertexNormals();put(g,m,x,top,z,1,1,1,yaw);g.dispose();
  }
  function vase(x,y,z,s,color){
    turned(x,y,z,[[.075,0],[.14,.03],[.19,.16],[.165,.32],[.09,.39],[.09,.46],[.105,.47],[.105,.49],[.077,.49],[.071,.44]],finish(color,'glaze'),28);
    // A second small cup makes the hand-thrown scale readable beside it.
    if(s)turned(x+.26,y,z+.03,[[.047,0],[.064,.011],[.084,.115],[.076,.125],[.066,.118],[.04,.024]],ivory,24);
  }
  function books(x,y,z,count){
    const colors=['#a86b44','#566e63','#af9a68','#4d7279','#a15143'];
    for(let i=0;i<count;i++){const w=.068+i%3*.017,h=.28+(i*7%5)*.036;
      box(x,y+h/2,z,w,h,.21,cloth(colors[i%5]));box(x,y+h*.80,z+.107,w*.82,.009,.005,brass);x+=w+.012;}
  }
  function foliage(x,y,z,size){
    const leaf=new T.SphereGeometry(1,12,8),green=finish('#597057'),sage=finish('#879265');
    turned(x,y,z,[[.14,0],[.19,.045],[.245,.32],[.259,.34],[.26,.38],[.21,.38],[.20,.34]],finish('#ae7555','stone'));
    for(let i=0;i<7;i++){
      const a=i*2.4,dx=Math.cos(a)*size*.34,dz=Math.sin(a)*size*.34,H=size*(.50+(i%4)*.12);
      rod([x,y+.30,z],[x+dx,y+.31+H,z+dz],.009,green);
      for(let j=1;j<=4;j++){const t=j/4,s=j%2?1:-1;
        const dir=new T.Vector3(Math.cos(a+.9*s),.54,Math.sin(a+.9*s)).normalize();
        const q=new T.Quaternion().setFromUnitVectors(up,dir);
        put(leaf,i%3?sage:green,x+dx*t+dir.x*.058,y+.30+H*t,z+dz*t+dir.z*.058,.038,size*.105,.015,q);
      }
    }
    leaf.dispose();
  }
  function lantern(x,y,z){
    turned(x,y,z,[[.15,0],[.16,.024],[.15,.052],[.10,.072],[.10,.11],[.135,.13]],brass);
    const amber=finish('#ddaf6e','glaze');amber.emissive.set('#f7ad58');amber.emissiveIntensity=.54;
    turned(x,y+.12,z,[[.095,0],[.123,.06],[.105,.24],[.065,.32]],amber);
    for(let i=0;i<4;i++){const a=i*Math.PI*.5;
      rod([x+.126*Math.sin(a),y+.10,z+.126*Math.cos(a)],[x+.093*Math.sin(a),y+.45,z+.093*Math.cos(a)],.009,dark);}
    turned(x,y+.43,z,[[.14,0],[.14,.025],[.078,.078],[.041,.12],[.062,.14]],brass);
    ring(x,y+.62,z,.077,.009,dark);
  }
  function journal(x,y,z,title,kind='sea'){
    const tilt=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);
    box(x,y+.011,z,.60,.025,.39,cloth('#647569'));
    box(x,y+.034,z,.585,.035,.379,finish('#e1cfaa'));
    for(const side of [-1,1])painting(x+side*.149,y+.053,z,.279,.36,printChart(kind,title),tilt);
    box(x,y+.055,z,.008,.004,.365,wood('#a58a6c'));
    rod([x+.38,y+.019,z-.13],[x+.44,y+.019,z+.15],.009,brass);
  }
  function shade(x,y,z){
    rod([x,y+.17,z],[x,y+.55,z],.012,brass);
    turned(x,y,z,[[.24,0],[.245,.018],[.18,.07],[.075,.17],[.036,.175]],finish('#66887e','metal'));
    const bulb=finish('#fff0ca');bulb.emissive.set('#ffcf86');bulb.emissiveIntensity=.48;
    turned(x,y-.025,z,[[.008,0],[.08,.015],[.12,.035],[.05,.07]],bulb);
  }
  function hull(x,y,z,len,width,material,ry=0){
    const stations=30,sides=10,verts=[],uv=[],idx=[];
    for(let i=0;i<=stations;i++){const u=i/stations,beam=Math.pow(Math.sin(Math.PI*u),.72);
      for(let j=0;j<=sides;j++){const a=Math.PI*(j/sides-.5);
        verts.push(Math.sin(a)*width*.5*beam,.26*width*(1-Math.cos(a))+.13*width*(1-beam),(u-.5)*len);
        uv.push(u*3,j/sides);}
    }
    for(let i=0;i<stations;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j;idx.push(a,a+1,a+sides+1,a+1,a+sides+2,a+sides+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=material.clone();m.side=T.DoubleSide;materials.set(m,m);put(g,m,x,y,z,1,1,1,ry);g.dispose();
  }
  function finishBatches(){
    for(const [m,parts] of batches){const mesh=new T.Mesh(mergeGeometries(parts),m);
      mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);parts.forEach(g=>g.dispose());}
    batches.clear();cube.dispose();post.dispose();
  }
  function dispose(){for(const m of materials.values()){if(m.map&&!m.userData.surface&&!m.map.isDataTexture&&![...tiles.values()].includes(m.map))m.map.dispose();m.dispose();}}
  return {box,rod,ring,turned,painting,slab,cover,weave,table,bench,curtain,vase,books,shade,hull,foliage,lantern,journal,put,finish,scanned,wood,cloth,oak,dark,brass,ivory,finishBatches,dispose};
}

export function printChart(kind,title){
  return (c,w,h)=>{
    c.fillStyle=kind==='stars'?'#233e47':kind==='botany'?'#e7dbc0':'#ecdfbd';c.fillRect(0,0,w,h);
    c.strokeStyle=kind==='stars'?'#adbcab':'#78795d';c.lineWidth=1.4;
    c.strokeRect(w*.04,h*.05,w*.92,h*.90);c.strokeRect(w*.054,h*.072,w*.892,h*.856);
    const pale=kind==='stars'?'#e2cca0':'#365b53';c.fillStyle=pale;c.textAlign='center';
    c.font='500 '+Math.round(h*.105)+'px Georgia, serif';c.fillText(title,w/2,h*.22);
    c.save();c.translate(w*.5,h*.60);
    if(kind==='botany'){
      for(let k=-1;k<=1;k++){c.save();c.translate(k*w*.21,h*.04);c.rotate(k*.27);c.strokeStyle='#526b48';c.lineWidth=2;
        c.beginPath();c.moveTo(0,h*.25);c.quadraticCurveTo(-w*.04,0,0,-h*.26);c.stroke();
        for(let i=0;i<9;i++)for(const s of [-1,1]){c.fillStyle=i%2?'#657f60':'#879575';c.beginPath();c.ellipse(s*(12+i*.8),h*.13-i*h*.045,6+i*.5,h*.045,-s*.75,0,Math.PI*2);c.fill();}c.restore();}
    }else if(kind==='stars'){
      const r=h*.285;for(const f of [.33,.66,1]){c.beginPath();c.ellipse(0,0,r*1.58*f,r*f,0,0,Math.PI*2);c.stroke();}
      for(let i=0;i<83;i++){const t=i*2.39996,rad=r*Math.sqrt(i/83);c.fillStyle=i%8?pale:'#fff1b6';c.beginPath();c.arc(Math.cos(t)*rad*1.58,Math.sin(t)*rad,i%9?1.5:3.1,0,Math.PI*2);c.fill();}
    }else{
      const pts=[];for(let k=0;k<6;k++){c.beginPath();for(let i=0;i<140;i++){
        const x=(i/139-.5)*w*.79,y=(Math.sin(i*.059+k*.23)*.078+Math.sin(i*.111+k*.24)*.039+(k-2.5)*.044)*h;i?c.lineTo(x,y):c.moveTo(x,y);if(k===4&&i%30===12)pts.push([x,y]);}c.stroke();}
      c.fillStyle='#a56143';for(const [x,y] of pts){c.beginPath();c.arc(x,y,3,0,7);c.fill();}
    }c.restore();
  };
}
