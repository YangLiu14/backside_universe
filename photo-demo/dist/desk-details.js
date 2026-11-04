import * as THREE from 'three';
import {photographicMaterial} from './photographic-material.js';

const mat=(color,roughness=.7,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function add(parent,geometry,material,position=[0,0,0]){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function rounded(w,d,r){const s=new THREE.Shape(),x=-w/2,z=-d/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;}
function pad(parent,w,d,h,r,top,side,position){const g=new THREE.ExtrudeGeometry(rounded(w,d,r),{depth:h,bevelEnabled:true,bevelSize:.002,bevelThickness:.0015,bevelSegments:3,curveSegments:16});g.rotateX(-Math.PI/2);return add(parent,g,[top,side],position);}
function bar(parent,a,b,r,m){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),D=B.clone().sub(A);const mesh=add(parent,new THREE.CylinderGeometry(r,r,D.length(),16),m,A.clone().add(B).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),D.normalize());return mesh;}
function tube(parent,points,r,m){return add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(48,points.length*10),r,10,false),m);}

// Fixed per-vertex UVs on real surfaces, never a camera-facing photo card.
function sourceUV(mesh,camera,homography){
  mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).project(camera);
    let u=(v.x+1)/2,t=(1-v.y)/2;
    if(homography){const x=u*1320,y=t*1739,H=homography,q=H[2][0]*x+H[2][1]*y+H[2][2];u=(H[0][0]*x+H[0][1]*y+H[0][2])/q/599;t=(H[1][0]*x+H[1][1]*y+H[1][2])/q/399;}
    uv.setXY(i,u,1-t);
  }uv.needsUpdate=true;
}

export function createDeskDetails(parent,{point,onPlane,camera,photo,fit,orangeTexture}){
  const ivory=mat('#d9d4c7',.7),edge=mat('#b5afa1',.58,.18),seam=mat('#817c72',.92),aluminum=mat('#bebcb3',.38,.55),glass=mat('#26312d',.13,.1);
  const photoSurface=()=>photographicMaterial(photo,{roughness:.77,retention:.9});
  function fittedGroup(data,name){const g=new THREE.Group();g.name=name;g.position.fromArray(data.position);g.rotation.y=data.yaw;parent.add(g);return g;}
  const bookFit=fit.orangeBook,book=fittedGroup(bookFit,'Source-aligned orange book');
  pad(book,bookFit.width,bookFit.depth,.044,.009,mat('#d1c8af',.9),mat('#b7b09e',.9),[0,-.049,0]);
  const cover=pad(book,bookFit.width+.008,bookFit.depth+.008,.006,.008,photographicMaterial(orangeTexture,{roughness:.85,retention:.95}),mat('#e58033',.8),[0,-.006,0]);
  sourceUV(cover,camera,bookFit.textureHomography);
  for(let i=0;i<5;i++)pad(book,bookFit.width,bookFit.depth,.0007,.008,mat('#d1c8af',.92),mat(i%2?'#a59f8d':'#e0d7c1',.92),[0,-.04+i*.006,0]);

  const phoneFit=fit.phone,phone=fittedGroup(phoneFit,'Rounded phone with source back and three lenses');
  const phoneBack=pad(phone,phoneFit.width,phoneFit.depth,.025,.023,photoSurface(),aluminum,[0,-.025,0]);sourceUV(phoneBack,camera);
  const lensCenters=[[451,804],[459,799],[466,803]],lensGroup=new THREE.Group();lensGroup.name='Three physical camera lenses';parent.add(lensGroup);
  for(const [px,py] of lensCenters){const p=point(px,py,.035);add(lensGroup,new THREE.CylinderGeometry(.0145,.016,.008,32),aluminum,p.toArray());add(lensGroup,new THREE.CylinderGeometry(.0115,.0115,.002,32),glass,[p.x,p.y+.005,p.z]);add(lensGroup,new THREE.CylinderGeometry(.004,.004,.0006,20),mat('#526e78',.12,.2),[p.x-.002,p.y+.0065,p.z-.001]);}
  const flash=point(437,804,.035);add(lensGroup,new THREE.CylinderGeometry(.006,.006,.003,24),mat('#ebe6cb',.38),flash.toArray());
  // A narrow side key and lens rims remain three-dimensional on side views.
  add(phone,new THREE.BoxGeometry(.075,.004,.003),aluminum,[phoneFit.width*.15,-.011,phoneFit.depth/2+.002]);

  const headphones=new THREE.Group();headphones.name='Offset folded headphones with thick cushions and headband';parent.add(headphones);
  const cups=[];
  for(const [key,name] of [['headphoneFront','Near folded earcup'],['headphoneRear','Far folded earcup']]){
    const d=fit[key],g=new THREE.Group();g.name=name;g.position.fromArray(d.position);g.rotation.y=d.yaw;headphones.add(g);const radius=Math.min(d.width,d.depth)*.36;
    pad(g,d.width*.98,d.depth*.98,.031,radius,ivory,ivory,[0,-.080,0]);
    pad(g,d.width,d.depth,.008,radius,seam,seam,[0,-.049,0]);
    pad(g,d.width,d.depth,.018,radius,ivory,edge,[0,-.041,0]);
    const cap=pad(g,d.width*.98,d.depth*.98,.021,radius,photoSurface(),ivory,[0,-.023,0]);sourceUV(cap,camera);cups.push(g);
  }
  const bandPixels=[[308,813],[279,815],[250,805],[246,790],[259,780],[279,777],[300,785],[321,793]];
  const bandHeights=[.13,.16,.24,.29,.32,.31,.23,.145];
  const bandPoints=bandPixels.map(([x,y],i)=>point(x,y,bandHeights[i]));
  const bandCurve=new THREE.CatmullRomCurve3(bandPoints);
  const band=add(headphones,new THREE.ExtrudeGeometry(rounded(.034,.009,.004),{steps:96,bevelEnabled:false,extrudePath:bandCurve}),ivory);band.name='Raised folded padded headband';
  tube(headphones,bandPoints.map(p=>p.clone().add(new THREE.Vector3(0,-.009,0))),.004,aluminum);
  for(const [i,xy] of [[0,[304,812]],[1,[319,787]]]){
    const start=bandPoints[i?bandPoints.length-1:0],end=point(...xy,.128);bar(headphones,start.toArray(),end.toArray(),.006,aluminum);
  }

  const arm=new THREE.Group();arm.name='Articulated double-link task lamp';parent.add(arm);
  const anchor=point(909,693,0),plane=new THREE.Plane(new THREE.Vector3(0,0,1),-anchor.z);
  const p=(x,y)=>onPlane(x,y,plane),black=mat('#393c37',.4,.55),steel=mat('#85867d',.3,.72);
  const rails=[[[905,691],[914,550],[907,393]],[[911,691],[922,549],[915,391]],[[908,386],[791,430]],[[918,397],[791,444]]];
  for(const rail of rails)for(let i=1;i<rail.length;i++)bar(arm,p(...rail[i-1]).toArray(),p(...rail[i]).toArray(),.0085,black);
  const joints=[[909,693],[919,550],[913,391],[791,437]];
  for(const xy of joints){const at=p(...xy);const pin=add(arm,new THREE.CylinderGeometry(.021,.021,.035,28),steel,at.toArray());pin.rotation.x=Math.PI/2;const screw=add(arm,new THREE.CylinderGeometry(.007,.007,.037,16),black,at.toArray());screw.rotation.x=Math.PI/2;}
  function spring(a,b,r,turns){const A=p(...a),B=p(...b),direction=B.clone().sub(A).normalize(),u=new THREE.Vector3(0,0,1),v=new THREE.Vector3().crossVectors(direction,u).normalize();const points=Array.from({length:161},(_,i)=>{const t=i/160,angle=t*turns*Math.PI*2;return A.clone().lerp(B,t).addScaledVector(u,Math.cos(angle)*r).addScaledVector(v,Math.sin(angle)*r);});tube(arm,points,.0022,steel);}
  spring([811,432],[855,415],.012,12);spring([917,489],[921,535],.011,11);
  tube(arm,[[788,433],[797,414],[797,398],[789,400],[785,421]].map(v=>p(...v)),.004,black);
  const top=p(775,394),bottom=p(749,470),direction=top.clone().sub(bottom).normalize(),radius=p(746,426).distanceTo(p(778,438))*.5;
  const head=new THREE.Group();head.name='Tilted brushed-metal cylindrical shade';head.position.copy(top).add(bottom).multiplyScalar(.5);head.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);arm.add(head);const length=top.distanceTo(bottom);
  const shade=mat('#8e8980',.34,.78);add(head,new THREE.CylinderGeometry(radius,radius,length,64,1,true),shade);
  for(const sign of [-1,1]){const ring=add(head,new THREE.TorusGeometry(radius,.005,10,64),sign>0?mat('#8a6550',.4,.65):steel,[0,sign*length/2,0]);ring.rotation.x=Math.PI/2;}
  add(head,new THREE.CylinderGeometry(radius*.94,radius*.94,.005,48),mat('#3b3c37',.7),[0,-length/2+.003,0]);
  add(head,new THREE.CylinderGeometry(radius*.94,radius*.94,.005,48),mat('#ac8e6a',.5,.35),[0,length/2-.003,0]);
  add(arm,new THREE.BoxGeometry(.07,.04,.085),black,[anchor.x,-.018,anchor.z]);
  const details={phone,headphones,book,arm,cups,lensGroup};
  details.measurements={phoneLensCount:lensCenters.length,headphoneCupCount:cups.length,armJointCount:joints.length,armSpringCount:2,phoneSourceQuad:phoneFit.sourceQuad,headphoneSourceQuads:cups.map((_,i)=>fit[i?'headphoneRear':'headphoneFront'].sourceQuad)};
  return details;
}
