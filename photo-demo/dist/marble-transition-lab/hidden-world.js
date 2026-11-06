import * as THREE from 'three';
import {createHolidayWorld} from '../island.js';
import {createGrotto} from './grotto.js';

// A permanent source-camera shadow volume, NOT a progress-dependent reveal.
// Every fragment must project behind an opaque photographed object, with a
// small silhouette inset. The same constraint is used by beauty and mask passes.
export function createHiddenVolume({depth,view,K,size}){
  const uniforms={hiddenDepth:{value:depth},hiddenView:{value:view},hiddenK:{value:K},hiddenSize:{value:size}};
  const header=`varying vec3 hiddenWorldPoint;uniform sampler2D hiddenDepth;uniform mat4 hiddenView;uniform vec4 hiddenK;uniform vec2 hiddenSize;
    bool outsideHiddenVolume(){
      vec3 p=(hiddenView*vec4(hiddenWorldPoint,1.)).xyz; p=vec3(p.x,-p.y,-p.z);
      vec2 q=p.xy/p.z*hiddenK.xy+hiddenK.zw;vec2 uv=vec2(q.x/hiddenSize.x,1.-q.y/hiddenSize.y);
      if(p.z<=0.||any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return true;
      vec2 px=1.5/hiddenSize;
      for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
        float z=texture2D(hiddenDepth,uv+vec2(float(x),float(y))*px).r;
        if(z<.01||p.z<z+.0015)return true;
      }
      return false;
    }`;
  function protect(material){
    const previous=material.onBeforeCompile;
    material.onBeforeCompile=function(shader,renderer){
      previous.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
      shader.vertexShader='varying vec3 hiddenWorldPoint;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nhiddenWorldPoint=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=header+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(outsideHiddenVolume())discard;');
    };
    const key=material.customProgramCacheKey.bind(material);
    const priorKey=key();material.customProgramCacheKey=()=>priorKey+'-source-hidden-volume-v1';material.needsUpdate=true;return material;
  }
  const mask=protect(new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false}));
  return {mask,apply(root){root.traverse(o=>{if(!o.isMesh)return;o.layers.enable(2);o.castShadow=false;
    o.material=Array.isArray(o.material)?o.material.map(m=>protect(m.clone())):protect(o.material.clone());
  });}};
}

// Only the retained cup harbour uses the permanent source silhouette.
export async function createHiddenWorld(scene,registered,surface,loader){
  const root=new THREE.Group();root.name='Cup harbour behind the photographed ceramic';scene.add(root);
  const volume=createHiddenVolume(registered.sourceOcclusion);
  const grottoPromise=createGrotto(registered,surface,loader);
  const cup=registered.group.getObjectByName('cup-wall'),bounds=new THREE.Box3().setFromObject(cup),center=bounds.getCenter(new THREE.Vector3());
  const cupSlot=new THREE.Group();cupSlot.name='Cup harbour behind ceramic wall';cupSlot.position.set(center.x,bounds.min.y+.008,center.z);cupSlot.rotation.y=Math.PI;cupSlot.scale.setScalar(.039);root.add(cupSlot);
  const [grotto,island]=await Promise.all([grottoPromise,createHolidayWorld(THREE,cupSlot,{islandUrl:'../assets/holiday-island.glb',houseUrl:'../assets/holiday-house.glb'})]);await island.ready;
  if(island.source!=='hi3d-island')throw Error('完整 Hi3D 海岛未加载');
  volume.apply(root);
  // The complete generated cavern is revealed with the modeled world. It
  // must not be cut into the old tiny silhouette-constrained shelf geometry.
  scene.add(grotto.root);
  return{group:root,grotto,maskMaterial:volume.mask,islandSource:island.source,cottageReady:true,update(t){island.update(t);island.setLight(.65);}};
}

// A beauty-pass regression check, including the source silhouette and its
// antialiasing. The hidden world is fully enabled; no handoff/opacity is used.
export function auditSourceOcclusion(renderer,scene,objects,holiday,camera){
  const parent=objects.parent,previous=renderer.getRenderTarget(),oldVisible=holiday.visible;
  const target=new THREE.WebGLRenderTarget(660,870,{depthBuffer:true});
  const a=new Uint8Array(660*870*4),b=new Uint8Array(a.length);
  scene.add(objects);renderer.setRenderTarget(target);
  holiday.visible=false;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,660,870,a);
  holiday.visible=true;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,660,870,b);
  let changedPixels=0,maxChannelDifference=0;
  for(let i=0;i<a.length;i+=4){const difference=Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])));maxChannelDifference=Math.max(maxChannelDifference,difference);if(difference>2)changedPixels++;}
  holiday.visible=oldVisible;parent.add(objects);renderer.setRenderTarget(previous);target.dispose();
  return{width:660,height:870,changedPixels,maxChannelDifference,holidayFullyEnabled:true};
}
