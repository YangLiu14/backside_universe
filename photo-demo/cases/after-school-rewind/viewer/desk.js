// Continue the source camera through the object replacement, with a clean plate behind the mesh.
import * as T from 'three';

export async function classroom(scene, room, alignment) {
  const loader = new T.TextureLoader();
  const [photo, clean, grain, depths] = await Promise.all([
    loader.loadAsync('photo.jpg'), loader.loadAsync('desk.jpg'), loader.loadAsync('grain.jpg'),
    fetch('desk-depth.bin').then(r => r.arrayBuffer()).then(buffer => new Float32Array(buffer))
  ]);
  for (const tex of [photo,clean,grain]) tex.colorSpace=T.SRGBColorSpace;
  grain.wrapS=grain.wrapT=T.MirroredRepeatWrapping;grain.repeat.set(32,45);grain.anisotropy=8;
  const normal=new T.Vector3(...alignment.deskNormal);
  const plane=new T.Mesh(new T.PlaneGeometry(12,12),new T.MeshBasicMaterial({map:grain,color:0xe0d8cb,toneMapped:false,side:T.FrontSide}));
  plane.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);
  plane.position.copy(normal).multiplyScalar(-alignment.deskConstant-.0008);
  scene.add(plane);
  const [fx,fy,cx,cy]=room.intrinsics;
  const nx=120,ny=66,pos=[],uv=[],index=[];
  for(let y=0;y<ny;y++) for(let x=0;x<nx;x++){
    const i=y*nx+x,u=x/(nx-1),v=y/(ny-1),z=depths[i];
    pos.push((u*room.width-cx)*z/fx,(cy-v*room.height)*z/fy,-z);uv.push(u,1-v);
    if(x&&y){const a=i-nx-1;index.push(a,a+nx,a+1,a+1,a+nx,i);}
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(index);
  const plateMat=new T.MeshBasicMaterial({map:clean,side:T.DoubleSide,toneMapped:false,depthTest:false,depthWrite:false});
  const coverage={value:1};
  // Blend in the opaque render queue before subject meshes, so the plate cannot cover them.
  plateMat.blending=T.CustomBlending;plateMat.blendSrc=T.SrcAlphaFactor;
  plateMat.blendDst=T.OneMinusSrcAlphaFactor;plateMat.blendEquation=T.AddEquation;
  plateMat.onBeforeCompile=shader=>{
    shader.uniforms.coverage=coverage;
    shader.fragmentShader='uniform float coverage;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a=coverage;');
  };
  const panorama=await loader.loadAsync('ambient.jpg');
  panorama.colorSpace=T.SRGBColorSpace;panorama.mapping=T.EquirectangularReflectionMapping;
  scene.background=panorama;scene.backgroundIntensity=.94;
  scene.backgroundRotation.setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),normal));
  plane.renderOrder=-100;
  const plate=new T.Mesh(geo,plateMat);plate.renderOrder=-90;scene.add(plate);
  // Draw a solid contact shadow on top of the wood, including the narrow support at the pencil point.
  const stamp=document.createElement('canvas');stamp.width=stamp.height=128;
  const ctx=stamp.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,63);
  g.addColorStop(0,'rgba(25,18,11,.73)');g.addColorStop(.45,'rgba(33,20,12,.4)');g.addColorStop(1,'rgba(25,18,12,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const smap=new T.CanvasTexture(stamp);smap.colorSpace=T.SRGBColorSpace;
  const shellRotation=new T.Matrix3().set(...alignment.matrix.flat());
  function contactShadow(p,width,height){
    const world=new T.Vector3(...p).applyMatrix3(shellRotation).multiplyScalar(alignment.unit).add(new T.Vector3(...alignment.position));
    world.addScaledVector(normal,-(world.dot(normal)+alignment.deskConstant)+.0001);
    const m=new T.Mesh(new T.PlaneGeometry(width*alignment.unit,height*alignment.unit),new T.MeshBasicMaterial({map:smap,transparent:true,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
    m.position.copy(world);m.quaternion.copy(plane.quaternion);m.renderOrder=-42;scene.add(m);return m;
  }
  const baseShadow=contactShadow([0,-alignment.height/2,0],110,22),pointShadow=contactShadow(alignment.tip,11,5);
  const project=p=>p.addScaledVector(normal,-p.dot(normal)-alignment.deskConstant+.0001);
  function shadows(assembly){
    const x=assembly.longAxis().projectOnPlane(normal).normalize(),y=normal.clone().cross(x);
    baseShadow.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,normal));
    baseShadow.position.copy(project(assembly.footPoint()));
    const tip=assembly.tipPoint(),height=tip.dot(normal)+alignment.deskConstant;
    pointShadow.position.copy(project(tip));pointShadow.material.opacity=1-T.MathUtils.smoothstep(height,0,.035);
  }
  const alpha={value:1},sourceK=new T.Vector4(fx/room.width,fy/room.height,cx/room.width,1-cy/room.height);
  const projectionMaterials=new Set();
  function registerSource(root){
    root.traverse(obj=>{if(!obj.isMesh)return;
      for(const mat of [].concat(obj.material)){
        if(projectionMaterials.has(mat))continue;projectionMaterials.add(mat);
        const old=mat.onBeforeCompile.bind(mat);
        mat.onBeforeCompile=shader=>{
          old(shader);Object.assign(shader.uniforms,{sourceMix:alpha,sourceK:{value:sourceK},sourcePhoto:{value:photo}});
          shader.vertexShader='varying vec3 sourcePt;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nsourcePt=(modelMatrix*vec4(transformed,1.)).xyz;');
          shader.fragmentShader='varying vec3 sourcePt; uniform vec4 sourceK;uniform sampler2D sourcePhoto;uniform float sourceMix;\n'+shader.fragmentShader.replace('#include <tonemapping_fragment>','#include <tonemapping_fragment>\nvec2 suv=sourcePt.xy/max(.0001,-sourcePt.z)*sourceK.xy+sourceK.zw;gl_FragColor.rgb=mix(gl_FragColor.rgb,texture2D(sourcePhoto,suv).rgb,sourceMix);');
        };mat.needsUpdate=true;
      }
    });
  }
  return {registerSource,update(p,assembly){shadows(assembly);coverage.value=1-T.MathUtils.smoothstep(p,.445,.555);plate.visible=coverage.value>.001;alpha.value=1-T.MathUtils.smoothstep(p,.42,.62);}};
}
