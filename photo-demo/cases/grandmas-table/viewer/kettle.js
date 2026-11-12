import * as T from 'three';

export function makeKettle(raw,fit,uniforms,scale,opening) {
  const group=new T.Group(), scaled=new T.Group(), offset=new T.Group();
  raw.rotation.y=fit.yaw;offset.position.fromArray(fit.center).negate();
  scaled.scale.fromArray(fit.dims.map((n,i)=>n/fit.nativeSize[i]));
  offset.add(raw);scaled.add(offset);group.add(scaled);
  raw.traverse(o=>{
    if(!o.isMesh)return;
    if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals();
    o.castShadow=false;o.receiveShadow=true;
    for(const mat of [].concat(o.material)){
      mat.side=T.FrontSide;
      mat.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='varying vec3 kettleWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',
          '#include <project_vertex>\nkettleWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
        shader.fragmentShader=`varying vec3 kettleWorld; uniform sampler2D originalPhoto;
          uniform mat4 sourceView; uniform vec4 intrinsics; uniform float photoMix; uniform float cutOpen;
          const float angle=${opening.toFixed(8)}; const float rs=${scale.toFixed(8)};
          float openingDistance(vec2 xy){
            vec2 q=abs(xy-vec2(0.,.716))-vec2(.89,.622)+vec2(.16);
            return min(max(q.x,q.y),0.)+length(max(q,0.))-.16;
          }
          `+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
          vec3 local=vec3(cos(angle)*kettleWorld.x-sin(angle)*kettleWorld.z,kettleWorld.y,sin(angle)*kettleWorld.x+cos(angle)*kettleWorld.z)/rs;
          float sd=openingDistance(local.xy);
          if(cutOpen>.5 && local.z>.02 && sd<0.)discard;
          `).replace('#include <tonemapping_fragment>',`#include <tonemapping_fragment>
          vec4 cv=sourceView*vec4(kettleWorld,1.);
          vec2 uv=cv.xy/max(.001,-cv.z)*intrinsics.xy+vec2(intrinsics.z,1.-intrinsics.w);
          if(all(greaterThanEqual(uv,vec2(0.))) && all(lessThanEqual(uv,vec2(1.))))
            gl_FragColor.rgb=mix(gl_FragColor.rgb, texture2D(originalPhoto,uv).rgb,smoothstep(uv.x-.035,uv.x+.035,photoMix*1.1-.05));
          `);
      };
    }
  });
  return group;
}

// Face the cut edge with a short return into the wall. Sample the actual Hi3D
// surface along the perimeter so the enamel edge follows the body taper.
export function makeLip(pot,scale,angle) {
  const cross=[],width=.89,bottom=.094,top=1.338,r=.16;
  for(const [cx,cy,start] of [[width-r,top-r,0],[-width+r,top-r,90],[-width+r,bottom+r,180],[width-r,bottom+r,270]]){
    for(let i=0;i<=12;i++){const a=T.MathUtils.degToRad(start+90*i/12);cross.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}
  }
  // Straight sides also curve around the pot in depth.
  const edge=[];
  for(let i=0;i<cross.length;i++){
    const [x,y]=cross[i],[nx,ny]=cross[(i+1)%cross.length];
    const steps=Math.max(1,Math.ceil(Math.hypot(nx-x,ny-y)/.06));
    for(let j=0;j<steps;j++)edge.push([x+(nx-x)*j/steps,y+(ny-y)*j/steps]);
  }
  const pos=[],idx=[],liner=[],raycaster=new T.Raycaster(),axis=new T.Vector3(0,1,0);
  const inward=new T.Vector3(0,0,-1).applyAxisAngle(axis,angle);
  pot.updateMatrixWorld(true);
  for(const [x,y] of edge){
    const start=new T.Vector3(x,y,2.25).multiplyScalar(scale).applyAxisAngle(axis,angle);
    raycaster.set(start,inward);
    const hit=raycaster.intersectObject(pot,true)[0];
    const z=hit?hit.point.clone().applyAxisAngle(axis,-angle).z/scale:Math.sqrt(Math.max(.05,1.27**2-x*x));
    const innerX=x*.994,innerY=.716+(y-.716)*.994;
    pos.push(x,y,z+.002, innerX,innerY,z-.037);
    const backZ=Math.min(z-.040,Math.sqrt(Math.max(.05,1.14**2-innerX**2)));
    liner.push(innerX,innerY,z-.036,innerX,.716+(y-.716)*1.027,backZ);
  }
  for(let i=0;i<edge.length;i++){const j=(i+1)%edge.length;idx.push(i*2,i*2+1,j*2,j*2,i*2+1,j*2+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
  const lip=new T.Mesh(g,new T.MeshStandardMaterial({color:0xa83a25,roughness:.50,metalness:.22,side:T.DoubleSide}));
  const lining=new T.BufferGeometry();lining.setAttribute('position',new T.Float32BufferAttribute(liner,3));lining.setIndex(idx);lining.computeVertexNormals();
  const inside=new T.Mesh(lining,new T.MeshStandardMaterial({color:0x774634,roughness:.80,side:T.DoubleSide}));
  const group=new T.Group();group.add(lip,inside);group.scale.setScalar(scale);group.rotation.y=angle;return group;
}
