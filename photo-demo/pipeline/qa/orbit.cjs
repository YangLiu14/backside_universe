// Exercise the actual viewer before any seek/reveal. Frame times are observations on
// this browser; static GPU work and a stationary camera during a moving handoff fail QA.
const assert=require('node:assert/strict');

async function coldOrbit(page,options){
  const result=await page.evaluate(async({range,turn,state,pose,handoff,canvas='mesh'})=>{
    const gl=document.getElementById(canvas).getContext('webgl2');
    const names=['linkProgram','bufferData','texImage2D','texSubImage2D','texStorage2D'];
    const calls=Object.fromEntries(names.map(name=>[name,0])),originals={};
    const slider=document.getElementById(range),read=()=>window[state](),raf=()=>new Promise(requestAnimationFrame);
    if(read().progress!==0)throw new Error('cold orbit must start at the source photo');
    const deadline=performance.now()+30000;
    let peak=0,prevTime,prev=read(),roomsOpened=0,stationary=0,samples=0,step=0;
    try{
      for(const name of names){
        originals[name]=gl[name];gl[name]=function(...args){calls[name]++;return originals[name].apply(this,args);};
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
    }finally{for(const [name,fn] of Object.entries(originals))gl[name]=fn;}
    return {calls,roomsOpened,samples,stationary,peakFrameMs:Math.round(peak*10)/10};
  },options);
  assert(result.samples>0,'first traversal did not sample the handoff');
  assert.equal(result.stationary,0,'camera stopped while handoff progress advanced');
  assert(Object.values(result.calls).every(n=>n===0),'first orbit uploaded static mesh resources: '+JSON.stringify(result.calls));
  return result;
}
module.exports={coldOrbit};
