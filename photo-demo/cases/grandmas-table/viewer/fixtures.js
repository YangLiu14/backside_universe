import * as T from 'three';
import {rainWindow} from './atmosphere.js';

function piece(parent, geometry, material, x,y,z) {
  const m=new T.Mesh(geometry,material); m.position.set(x,y,z);
  m.receiveShadow=true;parent.add(m);return m;
}
export function block(g,w,h,d,x,y,z,m){
  const box=piece(g,new T.BoxGeometry(w,h,d),m,x,y,z);
  box.castShadow=true;return box;
}
function easedBlock(g,w,h,d,x,y,z,mat,radius=.0023){
  // Round actual edges so a moving eye catches the thin enamel/varnish glint.
  const geo=new T.BoxGeometry(1,1,1,6,6,6),pos=geo.attributes.position,norm=geo.attributes.normal,uv=geo.attributes.uv;
  const r=Math.min(radius,w*.23,h*.23,d*.23),p=new T.Vector3(),core=new T.Vector3(),dir=new T.Vector3();
  function place(value,size){
    const ring=Math.round(Math.abs(value)*6);
    return Math.sign(value)*[0,size*.5-r,size*.5-r*.42,size*.5][ring];
  }
  for(let i=0;i<pos.count;i++){
    const faceX=norm.getX(i),faceY=norm.getY(i);
    p.set(place(pos.getX(i),w),place(pos.getY(i),h),place(pos.getZ(i),d));
    core.set(T.MathUtils.clamp(p.x,r-w/2,w/2-r),T.MathUtils.clamp(p.y,r-h/2,h/2-r),T.MathUtils.clamp(p.z,r-d/2,d/2-r));
    dir.subVectors(p,core).normalize();p.copy(core).addScaledVector(dir,r);
    pos.setXYZ(i,p.x,p.y,p.z);norm.setXYZ(i,dir.x,dir.y,dir.z);
    if(Math.abs(faceX)>.5)uv.setXY(i,p.z/d+.5,p.y/h+.5);
    else uv.setXY(i,p.x/w+.5,Math.abs(faceY)>.5?p.z/d+.5:p.y/h+.5);
    if(mat.map&&w>h*3){
      const cross=Math.abs(faceY)>.5?d:h;
      const offset=.49+.30*Math.sin(x*18+y*40+z*11);
      uv.setY(i,offset+(uv.getY(i)-.5)*Math.min(1,cross/w*1.5));
    }
  }
  const member=piece(g,geo,mat,x,y,z);member.castShadow=true;return member;
}
const finish=(color,roughness,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
function lathe(g,profile,m,x=0,y=0,z=0){
  return piece(g,new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r,h)),64),m,x,y,z);
}
function tube(g,points,r,mat,segments=20){
  return piece(g,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),segments,r,6,false),mat,0,0,0);
}

function laceCurtain(wall,x,lo,h) {
  const c=document.createElement('canvas');c.width=c.height=192;
  const ctx=c.getContext('2d');
  ctx.strokeStyle='rgba(232,217,186,.45)';ctx.lineWidth=1.3;
  for(let i=0;i<=192;i+=5){
    ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,192);ctx.moveTo(0,i);ctx.lineTo(192,i);ctx.stroke();
  }
  ctx.strokeStyle='rgba(255,249,230,.86)';ctx.lineWidth=4;
  for(const [u,v] of [[48,48],[144,144]])for(let i=0;i<6;i++){
    ctx.save();ctx.translate(u,v);ctx.rotate(i*Math.PI/3);
    ctx.beginPath();ctx.ellipse(0,-8,4.3,9,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  const pattern=new T.CanvasTexture(c);pattern.colorSpace=T.SRGBColorSpace;
  pattern.wrapS=pattern.wrapT=T.RepeatWrapping;pattern.repeat.set(2.5,8);pattern.anisotropy=4;
  const curtain=new T.PlaneGeometry(1,1,40,32),pos=curtain.attributes.position;
  for(let i=0;i<pos.count;i++){
    const u=pos.getX(i)+.5,v=pos.getY(i)+.5;
    const gather=Math.exp(-((v-.38)**2)/.018),wid=.095+.075*v-.067*gather;
    const pleat=Math.cos(u*Math.PI*11.2);
    pos.setXYZ(i,x+u*wid,lo+.015+v*h-.009*(1-v)*pleat,.073+.011*pleat+.015*Math.sin(v*3.1)*(1-gather));
  }
  curtain.computeVertexNormals();
  const fabric=piece(wall,curtain,new T.MeshStandardMaterial({color:0xfff2d7,map:pattern,roughness:1,side:T.DoubleSide,transparent:true,depthWrite:false}),0,0,0);
  fabric.renderOrder=2;
  const cord=finish(0xa1814b,.82);
  tube(wall,[[x-.012,lo+.38*h+.014,.074],[x+.013,lo+.38*h,.104],[x+.039,lo+.38*h+.009,.075]],.0026,cord);
}

// A washed kitchen cloth hung by one corner, on a hook near the table.
export function towelHook(wall){
  const wood=finish(0x574030,.67),iron=finish(0x524a3f,.48,.56);
  block(wall,.050,.075,.012,-.06,1.087,.012,wood);
  tube(wall,[[-.06,1.073,.018],[-.06,1.064,.035],[-.06,1.076,.052],[-.06,1.087,.056]],.0037,iron);
  const fabric=document.createElement('canvas');fabric.width=fabric.height=256;
  const ctx=fabric.getContext('2d');ctx.fillStyle='#c6c2a9';ctx.fillRect(0,0,256,256);
  // Warp and weft cross at the blue checks and the narrow red selvedge.
  for(const [w,a,c] of [[48,64,'rgba(49,75,86,.44)'],[7,44,'rgba(34,58,69,.61)'],[4,128,'rgba(113,56,43,.59)']]){
    ctx.fillStyle=c;for(let pos=a;pos<256;pos+=128){ctx.fillRect(pos,0,w,256);ctx.fillRect(0,pos,256,w);}
  }
  for(let i=0;i<256;i+=3){ctx.fillStyle='rgba(230,219,190,.20)';ctx.fillRect(0,i,256,1);ctx.fillStyle='rgba(60,53,42,.13)';ctx.fillRect(i,0,1,256);}
  const tex=new T.CanvasTexture(fabric);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;
  tex.repeat.set(2.2,2.9);tex.anisotropy=4;
  const g=new T.PlaneGeometry(1,1,36,32),pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
    const u=pos.getX(i)+.5,v=.5-pos.getY(i),fold=Math.cos(u*17.+v*2.7);
    const width=.022+.153*Math.pow(v,.67);
    pos.setXYZ(i,-.06+(u-.5)*width+.035*v,1.084-.284*v-.040*v*Math.cos(u*3.2),
      .060+(.005+.012*v)*fold+.012*v*Math.cos(u*7.5-v*3.));
  }
  g.computeVertexNormals();const cloth=piece(wall,g,new T.MeshStandardMaterial({map:tex,roughness:1,side:T.DoubleSide}),0,0,0);
  cloth.castShadow=true;
}

export const bay={x:-.31,lo:.695,hi:1.328,w:.765};
export function makeWindow(wall,textures,clock){
  const {x,w,lo,hi}=bay,h=hi-lo,cy=(lo+hi)/2;
  const panel=rainWindow(w,h,textures.courtyard,textures['courtyard-depth'],clock);panel.position.set(x,cy,-.035);wall.add(panel);
  const wood=new T.MeshStandardMaterial({map:textures.elm,color:0xb79978,roughness:.58,bumpMap:textures.elm,bumpScale:.0012});
  const sash=textures['window-paint'];
  const painted=new T.MeshStandardMaterial({map:sash,color:0xe1ded2,roughness:.67,bumpMap:sash,bumpScale:.0011});
  const putty=finish(0xaca68c,.90), brass=finish(0x8d724c,.4,.61),iron=finish(0x3e3931,.58,.58);
  function rail(length,width,depth,px,py,pz,vertical,mat){
    const b=easedBlock(wall,length,width,depth,px,py,pz,mat);if(vertical)b.rotation.z=Math.PI/2;return b;
  }
  for(const side of [-1,1]){
    const a=x+side*w/2;
    rail(h+.075,.047,.09,a,cy,-.005,true,wood);
    rail(h+.094,.012,.025,a+side*.024,cy,.041,true,wood);
    rail(h,.026,.032,a-side*.023,cy,.022,true,painted);
    rail(h-.04,.006,.011,a-side*.039,cy,.016,true,putty);
  }
  for(const [y,s] of [[lo,1],[hi,-1]]){
    rail(w+.078,.047,.098,x,y,.003,false,wood);
    rail(w-.034,.022,.035,x,y+s*.024,.023,false,painted);
    rail(w-.052,.006,.012,x,y+s*.039,.017,false,putty);
  }
  easedBlock(wall,w+.13,.029,.15,x,lo-.032,.034,wood,.0045);
  easedBlock(wall,w+.112,.014,.113,x,lo-.051,.027,wood);
  const upright=x-.014;
  rail(h-.044,.029,.045,upright,cy,.036,true,painted);
  rail(h-.052,.005,.009,upright+.014,cy,.054,true,painted);
  rail(h-.056,.004,.012,upright-.018,cy,.026,true,putty);
  rail(w-.064,.016,.035,x,lo+h*.70,.024,false,painted);
  rail(w-.068,.004,.012,x,lo+h*.70-.008,.021,false,putty);
  for(const y of [lo+h*.20,hi-.111]){
    for(const sx of [-1,1]){
      const bx=x+sx*(w/2-.019);
      easedBlock(wall,.021,.041,.003,bx,y,.048,brass);
      piece(wall,new T.CylinderGeometry(.0036,.0036,.042,10),brass,bx+sx*.008,y,.053);
      for(const dy of [-.013,.013]){
        const stud=piece(wall,new T.CylinderGeometry(.0028,.0028,.0021,12),iron,bx-sx*.003,y+dy,.051);
        stud.rotation.x=Math.PI/2;
        const slot=block(wall,.0038,.00065,.0003,bx-sx*.003,y+dy,.0522,finish(0x29231e,.73));
        slot.rotation.z=dy>0?.55:-.29;
      }
    }
  }
  block(wall,.023,.041,.004,upright,lo+h*.44,.062,brass);
  tube(wall,[[upright,lo+h*.455,.065],[upright+.004,lo+h*.455,.076],[upright+.038,lo+h*.445,.081],[upright+.048,lo+h*.448,.077]],.0036,brass);
  const rod=piece(wall,new T.CylinderGeometry(.004,.004,w+.09,12),iron,x,hi+.038,.082);rod.rotation.z=Math.PI/2;
  laceCurtain(wall,x-w/2+.006,lo+.005,h+.023);
  return panel;
}

export function pendant(group){
  const lamp=new T.Group();lamp.position.set(.005,1.25,-.29);group.add(lamp);
  const brass=finish(0x987346,.33,.71), black=finish(0x25231e,.69), ceramic=finish(0xd2c5ae,.31);
  const green=new T.MeshPhysicalMaterial({color:0x26574c,roughness:.29,metalness:.30,clearcoat:.55,clearcoatRoughness:.23,side:T.DoubleSide});
  green.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 shadePoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nshadePoint=position;');
    shader.fragmentShader='varying vec3 shadePoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float r=length(shadePoint.xz);
      float a=atan(shadePoint.z,shadePoint.x);
      float nick=smoothstep(.934,.99,sin(a*67.+.8*sin(a*38.)))*smoothstep(.121,.128,r);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.25,.145,.066),nick*.63);
    `);
  };
  const cream=new T.MeshStandardMaterial({color:0xe3cda1,roughness:.46,metalness:.16,side:T.DoubleSide,emissive:0xf6a957,emissiveIntensity:.085});
  cream.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 enamelPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nenamelPosition=position;');
    shader.fragmentShader='varying vec3 enamelPosition;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
      float radius=length(enamelPosition.xz)/.13;
      float falloff=1./(1.+3.8*radius*radius);
      vec3 lining=vec3(.60,.48,.32)*(.52+1.40*falloff);
      lining*=1.-.16*smoothstep(.96,1.,radius);
      outgoingLight=lining+.15*min(outgoingLight,vec3(1.7,1.4,.9));
      #include <opaque_fragment>
    `);
  };
  const bell=[[.012,.043],[.024,.043],[.032,.036],[.035,.021],[.044,.012],[.063,.002],[.089,-.013],[.112,-.022],[.128,-.026],[.130,-.028],[.128,-.030]];
  lathe(lamp,bell,green);
  lathe(lamp,bell.map(([r,y])=>[Math.max(.009,r-.0014),y-.0018]),cream);
  const rim=piece(lamp,new T.TorusGeometry(.1285,.0021,10,96),brass,0,-.028,0);rim.rotation.x=Math.PI/2;
  lathe(lamp,[[.015,.040],[.016,.049],[.012,.051],[.012,.065],[.008,.071]],brass);
  lathe(lamp,[[.014,-.003],[.019,-.001],[.019,.017],[.013,.019]],ceramic);
  for(const y of [.051,.056,.061])lathe(lamp,[[.012,y],[.014,y+.001],[.012,y+.003]],black);
  for(const twist of [0,Math.PI]){
    const wires=Array.from({length:32},(_,i)=>[.0023*Math.cos(i*.64+twist),.070+i*.00387,.0023*Math.sin(i*.64+twist)]);
    tube(lamp,wires,.0023,black,50);
  }
  lathe(lamp,[[.006,.182],[.011,.19],[.029,.195],[.030,.201]],ceramic);
  const socket=finish(0xab8052,.25,.70);
  lathe(lamp,[[.009,-.019],[.012,-.018],[.012,.001]],socket);
  for(let i=0;i<4;i++)lathe(lamp,[[.012,-.003-i*.003],[.013,-.004-i*.003],[.012,-.005-i*.003]],brass);
  const globe=new T.MeshPhysicalMaterial({color:0xffdc9e,roughness:.13,metalness:.06,transparent:true,opacity:.32,
    emissive:0xffcb86,emissiveIntensity:.29,depthWrite:false,side:T.FrontSide,clearcoat:1});
  lathe(lamp,[[.001,-.067],[.014,-.063],[.021,-.056],[.024,-.045],[.023,-.037],[.019,-.032],[.013,-.024],[.010,-.017]],globe);
  tube(lamp,[[-.005,-.018,0],[-.0055,-.043,0],[-.003,-.048,0]],.0008,brass);
  tube(lamp,[[.005,-.018,0],[.0055,-.043,0],[.003,-.048,0]],.0008,brass);
  const filament=new T.MeshBasicMaterial({color:new T.Color(4.2,2.45,.86)});
  tube(lamp,[[-.004,-.045,0],[-.002,-.052,0],[0,-.048,0],[.002,-.052,0],[.004,-.045,0]],.0014,filament);
  const bulb=new T.Sprite(new T.SpriteMaterial({map:filamentGlow(),color:0xffca81,blending:T.AdditiveBlending,depthWrite:false,opacity:.76}));
  bulb.position.set(0,-.05,0);bulb.scale.set(.085,.085,1);lamp.add(bulb);
  return lamp;
}

function filamentGlow(){
  const c=document.createElement('canvas');c.width=c.height=64;
  const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
  for(const [s,a] of [[0,.95],[.09,.66],[.23,.30],[.48,.085],[1,0]])g.addColorStop(s,'rgba(255,240,207,'+a+')');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
