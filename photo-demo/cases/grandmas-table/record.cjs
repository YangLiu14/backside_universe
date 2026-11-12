const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const path=require('node:path');
async function record(){
  const [url,output]=process.argv.slice(2);
  const browser=await playwright().chromium.launch({headless:true,executablePath:await installedBrowser(),
    args:process.platform==='darwin'?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const encoder=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-framerate','24','-vcodec','mjpeg','-i','pipe:0',
    '-vf','format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','17','-movflags','+faststart',path.resolve(output)],{stdio:['pipe','inherit','inherit']});
  const finished=once(encoder,'close');
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await page.goto(url+'/?film&capture');
    await page.waitForFunction(()=>!!window.dinnerCapture || document.querySelector('#instruction')?.textContent.includes('载入失败'),null,{timeout:120000});
    if(!await page.evaluate(()=>!!window.dinnerCapture))throw new Error(await page.locator('#instruction').textContent());
    for(let i=0;i<24*24;i++){
      await page.evaluate(t=>window.dinnerCapture(t),i/24);
      const jpg=await page.screenshot({type:'jpeg',quality:94});
      if(!encoder.stdin.write(jpg))await once(encoder.stdin,'drain');
    }
    encoder.stdin.end();const [code]=await finished;if(code!==0)throw new Error('ffmpeg exit '+code);
  }finally{await browser.close();if(encoder.exitCode===null)encoder.kill();}
}
record().catch(err=>{console.error(err);process.exitCode=1;});
