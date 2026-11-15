// A cropped reflection pass shared by the level pools along the main street.
// The reflected camera sees the same actual roofs and balconies as the visitor.
import * as T from 'three';

export function streetReflection(pits) {
  const matrix = new T.Matrix4();
  const uniforms = {
    puddleProjector: {value:matrix}, puddleImage: {value:null},
    puddleReady: {value:0},
    wetFootprints: {value:pits.map(p=>new T.Vector4(p.x,p.z,p.rx,p.rz))},
    mirrorTexel: {value:new T.Vector2()}
  };
  const shaderCode = `
uniform sampler2D puddleImage;
uniform vec4 wetFootprints[${pits.length}];
uniform vec2 mirrorTexel;
uniform float puddleReady;
varying vec4 mirrorClip;
vec3 wetReflection(vec2 p, float spread) {
  vec3 light=texture2D(puddleImage,p).rgb*.40;
  vec2 d=2.*mirrorTexel*spread;
  light+=.15*(texture2D(puddleImage,p+vec2(d.x,d.y)).rgb+texture2D(puddleImage,p-d).rgb);
  light+=.15*(texture2D(puddleImage,p+vec2(d.x,-d.y)).rgb+texture2D(puddleImage,p+vec2(-d.x,d.y)).rgb);
  return light;
}
`;
  function finish(material, pit=null) {
    const flooded=Boolean(pit);
    if(flooded){material.transparent=true;material.depthWrite=false;}
    const compile = material.onBeforeCompile.bind(material);
    const previousKey = material.customProgramCacheKey();
    material.customProgramCacheKey=()=>previousKey+(flooded?'/pool-mirror':'/damp-sheen');
    material.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer);
      Object.assign(shader.uniforms,uniforms);
      if(flooded){
        shader.uniforms.puddleCenter={value:new T.Vector2(pit.x,pit.z)};
        shader.uniforms.puddleBasin={value:new T.Vector4(pit.rx,pit.rz,pit.seed,1-.5*pit.water)};
      }
      shader.vertexShader='uniform mat4 puddleProjector;\nvarying vec4 mirrorClip;\n'+shader.vertexShader
        .replace('#include <project_vertex>', '#include <project_vertex>\n mirrorClip=puddleProjector*modelMatrix*vec4(transformed,1.);');
      shader.fragmentShader=(flooded?'uniform vec2 puddleCenter; uniform vec4 puddleBasin;\n':'')+shaderCode+shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec2 mirrorUv=mirrorClip.xy/max(.00001,mirrorClip.w)*.5+.5;
        float validMirror=puddleReady*step(.002,min(min(mirrorUv.x,1.-mirrorUv.x),min(mirrorUv.y,1.-mirrorUv.y)))*step(0.,mirrorClip.w);
        ${flooded?`vec2 localWater=(vMapUv-.5)*vec2(.72,-2.);
        vec2 radial=(localWater-puddleCenter)/puddleBasin.xy;
        float a=atan(radial.y,radial.x), s=puddleBasin.z;
        float ridge=1.+.13*sin(3.*a+s)+.065*sin(5.*a-s*.4)+.04*cos(8.*a+.3*s);
        float distanceToShore=puddleBasin.w-length(radial)/ridge;
        diffuseColor.a*=smoothstep(-.015,.092,distanceToShore);
        float coating=1.;`:`float distanceToWet=10.;
        for(int i=0;i<${pits.length};i++){
          vec4 footprint=wetFootprints[i];
          vec2 delta=(localRoad*vec2(1.,-1.)-footprint.xy)/footprint.zw;
          distanceToWet=min(distanceToWet,length(delta));
        }
        float coating=(1.-smoothstep(.25,.76,roughnessFactor))*(1.-smoothstep(1.05,1.9,distanceToWet));`}
        if(coating*validMirror>.001){
          float facing=saturate(dot(normal,normalize(vViewPosition)));
          float fresnel=.0204+.9796*pow(1.-facing,5.);
          vec2 coarse=mirrorUv;
          ${flooded?`// Gentle capillary slopes break up the reflected eave at close range.
          vec2 metres=localWater/.012;
          vec2 slope=vec2(sin(metres.x*39.+metres.y*7.)+.41*sin(metres.y*47.-metres.x*13.),
                          cos(metres.x*9.-metres.y*32.)+.34*sin(metres.x*27.+metres.y*13.));
          float pixelWidth=max(fwidth(metres.x),fwidth(metres.y));
          coarse+=slope*(1.-smoothstep(.008,.06,pixelWidth))*.0029;`:
          `coarse+=normal.xy*.003*roughnessFactor;`}
          vec3 reflected=wetReflection(coarse,${flooded?'0.38':'2.8+4.*roughnessFactor'});
          // Subtract the probe's specular contribution where the locally
          // reflected wall, sky or roof replaces it. Preserve direct sunlight.
          outgoingLight=mix(outgoingLight,(totalDiffuse+totalEmissiveRadiance)*(1.-fresnel)+reflectedLight.directSpecular+reflected*fresnel,coating*validMirror);
        }
        #include <opaque_fragment>`);
    };
  }
  function attach(scene,city,pools) {
    const mobile=matchMedia('(pointer:coarse)').matches||navigator.deviceMemory<=4;
    const target=new T.WebGLRenderTarget(mobile?448:640,mobile?288:416,{type:T.HalfFloatType,depthBuffer:true});
    target.texture.name='旧街井盖旁的积水 · 实时倒影';
    uniforms.mirrorTexel.value.set(1/target.width,1/target.height);
    uniforms.puddleImage.value=target.texture;
    const mirror=new T.PerspectiveCamera(),normal=new T.Vector3(),point=new T.Vector3();
    const eye=new T.Vector3(),direction=new T.Vector3(),vertex=new T.Vector3(),plane=new T.Plane();
    const planeVS=new T.Vector4(),clipCorner=new T.Vector4(),clip=new T.Vector4();
    const inverse=new T.Matrix4(),previousWorld=new T.Matrix4(),previousProjection=new T.Matrix4();
    const orthoCrop=new T.Matrix4(),viewProjection=new T.Matrix4(),oldViewport=new T.Vector4();
    // These depressions sit in one level concrete pour. Their rims and beds
    // differ in depth, but the standing surfaces share the same height.
    const level=.004-pits[0].depth*pits[0].water;
    const regions=pits.map((pit,i)=>{
      const x=1.9*pit.rx,z=1.9*pit.rz;
      return {pool:pools[i],center:new T.Vector3(pit.x,level,pit.z),radius:Math.hypot(x,z),
        corners:[[-x,-z],[x,-z],[x,z],[-x,z]].map(([dx,dz])=>new T.Vector3(pit.x+dx,level,pit.z+dz))};
    });
    const visible=[];
    const frustum=new T.Frustum(),localSphere=new T.Sphere(),cityScale=city.getWorldScale(new T.Vector3()).x;
    let previousPhase=-1,phase=0,busy=false;
    const before=scene.onBeforeRender;
    scene.onBeforeRender=function(renderer,object,camera,renderTarget) {
      before.call(this,renderer,object,camera,renderTarget);
      if(busy||!camera.isPerspectiveCamera||camera.parent?.isCubeCamera)return;
      uniforms.puddleReady.value=0;
      if(phase<.70)return;
      point.set(0,level,0).applyMatrix4(city.matrixWorld);
      normal.set(0,1,0).transformDirection(city.matrixWorld);
      eye.setFromMatrixPosition(camera.matrixWorld);
      const elevation=normal.dot(vertex.copy(eye).sub(point));
      if(elevation<=0)return;
      viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection);
      visible.length=0;
      for(const region of regions){
        if(!region.pool.visible)continue;
        vertex.copy(region.center).applyMatrix4(city.matrixWorld);
        localSphere.set(vertex,region.radius*cityScale);
        if(eye.distanceTo(vertex)<.54*cityScale&&frustum.intersectsSphere(localSphere))visible.push(region);
      }
      if(!visible.length)return;
      if(!renderer.shadowMap.needsUpdate&&phase===previousPhase&&previousWorld.equals(camera.matrixWorld)&&previousProjection.equals(camera.projectionMatrix)){
        uniforms.puddleReady.value=1;return;
      }
      mirror.position.copy(eye).addScaledVector(normal,-2*elevation);
      camera.getWorldDirection(direction).reflect(normal);
      mirror.up.set(0,1,0).transformDirection(camera.matrixWorld).reflect(normal);
      mirror.lookAt(vertex.copy(mirror.position).add(direction));
      mirror.updateMatrixWorld();mirror.near=camera.near;mirror.far=camera.far;
      mirror.projectionMatrix.copy(camera.projectionMatrix);
      viewProjection.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);
      let minX=1,minY=1,maxX=-1,maxY=-1,crossesEye=false;
      for(const region of visible)for(const corner of region.corners){
        vertex.copy(corner).applyMatrix4(city.matrixWorld);
        clip.set(vertex.x,vertex.y,vertex.z,1).applyMatrix4(viewProjection);
        if(clip.w<camera.near){crossesEye=true;break;}
        minX=Math.min(minX,clip.x/clip.w);maxX=Math.max(maxX,clip.x/clip.w);
        minY=Math.min(minY,clip.y/clip.w);maxY=Math.max(maxY,clip.y/clip.w);
      }
      if(crossesEye){minX=minY=-1;maxX=maxY=1;}
      minX=Math.max(-1,minX-.045);maxX=Math.min(1,maxX+.045);
      minY=Math.max(-1,minY-.045);maxY=Math.min(1,maxY+.045);
      if(maxX-minX<.002||maxY-minY<.002)return;
      const w=maxX-minX,h=maxY-minY;
      orthoCrop.set(2/w,0,0,-(maxX+minX)/w, 0,2/h,0,-(maxY+minY)/h, 0,0,1,0, 0,0,0,1);
      mirror.projectionMatrix.premultiply(orthoCrop);
      matrix.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);
      // Oblique near-plane clipping also works when looking up the street
      // from very near the ground or when looking back from the upper landing.
      plane.setFromNormalAndCoplanarPoint(normal,point).applyMatrix4(mirror.matrixWorldInverse);
      planeVS.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
      inverse.copy(mirror.projectionMatrix).invert();
      clipCorner.set(Math.sign(planeVS.x)||1,Math.sign(planeVS.y)||1,1,1).applyMatrix4(inverse);
      const dot=planeVS.dot(clipCorner);
      if(dot<1e-6)return;
      planeVS.multiplyScalar(2/dot);
      const p=mirror.projectionMatrix.elements;
      p[2]=planeVS.x;p[6]=planeVS.y;p[10]=planeVS.z+1;p[14]=planeVS.w;
      mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();
      const oldTarget=renderer.getRenderTarget(),oldFace=renderer.getActiveCubeFace(),oldMip=renderer.getActiveMipmapLevel();
      const oldXR=renderer.xr.enabled,oldShadow=renderer.shadowMap.autoUpdate,oldNeeds=renderer.shadowMap.needsUpdate;
      renderer.getViewport(oldViewport);
      const hidden=pools.filter(pool=>pool.visible);
      busy=true;for(const pool of hidden)pool.visible=false;
      uniforms.puddleImage.value=null;
      try{
        renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
        renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,mirror);
        previousWorld.copy(camera.matrixWorld);previousProjection.copy(camera.projectionMatrix);previousPhase=phase;
        uniforms.puddleReady.value=1;
      }finally{
        for(const pool of hidden)pool.visible=true;
        busy=false;uniforms.puddleImage.value=target.texture;
        renderer.xr.enabled=oldXR;renderer.shadowMap.autoUpdate=oldShadow;renderer.shadowMap.needsUpdate=oldNeeds;
        renderer.setRenderTarget(oldTarget,oldFace,oldMip);
        if(!oldTarget)renderer.setViewport(oldViewport);
      }
    };
    return p=>{phase=p;};
  }
  return {finish,attach};
}
