import * as T from 'three';

// The panorama's measured sun and the direct light share this world direction.
export const campusSun = new T.Vector3(-32, 13, -15);
export const campusSunColor = 0xffcf92;
export const campusSunIntensity = 2.8;

export function createCampusSky(renderer, source) {
  // The generated plate is latlong. Blend an overlapping strip around its
  // wrap, and collapse longitude at each pole before converting it to a cube.
  // Background, glazing and diffuse illumination then sample the SAME cube.
  const longitude=((.594366-.05)/.9-.5)*Math.PI*2, latitude=(.5-.355428)*Math.PI;
  const direction=campusSun.clone().normalize(),azimuth=Math.atan2(direction.z,direction.x);
  // Yaw alone preserves north/up. A spherical from/to rotation would also
  // roll the horizon; remap elevation monotonically with fixed horizon/poles.
  const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),azimuth-longitude);
  const elevationCurve=Math.log(latitude/(Math.PI/2))/Math.log(Math.asin(direction.y)/(Math.PI/2));
  const material=new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,toneMapped:false,
    uniforms:{plate:{value:source},elevationCurve:{value:elevationCurve},worldToPlate:{value:new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(rotation))}},
    vertexShader:`varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D plate;uniform mat3 worldToPlate;uniform float elevationCurve;varying vec3 ray;
      vec3 sky(vec2 uv){
        float u=fract(uv.x), seam=u>.5?u-1.:u;
        // Bake level zero explicitly. Implicit derivatives of atan/fract at
        // the panorama wrap otherwise select a blurred mip for a one-pixel
        // strip, leaving a bright line even though the colors are continuous.
        vec3 base=textureLod(plate,vec2(.05+.9*u,uv.y),0.).rgb;
        if(abs(seam)<.05){
          vec3 left=textureLod(plate,vec2(.05+.9*seam,uv.y),0.).rgb;
          vec3 right=textureLod(plate,vec2(.95+.9*seam,uv.y),0.).rgb;
          base=mix(right,left,smoothstep(-.05,.05,seam));
        }
        vec3 pole=textureLod(plate,vec2(.5,uv.y),0.).rgb;
        return mix(base,pole,smoothstep(.92,1.,abs(2.*uv.y-1.)));
      }
      void main(){
        vec3 d=normalize(worldToPlate*normalize(ray));
        float elevation=asin(clamp(d.y,-1.,1.))/1.57079632679;
        elevation=sign(elevation)*pow(abs(elevation),elevationCurve);
        vec2 uv=vec2(atan(d.z,d.x)/6.28318530718+.5,elevation*.5+.5);
        vec3 radiance=sky(uv);
        gl_FragColor=vec4(radiance*1.08,1.);
      }`
  });
  const dome=new T.Mesh(new T.SphereGeometry(2,48,24),material),scene=new T.Scene();scene.add(dome);
  const target=new T.WebGLCubeRenderTarget(innerWidth<650?512:1024,{type:T.HalfFloatType,generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});
  const camera=new T.CubeCamera(.1,5,target);
  camera.update(renderer,scene);
  dome.geometry.dispose();material.dispose();
  return {texture:target.texture,dispose:()=>target.dispose()};
}
