import * as THREE from 'three';
import {photographicMaterial,quadGeometry} from './photographic-material.js';
import {createChair,createSideboard,createPaperObject} from './furniture.js';
import {createDeskDetails} from './desk-details.js';

const W=1320,H=1739;
export function createRoom(scene,photoCamera,photoTexture,assets={}){
  const root=new THREE.Group(); scene.add(root);
  function material(color,roughness=.55,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
  const white=material('#dddcd7'),edge=material('#d2d0c8'),black=material('#151a1f',.45);
  const blue=new THREE.MeshPhysicalMaterial({color:'#0b3583',roughness:.27,metalness:0,clearcoat:1,clearcoatRoughness:.18}),cream=material('#cfc6ae',.65);
  function add(g,m,p=[0,0,0],parent=root){const o=new THREE.Mesh(g,m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function box(w,h,d,m,p,parent=root){return add(new THREE.BoxGeometry(w,h,d),m,p,parent);}
  function cylinder(a,b,h,m,p,parent=root){return add(new THREE.CylinderGeometry(a,b,h,64),m,p,parent);}
  function bar(a,b,r,m,parent=root){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),v=B.clone().sub(A);const o=cylinder(r,r,v.length(),m,A.clone().add(B).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;}
  function point(px,py,y=0){const v=new THREE.Vector3(px/W*2-1,1-py/H*2,.5).unproject(photoCamera);const ray=v.sub(photoCamera.position).normalize();return photoCamera.position.clone().addScaledVector(ray,(y-photoCamera.position.y)/ray.y);}
  function onPlane(px,py,plane){const v=new THREE.Vector3(px/W*2-1,1-py/H*2,.5).unproject(photoCamera);const ray=new THREE.Ray(photoCamera.position,v.sub(photoCamera.position).normalize());return ray.intersectPlane(plane,new THREE.Vector3());}
  function polygon(points,m,parent=root){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(v=>v.toArray()),3));const indices=[];for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);g.setIndex(indices);g.computeVertexNormals();m.side=THREE.DoubleSide;return add(g,m,[0,0,0],parent);}

  // Room planes retain photographed textures at the calibrated camera.
  const outline=new THREE.Shape(),hw=2.1,hd=.85,r=.085;
  outline.moveTo(-hw+r,-hd);outline.lineTo(hw-r,-hd);outline.quadraticCurveTo(hw,-hd,hw,-hd+r);outline.lineTo(hw,hd-r);outline.quadraticCurveTo(hw,hd,hw-r,hd);outline.lineTo(-hw+r,hd);outline.quadraticCurveTo(-hw,hd,-hw,hd-r);outline.lineTo(-hw,-hd+r);outline.quadraticCurveTo(-hw,-hd,-hw+r,-hd);
  const desktopGeo=new THREE.ExtrudeGeometry(outline,{depth:.07,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:3,curveSegments:10});desktopGeo.rotateX(-Math.PI/2);
  const deskUV=desktopGeo.attributes.uv,deskPos=desktopGeo.attributes.position;
  for(let i=0;i<deskUV.count;i++)deskUV.setXY(i,(deskPos.getX(i)+hw)/(hw*2),1-(deskPos.getZ(i)+hd)/(hd*2));
  const desktop=add(desktopGeo,[photographicMaterial(assets.desk,{roughness:.8,retention:.92}),white],[0,-.078,0]);
  box(2.45,1.4,.15,edge,[0,-.78,.2]);
  for(const x of [-1.48,1.48]){box(.2,1.5,.16,white,[x,-.83,.18]);box(.32,.1,1.28,white,[x,-1.56,.35]);}
  const floor=box(14,.1,14,material('#8a745c',.88),[0,-1.68,0]);
  const rug=box(5.6,.015,4.7,material('#334752',.95),[.3,-1.617,1]);
  for(let j=0;j<24;j++)box(5.6,.001,.07,material(j%2?'#465b68':'#223847',.96),[.3,-1.608,-1.25+j*.19]);
  const windowPlane=new THREE.Plane(new THREE.Vector3(0,0,1),1.2);
  const windowCorners=[[0,0],[891,0],[880,1068],[150,1110]].map(([x,y])=>onPlane(x,y,windowPlane));
  const window=add(quadGeometry(windowCorners),new THREE.MeshBasicMaterial({map:assets.window,side:THREE.DoubleSide,toneMapped:false}));
  window.castShadow=window.receiveShadow=false;const windowObjects=[window];
  const sideWall=box(.06,7,8,material('#e0ded6'),[3.7,1.7,-.4]);
  const sideboard=createSideboard(root,assets.furnitureFit.sideboard,assets.wood);

  // One physically rectangular chassis and display share the same hinge.
  // The fit constrains orthogonality and lid aspect, rather than tracing unrelated planes.
  const laptopStart=root.children.length;
  const laptopPoints=assets.laptopFit.base.map(p=>new THREE.Vector3(...p));
  const screenPoints=assets.laptopFit.screen.map(p=>new THREE.Vector3(...p));
  const laptopBase=add(quadGeometry(laptopPoints),photographicMaterial(assets.deck,{roughness:.4,metalness:.15,retention:.84}));
  laptopBase.name='Rigid laptop deck with original keyboard texture';
  const metal=new THREE.MeshStandardMaterial({color:'#b9bfbc',roughness:.46,metalness:.45,envMapIntensity:1.3});
  const baseGeo=new THREE.BufferGeometry(),basePositions=[...laptopPoints,...laptopPoints.map(p=>p.clone().add(new THREE.Vector3(0,-.014,0)))];
  baseGeo.setAttribute('position',new THREE.Float32BufferAttribute(basePositions.flatMap(p=>p.toArray()),3));baseGeo.setIndex([4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);baseGeo.computeVertexNormals();add(baseGeo,metal);
  const normal=new THREE.Vector3().crossVectors(screenPoints[1].clone().sub(screenPoints[0]),screenPoints[3].clone().sub(screenPoints[0])).normalize().negate();
  const screen=add(quadGeometry(screenPoints),new THREE.MeshBasicMaterial({map:assets.screen,side:THREE.DoubleSide,toneMapped:false}));
  screen.name='Original screen pixels bound to the display';
  const edgeMaterial=new THREE.MeshStandardMaterial({color:'#24292b',roughness:.42,metalness:.2});
  screenPoints.forEach((p,i)=>bar(p.toArray(),screenPoints[(i+1)%4].toArray(),.0035,edgeMaterial));
  const screenBack=screen.clone();screenBack.material=metal;screenBack.position.copy(normal).multiplyScalar(-.009);root.add(screenBack);
  bar(laptopPoints[0].toArray(),laptopPoints[1].toArray(),.006,edgeMaterial);
  const lapCentre=laptopPoints.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(.25);
  const laptopObjects=root.children.slice(laptopStart);

  // Books and small personal objects remain separate spatial objects.
  const bookPixels=[[712,674],[790,661],[855,698],[779,721]];
  const bookCorners=bookPixels.map(([x,y])=>point(x,y,.058));
  const bu=bookCorners[1].clone().sub(bookCorners[0]).add(bookCorners[2].clone().sub(bookCorners[3])).normalize();
  const bv=new THREE.Vector3(-bu.z,0,bu.x);
  const bw=(bookCorners[0].distanceTo(bookCorners[1])+bookCorners[3].distanceTo(bookCorners[2]))/2;
  const bd=Math.abs(bookCorners[3].clone().sub(bookCorners[0]).dot(bv));
  const books=new THREE.Group();books.position.copy(bookCorners.reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(.25));books.position.y=.028;root.add(books);
  books.rotation.y=-Math.atan2(bu.z,bu.x);
  box(bw,.045,bd,material('#c5bfac',.88),[0,0,0],books);
  box(bw+.014,.006,bd+.014,material('#143f64',.68),[0,-.026,0],books);
  for(let i=0;i<7;i++)box(bw+.001,.001,bd+.001,material(i%2?'#a5a18f':'#dad3bf',.95),[0,-.02+i*.006,0],books);
  const top=[[-bw/2,.027,-bd/2],[bw/2,.027,-bd/2],[bw/2,.027,bd/2],[-bw/2,.027,bd/2]].map(p=>new THREE.Vector3(...p));
  add(quadGeometry(top),photographicMaterial(assets.book,{roughness:.8,retention:.88}),[0,0,0],books);
  const details=createDeskDetails(root,{point,onPlane,camera:photoCamera,photo:photoTexture,fit:assets.detailFit,orangeTexture:assets.orange});
  const note=createPaperObject(root,point,assets.memo);

  // Photograph's cobalt cup. The opening faces away from the original camera.
  const cupPosition=new THREE.Vector3(...assets.cupFit.position);
  const cup=new THREE.Group();cup.position.copy(cupPosition);root.add(cup);
  const photoDir=photoCamera.position.clone().sub(cupPosition);photoDir.y=0;photoDir.normalize();
  const frontAngle=Math.atan2(photoDir.x,photoDir.z);
  cup.rotation.y=frontAngle+Math.PI;
  const vessel=new THREE.Group();vessel.scale.set(assets.cupFit.radius/.139,assets.cupFit.height/.24,assets.cupFit.radius/.139);cup.add(vessel);
  const profile=[new THREE.Vector2(.102,.022),new THREE.Vector2(.116,.034),new THREE.Vector2(.137,.195),new THREE.Vector2(.139,.238),new THREE.Vector2(.127,.241),new THREE.Vector2(.125,.221),new THREE.Vector2(.108,.04),new THREE.Vector2(.102,.022)];
  const gap=2.0;
  add(new THREE.LatheGeometry(profile,100,gap/2,Math.PI*2-gap),blue,[0,0,0],vessel);
  const rim=add(new THREE.TorusGeometry(.130,.005,12,100),cream,[0,.239,0],vessel);rim.rotation.x=Math.PI/2;
  cylinder(.123,.123,.007,material('#352b20',.45),[0,.212,0],vessel);
  cylinder(.11,.1,.025,blue,[0,.016,0],vessel);
  const inner=material('#cfc5ae',.55,0,false);
  // The pale ceramic lining catches reflected light around the secret opening.
  const wall=add(new THREE.LatheGeometry(profile.map(v=>v.clone().multiply(new THREE.Vector2(.985,1))),100,gap/2,Math.PI*2-gap),inner,[0,0,0],vessel);inner.side=THREE.BackSide;
  const handleCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.13,.21,0),new THREE.Vector3(-.205,.207,0),new THREE.Vector3(-.22,.14,0),new THREE.Vector3(-.19,.08,0),new THREE.Vector3(-.113,.075,0)]);
  add(new THREE.TubeGeometry(handleCurve,48,.013,12,false),blue,[0,0,0],vessel);
  const lip=add(new THREE.LatheGeometry([new THREE.Vector2(.124,.202),new THREE.Vector2(.128,.23),new THREE.Vector2(.133,.239)],96),cream,[0,0,0],vessel);lip.material=cream.clone();lip.material.side=THREE.DoubleSide;
  const saucerProfile=[new THREE.Vector2(0,0),new THREE.Vector2(.12,0),new THREE.Vector2(.18,.004),new THREE.Vector2(.23,.016),new THREE.Vector2(.234,.024),new THREE.Vector2(.22,.031),new THREE.Vector2(.15,.02),new THREE.Vector2(0,.019)];
  add(new THREE.LatheGeometry(saucerProfile,96),blue,[0,-.008,0],cup);
  const worldParent=new THREE.Group();worldParent.scale.setScalar(.122);worldParent.position.y=.041;cup.add(worldParent);

  // The existing warm lamp becomes an adjustable sun for the small world.
  const lampBase=point(1104,744,.04);const lamp=new THREE.Group();lamp.position.copy(lampBase);root.add(lamp);
  const gold=material('#bc8d43',.4,.45),lampMetal=material('#a5a497',.45,.45);
  cylinder(.24,.25,.025,lampMetal,[0,.01,0],lamp);cylinder(.023,.023,.48,gold,[0,.26,0],lamp);
  add(new THREE.SphereGeometry(.285,64,32,0,Math.PI*2,0,Math.PI/2),lampMetal,[0,.51,0],lamp);
  const lampLight=new THREE.PointLight('#ffd199',4,4,2);lampLight.position.copy(lampBase).add(new THREE.Vector3(0,.44,0));scene.add(lampLight);
  const armObjects=[details.arm];
  // Poster remains a physical object in the room.
  const poster=box(.03,1.7,.94,black,[3.65,1.5,-.4]);
  const chair=createChair(root,assets.furnitureFit.chair);

  // A camera-aligned backing preserves every untouched photograph pixel at home.
  const photoBack=new THREE.Group();scene.add(photoBack);
  const forward=photoCamera.getWorldDirection(new THREE.Vector3());
  const distance=cupPosition.clone().add(new THREE.Vector3(0,.13,0)).sub(photoCamera.position).dot(forward),planeHeight=2*distance*Math.tan(THREE.MathUtils.degToRad(photoCamera.fov/2));
  const photoPlane=new THREE.Mesh(new THREE.PlaneGeometry(planeHeight*W/H,planeHeight),new THREE.MeshBasicMaterial({map:photoTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
  photoPlane.position.copy(photoCamera.position).addScaledVector(forward,distance);photoPlane.quaternion.copy(photoCamera.quaternion);photoBack.add(photoPlane);photoPlane.renderOrder=100;
  return {root,cup,cupPosition,frontAngle,worldParent,lampLight,lamp,lampBase,books,note,screen,screenBack,screenNormal:normal,screenPoints,laptopPoints,lapCentre,laptopObjects,point,photoPlane,desktop,windowObjects,sideWall,poster,armObjects,chair,sideboard,details,
  };
}
