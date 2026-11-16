// Fixed objects at the edge of the playing surface, measured in metres.
import * as T from 'three';

export function dressCourt(scene, beds, obstacles, textures) {
  const groups=new Map(), box=new T.BoxGeometry(1,1,1), pose=new T.Object3D();
  function material(color,roughness,metalness=0) {
    return new T.MeshStandardMaterial({color,roughness,metalness});
  }
  const stone=material(0xa29885,.92), iron=material(0x504f46,.66,.42);
  const dark=material(0x403b32,.94), clay=material(0x815744,.95);
  const timber=material(0xb9a189,.74), ballast=material(0x5c5140,1);
  timber.map=textures.oak;
  for(const mat of [stone,iron,clay,ballast]) {
    mat.bumpMap=textures.aggregate;mat.bumpScale=mat===iron?.0012:.004;
  }
  const bolts=material(0x7a7669,.47,.65), metalwork=new T.CylinderGeometry(.011,.013,.006,8);
  const boltPositions=[];
  // The pedestrian strip has joints at human scale. Keep the existing court
  // and channel lids exposed, and leave actual tree wells through the paving.
  const concrete=material(0xa5a394,.89);
  concrete.bumpMap=textures.aggregate;concrete.bumpScale=.005;
  concrete.onBeforeCompile=shader=>{
    shader.uniforms.mineral={value:textures.aggregate};
    shader.vertexShader='varying vec3 pavingPoint;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      pavingPoint=(instanceMatrix*vec4(transformed,1.)).xyz;`);
    shader.fragmentShader='varying vec3 pavingPoint;uniform sampler2D mineral;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float dust=texture2D(mineral,pavingPoint.xz*.47).g;
      float sand=texture2D(mineral,pavingPoint.xz*2.8).r;
      float tile=fract(sin(dot(floor(pavingPoint.xz/1.2),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=.91+.07*tile+.10*dust+.04*sand;`);
  };
  const stamp=document.createElement('canvas');stamp.width=stamp.height=64;
  const ctx=stamp.getContext('2d'), falloff=ctx.createRadialGradient(32,32,4,32,32,31);
  falloff.addColorStop(0,'rgba(29,22,17,.53)');falloff.addColorStop(.48,'rgba(32,26,20,.28)');
  falloff.addColorStop(1,'rgba(32,26,20,0)');ctx.fillStyle=falloff;ctx.fillRect(0,0,64,64);
  const footShade=new T.MeshBasicMaterial({map:new T.CanvasTexture(stamp),transparent:true,depthWrite:false});
  const footprint=new T.PlaneGeometry(.76,.95);
  function block(mat,x,y,z,w,h,d,yaw=0){
    pose.position.set(x,y,z);pose.scale.set(w,h,d);pose.rotation.set(0,yaw,0);pose.updateMatrix();
    if(!groups.has(mat))groups.set(mat,[]);
    groups.get(mat).push(pose.matrix.clone());
  }
  for(let row=0;row<4;row++)for(let col=0;col<34;col++){
    const x=-20.4+col*1.2,z=-10.08-row*1.2;
    if(beds.some(([tx,tz])=>Math.abs(x-tx)<1.65&&Math.abs(z-tz)<1.65))continue;
    block(concrete,x,-.078,z,1.187,.045,1.187);
  }
  // Cast-iron channel lids sit between the paving and the outer white boundary.
  // The ribs sit inside stone kerbs and a recessed bed, without overlaying the court.
  for(const z of [-9.28,9.28]){
    for(let i=0;i<53;i++){
      const x=-15.6+i*.6;
      for(const edge of [-.147,.147])block(stone,x,-.043,z+edge,.596,.11,.066);
    }
    block(dark,0,-.062,z,31.8,.09,.242);
    for(let i=0;i<318;i++){
      const x=-15.85+i*.1;
      block(iron,x,-.004,z,i%9===0?.045:.024,.025,.233);
    }
    for(const side of [-1,1])block(iron,0,-.003,z+side*.099,31.8,.029,.019);
  }
  const earthGeo=new T.CylinderGeometry(1.02,1.02,.095,24);
  for(const [x,z] of beds){
    const earth=new T.Mesh(earthGeo,ballast);earth.position.set(x,-.035,z);earth.receiveShadow=true;scene.add(earth);
    for(let i=0;i<18;i++){
      const angle=i*Math.PI/9;
      block(clay,x+Math.sin(angle)*1.06,.012,z+Math.cos(angle)*1.06,.357,.21,.16,angle);
    }
    obstacles.push([x,z,1.09,1.09]);
  }
  // Classroom-side rest area behind the baseline, with gaps at all the doors.
  for(const x of [-11.8,-2.6,8.6]){
    const z=-13.45;
    for(const end of [-.93,.93]){
      block(stone,x+end,.115,z,.22,.43,.49);
      block(iron,x+end,.39,z+.15,.052,.63,.06);
      const contact=new T.Mesh(footprint,footShade);
      contact.position.set(x+end,-.100,z);contact.rotation.x=-Math.PI/2;scene.add(contact);
    }
    for(let i=0;i<4;i++){
      const centre=z-.19+i*.124;
      block(timber,x,.343,centre,2.42,.072,.102);
      for(const foot of [-.93,.93])boltPositions.push([x+foot,.380,centre]);
    }
    for(let i=0;i<2;i++)block(timber,x,.56+i*.135,z+.205,2.42,.105,.047);
    obstacles.push([x,z,1.3,.47]);
  }
  for(const [mat,matrices] of groups){
    const mesh=new T.InstancedMesh(box,mat,matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
  }
  const fasteners=new T.InstancedMesh(metalwork,bolts,boltPositions.length);
  boltPositions.forEach(([x,y,z],index)=>fasteners.setMatrixAt(index,new T.Matrix4().makeTranslation(x,y,z)));
  fasteners.receiveShadow=true;scene.add(fasteners);
}
