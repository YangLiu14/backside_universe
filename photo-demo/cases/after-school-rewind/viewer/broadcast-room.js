import * as T from 'three';

// Architectural finish is fitted to the measured Hi3D room. The actor and
// furnishings keep their original geometry, UVs and provenance.
export function finishBroadcastRoom(rear, oak, floorY=-15.72) {
  const root = new T.Group(); root.name = '广播室建筑饰面'; rear.add(root);
  const wood = oak.clone();
  wood.wrapS = wood.wrapT = T.RepeatWrapping;
  wood.repeat.set(.065, .16);
  const timber = [0xb1a08b, 0xac9a86, 0xb6a58f, 0xa99886].map(color =>
    new T.MeshStandardMaterial({map: wood, color, roughness: .57, metalness: 0}));
  const plankGeometries = new Map();
  function board(width, length) {
    const key = width + ':' + length;
    if (!plankGeometries.has(key)) {
      const shape = new T.Shape();
      shape.moveTo(-width/2, -length/2); shape.lineTo(width/2, -length/2);
      shape.lineTo(width/2, length/2); shape.lineTo(-width/2, length/2); shape.closePath();
      const g = new T.ExtrudeGeometry(shape, {depth: .12, steps: 1, bevelEnabled: true,
        bevelSize: .025, bevelThickness: .025, bevelSegments: 1, curveSegments: 1});
      const uv=g.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getY(i),uv.getX(i));
      g.rotateX(-Math.PI/2); plankGeometries.set(key, g);
    }
    return plankGeometries.get(key);
  }
  // Offset the end joints; each board has its own edge and a narrow real gap.
  for (let row = 0; row < 22; row++) {
    let z = -3.9, part = 0;
    while (z < 35.3) {
      const length = Math.min(part === 0 ? 9.5 + row % 3 * 5.3 : 23.6, 35.3-z);
      const m = new T.Mesh(board(2.50, Math.max(.12, length-.075)), timber[(row+part*3)%4]);
      m.position.set(-26.9 + row*2.55, floorY, z+length/2);
      m.castShadow = m.receiveShadow = true; root.add(m); z += length; part++;
    }
  }
  const paint = new T.MeshStandardMaterial({color: 0x829583, roughness: .64, metalness: 0});
  const reveal = new T.MeshStandardMaterial({color: 0x475d50, roughness: .77});
  const metal = new T.MeshStandardMaterial({color: 0x9f967f, metalness: .75, roughness: .39});
  function bar(x,y,z,w,h,d,material) {
    const m = new T.Mesh(new T.BoxGeometry(w,h,d),material);
    m.position.set(x,y,z); m.castShadow=m.receiveShadow=true; root.add(m); return m;
  }
  if (floorY < -16) {
    // The old cutaway ended at the actor's seat. Give the independent seated
    // figure a real floor and extend the existing desk's tubular supports.
    const lowerWall=new T.MeshStandardMaterial({color:0x82694c,map:wood,roughness:.79});
    const trim=new T.MeshStandardMaterial({color:0xffffff,map:wood,roughness:.58});
    const leg=new T.MeshStandardMaterial({color:0xb0b4ad,metalness:.78,roughness:.36});
    const h=-14.9-floorY, mid=floorY+h/2;
    // The wall behind the fused old head contained holes and painted fragments.
    // Restore a continuous acoustic sheet with real perforations and dark backing.
    const panelShape=new T.Shape();
    panelShape.moveTo(-20,-14.55);panelShape.lineTo(20,-14.55);panelShape.lineTo(20,14.55);panelShape.lineTo(-20,14.55);panelShape.closePath();
    for(let x=-19.25;x<20;x+=1.25)for(let y=-13.75;y<14.2;y+=1.25){
      const hole=new T.Path();hole.absarc(x,y,.125,0,Math.PI*2,true);panelShape.holes.push(hole);
    }
    const panelGeometry=new T.ExtrudeGeometry(panelShape,{depth:.22,steps:1,bevelEnabled:false,curveSegments:4});
    panelGeometry.rotateY(Math.PI/2);
    const acoustic=new T.MeshStandardMaterial({map:wood,color:0xffffff,roughness:.76,metalness:0});
    acoustic.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb=mix(vec3(.52,.35,.16),diffuseColor.rgb,.14);`);};
    acoustic.customProgramCacheKey=()=> 'acoustic-elm-v1';
    const panel=new T.Mesh(panelGeometry,acoustic);panel.name='修复的穿孔吸音侧墙';panel.position.set(-28.0,-.05,15.5);panel.castShadow=panel.receiveShadow=true;root.add(panel);
    bar(-28.08,-.05,15.5,.12,29.1,40,new T.MeshStandardMaterial({color:0x251d13,roughness:1}));
    bar(-28.05,14.75,15.5,.8,.65,40,trim);
    bar(-26.1,-.05,-2.7,2.0,29.7,1.8,trim);
    bar(-28.5,mid,15.6,.6,h,39.5,lowerWall);bar(27.55,mid,15.6,.6,h,39.5,lowerWall);
    bar(-.5,mid,-4.1,56.5,h,.65,lowerWall);
    bar(-28.0,-14.85,15.5,.7,.6,40,trim);bar(27.0,-14.85,15.5,.7,.6,40,trim);
    bar(-.5,-14.85,-3.65,56.5,.6,.7,trim);
    for(const x of [-28.4,27.5]) {
      bar(x,(16.3+floorY)/2,35.6,1.5,16.3-floorY,2.8,trim);
      bar(x,floorY+.7,15.5,.8,1.3,40,trim);
    }
    bar(-.4,floorY+.45,35.7,56.9,.9,1.0,trim);
    bar(-.4,floorY+.7,-3.9,56.7,1.3,.9,trim);
    for(const [x,z] of [[-12,33.7],[-3,13.5],[9.38,31.01],[9.38,8.5]]) {
      const length=-10.85-floorY;
      const tube=new T.Mesh(new T.CylinderGeometry(.32,.32,length,20),leg);
      tube.position.set(x,floorY+length/2+.12,z);tube.castShadow=tube.receiveShadow=true;root.add(tube);
      bar(x,floorY+.24,z,.74,.35,.74,reveal);
    }
    const outline=[[-18.8,2],[19.5,1.4],[9.48,35.51],[9.03,36.21],[8.08,36.67],[7.36,36.71],[-15.95,34.87],[-17.16,33.96],[-17.46,32.13]];
    const shape=new T.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
    const desktop=new T.ExtrudeGeometry(shape,{depth:.10,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:1,steps:1}),uv=desktop.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,-uv.getY(i),uv.getX(i));
    desktop.rotateX(-Math.PI/2);
    const veneer=new T.Mesh(desktop,new T.MeshStandardMaterial({map:wood,color:0x9b7355,roughness:.42,metalness:0}));
    veneer.name='修复的桌面木饰面';veneer.position.y=-9.725;veneer.castShadow=veneer.receiveShadow=true;root.add(veneer);
    const page=document.createElement('canvas');page.width=1024;page.height=640;
    const ink=page.getContext('2d');ink.fillStyle='#e5d7b6';ink.fillRect(0,0,1024,640);
    ink.strokeStyle='#b6b09c';ink.lineWidth=1;
    for(let y=120;y<610;y+=47){ink.beginPath();ink.moveTo(42,y);ink.lineTo(482,y);ink.moveTo(544,y);ink.lineTo(982,y);ink.stroke();}
    ink.fillStyle='#514d42';ink.font='30px STKaiti, KaiTi, serif';ink.fillText('校园广播 · 放学后',52,77);
    ink.font='25px STKaiti, KaiTi, serif';
    for(const [i,text] of ['今天的校园广播就到这里。','操场上的同学，','明天见。'].entries())ink.fillText(text,55,156+i*47);
    ink.font='23px STKaiti, KaiTi, serif';ink.fillText('播出前：检查磁带、话筒。',552,156);ink.fillText('播出后：关闭设备电源。',552,250);
    ink.strokeStyle='#966754';ink.lineWidth=2;ink.beginPath();ink.moveTo(55,264);ink.lineTo(168,266);ink.stroke();
    const map=new T.CanvasTexture(page);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    const paper=new T.MeshStandardMaterial({map,color:0xffffff,roughness:.87,side:T.DoubleSide});
    const pages=new T.PlaneGeometry(14,7.2,32,2),position=pages.attributes.position;
    for(let i=0;i<position.count;i++)position.setZ(i,.06+.12*Math.abs(position.getX(i))/6);
    pages.computeVertexNormals();pages.rotateX(-Math.PI/2);
    const manuscript=new T.Mesh(pages,paper);manuscript.name='校园广播稿';manuscript.position.set(-7,-9.48,26.4);manuscript.rotation.y=-Math.PI/2;
    manuscript.castShadow=manuscript.receiveShadow=true;root.add(manuscript);
    const cablePath=new T.CubicBezierCurve3(new T.Vector3(1.35,-8.80,22.96),new T.Vector3(1.65,-9.28,23.36),new T.Vector3(2.30,-9.45,24.02),new T.Vector3(3.14,-9.36,24.63));
    const cable=new T.Mesh(new T.TubeGeometry(cablePath,20,.13,10,false),new T.MeshStandardMaterial({color:0x1b1b19,roughness:.48}));
    cable.name='话筒线缆接合';cable.castShadow=cable.receiveShadow=true;root.add(cable);
  }
  // The old generated console was fused into the tabletop. Restore the wood
  // beneath that footprint before seating the independent new console.
  const repairedTop=new T.MeshStandardMaterial({map:wood,color:0xb29a82,roughness:.38});
  bar(7.7,-9.76,5.15,13.7,.20,8.7,repairedTop);
  // Keep the existing opening and the campus portal unobstructed.
  const cx=3.45, cy=5.65, w=33.7, h=20.7;
  for (const side of [-1,1]) {
    bar(cx+side*w/2,cy,-.7,.68,h,1.2,paint);
    bar(cx,cy+side*h/2,-.7,w+.68,.68,1.2,paint);
    bar(cx+side*(w/2-.41),cy,-1.4,.15,h-.65,.8,reveal);
    bar(cx,cy+side*(h/2-.41),-1.4,w-.65,.15,.8,reveal);
  }
  bar(cx,cy-h/2-.25,.05,w+1.3,.42,2.6,paint);
  const screwGeometry = new T.CylinderGeometry(.085,.085,.045,10);
  screwGeometry.rotateX(Math.PI/2);
  for(const x of [cx-w/2,cx,cx+w/2])for(const y of [cy-h/2,cy+h/2]) {
    const screw=new T.Mesh(screwGeometry,metal);screw.position.set(x,y,-.075);root.add(screw);
  }
  return root;
}

export function finishInteriorMaterials(interior) {
  for(const mesh of interior.children)for(const material of [].concat(mesh.material)) {
    material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 boothPoint; varying float boothUp;\n'+shader.vertexShader.replace(
        '#include <begin_vertex>','#include <begin_vertex>\nboothPoint=position;boothUp=normal.y;');
      shader.fragmentShader='varying vec3 boothPoint; varying float boothUp;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
        #include <roughnessmap_fragment>
        float tableFinish=step(.70,boothUp)*step(-.35,boothPoint.y)*step(boothPoint.y,-.24)
          *step(-.35,boothPoint.x)*step(boothPoint.x,.235)*step(-.30,boothPoint.z);
        float wallFinish=max(step(.43,abs(boothPoint.x)),1.-smoothstep(-.40,-.35,boothPoint.z));
        roughnessFactor=mix(roughnessFactor,.38,tableFinish);
        roughnessFactor=mix(roughnessFactor,max(.76,roughnessFactor),wallFinish);
      `).replace('#include <metalnessmap_fragment>',`
        #include <metalnessmap_fragment>
        metalnessFactor*=1.-max(tableFinish,wallFinish);
      `);
    };
    material.customProgramCacheKey=()=> 'broadcast-surfaces-v1';
  }
}

export function replaceBroadcastEquipment(booth, pieces, rear) {
  // Volumes measured on the existing Hi3D mesh, in the room's rear coordinates.
  // Cut only above the supporting tabletop; the actor, manuscript and lamp stay.
  const inBox=(p,a,b)=>p.x>a[0]&&p.x<b[0]&&p.y>a[1]&&p.y<b[1]&&p.z>a[2]&&p.z<b[2];
  const point=new T.Vector3();
  const radioBox=[[1.0,-9.70,.9],[14.6,-3.55,9.5]],micBox=[[-11.1,-9.25,16.4],[-1.6,1.7,22.5]];
  for(const mesh of booth.children) {
    if(!mesh.isMesh)continue;
    const g=mesh.geometry, pos=g.attributes.position, index=g.index, keep=[];
    for(let i=0;i<index.count;i+=3) {
      const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
      point.set(pos.getX(a)+pos.getX(b)+pos.getX(c),pos.getY(a)+pos.getY(b)+pos.getY(c),pos.getZ(a)+pos.getZ(b)+pos.getZ(c));
      point.multiplyScalar(1/3).multiply(booth.scale).add(booth.position);
      const radio=pieces.console&&inBox(point,...radioBox);
      const mic=pieces.microphone&&inBox(point,...micBox);
      if(!radio&&!mic)keep.push(a,b,c);
    }
    g.setIndex(keep);
  }
  function install(model,height,foot) {
    const native=model.userData.native;
    // Compensate the carrier's scale to keep this new prop physically uniform.
    const factor=height/native[1];model.scale.set(native[0]*factor/.88,height,native[2]*factor/.82);
    const sole=new T.Box3();
    model.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;
      for(let i=0;i<a.count;i++){point.fromBufferAttribute(a,i);if(point.y<-.45)sole.expandByPoint(point);}});
    const anchor=sole.getCenter(new T.Vector3());anchor.y=-.5;
    model.position.copy(foot).sub(anchor.multiply(model.scale));rear.add(model);
    rear.updateWorldMatrix(true,true);booth.attach(model);
  }
  if(pieces.console)install(pieces.console,5.5,new T.Vector3(6.2,-9.65,8));
  if(pieces.microphone)install(pieces.microphone,10.2,new T.Vector3(-4.3,-9.61,19.2));
}
