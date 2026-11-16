// Render a promotional film from an immutable scene release, without modifying it.
// node record-promo.cjs RELEASE OUT [--mode stills|video] [--width 1920] [--height 1080] [--fps 30] [--audio WAV]
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');

async function main(){
  const [releaseArg,outArg,...args]=process.argv.slice(2);
  if(!releaseArg||!outArg)throw Error('Expected RELEASE_DIR OUT_DIR');
  const options=Object.fromEntries(Array.from({length:Math.ceil(args.length/2)},(_,i)=>[args[2*i].replace(/^--/,''),args[2*i+1]]));
  const release=path.resolve(releaseArg),out=path.resolve(outArg);
  const width=Number(options.width||1920),height=Number(options.height||1080),fps=Number(options.fps||30),mode=options.mode||'stills';
  if(!['stills','video'].includes(mode)||![width,height,fps].every(x=>Number.isFinite(x)&&x>0))throw Error('Invalid capture settings');
  await fs.mkdir(out,{recursive:true});
  const {patchSources}=require('./promo-patch.cjs');
  const raw=Object.fromEntries(await Promise.all(['rewind','tour','assembly'].map(async key=>[key,await fs.readFile(path.join(release,{rewind:'rewind.js',tour:'campus-tour.js',assembly:'assembly.js'}[key]),'utf8')])));
  const patched=patchSources(raw);
  const overrides=new Map([['/rewind.js',patched.rewind],['/campus-tour.js',patched.tour],['/assembly.js',patched.assembly],['/promo-director.js',await fs.readFile(path.join(__dirname,'promo-director.js'),'utf8')]]);
  const filmStyle='<style>html,body{width:100%;height:100%;overflow:hidden}main{display:block!important;height:100vh!important}header,footer,#sub,#grip,#stick{display:none!important}#stage{width:100vw;height:100vh;min-height:0;outline:none;cursor:none}#photo{object-fit:cover}</style>';
  overrides.set('/index.html',(await fs.readFile(path.join(release,'index.html'),'utf8')).replace('</head>',filmStyle+'</head>'));
  const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.css':'text/css','.mp3':'audio/mpeg','.wasm':'application/wasm'};
  const server=http.createServer(async(request,response)=>{
    try{
      const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      response.setHeader('Cache-Control','no-store');
      const overlay=pathname==='/'?'/index.html':pathname;
      if(overrides.has(overlay)){response.setHeader('Content-Type',overlay.endsWith('.html')?'text/html':'text/javascript');response.end(overrides.get(overlay));return;}
      const file=path.resolve(release,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(release+path.sep))throw Error('Invalid path');
      const stat=await fs.stat(file);
      response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
      response.setHeader('Content-Length',stat.size);createReadStream(file).pipe(response);
    }catch(error){response.statusCode=404;response.end('Not found');}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  let browser,encoder,encoderDone;
  const errors=[],frames=[],started=Date.now();
  try{
    browser=await playwright().chromium.launch({headless:true,executablePath:await installedBrowser(),args:process.platform==='darwin'?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'no-preference'});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(/Shader Error|VALIDATE_STATUS|WebGL: INVALID/i.test(message.text()))errors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('favicon.ico'))errors.push(response.status()+' '+new URL(response.url()).pathname);});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?promo=1');
    await page.waitForFunction(()=>Boolean(window.promo),null,{timeout:180000});
    const duration=await page.evaluate(()=>window.promo.duration);
    const director=await page.evaluate(()=>({timeline:window.promo.timeline,finalShot:window.promo.finalShot,orbitPath:window.promo.orbitPath}));
    const sourceHashes=Object.fromEntries([...overrides].map(([name,body])=>[name,crypto.createHash('sha256').update(body).digest('hex')]));
    const capture=async(t,type='image/jpeg')=>{
      const result=await page.evaluate(async({t,type})=>window.promo.frame(t,{capture:type,quality:.97}),{t,type});
      const {image,...metadata}=result;
      if(!image)throw Error('Director returned no image at '+t);
      const data=Buffer.from(image.replace(/^data:[^,]*,/,''),'base64');
      frames.push(metadata);return data;
    };
    if(mode==='stills'){
      const times=options.times?options.times.split(',').map(Number):[0,4,8,11,14,16,18,19.9,20,21,23,25,27.9,28,30,34,38,41,42];
      for(const t of times){await fs.writeFile(path.join(out,'frame-'+String(t).replace('.','_')+'.png'),await capture(t,'image/png'));console.log('still',t);}
      // Reverse lookup must produce the same geometry and pixels at a fixed time.
      const first=await capture(0,'image/png');await capture(27,'image/png');const last=await capture(duration,'image/png');
      if(!first.equals(last))throw Error('Opening and closing photos differ');
      console.log('PASS exact opening/closing photo pixels');
    }else{
      const output=path.join(out,options.name||'铅笔倒带-宣传片.mp4');
      const audio=options.audio?['-i',path.resolve(options.audio),'-map','0:v:0','-map','1:a:0','-c:a','aac','-b:a','192k']:['-an'];
      encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0',...audio,'-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-r',String(fps),'-t',String(duration),'-movflags','+faststart',output],{stdio:['pipe','inherit','inherit']});
      encoderDone=once(encoder,'exit');encoder.stdin.on('error',()=>{});
      const count=Math.round(duration*fps);
      for(let i=0;i<count;i++){
        const data=await capture(i/fps);
        if(!encoder.stdin.write(data))await once(encoder.stdin,'drain');
        if(i%fps===0)console.log(JSON.stringify({frame:i,total:count,seconds:i/fps,elapsedSeconds:Math.round((Date.now()-started)/1000)}));
      }
      encoder.stdin.end();const [code]=await encoderDone;if(code)throw Error('ffmpeg exited '+code);
      const bytes=await fs.readFile(output);console.log('MP4',output,'sha256',crypto.createHash('sha256').update(bytes).digest('hex'));
    }
    await fs.writeFile(path.join(out,'capture-'+mode+'.json'),JSON.stringify({release:path.basename(release),width,height,fps,duration,mode,director,sourceHashes,frames,errors,elapsedSeconds:(Date.now()-started)/1000},null,2));
    if(errors.length)throw Error(errors.join('\n'));
  }finally{
    if(encoder&&encoder.exitCode===null){encoder.stdin.destroy();encoder.kill();}
    if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
