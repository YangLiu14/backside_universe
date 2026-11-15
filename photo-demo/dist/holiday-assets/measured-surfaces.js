import * as T from '../vendor/three.module.js';

const surfaces=new Map();
export function loadSurface(name){
  if(!surfaces.has(name)){
    const loader=new T.TextureLoader();
    const pending=Promise.allSettled(['color','normal','rough'].map(async (channel)=>{
      const tex=await loader.loadAsync(new URL('assets/island-rooms/'+name+'-'+channel+'.jpg',import.meta.url).href);
      tex.colorSpace=channel==='color'?T.SRGBColorSpace:T.NoColorSpace;
      tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;return tex;
    })).then(results=>{
      if(results.every(r=>r.status==='fulfilled'))return results.map(r=>r.value);
      for(const r of results)if(r.status==='fulfilled')r.value.dispose();
      surfaces.delete(name);return null;
    });
    surfaces.set(name,pending);
  }
  return surfaces.get(name);
}
