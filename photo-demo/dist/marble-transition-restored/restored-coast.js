import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** A permanent miniature coastline on the BACK of the photographed objects.
 * Geometry never follows the camera or grows with progress. Its discovery comes
 * from the camera passing the opaque laptop, book and ceramic cup silhouettes.
 */
export function createDeskHoliday(scene,room,photoTexture) {
  const group=new THREE.Group();group.name='One coastline behind the desk objects';scene.add(group);
  const material=(color,roughness=.8,extra={})=>new THREE.MeshStandardMaterial({color,roughness,...extra});
  const stone=material('#bca985'),paleStone=material('#d0c1a0'),paper=material('#d5c9aa'),wood=material('#94704d'),darkWood=material('#654e39');
  const leaf=material('#607348',.88,{side:THREE.DoubleSide}),leafLight=material('#82905b',.86,{side:THREE.DoubleSide});
  const brass=material('#aa854c',.42,{metalness:.45});
  function mesh(g,m,p=[0,0,0],parent=group){const o=new THREE.Mesh(g,m);o.position.set(...p);o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
  function box(w,h,d,m,p,parent=group){return mesh(new THREE.BoxGeometry(w,h,d),m,p,parent);}
  function bar(a,b,r,m,parent=group){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),D=B.clone().sub(A);const o=mesh(new THREE.CylinderGeometry(r,r,D.length(),7),m,A.add(B).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),D.normalize());return o;}
  const time={value:0};let seed=81021;const random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
  // Coordinates here are world x,z. Shapes use x,-z so their top faces point +Y.
  function shapeFrom(points){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();return s;}
  function organicSlab(points,height,depth,m,parent=group){const g=new THREE.ExtrudeGeometry(shapeFrom(points),{depth,bevelEnabled:true,bevelSize:.008,bevelThickness:.005,bevelSegments:3,curveSegments:12});g.rotateX(-Math.PI/2);return mesh(g,m,[0,height,0],parent);}
  const cup=room.cupPosition,book=room.books.position;

  // The bay is tucked behind the screen and book. It never spreads onto the
  // front keyboard or the empty foreground desk like the previous water mat.
  const shoreline=new THREE.Shape();
  shoreline.moveTo(-.23,.35);
  shoreline.bezierCurveTo(-.31,.53,-.25,.72,-.08,.78);
  shoreline.bezierCurveTo(.18,.86,.39,.83,.56,.72);
  shoreline.bezierCurveTo(.74,.61,.92,.66,1.11,.76);
  shoreline.bezierCurveTo(1.31,.88,1.63,.85,1.77,.72);
  shoreline.bezierCurveTo(1.88,.58,1.71,.41,1.54,.31);
  shoreline.bezierCurveTo(1.43,.23,1.46,.14,1.48,.06);
  shoreline.bezierCurveTo(1.41,.01,1.30,.01,1.20,.08);
  shoreline.bezierCurveTo(1.08,.17,1.13,.32,1.00,.39);
  shoreline.bezierCurveTo(.86,.48,.71,.40,.57,.48);
  shoreline.bezierCurveTo(.38,.57,.25,.55,.13,.42);
  shoreline.bezierCurveTo(.03,.31,-.12,.28,-.23,.35);
  const seaGeometry=new THREE.ShapeGeometry(shoreline,46);seaGeometry.rotateX(-Math.PI/2);
  const seaMaterial=new THREE.MeshPhysicalMaterial({color:'#2b777c',roughness:.2,metalness:.12,clearcoat:.8,clearcoatRoughness:.23,envMapIntensity:.72});
  seaMaterial.onBeforeCompile=shader=>{
    shader.uniforms.coastTime=time;
    shader.vertexShader='varying vec3 coastPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\ncoastPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='uniform float coastTime; varying vec3 coastPosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      vec2 q=coastPosition.xz;
      float dx=.055*cos(q.x*38.+q.y*25.-coastTime*.85)+.022*cos(q.x*57.-q.y*34.+coastTime*.67);
      float dz=.036*cos(q.x*38.+q.y*25.-coastTime*.85)-.018*cos(q.x*57.-q.y*34.+coastTime*.67);
      normal=normalize(normal+mat3(viewMatrix)*vec3(-dx,0.,-dz));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float shallows=.5+.5*sin(coastPosition.x*7.+coastPosition.z*5.);
      diffuseColor.rgb*=.91+.09*shallows;
      float caustic=pow(max(0.,sin(coastPosition.x*55.+coastPosition.z*27.+coastTime*.34)*sin(coastPosition.x*34.-coastPosition.z*51.-coastTime*.3)),5.);
      diffuseColor.rgb+=vec3(.023,.045,.035)*caustic;`);
  };
  const water=mesh(seaGeometry,seaMaterial,[0,.022,0]);water.castShadow=false;water.name='Shared back-side bay';
  const waterBedGeometry=new THREE.ExtrudeGeometry(shoreline,{depth:.011,bevelEnabled:true,bevelSize:.006,bevelThickness:.003,bevelSegments:2,curveSegments:30});waterBedGeometry.rotateX(-Math.PI/2);
  mesh(waterBedGeometry,material('#376c70',.36),[0,.005,0]).castShadow=false;

  // Limestone behind the laptop: a low shoreline plus a rock face hugging the
  // back shell, leaving the upper aluminium panel recognisable from behind.
  organicSlab([[-.25,-.31],[-.24,-.53],[-.13,-.66],[.07,-.71],[.32,-.66],[.49,-.54],[.52,-.32],[.28,-.28]],.025,.031,stone);
  organicSlab([[-.20,-.30],[-.17,-.48],[.01,-.58],[.22,-.55],[.39,-.45],[.44,-.30]],.058,.027,paleStone);
  organicSlab([[-.13,-.285],[-.12,-.39],[.02,-.46],[.18,-.44],[.28,-.34],[.29,-.28]],.09,.026,stone);
  for(let i=0;i<9;i++){
    const rock=mesh(new THREE.IcosahedronGeometry(.026+random()*.012,2),i%3?stone:paleStone,[-.22+i*.077,.05+random()*.025,-.59-Math.sin(i*.53)*.09]);rock.scale.set(1.2,.6+random()*.7,.8);rock.rotation.set(random(),random()*3,random());
  }
  // A little carved timber doorway sits against the computer's back, with its
  // path coming out toward -Z. Nothing is pasted on the front display.
  const gate=new THREE.Group();gate.position.set(.035,.113,-.31);group.add(gate);
  box(.108,.13,.012,material('#294345'),[0,.065,0],gate);
  for(const x of [-.061,.061])box(.013,.145,.026,darkWood,[x,.073,-.01],gate);
  box(.139,.015,.03,wood,[0,.145,-.012],gate);
  for(let i=0;i<6;i++)box(.016,.12,.005,i%2?wood:darkWood,[-.045+i*.018,.061,-.012],gate);
  const lanternMaterial=new THREE.MeshStandardMaterial({color:'#cbb786',emissive:'#f6bf71',emissiveIntensity:.55,roughness:.5});
  for(const x of [-.088,.088]){
    const lamp=mesh(new THREE.CylinderGeometry(.009,.009,.023,8),lanternMaterial,[x,.122,-.021],gate);
    mesh(new THREE.ConeGeometry(.014,.01,8),brass,[x,.138,-.021],gate);lamp.castShadow=false;
  }
  // The rear edge of the blue book becomes a folded stack of coastal pages.
  const terrace=new THREE.Group();terrace.position.copy(book);group.add(terrace);terrace.name='Coast folded from the rear book pages';
  for(let i=0;i<6;i++){
    const inset=i*.013;
    const pages=[[-.37+inset,-.19],[-.34+inset,-.30],[.02,-.35],[.28-inset,-.30],[.31-inset,-.18],[.18-inset,-.12],[-.16+inset,-.12]];
    const page=organicSlab(pages,.049+i*.015,.011,i%2?paper:paleStone,terrace);page.rotation.y=-.025+i*.009;
  }
  const cottageSlot=new THREE.Group();cottageSlot.position.set(-.24,.146,-.28);cottageSlot.rotation.y=Math.PI-.2;terrace.add(cottageSlot);
  let cottageReady=false;
  const ready=new GLTFLoader().loadAsync('../assets/holiday-house.glb').then(gltf=>{
    const model=gltf.scene,bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=Math.min(.18/size.x,.16/size.z,.19/size.y);model.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
    const wrapper=new THREE.Group();wrapper.add(model);wrapper.scale.setScalar(scale);cottageSlot.add(wrapper);
    model.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.envMapIntensity=.48;if('roughness'in m)m.roughness=Math.max(.65,m.roughness);}});cottageReady=true;
  }).catch(()=>{
    box(.16,.13,.12,paper,[0,.065,0],cottageSlot);const roof=mesh(new THREE.ConeGeometry(.135,.09,4),material('#a46c50'),[0,.175,0],cottageSlot);roof.rotation.y=Math.PI/4;
    box(.034,.078,.008,material('#386071'),[.035,.039,.064],cottageSlot);
  });
  // Tiny stone stairs descend from the rear page terrace into the shared bay.
  for(let i=0;i<7;i++)box(.082,.014,.027,i%2?paper:stone,[book.x-.09,.145-i*.014,book.z-.13-i*.026]);

  // All wooden paths form a Y: computer doorway -> book cottage -> cup harbour.
  // Instancing keeps the many fine planks/posts from becoming hundreds of draws.
  const paths=[
    new THREE.CatmullRomCurve3([new THREE.Vector3(.035,.117,-.34),new THREE.Vector3(.02,.099,-.46),new THREE.Vector3(.28,.065,-.61),new THREE.Vector3(.59,.052,-.62),new THREE.Vector3(.87,.054,-.57),new THREE.Vector3(1.13,.067,-.62),new THREE.Vector3(book.x-.12,.095,book.z-.28)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(.87,.054,-.57),new THREE.Vector3(1.02,.057,-.41),new THREE.Vector3(1.16,.061,-.26),new THREE.Vector3(cup.x+.065,.065,cup.z-.16)])
  ];
  const plankRecords=[],postRecords=[],matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);
  for(const path of paths){
    const count=Math.ceil(path.getLength()/.021);
    for(let i=0;i<=count;i++){
      const t=i/count,p=path.getPointAt(t),tangent=path.getTangentAt(t);const yaw=Math.atan2(tangent.x,tangent.z);
      quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,yaw);matrix.compose(p,quat,scale);plankRecords.push(matrix.clone());
      if(i%6===0)for(const side of [-1,1]){
        const x=p.x+Math.cos(yaw)*.033*side,z=p.z-Math.sin(yaw)*.033*side;
        const height=p.y+.026-.025;matrix.compose(new THREE.Vector3(x,.025+height*.5,z),new THREE.Quaternion(),new THREE.Vector3(1,height,1));postRecords.push(matrix.clone());
      }
    }
    for(const side of [-1,1]){
      const rail=Array.from({length:65},(_,i)=>{const p=path.getPointAt(i/64),t=path.getTangentAt(i/64);return p.add(new THREE.Vector3(t.z*.033*side,.027,-t.x*.033*side));});
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail),70,.0017,5,false),wood);
    }
  }
  const planks=new THREE.InstancedMesh(new THREE.BoxGeometry(.069,.007,.018),wood,plankRecords.length);
  plankRecords.forEach((m,i)=>{planks.setMatrixAt(i,m);planks.setColorAt(i,new THREE.Color(i%4?'#b49a73':'#907551'));});planks.castShadow=planks.receiveShadow=true;group.add(planks);
  const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.0028,.0035,1,6),darkWood,postRecords.length);postRecords.forEach((m,i)=>posts.setMatrixAt(i,m));posts.castShadow=posts.receiveShadow=true;group.add(posts);

  const palms=[];
  function palm(parent,x,y,z,h,phase){
    const trunk=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y,z),new THREE.Vector3(x+.012,y+h*.55,z),new THREE.Vector3(x+.035,y+h,z-.006)]);
    mesh(new THREE.TubeGeometry(trunk,18,.0055,7,false),wood,[0,0,0],parent);
    const crown=new THREE.Group();crown.position.set(x+.035,y+h,z-.006);parent.add(crown);palms.push({crown,phase});
    for(let i=0;i<9;i++){
      const g=new THREE.BufferGeometry(),vertices=[],faces=[],angle=i*Math.PI*2/9+phase,length=.14+random()*.035;
      for(let j=0;j<=16;j++){
        const t=j/16,len=t*length,w=Math.sin(t*Math.PI)*.013*(j%2?.75:1),lift=Math.sin(t*Math.PI)*.034-t*t*.038;
        for(const side of [-1,1])vertices.push(Math.cos(angle)*len-Math.sin(angle)*w*side,lift,Math.sin(angle)*len+Math.cos(angle)*w*side);
        if(j<16){const k=j*2;faces.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
      g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(faces);g.computeVertexNormals();mesh(g,i%3?leaf:leafLight,[0,0,0],crown);
    }
  }
  palm(group,-.14,.083,-.48,.24,.4);palm(terrace,.31,.138,-.23,.27,1.4);
  // A small sheltered beach at the back of the laptop, seen only after circling.
  const beach=mesh(new THREE.SphereGeometry(.105,32,16),paleStone,[.29,.061,-.52]);beach.scale.set(1.1,.13,.58);
  for(let i=0;i<2;i++){
    const chair=new THREE.Group();chair.position.set(.24+i*.068,.072,-.53);chair.rotation.y=Math.PI-.18;group.add(chair);
    box(.036,.004,.06,paper,[0,.017,0],chair);const back=box(.036,.048,.004,paper,[0,.04,-.026],chair);back.rotation.x=-.35;
    for(const side of [-1,1])bar([side*.019,0,.022],[side*.019,.024,-.025],.002,wood,chair);
    for(const x of [-.01,.01])box(.006,.001,.058,material('#678082'),[x,.0198,0],chair);
  }

  // One anchored boat sits in the water shared by all three destinations.
  const boat=new THREE.Group();group.add(boat);
  const hull=mesh(new THREE.SphereGeometry(.029,24,12),paper,[0,.007,0],boat);hull.scale.set(.65,.33,1.6);
  bar([0,.012,0],[0,.115,0],.0016,wood,boat);
  const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([.001,.11,0,.001,.022,0,.001,.022,.045],3));sail.computeVertexNormals();mesh(sail,material('#e8dcc0',.8,{side:THREE.DoubleSide}),[0,0,0],boat);
  const shoreWashMaterial=new THREE.MeshBasicMaterial({color:'#c3e1d5',transparent:true,opacity:.12,depthWrite:false});
  const washPoints=shoreline.getSpacedPoints(180).map(p=>new THREE.Vector3(p.x,.024,-p.y));
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(washPoints),200,.0016,4,false),shoreWashMaterial).castShadow=false;
  const warmLight=new THREE.DirectionalLight('#ffd09c',0);warmLight.position.copy(room.lampBase).add(new THREE.Vector3(0,1.5,0));warmLight.target.position.set(.8,.1,-.45);scene.add(warmLight,warmLight.target);
  group.visible=false;
  return {group,ready,get cottageReady(){return cottageReady;},update(t,reveal){
    time.value=t; // Visibility is controlled by the two-view discovery compositor.
    warmLight.intensity=reveal*.65;room.lampLight.intensity=1.2+reveal*1.2;lanternMaterial.emissiveIntensity=.3+reveal*.45;
    palms.forEach(({crown,phase})=>{crown.rotation.z=Math.sin(t*.64+phase)*.022;crown.rotation.x=Math.sin(t*.47+phase)*.015;});
    boat.position.set(.76+Math.sin(t*.16)*.012,.027+Math.sin(t*1.15)*.002,-.655+Math.cos(t*.13)*.009);boat.rotation.set(Math.sin(t*.9)*.015,-.35+Math.sin(t*.13)*.08,Math.sin(t*1.1)*.026);
    shoreWashMaterial.opacity=.1+Math.sin(t*.42)*.035;
  }};
}
