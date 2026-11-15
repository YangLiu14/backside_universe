// Sample the interactive viewer with continuous, real keyboard input at both ends
// of the street. No frame capture or timing override during the measurement.
const {playwright, installedBrowser}=require('../../pipeline/verify.cjs');
const fs=require('node:fs/promises');
async function main(out,...urls){
  const browser=await playwright().chromium.launch({executablePath:await installedBrowser(),args:['--use-angle=metal']});
  const results=[];
  try{
    const walking=urls.includes('--walk');
    const mobile=urls.includes('--mobile');
    const viewport=mobile?{width:390,height:844}:{width:1024,height:768};
    for(const url of urls.filter(v=>!v.startsWith('--'))){
      for(const entry of ['gate','bridge-stall']){
        const page=await browser.newPage({viewport,hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
        try{
          await page.addInitScript(()=>{
            const observers=window.__THREE_DEVTOOLS__=new EventTarget();
            observers.addEventListener('observe',({detail})=>{
              if(detail.domElement?.id==='mesh' && detail.info?.render)window.measureStreetRenderer=detail;
            });
          });
          await page.goto(new URL('?explore='+entry,url).href);
          await page.waitForFunction(()=>window.soleCityState?.().mode==='walk',null,{timeout:180000});
          if(!walking)await page.keyboard.down('ArrowRight');
          await page.waitForTimeout(1200);
          await page.evaluate(()=>window.soleCityWaitForDetail?.());
          const measure=page.evaluate(async()=>{
            const samplePos=()=>window.soleCityState().walkPosition;
            let previousPos=samplePos(),distanceWalked=0,framesWithDisplacement=0;
            const before=window.soleCityState().pose,renderer=window.measureStreetRenderer;
            if(!renderer)throw Error('Cannot observe the street renderer');
            const drawStart=renderer.info.render.frame;
            const calls=[],triangles=[];
            const intervals=await new Promise(done=>{
              const samples=[];let last,start;
              function frame(t){
                if(last!==undefined){
                  samples.push(t-last);calls.push(renderer.info.render.calls);triangles.push(renderer.info.render.triangles);
                  const current=samplePos(),step=Math.hypot(current[0]-previousPos[0],current[2]-previousPos[2]);
                  distanceWalked+=step;if(step>1e-7)framesWithDisplacement++;previousPos=current;
                }else start=t;
                last=t;
                if(t-start>=6000)done(samples);else requestAnimationFrame(frame);
              }
              requestAnimationFrame(frame);
            });
            const gl=document.querySelector('#mesh').getContext('webgl2');
            const ext=gl.getExtension('WEBGL_debug_renderer_info');
            const sorted=intervals.slice().sort((a,b)=>a-b),q=f=>sorted[Math.floor(f*(sorted.length-1))];
            return {drawnFrames:renderer.info.render.frame-drawStart,maxDrawCalls:Math.max(...calls),maxTriangles:Math.max(...triangles),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,frames:intervals.length,moving:before.some((k,i)=>Math.abs(k-window.soleCityState().pose[i])>.00001),fps:+(1000*intervals.length/intervals.reduce((a,b)=>a+b,0)).toFixed(1),medianMs:+q(.5).toFixed(1),p95Ms:+q(.95).toFixed(1),worstMs:+q(1).toFixed(1),framesWithDisplacement,distanceWalked:+distanceWalked.toFixed(4)};
          });
          // Keep the walk local to this gate / bridge. Alternate real keyboard
          // input from the controller across the measurement window.
          if(walking){
            let done=false;
            const settled=measure.finally(()=>{done=true;});
            let forward=true;
            while(!done){
              const key=forward?'w':'s';await page.keyboard.down(key);
              try{await Promise.race([settled,page.waitForTimeout(280)]);}finally{await page.keyboard.up(key);}
              forward=!forward;
            }
          }else await measure.finally(()=>page.keyboard.up('ArrowRight'));
          const result=await measure;
          if(walking && (result.framesWithDisplacement<result.frames*.5||result.distanceWalked<.20))
            throw Error('Walking did not move during enough frames: '+JSON.stringify(result));
          if(!walking&&!result.moving)throw Error('Camera did not rotate');
          results.push({version:new URL(url).pathname,entry,input:walking?'forward-back':'turn-right',...result});
          console.log(JSON.stringify(results.at(-1)));
          await fs.writeFile(out,JSON.stringify({viewport:[viewport.width,viewport.height],emulatedTouch:mobile,dpr:1,results},null,2));
        }finally{await page.close();}
      }
    }
  }finally{await browser.close();}
}
main(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
