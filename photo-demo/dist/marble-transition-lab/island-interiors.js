import * as T from 'three';
import {workshop,printChart} from './room-fittings.js';

// Local thresholds are z=0, with the interior on the negative side. The inn's
// two exterior doors share the same room and the same physical staircase.
export const halls={
  post:{w:5.4,d:5.4,h:3.25,wall:'#f1deac',trim:'#456f86'},
  field:{w:6.3,d:5.9,h:5.05,wall:'#e4e0ce',trim:'#718d81'},
  watch:{w:5.8,d:5.8,h:3.65,wall:'#c9c1a3',trim:'#5e7471'},
  inn:{w:7.1,d:6.8,h:5.85,wall:'#c58b65',trim:'#626e54'},
  baths:{w:5.8,d:6.1,h:3.6,wall:'#efe3cf',trim:'#428c84'},
  slip:{w:6.4,d:7.6,h:4.0,wall:'#b99b77',trim:'#8a6d4f'},
  beacon:{w:4.8,d:4.8,h:6.3,wall:'#e0d7bd',trim:'#875446'},
};
export const upperFloor=2.85;

export function buildIslandInterior(id,environment,dayColor){
  const spec=halls[id],{w,d,h}=spec,scene=new T.Scene(),model=new T.Group();
  const f=workshop(model),{box,rod,ring,turned,wood,cloth,finish,oak,dark,brass,ivory}=f;
  const plaster=finish(spec.wall,'stone'),paint=wood(spec.trim),stone=finish('#bca98c','stone');
  const rounded=id==='watch'||id==='beacon',open=id==='slip';
  scene.add(model);scene.environment=environment;scene.environmentIntensity=.55;
  function wall(a,b,holes=[],surface=plaster,top=h,baseY=0){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),angle=Math.atan2(-dz,dx);
    function board(u,v,y,H,t,m){
      const s=(u+v)/2/len;box(a[0]+dx*s,baseY+y+H/2,a[1]+dz*s,v-u,H,t,m,angle);
    }
    let last=0;
    for(const o of holes.sort((i,j)=>i.at-j.at)){
      const lo=o.at-o.w/2,hi=o.at+o.w/2;
      if(lo>last)board(last,lo,0,top,.15,surface);
      if(o.base>0)board(lo,hi,0,o.base,.15,surface);
      if(o.cap<top)board(lo,hi,o.cap,top-o.cap,.15,surface);
      for(const t of [lo,hi])board(t-.035,t+.035,o.base,o.cap-o.base,.19,paint);
      board(lo-.065,hi+.065,o.cap-.04,.10,.23,paint);
      if(!o.door){
        board(lo-.09,hi+.09,o.base-.055,.11,.30,oak);
        board(o.at-.020,o.at+.020,o.base,o.cap-o.base,.085,paint);
        board(lo,hi,o.base+(o.cap-o.base)*.73,.035,.085,paint);
      }
      last=hi;
    }
    if(last<len)board(last,len,0,top,.15,surface);
  }
  const window=(at,width,base=.91,cap=2.5)=>({at,w:width,base,cap});
  function frameArt(x,y,z,width,height,kind,title,angle=0){
    box(x,y,z,width+.115,height+.115,.065,dark,angle);
    const dx=Math.sin(angle),dz=Math.cos(angle);
    box(x+dx*.039,y,z+dz*.039,width+.038,height+.038,.018,brass,angle);
    f.painting(x+dx*.052,y,z+dz*.052,width,height,printChart(kind,title),angle);
  }
  function shelf(x,y,z,width){
    box(x,y,z,width,.065,.39,oak);
    for(const s of [-1,1])rod([x+s*(width/2-.13),y-.25,z-.15],[x+s*(width/2-.13),y-.035,z+.15],.019,brass);
  }
  function ladderFlight(x,z0,z1,level,width){
    const n=Math.ceil(level/.18),run=(z1-z0)/n;
    for(let i=0;i<n;i++)box(x,(i+1)*level/n-.045,z0+(i+.5)*run,width,.09,Math.abs(run)+.008,oak);
    for(const s of [-1,1]){
      const px=x+s*(width/2-.035);
      const slope=new T.Vector3(0,level,z1-z0);
      box(px,level/2-.095,(z0+z1)/2,.079,slope.length(),.15,dark,
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),slope.normalize()));
      rod([px,.81,z0],[px,level+.81,z1],.032,dark);
      for(let k=0;k<=4;k++){const t=k/4;rod([px,level*t,z0+(z1-z0)*t],[px,level*t+.81,z0+(z1-z0)*t],.021,paint);}
    }
  }
  function floorboards(y,z0,z1,width,xc=0){
    box(xc,y-.115,(z0+z1)/2,width,.16,z1-z0,dark);
    const count=Math.ceil(width/.23);
    for(let i=0;i<count;i++){const x=xc-width/2+(i+.5)*width/count;
      const joint=z0+(z1-z0)*(.24+.14*(i%4));
      for(const [a,b] of [[z0,joint],[joint,z1]])box(x,y-.025,(a+b)/2,width/count-.004,.05,b-a-.005,i%5?oak:wood('#ad8053'));
    }
  }
  function tileFloor(y,z0,z1,width,xc,colors){
    box(xc,y-.06,(z0+z1)/2,width,.11,z1-z0,finish('#a79d88','stone'));
    const cols=Math.ceil(width/.39),rows=Math.ceil((z1-z0)/.39);
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++)box(xc-width/2+(i+.5)*width/cols,y-.017,z0+(j+.5)*(z1-z0)/rows,width/cols-.012,.035,(z1-z0)/rows-.012,finish(colors[(i*7+j*3+(i*j)%5)%colors.length],'glaze'));
  }
  function archFrame(x,y,z,r,depth,m){
    for(let k=0;k<19;k++){const a=k*Math.PI/19,b=(k+1)*Math.PI/19;
      rod([x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],depth,m);}
  }
  function bed(x,y,z,width){
    for(const s of [-1,1])for(const t of [-1,1])
      turned(x+s*(width/2-.065),y,z+t*.92,[[.065,0],[.077,.045],[.049,.13],[.057,.35]],dark,16);
    f.slab(x,y+.34,z,width,.27,2.03,.025,dark);f.slab(x,y+.55,z,width-.03,.22,2.02,.064,cloth('#e8d9bd'));
    f.cover(x,y+.681,z+.34,width,1.22,f.weave('#975744','#ddb889'));
    const cushion=new T.SphereGeometry(1,28,16);
    f.put(cushion,cloth('#f8ecd4'),x,y+.72,z-.66,width*.42,.15,.27);cushion.dispose();
    box(x,y+.69,z-1.0,width+.08,1.20,.10,paint);
    for(let j=0;j<6;j++)box(x+(j-2.5)*width*.152,y+.91,z-.94,width*.131,.55,.025,wood('#897d61'));
    box(x,y+1.30,z-1,width+.18,.09,.16,dark);
  }
  function landingRail(x0,x1,z,y){
    box((x0+x1)/2,y+.86,z,x1-x0,.07,.064,dark);
    const n=Math.ceil((x1-x0)/.27);for(let i=0;i<=n;i++)box(x0+i*(x1-x0)/n,y+.41,z,.04,.82,.04,paint);
  }
  function rug(x,y,z,width,depth,colors){
    box(x,y+.008,z,width,.015,depth,f.weave(...colors));
    for(const side of [-1,1])for(let i=0;i<32;i++){
      const px=x+(i+.5)*width/32-width/2;
      box(px,y+.012,z+side*(depth/2+.024),.009,.010,.055,cloth(colors[1]),Math.sin(i*2)*.12);
    }
  }
  if(rounded){
    const radius=w/2,cz=-radius,panels=16,offset=Math.PI/panels;
    for(let i=0;i<panels;i++){const dir=i*Math.PI*2/panels;
      const a=[Math.sin(dir-offset)*radius,cz+Math.cos(dir-offset)*radius];
      const b=[Math.sin(dir+offset)*radius,cz+Math.cos(dir+offset)*radius];
      const half=Math.hypot(b[0]-a[0],b[1]-a[1])/2;
      if(i===0){wall(a,b,[{at:half,w:half*1.96,base:0,cap:2.18,door:true}]);}
      else if(id==='beacon'){wall(a,b,i%4===0?[window(half,half*1.35,1.12,2.15)]:[],plaster,3.44);
        box((a[0]+b[0])/2,3.88,(a[1]+b[1])/2,.090,.88,.090,brass);
        rod([a[0],5.82,a[1]],[a[0],3.44,a[1]],.045,paint);
        rod([a[0],4.12,a[1]],[b[0],4.12,b[1]],.023,brass);
      }else wall(a,b,i%2===1?[window(half,half*1.65,1.02,2.68)]:[]);
    }
    turned(0,-.12,cz,[[0,.12],[radius,.12],[radius,0],[0,0]],stone,64);
    // Cap geometry has an upward normal. The ceiling rim is visible from below.
    const g=new T.CylinderGeometry(radius,radius,.12,64);f.put(g,stone,0,-.06,cz);
    f.put(g,dark,0,h,cz);g.dispose();
    for(let k=0;k<16;k++){const a=k*Math.PI/8;rod([0,h-.055,cz],[Math.sin(a)*radius,h-.10,cz+Math.cos(a)*radius],.045,oak);}
  }else{
    if(id==='baths')tileFloor(0,-d,0,w,0,['#8cb7ad','#81a9a2','#a5bdb1','#91b4ac']);
    else floorboards(0,-d,0,w);
    if(open){
      for(const side of [-1,1])for(let i=0;i<4;i++){
        const x=side*(w/2-.1),z=-.09-i*(d-.18)/3;
        box(x,h/2,z,.18,h,.18,dark);
        rod([x,h-.85,z],[x-side*.9,h-.12,z],.074,oak);
        rod([x,.90,z],[x,.90,Math.max(-d+.1,z-d/3)],.044,dark);
      }
      wall([-w/2,-d],[w/2,-d],[window(w*.5,2.5,1.1,2.7)],wood('#a18c6b'));
    }else{
      const frontDoor={at:w/2,w:1.16,base:0,cap:2.2,door:true};
      const facade=[window(w*.17,1.18),frontDoor,window(w*.83,1.18)];
      wall([-w/2,0],[w/2,0],facade,plaster,id==='inn'?upperFloor:h);
      if(id==='inn')wall([-w/2,0],[w/2,0],facade,plaster,h-upperFloor,upperFloor);
      wall([-w/2,-d],[w/2,-d],id==='baths'?[window(w*.5,2.15,2.0,3.0)]:[]);
      const left=[window(d*.43,Math.min(d*.52,3.12),id==='inn'?1.25:.82,id==='inn'?2.52:2.55)];
      wall([-w/2,0],[-w/2,-d],left,plaster,id==='inn'?upperFloor:h);
      if(id==='inn')wall([-w/2,0],[-w/2,-d],[window(d*.64,2.12,.93,2.49)],plaster,h-upperFloor,upperFloor);
      wall([w/2,0],[w/2,-d],id==='field'?[window(d*.69,1.35,3.20,4.47)]:[window(d*.68,1.3,1.40,2.42)]);
      for(const side of [-1,1]){
        box(side*(w/2-.095),.14,-d/2,.095,.26,d-.12,paint);
        box(side*(w/2-.087),.283,-d/2,.116,.038,d-.12,oak);
      }
    }
    box(0,h+.07,-d/2,w+.24,.14,d+.30,open?wood('#876d51'):plaster);
    for(let i=0;i<5;i++){const z=-.13-i*(d-.26)/4;
      box(0,h-.15,z,w+.16,.24,.13,dark);
      if(open){rod([-w/2,h-.85,z],[0,h-.12,z],.045,oak);rod([w/2,h-.85,z],[0,h-.12,z],.045,oak);}
    }
  }
  if(id==='post'){
    const z=-d+.24;
    box(-.64,1.59,z,3.23,1.58,.26,paint);
    for(let r=0;r<=4;r++)box(-.64,.87+r*.365,z+.18,3.25,.038,.36,oak);
    for(let col=0;col<=7;col++)box(-2.24+col*.457,1.60,z+.18,.031,1.48,.36,oak);
    for(let col=0;col<7;col++)for(let row=0;row<4;row++){
      const x=-2.02+col*.457,y=.92+row*.365;
      for(let k=0;k<(col*2+row)%5;k++)box(x,y+k*.021,z+.23,.31,.022,.19,finish(k%2?'#ede2bd':'#c9ae91'),(k%3-.8)*.055);
      box(x,y-.053,z+.369,.105,.042,.009,brass);
    }
    f.table(-.9,-3.64,2.95,1.04,.86);f.bench(-1.0,-2.63,1.65);
    for(let i=0;i<3;i++){const g=new T.BufferGeometry(),s=.65+i*.15;
      g.setAttribute('position',new T.Float32BufferAttribute([-.30,0,0,0,.17,.01,.30,0,0, -.30,0,0,-.18,.12,.13,.18,.12,.13, -.30,0,0,.18,.12,.13,.30,0,0],3));g.computeVertexNormals();g.setAttribute('uv',new T.Float32BufferAttribute(new Array(18).fill(0),2));
      const m=finish('#fbefd2');m.side=T.DoubleSide;f.put(g,m,-1.65+i*.56,.91,-3.68+(i%2)*.22,s,s,s,i*.31);g.dispose();}
    frameArt(1.59,1.83,-d+.10,1.45,1.23,'sea','Poste maritime');f.vase(1.55,.82,-3.97,true,'#4f8491');
    f.table(1.69,-4.06,1.0,.76,.77);f.shade(-.9,2.56,-3.54);
    f.journal(-.04,.906,-3.69,'Marées');
    for(let i=0;i<3;i++){const x=-1.88+i*.29;
      box(x,.91,-3.27,.21,.021,.14,cloth('#dfc79e'),i*.08);
      box(x-.067,.925,-3.30,.051,.005,.043,cloth(i%2?'#71928a':'#ae6d56'));}
    turned(-.42,.91,-3.36,[[.074,0],[.08,.022],[.038,.04],[.023,.105],[.046,.13],[.043,.174],[.020,.183]],dark);
    f.foliage(-2.10,0,-1.77,.83);
    rug(.42,.003,-1.62,1.54,1.75,['#427c86','#e1c99c']);
  }else if(id==='field'){
    frameArt(-.71,1.85,-d+.105,2.05,1.38,'botany','Herbarium');f.table(-.86,-4.75,3.25,1.04);
    for(let i=0;i<7;i++){
      const x=-2+i*.34,z=-4.81+(i%2)*.14;
      turned(x,.85,z,[[.062,0],[.085,.025],[.086,.21+(i%3)*.04],[.045,.25+(i%3)*.04],[.045,.29+(i%3)*.04]],finish(['#9ab2a4','#77958a','#b69a66'][i%3],'glaze'));
      rod([x,.91,z],[x+.035,1.34+i%3*.06,z],.007,finish('#647349'));
    }
    f.bench(-1.12,-3.83,1.35);rug(-.60,0,-2.42,2.42,1.37,['#7f9989','#e3d0a2']);
    floorboards(2.58,-d,-3.7,3.68,w/2-1.84);
    box(1.31,2.36,-3.78,3.68,.23,.15,dark);box(-.44,1.13,-3.83,.13,2.26,.13,dark);
    bed(.29,2.58,-4.79,1.28);ladderFlight(2.36,-1.03,-3.72,2.58,1.0);
    landingRail(-.48,1.76,-3.70,2.58);
    shelf(-2.05,1.39,-d+.22,1.56);f.books(-2.66,1.43,-d+.22,8);f.shade(-.8,2.66,-4.2);
    f.journal(-1.46,.843,-4.45,'Flora','botany');f.foliage(-2.70,0,-3.08,1.20);
    for(let i=0;i<3;i++){const x=-2.38+i*.28;
      rod([x,3.78,-d+.23],[x,3.28,-d+.23],.009,cloth('#bea67c'));
      for(let k=0;k<4;k++)rod([x,3.36,-d+.23],[x+(k%2?1:-1)*(.08+k*.016),3.04-.05*k,-d+.20+.02*k],.025,finish(k%2?'#8b855a':'#a68b72'));}
    f.lantern(1.32,2.58,-5.3);
  }else if(id==='watch'){
    const z=-d*.62;
    f.table(-.78,z-.48,1.65,.93,.83);
    turned(-.92,.89,z-.48,[[.26,0],[.29,.05],[.15,.12],[.11,.24],[.17,.27]],brass);
    for(let i=0;i<3;i++)ring(-.92,1.56,z-.48,.40,.018,brass,i*Math.PI/3);
    turned(-.92,1.46,z-.48,[[.04,0],[.11,.07],[.11,.14],[.04,.21]],finish('#a6c1b7','glaze'));
    frameArt(.10,2.10,-d+.23,1.47,1.01,'stars','Ciel boréal');f.bench(1.63,z+1.18,1.60,-.73);
    f.journal(-.29,.875,z-.55,'Étoiles','stars');
    for(const a of [0,2.095,4.19])rod([.76+.39*Math.sin(a),0,-3.53+.39*Math.cos(a)],[.76,1.38,-3.53],.045,dark);
    rod([.58,1.28,-3.25],[1.02,1.74,-4.04],.111,brass);rod([.97,1.66,-3.90],[1.05,1.78,-4.10],.135,paint);
    const scopeFrom=new T.Vector3(.58,1.28,-3.25),scopeTo=new T.Vector3(1.05,1.78,-4.10);
    for(const t of [.16,.31,.60,.88]){const a=scopeFrom.clone().lerp(scopeTo,t),b=scopeFrom.clone().lerp(scopeTo,t+.035);rod(a.toArray(),b.toArray(),.119,paint);}
    for(let i=0;i<6;i++){const a=i*Math.PI/3;
      box(Math.sin(a)*1.65,h-.20,-w/2+Math.cos(a)*1.65,.038,.038,.038,brass);}
    rug(0,0,-1.58,1.58,1.05,['#6d8481','#d9bb76']);
  }else if(id==='inn'){
    // The loft wraps the stairwell. Its front door opens onto the high terrace.
    const level=upperFloor,stairX=w/2-.74,stairW=1.16;
    floorboards(level,-d,-4.85,w);
    floorboards(level,-4.85,-.02,w-1.46,-.73);
    ladderFlight(stairX,-1.03,-4.87,level,stairW);
    const railX=w/2-1.49;box(railX,level+.85,-2.43,.068,.074,4.78,dark);
    for(let j=0;j<=16;j++)box(railX,level+.42,-.07-j*.293,.043,.84,.044,paint);
    bed(-1.90,level,-4.98,1.67);rug(-.28,level,-2.67,2.26,1.36,['#a25640','#e5bb82']);
    f.table(-1.86,-3.45,2.25,1.05);f.bench(-1.87,-2.49,1.86);f.bench(-1.87,-4.42,1.86);
    for(const x of [-2.36,-1.49]){turned(x,.851,-3.42,[[.01,0],[.16,.012],[.18,.034],[.16,.038],[.035,.02]],ivory);f.vase(x+.13,.86,-3.77,false,'#ab6849');}
    const hearth=finish('#b17250','stone');box(-1.24,1.2,-d+.27,2.34,2.4,.50,hearth);
    box(-1.24,.73,-d+.54,1.24,1.12,.049,finish('#412e27'));archFrame(-1.24,.84,-d+.58,.68,.09,stone);
    for(let k=0;k<4;k++)rod([-1.67,.23+k*.065,-d+.75],[-.87,.23+k*.065,-d+.68],.075,dark);
    shelf(.80,1.33,-d+.18,1.44);f.vase(.64,1.38,-d+.14,true,'#7b946e');
    frameArt(-1.55,level+1.69,-d+.10,1.42,.89,'sea','Sierra del Mar');f.shade(-1.83,2.18,-3.48);
    box(-1.84,.852,-3.45,.43,.015,.99,cloth('#a45e45'));
    for(let i=0;i<5;i++)box(-1.84,.864,-3.78+i*.036,.423,.006,.012,cloth('#e3bf83'));
    f.lantern(-1.84,.868,-3.48);
    box(-.47,level+.31,-5.39,.72,.62,.51,paint);box(-.47,level+.64,-5.39,.80,.07,.57,oak);
    box(-.47,level+.45,-5.117,.65,.24,.027,dark);box(-.47,level+.46,-5.087,.13,.023,.034,brass);
    f.lantern(-.52,level+.68,-5.42);f.foliage(-2.92,level,-2.46,.88);
    frameArt(.64,level+1.8,-d+.11,1.31,.84,'botany','Sauge des falaises');
  }else if(id==='baths'){
    const edge=finish('#e7dbc1','glaze'),blue=finish('#529c9b','glaze');
    for(let r=0;r<4;r++)for(let i=0;i<20;i++)box(-w/2+(i+.5)*w/20,.19+r*.27,-d+.091,w/20-.012,.26,.05,finish(r===3?'#3a817c':i%3?'#adcac1':'#c0d5c7','glaze'));
    const cx=-1.04,cz=-3.88;
    box(cx,.26,cz,2.41,.52,2.63,blue);box(cx,.525,cz,2.22,.05,2.44,finish('#4a9e9c','glaze'));
    for(const s of [-1,1]){box(cx+s*1.19,.56,cz,.16,.16,2.70,edge);box(cx,.56,cz+s*1.27,2.47,.16,.16,edge);}
    for(let i=0;i<5;i++)ring(cx-.22,.556+i*.0008,cz-.70,.10+i*.092,.003,finish('#b8e0cb','glaze'),new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2));
    rod([cx,1.24,-d+.19],[cx,1.24,cz-.96],.024,brass);rod([cx,1.24,cz-.96],[cx,1.10,cz-.96],.027,brass);
    for(const s of [-1,1])ring(cx+s*.18,1.23,-d+.19,.078,.010,brass);
    f.bench(1.85,-3.32,2.09,Math.PI/2);for(let i=0;i<4;i++)box(1.85,.53+i*.069,-3.96,.39,.079,.48,cloth(i%2?'#e1d8bd':'#a2beb8'));
    shelf(1.67,1.07,-d+.23,1.73);f.vase(1.54,1.12,-d+.20,true,'#557d77');f.shade(.1,2.86,-2.3);
    f.foliage(2.26,0,-4.97,.98);
    const bathBlue=finish('#32736e','glaze'),chalk=finish('#e3e1c6','glaze');
    for(let i=0;i<18;i++){
      const x=(i+.5)*w/18-w/2;
      box(x,1.13,-d+.139,w/18-.013,.17,.03,bathBlue);
      for(const s of [-1,1])rod([x-.075,1.13,-d+.16],[x,1.13+s*.047,-d+.16],.007,chalk);
      for(const s of [-1,1])rod([x+.075,1.13,-d+.16],[x,1.13+s*.047,-d+.16],.007,chalk);
    }
  }else if(id==='slip'){
    f.hull(-.65,.76,-4.1,3.9,1.43,wood('#a8794d'),.09);
    for(let i=0;i<6;i++)box(-.66,.99,-5.36+i*.50,.71+.51*Math.sin((i+.5)*Math.PI/6),.055,.12,dark,.09);
    for(const z of [-5.15,-3.03]){box(-.65,.56,z,1.59,.16,.18,dark);for(const s of [-1,1])rod([-.65+s*.74,.06,z],[ -.65+s*.50,.70,z],.063,oak);}
    f.table(1.91,-5.76,1.48,.85);for(let i=0;i<4;i++)ring(1.76,.86+i*.028,-5.76,.22,.024,cloth('#ba9d6c'),new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2));
    for(let i=0;i<3;i++){const x=-1.71+i*.39;rod([x,.15,-d+.21],[x+.36,2.52,-d+.21],.033,oak);box(x+.33,2.31,-d+.21,.153,.61,.055,paint,-.13);}
    for(const z of [-5.0,-3.1]){rod([-.68,h-.1,z],[-.68,1.26,z],.016,cloth('#bba26b'));ring(-.68,1.3,z,.082,.025,brass);}
    f.lantern(2.33,.844,-5.77);
    for(let k=0;k<2;k++){
      const x=1.52+k*.45;turned(x,0,-6.98,[[.19,0],[.22,.05],[.22,.38],[.235,.39],[.23,.42],[.19,.42]],finish(k?'#717c6d':'#718c98','metal'));
      ring(x,.43,-6.98,.165,.009,brass);
    }
  }else{
    const cz=-d/2,R=w/2,level=3.45,n=24,arc=Math.PI*1.55;
    turned(0,0,cz,[[.28,0],[.28,.13],[.19,.21],[.15,level],[.22,level+.04]],paint);
    // Each tread follows the tower wall. An open sector in the gallery lets
    // the visitor rise through it instead of meeting a solid ceiling.
    const start=.46;
    function wedge(a,b,inner,outer,y,material){
      const shape=new T.Shape();shape.moveTo(inner*Math.sin(a),-inner*Math.cos(a));
      shape.lineTo(outer*Math.sin(a),-outer*Math.cos(a));shape.lineTo(outer*Math.sin(b),-outer*Math.cos(b));shape.lineTo(inner*Math.sin(b),-inner*Math.cos(b));shape.closePath();
      const g=new T.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:false});g.rotateX(-Math.PI/2);f.put(g,material,0,y-.07,cz);g.dispose();
    }
    for(let i=0;i<n;i++){const a=start+i*arc/n,b=a+arc/n,y=(i+1)*level/n;
      wedge(a,b+.004,1.18,R-.14,y,oak);
      const p=t=>[Math.sin(t)*1.20,y+.80,cz+Math.cos(t)*1.20];
      if(i%2===0)rod([Math.sin(a)*1.20,y,cz+Math.cos(a)*1.20],p(a),.018,brass);
      const next=p(b);next[1]+=level/n;rod(p(a),next,.025,brass);
    }
    for(let i=0;i<40;i++){const a=start+arc+i*Math.PI/20,b=a+Math.PI/20;
      wedge(a,b+.003,.18,i<18?R-.12:1.14,level,wood('#956e50'));}
    turned(0,level,cz,[[.67,0],[.68,.10],[.58,.14],[.29,.26],[.26,.57],[.39,.64],[.56,.72],[.56,.78],[.44,.80]],brass);
    const glass=finish('#d8e8d1','glaze');glass.emissive.set('#ffdc8b');glass.emissiveIntensity=.80;
    for(let i=0;i<15;i++){
      const radius=.36+.13*Math.sin((i+.5)*Math.PI/15);
      turned(0,level+.79+i*.058,cz,[[radius,0],[radius+.056,.021],[radius-.008,.059]],glass,64);
    }
    turned(0,level+1.65,cz,[[.42,0],[.49,.028],[.47,.076],[.32,.12],[.15,.22],[.055,.26]],brass);
    for(let i=0;i<6;i++){const a=i*Math.PI/3,x=.46*Math.sin(a),z=cz+.46*Math.cos(a);
      rod([x,level+.78,z],[x,level+1.68,z],.012,brass);}
    f.bench(-.63,-2.06,1.05,Math.PI/2);
    f.table(-.52,-3.82,1.27,.54,.79);f.journal(-.61,.836,-3.81,'Quart de nuit');f.lantern(-.06,.836,-3.81);
    frameArt(.05,1.90,-d+.18,.72,.98,'sea','Marées');
  }
  f.finishBatches();
  const hemi=new T.HemisphereLight('#f1f1df','#927d6b',1.18);scene.add(hemi);
  const sun=new T.DirectionalLight(dayColor||'#ffdfad',2.15);sun.position.set(-w*.48,h-.30,-d*.11);sun.target.position.set(w*.22,.12,-d*.70);scene.add(sun,sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-7,right:7,top:8,bottom:-7,near:.05,far:18});sun.shadow.normalBias=.012;sun.shadow.bias=-.00018;sun.shadow.needsUpdate=true;
  const bounce=new T.PointLight('#ffdeac',23,11,2);bounce.position.set(w*.26,h*.64,-d*.55);scene.add(bounce);
  model.updateWorldMatrix(true,true);
  return {scene,model,dispose(){model.traverse(o=>o.geometry?.dispose());f.dispose();sun.shadow.dispose();}};
}
