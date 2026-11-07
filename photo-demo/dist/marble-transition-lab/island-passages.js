import * as T from 'three';
import {mergeGeometries} from '../vendor/addons/utils/BufferGeometryUtils.js';
import {openPassageGates} from './passage-gates.js';
import {woodGrain} from './grotto-access.js';

// Surveyed after the GLBs are seated in the tide. Coordinates are in each
// island's own Y-up frame. Every tread below is also its collision surface.
export const passages={
  'blue-book':[
    {name:'白崖低栈道',width:.044,points:[
      [.140,.054,.218],[.163,.056,.218],[.185,.056,.203],[.220,.056,.170],[.247,.056,.139],
      [.271,.056,.105],[.286,.056,.081],[.298,.056,.052],[.305,.055,.026],[.305,.054,0],[.289,.054,-.020]]},
    {name:'标本屋崖梯',width:.035,rail:true,points:[
      [.125,.058,.217],[.116,.084,.185],[.104,.112,.150],[.093,.131,.061],[.083,.140,.037],
      [.017,.228,.190],[-.012,.245,.182],[-.034,.244,.163]]},
    {name:'观星亭登岸梯',width:.035,rail:true,points:[
      [.151,.058,-.110],[.116,.066,-.125],[.110,.084,-.078],[.225,.159,-.035],
      [.268,.199,-.088],[.277,.221,-.133]]},
  ],
  'orange-book':[
    {name:'赤岩栈桥至旅舍',width:.043,rail:true,points:[
      [.073,.148,.095],[.086,.152,.097],[.099,.157,.099],[.116,.173,.102],[.144,.212,.100],[.162,.227,.104],[.170,.230,.115],[.169,.230,.132],
      [.120,.218,.180],[.076,.208,.218],[.042,.197,.270],[.043,.187,.321],[.086,.181,.349],[.143,.181,.349]]},
    {name:'旅舍露台外梯',width:.037,rail:true,points:[
      [.077,.183,.345],[.080,.210,.385],[.132,.245,.414],[.189,.276,.413],
      [.221,.298,.388],[.227,.303,.359],[.219,.300,.328]]},
  ],
  phone:[
    {name:'浴屋门前踏步',width:.046,points:[
      [-.103,.060,-.070],[-.088,.063,-.070],[-.077,.0685,-.070],
      [-.065,.077,-.070],[-.055,.076,-.071],[-.042,.070,-.075]]},
  ],
  grotto:[
    {name:'石阶接梯',width:.027,points:[
      [.194,-.319,-.904],[.185,-.310,-.885],[.180,-.304,-.873],[.176,-.298,-.863],[.171,-.293,-.852]]},
    {name:'海蚀洞灯塔检修栈桥',width:.036,rail:true,points:[
      [-.055,-.163,-.854],[-.100,-.163,-.856],[-.155,-.166,-.840],[-.245,-.176,-.788],
      [-.235,-.171,-.739],[-.210,-.167,-.680],[-.221,-.167,-.662]]},
  ],
};
const up=new T.Vector3(0,1,0);
let boards,braces;
function makePassage({name,width,points,rail},base){
  const stations=points.map(p=>new T.Vector3(...p)),segments=[],lengths=[0],sides=[];
  for(let i=1;i<stations.length;i++){
    const d=stations[i].clone().sub(stations[i-1]);d.y=0;
    lengths.push(lengths[i-1]+d.length());segments.push(new T.Vector3().crossVectors(up,d).normalize());
  }
  for(let i=0;i<stations.length;i++){
    const left=segments[Math.max(0,i-1)],right=segments[Math.min(i,segments.length-1)];
    const bisector=left.clone().add(right).normalize();
    sides.push(bisector.multiplyScalar(width*.5/Math.max(.46,bisector.dot(right))));
  }
  const top=[],joinery=[],stock=new T.BoxGeometry(1,1,1);
  function beam(a,b,thickness,height,vertical=false){
    const d=b.clone().sub(a),length=d.length();d.normalize();
    const side=vertical?new T.Vector3(0,0,1):new T.Vector3().crossVectors(d,up).normalize();
    const rotation=new T.Matrix4().makeBasis(d,side.clone().cross(d),side);
    rotation.scale(new T.Vector3(length,height,thickness));rotation.setPosition(a.clone().lerp(b,.5));
    joinery.push(stock.clone().applyMatrix4(rotation));
  }
  for(let i=0;i<segments.length;i++){
    const a=stations[i],b=stations[i+1],length=lengths[i+1]-lengths[i];
    const point=(t,edge)=>a.clone().lerp(b,t).addScaledVector(sides[i].clone().lerp(sides[i+1],t),edge);
    const count=Math.max(1,Math.ceil(length/.0095),Math.ceil(Math.abs(a.y-b.y)/.0048));
    for(let j=0;j<count;j++){
      // Shared mitered edges at bends leave the full landing underfoot.
      const g=stock.clone(),p=g.attributes.position;
      const high=T.MathUtils.lerp(a.y,b.y,(j+.5)/count);
      for(let k=0;k<p.count;k++){
        const from=p.getZ(k)<0,t=(j+(from?.006:.994))/count;
        const v=point(t,p.getX(k)*2);
        p.setXYZ(k,v.x,high+(p.getY(k)-.5)*.0031,v.z);
      }
      g.computeVertexNormals();top.push(g);
    }
    if(!rail)continue;
    for(const edge of [-1,1]){
      const underside=t=>point(t,edge*.80).addScaledVector(up,-.0045);
      beam(underside(0),underside(1),.0032,.0055);
      const n=Math.max(1,Math.ceil(length/.063));
      for(let j=0;j<n;j++){
        const t=(j+.5)/n,along=lengths[i]+t*length;
        if(along<width*.70||lengths.at(-1)-along<width*.70)continue;
        const p=point(t,edge*.95);
        beam(p.clone().addScaledVector(up,-.006),p.clone().addScaledVector(up,.019),.0028,.0028,true);
        const bay=.081;
        if(Math.floor((along-length/n*.5)/bay)!==Math.floor((along+length/n*.5)/bay)){
          const pier=point(t,edge*.80);
          beam(pier.clone().setY(base),pier.clone().addScaledVector(up,-.004),.0042,.0042,true);
          const tip=point(Math.min(1,t+.024/length),edge*.80).addScaledVector(up,-.005);
          beam(pier.clone().addScaledVector(up,-.035),tip,.0026,.0032);
        }
      }
      const t0=Math.max(0,(width*.70-lengths[i])/length);
      const t1=Math.min(1,(lengths.at(-1)-width*.70-lengths[i])/length);
      if(t1>t0)beam(point(t0,edge*.95).addScaledVector(up,.018),point(t1,edge*.95).addScaledVector(up,.018),.0021,.0025);
    }
  }
  const group=new T.Group();group.name=name;
  for(const [pieces,material] of [[top,boards],[joinery,braces]]){
    if(!pieces.length)continue;
    const mesh=new T.Mesh(mergeGeometries(pieces),material);mesh.castShadow=mesh.receiveShadow=true;mesh.layers.enable(3);
    group.add(mesh);pieces.forEach(g=>g.dispose());
  }
  stock.dispose();return group;
}
export function addIslandPassages(root,id){
  if(!passages[id])return;
  const gates={
    'blue-book':[
      [[-.025,.243,.162],[.013,.291,.205]],
      // Cut across the full rail, parallel to the observatory entrance.
      // Its arched stone facade sits directly behind the inner lip of the rail.
      [[-.021,.204,.0097],[.021,.239,.049],{origin:[.2764,0,-.146],yaw:Math.atan2(-.31,.95)}],
    ],
    'orange-book':[[[.202,.288,.332],[.248,.362,.390]]],
  };
  if(gates[id])openPassageGates(root,gates[id]);
  boards??=new T.MeshStandardMaterial({map:woodGrain(),color:0xb59c7a,roughness:.9});
  braces??=new T.MeshStandardMaterial({map:boards.map,color:0x78644e,roughness:.92});
  for(const path of passages[id])root.add(makePassage(path,id==='grotto'?-.37:.022));
}
