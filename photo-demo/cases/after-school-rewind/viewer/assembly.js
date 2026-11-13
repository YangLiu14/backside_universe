import * as T from 'three';
import {prepare} from './props.js';
import {sample} from './memory.js';
const V=(...x)=>new T.Vector3(...x);
export function assemble(spec,a,assets,scene){
 const root=new T.Group(),M=a.matrix,rotation=new T.Matrix4().set(...M[0],0,...M[1],0,...M[2],0,0,0,0,1);
 root.quaternion.setFromRotationMatrix(rotation);root.position.fromArray(a.position);root.scale.setScalar(a.unit);scene.add(root);
 const baseRotation=root.quaternion.clone(),basePosition=root.position.clone();
 const deskUp=V(...a.deskNormal),along=V(1,0,0).applyQuaternion(baseRotation).projectOnPlane(deskUp).normalize();
 const face=along.clone().cross(deskUp).normalize();
 const vertical=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(along,deskUp,face));
 const foot=V(-49,-a.height/2,0).multiplyScalar(a.unit);
 const hinge=foot.clone().applyQuaternion(baseRotation).add(basePosition);
 function stand(p){
   root.quaternion.copy(baseRotation).slerp(vertical,T.MathUtils.smoothstep(p,.48,.88));
   root.position.copy(hinge).sub(foot.clone().applyQuaternion(root.quaternion));
   let clearance=Infinity;
   for(const x of [-50,50])for(const z of [-5.2,5.2]){
     const corner=V(x,-a.height/2,z).multiplyScalar(a.unit).applyQuaternion(root.quaternion).add(root.position);
     clearance=Math.min(clearance,corner.dot(deskUp)+a.deskConstant);
   }
   root.position.addScaledVector(deskUp,-clearance);
   // The two carriers open a little along the shell guide. The pen stays seated in its hub.
   const travel=5.3*T.MathUtils.smoothstep(p,.68,.94);
   drive.position.x=right.x+travel;supply.position.x=left.x-travel;pen.position.x=drive.position.x;
   root.updateMatrixWorld(true);
 }
 const pieces=Object.fromEntries(Object.entries(assets).map(([k,m])=>[k,prepare(k,m,spec.calibration?.[k])]));
 const place=(parent,obj,pos,scale)=>{parent.add(obj);obj.position.fromArray(pos);obj.scale.fromArray(scale);return obj;};
 const shell=place(root,pieces.shell,[0,0,0],[100,a.height,10.4]);
 const left=V(...a.empty),right=V(...a.drive),cone=V(...a.tip),cap=V(...a.cap),axis=cap.clone().sub(cone).normalize();
 const pen=new T.Group();root.add(pen);pen.position.copy(right);pen.quaternion.setFromUnitVectors(V(0,0,1),axis);
 const pencil=place(pen,pieces.pencil,[0,0,cap.clone().lerp(cone,.5).sub(right).dot(axis)],[5.25,5.25,cap.distanceTo(cone)]);
 const drive=place(root,pieces.reel,right.toArray(),[38,38,3.8]);
 const supply=place(root,pieces.reel.clone(true),left.toArray(),[25,25,3.8]);
 const rear=new T.Group();root.add(rear);rear.rotation.y=Math.PI;rear.position.set(-.8,2,-13.8);rear.scale.set(.88,1,.82);
 const booth=place(rear,pieces.interior,[0,0,0],[60,36,11]);
 const ribbonGeo=new T.BufferGeometry(),route=[[-21,1,0],[-33,-13,0],[-42,-22,0],[-41,-25,0],[41,-25,0],[42,-22,0],[38,-8,0],[22,1,0]];
 const pts=[],tex=[],idx=[];route.forEach(([x,y,z],i)=>{pts.push(x,y,z-1.5,x,y,z+1.5);tex.push(i,0,i,1);if(i)idx.push(2*i-2,2*i-1,2*i,2*i,2*i-1,2*i+1);});
 ribbonGeo.setAttribute('position',new T.Float32BufferAttribute(pts,3));ribbonGeo.setAttribute('uv',new T.Float32BufferAttribute(tex,2));ribbonGeo.setIndex(idx);ribbonGeo.computeVertexNormals();
 const phase={value:0};const film=new T.MeshStandardMaterial({side:T.DoubleSide,color:0x47271a,roughness:.31,metalness:.28});
 film.onBeforeCompile=s=>{s.uniforms.phase=phase;s.vertexShader='varying float along;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nalong=uv.x;');s.fragmentShader='varying float along;uniform float phase;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=.91+.09*cos(along*16.-phase);');};film.defines={USE_UV:''};root.add(new T.Mesh(ribbonGeo,film));
 const opening={value:0},clearPlastic={value:0};
 // Real shell stays around all four edges. Discard only the rear-facing central wall during reveal.
 for(const mesh of shell.children){for(const mat of [].concat(mesh.material)){mat.side=T.DoubleSide;mat.transparent=true;mat.depthWrite=false;mat.forceSinglePass=true;mesh.renderOrder=3;
   mat.roughness=.26;mat.metalness=.17;
   mat.onBeforeCompile=s=>{s.uniforms.opening=opening;s.uniforms.clearPlastic=clearPlastic;s.vertexShader='varying vec3 shellPt;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nshellPt=position;');s.fragmentShader='varying vec3 shellPt;uniform float opening;uniform float clearPlastic;\n'+s.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(opening>0. && shellPt.z<.43 && abs(shellPt.x-.005)<.415*opening && abs(shellPt.y-.035)<.40*opening)discard;\nfloat rim=max(smoothstep(.447,.49,abs(shellPt.x)),smoothstep(.423,.49,abs(shellPt.y)));float label=step(.260,shellPt.y)*step(shellPt.y,.427)*step(abs(shellPt.x),.432);float mould=1.-smoothstep(.075,.13,abs(abs(shellPt.x)-.217)+abs(shellPt.y-.035));float alpha=max(label,max(rim*.78,mould*.25));diffuseColor.a*=mix(1.,.115+.885*alpha,clearPlastic);');};
 }}
 // A smoked liner uses the uncut front wall of the same Hi3D shell as its mould.
 const backing=shell.clone(true);root.add(backing);backing.scale.z=2.4;backing.scale.x*=.958;backing.scale.y*=.938;backing.position.z=4.0;
 for(const m of backing.children){
   const tint=mat=>{const liner=mat.clone();liner.color.set(0x9d8766);liner.roughness=.43;liner.metalness=.12;liner.transparent=true;liner.opacity=.68;liner.depthWrite=false;return liner;};
   m.material=Array.isArray(m.material)?m.material.map(tint):tint(m.material);m.renderOrder=-2;
 }
 for(const group of [booth,drive,supply]){
   group.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});
 }
 const lamp=new T.PointLight(0xffbd7b,1.4*a.unit*a.unit*100,60*a.unit,2);scene.add(lamp);
 function animate(t){
  const s=sample(t);drive.rotation.z=s.spin;supply.rotation.z=s.supplySpin;pencil.rotation.z=s.spin;phase.value=s.spin*5;
 }
 root.updateMatrixWorld(true);
 const toWorld=(obj,p)=>obj.localToWorld(p.clone());
 return {root,rear,shell,pen,pencil,stand,animate,
  gripPoint:()=>toWorld(root,drive.position.clone().addScaledVector(cone.clone().sub(right),.14)),hubPoint:()=>toWorld(root,drive.position),
  tipPoint:()=>toWorld(root,cone.clone().add(drive.position).sub(right)),
  footPoint:()=>toWorld(root,V(0,-a.height/2,0)),longAxis:()=>V(1,0,0).applyQuaternion(root.quaternion),
  target:()=>toWorld(rear,V(1.65,3,1)),
  cut(p){lamp.position.copy(toWorld(rear,V(-10,5.2,7)));clearPlastic.value=T.MathUtils.smoothstep(p,.40,.59);opening.value=T.MathUtils.smoothstep(p,.47,.80);rear.visible=p>.735;backing.visible=rear.visible;},sources:pieces};
}
