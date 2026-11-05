import * as THREE from 'three';

// A continuous focus pull between registered rooms. No screen-space wipe.
// Core objects occupy the same depth and pose in both captures; the same model
// room remains behind the holiday, whose solid geometry reveals through orbit.
export function createCompositor(renderer,shared,realScene,dreamScene){
  const makeTarget=()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
  const real=makeTarget(),dream=makeTarget(),mask=makeTarget(),discovery=makeTarget();
  const maskScene=new THREE.Scene();maskScene.background=new THREE.Color(0);maskScene.overrideMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
  const uniforms={real:{value:real.texture},dream:{value:dream.texture},modelDepth:{value:dream.depthTexture},discovery:{value:discovery.texture},discoveryDepth:{value:discovery.depthTexture},objects:{value:mask.texture},handoff:{value:0},reveal:{value:0},angle:{value:0},resolution:{value:new THREE.Vector2()},ratio:{value:1},softness:{value:1},near:{value:.012},far:{value:30},focus:{value:1}};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D real,dream,modelDepth,objects,discovery,discoveryDepth;uniform float handoff,reveal,angle,ratio,softness,near,far,focus;uniform vec2 resolution;
      vec3 filtered(sampler2D image,float radius){return textureLod(image,clamp(vUv,vec2(.001),vec2(.999)),log2(max(1.,radius*ratio))).rgb;}
      vec3 mapped(vec3 color){
        // Same neutral display transform used by the original modeled scene.
        float x=min(color.r,min(color.g,color.b));float offset=x<.08?x-6.25*x*x:.04;color-=offset;
        float peak=max(color.r,max(color.g,color.b));if(peak<.76)return color;
        float newPeak=1.-.24*.24/(peak+.24-.76);color*=newPeak/peak;
        float g=1.-1./(.15*(peak-newPeak)+1.);return mix(color,vec3(newPeak),g);
      }
      void main(){
        float raw=texture2D(modelDepth,vUv).r,depth=near*far/(far-raw*(far-near));
        float islandRaw=texture2D(discoveryDepth,vUv).r;
        float island=texture2D(discovery,vUv).r*step(abs(islandRaw-raw),.000025);
        vec2 dx=vec2(2.*ratio/resolution.x,0.),dy=vec2(0.,2.*ratio/resolution.y);
        float solid=texture2D(objects,vUv).r;
        solid=max(solid,max(texture2D(objects,vUv+dx).r,texture2D(objects,vUv-dx).r));solid=max(solid,max(texture2D(objects,vUv+dy).r,texture2D(objects,vUv-dy).r));
        float focusPull=smoothstep(20.,65.,angle);
        float coc=smoothstep(.20,.65,abs(depth-focus));
        float optical=softness*focusPull*(1.-smoothstep(.05,.7,max(solid,island)));
        float blendSoft=pow(sin(handoff*3.14159),2.)*6.;
        float radius=optical*(coc*11.+blendSoft);
        vec3 photographic=filtered(real,radius);
        vec3 modeled=mapped(filtered(dream,radius));
        // Photo-textured shared surfaces already contain exposure. Do not apply
        // the model's highlight rolloff to those same pixels a second time.
        modeled=mix(modeled,filtered(dream,0.),smoothstep(.4,.95,solid));
        float amount=mix(handoff,max(handoff,reveal),island);
        vec3 color=mix(photographic,modeled,amount);
        gl_FragColor=vec4(color,1.);#include <colorspace_fragment>
      }`.replace(';#include',';\n#include')});
  const screen=new THREE.Scene();screen.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));const screenCamera=new THREE.Camera();let passes=0;
  function attach(parent){parent.add(shared.objects);realScene.add(shared.desktop);}
  function capture(target,parent,view){attach(parent);renderer.setRenderTarget(target);renderer.render(parent,view);passes++;}
  const focal=new THREE.Vector3();
  return{resize(w,h){const ratio=renderer.getPixelRatio(),W=Math.round(w*ratio),H=Math.round(h*ratio);for(const t of [real,dream,mask,discovery])t.setSize(W,H);uniforms.resolution.value.set(W,H);uniforms.ratio.value=ratio;},
    render(view,state,variant='transition',soft=true){
      const handoff=variant==='real'?0:variant==='dream'?1:state.handoff;
      uniforms.handoff.value=handoff;uniforms.angle.value=state.angle;uniforms.softness.value=soft?1:0;uniforms.near.value=view.near;uniforms.far.value=view.far;
      uniforms.reveal.value=variant==='real'?0:variant==='dream'?1:THREE.MathUtils.smoothstep(state.angle,22,48);
      uniforms.focus.value=-focal.set(.04,.89,-2.36).applyMatrix4(view.matrixWorldInverse).z;passes=0;
      if(handoff<1)capture(real,realScene,view);
      capture(dream,dreamScene,view);
      // The actual holiday geometry supplies its mask; depth comparison keeps
      // the laptop, book and cup in front. Room crossfade cannot ghost the island.
      const layers=view.layers.mask,background=dreamScene.background;
      view.layers.set(2);dreamScene.overrideMaterial=maskScene.overrideMaterial;dreamScene.background=new THREE.Color(0);
      renderer.setRenderTarget(discovery);renderer.render(dreamScene,view);passes++;
      view.layers.mask=layers;dreamScene.overrideMaterial=null;dreamScene.background=background;
      maskScene.add(shared.objects);renderer.setRenderTarget(mask);renderer.render(maskScene,view);passes++;
      attach(realScene);renderer.setRenderTarget(null);renderer.render(screen,screenCamera);passes++;
    },get stats(){return{passes,handoff:uniforms.handoff.value,sharedGeometry:true,screenWipe:false,originalIsland:true};}};
}
