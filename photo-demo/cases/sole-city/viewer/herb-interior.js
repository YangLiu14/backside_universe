// Millwork fitted into the existing Hi3D apothecary, in its normalized bay.
// The scale, wicker tray, herbs, front counter, shutters and lamp shade are the scan.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const drugs=['陈皮','当归','白芍','黄芪','茯苓','甘草','党参','白术','山药','桂枝',
  '麦冬','枸杞','川芎','山楂','丹参','薄荷','厚朴','砂仁','菊花','五味子',
  '桔梗','葛根','酸枣仁','桑叶','黄芩','木香','熟地','益母草','泽泻','玉竹'];

// A single atlas carries the horizontal end grain, timber variation and hand labels.
// Drawer faces, framed borders and hanging ring pulls each have real depth.
function drawerAtlas(){
  const w=256,h=128,columns=4,rows=8,canvas=document.createElement('canvas');
  canvas.width=w*columns;canvas.height=h*rows;
  const g=canvas.getContext('2d');
  let seed=47120;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const x=i*w,y=j*h,t=Math.floor(rand()*18);
    g.save();g.translate(x,y);g.scale(w/160,h/100);
    g.fillStyle='rgb('+(96+t)+','+(66+t*.76)+','+(43+t*.63)+')';g.fillRect(0,0,160,100);
    for(let k=0;k<85;k++){
      const yy=rand()*100,phase=rand()*7,amp=rand()*1.6;
      g.strokeStyle=k%4?'rgba(50,26,16,.10)':'rgba(221,174,106,.19)';g.lineWidth=.4+rand();
      g.beginPath();
      for(let u=-2;u<=163;u+=5){
        const v=yy+Math.sin(u/31+phase)*amp+Math.sin(u/11+phase)*.48;
        if(u<0)g.moveTo(u,v);else g.lineTo(u,v);
      }
      g.stroke();
    }
    // Smoothed edge on the old, frequently handled boards.
    g.strokeStyle='rgba(218,172,114,.27)';g.lineWidth=1.2;g.strokeRect(2,2,156,96);
    const lx=55+Math.floor(rand()*3),ly=14+Math.floor(rand()*4),label=drugs[(j*columns+i)%drugs.length];
    g.fillStyle='rgba(37,24,16,.5)';g.fillRect(lx,ly+2,51,21);
    g.fillStyle=['#a99271','#b9a387','#b1a185','#b7a077'][(j+i*3)%4];g.fillRect(lx,ly,51,20);
    g.fillStyle='#493728';g.textAlign='center';g.textBaseline='middle';
    g.font=(label.length>2?'13':'16')+'px "Songti SC","STSong",serif';g.fillText(label,lx+25,ly+10,45);
    g.restore();
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return map;
}

const lampPosition=new T.Vector3(.056,.558,.326);
// The right-hand window, street aperture and scanned hanging light supply
// diffuse fill. Evaluate it in the furniture frame so it moves with the lug.
// Limit the contribution to the recessed bay; the eaves retain the street lighting.
function lightBay(material,toBay,scanned){
  const previous=material.onBeforeCompile.bind(material),oldKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous(shader,renderer);
    shader.uniforms.herbToBay={value:toBay};shader.uniforms.herbFrame={value:new T.Matrix3().getNormalMatrix(toBay)};
    shader.uniforms.herbLamp={value:lampPosition};
    shader.vertexShader='uniform mat4 herbToBay; uniform mat3 herbFrame; varying vec3 herbPos; varying vec3 herbNormal;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\nherbPos=(herbToBay*vec4(transformed,1.)).xyz; herbNormal=herbFrame*objectNormal;');
    shader.fragmentShader='uniform vec3 herbLamp; varying vec3 herbPos; varying vec3 herbNormal;\n'+shader.fragmentShader
      .replace('#include <map_fragment>',`#include <map_fragment>
        float inside=(1.-smoothstep(.352,.399,abs(herbPos.x)))*(1.-smoothstep(.57,.619,herbPos.y))*smoothstep(.035,.077,herbPos.y);
        float depth=1.-smoothstep(.365,.39,herbPos.z);
        float bay=inside*depth;
        ${scanned?`// Recover the albedo obscured by baked illumination in the shop photograph.
        float ink=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb*=mix(1.,1.+2.0/(1.+15.*ink),bay);
        `:''}
      `)
      .replace('#include <opaque_fragment>',`
        // Use the scan's smooth normals so broad plaster panels and curved brass
        // share continuous irradiance across the triangulated surface.
        vec3 n=normalize(herbNormal);
        vec3 towardsDoor=vec3(.017,.42,.47)-herbPos;
        vec3 towardsWindow=vec3(.36,.445,-.13)-herbPos;
        vec3 towardsLamp=herbLamp-herbPos;
        float lampDistance=dot(towardsLamp,towardsLamp);
        float lampCone=smoothstep(-.10,.40,normalize(towardsLamp).y);
        float lampShade=.15+.85*lampCone;
        float bulb=lampShade*max(dot(n,normalize(towardsLamp)),0.)/max(.028,lampDistance);
        float door=max(dot(n,normalize(towardsDoor)),0.)/(.16+dot(towardsDoor,towardsDoor));
        float window=max(dot(n,normalize(towardsWindow)),0.)/(.08+dot(towardsWindow,towardsWindow));
        vec3 roomLight=vec3(.19,.16,.13)+vec3(.11,.12,.14)*door+vec3(.050,.062,.079)*window+vec3(.045,.032,.020)*bulb;
        outgoingLight+=bay*roomLight*diffuseColor.rgb;
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>oldKey+'/quzhou-herb-light-'+(scanned?'scan':'fittings');
}

export function recoverHerbalScan(root){
  root.updateWorldMatrix(true,true);
  root.traverse(o=>{if(o.isMesh)for(const mat of [].concat(o.material))lightBay(mat,o.matrixWorld.clone(),true);});
}

export function fitHerbalDispensary(model){
  const parts=new Map(), wood=new T.MeshStandardMaterial({name:'百子柜老樟木框',color:0x6a4831,roughness:.74});
  const drawers=new T.MeshStandardMaterial({name:'带药签的实木斗面',map:drawerAtlas(),roughness:.68});
  const brass=new T.MeshStandardMaterial({name:'磨旧铜环与锁鼻',color:0xb19863,roughness:.46,metalness:.49});
  const lamp=new T.MeshStandardMaterial({name:'药铺吊灯的乳白灯泡',color:0xffe3ae,emissive:0xffb56c,emissiveIntensity:1.3,roughness:.4});
  const cube=new T.BoxGeometry(),panel=new T.PlaneGeometry(),ring=new T.TorusGeometry(1,.16,5,14);
  const peg=new T.SphereGeometry(1,10,7);
  function add(shape,mat,x,y,z,w,h,d,tile){
    const geo=shape.clone();geo.scale(w,h,d);geo.translate(x,y,z);
    if(tile!==undefined){
      const uv=geo.attributes.uv;
      for(let k=0;k<uv.count;k++)uv.setXY(k,(tile%4+.012+.976*uv.getX(k))/4,(7-Math.floor(tile/4)+.015+.97*uv.getY(k))/8);
    }
    if(!parts.has(mat))parts.set(mat,[]);parts.get(mat).push(geo);
  }
  const x0=-.212,y0=.13,cw=.080,ch=.073,x1=x0+6*cw,y1=y0+5*ch;
  // The cabinet sits against the back, behind the original scale and open side drawers.
  add(cube,wood,(x0+x1)/2,(y0+y1)/2,-.340,x1-x0+.024,y1-y0+.023,.075);
  for(let row=0;row<5;row++)for(let col=0;col<6;col++){
    const x=x0+(col+.5)*cw,y=y1-(row+.5)*ch;
    const offset=(row===1 && col===1 || row===3 && col===4) ? .009 : 0;
    const z=-.295+.0006*((col+row*3)%4)+offset;
    add(cube,wood,x,y,z-.008,cw-.0037,ch-.0035,.015);
    add(panel,drawers,x,y,z,cw-.0037,ch-.0035,1,row*6+col);
    add(peg,brass,x,y-.003,z+.0018,.0030,.0033,.0030);
    add(ring,brass,x,y-.009,z+.0038,.0054,.006,.0055);
  }
  add(cube,wood,(x0+x1)/2,.078,-.345,x1-x0+.008,.107,.081);
  for(const x of [x0-.004,x1+.004])add(cube,wood,x,(.044+y1)/2,-.295,.009,y1-.036,.022);
  for(const y of [y0-.004,y1+.005])add(cube,wood,(x0+x1)/2,y,-.292,x1-x0+.022,.009,.029);
  add(peg,lamp,lampPosition.x,lampPosition.y,lampPosition.z,.010,.012,.010);
  for(const [mat,partsOfMat] of parts){
    const m=new T.Mesh(mergeGeometries(partsOfMat),mat);m.name=mat.name;
    m.castShadow=m.receiveShadow=true;
    if(mat!==lamp)lightBay(mat,new T.Matrix4(),false);
    model.add(m);for(const geom of partsOfMat)geom.dispose();
  }
  cube.dispose();panel.dispose();ring.dispose();peg.dispose();
}
