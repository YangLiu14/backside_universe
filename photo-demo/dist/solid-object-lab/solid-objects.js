import * as THREE from 'three';

// Opaque closed surfaces share Spark's depth buffer. Texture coordinates come
// from one fixed source camera, independent of the user's orbit or scrub speed.
export async function createSolidObjects(renderer, scene, meta){
  const [data,photo,laptopMask,cupMask]=await Promise.all([
    fetch('./assets/objects.json').then(r=>r.json()),
    new THREE.TextureLoader().loadAsync('../assets/desk-original.jpg'),
    new THREE.TextureLoader().loadAsync('../assets/objects/laptop-mask.png'),
    new THREE.TextureLoader().loadAsync('../assets/objects/cup-mask.png')
  ]);
  for(const tex of [photo,laptopMask,cupMask]){
    tex.colorSpace=THREE.NoColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=false;
  }
  const group=new THREE.Group();group.name='Closed photo-projected laptop and cup';group.rotation.x=Math.PI;scene.add(group);
  const K=new THREE.Vector4(...meta.intrinsics),size=new THREE.Vector2(meta.width,meta.height);
  const vertexShader=`varying vec3 sourcePoint;
  void main(){vec4 world=modelMatrix*vec4(position,1.);sourcePoint=vec3(world.x,-world.y,-world.z);gl_Position=projectionMatrix*viewMatrix*world;}`;
  const depthMaterial=new THREE.ShaderMaterial({vertexShader,fragmentShader:`varying vec3 sourcePoint;void main(){gl_FragColor=vec4(sourcePoint.z,0.,0.,1.);}`,side:THREE.DoubleSide});
  const target=new THREE.WebGLRenderTarget(meta.width,meta.height,{type:THREE.FloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
  target.texture.generateMipmaps=false;
  const materials=[];
  for(const part of data.parts){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));geometry.setIndex(part.indices);geometry.computeVertexNormals();
    const mat=new THREE.ShaderMaterial({
      uniforms:{sourcePhoto:{value:photo},sourceMask:{value:part.object==='cup'?cupMask:laptopMask},sourceDepth:{value:target.texture},K:{value:K},imageSize:{value:size},fallback:{value:new THREE.Vector3(...part.color)},inspection:{value:0},useMask:{value:part.object==='cup'?1:0},blueExtension:{value:part.object==='cup'&&part.name!=='coffee'?1:0}},
      vertexShader,
      fragmentShader:`precision highp float;
      uniform sampler2D sourcePhoto,sourceMask,sourceDepth;
      uniform vec4 K;uniform vec2 imageSize;uniform vec3 fallback;uniform float inspection,useMask,blueExtension;
      varying vec3 sourcePoint;
      void main(){
        vec2 pixel=sourcePoint.xy/sourcePoint.z*K.xy+K.zw;
        vec2 uv=vec2(pixel.x/imageSize.x,1.-pixel.y/imageSize.y);
        // Conservative fixed-camera visibility: edge samples must not blend
        // valid depth with the empty background and turn the cream rim blue.
        float delta=abs(texture2D(sourceDepth,uv).r-sourcePoint.z);
        vec2 du=vec2(1./imageSize.x,0.),dv=vec2(0.,1./imageSize.y);
        delta=min(delta,abs(texture2D(sourceDepth,uv+du).r-sourcePoint.z));
        delta=min(delta,abs(texture2D(sourceDepth,uv-du).r-sourcePoint.z));
        delta=min(delta,abs(texture2D(sourceDepth,uv+dv).r-sourcePoint.z));
        delta=min(delta,abs(texture2D(sourceDepth,uv-dv).r-sourcePoint.z));
        float visible=1.-smoothstep(.003,.008,delta);
        float mask=texture2D(sourceMask,uv).r;
        float valid=visible*mix(1.,smoothstep(.25,.85,mask),useMask);
        vec3 sampled=texture2D(sourcePhoto,uv).rgb;
        // Continue only the cup's blue glaze onto its narrowly revealed side.
        // Background/coffee colors cannot leak through this material constraint.
        float glaze=blueExtension*mask*smoothstep(.05,.16,sampled.b-max(sampled.r,sampled.g));
        vec3 inferred=mix(fallback,sampled,glaze);
        vec3 color=mix(inferred,sampled,valid);
        if(inspection>.5)color=vec3(.19,.72,.52);
        gl_FragColor=vec4(color,1.);
      }`,side:THREE.DoubleSide,depthTest:true,depthWrite:true,transparent:false
    });
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=part.name;mesh.userData.object=part.object;group.add(mesh);materials.push(mat);
  }
  const sourceCamera=new THREE.PerspectiveCamera(50,1,.001,1000);const [fx,fy,cx,cy]=meta.intrinsics,n=sourceCamera.near;
  sourceCamera.projectionMatrix.makePerspective(-cx/fx*n,(meta.width-cx)/fx*n,cy/fy*n,-(meta.height-cy)/fy*n,n,sourceCamera.far);
  sourceCamera.projectionMatrixInverse.copy(sourceCamera.projectionMatrix).invert();
  const sourceScene=new THREE.Scene();sourceScene.add(group);sourceScene.overrideMaterial=depthMaterial;
  const previousTarget=renderer.getRenderTarget(),previousColor=renderer.getClearColor(new THREE.Color()),previousAlpha=renderer.getClearAlpha();
  renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(sourceScene,sourceCamera);renderer.setRenderTarget(previousTarget);renderer.setClearColor(previousColor,previousAlpha);scene.add(group);
  depthMaterial.dispose();
  return {group,data,materials,setInspection:on=>materials.forEach(m=>m.uniforms.inspection.value=on?1:0),setWireframe:on=>materials.forEach(m=>m.wireframe=on),dispose(){for(const m of group.children){m.geometry.dispose();m.material.dispose();}target.dispose();photo.dispose();laptopMask.dispose();cupMask.dispose();}};
}
