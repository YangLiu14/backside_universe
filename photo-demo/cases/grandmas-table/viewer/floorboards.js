// The boards are cut to the pot lining. A recessed bed is visible through the joints.
import * as T from 'three';

function trim(poly,inside) {
  const clipped=[];
  for(let n=0;n<poly.length;n++){
    const a=poly[n],b=poly[(n+1)%poly.length],s=inside(a),t=inside(b);
    if(s>=0)clipped.push(a);
    if((s<0)!==(t<0))clipped.push([a[0]+(b[0]-a[0])*s/(s-t),a[1]+(b[1]-a[1])*s/(s-t)]);
  }
  return clipped;
}

export function timberFloor(group,elm){
  const radius=1.178,top=.082,positions=[],uvs=[],colors=[],indices=[];
  const boundary=Array.from({length:96},(_,i)=>[radius*Math.cos(-i*Math.PI/48),radius*Math.sin(-i*Math.PI/48)]);
  function board(x0,x1,z0,z1,seed){
    let poly=boundary;
    for(const edge of [p=>p[0]-x0,p=>x1-p[0],p=>p[1]-z0,p=>z1-p[1]])poly=trim(poly,edge);
    if(poly.length<3)return;
    const center=poly.reduce(([x,z],p)=>[x+p[0]/poly.length,z+p[1]/poly.length],[0,0]);
    const tone=new T.Color().setRGB(.82+.16*seed,.84+.10*seed,.82+.09*seed);
    const tip=positions.length/3;
    for(const [x,z] of poly){
      positions.push(x+(center[0]-x)*.002,top,z+(center[1]-z)*.009);
      uvs.push(x*.86+seed*8,(z-z0)*1.04+seed*4.6);
      colors.push(tone.r,tone.g,tone.b);
    }
    for(let i=1;i<poly.length-1;i++)indices.push(tip,tip+i,tip+i+1);
    for(let i=0;i<poly.length;i++){
      const j=(i+1)%poly.length,start=positions.length/3;
      for(const [k,y,light] of [[i,top,.80],[j,top,.80],[j,top-.003,.39],[i,top-.003,.39]]){
        const [x,z]=poly[k],onTop=y===top;
        positions.push(x+(onTop?(center[0]-x)*.002:0),y,z+(onTop?(center[1]-z)*.009:0));
        uvs.push(x*.86+seed*8,(z-z0)+seed*4.6);
        colors.push(tone.r*light,tone.g*light,tone.b*light);
      }
      indices.push(start,start+2,start+1,start,start+3,start+2);
    }
  }
  for(let row=0;row<17;row++){
    const z=-1.19+row*.146,offset=(row%3)*.294+.08*Math.sin(row*12.3);
    for(let column=-2;column<=1;column++){
      const x=column*.91+offset,seed=.5+.5*Math.sin(27.6*row+17.9*column);
      board(x+.0006,x+.9093,z+.0007,z+.1453,seed);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const wood=elm.clone();wood.wrapS=wood.wrapT=T.MirroredRepeatWrapping;wood.needsUpdate=true;
  const finish=new T.MeshStandardMaterial({map:wood,vertexColors:true,color:0xc4ac86,
    roughness:.69,bumpMap:wood,bumpScale:.0013,side:T.DoubleSide});
  const contacts={value:[]},stoolShift={value:0};
  finish.onBeforeCompile=shader=>{
    shader.uniforms.floorFeet=contacts;shader.uniforms.stoolShift=stoolShift;
    shader.vertexShader='varying vec2 boardPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nboardPoint=position.xz;');
    shader.fragmentShader='varying vec2 boardPoint;uniform vec2 floorFeet[16]; uniform float stoolShift;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      float contact=1.;
      for(int i=0;i<16;i++){
        vec2 foot=floorFeet[i];if(i>=4&&i<8)foot.y+=stoolShift;
        vec2 d=boardPoint-foot;
        contact=min(contact,.51+.49*smoothstep(.014,.072,length(d)));
      }
      diffuseColor.rgb*=contact;
    `);
  };
  const floor=new T.Mesh(geometry,finish);floor.name='jointed-elm-floor';floor.receiveShadow=true;group.add(floor);
  const bed=new T.Mesh(new T.CylinderGeometry(1.185,1.17,.067,96),new T.MeshStandardMaterial({color:0x392b23,roughness:.92}));
  bed.position.y=.043;group.add(bed);
  return {contacts,stoolShift};
}

// Project each actual foot onto the board. Near the floor, the signed
// quadrants isolate the four corners even for the rotated side stool.
export function feetOf(model){
  model.updateWorldMatrix(true,true);
  const inverse=model.matrixWorld.clone().invert(),minY=new T.Box3().setFromObject(model,true).min.y;
  const feet=Array.from({length:4},()=>new T.Vector3()),p=new T.Vector3(),local=new T.Vector3();
  model.traverse(o=>{
    if(!o.isMesh)return;
    const verts=o.geometry.attributes.position;
    for(let i=0;i<verts.count;i+=3){
      p.fromBufferAttribute(verts,i).applyMatrix4(o.matrixWorld);
      if(p.y>minY+.012)continue;
      local.copy(p).applyMatrix4(inverse);
      const slot=(local.x>=0?1:0)+(local.z>=0?2:0);
      feet[slot].x+=p.x;feet[slot].y++;feet[slot].z+=p.z;
    }
  });
  return feet.map(p=>new T.Vector2(p.x/Math.max(1,p.y),p.z/Math.max(1,p.y)));
}
