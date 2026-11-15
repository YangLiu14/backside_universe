const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
async function main(){
  const [url,file,mode]=process.argv.slice(2),fps=24;
  const spec=await (await fetch(new URL('scene.json',url))).json();
  const frames=Math.round(fps*spec.animation.durationSeconds);
  const width=mode==='master'?1620:960,height=mode==='master'?1080:640;
  const audio=mode==='master'?['-i',require('node:path').join(__dirname,'viewer','morning.m4a'),'-map','0:v','-map','1:a','-c:a','copy']:[];
  const browser=await playwright().chromium.launch({headless:true,executablePath:await installedBrowser(),args:process.platform==='darwin'?['--use-angle=metal']:[]});
  const ff=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','pipe:0',...audio,'-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['pipe','inherit','inherit']});
  const done=once(ff,'exit');
  try{
    const page=await browser.newPage({viewport:{width,height}});
    await page.goto(url);
    await page.addStyleTag({content:'nav{display:none}main{display:block}#stage{height:100dvh}'});
    await page.waitForFunction(()=>typeof window.soleCityState==='function',null,{timeout:120000});
    for(let i=0;i<frames;i++){
      const data=await page.evaluate(async p=>{
        const slider=document.getElementById('progress');slider.value=1000*p;slider.dispatchEvent(new Event('input'));
        await window.soleCityWaitForDetail?.();
        const source=document.getElementById('mesh'),photo=document.getElementById('photo'),gs=document.getElementById('gaussian');
        const canvas=window.captureCanvas??=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);
        if(gs&&+gs.style.opacity>0){ctx.globalAlpha=+gs.style.opacity;ctx.drawImage(gs,0,0,canvas.width,canvas.height);}
        const scale=Math.min(canvas.width/photo.naturalWidth,canvas.height/photo.naturalHeight);
        const w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;
        ctx.globalAlpha=+photo.style.opacity;ctx.drawImage(photo,(canvas.width-w)/2,(canvas.height-h)/2,w,h);ctx.globalAlpha=1;
        if(document.getElementById('notice').innerText){ctx.fillStyle='#201a16d9';ctx.fillRect(18,18,150,31);ctx.fillStyle='#fff1d3';ctx.font='15px sans-serif';ctx.fillText('动态分镜 · 占位模型',29,39);}
        return canvas.toDataURL('image/jpeg',.91).split(',')[1];
      },i/(frames-1));
      if(!ff.stdin.write(Buffer.from(data,'base64')))await once(ff.stdin,'drain');
    }
    ff.stdin.end();const [exit]=await done;if(exit)throw Error('ffmpeg '+exit);
  }finally{await browser.close();ff.stdin.destroy();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
