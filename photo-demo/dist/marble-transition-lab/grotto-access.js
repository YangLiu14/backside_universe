import * as T from 'three';
import {mergeGeometries} from '../vendor/addons/utils/BufferGeometryUtils.js';

// Surveyed in the generated shell's Y-up coordinates. The lower switchback
// sits outside the cliff; the final landing meets the opened balcony gate.
const landings=[
  [0.171,-0.294,-0.844],
  [-0.055,-0.163,-0.854],
  [-0.055,-0.163,-0.804],
  [0.177,-0.072,-0.799],
  [0.177,-0.072,-0.753],
  [0.076,-0.035,-0.753],
  [0.076,-0.035,-0.715],
];

// The lighthouse sill sits above the uneven rocks. A short service landing
// and a lateral flight connect it to the rock ledge on its seaward side.
export const beaconEntry={at:[-.241,-.167,-.639],out:[.66,-.75],height:.041};
export function createBeaconLanding(){
  const root=new T.Group();root.name='Lighthouse service landing';
  root.position.fromArray(beaconEntry.at);root.rotation.y=Math.atan2(...beaconEntry.out);root.scale.setScalar(beaconEntry.height/2.18);
  const wood=new T.MeshStandardMaterial({color:'#ae9174',map:woodGrain(),roughness:.85});
  const iron=new T.MeshStandardMaterial({color:'#534c40',roughness:.72,metalness:.34});
  const boards=[],posts=[];
  function plank(batch,x,y,z,w,h,d){
    const g=new T.BoxGeometry(w,h,d);g.translate(x,y,z);batch.push(g);
  }
  for(let i=0;i<18;i++)plank(boards,-.16,-.067,-.69+(i+.5)*.24,2.75,.135,.235);
  for(const x of [-1.37,1.08]){
    plank(boards,x,-.22,1.43,.18,.26,4.39);
    for(const z of [.10,3.44])plank(posts,x,-1.40,z,.13,2.73,.13);
  }
  for(let i=0;i<11;i++)plank(boards,-1.57-(i+.5)*.32,-.095-(i+1)*.154,2.66,.326,.18,1.65);
  for(const x of [-1.47,-.15,1.14])plank(posts,x,.46,3.57,.046,.92,.046);
  for(const y of [.40,.91])plank(posts,-.16,y,3.57,2.65,.037,.041);
  for(const [pieces,mat] of [[boards,wood],[posts,iron]]){
    const mesh=new T.Mesh(mergeGeometries(pieces),mat);mesh.castShadow=mesh.receiveShadow=true;mesh.layers.enable(3);root.add(mesh);
    pieces.forEach(p=>p.dispose());
  }
  return root;
}

function woodGrain(){
  const w=128,h=64,rgba=new Uint8Array(w*h*4);let seed=4861;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const ring=Math.cos(Math.PI*2*(y/9+.18*Math.sin(x/w*Math.PI*2)+.09*Math.sin(y*1.3)));
    const value=184+15*ring-33*Math.max(0,ring)**4+19*seed/4294967296;
    const i=4*(y*w+x);rgba.set([value*1.13,value*.92,value*.70,255],i);
  }
  const map=new T.DataTexture(rgba,w,h);map.colorSpace=T.SRGBColorSpace;
  map.wrapS=map.wrapT=T.RepeatWrapping;map.generateMipmaps=true;
  map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.anisotropy=4;map.needsUpdate=true;return map;
}

export function createCoastStair(){
  const root=new T.Group();root.name='Sea stair to the reading terrace';
  const timber=new T.MeshStandardMaterial({color:0xb8a288,map:woodGrain(),roughness:.85});
  const frame=new T.MeshStandardMaterial({color:0x66503d,roughness:.88});
  const brass=new T.MeshStandardMaterial({color:0xad926c,metalness:.65,roughness:.42});
  const batches=new Map([[timber,[]],[frame,[]],[brass,[]]]);
  const up=new T.Vector3(0,1,0),north=new T.Vector3(0,0,1),width=.028;
  const point=(a,y)=>a.clone().addScaledVector(up,y);
  function member(a,b,w,h,material){
    const axis=b.clone().sub(a).normalize();
    const side=new T.Vector3().crossVectors(Math.abs(axis.y)>.96?north:up,axis).normalize();
    const vertical=new T.Vector3().crossVectors(axis,side);
    const matrix=new T.Matrix4().makeBasis(axis,vertical,side.negate());
    matrix.scale(new T.Vector3(a.distanceTo(b),h,w));matrix.setPosition(a.clone().lerp(b,.5));
    batches.get(material).push(matrix);
  }
  const stations=landings.map(p=>new T.Vector3(...p));
  for(let j=1;j<stations.length;j++){
    const a=stations[j-1],b=stations[j],going=b.clone().sub(a);going.y=0;
    const length=going.length(),forward=going.normalize(),side=forward.clone().cross(up);
    // Leave a square turning landing at each end, reached at the exact height of its floor.
    const margin=width*.48,run=length-2*margin,count=Math.max(2,Math.ceil((b.y-a.y)/.0054),Math.ceil(run/.012));
    const inside=a.clone().addScaledVector(forward,margin),outside=b.clone().addScaledVector(forward,-margin);
    const tread=run/count;
    for(let i=0;i<count;i++){
      const center=inside.clone().lerp(outside,(i+.5)/count);center.y=a.y+(b.y-a.y)*(i+1)/count-.001;
      member(center.clone().addScaledVector(side,-width/2),center.clone().addScaledVector(side,width/2),tread+.00025,.002,timber);
    }
    for(const sign of [-1,1]){
      const offset=side.clone().multiplyScalar(sign*(width/2-.0011));
      member(point(inside,-.004).add(offset),point(outside,-.004).add(offset),.0018,.005,frame);
      const posts=Math.max(1,Math.ceil(run/.038));
      for(let i=0;i<=posts;i++){
        const p=inside.clone().lerp(outside,i/posts).add(offset);
        member(point(p,-.005),point(p,.018),.0014,.0014,frame);
        member(point(p,.018),point(p,.019),.0016,.0016,brass);
      }
      for(const y of [.008,.018])member(point(inside,y).add(offset),point(outside,y).add(offset),.0014,.0014,timber);
    }
    if(run>.13){
      const mid=inside.clone().lerp(outside,.5);
      for(const sign of [-1,1]){
        const joint=point(mid,-.004).addScaledVector(side,sign*width*.43);
        member(point(joint,-.19),joint,.0038,.0038,frame);
        member(point(joint,-.030),joint.clone().addScaledVector(forward,.026),.002,.0025,frame);
      }
    }
  }
  for(const [i,p] of stations.entries()){
    const half=.016;
    for(let k=0;k<5;k++){
      const q=point(p,-.00076);q.z+=((k+.5)/5*2-1)*half;
      member(q.clone().add(new T.Vector3(-half,0,0)),q.clone().add(new T.Vector3(half,0,0)),half*2/5-.00015,.002,timber);
    }
    if(i===0||i===stations.length-1)continue;
    for(const sign of [-1,1]){
      const q=point(p,-.003);q.x+=sign*.012;
      member(q,point(q,-.18),.0038,.0038,frame);
      member(point(q,-.027),p.clone().add(new T.Vector3(-sign*.012,-.005,0)),.0018,.0024,frame);
    }
  }
  for(const x of [.0585,.0935]){
    const p=new T.Vector3(x,-.034,-.734);
    member(point(p,-.002),point(p,.027),.0024,.0024,frame);
    member(point(p,.027),point(p,.028),.003,.003,brass);
  }
  const section=new T.Shape();const v=.5,c=.10;
  section.moveTo(-v+c,-v);section.lineTo(v-c,-v);section.lineTo(v,-v+c);section.lineTo(v,v-c);
  section.lineTo(v-c,v);section.lineTo(-v+c,v);section.lineTo(-v,v-c);section.lineTo(-v,-v+c);section.closePath();
  const stock=new T.ExtrudeGeometry(section,{depth:1,bevelEnabled:false});
  stock.translate(0,0,-.5);stock.rotateY(Math.PI/2);
  for(const [material,poses] of batches){
    const parts=poses.map(m=>stock.clone().applyMatrix4(m));
    const mesh=new T.Mesh(mergeGeometries(parts),material);
    mesh.name='Coastal stair / '+(material===timber?'treads and rails':material===frame?'joinery':'post caps');
    parts.forEach(g=>g.dispose());
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.enable(3);root.add(mesh);
  }
  stock.dispose();return root;
}
