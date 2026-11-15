// Export the assembled underside model in an upright authoring coordinate system.
// The local renderer and GLB take their growth and road shapes from the same timeline.
import * as T from 'three';
import {authoredSeconds,revealStart} from './film-time.js';
function inspectionCopy(object){
  const copy=object.clone(true);
  // Portable glTF keeps the inspection mesh. Exporting both overlapping LODs
  // would double the storefront surfaces in viewers without a distance switch.
  const levels=[];copy.traverse(o=>{if(o.isLOD)levels.push(o);});
  for(const lod of levels){
    const detail=lod.levels[0].object;detail.visible=true;
    lod.parent.add(detail);lod.removeFromParent();
  }
  return copy;
}

export function bakeStorefront(city,role){
  const building=city.children.find(o=>o.userData.hi3dRole===role);
  if(!building)throw Error('找不到此店铺的独立模型：'+role);
  const model=inspectionCopy(building);
  model.position.set(0,0,0);model.quaternion.identity();model.scale.setScalar(1);model.visible=true;
  const shell=model.children[0];
  // Undo placement in the shoe and return to the Hi3D asset's upright scale.
  shell.quaternion.identity();shell.scale.fromArray(shell.userData.nativeSize);
  return {model};
}

export function bake(city,layout,restore){
  const start=revealStart,end=.72,seconds=authoredSeconds;
  layout.update(end);
  const copy=inspectionCopy(city);
  copy.name='SoleCity';copy.position.set(0,0,0);copy.quaternion.identity();copy.scale.setScalar(1);
  const tracks=[];
  // Sample shared frames once. Scale-to-zero also represents visibility in core glTF.
  const animated=city.children.filter(o=>o.userData.feature||o.userData.outsoleSurface||o.userData.pavementDetail);
  const frames=new Map(animated.map(o=>[o,{scale:[],position:[],weights:[]}]));
  const times=[];
  for(let f=0;f<=168;f++){
    const p=start+(end-start)*f/168;
    layout.update(p);times.push((p-start)*seconds);
    for(const o of animated){
      const frame=frames.get(o);
      frame.scale.push(...(o.visible?o.scale.toArray():[0,0,0]));
      if(o.userData.feature)frame.position.push(...o.position.toArray());
      if(o.userData.outsoleSurface)frame.weights.push(...o.morphTargetInfluences);
    }
  }
  city.children.forEach((obj,i)=>{
    const item=copy.children[i];
    item.name=obj.name || (obj.userData.feature || (obj.userData.roadTiming?'street':'outsole'))+'_'+i;
    const frame=frames.get(obj);
    if(frame){
      item.visible=true;item.scale.fromArray(frame.scale);
      tracks.push(new T.VectorKeyframeTrack(item.name+'.scale',times,frame.scale));
      if(frame.position.length){
        item.position.fromArray(frame.position);
        tracks.push(new T.VectorKeyframeTrack(item.name+'.position',times,frame.position));
      }
      if(frame.weights.length){
        item.morphTargetInfluences.fill(0);
        tracks.push(new T.NumberKeyframeTrack(item.name+'.morphTargetInfluences',times,frame.weights));
      }
    }
    if(obj.userData.roadTiming){
      const [begin,duration]=obj.userData.roadTiming;
      layout.update(end);
      // Sample the rolled paving and the cord on top of it on the same frames.
      const parts = [obj, ...obj.children].map((source, part) => {
        const target = part === 0 ? item : item.children[part-1];
        target.geometry = source.geometry.clone();
        return {source, target, rest: target.geometry.attributes.position.array, shapes: []};
      });
      const times=[], weights=[], samples=32;
      for(let j=0;j<=samples;j++){
        const p=begin+duration*j/samples;
        layout.update(p);
        for(const {source,rest,shapes} of parts){
          const delta = new Float32Array(source.geometry.attributes.position.array);
          for(let k=0;k<delta.length;k++)delta[k]-=rest[k];
          shapes.push(new T.BufferAttribute(delta,3));
        }
        times.push((p-start)*seconds);
        for(let k=0;k<=samples;k++)weights.push(+(k===j));
      }
      for(const {target,shapes} of parts){
        target.geometry.morphTargetsRelative=true;
        target.geometry.morphAttributes.position=shapes;
        target.updateMorphTargets();target.morphTargetInfluences[0]=1;target.visible=true;
        tracks.push(new T.NumberKeyframeTrack(target.name+'.morphTargetInfluences',times,weights));
      }
    }
  });
  restore();
  return {model:copy,clip:new T.AnimationClip('Heel to toe', (end-start)*seconds, tracks)};
}
