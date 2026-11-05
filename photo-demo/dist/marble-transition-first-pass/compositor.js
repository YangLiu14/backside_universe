import * as THREE from 'three';

export function createCompositor(renderer,shared,realScene,dreamScene) {
  const makeTarget=(mipmap=false)=>new THREE.WebGLRenderTarget(1,1,{
    type:THREE.HalfFloatType,samples:4,depthBuffer:true,
    generateMipmaps:mipmap,minFilter:mipmap?THREE.LinearMipmapLinearFilter:THREE.LinearFilter,
  });
  const real=makeTarget(true),dream=makeTarget(true),mask=makeTarget();
  const maskScene=new THREE.Scene();maskScene.background=new THREE.Color(0);
  maskScene.overrideMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
  const uniforms={real:{value:real.texture},dream:{value:dream.texture},objects:{value:mask.texture},
    handoff:{value:0},resolution:{value:new THREE.Vector2(1,1)},ratio:{value:1},softness:{value:1}};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D real,dream,objects;
      uniform float handoff,ratio,softness;uniform vec2 resolution;
      vec3 filtered(sampler2D image,float radius){
        return textureLod(image,vUv,log2(max(1.,radius*ratio))).rgb;
      }
      void main(){
        if(handoff<=0.){gl_FragColor=vec4(texture2D(real,vUv).rgb,1.);}
        else if(handoff>=1.){gl_FragColor=vec4(texture2D(dream,vUv).rgb,1.);}
        else{
          float front=mix(-.15,1.15,handoff);
          float shape=vUv.x+.045*sin(vUv.y*3.14159);
          float distance=(front-shape)*resolution.x/ratio;
          float blend=smoothstep(-12.,12.,distance);
          float band=exp(-pow(distance/90.,2.))*smoothstep(0.,.08,handoff)*(1.-smoothstep(.92,1.,handoff));
          vec2 dx=vec2(2.5*ratio/resolution.x,0.),dy=vec2(0.,2.5*ratio/resolution.y);
          float solid=texture2D(objects,vUv).r;
          solid=max(solid,max(texture2D(objects,vUv+dx).r,texture2D(objects,vUv-dx).r));
          solid=max(solid,max(texture2D(objects,vUv+dy).r,texture2D(objects,vUv-dy).r));
          float radius=(band*12.+3.5*sin(handoff*3.14159))*softness*(1.-smoothstep(.05,.7,solid));
          gl_FragColor=vec4(mix(filtered(real,radius),filtered(dream,radius),blend),1.);
        }
        #include <colorspace_fragment>
      }`});
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
  const camera=new THREE.Camera();let passCount=0;
  // Only solid objects cross passes. The real repaired patch stays in the real
  // room; the model uses a complete top matched to neutral desktop samples.
  function attach(parent){parent.add(shared.objects);realScene.add(shared.desktop);}
  function capture(target,parent,view){attach(parent);renderer.setRenderTarget(target);renderer.render(parent,view);passCount++;}
  return {
    resize(w,h){const ratio=renderer.getPixelRatio(),W=Math.round(w*ratio),H=Math.round(h*ratio);for(const t of [real,dream,mask])t.setSize(W,H);uniforms.resolution.value.set(W,H);uniforms.ratio.value=ratio;},
    render(view,state,variant='transition',soft=true){
      const handoff=variant==='real'?0:variant==='dream'?1:state.handoff;
      uniforms.handoff.value=handoff;uniforms.softness.value=soft?1:0;passCount=0;
      if(handoff<1)capture(real,realScene,view);
      if(handoff>0)capture(dream,dreamScene,view);
      if(handoff>0&&handoff<1){maskScene.add(shared.objects);renderer.setRenderTarget(mask);renderer.render(maskScene,view);passCount++;}
      attach(realScene);renderer.setRenderTarget(null);renderer.render(scene,camera);passCount++;
    },
    get stats(){return {passes:passCount,handoff:uniforms.handoff.value,sharedGeometry:true,softBandCssPx:180,maxBlurCssPx:15.5};},
  };
}
