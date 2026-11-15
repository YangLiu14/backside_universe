import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {shopProfile} from './architecture.js';
import {fittedShell} from './shop-shell.js';
import {finishCanvasHem} from './frontage-patina.js';

// The cell numbers follow the photographs of the merchandise, in reading order.
const trades = [
  {names:['永顺车行','飞轮修车','街角单车'], paint:'#45716a', trim:'#573f2c', cloth:null, mark:'enamel'},
  {names:['青禾菜铺','南园菜店','小春果行'], paint:'#536745', trim:'#775335', cloth:['#536442','#b1af85'], mark:'valance'},
  {names:['松间茶庄','陆记茶行','云山茶栈'], paint:'#64452c', trim:'#493728', cloth:null, mark:'wood'},
  {names:['丰记粮行','桥西米店','三和粮号'], paint:'#78654d', trim:'#5e432f', cloth:null, mark:'vertical'},
  {names:['文光书店','旧书小屋','青石书局'], paint:'#465d62', trim:'#574637', cloth:null, mark:'wood'},
  {names:['锦云裁缝','绣春布庄','素衣裁缝'], paint:'#6c4c4d', trim:'#533e32', cloth:['#886158','#aa8977'], mark:'curtain'},
  {names:['阿婆面馆','巷口面家','庆和汤面'], paint:'#675149', trim:'#594232', cloth:['#773e30','#783e30'], mark:'curtain'},
  {names:['广益五金','顺发五金','长青五金'], paint:'#455b57', trim:'#4e4c42', cloth:null, mark:'enamel'},
  {names:['同兴钟表','光华钟表','精时钟表'], paint:'#5d5548', trim:'#644a32', cloth:null, mark:'clock'},
  {names:['青瓷杂货','明和瓷庄','和记碗铺'], paint:'#536777', trim:'#5b5040', cloth:['#4c6370','#918c76'], mark:'valance'},
  {names:['花间小铺','沐春花房','叶青花舍'], paint:'#547467', trim:'#685440', cloth:['#b9ab82','#b1a17e'], mark:'wood'},
  {names:['永安药材','同和药铺','济安草堂'], paint:'#6b4c35', trim:'#543a28', cloth:null, mark:'vertical'}
];
const mainShops=new Map([['0/-1',0],['0/1',8],['1/-1',1],['1/1',3],['2/-1',4],['2/1',5],
  ['3/-1',2],['3/1',6],['4/-1',7],['4/1',9],['7/1',10],['8/-1',11]]);
export const shopRoles=['shop-cycle','shop-greens','shop-tea','shop-grain','shop-books','shop-tailor','shop-noodles','shop-tools','shop-clock','shop-porcelain','shop-florist','shop-herbs'];
const secondary=[10,2,7,11,3,8,5,0,9,6,4,1,2,6];
const boxGeo=new T.BoxGeometry(), cylinderGeo=new T.CylinderGeometry(1,1,1,16);
const ballGeo=new T.SphereGeometry(1,10,7);
function vary(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function canvasMaterial(canvas){
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
  return new T.MeshStandardMaterial({map,roughness:.86,side:T.DoubleSide});
}
function weatheredCanvas(width,height,base,finish,seed){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),rng=vary(seed);
  ctx.fillStyle=base;ctx.fillRect(0,0,width,height);
  for(let i=0;i<height*2;i++){
    ctx.strokeStyle=i%2?'rgba(40,23,12,.075)':'rgba(250,229,180,.08)';
    const y=rng()*height,x=rng()*width;ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x+rng()*width*(finish==='wood'?.8:.13),y+rng()*1.4);ctx.stroke();
  }
  for(let i=0;i<width*height*.047;i++){
    ctx.fillStyle=i%2?'rgba(18,12,7,.16)':'rgba(247,234,202,.18)';
    ctx.fillRect(rng()*width,rng()*height,1+rng()*1.8,1);
  }
  return canvas;
}
const finishes=new Map();
function grain(color,style='wood'){
  const key=color+style;if(!finishes.has(key))finishes.set(key,canvasMaterial(weatheredCanvas(128,128,color,style,527)));
  return finishes.get(key);
}
const solid=new Map();
function pigment(color){
  if(!solid.has(color))solid.set(color,new T.MeshStandardMaterial({color,roughness:.78}));
  return solid.get(color);
}

// Set the letters on the physical surface. Vertical wood, canvas hems and
// workshop enamel use different lettering, borders and fasteners.
function lettering(text,base,mode,vertical=false,ink='#e9ddbb',seed=51,aspect=4){
  const w=vertical?128:512,h=vertical?512:128;
  const c=weatheredCanvas(w,h,base,mode==='wood'||vertical?'wood':'paint',seed),ctx=c.getContext('2d');
  if(mode==='enamel'){
    ctx.strokeStyle='#a5ac91';ctx.lineWidth=2;ctx.strokeRect(8,8,w-16,h-16);
    for(const x of [16,w-16])for(const y of [14,h-14]){ctx.beginPath();ctx.arc(x,y,2.4,0,7);ctx.fillStyle='#554b39';ctx.fill();}
  }
  ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=(mode==='enamel'?'600 ':'700 ')+(vertical?89:82)+'px "STKaiti","Kaiti SC","Songti SC","Noto Serif CJK SC",serif';
  if(!vertical){ctx.translate(w/2,0);ctx.scale(4/Math.max(4,aspect),1);ctx.translate(-w/2,0);}
  [...text].forEach((ch,i)=>{
    const frac=(i+.5)/text.length;
    ctx.fillText(ch,vertical?w/2:w*(.07+.86*frac),vertical?h*(.06+.88*frac):h*.53,vertical?w*.77:w*.86/text.length);
  });
  return canvasMaterial(c);
}

// Merge fixed pieces of the same finish within each shop. Each physical shop
// remains a separate editable group with its own sign and display geometry.
class Joinery {
  constructor(){this.groups=new Map();}
  piece(geometry,material,x,y,z,sx,sy,sz,rotation=[0,0,0]){
    const m=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(sx,sy,sz));
    const g=geometry.clone().applyMatrix4(m);if(!this.groups.has(material))this.groups.set(material,[]);this.groups.get(material).push(g);
  }
  box(mat,x,y,z,w,h,d){this.piece(boxGeo,mat,x,y,z,w,h,d);}
  put(g,mat){if(!this.groups.has(mat))this.groups.set(mat,[]);this.groups.get(mat).push(g);}
  finish(parent){
    for(const [mat,items] of this.groups){
      const geometry=mergeGeometries(items);
      const mesh=new T.Mesh(geometry,mat);mesh.name=mat.name||'店面构件';
      if(mat===shelfGlass)mesh.customDepthMaterial=clearPaneDepth;
      parent.add(mesh);
      for(const g of items)g.dispose();
    }
  }
}
function valance(j,mat,x,y,z,width,height,scallops){
  const nx=40,p=[],uv=[],index=[];
  for(let i=0;i<=nx;i++){
    const t=i/nx,lip=height*(.74+.26*Math.sin(t*scallops*Math.PI)**2);
    p.push(x+(t-.5)*width,y-lip,z+.002*Math.sin(t*Math.PI*8), x+(t-.5)*width,y,z);
    uv.push(t,0,t,1);if(i<nx){let a=i*2;index.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();j.put(g,mat);
}

function stock(j,type,x,z,variant,width,finishes){
  const rng=vary(307+variant*17+type),timber=grain('#876444'),iron=pigment('#534d42');
  if(type===0){
    for(let i=0;i<2;i++){
      const dx=x+(i-.5)*width*.45,cy=.116-i*.014,rad=.059;
      j.piece(new T.TorusGeometry(rad,.005,5,28),iron,dx,cy,z,1,1,1);
      for(let n=0;n<5;n++)j.piece(boxGeo,pigment('#9b9981'),dx,cy,z,.002,rad*2,.002,[0,0,n*Math.PI/5]);
    }
  }else if(type===1||type===3||type===10){
    const colors=type===1?['#bd8036','#88984e','#597237']:type===10?['#a16a78','#ac8f65','#57714c']:['#c2ac79','#a38660','#d1b788'];
    for(let k=0;k<3;k++){
      const dx=x+(k-1)*width*.29,bw=width*.265;
      if(type===3){
        const sack=new T.LatheGeometry([[.74,0],[.97,.10],[1,.36],[.92,.69],[.85,.88],[.97,.92],[.92,1],[.84,.96]].map(([r,h])=>new T.Vector2(r,h)),16);
        j.piece(sack,finishes.burlap,dx,.035,z,bw*.46,.079,.036);
        j.piece(ballGeo,finishes.grain,dx,.108,z,bw*.40,.008,.031);
      }else{
        j.box(finishes.crate,dx,.044,z,bw,.053,.068);
        for(let s=0;s<3;s++)j.box(finishes.crate,dx,.028+s*.016,z+.036,bw,.010,.007);
        for(let n=0;n<12;n++){
          const t=type===1?.012:.009;
          const bx=dx+(n%4-1.5)*bw*.19,by=.078+(type===10?(n%3)*.018:0)+rng()*.007;
          j.piece(ballGeo,pigment(colors[k]),bx,by,z+(Math.floor(n/4)-1)*.017,t,.011+(type===10?.016:0),t);
        }
      }
    }
  }else if(type===4||type===5||type===7){
    for(let n=0;n<8;n++){
      const c=['#88919a','#975749','#bcad84','#655b4e'][n%4],dx=x+(n-3.5)*width*.088;
      if(type===5)j.piece(cylinderGeo,grain(c,'cloth'),dx,.118,z,.011,.1+n%3*.017,.013,[0,0,(n%3-1)*.09]);
      else if(type===7){j.box(grain('#72563a'),dx,.082,z,.027,.074,.04);j.box(pigment('#b4a37a'),dx,.083,z+.022,.014,.007,.002);}
      else j.piece(boxGeo,pigment(c),dx,.094,z,.012+n%2*.003,.069+n%3*.012,.035,[0,0,(n%3-1)*.065]);
    }
  }else if(type===8){
    const dial=weatheredCanvas(128,128,'#cfc2a0','paint',12),c=dial.getContext('2d');c.translate(64,64);
    for(let i=0;i<12;i++){c.fillStyle='#4b4031';c.fillRect(-2,-50,4,8);c.rotate(Math.PI/6);}
    c.strokeStyle='#42382b';c.lineWidth=4;c.beginPath();c.moveTo(-18,-13);c.lineTo(0,0);c.lineTo(15,-27);c.stroke();
    const mat=canvasMaterial(dial),g=new T.CircleGeometry(1,32);j.piece(g,mat,x,.192,z,.044,.052,1);
    j.piece(new T.TorusGeometry(.05,.004,6,32),timber,x,.192,z+.001,.91,1,1);
  }else{
    for(let n=0;n<5;n++){
      const dx=x+(n-2)*width*.147;
      if(type===6){for(let s=0;s<2+n%3;s++)j.piece(cylinderGeo,grain('#ac8152'),dx,.062+s*.017,z,.025,.014,.029);}
      else{
        const mat=pigment((type===9?['#c9c7af','#799197','#a18b70']:['#70765c','#947249','#ae9264'])[n%3]);
        j.piece(ballGeo,mat,dx,.076,z,.019,.027+n%2*.008,.023);
        j.piece(cylinderGeo,mat,dx,.101+n%2*.007,z,.012,.015,.014);
      }
    }
  }
}

function turned(profile,segments=24){
  return new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r,h)),segments);
}
const jarGeo=turned([[0,0],[.59,0],[.72,.055],[.80,.13],[.94,.46],[.87,.74],[.54,.86],[.49,.93],[.57,.94],[.56,1],[.42,1],[.39,.92],[.43,.88]],32);
const bottleGeo=turned([[0,0],[.69,0],[.77,.025],[.80,.08],[.80,.64],[.65,.72],[.31,.79],[.31,.91],[.40,.92],[.40,.99],[.33,1],[.25,.99],[.25,.91]],20);
const bowlGeo=turned([[0,0],[.39,0],[.44,.12],[.46,.2],[.73,.55],[.94,.82],[1,.92],[.98,1],[.90,.99],[.84,.84],[.66,.55],[.38,.27],[0,.22]],32);
const tinGeo=turned([[0,0],[.93,0],[1,.035],[1,.064],[.96,.075],[.96,.90],[1,.925],[1,.973],[.95,1],[0,1]],20);
const ceramicWare=new Map();
function glazed(colour){
  if(ceramicWare.has(colour))return ceramicWare.get(colour);
  const c=weatheredCanvas(256,256,colour,'paint',283),g=c.getContext('2d');
  g.fillStyle='#435a66';g.fillRect(0,79,256,3);g.fillRect(0,84,256,1);g.fillRect(0,244,256,2);
  const rng=vary(61);g.strokeStyle='#485b70';g.fillStyle='#445b6f';
  for(let branch=0;branch<4;branch++){
    const bx=branch*67-7;g.beginPath();g.lineWidth=2;
    g.moveTo(bx,176);g.bezierCurveTo(bx+16,162,bx+32,126,bx+48,113);g.stroke();
    for(let i=0;i<8;i++){
      const x=bx+7+i*5, y=169-i*7+rng()*5, dir=i%2?-1:1;
      g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+dir*9,y-2,x+dir*12,y-12);g.quadraticCurveTo(x+dir*3,y-10,x,y);g.fill();
      if(i%3===0)for(let k=0;k<5;k++){const a=k*Math.PI*.4;
        g.beginPath();g.ellipse(x+dir*11+Math.cos(a)*4,y-13+Math.sin(a)*4,2.4,3.5,a+.4,0,Math.PI*2);g.fill();}
    }
  }
  const m=canvasMaterial(c);m.name='釉面青花陶器';m.roughness=.25;m.envMapIntensity=1.25;
  ceramicWare.set(colour,m);return m;
}
const clearPaneDepth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,opacity:0,alphaTest:.5});
const shelfGlass=new T.MeshStandardMaterial({name:'旧平板玻璃',color:0x8da399,transparent:true,opacity:.17,
  depthWrite:false,roughness:.14,metalness:.16,envMapIntensity:1.25,side:T.DoubleSide});
const shelfTin=new T.MeshStandardMaterial({name:'镀锡盖与搪瓷薄边',color:0xb9aaa0,metalness:.72,roughness:.36});
const bayBackdrop=new T.PlaneGeometry();
const groceryPaper=grain('#b99460','paint'), cupboardPaint=grain('#606b5a','paint');
function displayStock(j,cell,x,bottom,depth,w,h,edition,finishes){
  const rng=vary(371+cell*283+edition*159+Math.round(x*800));
  const nx=Math.max(2,Math.min(10,Math.round(w/(cell===1||cell===10?.098:.062))));
  const itemHalf=w/(nx*2.2);
  const brown=glazed('#a58262'),blue=glazed('#bec4b0'),ivory=glazed('#d5c5a1');
  for(let i=0;i<nx;i++){
    const px=x+(i+.5-nx/2)*w/nx, pz=depth+(rng()-.4)*.018;
    const size=itemHalf*(.74+rng()*.26),height=h*(.47+rng()*.35);
    if(cell===4 || cell===5){
      const paper=grain(['#866343','#495a5c','#a18364'][(i+edition)%3],'cloth');
      for(let b=0;b<3;b++){
        const bx=px+(b-1)*size*.53,bh=height*(.82+rng()*.17);
        if(cell===4){
          j.box(paper,bx,bottom+bh/2,pz,size*.40,bh,size*1.03);
          j.box(groceryPaper,bx,bottom+bh*.76,pz+size*.52,size*.27,bh*.07,.001);
        }else j.piece(cylinderGeo,paper,bx,bottom+bh*.46,pz,size*.24,bh,size*.25,[0,0,(rng()-.5)*.11]);
      }
    }else if(cell===0 || cell===7){
      if(i%2===0){for(let k=0;k<3;k++)j.piece(new T.TorusGeometry(.8,.13,6,20),shelfTin,px,bottom+size*(.7+k*.17),pz,size,size,size,[Math.PI*.5,0,0]);}
      else{j.piece(tinGeo,shelfTin,px,bottom,pz,size*.72,height,size*.72);j.box(groceryPaper,px,bottom+height*.43,pz+size*.72,size*.78,height*.28,.001);}
    }else if(cell===6 || cell===9){
      if((i+edition)%3===0)for(let k=0;k<3+(i+edition)%2;k++)j.piece(bowlGeo,i%3?ivory:blue,px,bottom+size*.13*k,pz,size,size*.66,size);
      else j.piece(jarGeo,i%3?blue:brown,px,bottom,pz,size*.97,Math.min(height,size*2.8),size*.97);
    }else if(cell===8){
      const body=grain(i%2?'#765a42':'#5a4130');
      j.box(body,px,bottom+height*.46,pz,size*1.36,height*.91,size*.65);
      j.piece(cylinderGeo,shelfTin,px,bottom+height*.52,pz+size*.34,size*.49,size*.13,size*.49,[Math.PI/2,0,0]);
      j.piece(boxGeo,body,px,bottom+height*.55,pz+size*.42,size*.05,height*.19,.001,[0,0,-.54]);
    }else if(cell===1 || cell===10 || cell===3){
      if(cell===10){
        const clay=grain('#997456');j.piece(jarGeo,clay,px,bottom,pz,size*.75,height*.57,size*.75);
        const leaves=grain(i%2?'#668356':'#627046');
        for(let k=0;k<6;k++){const a=k*2.4;
          j.piece(ballGeo,leaves,px+size*.37*Math.cos(a),bottom+height*(.56+.06*k),pz+size*.29*Math.sin(a),size*.23,size*.6,size*.16,[Math.sin(a)*.68,0,Math.cos(a)*.8]);}
      }else if(cell===3){
        const sack=turned([[.74,0],[.97,.10],[1,.36],[.92,.69],[.85,.88],[.97,.92],[.92,1],[.84,.96]],16);
        j.piece(sack,finishes.burlap,px,bottom,pz,size*.97,height*.55,size*.83);
        j.piece(ballGeo,finishes.grain,px,bottom+height*.52,pz,size*.88,height*.07,size*.75);
      }else{
        j.box(finishes.crate,px,bottom+height*.14,pz,size*1.8,height*.26,size*1.44);
        for(let n=0;n<8;n++)j.piece(ballGeo,pigment(['#b08746','#6f874c','#a05c3a'][i%3]),
          px+(n%3-1)*size*.49,bottom+height*(.34+.06*(n%2)),pz+(Math.floor(n/3)-1)*size*.38,size*.34,size*.30,size*.34);
      }
    }else if(cell===11 && i%3!==1){
      const wood=grain('#805d43');
      j.box(wood,px,bottom+height*.36,pz,size*1.82,height*.72,size*1.36);
      j.box(groceryPaper,px,bottom+height*.48,pz+size*.70,size*.83,height*.14,.0015);
      j.box(shelfTin,px,bottom+height*.25,pz+size*.72,size*.39,height*.04,.0025);
    }else{
      j.piece(i%3===1?jarGeo:bottleGeo,i%2===0?brown:ivory,px,bottom,pz,size*.83,height,size*.83);
      if(i%3!==1)j.piece(tinGeo,groceryPaper,px,bottom+height*.95,pz,size*.35,height*.09,size*.35);
    }
  }
}
function insetCabinet(j,cell,x,w,y,h,front,edition,finishes){
  const deep=Math.min(.128,w*.62),rear=front-deep;
  const frame=grain(trades[cell].trim),inside=grain(cell%3===0?'#594838':'#626356');
  j.box(inside,x,y,rear,w,h,.008);
  // Stock hidden behind the front row needs only a distant background. The
  // nearby ledges, goods and mid-depth uprights all cast their own shadows.
  j.piece(bayBackdrop,finishes.stockPhotos[cell],x,y,rear+.005,w-.011,h-.010,1);
  for(const sign of [-1,1]){
    j.box(frame,x+sign*(w/2-.003),y,front-deep/2,.007,h,deep);
    j.box(frame,x,y+sign*(h/2-.003),front-deep/2,w,.007,deep);
  }
  const shelves=h>.12?2:1;
  for(let i=0;i<shelves;i++){
    const bottom=y-h/2+.012+(h-.018)/shelves*i;
    j.box(frame,x,bottom,front-deep*.54,w-.012,.006,deep*.80);
    displayStock(j,cell,x,bottom+.003,front-deep*(i%2?.63:.49),w-.020,(h-.024)/shelves,edition+i,finishes);
  }
}
function sideCabinet(cell,edition,finishes){
  // A new cabinet fits the real concave return of the preserved Hi3D ground
  // floor. Its light comes from the actual window, through independent glazing.
  const shop=new T.Group(),j=new Joinery(),w=.167,h=.180,mat=grain(trades[cell].trim);
  insetCabinet(j,cell,0,w,0,h,0,edition,finishes);
  for(const y of [-h/2,h/2,h*.16])j.box(mat,0,y,.002,w+.012,.006,.010);
  for(const x of [-w/2,w/2])j.box(mat,x,0,0,.007,h+.012,.011);
  j.box(cupboardPaint,0,-h*.17,.003,.004,h*.63,.006);
  const glass=new T.PlaneGeometry(w-.009,h-.008);
  j.piece(glass,shelfGlass,0,0,.005,1,1,1);
  j.finish(shop);shop.name='侧窗内的陈列柜';shop.position.set(-.412,.2555,-.0225);shop.rotation.y=-Math.PI/2;
  return shop;
}
function printedSurface(shell,mat,x,y,w,h,name,slope=0,offset=.003){
  const g=new T.PlaneGeometry(w,h,13,4),pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
    const u=pos.getX(i)+x,v=pos.getY(i)+y+slope*(u-x),d=shell.depth(u,v);
    if(d===null)throw Error('门头跨出墙面: '+name);
    pos.setXYZ(i,u,v,d+offset);
  }
  g.computeVertexNormals();mat.polygonOffset=true;mat.polygonOffsetFactor=-2;
  const m=new T.Mesh(g,mat);m.name=name;return m;
}
function awningFinish(original,cell){
  const tints=['#a2b9ae','#c4d59e','#a88e68','#d2b78e','#97acb4','#b18081',
    '#b27a60','#899f9c','#b6a387','#8dabb7','#d1bd99','#b19b76'];
  const material=original.clone();material.color.multiply(new T.Color(tints[cell]));
  material.name='旧织篷_'+trades[cell].names[0];return material;
}
// The shop name on a fabric awning belongs on its vertical hem. The metal
// forward bar follows the scanned lower edge, with no floating planar label.
function printedHem(shop,shell,name,trade,ratio){
  const width=.245,height=.049,x=.158,nx=32,positions=[],uv=[],indices=[];
  const material=lettering(name,trade.cloth[0],'linen',false,'#e4d8b4',51,width/height*ratio);
  for(let i=0;i<=nx;i++){
    const t=i/nx,u=x+(t-.5)*width,v=.280+.064*(u+.034),lip=height*(.90+.10*Math.sin(i*Math.PI/8)**2);
    let z=-1;
    for(const delta of [0,.012,.024,.036,.048,.060,.074]){const sample=shell.depth(u,v+delta);if(sample!==null)z=Math.max(z,sample);}
    positions.push(u,v-lip,z+.009,u,v,z+.008);uv.push(t,0,t,1);
    if(i<nx){const a=2*i;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const hem=new T.Mesh(g,material);hem.name='雨棚前檐的印字布边';shop.add(hem);
}
function fitOut(shop,shell,cell,name,variant,finishes,ratio){
  const trade=trades[cell],j=new Joinery(),timber=grain(trade.trim),paint=grain(trade.paint,'paint');
  const rightX=.18;
  // Fill a slot behind the original sill or put the display on the doorstep.
  const outside=[1,3,10].includes(cell);
  const z=outside?.305:.202;
  if(outside){
    const counter=grain(cell===1?'#7b583a':cell===3?'#766448':'#536352');
    j.box(counter,rightX,.025,z,.292,.040,.10);
    j.box(timber,rightX,.047,z+.002,.307,.008,.105);
  }else if([2,4,5,6,7,9,11].includes(cell)){
    j.box(timber,rightX,.059,z,.29,.011,.077);
    for(const u of [-.106,.106])j.box(paint,rightX+u,.034,z-.008,.013,.049,.040);
  }
  stock(j,cell,rightX,z+(outside?.012:0),variant,.316,finishes);
  if(cell===0)shop.add(shell.cycle.clone());
  else {
    // A fitted cabinet replaces the wheel display in the other trades.
    // The lower section is recessed into the same original shop window.
    j.piece(boxGeo,grain(trade.trim),-.25,.075,.023,.294,.137,.031,[0,-.40,0]);
    for(let k=0;k<5;k++){
      const dx=(k-2)*.055;
      j.piece(boxGeo,grain(trade.paint),-.25+dx,.075,.046+dx*.42,.049,.109,.009,[0,-.40,0]);
    }
  }
  const mark=trade.mark;
  if(mark==='vertical'){
    shop.add(printedSurface(shell,lettering(name,trade.trim,'wood',true,'#dec99c'),-.065,.216,.037,.169,'门柱木刻'));
  }else if(mark==='wood'||mark==='enamel'){
    const base=mark==='wood'?trade.trim:trade.paint;
    shop.add(printedSurface(shell,lettering(name,base,mark,false,mark==='wood'?'#ddc695':'#d9d8c4',51,(mark==='wood'?.232:.174)/.041*ratio),.141,.429,mark==='wood'?.232:.174,.041,'墙上门楣',.065));
  }else if(mark==='valance'){
    // Paint the name on the cloth itself, following the scanned folds.
    printedHem(shop,shell,name,trade,ratio);
  }else if(mark==='curtain'){
    const y=.313,z=shell.depth(-.25,y)+.035;
    j.box(timber,-.252,y,z,.25,.008,.01);
    for(let k=0;k<3;k++){
      const panel=k===1?lettering(cell===6?'麵':'衣',trade.cloth[0],'linen',false,'#e9d8ad'):grain(trade.cloth[0],'cloth');
      valance(j,panel,-.334+k*.081,y,z,.078,.082+.007*(k%2),1);
    }
  }else if(mark==='clock'){
    shop.add(printedSurface(shell,lettering(name,trade.trim,'wood',true,'#d3bd92'),-.065,.214,.031,.145,'钟表铺门柱题字'));
  }
  // Narrow physical shutters and threshold hardware vary between open shops.
  if([0,3,7,11].includes(cell)){
    const x=-.361,z=shell.depth(x,.159);
    if(z!==null)for(let n=0;n<3;n++)j.box(paint,x+n*.009,.151,z+.008+n*.003,.010,.183,.009);
  }
  j.finish(shop);
}
// Rebuild selected street elevations around the preserved rear Hi3D shop.
// Model the returns and recessed display bays so a side view sees the doorway depth.
function alteredEntrance(shell,cell,name,edition,ratio,finishes) {
  const shop=new T.Group(),rear=shell.ground.clone();rear.add(sideCabinet(cell,edition,finishes));
  rear.scale.set(.94,1,.50);rear.position.z=-.205;shop.add(rear);
  const j=new Joinery(),trade=trades[cell],wood=grain(trade.trim),paint=grain(trade.paint,'paint');
  const cream=finishes.lime,brick=finishes.brick,iron=pigment('#45504e');
  const z=.345,back=.16,wall=[4,8,11].includes(cell)?cream:[0,3,7].includes(cell)?brick:wood;
  j.box(wall,0,.012,-.04,.934,.024,.87);j.box(wall,0,.437,-.04,.94,.043,.87);
  for(const x of [-.452,.452])j.box(wall,x,.228,-.05,.03,.41,.84);
  const plane=(material,x,y,depth,w,h)=>j.piece(new T.PlaneGeometry(),material,x,y,depth,w,h,1);
  const jamb=(x,width= .022,mat=wood)=>j.box(mat,x,.225,z,width,.405,.062);
  const sill=(x,w,y,mat=wood)=>j.box(mat,x,y,z,w,.014,.077);
  function display(x,w,y,h,front=z,frame=wood,bars=1){
    insetCabinet(j,cell,x,w,y,h,front-.008,edition,finishes);
    j.box(frame,x,y-h/2,front,w+.009,.016,.102);
    j.box(frame,x,y+h/2,front,w+.009,.014,.066);
    for(const dx of [-w/2,w/2])j.box(frame,x+dx,y,front,.013,h,.092);
    for(let i=1;i<=bars;i++)j.box(frame,x+w*(i/(bars+1)-.5),y,front-.008,.006,h,.017);
  }
  function door(x,w,frame=wood){
    // A recessed leaf and deep side reveals make the threshold readable in profile.
    j.box(frame,x,.175,back,w,.30,.026);
    j.box(cupboardPaint,x,.224,back+.016,w*.72,.126,.010);
    for(const dx of [-.27,.27])j.box(frame,x+dx*w,.225,back+.022,.006,.119,.007);
    j.box(frame,x,.165,back+.02,w*.82,.012,.018);j.box(pigment('#c5ad7b'),x+w*.33,.15,back+.029,.009,.026,.01);
    for(const dx of [-w/2,w/2])j.box(frame,x+dx,.174,(z+back)/2,.015,.31,z-back);
    j.box(cream,x,.022,z-.04,w+.015,.016,.15);
  }
  function label(x,y,depth,w,h,style='wood'){
    plane(lettering(name,trade.trim,style,false,'#e3d6ad',37,w/h*ratio),x,y,depth,w,h);
  }
  const column=(x,mat=wood)=>j.box(mat,x,.222,z+.02,.031,.398,.034);
  for(const x of [-.435,.435])jamb(x,.038,wall);
  if(cell===8||cell===4){
    const clock=cell===8,dx=clock?.025:-.277,dw=clock?.225:.195;
    const bays=clock?[[-.29,.255],[.288,.247]]:[[.17,.49]];
    for(const [x,w] of bays){display(x,w,.208,.273,z,wood,clock?0:2);j.box(wall,x,.06,z,w,.074,.068);}
    door(dx,dw,wood);
    if(clock){
      const rx=dw*.56,ry=.123;
      // Individual stone voussoirs extend through the thickness of the arch.
      for(let i=0;i<13;i++){
        const a=i*Math.PI/13+.008,b=(i+1)*Math.PI/13-.008;
        const shape=new T.Shape();
        for(const [k,[angle,outer]] of [[a,0],[a,1],[b,1],[b,0]].entries()){
          const xx=dx+(rx+.030*outer)*Math.cos(angle),yy=.254+(ry+.032*outer)*Math.sin(angle);
          if(k===0)shape.moveTo(xx,yy);else shape.lineTo(xx,yy);
        }
        shape.closePath();
        const g=new T.ExtrudeGeometry(shape,{depth:.070,bevelEnabled:false,curveSegments:1});
        const mesh=new T.Mesh(g,cream);mesh.position.z=z-.048;mesh.name='拱券石';shop.add(mesh);
      }
      for(const x of [dx-rx-.013,dx+rx+.013])j.box(cream,x,.137,z,.032,.236,.071);
      label(-.289,.368,z+.031,.242,.039);
    }else{
      jamb(dx-dw/2);jamb(dx+dw/2);sill(dx,dw,.335);label(.17,.378,z+.029,.41,.053);
      for(const x of [-.43,.424])j.box(cream,x,.25,z+.025,.034,.36,.045);
    }
  }else if(cell===0||cell===7||cell===3){
    const dx=cell===3?.305:-.298;
    door(dx,.174);const center=dx>0?-.112:.102,w=.54;
    display(center,w,.21,.30,z-.055,cell===3?wood:iron,cell===0?0:1);
    // Folded boards / accordion leaves gather at one side of the open loading bay.
    for(let i=0;i<6;i++){
      const m=cell===3?wood:paint;
      j.piece(boxGeo,m,center-w/2+.021+i*.012,.190,z+.002*Math.cos(i*Math.PI),.023,.295,.016,[0,(i%2?1:-1)*.56,0]);
    }
    j.box(iron,center,.37,z,w+.08,.014,.045);label(center,.405,z+.018,w*.68,.046,cell===3?'wood':'enamel');
    if(cell===0){const bike=shell.cycle.clone();bike.position.set(.29,0,.19);bike.scale.set(.85,.88,.69);shop.add(bike);}
    else stock(j,cell,center,z+.014,edition,.33,finishes);
  }else if(cell===1){
    // A low produce counter opens the full width; the canopy has its own legs and fabric.
    display(.0,.76,.222,.235,back+.06,wood,2);
    const counter=grain('#76583c');
    j.box(counter,0,.064,z,.78,.081,.13);j.box(wood,0,.11,z,.80,.012,.15);
    const crates=new T.Group(),produce=new Joinery();
    for(const x of [-.18,.18])stock(produce,cell,x,z+.018,edition,.32,finishes);
    produce.finish(crates);crates.position.y=.095;crates.name='摆在柜面的两排菜筐';shop.add(crates);
    for(const x of [-.404,.404])column(x,paint);
    j.piece(boxGeo,paint,0,.365,z+.003,.84,.016,.17,[.14,0,0]);
    valance(j,grain('#667757','cloth'),0,.351,z+.089,.85,.036,11);
    label(0,.335,z+.094,.27,.032,'linen');
  }else if(cell===10){
    // Hard steel glazing: slender frames with staggered displays inside the corner.
    const frame=grain('#4b6a60','paint');door(.245,.174,frame);
    display(-.145,.53,.208,.315,z,frame,2);display(.37,.095,.21,.302,z,frame,0);
    for(const x of [-.39,-.24,-.10,.05])stock(j,cell,x,z-.012,edition,.116,finishes);
    label(-.165,.391,z+.02,.27,.033);
  }else{ // Tea and herbs keep deep timber counters under their eaves.
    door(-.288,.167);display(.127,.50,.195,.237,z-.046,wood,2);
    j.box(wood,.127,.065,z,.53,.073,.09);stock(j,cell,.12,z-.003,edition,.31,finishes);
    for(const x of [-.426,-.176,.409])column(x);
    for(let i=0;i<11;i++)j.box(paint,-.39+i*.077,.342,z,.009,.063,.025);
    sill(0,.85,.316);sill(0,.85,.374);
    if(cell===11)plane(lettering(name,trade.trim,'wood',true,'#e5dab0'),-.175,.21,z+.04,.030,.153);
    else label(.126,.403,z+.026,.34,.043);
  }
  j.finish(shop);return shop;
}

// Fit the small enamel or timber trade plaque to an opaque street-facing
// doorpost on the actual scan. Skip a face with no safe material to mount it on.
const plaqueMounts=new WeakMap();
export function nameWholeShop(building,source,cell,name){
  if(!plaqueMounts.has(source)){
    source.updateWorldMatrix(true,true);
    const lod=source.children.find(c=>c.isLOD);
    const surface=lod?lod.levels[0].object:source;
    const probe=new T.Raycaster(),forward=new T.Vector3(0,0,-1);
    function depthAt(x,y){
      probe.set(new T.Vector3(x,y,.62),forward);probe.far=1.14;
      return probe.intersectObject(surface,true)[0]?.point.z;
    }
    let best=null;
    for(const y of [.42,.56,.32])for(const x of [-.385,.385,-.313,.313]){
      const w=.046,h=.143;
      const corners=[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2],[x,y]];
      const at=corners.map(([x,y])=>depthAt(x,y));
      if(at.some(z=>!Number.isFinite(z)||z<.13))continue;
      const span=Math.max(...at)-Math.min(...at);
      if(span>.020)continue;
      const score=Math.min(...at)-span*6+.016*(x<0)+.010*(y===.42);
      if(!best||score>best.score)best={score,x,y,w,h,depths:at.slice(0,4)};
    }
    plaqueMounts.set(source,best);
  }
  const mount=plaqueMounts.get(source);if(!mount)return;
  const {x,y,w,h,depths}=mount;
  const trade=trades[cell],fronts=depths.map(z=>z+.004);
  const panel=new T.BufferGeometry();const positions=[],uv=[];
  const vertices=[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]];
  for(let j=0;j<4;j++){positions.push(...vertices[j],fronts[j]);uv.push(...[[0,0],[1,0],[1,1],[0,1]][j]);}
  panel.setAttribute('position',new T.Float32BufferAttribute(positions,3));panel.setAttribute('uv',new T.Float32BufferAttribute(uv,2));panel.setIndex([0,1,2,0,2,3]);panel.computeVertexNormals();
  const finish=lettering(name,trade.paint,'enamel',true,'#e5d5ae',168+cell);finish.name='门柱小号营业牌';
  const sign=new T.Mesh(panel,finish);sign.name=name+'门牌';building.add(sign);
}

export async function shopWorkshop(normalized,plinth,pool){
  const shell=fittedShell(normalized),texture=await new T.TextureLoader().loadAsync('./shop-goods.jpg');
  texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;

  function sample(x,y,w,h){
    const map=texture.clone();map.offset.set(x,1-y-h);map.repeat.set(w,h);
    return new T.MeshStandardMaterial({map,roughness:.95});
  }
  const stockPhotos=trades.map((trade,i)=>{
    const material=sample((i%4)*.25+.002,Math.floor(i/4)/3+.012,.246,.304);
    material.name='后排存货_'+trade.names[0];material.color.set(0xd6cbb4);return material;
  });
  const finishes={...plinth,stockPhotos,burlap:sample(.773,.269,.023,.038),grain:sample(.798,.207,.026,.016),
    crate:sample(.261,.308,.053,.020)};
  let sideIndex=0;const repeats=Array(trades.length).fill(0);
  return (row,side,column,ratio)=>{
    const main=column===0,cell=main?mainShops.get(row+'/'+side):secondary[sideIndex++];
    const edition=main?0:++repeats[cell],name=trades[cell].names[edition];
    const role=shopRoles[cell];
    if(pool[role])return {name,main,cell,edition,role};
    if(![5,6,9].includes(cell)){
      const shop=alteredEntrance(shell,cell,name,edition,ratio/shopProfile(cell).height,finishes);
      shop.name=name;return {shop,name,main,cell,edition};
    }
    const shop=new T.Group();shop.name=name;shop.add(shell.ground.clone(),sideCabinet(cell,edition,finishes));
    const cabinet=new Joinery();
    insetCabinet(cabinet,cell,-.247,.265,.175,.21,-.044,edition,finishes);
    insetCabinet(cabinet,cell,.185,.398,.176,.204,.105,edition,finishes);
    cabinet.finish(shop);
    const awning=new T.Mesh(shell.fabric,awningFinish(shell.body.material,cell));awning.name='门头雨棚';shop.add(awning);
    fitOut(shop,shell,cell,name,edition,finishes,ratio/shopProfile(cell).height);
    return {shop,name,main,cell,edition};
  };
}
// The Hi3D stall is one textured mesh. The enamel, paper, cloth and bare steel
// need different specular responses when the observer moves past the counter.
function separateStallFinishes(stall){
  stall.updateWorldMatrix(true,true);
  let source;stall.traverse(o=>{if(o.isMesh)source=o;});
  const geometry=source.geometry.clone(),original=source.material;
  const material=(name,metalness,roughness,roughnessMap=null)=>{
    const m=original.clone();m.name=name;m.metalness=metalness;m.roughness=roughness;
    m.metalnessMap=null;m.roughnessMap=roughnessMap;return m;
  };
  const canvas=material('旧布棚',0,.92);
  const steel=material('拉丝锅身',.88,.61,original.roughnessMap);
  const rim=material('卷边不锈钢',.95,.37,original.roughnessMap);
  const paper=material('纸杯与棉巾',0,.83);
  const cabinet=original.clone();cabinet.name='磨旧漆柜';cabinet.metalness=.43;
  const materials=[cabinet,canvas,steel,rim,paper],batches=materials.map(()=>[]);
  const points=geometry.attributes.position.clone().applyMatrix4(source.matrixWorld);
  const indices=geometry.index.array;
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i],b=indices[i+1],c=indices[i+2];
    const x=(points.getX(a)+points.getX(b)+points.getX(c))/3;
    const y=(points.getY(a)+points.getY(b)+points.getY(c))/3;
    const z=(points.getZ(a)+points.getZ(b)+points.getZ(c))/3;
    // Remove the opaque relief that Hi3D imprinted where steam was visible in the reference.
    // The rear sheet sits at z=-.27 and the pot rim at y=.466, outside this cut.
    const highPoint=Math.max(points.getY(a),points.getY(b),points.getY(c));
    if(highPoint>.467 && y>.442 && y<.804 && x>-.413 && x<-.025 && z>-.198 && z<-.076)continue;
    const r=Math.hypot((x+.126)/.207,(z-.076)/.249);
    let finish=0;
    if(y>.653&&Math.abs(x)<.47)finish=1;
    if(y>.36&&y<.467&&r<1.04)finish=y>.449?3:2;
    if(y>.361&&y<.58&&x>.109&&x<.361&&z>-.102&&z<.286)finish=4;
    if(x>.24&&x<.415&&z>.331&&y>.214&&y<.358)finish=4;
    batches[finish].push(a,b,c);
  }
  // A flat replaceable zinc sheet in front of the scanned rear panel closes the
  // uneven relief. Its folded lip stays behind the pot and underneath the canopy.
  const sheet=weatheredCanvas(768,384,'#6d685e','paint',392);
  const paint=sheet.getContext('2d'),stain=paint.createRadialGradient(339,344,9,339,344,279);
  stain.addColorStop(0,'rgba(39,28,18,.58)');stain.addColorStop(.47,'rgba(73,49,26,.35)');stain.addColorStop(1,'rgba(65,49,27,0)');
  paint.fillStyle=stain;paint.fillRect(0,0,sheet.width,sheet.height);
  const rng=vary(93);
  for(let i=0;i<68;i++){
    const x=(rng()*.83+.05)*sheet.width,y=(rng()*.68+.30)*sheet.height,len=rng()**3*60;
    paint.strokeStyle='rgba(87,64,45,'+(.05+rng()*.11)+')';paint.lineWidth=.5+rng()*1.3;
    paint.beginPath();paint.moveTo(x,y);paint.bezierCurveTo(x-1,y+len*.3,x+2,y+len*.6,x+1,y+len);paint.stroke();
  }
  // Rivets leave oxide tails; the pan is cleaned most often at arm height.
  for(const x of [23,435,743])for(const y of [19,361]){
    const g=paint.createRadialGradient(x,y,2,x,y,28);
    g.addColorStop(0,'rgba(113,67,37,.67)');g.addColorStop(.30,'rgba(103,62,33,.41)');g.addColorStop(1,'rgba(120,75,41,0)');
    paint.fillStyle=g;paint.fillRect(x-28,y-28,56,56);
    for(let k=0;k<16;k++){const sx=x+(rng()-.5)*19;
      paint.strokeStyle='rgba(116,74,39,'+(.12+rng()*.23)+')';paint.lineWidth=.6+rng()*2.1;
      paint.beginPath();paint.moveTo(sx,y+5);paint.bezierCurveTo(sx+1,y+13,sx-1,y+24,sx+.7,y+16+rng()*58);paint.stroke();}
  }
  for(let i=0;i<180;i++){
    const x=169+rng()*360,y=163+rng()*171;
    paint.strokeStyle=i%3?'rgba(194,180,146,.12)':'rgba(72,61,44,.19)';paint.lineWidth=.5+rng()*1.6;
    paint.beginPath();paint.moveTo(x,y);paint.bezierCurveTo(x-8,y-2,x-13,y+2,x-25-rng()*33,y+9+rng()*6);paint.stroke();
  }
  const zinc=canvasMaterial(sheet);zinc.name='旧镀锌挡油板';zinc.roughness=.61;zinc.metalness=.37;
  const backing=new Joinery();backing.box(zinc,-.149,.510,-.250,.545,.320,.005);
  backing.box(zinc,-.149,.670,-.250,.549,.004,.010);
  backing.box(zinc,-.112,.510,-.246,.004,.316,.003);
  backing.box(zinc,-.149,.351,-.202,.546,.004,.099);
  const fixings=material('挡板铆钉',.72,.37);fixings.map=null;fixings.color.set(0xafada4);
  for(const x of [-.405,-.112,.107])for(const y of [.369,.654]){
    backing.piece(cylinderGeo,fixings,x,y,-.245,.0031,.002,.0031,[Math.PI/2,0,0]);
  }
  const splashback=new T.Group();splashback.name='灶后挡油铁皮';backing.finish(splashback);stall.add(splashback);
  geometry.clearGroups();
  let start=0;
  batches.forEach((batch,slot)=>{geometry.addGroup(start,batch.length,slot);start+=batch.length;});
  finishCanvasHem(stall,source);
  geometry.setIndex(batches.flat());source.geometry=geometry;source.material=materials;

  addSoyMilk(stall,-.126,.438,.076,.169,.204);
}

// Each scan has a different pot. Keep the level surface inside its own rolled
// rim so the handle emerges from the milk and the real metal hides it at eye level.
export function addSoyMilk(stall,x,y,z,rx,rz){
  const rng=vary(122);
  const disk=new T.CircleGeometry(1,96);disk.rotateX(-Math.PI/2);
  const milk=document.createElement('canvas');milk.width=milk.height=384;
  const fluid=milk.getContext('2d'),white=fluid.createRadialGradient(165,170,18,192,192,190);
  white.addColorStop(0,'#e8d8ae');white.addColorStop(.83,'#ddcba4');white.addColorStop(1,'#e8d8b4');
  fluid.fillStyle=white;fluid.fillRect(0,0,384,384);
  // Bubbles collect beside the pot wall in patches, with a smooth open center.
  for(const [arc,spread] of [[.49,.42],[2.88,.37],[4.17,.19]]){
    for(let i=0;i<115;i++){
      const angle=arc+(rng()-.5)*spread,dist=178+rng()*10,r=.34+rng()**2*2;
      const x=192+dist*Math.cos(angle),y=192+dist*Math.sin(angle);
      fluid.fillStyle='rgba(154,133,94,.32)';fluid.beginPath();fluid.arc(x,y,r,0,Math.PI*2);fluid.fill();
      fluid.fillStyle='rgba(252,241,210,.76)';fluid.beginPath();fluid.arc(x-r*.17,y-r*.23,r*.76,0,Math.PI*2);fluid.fill();
    }
  }
  const milkColor=new T.CanvasTexture(milk);milkColor.colorSpace=T.SRGBColorSpace;
  const liquid=new T.Mesh(disk,new T.MeshPhysicalMaterial({
    name:'锅内豆浆',map:milkColor,roughness:.34,metalness:0,ior:1.34
  }));
  liquid.name='锅内豆浆';liquid.position.set(x,y,z);liquid.scale.set(rx,1,rz);
  stall.add(liquid);
}

// Stencil the actual cabinet surface, including the slight warp of the door.
export function finishStall(normalized){
  separateStallFinishes(normalized);
  normalized.updateMatrixWorld(true);
  const ink=document.createElement('canvas');ink.width=480;ink.height=136;
  const c=ink.getContext('2d');c.textAlign='center';c.textBaseline='middle';c.fillStyle='#82422e';
  c.font='700 84px "STKaiti","Kaiti SC","Songti SC",serif';c.fillText('現 磨 豆 漿',240,71,438);
  const rng=vary(83);c.globalCompositeOperation='destination-out';
  for(let i=0;i<2200;i++){c.fillStyle='rgba(0,0,0,'+(rng()*.63)+')';c.fillRect(rng()*480,rng()*136,1+rng()*3,1);}
  const mat=canvasMaterial(ink);mat.transparent=true;mat.depthWrite=false;mat.polygonOffset=true;mat.polygonOffsetFactor=-2;mat.polygonOffsetUnits=-2;
  const ray=new T.Raycaster(),g=new T.PlaneGeometry(.36,.077,16,4),position=g.attributes.position;
  for(let i=0;i<position.count;i++){
    const x=-.216+position.getX(i),y=.241+position.getY(i);ray.set(new T.Vector3(x,y,.85),new T.Vector3(0,0,-1));
    const hit=ray.intersectObject(normalized,true)[0];if(!hit)throw Error('豆浆柜台没有贴字的表面');
    position.setXYZ(i,x,y,hit.point.z+.0015);
  }
  g.computeVertexNormals();const stencil=new T.Mesh(g,mat);stencil.name='柜门上的漆字';normalized.add(stencil);
}
