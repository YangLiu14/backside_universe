import * as T from 'three';

// Coordinates measured on the registered front of the Hi3D hall, after prepare()
// normalizes its bounds. Each interval ends at the existing brick jamb / lintel.
const sill=-.224,head=.054;
const windows=[
  [-.430,-.292,6],[-.265,-.138,5],[.037,.149,4],[.178,.308,6],[.336,.447,5],
].map(([left,right,lights])=>({left,right,bottom:sill,top:head,lights,transom:-.037}));
const doorLights=[
  {left:-.098,right:.001,bottom:-.031,top:.043,lights:4},
  {left:-.097,right:-.052,bottom:-.217,top:-.066,lights:2},
  {left:-.047,right:-.002,bottom:-.217,top:-.066,lights:2}
];
const openings=[...windows,...doorLights];

// Clip triangles against each aperture (including triangles crossing a jamb),
// preserving UVs, vertex normals, material groups and the original outer brick.
// The real openings then work in the colour, depth and sun-shadow passes alike.
function cutOpenings(source){
  const attrs=Object.entries(source.attributes);
  const added=Object.fromEntries(attrs.map(([name])=>[name,[]]));
  const pos=source.attributes.position,count=pos.count,indices=[],groups=[];
  const get=(name,i,k)=>i<count?source.attributes[name].getComponent(i,k):added[name][(i-count)*source.attributes[name].itemSize+k];
  function splitEdge(a,b,t){
    const id=count+added.position.length/3;
    for(const [name,attr] of attrs){
      for(let k=0;k<attr.itemSize;k++)added[name].push(T.MathUtils.lerp(get(name,a,k),get(name,b,k),t));
    }
    return id;
  }
  function outside(polygon,planes){
    const kept=[];
    for(const [axis,edge,sign] of planes){
      const inside=[],outside=[];
      let a=polygon.at(-1),da=sign*(get('position',a,axis)-edge);
      for(const b of polygon){
        const db=sign*(get('position',b,axis)-edge);
        if((da<0)!==(db<0)){
          const join=splitEdge(a,b,da/(da-db));
          inside.push(join);outside.push(join);
        }
        (db<0?outside:inside).push(b);a=b;da=db;
      }
      if(outside.length>=3)kept.push(outside);
      if(inside.length<3)break;
      polygon=inside;
    }
    return kept;
  }
  const cuts=openings.map(o=>({...o,planes:[[0,o.left,1],[0,o.right,-1],[1,o.bottom,1],[1,o.top,-1],[2,.27,1]]}));
  const index=source.index;
  const batches=source.groups.length?source.groups:[{start:0,count:index?.count??count,materialIndex:0}];
  for(const batch of batches){
    const start=indices.length;
    for(let i=batch.start;i<batch.start+batch.count;i+=3){
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      const x0=Math.min(pos.getX(a),pos.getX(b),pos.getX(c)),x1=Math.max(pos.getX(a),pos.getX(b),pos.getX(c));
      const y0=Math.min(pos.getY(a),pos.getY(b),pos.getY(c)),y1=Math.max(pos.getY(a),pos.getY(b),pos.getY(c));
      const z1=Math.max(pos.getZ(a),pos.getZ(b),pos.getZ(c));
      let patches;
      if(z1>.27 && y1>sill && y0<head)for(const o of cuts){
        if(x1<=o.left||x0>=o.right||y1<=o.bottom||y0>=o.top)continue;
        patches=(patches||[[a,b,c]]).flatMap(p=>outside(p,o.planes));
      }
      if(!patches){indices.push(a,b,c);continue;}
      for(const face of patches)for(let j=1;j<face.length-1;j++)indices.push(face[0],face[j],face[j+1]);
    }
    groups.push({start,count:indices.length-start,materialIndex:batch.materialIndex});
  }
  const geometry=new T.BufferGeometry();
  for(const [name,attr] of attrs){
    // The loader can return interleaved or quantized attributes; read their
    // decoded values through the accessor, just as the clipping calculation did.
    const data=new Float32Array(count*attr.itemSize+added[name].length);
    for(let i=0;i<count;i++)for(let k=0;k<attr.itemSize;k++)data[i*attr.itemSize+k]=attr.getComponent(i,k);
    data.set(added[name],count*attr.itemSize);
    geometry.setAttribute(name,new T.BufferAttribute(data,attr.itemSize));
  }
  geometry.setIndex(indices);
  for(const g of groups)geometry.addGroup(g.start,g.count,g.materialIndex);
  geometry.computeBoundingSphere();return geometry;
}

export function restoreGymWindows(hall,{sky,aggregate}){
  for(const mesh of hall.children)if(mesh.isMesh)mesh.geometry=cutOpenings(mesh.geometry);
  const frame=new T.MeshStandardMaterial({color:0x576057,roughness:.67,metalness:.23});
  const rebate=new T.MeshStandardMaterial({color:0x968877,roughness:.93});
  const interior=new T.MeshStandardMaterial({color:0x454b48,roughness:.96});
  const wainscot=new T.MeshStandardMaterial({color:0x3b534d,roughness:.86});
  const timber=new T.MeshStandardMaterial({color:0x765943,roughness:.83});
  const steel=new T.MeshStandardMaterial({color:0x404c48,roughness:.67,metalness:.28});
  const glass=new T.MeshPhysicalMaterial({color:0x99a9a4,metalness:0,roughness:.16,
    ior:1.51,envMapIntensity:.8,transparent:true,opacity:.18,depthWrite:false});
  // Give the planar glazing a view-dependent reflection of the actual school
  // sky. The darker court side remains visible through a pane viewed head-on.
  glass.onBeforeCompile=shader=>{
    shader.uniforms.gymSky={value:sky};
    shader.vertexShader='varying vec3 gymGlassWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      gymGlassWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;`);
    shader.fragmentShader='varying vec3 gymGlassWorld;uniform sampler2D gymSky;\n'+shader.fragmentShader
      .replace('#include <opaque_fragment>',`
        vec3 eye=normalize(cameraPosition-gymGlassWorld);
        vec3 faceNormal=inverseTransformDirection(normal,viewMatrix);
        vec3 ray=reflect(-eye,faceNormal);
        float fresnel=.038+.944*pow(1.-abs(dot(eye,faceNormal)),5.);
        vec2 skyUV=vec2(atan(ray.z,ray.x)*.15915494+.5,asin(clamp(ray.y,-1.,1.))*.31830989+.5);
        vec3 skyColor=texture2D(gymSky,skyUV).rgb;
        outgoingLight=mix(vec3(.086,.114,.105),skyColor,.47+.49*fresnel);
        diffuseColor.a=.13+.76*fresnel;
        #include <opaque_fragment>`);
  };
  // Aggregate from the court supplies fine pores in the hall limewash. The
  // overhung back wall receives only the solid angle subtended by the windows.
  for(const mat of [interior,wainscot]){
    mat.onBeforeCompile=shader=>{
      shader.uniforms.wallGrain={value:aggregate};
      shader.vertexShader='varying vec3 wallPoint;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        wallPoint=(instanceMatrix*vec4(transformed,1.)).xyz;`);
      shader.fragmentShader='varying vec3 wallPoint;uniform sampler2D wallGrain;\n'+shader.fragmentShader
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec2 grainUV=vec2(wallPoint.x+wallPoint.z,wallPoint.y)*vec2(22.,8.);
          diffuseColor.rgb*=.76+.35*texture2D(wallGrain,grainUV).g;`)
        .replace('#include <aomap_fragment>',`#include <aomap_fragment>
          reflectedLight.indirectDiffuse*=mix(.40,.77,smoothstep(-.25,.28,wallPoint.z));`);
    };
  }
  const cream=new T.MeshStandardMaterial({color:0xa9a38e,roughness:.83});
  // Section sizes below are in metres; retain them when this static model is scaled.
  const [w,h,d]=hall.scale.toArray(),sections=new Map(),box=new T.BoxGeometry(),q=new T.Quaternion();
  function part(mat,x,y,z,sx,sy,sz){
    if(!sections.has(mat))sections.set(mat,[]);
    sections.get(mat).push(new T.Matrix4().compose(new T.Vector3(x,y,z),q,new T.Vector3(sx,sy,sz)));
  }
  for(const o of openings){
    const width=o.right-o.left,height=o.top-o.bottom,x=(o.left+o.right)/2,y=(o.bottom+o.top)/2;
    const isDoor=!o.transom,lip=isDoor?.026:.061,front=isDoor?.366:.359;
    for(const edge of [o.left,o.right]){
      part(rebate,edge,y,.355,.028/w,height,.053);
      part(frame,edge,y,front,lip/w,height+lip/h,.054/d);
    }
    for(const edge of [o.top,o.bottom]){
      part(rebate,x,edge,.355,width,.030/h,.053);
      part(frame,x,edge,front,width,lip/h,.054/d);
    }
    for(let n=1;n<o.lights;n++)part(frame,o.left+n*width/o.lights,y,front,.044/w,height,.060/d);
    if(o.transom)part(frame,x,o.transom,front+.001,width,.065/h,.068/d);
    part(glass,x,y,front-.037/d,width-.025/w,height-.025/h,.004/d);
  }
  // A continuous hall behind the panes allows an oblique view through
  // adjacent bays. The seating, wainscot, trusses and end walls have depth.
  part(interior,0,-.10,-.24,.95,.70,.012);
  part(wainscot,0,-.215,-.226,.95,.49,.016);
  part(timber,0,.033,-.216,.95,.013,.013);
  // Wall bars and the high rack on the far wall break up the six-metre sightline.
  for(const bank of [-.385,-.318,-.251,.117,.184,.251]){
    for(const edge of [-.028,.028])part(timber,bank+edge,-.162,-.193,.0035,.41,.014);
    for(let n=0;n<10;n++)part(timber,bank,-.36+n*.04,-.181,.056,.005,.006);
  }
  // Regulation-sized backboard and rim at the far gable. The plate has
  // thickness and remains visible from the other bays as the visitor walks.
  part(cream,-.455,-.005,.075,.007,.158,.180);
  for(const y of [-.052,-.005])part(frame,-.448,y,.075,.003,.004,.059);
  for(const z of [.046,.104])part(frame,-.448,-.028,z,.003,.048,.003);
  const hoop=new T.Mesh(new T.TorusGeometry(1,.077,8,36),new T.MeshStandardMaterial({color:0x976046,roughness:.54}));
  hoop.rotation.x=Math.PI/2;hoop.position.set(-.433,-.057,.075);hoop.scale.set(.225/w,.225/d,.225/h);
  hall.add(hoop);
  // One switched-on two-tube fitting above the wall bars lights the far
  // plaster without lifting the exposure of the whole hall.
  const fixtureX=.205,fixtureY=.144,fixtureZ=-.139;
  part(steel,fixtureX,fixtureY+.004,fixtureZ,.071,.006,.013);
  const tube=new T.MeshStandardMaterial({color:0xfff0cf,emissive:0xffe5ab,emissiveIntensity:.8,roughness:.50});
  for(const offset of [-.003,.003])part(tube,fixtureX,fixtureY,fixtureZ+offset,.064,.003,.0018);
  const practical=new T.PointLight(0xffe4b2,10,3.7,2);
  practical.position.set(fixtureX,fixtureY-.012,fixtureZ);hall.add(practical);
  part(timber,0,-.43,.02,.95,.025,.50);
  for(const x of [-.48,.48])part(interior,x,-.09,.045,.016,.70,.62);
  for(let row=0;row<3;row++){
    const y=-.391+row*.050,z=-.070-row*.040;
    part(timber,0,y,z,.91,.013,.045);
    part(wainscot,0,y-.026,z+.018,.91,.048,.006);
  }
  for(let x=-.44;x<.47;x+=.14){
    part(steel,x,-.085,-.205,.005,.64,.010);
    part(steel,x,.131,.050,.006,.017,.53);
  }
  for(const [mat,matrices] of sections){
    const mesh=new T.InstancedMesh(box,mat,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;
    mesh.name=mat===glass?'风雨球馆 / 平板玻璃':'风雨球馆 / 窗樘及馆内结构';
    mesh.castShadow=mat!==glass;mesh.receiveShadow=true;hall.add(mesh);
  }
}
