// Exercise the actual viewer before any seek/reveal. Frame times are observations on
// this browser; static GPU work and a stationary camera during a moving handoff fail QA.
const assert=require('node:assert/strict');

async function coldOrbit(page,options){
  const result=await page.evaluate(async({range,turn,state,pose,handoff,streamedLOD,skinnedMotion=false,canvas='mesh'})=>{
    const gl=document.getElementById(canvas).getContext('webgl2');
    const names=['linkProgram','bufferData','texImage2D','texSubImage2D','texStorage2D'];
    const calls=Object.fromEntries(names.map(name=>[name,0])),originals={};
    const streamedCalls=Object.fromEntries(names.map(name=>[name,0]));
    // Classify only the exact vertex/index arrays and bitmap objects introduced
    // by a freshly attached near LOD. Unrelated GPU work during a download fails.
    const arrays=new WeakSet(),images=new WeakSet(),uploadedTextures=new WeakSet(),storages=[];
    const boneArrays=new WeakMap();let boneTextureUpdates=0,restoreSkinning;
    let restoreLOD;
    const read=()=>window[state]();
    if(streamedLOD){
      const {LOD}=await import('three'), add=LOD.prototype.addLevel;
      LOD.prototype.addLevel=function(root,distance,...rest){
        if(distance===0&&this.userData[streamedLOD]&&read().scenePhase>.74){
          root.traverse(o=>{
            if(!o.isMesh)return;
            for(const a of [o.geometry.index,...Object.values(o.geometry.attributes)])
              if(a)arrays.add((a.data||a).array);
            for(const m of [].concat(o.material))
              for(const value of Object.values(m))if(value?.isTexture&&value.source.data)images.add(value.source.data);
          });
        }
        return add.call(this,root,distance,...rest);
      };
      restoreLOD=()=>{LOD.prototype.addLevel=add;};
    }
    const slider=document.getElementById(range),raf=()=>new Promise(requestAnimationFrame);
    if(read().progress!==0)throw new Error('cold orbit must start at the source photo');
    const deadline=performance.now()+30000;
    let peak=0,prevTime,prev=read(),roomsOpened=0,stationary=0,samples=0,step=0;
    try{
      if(skinnedMotion){
        const {Skeleton}=await import('three'),update=Skeleton.prototype.update;
        Skeleton.prototype.update=function(...args){
          const result=update.apply(this,args),image=this.boneTexture?.image;
          if(image?.data instanceof Float32Array)boneArrays.set(image.data,[image.width,image.height]);
          return result;
        };
        restoreSkinning=()=>{Skeleton.prototype.update=update;};
      }
      for(const name of names){
        originals[name]=gl[name];gl[name]=function(...args){
          // Skeletal transforms are dynamic data, uploaded every rendered frame.
          // Exempt only the exact arrays observed on actual Three skeletons;
          // initial allocation and every unrelated texture upload still fail.
          const boneSize=name==='texSubImage2D'&&boneArrays.get(args.at(-1));
          if(boneSize&&args[0]===gl.TEXTURE_2D&&args[6]===gl.RGBA&&args[7]===gl.FLOAT
              &&args[4]===boneSize[0]&&args[5]===boneSize[1]){
            boneTextureUpdates++;return originals[name].apply(this,args);
          }
          let stream=false;
          if(streamedLOD){
            if(name==='bufferData')stream=arrays.has(args[1]);
            if((name==='texImage2D'||name==='texSubImage2D')&&images.has(args.at(-1))){
              stream=true;uploadedTextures.add(gl.getParameter(gl.TEXTURE_BINDING_2D));
            }
            if(name==='texStorage2D')storages.push(gl.getParameter(gl.TEXTURE_BINDING_2D));
          }
          (stream?streamedCalls:calls)[name]++;return originals[name].apply(this,args);
        };
      }
      if(turn)document.getElementById(turn).click();
      for(;;){
        if(!turn){
          slider.value=String(Number(slider.max)*Math.min(1,++step/100));
          slider.dispatchEvent(new Event('input',{bubbles:true}));
        }
        const t=await raf(),s=read();
        if(t>deadline)throw new Error('first orbit never reached the back');
        if(prevTime!==undefined&&s.progress>.1&&prev.progress<.95)peak=Math.max(peak,t-prevTime);
        if(s.opening&&!prev.opening)roomsOpened++;
        if(s.progress>prev.progress&&prev.progress>=handoff[0]&&s.progress<=handoff[1]){
          samples++;
          if(s[pose].every((v,i)=>v===prev[pose][i]))stationary++;
        }
        prev=s;prevTime=t;
        if(s.progress===1){await raf();break;}
      }
    }finally{
      for(const [name,fn] of Object.entries(originals))gl[name]=fn;
      restoreLOD?.();
      restoreSkinning?.();
    }
    for(const handle of storages)if(uploadedTextures.has(handle)){
      calls.texStorage2D--;streamedCalls.texStorage2D++;
    }
    return {calls,...(streamedLOD?{streamedCalls}:{}),...(skinnedMotion?{boneTextureUpdates}:{}),roomsOpened,samples,stationary,peakFrameMs:Math.round(peak*10)/10};
  },options);
  assert(result.samples>0,'first traversal did not sample the handoff');
  assert.equal(result.stationary,0,'camera stopped while handoff progress advanced');
  assert(Object.values(result.calls).every(n=>n===0),'first orbit uploaded static mesh resources: '+JSON.stringify(result.calls));
  return result;
}
module.exports={coldOrbit};
