// The same doorway is built at the end of the clay room and on the dog's cutaway.
import * as T from 'three';

const finishes={
  chest:{body:'#393143',edge:'#aa8052',tile:'#2d6057',glow:'#ffe3a1'},
  upper:{body:'#89492e',edge:'#ca9461',tile:'#34685e',glow:'#ffac57'},
  bowel:{body:'#614331',edge:'#ba9865',tile:'#48685a',glow:'#ffe4ac'}
};
function aperture(radius,base,spring){
  const p=new T.Shape();p.moveTo(-radius,base);p.lineTo(-radius,spring);
  p.absarc(0,spring,radius,Math.PI,0,true);p.lineTo(radius,base);return p;
}
export function createFoyer(zone){
  const group=new T.Group(),f=finishes[zone];
  group.name='Gallery threshold: '+zone;
  const mat=(color,metalness=0)=>new T.MeshStandardMaterial({color,roughness:metalness?.42:.83,metalness});
  const body=mat(f.body),trim=mat(f.edge,zone==='upper'?.12:.48),tile=mat(f.tile);
  const warm=new T.MeshStandardMaterial({color:f.glow,emissive:f.glow,emissiveIntensity:.82,roughness:.66});
  function solid(g,m,x=0,y=0,z=0){
    const o=new T.Mesh(g,m);o.position.set(x,y,z);group.add(o);return o;
  }
  function box(x,y,z,w,h,d,m){return solid(new T.BoxGeometry(w,h,d),m,x,y,z);}
  function arch(outer,inner,y0,spring,z,depth,m){
    const s=aperture(outer,y0,spring);
    s.lineTo(inner,y0);s.lineTo(inner,spring);s.absarc(0,spring,inner,0,Math.PI,false);
    s.lineTo(-inner,y0);s.closePath();
    return solid(new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:2,bevelSize:.016,bevelThickness:.014,curveSegments:40}),m,0,0,z);
  }
  arch(1.16,1,-1.10,.07,-.16,.24,body);
  arch(1.027,.991,-1.08,.07,.096,.037,trim);
  arch(1.005,.986,-1.06,.07,-.16,.025,warm);
  box(0,-1.108,-.015,2.38,.095,.43,body);
  box(0,-1.05,.13,2.28,.025,.09,trim);
  for(const side of [-1,1]){
    box(side*1.095,-.96,.08,.25,.21,.32,tile);
    if(zone==='chest'){
      for(let i=0;i<4;i++){
        const h=.97-i*.15,x=side*(1.035+i*.067);
        solid(new T.CylinderGeometry(.031,.038,h,18),trim,x,-.85+h*.5,.20);
        solid(new T.CylinderGeometry(.04,.035,.04,18),warm,x,-.85+h,.20);
      }
    }else if(zone==='upper'){
      const pts=[[.03,0],[.115,.03],[.14,.15],[.105,.24],[.075,.26],[.073,.3],[.087,.30]];
      solid(new T.LatheGeometry(pts.map(([r,h])=>new T.Vector2(r,h)),32),tile,side*.99,-1.048,.26);
    }else{
      box(side*1.07,-.47,.10,.17,.88,.22,body);
      for(let i=0;i<4;i++)box(side*1.065,-.77+i*.19,.22,.19,.026,.075,trim);
      box(side*1.06,-.29,.22,.13,.25,.07,warm);
    }
  }
  if(zone==='upper'){
    // Wedge-shaped fired-clay voussoirs around the kiln mouth.
    const clay=['#a45638','#ba7050','#94503a'].map(c=>mat(c));
    for(let i=0;i<17;i++){
      const a=Math.PI*i/17+.013,b=Math.PI*(i+1)/17-.013,s=new T.Shape();
      s.absarc(0,.07,1.147,a,b,false);s.absarc(0,.07,1.044,b,a,true);s.closePath();
      solid(new T.ExtrudeGeometry(s,{depth:.028,bevelEnabled:false,curveSegments:16}),clay[i%3],0,0,.09);
    }
  }
  return group;
}
