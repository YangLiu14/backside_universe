import * as THREE from 'three';

// Original surface pixels remain bound to the object UVs throughout the orbit.
// Only a small lighting component is added: the source already contains exposure.
export function photographicMaterial(map,{roughness=.6,metalness=0,retention=.8}={}){
  const m=new THREE.MeshStandardMaterial({map,color:0xffffff,roughness,metalness,side:THREE.DoubleSide});
  m.onBeforeCompile=shader=>{
    shader.uniforms.photoRetention={value:retention};
    shader.fragmentShader='uniform float photoRetention;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>',`
      gl_FragColor.rgb=mix(gl_FragColor.rgb,texture2D(map,vMapUv).rgb,photoRetention);
      #include <colorspace_fragment>`);
  };
  m.customProgramCacheKey=()=>`fixed-photo-surface-${retention}`;
  return m;
}
export function quadGeometry(points){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return g;
}
