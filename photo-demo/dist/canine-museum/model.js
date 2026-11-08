import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rooms} from './collection.js';
const V=(x,y,z)=>new T.Vector3(x,y,z), v=a=>V(...a);
const mats=new Map();
function mat(color,metal=0,rough=.68){
 const key=[color,metal,rough].join(':');if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color,metalness:metal,roughness:rough,side:T.DoubleSide}));return mats.get(key);
}
const ivory=mat('#cabea0'),bone=mat('#dbcbaa'),brown=mat('#674c37'),oak=mat('#815b39'),ebony=mat('#27382f'),brass=mat('#c4964c',.62,.34),lightBrass=mat('#edc97d',.48,.3),green=mat('#52796b'),cream=mat('#ebe0ca'),ochre=mat('#ad8352');
const group=(p)=>{const g=new T.Group();p.add(g);return g;};
function mesh(p,g,m){let o=new T.Mesh(g,m);p.add(o);return o;}
const ballGeo=new T.SphereGeometry(1,20,14);
function oval(p,at,s,m){let o=mesh(p,ballGeo,m);o.position.copy(v(at));o.scale.copy(v(s));return o;}
function rod(p,a,b,r,m,rb=r,n=10){let A=v(a),B=v(b),d=B.clone().sub(A);let o=mesh(p,new T.CylinderGeometry(rb,r,d.length(),n),m);o.position.copy(A).lerp(B,.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());return o;}
function tube(p,pts,r,m,n=24){return mesh(p,new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(v)),n,r,8,false),m);}
function lathe(p,at,profile,m,scale=[1,1,1]){let o=mesh(p,new T.LatheGeometry(profile.map(([x,y])=>new T.Vector2(x,y)),52),m);o.position.copy(v(at));o.scale.copy(v(scale));return o;}
function skin(p,rows,m,lo=-Math.PI,hi=Math.PI){
 const cross=42,pos=[],ids=[],uv=[];const line=new T.CatmullRomCurve3(rows.map(r=>V(r[0],r[1],r[4]||0)),false,'catmullrom',.32);
 const radii=new T.CatmullRomCurve3(rows.map(r=>V(r[2],r[3],0)),false,'catmullrom',.3), steps=(rows.length-1)*6;
 for(let i=0;i<=steps;i++){let t=i/steps,c=line.getPoint(t),r=radii.getPoint(t);for(let j=0;j<=cross;j++){let a=lo+(hi-lo)*j/cross;pos.push(c.z+Math.cos(a)*r.x,c.y+Math.sin(a)*r.y,c.x);uv.push(t,j/cross);if(i&&j){let k=i*(cross+1)+j;ids.push(k-1,k-cross-2,k,k,k-cross-2,k-cross-1);}}}
 let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ids);g.computeVertexNormals();return mesh(p,g,m);
}
function spindle(p,pts,width,m){ // Round ends and taper through the joints.
 for(let i=1;i<pts.length;i++)rod(p,pts[i-1],pts[i],width[i-1],m,width[i],18);
 pts.forEach((a,i)=>oval(p,a,[width[i],width[i],width[i]],m));
}
function longBone(p,a,b,r){
 let A=v(a),B=v(b),d=B.clone().sub(A),pt=(t)=>A.clone().addScaledVector(d,t).toArray();
 spindle(p,[a,pt(.11),pt(.46),pt(.82),b],[r*1.55,r*1.08,r*.74,r*.91,r*1.47],bone);
}
function body(p){
 const shell=[[-1.52,.67,.027,.05],[-1.45,.77,.28,.41],[-1.19,.88,.49,.58],[-.85,1.10,.57,.65],[-.51,1.22,.55,.65],[-.12,1.39,.51,.66],[.29,1.52,.50,.69],[.56,1.52,.48,.66],[.76,1.48,.38,.56],[.89,1.54,.23,.37],[.95,1.62,.035,.06]];
 skin(p,shell,cream,-1.80,1.82);
 // Walnut lining and a rolled brass lip follow the actual longitudinal cut.
 let top=[],bot=[];
 for(let i=0;i<shell.length;i++){let [z,y,rx,ry]=shell[i];top.push([-.235*rx,y+.97*ry,z]);bot.push([-.225*rx,y-.97*ry,z]);}
 tube(p,top,.033,ivory,65);tube(p,bot,.034,ivory,65);
 const P=[],I=[];for(let i=0;i<top.length;i++){const [x,y,z]=top[i];for(let j=0;j<9;j++){let t=j/8;P.push(x+.34*Math.sin(t*Math.PI),bot[i][1]*(1-t)+y*t,z);if(i&&j){let k=i*9+j;I.push(k,k-9,k-1,k-1,k-9,k-10);}}}
 let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setIndex(I);g.computeVertexNormals();mesh(p,g,mat('#584738'));
 // The near-side foreleg and folded hindleg are exposed down to the white paws.
 const arm=[[-.27,1.53,.70],[-.31,1.03,.44],[-.27,.35,.48],[-.19,.13,.54]];
 longBone(p,arm[0],arm[1],.065);longBone(p,arm[1],arm[2],.048);
 longBone(p,[-.32,1.105,.39],[-.24,.35,.47],.031);longBone(p,arm[2],arm[3],.045);
 const leg=[[-.37,.98,-1.18],[-.46,.60,-.78],[-.28,.21,-1.28],[-.18,.13,-.92]];
 for(let i=1;i<leg.length;i++)longBone(p,leg[i-1],leg[i],i===1?.070:.051);
 tube(p,[[-.31,2.05,.55],[-.36,1.98,.68],[-.39,1.84,.76],[-.35,1.67,.72],[-.31,1.60,.68]],.032,ivory);
 // Vertebral bodies/articular processes, from sacrum to the base of the neck.
 let ridge=new T.CatmullRomCurve3([V(0,1.10,-1.35),V(0,1.53,-.98),V(0,1.76,-.51),V(0,1.97,.02),V(0,2.13,.45),V(-.03,2.28,.64)]);
 for(let i=0;i<26;i++){
   let t=i/25,c=ridge.getPoint(t),s=.077+.022*Math.sin(t*Math.PI);
   oval(p,c.toArray(),[s*1.1,.075,.083],bone);
   for(let side of [-1,1]) rod(p,c.toArray(),[c.x+side*s*1.25,c.y+.065,c.z-.019],.033,ivory,.014);
   rod(p,c.toArray(),[c.x,c.y+.13,c.z-.06],.038,bone,.012);
 }
 for(let i=0;i<13;i++){
   let t=i/12,z=-.51+t*1.06,y=1.79+.35*t,bend=.40+.13*Math.sin(Math.PI*t);
   tube(p,[[.03,y,z],[.28,y-.11,z+.015],[bend,y-.33,z+.01],[bend-.04,y-.57,z-.06],[.13,y-.74,z-.15]],.024,ivory);
   // Short cut ribs leave a readable dorsal rhythm and an open viewing window.
   tube(p,[[0,y+.01,z],[-.19,y+.015,z],[-.34,y-.045,z-.01],[-.397,y-.10-.045*Math.sin(t*Math.PI),z-.027]],.023,bone);
 }
 // Curve the ribs around the far half of the open cavity. The open
 // flank is closer to the visitor than this cage and stays clear for the organs.
 const sternum=[];
 for(let j=0;j<13;j++){
   let t=j/12,z=-.56+t*1.17,y=1.76+t*.39,drop=.50+.28*Math.sin(t*Math.PI);
   const end=[-.10,y-drop,z-.15-.08*(1-t)];
   tube(p,[[-.035,y+.04,z],[-.22,y+.018,z-.012],[-.31,y-drop*.29,z-.056],[-.32,y-drop*.64,z-.11],[-.23,y-drop*.88,z-.17],end],.014+.005*Math.sin(t*Math.PI),ivory,30);
   if(j>=3)sternum.push(end);
 }
 tube(p,sternum,.024,bone,42);
 // Tapered shoulder blade, with a raised ridge leading to the humeral head.
 const blade=new T.Shape();blade.moveTo(-.23,.26);blade.quadraticCurveTo(-.17,.35,.065,.32);blade.quadraticCurveTo(.16,.28,.11,.14);
 blade.quadraticCurveTo(.07,.025,.01,-.15);blade.quadraticCurveTo(-.02,-.19,-.05,-.12);blade.quadraticCurveTo(-.10,.035,-.23,.26);
 const plate=mesh(p,new T.ExtrudeGeometry(blade,{depth:.022,bevelEnabled:true,bevelThickness:.009,bevelSize:.012,bevelSegments:2}),bone);
 plate.rotation.y=-Math.PI/2;plate.position.set(-.31,1.72,.69);
 tube(p,[[-.35,2.00,.57],[-.36,1.92,.61],[-.35,1.80,.66],[-.33,1.56,.71]],.018,ivory);
 for(const [x,z] of [[-.19,.54],[-.18,-.92]])for(let n=0;n<4;n++){
   const delta=(n-1.5)*.035;const middle=[x+delta,.085,z+.08],tip=[x+delta*1.3,.055,z+.15-.02*Math.abs(n-1.5)];
   longBone(p,[x+delta*.6,.13,z],middle,.014);longBone(p,middle,tip,.011);
 }
 // Two branching conduits, like the service pipes of a Victorian gallery.
 const arterial=mat('#9b5341',.23,.53),patina=mat('#54786c',.30,.48);
 tube(p,[[-.16,1.51,.52],[-.17,1.63,.32],[-.20,1.59,.01],[-.18,1.47,-.40],[-.15,1.29,-.94],[-.11,1.03,-1.20]],.026,arterial,52);
 tube(p,[[-.12,1.31,.49],[-.14,1.22,.16],[-.15,1.16,-.22],[-.16,1.04,-.48],[-.14,.83,-.60]],.016,patina);
 for(let [z,y,zy,yy] of [[.12,1.64,.19,1.88],[-.40,1.47,-.70,1.52],[-.59,1.39,-.72,1.19],[-.93,1.30,-.99,.88]]){
    tube(p,[[-.17,y,z],[-.20,y-.04,(z+zy)*.5],[-.25,yy,zy]],.0105,arterial,15);
 }
 tube(p,[[-.26,1.11,-1.31],[-.45,1.19,-1.26],[-.49,1.13,-1.08],[-.43,.99,-1.10],[-.30,.95,-1.23],[-.26,1.11,-1.31]],.054,bone);
}
// Batch bones and plinth by material; leave the independently loaded GLBs intact.
export function batch(root){
 root.updateMatrixWorld(true);const inv=root.matrixWorld.clone().invert(),buckets=new Map(),drop=[];
 root.traverse(o=>{if(!o.isMesh||o.userData.unbatched)return;let k=o.material;let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
 for(const a of Object.keys(g.attributes))if(!['position','normal',...(k.map?['uv']:[])].includes(a))g.deleteAttribute(a);
 g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv,o.matrixWorld));if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(g);drop.push(o);});
 drop.forEach(o=>o.removeFromParent());for(const [m,gs] of buckets){let g=mergeGeometries(gs,false);mesh(root,g,m);gs.forEach(s=>s.dispose());}
}
function plinth(p){
 lathe(p,[0,-.175,-.195],[[0,0],[.9,0],[.96,.026],[.965,.056],[.942,.067],[.944,.128],[.982,.14],[.975,.163],[.958,.175],[0,.175]],mat('#33463b',.20,.48),[.99,1,2.14]);
 lathe(p,[0,-.175,-.195],[[.944,.084],[.951,.087],[.951,.093],[.944,.096]],brass,[.99,1,2.14]);
 lathe(p,[0,-.175,-.195],[[.970,.144],[.985,.149],[.98,.154]],lightBrass,[.99,1,2.14]);
}
export function buildModel(){
 const world=new T.Group(),solid=group(world),base=group(world);body(solid);plinth(base);batch(solid);batch(base);
 // The specimen was sculpted open on −X. Expose the corresponding flank on +X.
 solid.scale.x=-1;
 const anchors=new Map(),plane=new T.Plane(V(0,0,1),-2.1);
 const clip=m=>{const c=m.clone();c.clippingPlanes=[plane];return c;};
 solid.traverse(o=>{if(o.isMesh)o.material=clip(o.material);});
 for(const room of rooms){const p=group(world);p.name=room.id;p.position.copy(v(room.pos));p.rotation.y=Math.PI/2;anchors.set(room.id,p);}
 function install(room,asset,rotation){
   const orient=new T.Group();orient.rotation.set(...rotation);orient.add(asset);
   const box=new T.Box3().setFromObject(orient),span=box.getSize(V()),center=box.getCenter(V());
   if(![span.x,span.y,span.z].every(n=>Number.isFinite(n)&&n>0))throw Error('Empty organ: '+room.id);
   const scale=Math.min(2*room.size[0]/span.x,2*room.size[1]/span.y,.46/span.z);
   const g=group(anchors.get(room.id));g.scale.setScalar(scale);orient.position.sub(center);g.add(orient);
   orient.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(clip):clip(o.material);});
 }
 return {world,anchors,install,cut:level=>{plane.constant=-level;}};
}

export function addCoat(world,reg,bytes,texture){
 const source=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});
 const veil=source.clone();veil.transparent=true;veil.depthWrite=false;
 const parts={};
 for(const part of reg.parts){
   if(part.name==='underlay')continue;
   const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(bytes,part.position,part.count*3),3));
   g.setAttribute('uv',new T.BufferAttribute(new Float32Array(bytes,part.uv,part.count*2),2));
   g.setIndex(new T.BufferAttribute(new Uint32Array(bytes,part.index,part.indexCount),1));g.computeVertexNormals();
   parts[part.name]=mesh(world,g,part.name==='coat'?veil:source);
 }
 return parts;
}

export function addFlank(world,reg,bytes,texture,source){
 const travel={value:0},slice={value:2.1};
 for(const part of reg.parts){const g=new T.BufferGeometry();
   g.setAttribute('position',new T.BufferAttribute(new Float32Array(bytes,part.position,part.count*3),3));
   g.setAttribute('uv',new T.BufferAttribute(new Float32Array(bytes,part.uv,part.count*2),2));
   g.setIndex(new T.BufferAttribute(new Uint32Array(bytes,part.index,part.indexCount),1));
   let far=part.name==='far',cover=part.name==='cover';
   if(!far){g.setAttribute('src',new T.BufferAttribute(new Float32Array(bytes,part.sourcePosition,part.count*3),3));g.setAttribute('srcUV',new T.BufferAttribute(new Float32Array(bytes,part.sourceUv,part.count*2),2));}
   const m=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{profile:{value:texture},source:{value:source},travel,slice},
   vertexShader:`varying float localZ;varying vec2 sideUV,frontUV;varying float weight;uniform float travel;${far?'':'attribute vec3 src;attribute vec2 srcUV;'}
   void main(){localZ=position.z;sideUV=uv;float h=smoothstep(.52,.70,uv.y);weight=h*(1.-travel);vec3 at=vec3(-position.x,position.yz);
   ${far?'frontUV=uv;':'at=mix(at,src,weight);frontUV=srcUV;'}
   gl_Position=projectionMatrix*modelViewMatrix*vec4(at,1.);}`,
   fragmentShader:`varying float localZ;uniform float slice;varying vec2 sideUV,frontUV;varying float weight;uniform sampler2D profile,source;
   void main(){vec4 p=texture2D(profile,sideUV);if(p.a<.3${cover?'||localZ>slice':''}${far?'||weight>.025':''})discard;
   gl_FragColor=vec4(mix(p.rgb,texture2D(source,frontUV).rgb,${far?'0.':'weight'}),1.);
   #include <colorspace_fragment>
   }`});
   const o=mesh(world,g,m);o.frustumCulled=false;
 }
 return {travel,slice};
}
