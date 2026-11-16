// CPU-only QA of the actual skinned forearm surface. Never call from rendering.
// A near-unit LBS matrix singular value does not detect twist spread over bones:
// this follows the same material vertices along five forearm cross-sections.
import * as T from 'three';
const selections=new WeakMap();
const V=()=>new T.Vector3(),degrees=T.MathUtils.radToDeg;
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
function select(body,data){
  const sides=['R','L'].map(side=>{
    const palm=(data.surfaceSamples||[]).find(s=>s.id===side+'-palm');
    if(!palm)throw Error('Arm surface QA requires a real palm landmark '+side);
    const mesh=body.getObjectByName(palm.mesh),g=mesh?.geometry,p=g?.attributes.position;
    if(!mesh?.isSkinnedMesh)throw Error('Arm surface QA requires a skinned palm mesh');
    const sk=mesh.skeleton,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;
    const bone=n=>sk.bones.findIndex(b=>b.name===n+side);
    const elbowIndex=bone('Forearm'),handIndex=bone('Hand');
    if(elbowIndex<0||handIndex<0)throw Error('Arm surface QA requires elbow/wrist bones');
    const rest=i=>V().setFromMatrixPosition(sk.boneInverses[i].clone().invert());
    const elbow=rest(elbowIndex),axis=rest(handIndex).sub(elbow),length=axis.length();axis.normalize();
    const vertices=[];
    for(let index=0;index<p.count;index++){
      const offset=V().fromBufferAttribute(p,index).applyMatrix4(mesh.bindMatrix).sub(elbow),u=offset.dot(axis)/length;
      let influence=0;
      for(let k=0;k<4;k++){
        const name=sk.bones[indices.getComponent(index,k)].name;
        if(name==='Forearm'+side||new RegExp('^ForearmTwist\\d'+side+'$').test(name))influence+=weights.getComponent(index,k);
      }
      if(u>.05&&u<.95&&influence>.8)vertices.push({index,u,radial:offset.addScaledVector(axis,-u*length)});
    }
    const rings=[.15,.30,.50,.70,.85].map(u=>({u,vertices:vertices.filter(v=>Math.abs(v.u-u)<.09)}));
    const palmPosition=new T.Vector3(...palm.position),index=g.index,palmTriangles=[];
    // Select all nearby, outward-facing source triangles, not a hand-picked bad
    // vertex. Recomputed for each new geometry, including surface refinements.
    let nearest=0,distance=Infinity;const point=V();
    for(let i=0;i<p.count;i++){const d=point.fromBufferAttribute(p,i).distanceToSquared(palmPosition);if(d<distance){nearest=i;distance=d;}}
    const normal=V().fromBufferAttribute(g.attributes.normal,nearest).normalize();
    for(let j=0;j<(index?index.count:p.count);j+=3){
      const ids=[0,1,2].map(k=>index?index.getX(j+k):j+k),vs=ids.map(i=>V().fromBufferAttribute(p,i));
      const center=vs[0].clone().add(vs[1]).add(vs[2]).multiplyScalar(1/3);
      const n=vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0]));
      if(center.distanceTo(palmPosition)<.018&&n.dot(normal)>0)palmTriangles.push(ids);
    }
    if(rings.some(r=>r.vertices.length<20)||palmTriangles.length<3)throw Error('Insufficient real surface coverage for arm QA '+side);
    return {side,mesh,sk,elbowIndex,handIndex,axis,vertices,rings,palmTriangles};
  });
  selections.set(body,sides);return sides;
}
export function sampleArmRecovery(body,c){
  if(body.userData.actorRole!=='shooter')return null;
  const sides=selections.get(body)||select(body,c.data);
  return {method:'actual-skinned-material-rings-v1',sampledClipTime:c.time,sides:sides.map(s=>{
    const {mesh,sk}=s,e=sk.bones[s.elbowIndex].getWorldPosition(V()),h=sk.bones[s.handIndex].getWorldPosition(V()),axis=h.clone().sub(e).normalize();
    const swing=new T.Quaternion().setFromUnitVectors(s.axis,axis),deformed=new Map();
    for(const v of s.vertices){const p=mesh.localToWorld(mesh.getVertexPosition(v.index,V())).sub(e);p.addScaledVector(axis,-p.dot(axis));deformed.set(v.index,p);}
    const rings=s.rings.map(r=>{
      let sin=0,cos=0,total=0,oldRadius2=0,newRadius2=0;
      for(const v of r.vertices){const old=v.radial.clone().applyQuaternion(swing),now=deformed.get(v.index);sin+=axis.dot(old.clone().cross(now));cos+=old.dot(now);total+=old.length()*now.length();oldRadius2+=old.lengthSq();newRadius2+=now.lengthSq();}
      const coherence=Math.min(1,Math.hypot(sin,cos)/total);
      return {u:r.u,vertexCount:r.vertices.length,materialDegrees:degrees(Math.atan2(sin,cos)),circularResidualDegrees:degrees(Math.sqrt(Math.max(0,-2*Math.log(Math.max(1e-12,coherence))))),radialRmsRatio:Math.sqrt(newRadius2/oldRadius2)};
    });
    const normal=V(),center=V();let area=0;
    for(const ids of s.palmTriangles){const vs=ids.map(i=>mesh.localToWorld(mesh.getVertexPosition(i,V()))),n=vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])),a=n.length();normal.add(n);center.addScaledVector(vs[0].clone().add(vs[1]).add(vs[2]).multiplyScalar(1/3),a);area+=a;}
    center.multiplyScalar(1/area);normal.normalize();const inward=body.getWorldPosition(V());inward.y=center.y;inward.sub(center).normalize();
    return {side:s.side,vertexCount:s.vertices.length,rings,materialTwistDegrees:degrees(wrap(T.MathUtils.degToRad(rings.at(-1).materialDegrees-rings[0].materialDegrees))),palmTriangleCount:s.palmTriangles.length,palmNormal:normal.toArray(),palmCenter:center.toArray(),palmInwardDegrees:degrees(Math.acos(T.MathUtils.clamp(normal.dot(inward),-1,1)))};
  })};
}

// Full neutral-arm QA uses the chest's bind-relative frame, never the shoulder
// line: the rejected 69ca pose had a nearly upright chest but rotated clavicles.
const restSelections=new WeakMap();
function selectRest(body,c){
  const source=selections.get(body)||select(body,c.data);
  const result=source.map(s=>{
    const {mesh,sk,side}=s,g=mesh.geometry,p=g.attributes.position,ix=g.attributes.skinIndex,w=g.attributes.skinWeight;
    const index=n=>{const i=sk.bones.findIndex(b=>b.name===n);if(i<0)throw Error('Rest-arm QA missing bone '+n);return i;};
    const names=['Chest','Shoulder'+side,'UpperArm'+side,'Forearm'+side,'Hand'+side,'Thigh'+side,'Shin'+side];
    const bone=Object.fromEntries(names.map(n=>[n,index(n)]));
    const rest=n=>V().setFromMatrixPosition(sk.boneInverses[bone[n]].clone().invert());
    const shoulder=rest('UpperArm'+side),elbow=rest('Forearm'+side),axis=elbow.clone().sub(shoulder).normalize(),length=shoulder.distanceTo(elbow);
    const front=new T.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize(),flexor=[],tip=[],roll=[];
    for(let i=0;i<p.count;i++){
      let upper=0,total=0;
      for(let k=0;k<4;k++){const name=sk.bones[ix.getComponent(i,k)].name,weight=w.getComponent(i,k);if(name==='UpperArm'+side)upper+=weight;if(name==='UpperArm'+side||name==='Forearm'+side||new RegExp('^ForearmTwist\\d'+side+'$').test(name))total+=weight;}
      if(total<.8)continue;
      const bp=V().fromBufferAttribute(p,i).applyMatrix4(mesh.bindMatrix),off=bp.clone().sub(elbow),along=off.dot(axis),radial=off.clone().addScaledVector(axis,-along),radius=radial.length(),direction=radial.dot(front)/(radius||1);
      if(Math.abs(along)<.025&&radius<.065&&radius>.009){if(direction>.75)flexor.push(i);if(direction<-.75)tip.push(i);}
      const u=bp.clone().sub(shoulder).dot(axis)/length;
      if(upper>.8&&u>.45&&u<.8)roll.push({index:i,radial:bp.clone().sub(shoulder).addScaledVector(axis,-u*length)});
    }
    if(flexor.length<20||tip.length<20||roll.length<100)throw Error('Rest-arm surface regions lack actual vertices '+side);
    return {side,mesh,sk,bone,rest,axis,flexor,tip,roll};
  });restSelections.set(body,result);return result;
}
export function sampleArmRest(body,c,recovery){
  if(body.userData.actorRole!=='shooter')return null;
  const selections=restSelections.get(body)||selectRest(body,c),palms=recovery||sampleArmRecovery(body,c);
  const s0=selections[0],chestBone=s0.bone.Chest;
  const deform=new T.Matrix4().multiplyMatrices(s0.sk.bones[chestBone].matrixWorld,s0.sk.boneInverses[chestBone]),q=new T.Quaternion();deform.decompose(V(),q,V());
  const basis=[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)].map(v=>v.applyQuaternion(q).normalize()),local=v=>basis.map(b=>v.dot(b)),angle=(a,b)=>degrees(a.angleTo(b));
  return {method:'actual-chest-relative-neutral-arm-v1',sampledClipTime:c.time,torsoBasis:basis.map(v=>v.toArray()),sides:selections.map(s=>{
    const {side,mesh,sk,bone,rest}=s,point=n=>sk.bones[bone[n]].getWorldPosition(V()),shoulder=point('UpperArm'+side),elbow=point('Forearm'+side),wrist=point('Hand'+side);
    const upper=elbow.clone().sub(shoulder).normalize(),forearm=wrist.clone().sub(elbow).normalize(),bend=forearm.clone().addScaledVector(upper,-forearm.dot(upper));
    const bendMagnitude=bend.length();if(bendMagnitude>1e-8)bend.normalize();
    const mean=indices=>indices.reduce((sum,i)=>sum.add(mesh.localToWorld(mesh.getVertexPosition(i,V()))),V()).multiplyScalar(1/indices.length);
    const flexor=mean(s.flexor),tip=mean(s.tip),flexorDirection=flexor.clone().sub(tip).normalize();
    const swing=new T.Quaternion().setFromUnitVectors(s.axis.clone().applyQuaternion(q),upper);let sin=0,cos=0;
    for(const v of s.roll){const old=v.radial.clone().applyQuaternion(q).applyQuaternion(swing),actual=mesh.localToWorld(mesh.getVertexPosition(v.index,V())).sub(shoulder);actual.addScaledVector(upper,-actual.dot(upper));sin+=upper.dot(old.clone().cross(actual));cos+=old.dot(actual);}
    const palm=palms.sides.find(p=>p.side===side),center=new T.Vector3(...palm.palmCenter),normal=new T.Vector3(...palm.palmNormal),thigh=point('Thigh'+side),knee=point('Shin'+side),leg=knee.clone().sub(thigh);
    const fraction=T.MathUtils.clamp(center.clone().sub(thigh).dot(leg)/leg.lengthSq(),0,1),nearest=thigh.clone().addScaledVector(leg,fraction);
    const offset=name=>{const actual=local(point(name).sub(point('Chest'))),bind=rest(name).sub(rest('Chest')).toArray();return {actual,bind,residual:actual.map((v,i)=>v-bind[i])};};
    return {side,shoulder:shoulder.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray(),clavicleChestOffset:offset('Shoulder'+side),upperArmRootChestOffset:offset('UpperArm'+side),upperDirection:local(upper),forearmDirection:local(forearm),upperArmFromDownDegrees:angle(upper,basis[1].clone().negate()),elbowBendDegrees:angle(upper,forearm),bendDirection:local(bend),bendFromForwardDegrees:bendMagnitude>1e-8?angle(bend,basis[2]):null,upperArmMaterialRollDegrees:degrees(Math.atan2(sin,cos)),upperArmMaterialVertexCount:s.roll.length,elbowFlexorPatch:{vertexCount:s.flexor.length,center:flexor.toArray()},elbowTipPatch:{vertexCount:s.tip.length,center:tip.toArray()},elbowFlexorDirection:local(flexorDirection),elbowFlexorFromForwardDegrees:angle(flexorDirection,basis[2]),palmNormalTorso:local(normal),actualNearestThighPoint:nearest.toArray(),palmToActualThighDegrees:angle(normal,nearest.clone().sub(center)),palmToRootProjectionDegrees:palm.palmInwardDegrees};
  })};
}
