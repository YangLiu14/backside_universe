import * as T from 'three';
import {cutOpenings} from './gym-windows.js';

// Measured on the untouched Hi3D facade, normalized in prepare(). These cuts
// replace the fused old glazing, while retaining plaster, doors and balconies.
const bays=[[-.395,-.301,5],[-.258,-.178,4],[-.111,-.032,4],[.017,.111,5],[.165,.246,4],[.292,.370,4],[.443,.469,2]];
const floors=[[-.360,-.218],[-.053,.079],[.242,.370]];
const openings=floors.flatMap(([bottom,top],row)=>bays.map(([left,right,lights],bay)=>({left,right,bottom,top,lights,row,bay})));
const doors=[[-.468,-.414,2],[-.156,-.135,1],[.137,.161,1],[.392,.422,1]]
  .map(([left,right,leaves])=>({left,right,leaves,bottom:-.436,top:-.218}));

export function restoreClassroomWindows(school,{sky,aggregate}) {
  for(const mesh of school.children)if(mesh.isMesh)mesh.geometry=cutOpenings(mesh.geometry,[...openings,...doors],.12);
  const [w,h,d]=school.scale.toArray(),groups=new Map(),pose=new T.Object3D();
  const material=(color,roughness,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
  const frame=material(0x52665e,.49,.25),rubber=material(0x252e2c,.94),sill=material(0xb3aa94,.89);
  const wall=material(0xc7bfa6,.94),lower=material(0x758d7f,.89),floor=material(0x6e6657,.9);
  const wood=material(0x96794f,.76),steel=material(0x424e49,.72,.22),chalk=material(0x304b43,.97);
  const doorPaint=material(0x637f79,.70),doorInset=material(0x536d67,.78),brass=material(0x9b8c63,.43,.72);
  for(const mat of [doorPaint,doorInset]){
    mat.bumpMap=aggregate;mat.bumpScale=.003;
    mat.onBeforeCompile=shader=>{
      shader.uniforms.paintGrain={value:aggregate};
      shader.vertexShader='varying vec3 doorPoint;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        doorPoint=(instanceMatrix*vec4(transformed,1.)).xyz;`);
      shader.fragmentShader='varying vec3 doorPoint;uniform sampler2D paintGrain;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 uv=doorPoint.xy*vec2(39.*7.,11.1*.8);
        diffuseColor.rgb*=.87+.19*texture2D(paintGrain,uv).g+.07*texture2D(paintGrain,uv*.13).r;`);
    };
  }
  for(const mat of [frame,sill,wall,lower,wood]){mat.bumpMap=aggregate;mat.bumpScale=mat===frame?.001:.003;}
  // A room receives only the solid angle of sky admitted by the opening.
  // Global IBL otherwise lights a closed back wall like an outdoor facade.
  for(const mat of [wall,lower,floor,wood,steel,chalk])mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying float roomDepth;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      roomDepth=(instanceMatrix*vec4(transformed,1.)).z;`);
    shader.fragmentShader='varying float roomDepth;\n'+shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
      float aperture=mix(.12,.58,smoothstep(-.20,.25,roomDepth));
      reflectedLight.indirectDiffuse*=aperture;
      reflectedLight.indirectSpecular*=aperture;`);
  };
  const glass=new T.MeshPhysicalMaterial({color:0xc1d1ce,roughness:.10,metalness:0,ior:1.51,transparent:true,opacity:.23,depthWrite:false});
  // Sky reflection remains continuous with the visible sunset, including at
  // grazing angles. Pane normals and physical frame shadows supply depth.
  glass.onBeforeCompile=shader=>{
    shader.uniforms.schoolSky={value:sky};
    shader.vertexShader='varying vec3 glassWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      glassWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;`);
    shader.fragmentShader='varying vec3 glassWorld;uniform samplerCube schoolSky;\n'+shader.fragmentShader
      .replace('#include <opaque_fragment>',`
        vec3 eye=normalize(cameraPosition-glassWorld);
        vec3 faceNormal=inverseTransformDirection(normal,viewMatrix);
        float f=.04+.96*pow(1.-abs(dot(eye,faceNormal)),5.);
        vec3 reflection=textureCube(schoolSky,reflect(-eye,faceNormal)).rgb;
        outgoingLight=mix(vec3(.085,.115,.102),reflection,.48+.50*f);
        diffuseColor.a=.16+.72*f;
        #include <opaque_fragment>`);
  };
  function box(mat,x,y,z,sx,sy,sz,yaw=0){
    pose.position.set(x,y,z);pose.scale.set(sx,sy,sz);pose.rotation.set(0,yaw,0);pose.updateMatrix();
    if(!groups.has(mat))groups.set(mat,[]);groups.get(mat).push(pose.matrix.clone());
  }
  for(const o of openings){
    const {left,right,bottom,top,lights,row,bay}=o,width=right-left,height=top-bottom;
    const x=(left+right)/2,y=(bottom+top)/2,front=.263;
    box(sill,x,bottom-.035/h,front+.025/d,width+.12/w,.075/h,.24/d);
    for(const edge of [left,right]){
      box(sill,edge,y,.222,.065/w,height+.08/h,.09);
      box(frame,edge,y,front,.067/w,height+.067/h,.080/d);
    }
    for(const edge of [bottom,top])box(frame,x,edge,front,width,.070/h,.080/d);
    const transom=top-.40/h;
    box(frame,x,transom,front,width,.054/h,.065/d);
    for(let col=0;col<lights;col++){
      const a=left+col*width/lights,b=left+(col+1)*width/lights,c=(a+b)/2;
      if(col)box(frame,a,y,front,.048/w,height,.065/d);
      for(const [lo,hi] of [[bottom,transom],[transom,top]]){
        // Thin gasket strips keep the clear pane center transparent.
        for(const e of [a,b])box(rubber,e,(lo+hi)/2,front-.022/d,.012/w,hi-lo,.014/d);
        for(const e of [lo,hi])box(rubber,c,e,front-.022/d,b-a,.012/h,.014/d);
        box(glass,c,(lo+hi)/2,front-.030/d,b-a-.045/w,hi-lo-.038/h,.005/d);
      }
      if(col===1&&bay!==6)box(steel,b-.080/w,transom-.18/h,front+.045/d,.014/w,.095/h,.019/d);
    }
    // A shallow classroom with true floor/ceiling and window reveals. Desks
    // and chair backs read through the panes as the visitor passes sideways.
    const base=bottom-.75/h,ceil=top+.45/h,back=-.20,roomWidth=width+.12/w;
    box(wall,x,(base+ceil)/2,back,roomWidth,ceil-base,.075/d);
    box(lower,x,base+.61/h,back+.047/d,roomWidth,1.22/h,.022/d);
    box(floor,x,base,-.005,roomWidth,.07/h,.54);
    box(wall,x,ceil,-.005,roomWidth,.07/h,.54);
    for(const edge of [left-.06/w,right+.06/w])box(wall,edge,(base+ceil)/2,-.005,.08/w,ceil-base,.54);
    if(bay!==6){
      box(wood,x,base+1.73/h,back+.07/d,roomWidth*.85,1.03/h,.06/d);
      box(chalk,x,base+1.73/h,back+.11/d,roomWidth*.85-.07/w,.95/h,.015/d);
      for(let aisle=0;aisle<2;aisle++)for(let seat=0;seat<2;seat++){
        const px=x+(seat-.5)*.88/w,pz=.065-aisle*.145;
        box(wood,px,base+.74/h,pz,.68/w,.038/h,.45/d);
        box(wood,px,base+.46/h,pz+.57/d,.38/w,.035/h,.38/d);
        box(wood,px,base+.74/h,pz+.74/d,.38/w,.24/h,.029/d);
        for(const sign of [-1,1]){
          box(steel,px+sign*.27/w,base+.35/h,pz,.028/w,.70/h,.035/d);
          box(steel,px+sign*.15/w,base+.36/h,pz+.69/d,.024/w,.72/h,.024/d);
        }
      }
    }
  }
  for(const o of doors){
    const {left,right,bottom,top,leaves}=o,cx=(left+right)/2,width=right-left,height=top-bottom,front=.265;
    const transom=top-.40/h;
    box(rubber,cx,(bottom+top)/2,front-.075/d,width,height,.065/d);
    box(sill,cx,bottom-.025/h,front+.03/d,width+.08/w,.05/h,.24/d);
    for(const x of [left,right])box(doorPaint,x,(bottom+top)/2,front,.075/w,height,.09/d);
    for(const y of [top,transom])box(doorPaint,cx,y,front,width,.07/h,.09/d);
    box(glass,cx,(top+transom)/2,front-.028/d,width-.06/w,top-transom-.06/h,.005/d);
    const lights=leaves===2?4:2;
    for(let n=1;n<lights;n++)box(doorPaint,left+width*n/lights,(top+transom)/2,front,.032/w,top-transom,.048/d);
    for(let leaf=0;leaf<leaves;leaf++){
      const a=left+width*leaf/leaves+.008/w,b=left+width*(leaf+1)/leaves-.008/w,x=(a+b)/2;
      box(doorInset,x,(bottom+transom)/2,front-.026/d,b-a,transom-bottom,.050/d);
      for(const edge of [a+.05/w,b-.05/w])box(doorPaint,edge,(bottom+transom)/2,front,.10/w,transom-bottom,.075/d);
      for(const y of [bottom+.07/h,bottom+.72/h,transom-.07/h])box(doorPaint,x,y,front,b-a,.14/h,.075/d);
      for(const [lo,hi] of [[bottom+.15/h,bottom+.64/h],[bottom+.81/h,transom-.15/h]]){
        const panelLeft=a+.14/w,panelRight=b-.14/w;
        for(const px of [panelLeft,panelRight])box(doorPaint,px,(lo+hi)/2,front+.018/d,.025/w,hi-lo,.024/d);
        for(const py of [lo,hi])box(doorPaint,x,py,front+.018/d,panelRight-panelLeft,.025/h,.024/d);
      }
      const latch=leaves===2&&leaf===0?b-.11/w:a+.11/w;
      box(brass,latch,bottom+.99/h,front+.055/d,.045/w,.19/h,.018/d);
      box(brass,latch,bottom+1.015/h,front+.092/d,.016/w,.13/h,.018/d);
      box(rubber,latch,bottom+.94/h,front+.067/d,.008/w,.017/h,.003/d);
      for(const y of [bottom+.26/h,transom-.22/h])box(steel,leaves===2&&leaf===0?a:b,y,front+.02/d,.035/w,.11/h,.025/d);
    }
  }
  const unit=new T.BoxGeometry();
  for(const [mat,matrices] of groups){
    const mesh=new T.InstancedMesh(unit,mat,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;
    mesh.name=mat===glass?'教学楼 / 连续晚霞玻璃':'教学楼 / 窗樘与教室';
    mesh.castShadow=mat!==glass;mesh.receiveShadow=true;school.add(mesh);
  }
  school.userData.restoredWindows=openings.length;
}
