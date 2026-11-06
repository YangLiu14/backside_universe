import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {addKelp,growBranchCoral,plateGeometry,rockGeometry,seeded} from '../vendor/abyssal/reef-forms.js';

const V=THREE.Vector3,TAU=Math.PI*2,depth=.54;
const smooth=THREE.MathUtils.smoothstep;
const vertexData=(g,key,data,size)=>g.setAttribute(key,new THREE.Float32BufferAttribute(data,size));

// Directional caustics adapted from ABYSSAL UnderwaterMaterial (see vendor/abyssal/LICENSE.txt).
const caustics=`
float rippleLight(vec3 p,float time){
  vec2 q=p.xz*85.+p.y*vec2(8.,4.);
  float t=time*.60;
  q+=vec2(sin(q.y*1.14+t),sin(q.x*.83-t*.8))*.80;
  float a=abs(sin(q.x*1.7+sin(q.y*1.5+t)*1.7)+sin(q.y*1.8-sin(q.x+t*.63)*1.4));
  float b=abs(sin(q.x*2.3-t*.7)+sin(q.y*2.5+t*.5));
  return pow(1.-min(1.,a*.62),12.)*.8+pow(1.-min(1.,b*.56),17.)*.35;
}`;

function habitatMaterial(clock,{kelp=false,sand=false,fish=false}={}){
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,side:THREE.DoubleSide,envMapIntensity:.40});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.oceanTime=clock;
    shader.vertexShader='varying vec2 reefUV;uniform float oceanTime;varying vec3 reefPoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      ${kelp?`float phase=instanceMatrix[3].x*12.+instanceMatrix[3].z*8.;
      float bend=pow(clamp(position.y/21.,0.,1.),1.6);
      transformed.x+=bend*(1.7*sin(oceanTime*.82+phase+position.y*.13)+.6*sin(oceanTime*1.43+phase));
      transformed.z+=bend*.9*cos(oceanTime*.65+phase+position.y*.10);`:''}
      ${fish?`float tail=1.-smoothstep(-.67,-.06,position.x);
      transformed.z+=tail*.085*sin(oceanTime*6.+instanceMatrix[3].x*28.+position.x*4.);`:''}
      reefUV=uv;vec4 point=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      point=instanceMatrix*point;
      #endif
      reefPoint=(modelMatrix*point).xyz;`);
    shader.fragmentShader='varying vec2 reefUV; uniform float oceanTime;varying vec3 reefPoint;\n'+caustics+'\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float light=rippleLight(reefPoint,oceanTime);
      diffuseColor.rgb*=.81+light*vec3(.59,.82,.66);
      ${kelp?`float vein=exp(-abs(reefUV.x-.5)*48.);
      diffuseColor.rgb*=.87+.23*vein+.07*sin(reefUV.x*43.+reefUV.y*5.);`:''}
      ${sand?`float dunes=sin(reefPoint.x*147.+reefPoint.z*225.+2.*sin(reefPoint.x*17.));
      diffuseColor.rgb*=.92+.08*dunes+.035*sin(reefPoint.x*475.+reefPoint.z*380.);`:''}`);
  };
  mat.customProgramCacheKey=()=>`desk-habitat-${kelp}-${sand}-${fish}`;
  return mat;
}

function painted(g,color){
  const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3)c.toArray(colors,i);
  vertexData(g,'color',colors,3);
  return g;
}

// Merge each organism once and instance the colonies, including all the small branches.
function form(build){
  const parts=[];
  build({add:(geometry,color)=>parts.push(painted(geometry,color))});
  const geometry=mergeGeometries(parts);
  for(const g of parts)g.dispose();
  return geometry;
}
function fishGeometry(butterfly){
  const body=new THREE.SphereGeometry(1,32,16),height=butterfly?.29:.15;
  const p=body.attributes.position,colors=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const taper=smooth(x,-1.,-.16)*.52+.48;
    p.setXYZ(i,x*.53,y*height*taper,z*.105*taper);
    const c=butterfly?new THREE.Color('#efc25c').lerp(new THREE.Color('#ffedc5'),smooth(-y,-.1,.8)):
      new THREE.Color('#4a8086').lerp(new THREE.Color('#cbe2d6'),smooth(-y,-.8,.4));
    const bars=Math.cos(x*10.2+y*.65);
    c.multiplyScalar(butterfly?.23+.77*smooth(bars,-.73,-.25):.84+.16*smooth(bars,-.72,.25));colors.push(c.r,c.g,c.b);
  }
  vertexData(body,'color',colors,3);body.computeVertexNormals();
  const parts=[body];
  function fin(coords,tint){
    const knots=[];
    for(let i=0;i<coords.length;i+=3)knots.push(new V().fromArray(coords,i));
    const curve=new THREE.CatmullRomCurve3(knots,true),outline=curve.getPoints(24);
    const center=knots.reduce((p,k)=>p.add(k),new V()).divideScalar(knots.length);
    const pos=center.toArray(),uv=[.5,.5],idx=[];
    for(let i=0;i<outline.length-1;i++){
      pos.push(...outline[i].toArray());uv.push(i/24,1);idx.push(0,i+1,1+(i+1)%24);
    }
    const g=new THREE.BufferGeometry();vertexData(g,'position',pos,3);vertexData(g,'uv',uv,2);
    g.setIndex(idx);g.computeVertexNormals();parts.push(painted(g,tint));
  }
  fin([-.43,0,0,-.68,.15,0,-.62,.015,0,-.68,-.14,0],butterfly?'#edbf64':'#bbbd8b');
  fin([-.24,height*.68,0,-.17,height*1.65,0,.08,height*1.14,0,.22,height*.68,0],butterfly?'#edce74':'#698b87');
  if(butterfly){
    fin([-.26,-.15,0,-.19,-.33,0,.04,-.28,0,.19,-.20,0],'#f0c673');
    const snout=new THREE.SphereGeometry(1,10,7);snout.scale(.095,.045,.043).translate(.49,-.025,0);parts.push(painted(snout,'#f1c980'));
  }
  for(const side of [-1,1]){
    fin([.18,0,.08*side,-.13,-.12,.15*side,-.07,-.02,.13*side,.15,.035,.09*side],'#919d87');
    const eye=new THREE.SphereGeometry(.032,8,5);eye.translate(.35,.037,.065*side);parts.push(painted(eye,'#172e32'));
  }
  const fish=mergeGeometries(parts);parts.forEach(g=>g.dispose());return fish;
}

export function createUnderDeskOcean(scene,corners,surface,clock){
  const root=new THREE.Group();root.name='Ocean beneath the desk';root.matrixAutoUpdate=false;root.visible=false;scene.add(root);
  const origin=corners[0],across=corners[1].clone().sub(origin),along=corners[3].clone().sub(origin);
  const twist=corners[2].clone().sub(origin).sub(across).sub(along);
  const center=corners.reduce((sum,p)=>sum.add(p),new V()).multiplyScalar(.25);
  const planes=corners.map((a,i)=>{
    const b=corners[(i+1)%4],n=new V(b.z-a.z,0,a.x-b.x).normalize();
    if(n.dot(center.clone().sub(a))<0)n.negate();
    return new THREE.Vector4(n.x,0,n.z,-n.dot(a));
  });
  const sx=surface(1,0)-surface(0,0),sz=surface(0,1)-surface(0,0),base=surface(0,0);
  const waterPlane=new THREE.Vector4(sx,-1,sz,base);
  planes.push(waterPlane,waterPlane.clone().multiplyScalar(-1));
  function at(u,v,below=0,p=new V()){
    p.copy(origin).addScaledVector(across,u).addScaledVector(along,v).addScaledVector(twist,u*v);
    p.y-=below;return p;
  }
  function floorDepth(x,z){
    return .465+.032*Math.sin(x*6.8+z*2.2)+.018*Math.cos(z*13.-x*4.)
      +.011*Math.sin(x*23.+z*17.)+.005*Math.cos(x*48.-z*32.);
  }
  function bed(u,v){const p=at(u,v);p.y-=floorDepth(p.x,p.z);return p;}
  const dummy=new THREE.Object3D(),rng=seeded(2741);
  const schools=[];
  function instances(name,geo,mat,items){
    const mesh=new THREE.InstancedMesh(geo,mat,items.length);mesh.name=name;
    items.forEach(({p,scale,yaw,tint},i)=>{
      dummy.position.copy(p);dummy.scale.fromArray(scale);dummy.rotation.set(0,yaw,0);dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);if(tint)mesh.setColorAt(i,new THREE.Color(tint));
    });
    mesh.computeBoundingSphere();root.add(mesh);return mesh;
  }
  function populate(){
    const mat=habitatMaterial(clock),positions=[],colors=[],indices=[],nx=92,nz=42;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const p=bed(i/nx,j/nz);positions.push(p.x,p.y,p.z);
      const c=new THREE.Color('#90a998').lerp(new THREE.Color('#decda1'),smooth(Math.sin(p.x*13.+p.z*8.)+.3*Math.sin(p.z*27.),-.9,.9));
      colors.push(c.r,c.g,c.b);
      if(i<nx&&j<nz){const a=j*(nx+1)+i;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
    }
    const g=new THREE.BufferGeometry();vertexData(g,'position',positions,3);vertexData(g,'color',colors,3);
    g.setIndex(indices);g.computeVertexNormals();
    const floor=new THREE.Mesh(g,habitatMaterial(clock,{sand:true}));floor.name='Rippled sand shelf';root.add(floor);
    // A cut face under the sand closes the shelf where it meets the room.
    const sides=[],tones=[],faces=[];
    const edge=(u,v)=>{
      const top=bed(u,v),bottom=at(u,v,depth);const n=sides.length/3;
      sides.push(...top.toArray(),...bottom.toArray());
      const band=.88+.12*Math.sin(top.x*46.+top.z*32.);
      tones.push(.31*band,.30*band,.19*band,.085,.117,.107);
      if(n)faces.push(n-2,n-1,n,n,n-1,n+1);
    };
    for(let i=0;i<nx;i++)edge(i/nx,0);
    for(let i=0;i<nz;i++)edge(1,i/nz);
    for(let i=0;i<nx;i++)edge(1-i/nx,1);
    for(let i=0;i<=nz;i++)edge(0,1-i/nz);
    const sidesGeo=new THREE.BufferGeometry();vertexData(sidesGeo,'position',sides,3);vertexData(sidesGeo,'color',tones,3);
    sidesGeo.setIndex(faces);sidesGeo.computeVertexNormals();root.add(new THREE.Mesh(sidesGeo,mat));
    const rocks=[],corals=[],plates=[],kelps=[];
    const groves=[[.18,.40],[.78,.77],[.64,.17]],reefs=[[.12,.18],[.33,.40],[.61,.42],[.88,.34]];
    for(const [u,v] of reefs){
      for(let k=0;k<12;k++){
        const p=bed(u+(rng()-.5)*.17,v+(rng()-.5)*.29),r=.022+rng()*.058;
        rocks.push({p,scale:[r*(1.2+rng()*.5),r*(.4+rng()*.29),r],yaw:rng()*TAU,tint:rng()<.5?'#709487':'#afa58a'});
        if(k%2===0){
          const top=p.clone();top.y+=r*.43;
          const size=.075+rng()*.083;
          corals.push({p:top,scale:[size,size,size],yaw:rng()*TAU,tint:rng()<.55?'#db715a':'#daa16c'});
        }else{
          for(let h=0;h<3;h++){
            const top=p.clone();top.y+=r*(.45+h*.19);
            const size=r*(.77-h*.16);plates.push({p:top,scale:[size,size,size],yaw:rng()*TAU,tint:'#a69a68'});
          }
        }
      }
    }
    for(const [u,v] of groves)for(let i=0;i<14;i++){
      const p=bed(u+(rng()-.5)*.14,v+(rng()-.5)*.19),s=(.13+rng()*.18)/20;
      kelps.push({p,scale:[s*1.45,s,s*1.45],yaw:rng()*TAU,tint:'#cfdfb0'});
    }
    instances('Limestone outcrops',painted(rockGeometry(19),'white'),mat,rocks);
    instances('Branching coral',form(batch=>growBranchCoral(batch,0,0,0,1,'#fff0d7',rng,false,2)),mat,corals);
    instances('Terraced plate coral',painted(plateGeometry(1,2),'white'),mat,plates);
    instances('Swaying kelp',form(batch=>addKelp(batch,0,0,0,20,rng)),habitatMaterial(clock,{kelp:true}),kelps);
    // Suspended particles pick up the current; anchoring them in world space
    // keeps their parallax when the viewer swims past a grove.
    const motes=[],phases=[];
    for(let i=0;i<200;i++){
      const p=at(.025+.95*rng(),.025+.95*rng(),.025+rng()*.375);
      motes.push(p.x,p.y,p.z);phases.push(rng()*TAU);
    }
    const dust=new THREE.BufferGeometry();vertexData(dust,'position',motes,3);vertexData(dust,'phase',phases,1);
    const dustMaterial=new THREE.ShaderMaterial({uniforms:{time:clock},transparent:true,depthWrite:false,
      vertexShader:`uniform float time;attribute float phase;varying float glimmer;
        void main(){vec3 p=position;p.x+=.012*sin(time*.28+phase);p.y+=.008*cos(time*.22+phase);
        glimmer=.12+.24*pow(.5+.5*sin(phase+time*.62),4.);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(.52/max(.04,-mv.z),1.,4.);}`,
      fragmentShader:`varying float glimmer;void main(){float r=length(gl_PointCoord-.5)*2.;
        gl_FragColor=vec4(.61,.85,.73,glimmer*(1.-smoothstep(.1,1.,r)));}`});
    const particles=new THREE.Points(dust,dustMaterial);particles.name='Drifting plankton';root.add(particles);
    const fishMat=habitatMaterial(clock,{fish:true});
    for(const [u,v,d,count,size] of [[.58,.38,.18,25,.045],[.40,.57,.29,18,.052]]){
      const swim=new THREE.InstancedMesh(fishGeometry(count===18),fishMat,count);swim.name='Reef shoal';swim.frustumCulled=false;
      swim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(swim);
      const members=Array.from({length:count},()=>({phase:rng()*TAU,du:(rng()-.5)*.18,dv:(rng()-.5)*.13,dy:(rng()-.5)*.061,size:size*(.70+rng()*.55)}));
      schools.push({u,v,d,swim,members});
    }
  }
  function swimAt(time){
    for(const {u,v,d,swim,members} of schools){
      members.forEach((m,i)=>{
        const a=time*.24+i*.075+u*6,uu=u+.19*Math.cos(a)+m.du,vv=v+.18*Math.sin(a)+m.dv;
        at(uu,vv,d+m.dy+.008*Math.sin(a*2.+m.phase),dummy.position);
        const du=-.19*Math.sin(a),dv=.18*Math.cos(a);
        const dx=du*(across.x+twist.x*vv)+dv*(along.x+twist.x*uu);
        const dz=du*(across.z+twist.z*vv)+dv*(along.z+twist.z*uu);
        dummy.rotation.set(0,-Math.atan2(dz,dx)+.10*Math.sin(time*5.+m.phase),.035*Math.cos(a));
        dummy.scale.setScalar(m.size);dummy.updateMatrix();swim.setMatrixAt(i,dummy.matrix);
      });
      swim.instanceMatrix.needsUpdate=true;
    }
  }
  let extent=0,previousTime=-1;
  function update(amount,time){
    const reveal=smooth(amount,.28,.94);
    root.visible=reveal>.001;
    if(!root.visible){extent=0;return;}
    if(!root.children.length)populate();
    if(extent!==reveal){
      root.matrix.set(1,0,0,0,(1-reveal)*sx,reveal,(1-reveal)*sz,(1-reveal)*base,0,0,1,0,0,0,0,1);
      root.matrixWorldNeedsUpdate=true;extent=reveal;
    }
    planes[5].w=-base+depth*extent;
    if(time!==previousTime){swimAt(time);previousTime=time;}
  }
  function contains(p){for(let i=0;i<4;i++){const e=planes[i];if(e.x*p.x+e.z*p.z+e.w<0)return false;}return true;}
  return {root,planes,update,contains,get extent(){return extent;},
    floor:(x,z)=>surface(x,z)-floorDepth(x,z),
    // An open channel between the orange book and the phone, clear up to the surface.
    diveView(){const position=at(.195,.04,.225),target=at(.49,.45,.305);
      return {position,rotation:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position,target,new V(0,1,0))),distance:.35,modified:true,focus:'reef'};
    }};
}

// Integrate only the portion of the view ray that travels through this desk's
// water. Foreground islands and furniture end the ray at their actual depth.
export const waterVolumeGLSL=`
uniform vec4 oceanPlanes[6];
uniform float oceanExtent,oceanTime;
uniform vec3 oceanEye;
float waterSegment(vec3 rd,float distanceToScene,out float start){
  start=0.;
  if(oceanExtent<.001)return 0.;
  float end=distanceToScene;
  for(int i=0;i<6;i++){
    vec4 plane=oceanPlanes[i];
    float side=dot(plane.xyz,oceanEye)+plane.w,dir=dot(plane.xyz,rd);
    if(abs(dir)<.00001){if(side<0.)return 0.;}
    else if(dir>0.)start=max(start,-side/dir);else end=min(end,-side/dir);
  }
  return max(0.,end-start);
}
vec3 immerse(vec3 objectColor,vec3 rd,float entry,float travel,float distanceToScene){
  vec3 p=oceanEye+rd*(entry+.48*travel);
  float depthHere=max(0.,dot(oceanPlanes[4],vec4(p,1.)));
  vec2 lit=p.xz-depthHere*vec2(.26,.18);
  float shafts=.5+.5*sin(lit.x*44.+lit.y*15.+2.*sin(lit.y*27.+oceanTime*.41)+oceanTime*.56);
  float rays=pow(shafts,7.)*(.62+.38*cos(lit.y*37.-oceanTime*.25));
  vec3 transmit=exp(-travel*vec3(4.4,2.9,2.05));
  vec3 scatter=mix(vec3(.038,.285,.34),vec3(.005,.061,.12),smoothstep(.015,.51,depthHere));
  scatter+=vec3(.045,.115,.095)*rays*exp(-depthHere*2.7);
  vec3 exitPoint=oceanEye+rd*(entry+travel);
  float headDepth=dot(oceanPlanes[4],vec4(oceanEye,1.));
  float edge=1.;
  for(int i=0;i<4;i++)edge=min(edge,dot(oceanPlanes[i],vec4(oceanEye,1.)));
  float submerged=smoothstep(0.,.055,headDepth)*smoothstep(0.,.012,edge);
  float openWater=submerged*smoothstep(.003,.024,distanceToScene-entry-travel)
    *smoothstep(.004,.04,dot(oceanPlanes[4],vec4(exitPoint,1.)));

  vec3 color=objectColor*transmit+scatter*(1.-transmit);
  vec3 horizon=mix(vec3(.014,.115,.19),vec3(.045,.34,.39),smoothstep(-.38,.62,rd.y));
  if(openWater>0.){
    // Viewed from within, carry the sand into the haze beyond the cutaway.
    float down=dot(oceanPlanes[4].xyz,rd);
    if(down>.02){
      float sandDistance=(.472-dot(oceanPlanes[4],vec4(oceanEye,1.)))/down;
      vec3 sandPoint=oceanEye+rd*sandDistance;
      float ridges=sin(145.*sandPoint.x+216.*sandPoint.z+2.*sin(17.*sandPoint.x));
      vec3 farSand=vec3(.38,.40,.27)*(.90+.065*ridges);
      horizon=mix(horizon,farSand,exp(-max(.12,sandDistance)*vec3(4.4,2.9,2.05)));
    }
    color=mix(color,horizon+vec3(.012,.038,.033)*rays,openWater);
  }
  return color;
}`;
