import * as T from 'three';

// Positions are attached to an aperture or to the visible practical fixture.
// One shadow-casting sun per room is baked on entry, including the loaded furniture.
const settings={
  post:{sky:'#cadde6',fill:'#9b826a',sun:2.9,env:.52,
    practical:[['shade',[-.90,2.50,-3.54],[-.58,.92,-4.44],'#ffd39c',25]]},
  field:{sky:'#cee4dd',fill:'#93866f',sun:3.15,env:.53,
    practical:[['shade',[-.80,2.60,-4.20],[-1.32,1.16,-4.85],'#ffdda8',23],
               ['lamp',[1.32,2.90,-5.30],3.2,'#ffb86c',4.2]]},
  watch:{sky:'#a6c6dc',fill:'#8d7561',sun:1.60,env:.72,
    practical:[['lamp',[-1.36,1.25,-3.81],3.9,'#ffbd75',7.8]]},
  inn:{sky:'#d8dfeb',fill:'#a77c65',sun:3.10,env:.49,
    practical:[['lamp',[-1.06,.48,-5.61],5,'#ffa260',9.8],
               ['lamp',[-1.84,1.22,-3.48],3.8,'#ffd292',6.1],
               ['lamp',[-.52,3.86,-5.42],3.7,'#ffc78b',8.4]]},
  baths:{sky:'#c0e0dd',fill:'#7eaca6',sun:2.8,env:.70,
    practical:[['shade',[.1,2.80,-2.3],[-.90,.58,-3.86],'#ffebc4',15]]},
  slip:{sky:'#d9e5ed',fill:'#a3947e',sun:2.3,env:.62,
    practical:[['lamp',[2.33,1.16,-5.77],3.5,'#ffbf75',7.6]]},
  beacon:{sky:'#bfd5e3',fill:'#95826a',sun:2.25,env:.63,
    practical:[['lamp',[-.66,1.19,-3.49],3.5,'#ffbd74',7.8],
               ['lamp',[0,4.70,-2.40],4.8,'#ffdf9f',16]]},
};

export function lightRoom(scene,id,{w,d},dayColor){
  const cfg=settings[id];scene.environmentIntensity=cfg.env+.05;
  scene.add(new T.HemisphereLight(cfg.sky,cfg.fill,id==='slip'?.82:.78));
  const sunColor=new T.Color('#fff1d8');if(dayColor)sunColor.lerp(new T.Color(dayColor),.40);
  const sun=new T.DirectionalLight(sunColor,cfg.sun);
  const windowHeight=id==='inn'?2.34:id==='beacon'?2.05:2.08;
  const windowZ=-d*(id==='beacon'?.51:.43);
  const skylight=new T.PointLight(cfg.sky,id==='slip'?3:8,8.5,2);
  skylight.position.set(-w*.38,windowHeight,windowZ);scene.add(skylight);
  // This ray crosses the side window before hitting the furniture/floor.
  sun.position.set(-w/2-3.8,windowHeight+2.05,windowZ+1.30);
  sun.target.position.set(-w/2,windowHeight,windowZ);
  sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);
  const reach=Math.max(w,d)*.80;
  Object.assign(sun.shadow.camera,{left:-reach,right:reach,top:reach,bottom:-reach,near:.10,far:23});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.012;sun.shadow.bias=-.00012;
  sun.shadow.needsUpdate=true;scene.add(sun,sun.target);
  for(const [type,position,target,color,intensity] of cfg.practical){
    if(type==='shade'){
      const lamp=new T.SpotLight(color,intensity,6,Math.PI*.33,.78,2);
      lamp.position.fromArray(position);lamp.target.position.fromArray(target);scene.add(lamp,lamp.target);
    }else{
      const glow=new T.PointLight(color,intensity,target,2);glow.position.fromArray(position);scene.add(glow);
    }
  }
  return {dispose(){sun.shadow.dispose();}};
}
