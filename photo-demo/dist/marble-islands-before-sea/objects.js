import * as THREE from 'three';

// Shared calibrated geometry for both render passes; no duplicate object poses.
// Decode the photo to linear color for the offscreen compositor. Older pages stay unchanged.
export async function createObjects(renderer,scene,meta,sourceCamera){
  const load=path=>new THREE.TextureLoader().loadAsync(path);
  const [data,photo,laptopMask,cupMask,noteMask,glaze,bookPhoto]=await Promise.all([
    fetch('../marble-refined-lab/assets/objects.json').then(r=>r.json()),load('../assets/desk-original.jpg'),
    load('../assets/objects/laptop-mask.png'),load('../assets/objects/cup-mask.png'),
    load('../assets/objects/note-mask.png'),load('../marble-refined-lab/assets/cup-glaze.png'),load('../marble-refined-lab/assets/book-photo.png')]);
  for(const t of [photo,laptopMask,cupMask,noteMask,glaze,bookPhoto]){t.colorSpace=THREE.NoColorSpace;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;}
  const group=new THREE.Group();group.name='Registered photo-textured objects';
  for(const part of data.parts){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));geo.setIndex(part.indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial());mesh.name=part.name;mesh.userData.kind=part.object;mesh.userData.color=part.color;group.add(mesh);
  }
  scene.add(group);group.updateMatrixWorld(true);sourceCamera.updateMatrixWorld(true);
  const view=sourceCamera.matrixWorldInverse.clone(),K=new THREE.Vector4(...meta.intrinsics),size=new THREE.Vector2(meta.width,meta.height);
  // Linear depth sampling avoids alternating visible/fallback rows on oblique
  // planes. Neighbour checks below retain coverage at silhouette boundaries.
  const target=new THREE.WebGLRenderTarget(meta.width,meta.height,{type:THREE.FloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
  const vertex=`varying vec3 sourcePoint;varying vec3 worldNormal;varying vec2 materialUv;uniform mat4 sourceView;
    void main(){vec4 world=modelMatrix*vec4(position,1.);vec3 p=(sourceView*world).xyz;sourcePoint=vec3(p.x,-p.y,-p.z);worldNormal=normalize(mat3(modelMatrix)*normal);materialUv=uv;gl_Position=projectionMatrix*viewMatrix*world;}`;
  const depth=new THREE.ShaderMaterial({uniforms:{sourceView:{value:view}},vertexShader:vertex,fragmentShader:'varying vec3 sourcePoint;void main(){gl_FragColor=vec4(sourcePoint.z,0.,0.,1.);}',side:THREE.DoubleSide});
  const meshes=[],materials=[];
  group.traverse(o=>{if(!o.isMesh)return;meshes.push(o);const old=Array.isArray(o.material)?o.material[0]:o.material;
    const map=old?.map;if(map){map.colorSpace=THREE.NoColorSpace;map.needsUpdate=true;}
    const kind=o.userData.kind;
    const material=new THREE.ShaderMaterial({uniforms:{
      sourceView:{value:view},sourceDepth:{value:target.texture},sourcePhoto:{value:o.name==='book-cover'?bookPhoto:photo},glazePhoto:{value:glaze},handle:{value:o.name==='cup-handle'?1:0},cover:{value:o.name==='book-cover'?1:0},
      sourceMask:{value:kind==='cup'?cupMask:kind==='note'?noteMask:laptopMask},K:{value:K},imageSize:{value:size},
      baseMap:{value:map||photo},hasBaseMap:{value:map?1:0},fallback:{value:new THREE.Vector3(...o.userData.color)},
      inspection:{value:0},photoEnabled:{value:1},blueOnly:{value:['cup-handle','saucer'].includes(o.name)?1:0},cupGlaze:{value:kind==='cup'&&o.name!=='coffee'?1:0},useMask:{value:['laptop','book'].includes(kind)?0:1}},
      vertexShader:vertex,
      fragmentShader:`precision highp float;varying vec3 sourcePoint;varying vec3 worldNormal;varying vec2 materialUv;
      uniform sampler2D sourceDepth,sourcePhoto,sourceMask,baseMap,glazePhoto;uniform vec4 K;uniform vec2 imageSize;uniform float handle,cover;
      uniform vec3 fallback;uniform float hasBaseMap,inspection,photoEnabled,cupGlaze,useMask,blueOnly;
      void main(){
        vec2 pixel=sourcePoint.xy/sourcePoint.z*K.xy+K.zw;vec2 uv=vec2(pixel.x/imageSize.x,1.-pixel.y/imageSize.y);
        float inFrame=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.)*step(0.,sourcePoint.z);
        float delta=abs(texture2D(sourceDepth,uv).r-sourcePoint.z);
        vec2 du=vec2(1./imageSize.x,0.),dv=vec2(0.,1./imageSize.y);
        delta=min(delta,abs(texture2D(sourceDepth,uv+du).r-sourcePoint.z));delta=min(delta,abs(texture2D(sourceDepth,uv-du).r-sourcePoint.z));
        delta=min(delta,abs(texture2D(sourceDepth,uv+dv).r-sourcePoint.z));delta=min(delta,abs(texture2D(sourceDepth,uv-dv).r-sourcePoint.z));
        float visible=1.-smoothstep(.0012,.0035,delta);
        float mask=texture2D(sourceMask,uv).r;vec3 sampled=texture2D(sourcePhoto,uv).rgb;
        float shade=.76+.24*max(0.,dot(normalize(worldNormal),normalize(vec3(-.3,1.,.4))));
        vec3 base=mix(fallback*shade,texture2D(baseMap,materialUv).rgb,hasBaseMap);
        if(cupGlaze>.5)base=mix(base,texture2D(glazePhoto,uv).rgb*(.91+.09*shade),photoEnabled);
        float glaze=cupGlaze*mask*smoothstep(.05,.16,sampled.b-max(sampled.r,sampled.g))*inFrame;
        base=mix(base,sampled,glaze*photoEnabled);
        float valid=inFrame*visible*mix(1.,smoothstep(.25,.85,mask),useMask)*photoEnabled;
        valid*=mix(1.,smoothstep(.01,.10,sampled.b-max(sampled.r,sampled.g)),blueOnly);
        // This registered quad has downward winding: its photographed upper
        // surface is the back-facing side. The underside gets clean blue.
        if(cover>.5)valid=photoEnabled*(gl_FrontFacing?0.:1.);
        if(handle>.5)valid=0.;
        vec3 color=mix(base,sampled,valid);if(inspection>.5)color=vec3(.24,.78,.55);
        color=mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
        gl_FragColor=vec4(color,1.);
      }`,side:THREE.DoubleSide,depthWrite:true,depthTest:true});
    o.material=material;materials.push(material);
  });
  const temp=new THREE.Scene();temp.add(group);temp.overrideMaterial=depth;
  const previous=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(temp,sourceCamera);
  renderer.setRenderTarget(previous);renderer.setClearColor(color,alpha);scene.add(group);depth.dispose();
  // Keep the photograph on observed laptop faces, restore the original brushed
  // aluminium response on the unseen back. The earlier constant gray fallback
  // turned the back of the computer into a dark, unlit card.
  for(const object of meshes.filter(o=>o.userData.kind==='laptop')){
    const projected=object.material;
    const metal=new THREE.MeshStandardMaterial({color:'#b6bab8',metalness:.52,roughness:.44,envMapIntensity:1.0,side:THREE.DoubleSide});
    metal.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,projected.uniforms);
      const vertexHeader=projected.vertexShader.split('void main()')[0].replaceAll('worldNormal','photoWorldNormal');
      const vertexBody=projected.vertexShader.split('void main(){')[1].split('gl_Position=')[0].replaceAll('worldNormal','photoWorldNormal');
      shader.vertexShader=vertexHeader+'\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+vertexBody);
      const fragmentHeader=projected.fragmentShader.split('void main()')[0].replaceAll('worldNormal','photoWorldNormal');
      const body=projected.fragmentShader.split('void main(){')[1].split('gl_FragColor=')[0].replaceAll('worldNormal','photoWorldNormal');
      shader.fragmentShader=fragmentHeader+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\n{'+body+'gl_FragColor.rgb=mix(gl_FragColor.rgb,color,valid); }');
    };
    metal.customProgramCacheKey=()=> 'restored-aluminium-photo-projection-v1';object.material=metal;
  }
  // Restore the original cup's hidden opening as a fixed rear cutaway. It does
  // not follow the camera or grow with progress; the photographed front stays.
  const wall=group.getObjectByName('cup-wall'),bounds=new THREE.Box3().setFromObject(wall),center=bounds.getCenter(new THREE.Vector3());
  const front=sourceCamera.position.clone().sub(center).setY(0).normalize();
  wall.material.uniforms.cupOpening={value:new THREE.Vector4(center.x,center.z,bounds.min.y+.009,bounds.max.y-.012)};
  wall.material.uniforms.cupRear={value:new THREE.Vector2(-front.x,-front.z)};
  wall.material.vertexShader='varying vec3 cupPoint;\n'+wall.material.vertexShader.replace('vec3 p=(sourceView*world).xyz;','cupPoint=world.xyz;vec3 p=(sourceView*world).xyz;');
  wall.material.fragmentShader='varying vec3 cupPoint;uniform vec4 cupOpening;uniform vec2 cupRear;\n'+wall.material.fragmentShader.replace('void main(){','void main(){\n if(cupPoint.y>cupOpening.z&&cupPoint.y<cupOpening.w&&dot(normalize(cupPoint.xz-cupOpening.xy),cupRear)>.48)discard;');
  wall.material.needsUpdate=true;
  const coffee=group.getObjectByName('coffee');
  coffee.material=new THREE.MeshStandardMaterial({color:'#8c7b5c',roughness:.28,metalness:0,envMapIntensity:.3,side:THREE.DoubleSide});
  wall.material.uniforms.blueOnly.value=1;
  return{group,meshes,materials,sourceOcclusion:{depth:target.texture,view,K,size},setInspection:on=>materials.forEach(m=>m.uniforms.inspection.value=on?1:0),
    setPhoto:on=>materials.forEach(m=>m.uniforms.photoEnabled.value=on?1:0)};
}

export async function createDesktop(scene){
  const [data,map]=await Promise.all([fetch('../marble-refined-lab/assets/desktop.json').then(r=>r.json()),new THREE.TextureLoader().loadAsync('../marble-refined-lab/assets/desktop-surface.png')]);
  map.colorSpace=THREE.NoColorSpace;map.generateMipmaps=false;map.minFilter=THREE.LinearFilter;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));geometry.setIndex(data.indices);
  const material=new THREE.ShaderMaterial({uniforms:{map:{value:map}},vertexShader:'varying vec2 t;void main(){t=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D map;varying vec2 t;void main(){vec4 c=texture2D(map,t);if(c.a<.5)discard;vec3 linear=mix(c.rgb/12.92,pow((c.rgb+.055)/1.055,vec3(2.4)),step(vec3(.04045),c.rgb));gl_FragColor=vec4(linear,1.);}',side:THREE.DoubleSide,depthWrite:true});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Continuous registered desk support';scene.add(mesh);return mesh;
}
