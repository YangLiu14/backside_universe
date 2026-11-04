import * as THREE from 'three';

// Reuse existing calibrated geometry; projection is fixed in the source camera.
export async function createObjects(renderer,scene,meta,sourceCamera){
  const load=path=>new THREE.TextureLoader().loadAsync(path);
  const [data,photo,laptopMask,cupMask,noteMask]=await Promise.all([
    fetch('./assets/objects.json').then(r=>r.json()),load('../assets/desk-original.jpg'),
    load('../assets/objects/laptop-mask.png'),load('../assets/objects/cup-mask.png'),
    load('../assets/objects/note-mask.png')]);
  for(const t of [photo,laptopMask,cupMask,noteMask]){t.colorSpace=THREE.NoColorSpace;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;}
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
      sourceView:{value:view},sourceDepth:{value:target.texture},sourcePhoto:{value:photo},
      sourceMask:{value:kind==='cup'?cupMask:kind==='note'?noteMask:laptopMask},K:{value:K},imageSize:{value:size},
      baseMap:{value:map||photo},hasBaseMap:{value:map?1:0},fallback:{value:new THREE.Vector3(...o.userData.color)},
      inspection:{value:0},photoEnabled:{value:1},blueOnly:{value:['cup-handle','saucer'].includes(o.name)?1:0},cupGlaze:{value:kind==='cup'&&o.name!=='coffee'?1:0},useMask:{value:['laptop','book'].includes(kind)?0:1}},
      vertexShader:vertex,
      fragmentShader:`precision highp float;varying vec3 sourcePoint;varying vec3 worldNormal;varying vec2 materialUv;
      uniform sampler2D sourceDepth,sourcePhoto,sourceMask,baseMap;uniform vec4 K;uniform vec2 imageSize;
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
        float glaze=cupGlaze*mask*smoothstep(.05,.16,sampled.b-max(sampled.r,sampled.g))*inFrame;
        base=mix(base,sampled,glaze*photoEnabled);
        float valid=inFrame*visible*mix(1.,smoothstep(.25,.85,mask),useMask)*photoEnabled;
        valid*=mix(1.,smoothstep(.01,.10,sampled.b-max(sampled.r,sampled.g)),blueOnly);
        vec3 color=mix(base,sampled,valid);if(inspection>.5)color=vec3(.24,.78,.55);
        gl_FragColor=vec4(color,1.);
      }`,side:THREE.DoubleSide,depthWrite:true,depthTest:true});
    o.material=material;materials.push(material);
  });
  const temp=new THREE.Scene();temp.add(group);temp.overrideMaterial=depth;
  const previous=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(temp,sourceCamera);
  renderer.setRenderTarget(previous);renderer.setClearColor(color,alpha);scene.add(group);depth.dispose();
  return{group,meshes,materials,setInspection:on=>materials.forEach(m=>m.uniforms.inspection.value=on?1:0),
    setPhoto:on=>materials.forEach(m=>m.uniforms.photoEnabled.value=on?1:0)};
}
