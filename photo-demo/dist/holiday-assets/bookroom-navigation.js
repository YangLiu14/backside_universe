// Visibility graph over the room, doorway and furniture corners. Every segment
// uses the same clearance check as manual walking; animation never smooths a
// corner through an obstacle.
export function planWalk(start,end,walkable,furniture){
 const clear=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.0001));for(let i=0;i<=n;i++){const t=i/n;if(!walkable(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))return false;}return true;};
 if(!walkable(...start)||!walkable(...end))return null;
 const candidates=[[.043,.645],[.043,.677],[.043,.715],[.043,.751],[.020,.663],[.066,.663],[.020,.707],[.066,.707]];
 for(const {bounds:b} of furniture){for(const x of [b.min[0]-.008,b.max[0]+.008])for(const y of [-b.max[2]-.008,-b.min[2]+.008])candidates.push([x,y]);}
 const nodes=[start,end,...candidates.filter(p=>walkable(...p))],distance=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),visited=new Set();distance[0]=0;
 while(visited.size<nodes.length){let u=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(u<0||distance[i]<distance[u]))u=i;if(u<0||!Number.isFinite(distance[u]))return null;if(u===1)break;visited.add(u);for(let v=0;v<nodes.length;v++){if(visited.has(v)||!clear(nodes[u],nodes[v]))continue;const d=distance[u]+Math.hypot(nodes[v][0]-nodes[u][0],nodes[v][1]-nodes[u][1]);if(d<distance[v]){distance[v]=d;previous[v]=u;}}}
 const route=[];for(let i=1;i>=0;i=previous[i])route.unshift(nodes[i]);return route;
}
