import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHolidayWorld} from '../island.js';

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

// The laptop is the principal destination. All three destinations share the
// retained Hi3D art, but no connecting bridge may cross visible empty desktop.
export async function createHiddenWorld(scene,registered){
  const root=new THREE.Group();root.name='Holiday entirely behind source silhouettes';scene.add(root);
  const volume=createHiddenVolume(registered.sourceOcclusion),loader=new GLTFLoader();
  const standard=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.55,...extra});
  const sand=standard('#b4a68c'),paper=standard('#c9bea2'),sea=standard('#397f86',{roughness:.22,metalness:.16});
  function box(parent,size,at,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...at);parent.add(mesh);return mesh;}
  function modelIn(model,parent,size,at){
    const bounds=new THREE.Box3().setFromObject(model),extent=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const wrap=new THREE.Group();wrap.add(model);model.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
    wrap.scale.set(size[0]/extent.x,size[1]/extent.y,size[2]/extent.z);wrap.position.set(...at);parent.add(wrap);
    model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.roughness=Math.max(.55,m.roughness);m.envMapIntensity=.7;if(m.map)m.map.anisotropy=8;}});
    return wrap;
  }
  const [islandAsset,houseAsset]=await Promise.all([loader.loadAsync('../assets/holiday-island.glb'),loader.loadAsync('../assets/holiday-house.glb')]);
  const lid=registered.group.getObjectByName('laptop-lid'),p=lid.geometry.attributes.position;
  const v=i=>new THREE.Vector3().fromBufferAttribute(p,i);
  const lower=v(6).add(v(7)).multiplyScalar(.5),upper=v(4).add(v(5)).multiplyScalar(.5);
  const right=v(4).sub(v(5)).normalize(),up=upper.clone().sub(lower).normalize(),back=new THREE.Vector3().crossVectors(right,up).normalize();up.crossVectors(back,right).normalize();
  const panel=new THREE.Group();panel.name='Laptop back — deep coastal diorama';
  panel.matrix.makeBasis(right,up,back).setPosition(lower.clone().lerp(upper,.5).addScaledVector(back,.004));panel.matrixAutoUpdate=false;root.add(panel);
  // Fine brushed-metal perimeter leaves the original aluminium recognisable.
  const rim=standard('#aaa58e',{metalness:.65,roughness:.36}),ink=standard('#2a555b');
  box(panel,[.256,.174,.003],[0,0,.003],ink);
  for(const x of [-.129,.129])box(panel,[.003,.18,.008],[x,0,.006],rim);
  for(const y of [-.088,.088])box(panel,[.261,.003,.008],[0,y,.006],rim);
  const bay=box(panel,[.245,.004,.085],[0,-.078,.048],sea);bay.name='Sea shelf inside laptop back';
  modelIn(islandAsset.scene,panel,[.176,.113,.076],[.028,-.075,.052]).name='Original Hi3D harbour inside laptop back';
  // Two terraced villas make the full panel a destination, rather than leaving
  // a blank back shell above a small island. Reuse the detailed original asset.
  for(const [x,y,w,h,d] of [[-.074,.008,.066,.054,.033],[.073,.030,.045,.037,.027]]){
    box(panel,[w+.009,.006,d+.008],[x,y-.003,.020],paper);
    modelIn(houseAsset.scene.clone(true),panel,[w,h,d],[x,y,.022]);
  }
  // A descending promenade joins the upper village to the harbour, all inside
  // the laptop's own projected silhouette. Individual treads give real parallax.
  for(let i=0;i<17;i++){
    const t=i/16,x=-.075+.082*t,y=.006-.075*t,z=.043+.028*t;
    box(panel,[.022,.003,.007],[x,y,z],i%3?paper:sand);
    if(i%4===0)box(panel,[.0012,.012,.0012],[x-.012,y+.006,z],rim);
  }
  // Inset limestone steps and a short dock stay within the screen shadow.
  for(let i=0;i<4;i++)box(panel,[.039,.003,.012],[-.08,-.072+i*.003,.079-i*.011],i%2?paper:sand);
  const dock=standard('#8d7255');
  for(let i=0;i<10;i++)box(panel,[.029,.002,.0045],[.073,-.073,.025+i*.0055],dock);

  // The book's small village is sheltered by the curled paper, not perched on
  // an oversized terrace above the photographed cover. No projecting palm.
  const book=new THREE.Group();book.name='Book village behind curled paper';root.add(book);
  book.position.set(.270,.854,-2.659);book.rotation.y=Math.PI-.4;
  for(let i=0;i<3;i++)box(book,[.070-i*.009,.0025,.052-i*.007],[0,.002+i*.0025,0],i%2?paper:sand);
  modelIn(houseAsset.scene.clone(true),book,[.046,.038,.038],[0,.009,-.002]);

  const cup=registered.group.getObjectByName('cup-wall'),bounds=new THREE.Box3().setFromObject(cup),center=bounds.getCenter(new THREE.Vector3());
  const cupSlot=new THREE.Group();cupSlot.name='Cup harbour behind ceramic wall';cupSlot.position.set(center.x,bounds.min.y+.008,center.z);cupSlot.rotation.y=Math.PI;cupSlot.scale.setScalar(.039);root.add(cupSlot);
  const island=await createHolidayWorld(THREE,cupSlot,{islandUrl:'../assets/holiday-island.glb',houseUrl:'../assets/holiday-house.glb'});await island.ready;
  if(island.source!=='hi3d-island')throw Error('完整 Hi3D 海岛未加载');
  volume.apply(root);
  return{group:root,maskMaterial:volume.mask,islandSource:island.source,cottageReady:true,update(t){island.update(t);island.setLight(.65);}};
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
