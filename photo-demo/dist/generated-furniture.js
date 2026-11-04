import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** Keep the source model's proportions and register its support plane and yaw.
 * Original procedural objects remain as an explicit, recoverable fallback.
 */
export async function createGeneratedFurniture(scene,room){
  const results=Object.fromEntries(['chair','lamp','note'].map(name=>[name,{source:'calibrated',triangles:0}]));
  if(new URLSearchParams(location.search).get('furniture')==='calibrated')return results;
  let fits;
  try{
    const response=await fetch('./assets/generated-furniture-fit.json');
    if(!response.ok)throw new Error(`Furniture registration unavailable (${response.status})`);
    fits=await response.json();
  }catch(error){console.warn('Keeping calibrated furniture.',error);return results;}
  await Promise.all(Object.entries(results).map(async([name,result])=>{
    try{
      const fit=fits[name];
      if(!fit)throw new Error(`Missing ${name} registration`);
      const {scene:model}=await new GLTFLoader().loadAsync('./assets/'+fit.file);
      model.scale.setScalar(fit.scale);
      model.position.fromArray(fit.sourceOrigin).multiplyScalar(-fit.scale);
      const object=new THREE.Group();object.name=`SAM segmented Hi3D ${name}`;
      object.position.fromArray(fit.position);object.rotation.y=fit.yaw;object.add(model);
      model.traverse(node=>{
        if(!node.isMesh)return;
        node.castShadow=node.receiveShadow=true;
        result.triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
        for(const material of Array.isArray(node.material)?node.material:[node.material]){
          material.envMapIntensity=name==='lamp'?1.35:.65;
          if(material.map)material.map.anisotropy=8;
          // Hi3D inferred high metallic values even for the photographed paper.
          // Correct known material classes without changing the source GLB.
          if(name==='note'){
            material.metalness=0;material.metalnessMap=null;
            material.roughness=.94;material.roughnessMap=null;
            material.envMapIntensity=.25;
          }
          if(name==='chair'){
            material.metalness=.25;material.color.multiplyScalar(1.35);
            material.onBeforeCompile=shader=>{
              shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
                '#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.62);');
            };
            material.customProgramCacheKey=()=> 'photographed-mesh-chair';
          }
          if(name==='lamp'){
            material.onBeforeCompile=shader=>{
              shader.uniforms.lampFloor={value:fit.position[1]};
              shader.uniforms.lampHeight={value:fit.sourceSize[1]*fit.scale};
              shader.vertexShader='varying float lampWorldY;\n'+shader.vertexShader;
              shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
                '#include <worldpos_vertex>\nlampWorldY=(modelMatrix*vec4(transformed,1.0)).y;');
              shader.fragmentShader='varying float lampWorldY;uniform float lampFloor;uniform float lampHeight;\n'+shader.fragmentShader;
              shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
                float lampY=(lampWorldY-lampFloor)/lampHeight;
                float lampMetal=max(smoothstep(.60,.72,lampY),1.-smoothstep(.035,.09,lampY));
                float gray=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
                // Source PBR bakes dark reflections into the albedo. Restore a
                // neutral steel reflectance; retain modest photographed variation.
                vec3 steel=vec3(.44,.45,.43)*clamp(gray*2.2,.82,1.18);
                diffuseColor.rgb=mix(diffuseColor.rgb,steel,lampMetal);`);
              shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
                '#include <roughnessmap_fragment>\nroughnessFactor=mix(max(roughnessFactor,.43),.36,lampMetal);');
              shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',
                '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.72,lampMetal);');
            };
            material.customProgramCacheKey=()=> 'photographed-steel-and-amber-lamp';
          }
        }
      });
      scene.add(object);object.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(object);
      result.source='hi3d';result.pose={position:fit.position,yaw:fit.yaw,scale:fit.scale};
      result.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
      room[name].visible=false;room[name]=object;
      object.userData.front=new THREE.Vector3(0,0,name==='chair'?-1:1).applyAxisAngle(new THREE.Vector3(0,1,0),fit.yaw).toArray();
      if(name==='lamp'){
        room.lampBase.copy(object.position);
        room.lampLight.position.copy(object.position).add(new THREE.Vector3(0,(bounds.max.y-bounds.min.y)*.65,0));
      }
    }catch(error){console.warn(`Keeping calibrated ${name}.`,error);}
  }));
  return results;
}
