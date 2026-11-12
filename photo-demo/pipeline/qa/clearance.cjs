// QA only: observe Three's real scenes before navigation; never ship scene handles
// or traverse model vertices in the interactive render loop.
async function observeScenes(page){
  await page.addInitScript(()=>{
    const events=window.__THREE_DEVTOOLS__=new EventTarget();
    window.qaScenes=[];
    events.addEventListener('observe',({detail})=>{if(detail.isScene)window.qaScenes.push(detail);});
  });
}

// In the obstacle parent's coordinate system, measure mesh vertices rather than
// rotated world bounding boxes. With endpoint bounds, the union covers a fixed-
// orientation straight translation. Curved/rotating actions need other sweeps.
async function furnitureClearance(page,{obstacle,subjects,margin=0},start=null){
  return page.evaluate(async({obstacle,subjects,margin,start})=>{
    const T=await import('three');
    const fixed=window.qaScenes.map(scene=>scene.getObjectByName(obstacle)).find(Boolean);
    if(!fixed)throw new Error('missing clearance obstacle: '+obstacle);
    const space=fixed.parent;
    space.updateWorldMatrix(true,true);
    const inverse=space.matrixWorld.clone().invert(),matrix=new T.Matrix4(),vertex=new T.Vector3();
    const boxes=subjects.map((name,i)=>{
      const obj=space.getObjectByName(name);
      if(!obj)throw new Error('missing clearance subject: '+name);
      const box=new T.Box3();obj.traverse(mesh=>{
        if(!mesh.isMesh)return;
        matrix.multiplyMatrices(inverse,mesh.matrixWorld);
        const pos=mesh.geometry.attributes.position;
        for(let j=0;j<pos.count;j++)box.expandByPoint(vertex.fromBufferAttribute(pos,j).applyMatrix4(matrix));
      });
      if(box.isEmpty())throw new Error('empty clearance subject: '+name);
      if(start){box.expandByPoint(vertex.fromArray(start[i].min));box.expandByPoint(vertex.fromArray(start[i].max));}
      return box;
    });
    const bounds=boxes.map(b=>({min:b.min.toArray(),max:b.max.toArray()}));
    boxes.forEach(b=>b.expandByScalar(margin));
    const tri=new T.Triangle();let triangles=0;
    fixed.traverse(mesh=>{
      if(!mesh.isMesh)return;
      matrix.multiplyMatrices(inverse,mesh.matrixWorld);
      const {attributes:{position},index}=mesh.geometry,count=index?.count??position.count;
      for(let j=0;j<count;j+=3){
        for(const [offset,p] of [[0,tri.a],[1,tri.b],[2,tri.c]])
          p.fromBufferAttribute(position,index?index.getX(j+offset):j+offset).applyMatrix4(matrix);
        triangles++;
        for(let i=0;i<boxes.length;i++)
          if(boxes[i].intersectsTriangle(tri))throw new Error(obstacle+' intersects '+subjects[i]+' (clearance '+margin+')');
      }
    });
    if(!triangles)throw new Error('empty clearance obstacle: '+obstacle);
    return bounds;
  },{obstacle,subjects,margin,start});
}
module.exports={observeScenes,furnitureClearance};
