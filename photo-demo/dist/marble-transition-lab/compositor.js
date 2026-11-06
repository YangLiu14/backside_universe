import * as THREE from 'three';
import {waveField} from './ocean-surface.js';
import {waterVolumeGLSL} from './under-desk-ocean.js';

// A continuous focus pull between registered rooms. No screen-space wipe.
// Core objects occupy the same depth and pose in both captures; the same model
// room remains behind the holiday, whose solid geometry reveals through orbit.
export function createCompositor(renderer,shared,realScene,dreamScene,holiday){
  const makeTarget=()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
  const real=makeTarget(),dream=makeTarget(),mask=new THREE.WebGLRenderTarget(1,1,{samples:4,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType)}),discovery=new THREE.WebGLRenderTarget(1,1,{samples:4,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType)});
  const black=new THREE.Color(0);
  const maskScene=new THREE.Scene();maskScene.background=new THREE.Color(0);maskScene.overrideMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
  const destinationMask=new THREE.MeshBasicMaterial({color:0x00ff00,side:THREE.DoubleSide,toneMapped:false});
  const uniforms={real:{value:real.texture},dream:{value:dream.texture},modelDepth:{value:dream.depthTexture},discovery:{value:discovery.texture},discoveryDepth:{value:discovery.depthTexture},objects:{value:mask.texture},objectDepth:{value:mask.depthTexture},handoff:{value:0},reveal:{value:0},angle:{value:0},resolution:{value:new THREE.Vector2()},ratio:{value:1},softness:{value:1},near:{value:.012},far:{value:30},focus:{value:1}};
  uniforms.seaAmount={value:0};uniforms.seaPlane={value:holiday.seaPlane};uniforms.worldFromClip={value:new THREE.Matrix4()};
  uniforms.clipFromWorld={value:new THREE.Matrix4()};
  uniforms.oceanPlanes={value:holiday.ocean.planes};uniforms.oceanTime=holiday.sea.clock;
  uniforms.oceanExtent={value:0};uniforms.oceanEye={value:new THREE.Vector3()};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D real,dream,modelDepth,objects,objectDepth,discovery,discoveryDepth;uniform float handoff,reveal,angle,ratio,softness,near,far,focus;uniform vec2 resolution;uniform float seaAmount;uniform vec4 seaPlane;uniform mat4 worldFromClip,clipFromWorld;
      ${waveField}
      ${waterVolumeGLSL}
      vec3 filtered(sampler2D image,float radius){return textureLod(image,clamp(vUv,vec2(.001),vec2(.999)),log2(max(1.,radius*ratio))).rgb;}
      vec3 mapped(vec3 color){
        // Same neutral display transform used by the original modeled scene.
        float x=min(color.r,min(color.g,color.b));float offset=x<.08?x-6.25*x*x:.04;color-=offset;
        float peak=max(color.r,max(color.g,color.b));if(peak<.76)return color;
        float newPeak=1.-.24*.24/(peak+.24-.76);color*=newPeak/peak;
        float g=1.-1./(.15*(peak-newPeak)+1.);return mix(color,vec3(newPeak),g);
      }
      float eyeDepth(float raw){return near*far/(far-raw*(far-near));}
      // Short screen-space rays pick up the coloured hulls and cliff faces
      // already in the modeled capture. Missing reflections retain the sky.
      vec3 reflectCoast(vec3 water,vec3 point,vec3 incoming,float wet){
        vec2 slope=swell(point.xz,oceanTime).yz;
        vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
        vec3 ray=reflect(incoming,n);
        for(int i=1;i<=12;i++){
          float leap=.009*float(i)+.0022*float(i*i);
          vec4 clip=clipFromWorld*vec4(point+vec3(0,.004,0)+leap*ray,1.);
          vec2 uv=clip.xy/clip.w*.5+.5;
          if(clip.w<=0. || any(lessThan(uv,vec2(.002))) || any(greaterThan(uv,vec2(.998))))break;
          float sampleDepth=textureLod(modelDepth,uv,0.).r;
          float behind=clip.w-eyeDepth(sampleDepth);
          if(behind>=0. && behind<.038){
            vec4 hit=worldFromClip*vec4(uv*2.-1.,sampleDepth*2.-1.,1.);
            if(dot(oceanPlanes[4],hit/hit.w)<-.009){
              float fresnel=pow(1.-max(dot(-incoming,n),0.),2.);
              float weight=(.24+.45*fresnel)*(1.-smoothstep(.19,.48,leap))*wet;
              return mix(water,mapped(textureLod(dream,uv,1.1).rgb)*vec3(.77,.92,.95),weight);
            }
          }
        }
        return water;
      }
      float sameSurface(float a,float b){
        float z=eyeDepth(b);
        return 1.-smoothstep(.0005,.0012,abs(eyeDepth(a)-z)/max(.6,z));
      }
      float visibleObject(vec2 uv){
        return texture2D(objects,uv).r*sameSurface(texture2D(objectDepth,uv).r,texture2D(modelDepth,uv).r);
      }
      void main(){
        if(handoff==0. && angle==0.){
          gl_FragColor=vec4(filtered(real,0.),1.);
          #include <colorspace_fragment>
          return;
        }
        float raw=texture2D(modelDepth,vUv).r,depth=near*far/(far-raw*(far-near));
        float islandRaw=texture2D(discoveryDepth,vUv).r;
        vec3 discoveryMask=texture2D(discovery,vUv).rgb;
        float visibleIsland=sameSurface(islandRaw,raw);
        float island=discoveryMask.r*visibleIsland,destination=discoveryMask.g*visibleIsland;
        vec2 dx=vec2(2.*ratio/resolution.x,0.),dy=vec2(0.,2.*ratio/resolution.y);
        float core=visibleObject(vUv),solid=core;
        solid=max(solid,max(visibleObject(vUv+dx),visibleObject(vUv-dx)));solid=max(solid,max(visibleObject(vUv+dy),visibleObject(vUv-dy)));
        float focusPull=smoothstep(20.,65.,angle);
        float coc=smoothstep(.20,.65,abs(depth-focus));
        float optical=softness*focusPull*(1.-smoothstep(.05,.7,max(solid,max(island,destination))));
        float blendSoft=pow(sin(handoff*3.14159),2.)*6.;
        float radius=optical*(coc*11.+blendSoft);
        vec4 world=worldFromClip*vec4(vUv*2.-1.,raw*2.-1.,1.);world/=world.w;
        float onSea=1.-smoothstep(.002,.005,abs(dot(seaPlane,world)));
        radius=mix(radius,min(radius,1.4),seaAmount*onSea);
        vec3 delta=world.xyz-oceanEye;float rayLength=length(delta);
        vec3 rd=delta/max(.00001,rayLength);float entry;
        float travel=waterSegment(rd,rayLength,entry);
        radius=mix(radius,min(radius,.7),smoothstep(.0,.035,travel));
        vec3 photographic=filtered(real,radius);
        vec3 modeled=mapped(filtered(dream,radius));
        // Photo-textured shared surfaces already contain exposure. Do not apply
        // the model's highlight rolloff to those same pixels a second time.
        modeled=mix(modeled,filtered(dream,0.),smoothstep(.4,.95,core));
        float waterPixel=onSea*smoothstep(.80,1.,seaAmount)*(1.-max(core,max(island,destination)));
        for(int i=0;i<4;i++)waterPixel*=smoothstep(-.0008,.0008,dot(oceanPlanes[i],vec4(world.xyz,1.)));
        if(waterPixel>.05 && dot(oceanPlanes[4],vec4(oceanEye,1.))<0.)
          modeled=reflectCoast(modeled,world.xyz,rd,waterPixel);
        if(travel>.00001)modeled=immerse(modeled,rd,entry,travel,rayLength);
        float amount=mix(handoff,max(handoff,reveal),island);
        vec3 color=mix(photographic,modeled,amount);
        gl_FragColor=vec4(color,1.);#include <colorspace_fragment>
      }`.replace(';#include',';\n#include')});
  const screen=new THREE.Scene();screen.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));const screenCamera=new THREE.Camera();let passes=0;
  function attach(parent){holiday.applyPass(parent===dreamScene);parent.add(shared.objects);realScene.add(shared.desktop);}
  function capture(target,parent,view){attach(parent);renderer.setRenderTarget(target);renderer.render(parent,view);passes++;}
  const focal=new THREE.Vector3();
  return{resize(w,h){const ratio=renderer.getPixelRatio(),W=Math.round(w*ratio),H=Math.round(h*ratio);for(const t of [real,dream,mask,discovery])t.setSize(W,H);uniforms.resolution.value.set(W,H);uniforms.ratio.value=ratio;},
    render(view,state,variant='transition',soft=true){
      const handoff=variant==='real'?0:variant==='dream'?1:state.handoff;
      uniforms.handoff.value=handoff;uniforms.angle.value=state.angle;uniforms.softness.value=soft?1:0;uniforms.near.value=view.near;uniforms.far.value=view.far;
      uniforms.reveal.value=variant==='real'?0:1;
      uniforms.clipFromWorld.value.multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse);
      uniforms.oceanEye.value.copy(view.position);uniforms.oceanExtent.value=holiday.ocean.extent;
      uniforms.seaAmount.value=state.sea;uniforms.worldFromClip.value.multiplyMatrices(view.matrixWorld,view.projectionMatrixInverse);
      uniforms.focus.value=-focal.set(.04,.89,-2.36).applyMatrix4(view.matrixWorldInverse).z;passes=0;
      if(handoff<1)capture(real,realScene,view);
      if(handoff===0&&state.angle===0){
        renderer.setRenderTarget(null);renderer.render(screen,screenCamera);passes++;
        return;
      }
      capture(dream,dreamScene,view);
      // The actual holiday geometry supplies its mask; depth comparison keeps
      // the laptop, book and cup in front. Room crossfade cannot ghost the island.
      const layers=view.layers.mask,background=dreamScene.background;
      view.layers.set(2);dreamScene.overrideMaterial=holiday.maskMaterial;dreamScene.background=black;
      renderer.setRenderTarget(discovery);renderer.render(dreamScene,view);passes++;
      if(holiday.grotto){
        const clear=renderer.autoClear;renderer.autoClear=false;view.layers.set(3);dreamScene.overrideMaterial=destinationMask;dreamScene.background=null;
        renderer.render(dreamScene,view);passes++;renderer.autoClear=clear;
      }
      view.layers.mask=layers;dreamScene.overrideMaterial=null;dreamScene.background=background;
      maskScene.add(shared.objects);renderer.setRenderTarget(mask);renderer.render(maskScene,view);passes++;
      attach(realScene);renderer.setRenderTarget(null);renderer.render(screen,screenCamera);passes++;
    },auditSourceFrame(view,state){
      const gl=renderer.getContext(),size=renderer.getDrawingBufferSize(new THREE.Vector2()),count=size.x*size.y*4;
      const before=new Uint8Array(count),after=new Uint8Array(count),visible=holiday.grotto.root.visible;
      holiday.grotto.root.visible=false;this.render(view,state,'transition',false);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,before);
      holiday.grotto.root.visible=visible;this.render(view,state,'transition',false);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,after);
      let changedPixels=0,maxChannelDifference=0;for(let i=0;i<count;i+=4){let changed=false;for(let c=0;c<3;c++){const d=Math.abs(before[i+c]-after[i+c]);maxChannelDifference=Math.max(maxChannelDifference,d);changed ||= d>0;}if(changed)changedPixels++;}
      return {width:size.x,height:size.y,changedPixels,maxChannelDifference,includesFullGrotto:true};
    },renderVisit(view){attach(dreamScene);renderer.setRenderTarget(null);renderer.render(dreamScene,view);attach(realScene);},get stats(){return{passes,handoff:uniforms.handoff.value,sharedGeometry:true,screenWipe:false,originalIsland:true};}};
}
