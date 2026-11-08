import * as T from 'three';

const points = [
  [.003,.293,.501],[.004,.291,.473],[.002,.289,.436],[.000,.287,.396],[-.007,.283,.350],
  [-.015,.261,.308],[-.022,.221,.272],[-.027,.167,.229],[-.022,.111,.183],[-.013,.064,.133],
  [.003,.021,.105],[.010,-.005,.090],[.019,-.030,.073],[.026,-.052,.055],[.032,-.073,.034],
  [.034,-.088,.013],[.023,-.099,-.015],[.018,-.115,-.044],[.021,-.121,-.078],
  [.038,-.117,-.103],[.055,-.099,-.099],[.057,-.083,-.071],[.039,-.071,-.063],
  [.016,-.072,-.079],[-.001,-.092,-.117],[-.003,-.112,-.158],
  [.012,-.121,-.186],[.025,-.105,-.204],[.025,-.079,-.200],[.015,-.064,-.178],
  [-.002,-.056,-.149],[-.009,-.062,-.126],[-.026,-.082,-.135],[-.028,-.094,-.178],
  [-.023,-.106,-.223],[-.017,-.126,-.273],[-.009,-.151,-.323],[.002,-.181,-.375],
  [.009,-.194,-.405]
];
export const boundaries=[0,4,10,15,25,34,38];
const last=points.length-1, scale=100;
const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p).multiplyScalar(scale)),false,'centripetal');
const up=new T.Vector3(0,1,0),tau=2*Math.PI;
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
export const nativeAt=k=>curve.getPoint(T.MathUtils.clamp(k,0,last)/last).divideScalar(scale);
function frame(k){
  const t=T.MathUtils.clamp(k,0,last)/last,center=curve.getPoint(t),forward=curve.getTangent(t);
  const right=forward.clone().cross(up).normalize(),vertical=right.clone().cross(forward).normalize();
  return {center,forward,right,vertical};
}
const profiles=[
  [0,2.55,1.25],[2,3.65,1.98],[3.5,2.92,1.85],[4.7,1.30,1.09],[7,1.24,1.12],[9.3,1.28,1.15],
  [10.5,2.66,2.33],[12.2,3.75,3.05],[13.1,3.05,2.62],[14.1,1.89,1.67],[15,1.00,.93],
  [16.5,1.17,1.06],[22,1.12,1.02],[24.6,1.08,1.04],[26,1.44,1.28],[29,1.55,1.34],
  [33.9,1.54,1.34],[35.5,1.66,1.36],[36.9,1.16,1.04],[38,1.52,1.26]
];
const colors=['#d58e93','#76aaa0','#b57953','#deb270','#8ca787','#ac91b4'].map(x=>new T.Color(x));
function tissue(k){
  let j=1;while(j<profiles.length-1&&profiles[j][0]<k)j++;
  const a=profiles[j-1],b=profiles[j],t=smooth(a[0],b[0],k);
  let chapter=0;while(chapter<5&&k>=boundaries[chapter+1])chapter++;
  const at=boundaries[chapter+1],blend=smooth(at-.72,at,k);
  return {x:T.MathUtils.lerp(a[1],b[1],t),y:T.MathUtils.lerp(a[2],b[2],t),
    color:colors[chapter].clone().lerp(colors[Math.min(chapter+1,5)],blend),chapter};
}
function wave(k,angle,region){
  const long=Math.sin(angle*6+.70*Math.sin(k*.8)+.15*k);
  const folds=[
    .04*Math.cos(angle*3)+.065*Math.sin(k*13+Math.cos(angle)*1.7),
    .14*Math.sin(angle*6+.5*Math.sin(k*1.8))+.06*Math.cos(k*9+long),
    .18*Math.sin(angle*8+1.38*Math.sin(k*1.35+angle))+.072*Math.sin(angle*4-k*2.2)+.052*Math.cos(k*8+2*long),
    .088*Math.sin(k*12.6+2.4*Math.sin(angle+1.1*k))+.032*long,
    .065*Math.cos(angle*4+.3*k)+.10*Math.cos(k*5.8+1.2*long),
    .07*Math.sin(angle*5+.38*k)+.036*Math.cos(k*7.3+long)];
  const edge=boundaries[region+1];
  return T.MathUtils.lerp(folds[region],folds[Math.min(region+1,5)],smooth(edge-.72,edge,k));
}
function surface(f,shape,k,angle){
  const r=1+wave(k,angle,shape.chapter);
  return f.center.clone().addScaledVector(f.right,Math.cos(angle)*shape.x*r).addScaledVector(f.vertical,Math.sin(angle)*shape.y*r);
}
function buildWall(){
  const segments=880,sides=80,pos=[],rgb=[],idx=[],travel=[],radial=[];
  for(let i=0;i<=segments;i++){
    const k=last*i/segments,f=frame(k),shape=tissue(k);
    for(let j=0;j<=sides;j++){
      const a=tau*j/sides,p=surface(f,shape,k,a),relief=wave(k,a,shape.chapter);
      const grain=.024*Math.sin(11*a+2*k)*Math.sin(23*a-6*k);
      const c=shape.color.clone().multiplyScalar(.91+.46*relief+grain+.07*Math.cos(a*3+.6*k));
      pos.push(...p.toArray());rgb.push(c.r,c.g,c.b);travel.push(k);radial.push(...p.clone().sub(f.center).toArray());
      if(i<segments&&j<sides){const v=i*(sides+1)+j,w=v+sides+1;idx.push(v,v+1,w,v+1,w+1,w);}
    }
  }
  const g=new T.BufferGeometry();
  for(const [name,data,size] of [['position',pos,3],['color',rgb,3],['along',travel,1],['outward',radial,3]])g.setAttribute(name,new T.Float32BufferAttribute(data,size));
  g.setIndex(idx);g.computeVertexNormals();
  const clock={value:0},m=new T.MeshStandardMaterial({vertexColors:true,roughness:.86,side:T.DoubleSide});
  m.onBeforeCompile=shader=>{
    shader.uniforms.journeyClock=clock;
    shader.vertexShader='uniform float journeyClock; attribute float along; attribute vec3 outward; varying vec3 wallCoord;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nwallCoord=position; float pulse=smoothstep(4.,5.,along)*(1.-smoothstep(9.3,10.,along))*pow(.5+.5*cos(along*3.-journeyClock*2.1),5.); transformed-=outward*.13*pulse;');

  };
  return {mesh:new T.Mesh(g,m),clock};
}
function random(seed){return ()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function instanced(scene,geometry,settings,items){
  const mesh=new T.InstancedMesh(geometry,new T.MeshStandardMaterial(settings),items.length);
  const obj=new T.Object3D();
  items.forEach(({position,direction,size,color},i)=>{
    obj.position.copy(position);obj.quaternion.setFromUnitVectors(up,direction);obj.scale.fromArray(size);obj.updateMatrix();
    mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,new T.Color(color));
  });scene.add(mesh);
}
function liningDetails(scene){
  const rng=random(1108),teeth=[],villi=[],papillae=[];
  const shape=new T.LatheGeometry([[0,0],[.53,0],[.50,.18],[.38,.51],[.32,.77],[.20,.91],[0,.98]].map(([x,y])=>new T.Vector2(x,y)),14);
  for(let i=0;i<12;i++)for(const side of [-1,1])for(const upper of [false,true]){
    const k=.13+i*.282+(upper?0:.125),a=(side>0?0:Math.PI)+(upper?1:-1)*side*(.54+.10*Math.cos(i));
    const f=frame(k),wall=surface(f,tissue(k),k,a),canine=i===2;
    const direction=f.vertical.clone().multiplyScalar(upper?-1:1).addScaledVector(f.right,-side*.20).addScaledVector(f.forward,.13).normalize();
    teeth.push({position:wall,direction,size:canine?[.78,1.41,.82]:[.60,.68+.13*Math.cos(i),.76],color:'#f1dfb4'});
  }
  instanced(scene,shape,{roughness:.78},teeth);
  for(let j=0;j<2550;j++){
    const k=15.16+rng()*9.70,a=tau*rng(),f=frame(k),wall=surface(f,tissue(k),k,a);
    const inward=f.center.clone().sub(wall).normalize(),len=.095+rng()*.19;
    villi.push({position:wall.clone().addScaledVector(inward,len*.34),direction:inward.addScaledVector(f.forward,.25*(rng()-.4)).normalize(),
      size:[.04+rng()*.036,len*.70,.046+rng()*.033],color:rng()>.55?'#d3a476':'#c18e68'});
  }
  const oval=new T.SphereGeometry(1,8,7);
  instanced(scene,oval,{roughness:.6},villi);
  // The tongue is a continuous raised surface down the floor of the oral cavity.
  const tonguePath=[];
  for(let i=0;i<=32;i++){const k=.04+3.34*i/32,f=frame(k);tonguePath.push(f.center.clone().addScaledVector(f.vertical,-tissue(k).y*.92));}
  const tongueCurve=new T.CatmullRomCurve3(tonguePath),tg=new T.TubeGeometry(tongueCurve,64,.87,30,false);
  const verts=tg.attributes.position,v=new T.Vector3();
  for(let i=0;i<=64;i++){const c=tongueCurve.getPointAt(i/64),soft=.45+.55*Math.sin(Math.PI*i/64);
    for(let j=0;j<=30;j++){const h=i*31+j;v.fromBufferAttribute(verts,h).sub(c);v.x*=1.9*soft;v.y*=.61;v.add(c);verts.setXYZ(h,v.x,v.y,v.z);}}
  tg.computeVertexNormals();scene.add(new T.Mesh(tg,new T.MeshStandardMaterial({color:'#ad6966',roughness:.47})));
  for(let i=0;i<280;i++){const t=.07+rng()*.84,c=tongueCurve.getPointAt(t),x=(rng()-.5)*2.45,s=.05+rng()*.04;
    c.x+=x;c.y+=.42*Math.sqrt(Math.max(.03,1-(x/1.55)**2));papillae.push({position:c,direction:up,size:[s,s*.57,s],color:'#bc7c77'});}
  instanced(scene,oval,{roughness:.64},papillae);
}
function absorption(scene){
  const count=125,rng=random(22),seeds=[];
  const mesh=new T.InstancedMesh(new T.SphereGeometry(1,8,6),new T.MeshStandardMaterial({roughness:.32,metalness:.10,emissive:'#382315'}),count);
  for(let i=0;i<count;i++){
    const k=i<82?15.6+9*rng():25.6+8*rng(),a=tau*rng(),f=frame(k),p=surface(f,tissue(k),k,a);
    seeds.push({origin:f.center,end:p,phase:rng(),size:.024+rng()*.029});
    mesh.setColorAt(i,new T.Color(i<82?'#e9b863':'#79bcb7'));
  }
  mesh.frustumCulled=false;scene.add(mesh);const o=new T.Object3D();
  return time=>{seeds.forEach(({origin,end,phase,size},i)=>{
    const t=(time*.17+phase)%1;o.position.lerpVectors(origin,end,.35+.68*t);
    o.scale.setScalar(size*Math.sin(Math.PI*t)**.6);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
  });mesh.instanceMatrix.needsUpdate=true;};
}
export function createTract(){
  const scene=new T.Scene();scene.background=new T.Color('#f4e9c8');scene.fog=new T.FogExp2('#795752',.055);
  const camera=new T.PerspectiveCamera(76,1,.025,85),wall=buildWall();scene.add(wall.mesh);
  liningDetails(scene);const moveParticles=absorption(scene);
  scene.add(new T.HemisphereLight('#ffeed4','#9e6861',1.0));
  const key=new T.PointLight('#ffeace',8,20,1.65),fill=new T.PointLight('#ffd5a1',6,15,1.55);
  scene.add(key,fill);
  const endpoint=frame(last);
  const disc=new T.Mesh(new T.CircleGeometry(4.5,64),new T.MeshBasicMaterial({color:'#fff0cd',side:T.DoubleSide,fog:false}));
  disc.position.copy(endpoint.center).addScaledVector(endpoint.forward,1.0);disc.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),endpoint.forward);scene.add(disc);
  function render(renderer,k,time,aspect,yaw,pitch){
    const f=frame(k);camera.position.copy(f.center);
    const lead=curve.getPoint(Math.min(last,k+.39)/last).sub(f.center).normalize();
    if(!lead.lengthSq())lead.copy(f.forward);
    lead.applyAxisAngle(up,yaw).applyAxisAngle(f.right,pitch);
    camera.up.copy(up);camera.lookAt(f.center.clone().add(lead));camera.updateMatrixWorld();
    camera.aspect=aspect;camera.updateProjectionMatrix();
    key.position.copy(f.center).addScaledVector(f.right,-.37).addScaledVector(f.vertical,.42);
    fill.position.copy(curve.getPoint(Math.min(last,k+.97)/last)).addScaledVector(f.right,.24);
    wall.clock.value=time;moveParticles(time);
    renderer.setClearColor(scene.background);renderer.clear();renderer.render(scene,camera);
  }
  return {render};
}
