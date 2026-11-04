import * as THREE from 'three';
import {photographicMaterial} from './photographic-material.js';

const material=(color,roughness=.75,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function mesh(parent,geometry,mat,position=[0,0,0]){const m=new THREE.Mesh(geometry,mat);m.position.set(...position);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
function box(parent,w,h,d,mat,p){return mesh(parent,new THREE.BoxGeometry(w,h,d),mat,p);}
function tube(parent,points,r,mat,closed=false){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed);return mesh(parent,new THREE.TubeGeometry(curve,Math.max(32,points.length*10),r,8,closed),mat);}
function bar(parent,a,b,r,mat){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),v=B.clone().sub(A);const m=mesh(parent,new THREE.CylinderGeometry(r,r,v.length(),12),mat,A.clone().add(B).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;}
function roundedShape(w,h,r){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
function pad(parent,w,d,h,r,mat,p){const g=new THREE.ExtrudeGeometry(roundedShape(w,d,r),{depth:h,bevelEnabled:true,bevelSize:.012,bevelThickness:.008,bevelSegments:3,curveSegments:8});g.rotateX(-Math.PI/2);return mesh(parent,g,mat,p);}
function grid(parent,surface,mat,nx=24,ny=32){const p=[],uv=[],idx=[];for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){p.push(...surface(x/nx,y/ny));uv.push(x/nx,y/ny);if(x<nx&&y<ny){const a=y*(nx+1)+x,b=a+nx+1;idx.push(a,b,a+1,a+1,b,b+1);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return mesh(parent,g,mat);}

export function createChair(parent,fit){
 const [x,z,yaw,w,d,bh,hgap,lean,ay,az]=fit.parameters;
 const chair=new THREE.Group();chair.name='Reference fitted mesh chair facing the desk';chair.position.set(x,fit.seatY,z);chair.rotation.y=yaw;parent.add(chair);
 const frame=material('#777a6d',.54,.14),chrome=material('#bec1b9',.22,.85),dark=material('#343a34',.75),arm=material('#77796c',.87);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,32,32);ctx.fillStyle='#fff';ctx.fillRect(0,0,16,32);ctx.fillRect(0,0,32,11);ctx.fillStyle='#b0b0b0';ctx.fillRect(7,0,2,32);
 const weave=new THREE.CanvasTexture(canvas);weave.wrapS=weave.wrapT=THREE.RepeatWrapping;weave.repeat.set(74,86);weave.anisotropy=8;
 const net=new THREE.MeshStandardMaterial({color:'#4b4e45',roughness:.92,alphaMap:weave,alphaTest:.38,side:THREE.DoubleSide});
 // The back is an open woven surface with a curved frame, never an opaque slab.
 const backSurface=(u,v)=>{const width=w*(.69+.16*Math.sin(Math.PI*v*.8));return [(u-.5)*width,.18+v*(bh-.18),-d/2-lean*v+.105*Math.sin(v*Math.PI)+.07*(u-.5)**2];};
 const back=grid(chair,backSurface,net);back.name='Transparent woven backrest';
 const outline=[];for(let i=0;i<=18;i++)outline.push(backSurface(i/18,0));for(let i=1;i<=24;i++)outline.push(backSurface(1,i/24));for(let i=17;i>=0;i--)outline.push(backSurface(i/18,1));for(let i=23;i>0;i--)outline.push(backSurface(0,i/24));tube(chair,outline,.035,frame,true);
 // Separate chrome rear frame and spine establish which side is the back.
 for(const side of [-1,1])tube(chair,[[side*w*.33,.14,-d*.43],[side*w*.40,bh*.42,-d/2-lean*.4-.06],[side*w*.39,bh*.86,-d/2-lean*.88-.055],[side*w*.29,bh+.02,-d/2-lean-.035]],.023,chrome);
 tube(chair,[[0,.12,-d/2-.07],[0,bh*.43,-d/2-lean*.38-.16],[0,bh*.78,-d/2-lean*.79-.12],[0,bh,-d/2-lean-.08]],.044,dark);
 tube(chair,[[-w*.32,.43,-d/2-.08],[0,.36,-d/2-.20],[w*.32,.43,-d/2-.08]],.028,frame);
 // Seat is a tensioned rounded mesh, with a continuous padded perimeter.
 const seatSurface=(u,v)=>{let xx=(u-.5)*w,zz=(v-.5)*d;const radius=.18;const cornerX=Math.max(0,Math.abs(xx)-(w/2-radius)),cornerZ=Math.max(0,Math.abs(zz)-(d/2-radius));if(cornerX&&cornerZ){const mag=Math.hypot(cornerX,cornerZ);xx=Math.sign(xx)*(w/2-radius+cornerX*radius/mag);zz=Math.sign(zz)*(d/2-radius+cornerZ*radius/mag);}return [xx,.025+.055*(2*u-1)**2+.025*(2*v-1)**2,zz];};
 const seat=grid(chair,seatSurface,net,32,32);seat.name='Woven seat';const edge=[];for(let i=0;i<=24;i++)edge.push(seatSurface(i/24,0));for(let i=1;i<=24;i++)edge.push(seatSurface(1,i/24));for(let i=23;i>=0;i--)edge.push(seatSurface(i/24,1));for(let i=23;i>0;i--)edge.push(seatSurface(0,i/24));tube(chair,edge,.035,frame,true);
 // Fitted headrest is a separate tilted mesh with its own two supports.
 const head=new THREE.Group();head.position.set(0,bh+hgap,-d/2-lean-.035);head.rotation.set(.52,.45,0);chair.add(head);
 const hw=w*.64,hh=.36;
 const headSurface=(u,v)=>{let xx=(u-.5)*hw,yy=(v-.5)*hh;const r=.15,cx=Math.max(0,Math.abs(xx)-(hw/2-r)),cy=Math.max(0,Math.abs(yy)-(hh/2-r));if(cx&&cy){const q=Math.hypot(cx,cy);xx=Math.sign(xx)*(hw/2-r+cx*r/q);yy=Math.sign(yy)*(hh/2-r+cy*r/q);}return [xx,yy,.085*(2*u-1)**2+.03*(2*v-1)**2];};grid(head,headSurface,net,24,16);
 const ho=[];for(let i=0;i<=14;i++)ho.push(headSurface(i/14,0));for(let i=1;i<=10;i++)ho.push(headSurface(1,i/10));for(let i=13;i>=0;i--)ho.push(headSurface(i/14,1));for(let i=9;i>0;i--)ho.push(headSurface(0,i/10));tube(head,ho,.025,frame,true);
 for(const side of [-1,1])bar(chair,[side*.16,bh-.025,-d/2-lean-.02],[side*.16,bh+hgap-hh/2,-d/2-lean-.04],.017,frame);
 for(const side of [-1,1]){tube(chair,[[side*w*.43,-.03,az],[side*w*.52,.23,az-.04],[side*w*.56,ay-.045,az]],.048,frame);pad(chair,.23,.65,.045,.105,arm,[side*w*.56,ay,az]);}
 // Gas lift and five-spoke base meet the photographed rug height.
 bar(chair,[0,-.79,0],[0,-.045,0],.049,chrome);mesh(chair,new THREE.CylinderGeometry(.085,.11,.16,24),dark,[0,-.15,0]);
 for(let i=0;i<5;i++){const a=i/5*Math.PI*2+.18,ex=Math.sin(a)*.91,ez=Math.cos(a)*.91;tube(chair,[[0,-.70,0],[ex*.55,-.75,ez*.55],[ex,-.82,ez]],.032,chrome);bar(chair,[ex,-.82,ez],[ex,-.90,ez],.021,chrome);const caster=new THREE.Group();caster.position.set(ex,-.91,ez);caster.rotation.y=a;chair.add(caster);for(const s of [-1,1]){const wheel=mesh(caster,new THREE.CylinderGeometry(.075,.075,.045,20),dark,[s*.036,0,0]);wheel.rotation.z=Math.PI/2;}bar(caster,[-.07,0,0],[.07,0,0],.024,chrome);}
 chair.userData.front=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).toArray();return chair;
}

export function createSideboard(parent,fit,woodTexture){
 const group=new THREE.Group();group.name='Right white cubbies and wood drawer cabinet';group.position.fromArray(fit.frontCenter);group.rotation.y=fit.yaw;parent.add(group);
 const w=fit.width,h=Math.min(fit.height,1.64),d=fit.depth,t=.045;
 const white=material('#d4d5cc',.83),inner=material('#bdc1b5',.88),shadow=material('#393b32',.94),paper=material('#d5cdb5',.9);
 box(group,w+.06,.065,d+.04,white,[0,-.025,-d/2]);
 for(const x of [-w/2,w/2])box(group,t,h,d,white,[x,-h/2,-d/2]);
 for(const y of [-h,-h*.51])box(group,w,t,d,white,[0,y,-d/2]);
 box(group,t,h,d,white,[0,-h/2,-d/2]);box(group,w,h,.025,inner,[0,-h/2,-d+.02]);
 // Left upper cubby contains the light storage box, not a solid cabinet wall.
 box(group,w*.39,.43,d*.63,material('#e3e0d2',.9),[-w*.25,-.37,-d*.42]);
 for(const y of [-.55,-.21])box(group,w*.41,.018,.018,white,[-w*.25,y,-d*.10]);
 for(const x of [-w*.445,-w*.055])box(group,.018,.36,.018,white,[x,-.38,-d*.10]);
 box(group,.12,.02,.012,inner,[-w*.25,-.39,-d*.085]);
 const colors=['#242d26','#a28b47','#542920','#313c31','#c1b595','#1c2424'];
 for(let i=0;i<6;i++){const book=new THREE.Group();book.position.set(w*.11+i*.067,-h*.51+.32,-d*.24);book.rotation.z=-.10+i*.018;group.add(book);box(book,.052,.61,.38,material(colors[i],.83),[0,0,0]);for(const yy of [-.18,.17,.23])box(book,.033,.012,.003,paper,[0,yy,.192]);}
 // A reflective bowl is visible in the lower-left opening.
 const bowl=mesh(group,new THREE.SphereGeometry(.19,32,18,0,Math.PI*2,Math.PI/2,Math.PI/2),material('#b3b5aa',.2,.78),[-w*.24,-h*.79,-d*.35]);bowl.scale.y=.52;
 const rim=mesh(group,new THREE.TorusGeometry(.19,.008,8,48),material('#cccec4',.24,.7),[-w*.24,-h*.79,-d*.35]);rim.rotation.x=Math.PI/2;
 const wood=new THREE.MeshStandardMaterial({color:'#a49b87',map:woodTexture,roughness:.72});
 const dw=1.58,dx=w/2+dw/2+.035;
 box(group,dw,h,d,shadow,[dx,-h/2,-d/2+.045]);box(group,dw+.05,.055,d+.05,wood,[dx,-.025,-d/2+.045]);
 for(let i=0;i<3;i++){const dh=(h-.11)/3,cy=-.08-dh/2-i*(dh+.024);box(group,dw-.045,dh,.055,wood,[dx,cy,.075]);box(group,dw-.07,.026,.025,shadow,[dx,cy+dh/2-.026,.098]);}
 box(group,.035,h,d,wood,[dx+dw/2,-h/2,-d/2+.045]);
 group.userData.topBounds={width:w,depth:d};return group;
}

export function createPaperObject(parent,point,texture){
 const object=new THREE.Group();object.name='Curled layered paper object on blue book';object.position.copy(point(786,688,.062));object.rotation.y=-.10;parent.add(object);
 const side=material('#c9b48b',.88),paper=material('#ded0ab',.93),face=photographicMaterial(texture,{roughness:.94,retention:.72});
 const path=new THREE.CubicBezierCurve3(new THREE.Vector3(0,.025,.13),new THREE.Vector3(0,.006,-.035),new THREE.Vector3(0,.035,-.10),new THREE.Vector3(0,.23,-.07));
 const w=.39;
 // Visible individual curved leaves replace the former upright box.
 for(let layer=0;layer<18;layer++){
  const offset=layer*.0017;
  const surface=(u,v)=>{const p=path.getPoint(v);return [(u-.5)*w,p.y+offset+.01*Math.sin(u*Math.PI)*v,p.z+offset*.32+.015*Math.sin(u*Math.PI)*v];};
  grid(object,surface,layer===17?face:(layer%3?paper:side),12,24);
  if(layer%2===0){const line=[];for(let i=0;i<=18;i++){const p=path.getPoint(i/18);line.push([-w/2,p.y+offset,p.z+offset*.32]);}tube(object,line,.0008,side);}
 }
 object.userData.fixedPose={position:object.position.toArray(),rotation:object.rotation.toArray().slice(0,3)};return object;
}
