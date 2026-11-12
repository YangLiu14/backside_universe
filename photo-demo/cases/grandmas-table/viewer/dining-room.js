import * as T from 'three';
import {steamAbove} from './atmosphere.js';
import {dressDish,finishTable} from './supper.js';
import {furnishRoom} from './room-interior.js';

const v=(x,y,z)=>new T.Vector3(x,y,z);
function instance(raw, dims, yaw=0) {
  const native=raw.clone(true), rotated=new T.Group();rotated.add(native);native.rotation.y=yaw;
  const bounds=new T.Box3().setFromObject(rotated,true),size=bounds.getSize(v(0,0,0)),center=bounds.getCenter(v(0,0,0));
  const normalized=new T.Group(); normalized.add(rotated);
  rotated.position.set(-center.x,-bounds.min.y,-center.z);
  normalized.scale.set(dims[0]/size.x,dims[1]/size.y,dims[2]/size.z);
  const result=new T.Group();result.add(normalized);
  result.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals();}});
  return result;
}
function install(parent,model,x,y,z,yaw=0){model.position.set(x,y,z);model.rotation.y=yaw;parent.add(model);return model;}
function platterYaw(model){
  // Align the long oval before fitting it to the table. Hi3D may return a
  // plate running along either ground axis or diagonally across them.
  model.updateMatrixWorld(true);
  let count=0,x=0,z=0,xx=0,zz=0,xz=0;
  const pt=new T.Vector3();
  model.traverse(o=>{
    if(!o.isMesh)return;
    const vertices=o.geometry.attributes.position;
    for(let i=0;i<vertices.count;i+=13){
      pt.fromBufferAttribute(vertices,i).applyMatrix4(o.matrixWorld);
      count++;x+=pt.x;z+=pt.z;xx+=pt.x*pt.x;zz+=pt.z*pt.z;xz+=pt.x*pt.z;
    }
  });
  return count?.5*Math.atan2(2*(xz-x*z/count),xx-zz-(x*x-z*z)/count):0;
}
function makeStick(raw) {
  // Recover a piece of a real Hi3D bamboo leg, then trim and taper it to chopstick scale.
  const bamboo=instance(raw,[.32,.28,.31]);bamboo.updateMatrixWorld(true);
  const points=[],pt=v(0,0,0);
  bamboo.traverse(obj=>{
    if(!obj.isMesh)return;
    const pos=obj.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      pt.fromBufferAttribute(pos,i).applyMatrix4(obj.matrixWorld);
      if(pt.x>.070 && pt.z>.060 && pt.y>.073 && pt.y<.170)points.push(pt.clone());
    }
  });
  if(!points.length)throw new Error('竹凳几何中未找到可裁取的竹腿');
  // Resample the leg as closed cross sections. Removed cross-brace faces
  // would otherwise leave splinters and open edges when seen against the bowl.
  const positions=[],indices=[],sides=16,rings=12;
  function quantile(samples,q){return samples[Math.floor((samples.length-1)*q)];}
  for(let row=0;row<=rings;row++){
    const t=row/rings,y=.081+.080*t,section=points.filter(p=>Math.abs(p.y-y)<.009);
    const band=section.length>=12?section:points;
    const xs=band.map(p=>p.x).sort((a,b)=>a-b),zs=band.map(p=>p.z).sort((a,b)=>a-b);
    const left=quantile(xs,.08),right=quantile(xs,.95),near=quantile(zs,.08),far=quantile(zs,.95);
    const cx=(left+right)/2,cz=(near+far)/2;
    const normalized=band.map(p=>[(p.x-cx)/Math.max(.001,(right-left)/2),(p.z-cz)/Math.max(.001,(far-near)/2)]);
    for(let k=0;k<sides;k++){
      const a=k*2*Math.PI/sides,c=Math.cos(a),s=Math.sin(a);
      const support=normalized.map(([x,z])=>x*c+z*s).sort((a,b)=>a-b);
      const radius=(.0025+.0022*t)*T.MathUtils.clamp(quantile(support,.90),.80,1.03);
      positions.push(c*radius,t*.242,s*radius);
      if(row<rings){
        const n=row*sides+k,other=row*sides+(k+1)%sides;
        indices.push(n,n+sides,other,other,n+sides,other+sides);
      }
    }
  }
  for(let k=1;k<sides-1;k++)indices.push(0,k,k+1,rings*sides,rings*sides+k+1,rings*sides+k);
  const geom=new T.BufferGeometry();
  geom.setAttribute('position',new T.Float32BufferAttribute(positions,3));geom.setIndex(indices);geom.computeVertexNormals();
  const mat=new T.MeshStandardMaterial({color:0x7d593d,roughness:.46});
  const rod=new T.Mesh(geom,mat);rod.castShadow=rod.receiveShadow=true;
  return rod;
}
export function diningRoom(models,textures) {
  const group=new T.Group();
  const clock={value:0};
  const glass=furnishRoom(group,textures,clock);
  const inner=new T.Mesh(new T.CylinderGeometry(1.235,1.18,1.38,100,1,true,.98,Math.PI*2-1.96),
    new T.MeshStandardMaterial({color:0x493c31,roughness:.59,metalness:.12,side:T.DoubleSide}));
  inner.position.y=.77;inner.receiveShadow=true;group.add(inner);
  // Under the closed lid the curved lining meets a dark ceiling.
  const ceiling=new T.Mesh(new T.CircleGeometry(1.245,96),new T.MeshStandardMaterial({color:0x39302a,roughness:.82,side:T.DoubleSide}));
  ceiling.rotation.x=Math.PI/2;ceiling.position.y=1.455;group.add(ceiling);
  const seam=new T.Mesh(new T.TorusGeometry(1.194,.008,6,96,Math.PI*2-1.98),
    new T.MeshStandardMaterial({color:0x503c30,roughness:.77}));
  seam.rotation.x=Math.PI/2;seam.rotation.z=2.56;seam.position.y=.156;group.add(seam);
  const floorY=.082,tableY=.74+floorY;
  const table=install(group,instance(models.interior,[.94,.74,.90]),0,floorY,-.05);
  const stool=install(group,instance(models.stool,[.34,.28,.30]),-.10,floorY,.40);
  table.name='dinner-table';stool.name='pull-stool';
  // Tuck the window seat between the rear legs, facing its bowl; leave the side aisle free.
  for(const [name,x,z,a] of [['side-stool',-.58,-.15,1.4],['window-stool',.17,-.625,-.12]]){
    install(group,instance(models.stool,[.31,.28,.3]),x,floorY,z,a).name=name;
  }
  table.updateMatrixWorld(true);
  const ray=new T.Raycaster(),down=v(0,-1,0);
  const surface=(x,z)=>{ray.set(v(x,tableY+.2,z),down);return ray.intersectObject(table,true)[0]?.point.y??tableY;};
  // The generated tabletop slopes toward the source camera. Level its fitted
  // plane while keeping each foot planted and retaining the carved surface.
  const xProbe=.32,zProbe=.29,midZ=-.05;
  const heights=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([dx,dz])=>surface(dx*xProbe,midZ+dz*zProbe));
  const mid=heights.reduce((a,b)=>a+b,0)/4;
  const slopeX=(heights[2]+heights[3]-heights[0]-heights[1])/(4*xProbe);
  const slopeZ=(heights[1]+heights[3]-heights[0]-heights[2])/(4*zProbe);
  const bowls=[[-.155,.299],[-.335,-.237],[.316,-.32]];
  const menu=[
    ['dish',-.102,-.228,[.216,.057,.187],-.19],
    ['pork',.135,-.166,[.208,.064,.186],.18],
    ['greens',-.236,.025,[.212,.046,.162],-.29],
    ['fish',.137,.088,[.288,.049,.160],-.22],
  ];
  const settings=[...bowls.map(([x,z])=>new T.Vector4(x,z,.075,.074)),
    ...menu.map(([,x,z,dims])=>new T.Vector4(x,z,dims[0]*.52,dims[2]*.52))];
  table.traverse(obj=>{
    if(!obj.isMesh)return;
    const g=obj.geometry=obj.geometry.clone(),pos=g.attributes.position;
    const inverse=obj.matrixWorld.clone().invert(),pt=v(0,0,0);
    const grain=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){
      pt.fromBufferAttribute(pos,i).applyMatrix4(obj.matrixWorld);
      const plane=mid+slopeX*pt.x+slopeZ*(pt.z-midZ);
      pt.y=floorY+(pt.y-floorY)*(tableY-floorY)/(plane-floorY);
      grain.set([pt.x+.52,pt.z*1.06+.54,T.MathUtils.smoothstep(pt.y,tableY-.026,tableY-.006)],i*3);
      pt.applyMatrix4(inverse);pos.setXYZ(i,pt.x,pt.y,pt.z);
    }
    g.setAttribute('tableGrain',new T.BufferAttribute(grain,3));
    obj.material=Array.isArray(obj.material)?obj.material.map(m=>finishTable(m,textures.elm,settings)):finishTable(obj.material,textures.elm,settings);
    pos.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  });
  const bowl=instance(models.bowl,[.157,.083,.153]);
  const place=(x,z)=>install(group,bowl.clone(true),x,surface(x,z)-.0007,z);
  for(const [x,z] of bowls)place(x,z);
  const plates=menu.map(([role,x,z,dims,yaw])=>{
    const source=models[role]||dressDish(models.dish,role,textures.supper);
    const nativeYaw=role==='fish'&&models.fish?platterYaw(source):0;
    const plate=install(group,instance(source,dims,nativeYaw),x,surface(x,z)-.0007,z,yaw);
    if(models[role])plate.traverse(o=>{
      if(!o.isMesh)return;
      for(const mat of Array.isArray(o.material)?o.material:[o.material]){
        // A porcelain glaze, cooking oil and fish skin reflect as dielectrics.
        // Cap the very sharp texel highlights on the provider's roughness map.
        mat.metalness=0;
        mat.onBeforeCompile=shader=>{
          shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor,.34,.88);');
        };
      }
    });
    plate.name=role;plate.userData.foodHeight=dims[1];return plate;
  });
  group.add(steamAbove(plates,clock));
  const stick=makeStick(models.stool);
  function pair(x,z,angle){
    const bundle=new T.Group();
    for(const [i,dx] of [[0,-.012],[1,.012]]){
      const rod=stick.clone();rod.position.set(dx,.0055,0);rod.rotation.x=-Math.PI/2;rod.rotation.z=(i-.5)*.019;bundle.add(rod);
    }
    return install(group,bundle,x,surface(x,z)+.0005,z,angle);
  }
  pair(-.393,.052,.06);pair(.398,-.098,-.04);
  const stickRestX=-.025;
  const sticks=pair(stickRestX,.368,.10);sticks.visible=false;const stickRestY=sticks.position.y;
  return {group,table,stool,sticks,tableY,glass,plates,clock,update(sit,delivery,time){
    clock.value=time;
    stool.position.z=.40+.405*sit;
    sticks.visible=delivery>0;
    sticks.position.set(stickRestX+(1-delivery)*.55,stickRestY+(1-delivery)*.17,.368+(1-delivery)*.055);
    sticks.rotation.z=(1-delivery)*-.21;
  }};
}
