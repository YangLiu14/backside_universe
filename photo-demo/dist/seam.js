import * as THREE from 'three';

// Mixed edges fit inside the optical softness, rather than retaining two crisp
// silhouettes across a wide crossfade. CSS-pixel widths are stable across DPR.
export const HANDOFF={feather:6,softBand:42,blur:14};
export function createSeamRenderer(renderer,{discoveryGroups=[],shadowLight=null}={}){
  const makeTarget=()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),samples:4,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
  const base=makeTarget(),world=makeTarget();
  const uniforms={base:{value:base.texture},world:{value:world.texture},worldDepth:{value:world.depthTexture},progress:{value:0},reveal:{value:0},discovery:{value:0},discoveryPass:{value:0},resolution:{value:new THREE.Vector2()},pixelRatio:{value:1},near:{value:.01},far:{value:80},focus:{value:5},reduced:{value:0},inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()}};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      varying vec2 vUv; uniform sampler2D base,world,worldDepth;
      uniform float progress,reveal,discovery,discoveryPass,pixelRatio,near,far,focus,reduced;
      uniform vec2 resolution; uniform mat4 inverseProjection,cameraWorld;
      vec3 softened(sampler2D tex,vec2 uv,float radius){
        if(radius<.65)return texture2D(tex,uv).rgb;
        // A prefiltered pyramid integrates every pixel in the footprint.
        // Sparse, widely spaced taps made thin edges look like repeated copies.
        float level=log2(max(1.,radius*pixelRatio*1.35));
        return textureLod(tex,clamp(uv,vec2(.001),vec2(.999)),level).rgb;
      }
      void main(){
        float raw=texture2D(worldDepth,vUv).x;
        float depth=near*far/(far-raw*(far-near));
        // Keep the whole tabletop in focus; surrounding room gently falls away.
        float defocus=smoothstep(max(.65,focus*.07),max(2.,focus*.20),abs(depth-focus));
        float roomBlur=defocus*13.*smoothstep(.12,.40,progress)*(1.-reduced*.75);
        vec3 color;
        if(discoveryPass>.5){
          vec4 viewPoint=inverseProjection*vec4(vUv*2.-1.,raw*2.-1.,1.);
          vec3 worldPoint=(cameraWorld*vec4(viewPoint.xyz/viewPoint.w,1.)).xyz;
          float delay=clamp((worldPoint.x+.3)/2.1,0.,1.)*.78;
          float amount=smoothstep(delay,delay+.22,discovery);
          // Both captures have identical camera/object transforms. New scenery
          // and its shadows enter continuously, preserving true solid occlusion.
          color=mix(softened(base,vUv,roomBlur),softened(world,vUv,roomBlur),amount);
          #ifdef TONE_MAPPING
            color=toneMapping(color);
          #endif
        }else if(reveal>=1.){
          color=softened(world,vUv,roomBlur);
          #ifdef TONE_MAPPING
            color=toneMapping(color);
          #endif
        }else{
          float fold=vUv.x+.075*sin(vUv.y*3.14159)+.06*(vUv.y-.5);
          float edge=mix(1.2,-.2,reveal);
          float distance=(fold-edge)*resolution.x/pixelRatio;
          float mask=smoothstep(-${HANDOFF.feather.toFixed(1)},${HANDOFF.feather.toFixed(1)},distance);
          float boundary=exp(-pow(distance/${HANDOFF.softBand.toFixed(1)},2.))*smoothstep(0.,.06,reveal)*(1.-smoothstep(.94,1.,reveal));
          float softness=boundary*${HANDOFF.blur.toFixed(1)}*(1.-reduced*.7);
          vec3 real=softened(base,vUv,softness+roomBlur);
          vec3 dream=mask>0.?softened(world,vUv,softness+roomBlur):vec3(0.);
          #ifdef TONE_MAPPING
            dream=toneMapping(dream);
          #endif
          color=mix(real,dream,mask);
        }
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  });
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));const camera=new THREE.Camera();
  // Room and holiday each retain a static shadow map. Reusing them avoids two
  // shadow renders per frame and makes scrubbing independent of prior frames.
  const shadowMaps={room:null,holiday:null};let active='room';
  function renderWorld(target,worldScene,view,showHoliday){
    active=showHoliday?'holiday':'room';
    for(const group of discoveryGroups)group.visible=showHoliday;
    if(shadowLight){shadowLight.shadow.map=shadowMaps[active];renderer.shadowMap.needsUpdate=!shadowMaps[active];}
    renderer.setRenderTarget(target);renderer.render(worldScene,view);
    if(shadowLight)shadowMaps[active]=shadowLight.shadow.map;
  }
  return {
    resize(w,h){const ratio=renderer.getPixelRatio();base.setSize(Math.round(w*ratio),Math.round(h*ratio));world.setSize(Math.round(w*ratio),Math.round(h*ratio));uniforms.resolution.value.set(w*ratio,h*ratio);uniforms.pixelRatio.value=ratio;},
    render(photoScene,worldScene,view,state,focus,reduced){
      uniforms.progress.value=state.progress;uniforms.reveal.value=state.seam;uniforms.discovery.value=state.holiday;uniforms.focus.value=focus;uniforms.reduced.value=reduced?1:0;
      uniforms.near.value=view.near;uniforms.far.value=view.far;view.updateMatrixWorld();uniforms.inverseProjection.value.copy(view.projectionMatrixInverse);uniforms.cameraWorld.value.copy(view.matrixWorld);
      const discovering=state.seam===1&&state.holiday>0&&state.holiday<1;uniforms.discoveryPass.value=discovering?1:0;
      if(state.seam<1){renderer.setRenderTarget(base);renderer.render(photoScene,view);}
      else if(discovering)renderWorld(base,worldScene,view,false);
      // World depth is also needed for the matched focus on the photograph.
      renderWorld(world,worldScene,view,state.seam===1&&state.holiday>0);
      renderer.setRenderTarget(null);renderer.render(scene,camera);
    },
    renderReference(worldScene,view){renderWorld(null,worldScene,view,false);},
    get stats(){return {activeShadow:active,shadowCaches:Object.values(shadowMaps).filter(Boolean).length,featherCssPx:HANDOFF.feather*2,softBandCssPx:HANDOFF.softBand};}
  };
}
