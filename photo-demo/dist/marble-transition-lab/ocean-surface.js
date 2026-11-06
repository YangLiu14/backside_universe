import * as THREE from 'three';

// A convex cap sampled along the same rounded perimeter as the calibrated desk.
// The undisplaced positions remain the mean water datum for picking and docking.
export function waterCap(shape,surface,inverse,coasts){
  const outline=shape.getPoints(16),rim=[],positions=[],uv=[],weights=[],index=[];
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],steps=Math.ceil(a.distanceTo(b)/.014);
    for(let j=0;j<steps;j++)rim.push(a.clone().lerp(b,j/steps));
  }
  const center=rim.reduce((p,q)=>p.add(q),new THREE.Vector2()).divideScalar(rim.length);
  const local=new THREE.Vector3(),p=new THREE.Vector2(),rings=44;
  const edges=coasts.flatMap(loop=>loop.map((a,i)=>{
    const b=loop[(i+1)%loop.length],dx=b.x-a.x,dz=b.y-a.y;
    return {x:a.x,z:a.y,dx,dz,length:dx*dx+dz*dz};
  }));
  function vertex(x,z,r){
    positions.push(x,surface(x,z),z);
    local.set(x,surface(x,z),z).applyMatrix4(inverse);
    uv.push((local.x+2.1)/4.2,1-(local.z+.85)/1.7);
    let d2=1;
    for(const e of edges){
      const t=THREE.MathUtils.clamp(((x-e.x)*e.dx+(z-e.z)*e.dz)/e.length,0,1);
      d2=Math.min(d2,(x-e.x-t*e.dx)**2+(z-e.z-t*e.dz)**2);
    }
    weights.push(THREE.MathUtils.smoothstep(Math.sqrt(d2),.003,.04)*THREE.MathUtils.smoothstep(1-r,0,.045));
  }
  vertex(center.x,-center.y,0);
  const n=rim.length,clockwise=THREE.ShapeUtils.isClockWise(rim);
  const triangle=(a,b,c)=>index.push(a,clockwise?c:b,clockwise?b:c);
  for(let k=1;k<=rings;k++){
    for(let i=0;i<n;i++){
      p.copy(center).lerp(rim[i],k/rings);vertex(p.x,-p.y,k/rings);
      const a=1+(k-1)*n+i,b=1+(k-1)*n+(i+1)%n;
      if(k===1)triangle(0,a,b);
      else{triangle(a-n,a,b);triangle(a-n,b,b-n);}
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('waveWeight',new THREE.Float32BufferAttribute(weights,1));
  geometry.setIndex(index);geometry.computeVertexNormals();
  return geometry;
}

// Height and analytic gradient share phase. Long swells carry the silhouette;
// short capillary ripples break up the reflected sky without moving island roots.
export const waveField=`
  vec3 component(vec2 p,vec2 dir,float k,float amplitude,float phase){
    float a=k*dot(p,dir)+phase;
    return vec3(amplitude*sin(a),amplitude*k*cos(a)*dir);
  }
  vec3 swell(vec2 p,float t){
    vec2 current=vec2(sin(dot(p,vec2(13.1,9.7))-.31*t),cos(dot(p,vec2(8.6,-15.2))+.37*t));
    vec2 q=p+.029*current;
    vec3 wave=component(q,vec2(.94,.34),31.,.0022,-t*1.68);
    wave+=component(q+.013*current.yx,vec2(-.46,.89),49.,.0014,-t*2.09+.8);
    wave+=component(p+.019*current,vec2(.71,-.70),73.,.00077,t*2.54);
    wave+=component(q,vec2(.17,.985),91.,.00042,-t*2.89);
    wave+=component(p,vec2(.97,-.24),116.,.00029,-t*3.21);
    return wave;
  }
`;
