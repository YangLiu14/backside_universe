import * as T from 'three';
import {campusSun} from './campus-light.js';
const V=(...v)=>new T.Vector3(...v),Y=V(0,1,0);
const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

function barkSurface(material,texture) {
  material.metalness=0;material.metalnessMap=null;material.roughness=.94;
  material.bumpMap=texture;material.bumpScale=.012;
  material.onBeforeCompile=shader=>{
    shader.uniforms.barkDetail={value:texture};
    shader.vertexShader='varying vec3 barkPoint;varying vec3 barkAxis;\n'+shader.vertexShader
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        barkPoint=(modelMatrix*vec4(position,1.)).xyz;
        barkAxis=normalize(mat3(modelMatrix)*normal);`);
    shader.fragmentShader=`varying vec3 barkPoint;varying vec3 barkAxis;uniform sampler2D barkDetail;
      vec3 barkAt(vec3 p){
        vec3 w=pow(abs(barkAxis),vec3(4.));w/=max(.001,w.x+w.y+w.z);
        return texture2D(barkDetail,p.zy*vec2(2.5,1.15)).rgb*w.x
          +texture2D(barkDetail,p.xz*2.5).rgb*w.y
          +texture2D(barkDetail,p.xy*vec2(2.5,1.15)).rgb*w.z;
      }\n`+shader.fragmentShader
      .replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.rgb=mix(diffuseColor.rgb*.55,barkAt(barkPoint)*.67,.83);`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float h0=dot(barkAt(barkPoint),vec3(.333));
        vec2 dh=vec2(dot(barkAt(barkPoint+dFdx(barkPoint)),vec3(.333))-h0,
                     dot(barkAt(barkPoint+dFdy(barkPoint)),vec3(.333))-h0);
        normal=perturbNormalArb(-vViewPosition,normal,dh*.028,faceDirection);`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=max(.88,roughnessFactor);`);
  };
}

function leafSurface(material,time) {
  material.metalness=0;material.metalnessMap=null;material.roughness=.78;
  material.side=T.DoubleSide;
  const deform=shader=>{
    shader.uniforms.treeTime=time;
    shader.vertexShader='uniform float treeTime;varying float leafVariation;\n'+shader.vertexShader
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        float phase=instanceMatrix[3].x*1.7+instanceMatrix[3].z*.83;
        leafVariation=.87+.13*sin(phase);
        float bend=smoothstep(0.,1.15,position.y);
        transformed.z+=bend*(.012*sin(treeTime*1.3+phase)+.004*sin(treeTime*3.1+position.x*17.));
        transformed.x+=bend*.004*sin(treeTime*.9+phase);`);
  };
  material.onBeforeCompile=shader=>{
    deform(shader);shader.uniforms.leafSun={value:campusSun.clone().normalize()};
    shader.fragmentShader='varying float leafVariation;uniform vec3 leafSun;\n'+shader.fragmentShader
      .replace('#include <color_fragment>',`#include <color_fragment>
        float leaf=smoothstep(-.015,.08,diffuseColor.g-diffuseColor.r*.94);
        diffuseColor.rgb*=mix(vec3(.65,.63,.55),vec3(.55,.69,.45),leaf)*leafVariation;`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=max(.7,roughnessFactor);`)
      .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        vec3 sunView=normalize((viewMatrix*vec4(leafSun,0.)).xyz);
        float throughLeaf=pow(max(dot(-normal,sunView),0.),1.4);
        reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(.85,.72,.38)*leaf*throughLeaf*.6;`);
  };
  const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});
  depth.onBeforeCompile=deform;return depth;
}

export function plantCampusTrees(scene,source,sprig,beds,textures) {
  const time={value:0},native=V(...source.userData.native);
  source.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.castShadow=mesh.receiveShadow=true;
    for(const material of [].concat(mesh.material))barkSurface(material,textures.bark);
  });
  const trees=beds.map(([x,z,height,angle],i)=>{
    const tree=i?source.clone(true):source;
    tree.scale.copy(native).multiplyScalar(height/native.y);
    tree.position.set(x,height/2-.095,z);tree.rotation.y=angle;
    tree.name='校园香樟 / '+(i+1);scene.add(tree);tree.updateMatrixWorld(true);return tree;
  });

  // Reconstruct the native sprig proportions, pivot on the cut end of its twig,
  // and align its growing direction to +Y. No flattened leaf cards are added.
  const mesh=sprig.children[0],geometry=mesh.geometry.clone();
  geometry.scale(...sprig.userData.native);
  const p=geometry.attributes.position,root=V(),tip=V();let roots=0,tips=0;
  geometry.computeBoundingBox();const box=geometry.boundingBox,h=box.max.y-box.min.y;
  for(let i=0;i<p.count;i++){
    if(p.getY(i)<box.min.y+h*.012){root.add(V().fromBufferAttribute(p,i));roots++;}
    if(p.getY(i)>box.max.y-h*.04){tip.add(V().fromBufferAttribute(p,i));tips++;}
  }
  root.divideScalar(roots);tip.divideScalar(tips);
  geometry.translate(-root.x,-root.y,-root.z);
  const align=new T.Quaternion().setFromUnitVectors(tip.sub(root).normalize(),Y);
  geometry.applyQuaternion(align);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const structure=textures.foliageStructure;
  const twigGeometry=geometry.clone();twigGeometry.setIndex(structure.twigIndices);
  function derivative(level){
    const result=new T.BufferGeometry();
    for(const [key,name,size] of [['POSITION','position',3],['NORMAL','normal',3],['TEXCOORD_0','uv',2]]){
      result.setAttribute(name,new T.Float32BufferAttribute(structure[level][key],size));
    }
    result.setIndex(structure[level+'Indices']);
    const center=V(...structure.center).add(root);
    result.translate(-center.x,-center.y,-center.z);result.applyQuaternion(align);
    result.computeBoundingBox();result.computeBoundingSphere();return result;
  }
  const innerGeometry=derivative('inner'),farGeometry=derivative('far');
  const joints=structure.joints.map(j=>({
    root:V(...j.root).sub(root).applyQuaternion(align),
    direction:V(...j.direction).applyQuaternion(align).normalize()
  }));
  const material=mesh.material.clone(),depth=leafSurface(material,time);
  const wood=mesh.material.clone();wood.metalness=0;wood.metalnessMap=null;wood.roughness=.88;wood.color.setRGB(.56,.59,.49);
  const lods=[],crowns=[],stats=[];
  function instanced(geo,mat,matrices,colors,name){
    const object=new T.InstancedMesh(geo,mat,matrices.length);
    object.name=name;object.castShadow=object.receiveShadow=true;
    matrices.forEach((m,i)=>{object.setMatrixAt(i,m);if(colors)object.setColorAt(i,colors[i]);});
    object.instanceMatrix.needsUpdate=true;
    if(colors)object.instanceColor.needsUpdate=true;
    if(mat===material)object.customDepthMaterial=depth;
    object.computeBoundingBox();object.computeBoundingSphere();return object;
  }
  for(let t=0;t<trees.length;t++){
    const tree=trees[t],height=beds[t][2],treeScale=height/7.1;
    const matrices=[],colors=[],outerMatrices=[],outerColors=[],innerMatrices=[],innerColors=[],twigs=[],matrix=new T.Matrix4();
    function leafBranch(position,direction,seed,scale=.36,outer=true){
      const rotation=new T.Quaternion().setFromUnitVectors(Y,direction.clone().normalize());
      rotation.multiply(new T.Quaternion().setFromAxisAngle(Y,noise(seed+7)*Math.PI*2));
      const length=scale*(.86+noise(seed+5)*.3)*treeScale;
      matrix.compose(position,rotation,V(length,length,length));matrices.push(matrix.clone());
      const color=new T.Color().setRGB(.88+noise(seed+1)*.12,.92+noise(seed+4)*.08,.84+noise(seed+6)*.16);
      colors.push(color);
      (outer?outerMatrices:innerMatrices).push(matrix.clone());(outer?outerColors:innerColors).push(color);
    }
    for(let a=0;a<textures.treeAnchors.attachments.length;a++){
      const anchor=textures.treeAnchors.attachments[a];
      const origin=V(...anchor.root).applyMatrix4(tree.matrixWorld);
      // Lower boughs reach upward; upper boughs spread sideways. The extra
      // depth fills the original planar silhouette without enlarging leaves.
      const outward=V(anchor.root[0]*1.15,.55-anchor.root[1]*.7,anchor.root[2]*1.5).normalize().applyQuaternion(tree.quaternion);
      const depthAxis=V(0,0,1).applyQuaternion(tree.quaternion);
      for(let arm=0;arm<2;arm++){
        const seed=t*7919+a*97+arm*31;
        const direction=outward.clone().multiplyScalar(.85)
          .addScaledVector(depthAxis,(arm?1:-1)*(.8+noise(seed+3)*.65))
          .add(V((noise(seed)-.5)*.7,(noise(seed+2)-.45)*.4,(noise(seed+11)-.5)*.4)).normalize();
        const rotation=new T.Quaternion().setFromUnitVectors(Y,direction);
        rotation.multiply(new T.Quaternion().setFromAxisAngle(Y,noise(seed+7)*Math.PI*2));
        const length=(1.65+noise(seed+5)*.85)*treeScale;
        const graft=origin.clone().addScaledVector(outward,arm*.025);
        const branch=new T.Matrix4().compose(graft,rotation,V(length,length,length));twigs.push(branch);
        for(let j=0;j<joints.length;j++){
          const joint=joints[j],position=joint.root.clone().applyMatrix4(branch);
          const lateral=joint.direction.clone().applyQuaternion(rotation);
          const growing=lateral.multiplyScalar(.75).addScaledVector(direction,.65).addScaledVector(Y,.18).normalize();
          leafBranch(position,growing,seed+j*17,.36+noise(seed+j)*.075);
          // Unequal side shoots create overlap inside the crown rather than
          // identical seven-leaf fans all rooted at one branch endpoint.
          leafBranch(position,growing.clone().add(V((noise(seed+j+9)-.5)*1.3,.12,(noise(seed+j+11)-.5)*1.3)),seed+j*17+101,.31,false);
        }
      }
      // Short, darker inner shoots keep the long boughs readable through the
      // outer foliage and join adjacent clusters into one continuous crown.
      for(let inner=0;inner<3;inner++){
        const seed=t*1889+a*71+inner*19;
        leafBranch(origin,outward.clone().add(V(noise(seed)-.5,noise(seed+1)*.5,noise(seed+2)-.5)),seed,.40,false);
      }
    }
    const woody=instanced(twigGeometry,wood,twigs,null,'香樟 / 次级细枝');scene.add(woody);
    const near=new T.Group();
    near.add(instanced(geometry,material,outerMatrices,outerColors,'香樟 / 外层近景叶脉与细枝'));
    near.add(instanced(innerGeometry,material,innerMatrices,innerColors,'香樟 / 内层重叠枝叶'));
    const far=instanced(farGeometry,material,matrices,colors,'香樟 / 远景完整树冠');
    const lod=new T.LOD();lod.name='香樟树冠 / '+(t+1);
    // Instance transforms are world coordinates; put their LOD pivot at the
    // crown and offset the meshes back so distance selection is per tree.
    lod.position.set(beds[t][0],height*.68,beds[t][1]);
    near.position.copy(lod.position).negate();far.position.copy(near.position);
    lod.addLevel(near,0);lod.addLevel(far,18,.15);
    // Boot renders both once, then enables selection. A later close approach
    // must not trigger a first geometry upload in the middle of the walk.
    lod.autoUpdate=false;near.visible=far.visible=true;scene.add(lod);lods.push(lod);crowns.push(near);
    stats.push({sprigs:matrices.length,twigs:twigs.length});
  }
  return {trees,crowns,stats,update:t=>{time.value=t;},
    details:()=>lods.map((lod,i)=>({...stats[i],near:lod.levels[0].object.visible,far:lod.levels[1].object.visible})),
    enableDetailSelection:()=>{for(const lod of lods)lod.autoUpdate=true;}};
}
