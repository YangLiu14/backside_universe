// One colour survey across all slabs, plus close-range mineral grain in world units.
import * as T from 'three';
import {reaches} from './outsole.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {streetReflection} from './puddle-reflection.js';

export async function loadPavement(models) {
  const loader = new T.TextureLoader();
  const [map, normalMap, roughnessMap, minerals, plan, contact] = await Promise.all([
    loader.loadAsync('poured-concrete.jpg'), loader.loadAsync('cement-normal.jpg'),
    loader.loadAsync('cement-roughness.jpg'),
    loader.loadAsync('cement-minerals.jpg'),
    fetch('pavement.json').then(response => response.json()),
    models && !new URLSearchParams(location.search).has('bake-contact') ? loadContact(models,loader) : null
  ]);
  map.colorSpace = T.SRGBColorSpace;
  for(const texture of [map,roughnessMap]){
    texture.offset.set(.5,.5);
    texture.repeat.set(1/.72,.5);
    texture.anisotropy=8;
  }
  normalMap.wrapS = normalMap.wrapT = T.RepeatWrapping;
  normalMap.repeat.setScalar(1/.025);
  map.anisotropy = normalMap.anisotropy = 8;
  const material = new T.MeshStandardMaterial({
    name:'Old poured concrete', map, normalMap, normalScale:new T.Vector2(.47,.47),
    roughness:1, roughnessMap, side:T.DoubleSide
  });
  minerals.wrapS=minerals.wrapT=T.RepeatWrapping;
  minerals.anisotropy=8;
  material.onBeforeCompile=shader=>{
    shader.uniforms.cementMinerals={value:minerals};
    shader.fragmentShader='uniform sampler2D cementMinerals;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      // The survey texture holds 35-40 mm per texel; at foot level it cannot
      // resolve the exposed chips. The two bands carry distinct smaller scales.
      vec2 localRoad = (vMapUv - vec2(.5)) * vec2(.72,2.);
      float fine = texture2D(cementMinerals, localRoad/.021).r - .502;
      float chips = texture2D(cementMinerals, mat2(.8,.6,-.6,.8)*localRoad/.047).r - .502;
      diffuseColor.rgb *= clamp(1.0 + .80*fine + .52*chips,.72,1.28);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      #if defined(USE_NORMALMAP_TANGENTSPACE) && defined(USE_ROUGHNESSMAP)
        vec2 jointSlope = (texelRoughness.rb - vec2(128.0/255.0))*2.0;
        normal = normalize(normal + tbn[0]*jointSlope.x + tbn[1]*jointSlope.y);
      #endif`);
  };
  return {material,plan,contact};
}

function lip(angle, seed) {
  return 1+.13*Math.sin(3*angle+seed)+.065*Math.sin(5*angle-seed*.4)+.04*Math.cos(8*angle+.3*seed);
}

export function surfaceDip(pits, x, z) {
  for (const p of pits) {
    const dx=(x-p.x)/p.rx, dz=(z-p.z)/p.rz;
    if(Math.abs(dx)>1.24 || Math.abs(dz)>1.24) continue;
    const r=Math.hypot(dx,dz)/lip(Math.atan2(dz,dx),p.seed);
    if(r<1) return -p.depth * Math.min(1,(1-r)*2);
  }
  return 0;
}

function castIron() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(512,512);
  let seed=81;
  for(let i=0;i<pixels.data.length;i+=4) {
    seed=(Math.imul(1664525,seed)+1013904223)>>>0;
    const v=75+(seed/4294967296-.5)*25;
    pixels.data.set([v+5,v+3,v,255],i);
  }
  ctx.putImageData(pixels,0,0);ctx.translate(256,256);
  function circle(r,color,width) {
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }
  for(let n=0;n<4;n++){
    const r=89+n*34,count=13+n*5;
    for(let k=0;k<count;k++){
      const a=2*Math.PI*(k+.4*n)/count;
      ctx.save();ctx.translate(r*Math.cos(a),r*Math.sin(a));ctx.rotate(a+.54);
      ctx.fillStyle='#383b36';ctx.fillRect(-5,-12,11,26);
      ctx.fillStyle='#818078';ctx.fillRect(-5,-13,8,23);ctx.restore();
    }
  }
  for(const [r,c,w] of [[245,'#89847a',5],[235,'#575751',11],[222,'#282b27',8],[214,'#817e75',4],[65,'#343832',4],[61,'#77796e',3]]) circle(r,c,w);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 39px sans-serif';
  ctx.fillStyle='#363a34';ctx.fillText('雨水',2,4);ctx.fillStyle='#9c998d';ctx.fillText('雨水',0,1);
  for(const side of [-1,1]) {
    ctx.fillStyle='#282b28';ctx.fillRect(side*146-10,-5,22,10);
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
  return new T.MeshStandardMaterial({name:'Cast iron inspection lid', map:texture,bumpMap:texture,
    bumpScale:.00011,roughness:.72,metalness:.38});
}

// The bars stand above a dark, shallow drain pan. Grazing views see the sides
// and the opening behind each bar even when the adjacent concrete is lit.
function slottedGrate(radius){
  const w=radius*1.55, d=radius*2.35;
  const grate=new T.Group(),bars=[];
  const iron=new T.MeshStandardMaterial({name:'雨水箅旧铸铁',vertexColors:true,roughness:.70,metalness:.49});
  const bed=new T.MeshStandardMaterial({name:'雨水箅底',color:0x272a26,roughness:.84});
  const top=.00027;
  function part(material,x,y,z,width,height,depth){
    const geo=new T.BoxGeometry(width,height,depth).translate(x,y,z);
    if(material===iron){
      const pos=geo.attributes.position,norm=geo.attributes.normal,colors=[];
      for(let i=0;i<pos.count;i++){
        const px=pos.getX(i),pz=pos.getZ(i),topFace=norm.getY(i)>.9;
        const wear=.5+.5*Math.sin(760*px-430*pz);
        const color=new T.Color(topFace?0x87877a:0x645044);
        color.multiplyScalar(topFace?.65+.4*wear:.60+.44*wear);
        colors.push(color.r,color.g,color.b);
      }
      geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      bars.push(geo);return;
    }
    const mesh=new T.Mesh(geo,material);
    mesh.receiveShadow=true;
    grate.add(mesh);
  }
  part(bed,0,.00003,0,w,.00004,d);
  const rim=w*.047;
  for(const sign of [-1,1]){
    part(iron,sign*(w-rim)/2,top/2,0,rim,top,d);
    part(iron,0,top/2,sign*(d-rim)/2,w-2*rim,top,rim);
  }
  for(let i=0;i<9;i++){
    part(iron,0,top*.60,(i-4)*(d-2*rim)/9,w-2*rim,top*.81,d*.049);
  }
  part(iron,0,top*.28,0,rim*.84,top*.44,d-2*rim);
  const casting=new T.Mesh(mergeGeometries(bars),iron);
  casting.receiveShadow=true;
  grate.add(casting);
  for(const geo of bars)geo.dispose();
  return grate;
}

function waterMesh(pit,groundMap) {
  const pos=[0,0,0],uv=[pit.x,-pit.z],idx=[],color=[];
  function bottomTransmission(dx,dz){
    // Effective two-way transmission to the mineral bed in a shallow, silty pool.
    const depth=Math.max(0,-pit.depth*pit.water-surfaceDip([pit],pit.x+dx,pit.z+dz));
    color.push(Math.exp(-depth*410),Math.exp(-depth*285),Math.exp(-depth*215));
  }
  bottomTransmission(0,0);
  // Extend the water plane slightly inside the banks. The physical intersection
  // with the depressed mesh determines the waterline from every camera angle.
  for(let k=0;k<72;k++) {
    const a=2*Math.PI*k/72,r=lip(a,pit.seed)*(1-.5*pit.water+.075);
    const dx=pit.rx*r*Math.cos(a), dz=pit.rz*r*Math.sin(a);
    pos.push(dx,0,dz);uv.push(pit.x+dx,-pit.z-dz);bottomTransmission(dx,dz);
    idx.push(0,1+(k+1)%72,1+k);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setAttribute('color',new T.Float32BufferAttribute(color,3));
  g.setIndex(idx);g.computeVertexNormals();
  // The dielectric BRDF uses IOR for Fresnel: about 2% at normal incidence,
  // much stronger towards grazing angles. The diffuse term represents the bed.
  const m=new T.MeshPhysicalMaterial({name:'Shallow standing water',map:groundMap,color:0xb8b4a7,
    vertexColors:true,metalness:0,roughness:.068,ior:1.333,envMapIntensity:1});
  return new T.Mesh(g,m);
}

function counterContact(stall,worldToCity,width,height,extent){
  if(!stall)return null;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),directions=12;
  const transform=new T.Matrix4(),point=new T.Vector3(),reach=.018;
  const triangles=[];
  stall.traverse(o=>{
    if(!o.isMesh)return;
    transform.multiplyMatrices(worldToCity,o.matrixWorld);
    const g=o.geometry,pos=g.attributes.position,index=g.index,vertices=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){
      point.fromBufferAttribute(pos,i).applyMatrix4(transform);
      vertices[i*3]=point.x;vertices[i*3+1]=point.y-stall.position.y;vertices[i*3+2]=point.z;
    }
    for(let i=0;i<(index?.count??pos.count);i+=3){
      const a=3*(index?index.getX(i):i),b=3*(index?index.getX(i+1):i+1),c=3*(index?index.getX(i+2):i+2);
      if(Math.max(vertices[a+1],vertices[b+1],vertices[c+1])<reach)triangles.push([vertices,a,b,c]);
    }
  });
  // Project low surfaces along equal-weight cosine-distributed sky directions.
  // Each binary mask counts a direction once, even when several triangles overlap.
  const sum=new Uint16Array(width*height),golden=Math.PI*(3-Math.sqrt(5));
  ctx.fillStyle='#fff';
  const projX=new Float32Array(3),projZ=new Float32Array(3);
  for(let n=0;n<directions;n++){
    const cosSquared=(n+.5)/directions;
    const slope=Math.sqrt((1-cosSquared)/cosSquared),dx=Math.cos(n*golden)*slope,dz=Math.sin(n*golden)*slope;
    ctx.clearRect(0,0,width,height);ctx.beginPath();
    for(const [vertices,a,b,c] of triangles){
      const offsets=[a,b,c];
      for(let k=0;k<3;k++){
        const i=offsets[k],h=vertices[i+1];
        projX[k]=(vertices[i]-dx*h+extent/2)*width/extent;
        projZ[k]=(vertices[i+2]-dz*h+1)*height/2;
      }
      // The nonzero winding fill must union front and back faces of thin legs.
      const cross=(projX[1]-projX[0])*(projZ[2]-projZ[0])-(projZ[1]-projZ[0])*(projX[2]-projX[0]);
      const second=cross>=0?1:2,third=3-second;
      ctx.moveTo(projX[0],projZ[0]);ctx.lineTo(projX[second],projZ[second]);ctx.lineTo(projX[third],projZ[third]);ctx.closePath();
    }
    ctx.fill();
    const projected=ctx.getImageData(0,0,width,height).data;
    for(let i=0;i<sum.length;i++)sum[i]+=projected[i*4+3];
  }
  for(let i=0;i<sum.length;i++)sum[i]=Math.round(sum[i]/directions);
  return sum;
}

// Only near-field contact belongs in the AO texture. The spatial sky field already
// integrates the full street geometry and the deck, including openings in yards.
function fitContact(texture) {
  texture.offset.set(.5,.5);texture.repeat.set(1/.72,.5);texture.anisotropy=4;
  return texture;
}

async function loadContact(models,loader) {
  const response=await fetch('./counter-contact.json');
  if(!response.ok)return null;
  const baked=await response.json();
  const desc=models['soy-cart-dawn']||models.stall;
  if(!desc||baked.task!==desc.task)return null;
  return {pose:baked.pose,texture:fitContact(await loader.loadAsync('./counter-contact.png'))};
}

function contactPose(stall,worldToCity) {
  // The same GLB may be resized or turned on a different forecourt. Check
  // every component, including children added by the shop assembly.
  const matrix=new T.Matrix4(), pose=[];
  stall.traverse(o=>{
    if(o.isMesh){
      const elements=matrix.multiplyMatrices(worldToCity,o.matrixWorld).elements;
      pose.push([o.geometry.attributes.position.count,...elements.map(v=>Math.round(v*1e6))]);
    }
  });
  return JSON.stringify(pose);
}

function counterContactMap(city) {
  const width=480,height=1280,extent=.72;
  const stall=city.children.find(o=>o.userData.feature==='stall');
  const contact=counterContact(stall,city.matrixWorld.clone().invert(),width,height,extent);
  if(!contact)return null;
  const surface=document.createElement('canvas');surface.width=width;surface.height=height;
  const ctx=surface.getContext('2d'),channels=ctx.createImageData(width,height);
  for(let i=0;i<contact.length;i++){
    const offset=4*i;
    channels.data[offset]=255-.86*contact[i];
    channels.data[offset+1]=channels.data[offset+2]=channels.data[offset+3]=255;
  }
  ctx.putImageData(channels,0,0);
  return fitContact(new T.CanvasTexture(surface));
}

export function roadDetails(city, plan, ground, bakedContact) {
  const parts=[], pools=[], reflectedMaterials=new Set(), iron=castIron();
  const livePits=plan.pits.filter(p=>p.liveReflection&&p.water),livePools=[];
  const mirror=livePits.length?streetReflection(livePits):null;
  if(mirror)mirror.finish(ground);
  let mirrorPhase;
  function place(mesh,x,y,z,name) {
    mesh.position.set(x,y,z);mesh.name=name;mesh.userData.pavementDetail=true;
    mesh.receiveShadow=true;city.add(mesh);
    const start=reaches(z)+.030;
    parts.push({mesh,start});
  }
  for (const [i,c] of plan.covers.entries()) {
    const grate=c.type==='grate';
    const mesh=grate?slottedGrate(c.radius):new T.Mesh(new T.CircleGeometry(c.radius,64).rotateX(-Math.PI/2),iron);
    mesh.rotation.y=c.angle;
    place(mesh,c.x,.00408,c.z,(grate?'巷口雨水箅':'铸铁井盖')+(i+1));
  }
  for(const [i,pit] of plan.pits.entries()) {
    if(!pit.water) continue;
    const mesh=waterMesh(pit,ground.map);
    if(pit.liveReflection){livePools.push(mesh);mirror.finish(mesh.material,pit);}
    place(mesh,pit.x,.004-pit.depth*pit.water,pit.z,'坑内积水'+(i+1));
    pools.push(mesh);
  }
  function update(p) {
    mirrorPhase?.(p);
    ground.aoMapIntensity=T.MathUtils.smoothstep(p,.665,.72);
    for(const material of reflectedMaterials)material.envMapIntensity=ground.aoMapIntensity;
    for(const {mesh,start} of parts) {
      const f=T.MathUtils.smoothstep(p,start,start+.012);
      mesh.visible=f>0;mesh.scale.setScalar(f);
    }
  }
  function reflect(renderer,scene,bakeContact=false) {
    // A stationary puddle samples its own street corner. Capture the finished
    // street once; walking then changes the reflection without re-rendering it.
    const target=new T.Vector3();
    for(const pool of pools) pool.visible=false;
    scene.updateMatrixWorld(true);
    const stall=city.children.find(o=>o.userData.feature==='stall');
    const pose=stall&&contactPose(stall,city.matrixWorld.clone().invert());
    const channels=pose && bakedContact?.pose===pose ? bakedContact.texture : counterContactMap(city);
    if(bakeContact && channels) return {pose,image:channels.image.toDataURL('image/png')};
    ground.aoMap=channels;ground.needsUpdate=true;
    function radiance(position,size){
      const targetCube=new T.WebGLCubeRenderTarget(size,{type:T.HalfFloatType});
      const probe=new T.CubeCamera(.001,72,targetCube);probe.position.copy(position);
      probe.update(renderer,scene);
      return targetCube.texture;
    }
    for(const pool of pools){
      // The live pools already have a local planar pass. Outside its range
      // they use the scene sky probe, without six extra startup renders each.
      if(livePools.includes(pool))continue;
      pool.material.envMap=radiance(pool.getWorldPosition(target),128);
      reflectedMaterials.add(pool.material);
      pool.material.needsUpdate=true;
    }
    if(stall){
      stall.visible=false;
      const position=stall.position.clone().add(new T.Vector3(-.024,.026,0));
      const reflection=radiance(city.localToWorld(position),128);
      stall.visible=true;
      stall.traverse(o=>{
        if(!o.isMesh)return;
        for(const m of [].concat(o.material))if(m.isMeshStandardMaterial){
          m.envMap=reflection;m.needsUpdate=true;reflectedMaterials.add(m);
        }
      });
    }
    for(const pool of pools) pool.visible=true;
    if(mirror)mirrorPhase=mirror.attach(scene,city,livePools);
  }
  return {update,reflect};
}
