import * as T from '../vendor/three.module.js';

// Sample the solid angle of each real door and window once on entry. Direct
// sunlight and the room's practical lamps remain independently shadowed/lit.
export function roomSkyVolume(model,{w,h,d},openings,id,localToMetres){
  const nx=18,ny=12,nz=18,bytes=new Uint8Array(nx*ny*nz*4);
  const samples=[];
  for(const {x,y,z,dx,dz,width,height} of openings){
    const cols=Math.max(2,Math.ceil(width/.65)),rows=Math.max(2,Math.ceil(height/.65));
    const area=width*height/(cols*rows);
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const u=((i+.5)/cols-.5)*width;
      samples.push({x:x+dx*u,y:y+((j+.5)/rows-.5)*height,z:z+dz*u,dx,dz,area});
    }
  }
  let offset=0;
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const x=((i+.5)/nx-.5)*w,y=(j+.5)/ny*h,z=((k+.5)/nz-1)*d;
    let energy=0,vx=0,vy=0,vz=0;
    for(const s of samples){
      const rx=s.x-x,ry=s.y-y,rz=s.z-z;
      // The inn loft occludes apertures on the other storey.
      if(id==='inn'&&(s.y-2.85)*(y-2.85)<0)continue;
      const r2=rx*rx+ry*ry+rz*rz+s.area*.18,invR=1/Math.sqrt(r2);
      const weight=s.area*Math.abs(rx*s.dz-rz*s.dx)*invR/r2;
      energy+=weight;vx+=weight*rx*invR;vy+=weight*ry*invR;vz+=weight*rz*invR;
    }
    bytes[offset++]=Math.min(255,255*energy/(2*Math.PI));
    for(const v of [vx,vy,vz])bytes[offset++]=Math.round(127.5*(1+v/Math.max(energy,1e-6)));
  }
  const texture=new T.Data3DTexture(bytes,nx,ny,nz);
  texture.format=T.RGBAFormat;texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;
  const size=new T.Vector3(w,h,d),materials=new Set();
  const fromWorld=new T.Matrix4(),lastWorld=new T.Matrix4(),inverse=new T.Matrix4();
  if(localToMetres)lastWorld.elements.fill(NaN);
  model.traverse(mesh=>{if(mesh.isMesh)for(const material of [].concat(mesh.material))materials.add(material);});
  for(const mat of materials){
    if(!mat.isMeshStandardMaterial)continue;
    const previous=mat.onBeforeCompile,key=mat.customProgramCacheKey();
    if(localToMetres){
      const beforeDraw=mat.onBeforeRender;
      mat.onBeforeRender=function(...args){
        beforeDraw.apply(this,args);
        if(!lastWorld.equals(model.matrixWorld)){
          lastWorld.copy(model.matrixWorld);
          fromWorld.multiplyMatrices(localToMetres,inverse.copy(lastWorld).invert());
        }
      };
    }
    mat.customProgramCacheKey=()=>key+'-aperture-volume-v2';
    mat.onBeforeCompile=function(shader,renderer){
      previous.call(this,shader,renderer);
      shader.uniforms.roomFromWorld={value:fromWorld};shader.uniforms.roomExtent={value:size};shader.uniforms.roomSky={value:texture};
      shader.vertexShader='uniform mat4 roomFromWorld; uniform vec3 roomExtent; varying vec3 roomSkyPoint;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 roomPosition=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          roomPosition=instanceMatrix*roomPosition;
        #endif
        roomSkyPoint=(roomFromWorld*modelMatrix*roomPosition).xyz/roomExtent+vec3(.5,0.,1.);`);
      shader.fragmentShader='uniform mat4 roomFromWorld; varying vec3 roomSkyPoint; uniform highp sampler3D roomSky;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
        vec4 aperture=texture(roomSky,clamp(roomSkyPoint,0.,1.));
        vec3 toWindow=aperture.gba*2.-1.;
        float facing=dot(normalize(mat3(roomFromWorld)*inverseTransformDirection(normal,viewMatrix)),toWindow);
        float sky=clamp(.27+1.7*sqrt(aperture.r)*(.76+.46*facing),.27,1.23);
        reflectedLight.indirectDiffuse*=sky;
        reflectedLight.indirectSpecular*=clamp(.41+.93*sqrt(aperture.r),.41,1.);`);
    };
    mat.needsUpdate=true;
  }
  return texture;
}
