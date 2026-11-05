import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Fixed scenery in the registered Marble world. The camera discovers it; no
// object grows, changes its anchor, or follows the viewer during the handoff.
export async function createHoliday(scene,meta,registeredObjects) {
  const group=new THREE.Group();group.name='A coastline connecting three familiar objects';scene.add(group);
  const R=new THREE.Matrix3().set(...meta.source_camera_to_world.flat());
  const normal=new THREE.Vector3(...meta.support_plane).applyMatrix3(R);
  const constant=1+normal.dot(new THREE.Vector3(...meta.source_camera_position));
  const surface=(x,z)=>(constant-normal.x*x-normal.z*z)/normal.y;
  const sourceWorld=new THREE.Matrix4().set(
    ...meta.source_camera_to_world[0],meta.source_camera_position[0],
    ...meta.source_camera_to_world[1],meta.source_camera_position[1],
    ...meta.source_camera_to_world[2],meta.source_camera_position[2],0,0,0,1);
  const sourceView=sourceWorld.clone().invert(),K=new THREE.Vector4(...meta.intrinsics);
  const sourcePhoto=await new THREE.TextureLoader().loadAsync('../assets/desk-original.jpg');
  sourcePhoto.colorSpace=THREE.SRGBColorSpace;sourcePhoto.minFilter=THREE.LinearFilter;sourcePhoto.generateMipmaps=false;
  const mat=(color,roughness=.8,extra={})=>new THREE.MeshStandardMaterial({color,roughness,...extra});
  const sand=mat('#cabfa5'),ivory=mat('#e0d5b8'),wood=mat('#a17c53'),dark=mat('#655640'),leaf=mat('#69815d',.9,{side:THREE.DoubleSide});
  const teal=mat('#357a7a'),orange=mat('#bd845e'),cream=mat('#eee0bb');
  const mesh=(geometry,material,position,parent=group)=>{const o=new THREE.Mesh(geometry,material);o.position.set(...position);o.castShadow=o.receiveShadow=true;parent.add(o);return o;};
  const box=(size,material,position,parent)=>mesh(new THREE.BoxGeometry(...size),material,position,parent);
  function rod(a,b,r,material,parent=group){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);const m=mesh(new THREE.CylinderGeometry(r,r,d.length(),7),material,A.add(B).multiplyScalar(.5).toArray(),parent);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
  function slab(points,height,thickness,material){
    const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:true,bevelSegments:3,bevelSize:.004,bevelThickness:.002,curveSegments:16});g.rotateX(-Math.PI/2);
    const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+surface(p.getX(i),p.getZ(i))+height);g.computeVertexNormals();
    return mesh(g,material,[0,0,0]);
  }

  // A complete table supplies the rear view after the captured room retires.
  // Its top follows the same support plane and clean neutral color samples.
  const plane=new THREE.Vector3(...meta.support_plane);
  const corners=[[138,781],[862,668],[1001,794],[196,938]].map(([u,v])=>{
    const ray=new THREE.Vector3((u-K.z)/K.x,(v-K.w)/K.y,1);ray.multiplyScalar(1/plane.dot(ray));return ray.applyMatrix4(sourceWorld);
  });
  const along=corners[1].clone().sub(corners[0]).setY(0).normalize(),front=new THREE.Vector3(-along.z,0,along.x);
  // The photographed front/side edges remain registered. A rear extension
  // supports the invented coast, instead of replacing the desk with an axis box.
  corners[0].addScaledVector(front,-.55);corners[1].addScaledVector(front,-.55);
  corners[1].addScaledVector(along,.25);
  const top=new THREE.Shape();
  corners.forEach((p,i)=>{
    const enter=p.clone().lerp(corners[(i+3)%4],.055),leave=p.clone().lerp(corners[(i+1)%4],.055);
    if(i===0)top.moveTo(enter.x,-enter.z);else top.lineTo(enter.x,-enter.z);
    top.quadraticCurveTo(p.x,-p.z,leave.x,-leave.z);
  });top.closePath();
  const tableGeo=new THREE.ExtrudeGeometry(top,{depth:.038,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:4,curveSegments:16});tableGeo.rotateX(-Math.PI/2);
  const tp=tableGeo.attributes.position;for(let i=0;i<tp.count;i++)tp.setY(i,tp.getY(i)+surface(tp.getX(i),tp.getZ(i))-.044);tableGeo.computeVertexNormals();
  const tableMat=new THREE.MeshBasicMaterial({color:'#bdb5ac'});
  tableMat.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 tabletopWorld;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntabletopWorld=(modelMatrix*vec4(position,1.)).xyz;');
    s.fragmentShader='varying vec3 tabletopWorld;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float warm=smoothstep(-2.9,-1.6,tabletopWorld.z);
      diffuseColor.rgb*=.94+.075*warm;
      float laptopShade=exp(-pow((tabletopWorld.x+.10)/.20,2.)-pow((tabletopWorld.z+2.10)/.18,2.));
      float cupShade=exp(-pow((tabletopWorld.x-.26)/.067,2.)-pow((tabletopWorld.z+2.17)/.062,2.));
      diffuseColor.rgb*=1.-.11*laptopShade-.10*cupShade;
      diffuseColor.rgb*=1.+.0015*sin(tabletopWorld.x*620.)*sin(tabletopWorld.z*690.);`);
  };
  const table=mesh(tableGeo,tableMat,[0,0,0]);table.name='Complete desk on the registered support plane';
  const furniture=mat('#b6b5aa');
  for(const x of [-.78,.46]){box([.045,.73,.05],furniture,[x,.44,-2.25]);box([.14,.045,.65],furniture,[x,.055,-2.22]);}
  box([1.25,.53,.035],furniture,[-.15,.53,-2.36]);
  const floor=mesh(new THREE.PlaneGeometry(18,18),mat('#b5b5a8'),[0,.002,-2.2]);floor.rotation.x=-Math.PI/2;
  const rug=mesh(new THREE.PlaneGeometry(2.8,2.2),mat('#687c80'),[-.1,.006,-1.7]);rug.rotation.x=-Math.PI/2;
  // A registered, fixed curtain plane keeps the room's visual orientation
  // through the seam. It is single sided: rear exploration looks away from it.
  const roomRetention={value:1};
  const curtainMat=new THREE.ShaderMaterial({uniforms:{sourcePhoto:{value:sourcePhoto},sourceView:{value:sourceView},sourceK:{value:K},retention:roomRetention},
    vertexShader:'varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}',
    fragmentShader:`varying vec3 world;uniform sampler2D sourcePhoto;uniform mat4 sourceView;uniform vec4 sourceK;uniform float retention;
      void main(){vec3 p=(sourceView*vec4(world,1.)).xyz;vec2 pixel=p.xy/p.z*sourceK.xy+sourceK.zw;
        vec2 uv=vec2(pixel.x/1320.,1.-pixel.y/1739.);
        float valid=smoothstep(180.,210.,pixel.x)*(1.-smoothstep(670.,700.,pixel.x))*step(0.,pixel.y)*(1.-smoothstep(555.,575.,pixel.y));
        vec3 base=vec3(.70,.73,.71)*(.98+.02*sin(world.y*48.));
        gl_FragColor=vec4(mix(base,texture2D(sourcePhoto,uv).rgb,valid),retention);}`,
    side:THREE.FrontSide,transparent:true,depthWrite:false});
  const curtain=mesh(new THREE.PlaneGeometry(8,3),curtainMat,[-.15,1.6,-2.65]);curtain.rotation.y=Math.atan2(front.x,front.z);curtain.castShadow=false;
  scene.background=new THREE.Color('#c8d3d0');scene.fog=new THREE.Fog('#c8d3d0',3,9);

  // The bay lies behind the opaque laptop and between book and cup.
  const bayPoints=[[-.34,-2.28],[-.37,-2.43],[-.30,-2.61],[-.15,-2.70],[.06,-2.73],[.19,-2.79],[.40,-2.80],[.46,-2.67],[.43,-2.48],[.37,-2.28],[.29,-2.22],[.20,-2.31],[.08,-2.36],[-.07,-2.29]];
  const bay=new THREE.CatmullRomCurve3(bayPoints.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal').getPoints(120).slice(0,-1).map(p=>[p.x,p.z]);
  const waveTime={value:0};const waterMat=new THREE.MeshPhysicalMaterial({color:'#4b9997',roughness:.25,metalness:.04,clearcoat:.8,clearcoatRoughness:.3});
  waterMat.onBeforeCompile=s=>{
    s.uniforms.waveTime=waveTime;s.vertexShader='varying vec3 seaPoint;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nseaPoint=(modelMatrix*vec4(position,1.)).xyz;');
    s.fragmentShader='varying vec3 seaPoint;uniform float waveTime;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      vec2 q=seaPoint.xz;float wave=sin(q.x*104.+q.y*87.-waveTime*.7);
      normal=normalize(normal+mat3(viewMatrix)*vec3(.075*wave,0.,.05*cos(q.x*80.-q.y*72.+waveTime*.5)));`);
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float light=pow(max(0.,sin(seaPoint.x*150.+waveTime*.24)*cos(seaPoint.z*112.-waveTime*.35)),7.);
      diffuseColor.rgb+=vec3(.035,.07,.055)*light;`);
  };
  slab(bay,.001,.007,mat('#568b87'));const water=slab(bay,.009,.001,waterMat);water.castShadow=false;
  slab([[-.32,-2.25],[-.34,-2.39],[-.25,-2.53],[-.11,-2.56],[-.03,-2.43],[-.06,-2.32]],.012,.016,sand);
  slab([[-.28,-2.27],[-.29,-2.39],[-.21,-2.49],[-.11,-2.46],[-.10,-2.32]],.029,.013,ivory);
  slab([[.15,-2.65],[.14,-2.74],[.20,-2.81],[.41,-2.79],[.43,-2.71],[.38,-2.65]],.015,.017,sand);
  for(let i=0;i<5;i++){
    const d=i*.008;
    slab([[.17+d,-2.65],[.17+d,-2.74],[.23,-2.79+d],[.39-d,-2.77+d],[.40-d,-2.69],[.35,-2.65]],.032+i*.008,.005,i%2?cream:ivory);
  }
  const houseSlot=new THREE.Group();houseSlot.position.set(.30,surface(.30,-2.73)+.077,-2.73);houseSlot.rotation.y=.35;group.add(houseSlot);
  const gltf=await new GLTFLoader().loadAsync('../assets/holiday-house.glb');
  const model=gltf.scene,bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
  const fitted=new THREE.Group();fitted.add(model);fitted.scale.setScalar(Math.min(.10/size.x,.10/size.z,.115/size.y));houseSlot.add(fitted);
  model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});

  // Recessed doorway at the lower rear of the laptop; the aluminium stays visible.
  const lid=registeredObjects.group.getObjectByName('laptop-lid').geometry.attributes.position;
  const vertex=i=>new THREE.Vector3().fromBufferAttribute(lid,i);
  const lower=vertex(6).add(vertex(7)).multiplyScalar(.5),upper=vertex(4).add(vertex(5)).multiplyScalar(.5);
  const U=vertex(5).sub(vertex(4)).normalize(),V=upper.sub(lower).normalize(),N=U.clone().cross(V).normalize();V.crossVectors(N,U).normalize();
  const gate=new THREE.Group();gate.position.copy(lower).addScaledVector(V,.009).addScaledVector(N,-.014);
  gate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(U,V,N));group.add(gate);
  box([.049,.060,.008],teal,[0,.03,0],gate);
  for(const x of [-.029,.029])box([.006,.070,.012],ivory,[x,.035,0],gate);
  box([.063,.008,.016],ivory,[0,.072,0],gate);
  for(let i=0;i<4;i++)box([.006,.055,.003],wood,[-.017+i*.011,.030,-.006],gate);

  // One Y-shaped boardwalk links all three anchors at fixed world positions.
  const routes=[
    [[-.17,-2.24,.036],[-.19,-2.39,.035],[-.09,-2.50,.029],[.04,-2.54,.028],[.17,-2.65,.041],[.24,-2.72,.073]],
    [[.04,-2.54,.028],[.18,-2.49,.029],[.28,-2.40,.032],[.32,-2.27,.025]],
  ];
  const plankMatrices=[],postMatrices=[],matrix=new THREE.Matrix4();
  for(const points of routes){
    const curve=new THREE.CatmullRomCurve3(points.map(([x,z,h])=>new THREE.Vector3(x,surface(x,z)+h,z)));
    const count=Math.ceil(curve.getLength()/.009);
    for(let i=0;i<=count;i++){
      const p=curve.getPointAt(i/count),t=curve.getTangentAt(i/count),yaw=Math.atan2(t.x,t.z);
      matrix.compose(p,new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,yaw),new THREE.Vector3(1,1,1));plankMatrices.push(matrix.clone());
      if(i%5===0)for(const side of [-1,1]){
        const x=p.x+Math.cos(yaw)*.022*side,z=p.z-Math.sin(yaw)*.022*side,h=p.y-surface(x,z)+.015;
        matrix.compose(new THREE.Vector3(x,surface(x,z)+h/2,z),new THREE.Quaternion(),new THREE.Vector3(1,h,1));postMatrices.push(matrix.clone());
      }
    }
    for(const side of [-1,1]){
      const rail=Array.from({length:60},(_,i)=>{const p=curve.getPointAt(i/59),t=curve.getTangentAt(i/59);return p.add(new THREE.Vector3(t.z*.022*side,.017,-t.x*.022*side));});
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail),90,.00085,5),wood,[0,0,0]);
    }
  }
  const planks=new THREE.InstancedMesh(new THREE.BoxGeometry(.043,.003,.0075),wood,plankMatrices.length);plankMatrices.forEach((m,i)=>{planks.setMatrixAt(i,m);planks.setColorAt(i,new THREE.Color(i%3?'#c7a776':'#a78459'));});planks.castShadow=planks.receiveShadow=true;group.add(planks);
  const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.0014,.0018,1,6),dark,postMatrices.length);postMatrices.forEach((m,i)=>posts.setMatrixAt(i,m));posts.castShadow=true;group.add(posts);

  // Cup harbour: a striped parasol, folded deckchairs and a small landing.
  slab([[.28,-2.28],[.28,-2.36],[.37,-2.37],[.39,-2.28],[.35,-2.24]],.017,.009,ivory);
  const shadeX=.355,shadeZ=-2.315,shadeY=surface(shadeX,shadeZ)+.030;
  rod([shadeX,shadeY,shadeZ],[shadeX,shadeY+.087,shadeZ],.0014,wood);
  for(let i=0;i<10;i++)mesh(new THREE.ConeGeometry(.035,.023,4,1,false,i*Math.PI/5,Math.PI/5),i%2?cream:orange,[shadeX,shadeY+.085,shadeZ]);
  for(const [x,z,rotation] of [[-.15,-2.43,-.6],[-.09,-2.45,-.6],[.34,-2.28,.2]]){
    const chair=new THREE.Group();chair.position.set(x,surface(x,z)+.047,z);chair.rotation.y=rotation;group.add(chair);
    box([.017,.002,.029],cream,[0,.009,0],chair);const back=box([.017,.025,.002],teal,[0,.019,-.013],chair);back.rotation.x=-.4;
    for(const side of [-1,1])rod([side*.009,0,.013],[side*.009,.012,-.012],.0009,wood,chair);
  }
  const palms=[];
  for(const [x,z,h,phase] of [[-.27,-2.42,.14,.4],[.41,-2.72,.15,1.2],[.21,-2.77,.105,2.1]]){
    const base=surface(x,z)+.043,crown=new THREE.Group();crown.position.set(x+.013,base+h,z);group.add(crown);palms.push({crown,phase});
    const trunk=new THREE.CatmullRomCurve3([new THREE.Vector3(x,base,z),new THREE.Vector3(x+.004,base+h*.5,z),crown.position.clone()]);
    mesh(new THREE.TubeGeometry(trunk,16,.0028,7),wood,[0,0,0]);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4+phase,pos=[],indices=[];
      for(let j=0;j<=12;j++){
        const t=j/12,l=t*.084,w=Math.sin(t*Math.PI)*.008*(j%2?.7:1),y=Math.sin(t*Math.PI)*.015-t*t*.022;
        for(const side of [-1,1])pos.push(Math.cos(a)*l-Math.sin(a)*w*side,y,Math.sin(a)*l+Math.cos(a)*w*side);
        if(j<12){const k=j*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();mesh(g,leaf,[0,0,0],crown);
    }
  }
  const boat=new THREE.Group();group.add(boat);
  const hull=mesh(new THREE.SphereGeometry(.014,24,12),cream,[0,.003,0],boat);hull.scale.set(.55,.3,1.5);
  rod([0,.006,0],[0,.059,0],.0008,dark,boat);
  const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([0,.055,0,0,.011,0,0,.011,.025],3));sail.computeVertexNormals();mesh(sail,mat('#ecdbc0',.9,{side:THREE.DoubleSide}),[0,0,0],boat);
  const light=new THREE.DirectionalLight('#fff0d4',2.1);light.position.set(-1,3,-3);light.target.position.set(0,.8,-2.4);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-1.1,right:1.1,top:1.2,bottom:-1.2,near:.1,far:6});light.shadow.bias=-.0002;light.shadow.normalBias=.0006;
  scene.add(light,light.target,new THREE.HemisphereLight('#edf5f2','#978873',1.8));
  return {group,table,houseReady:true,surface,update(time){
    waveTime.value=time;
    roomRetention.value=1-THREE.MathUtils.smoothstep(time/12*180,65,100);
    palms.forEach(({crown,phase})=>{crown.rotation.z=Math.sin(time*.6+phase)*.025;});
    boat.position.set(-.02+Math.sin(time*.2)*.006,surface(-.02,-2.60)+.019+Math.sin(time*1.1)*.001,-2.60);boat.rotation.y=-.4;boat.rotation.z=Math.sin(time)*.035;
  }};
}
