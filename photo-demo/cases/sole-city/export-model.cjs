// Pass the GLTFExporter from the exact Three.js release used by the viewer.
const fs=require('node:fs/promises');
const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');
async function main(){
  const [url,exporterPath,out,role]=process.argv.slice(2);
  const browser=await playwright().chromium.launch({headless:true,executablePath:await installedBrowser(),args:['--use-angle=metal']});
  try{
    const page=await browser.newPage({acceptDownloads:true});
    await page.route('**/_offline-export.js',route=>route.fulfill({contentType:'application/javascript',path:exporterPath}));
    await page.goto(url+'?export=1');
    await page.waitForFunction(()=>typeof window.soleCityBake==='function',null,{timeout:120000});
    const download=page.waitForEvent('download',{timeout:180000});
    await page.evaluate(async role=>{
      const {GLTFExporter}=await import('./_offline-export.js');
      const {model,clip}=await window.soleCityBake(role);
      const bin=await new GLTFExporter().parseAsync(model,{binary:true,animations:clip?[clip]:[],onlyVisible:false});
      const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([bin],{type:'model/gltf-binary'}));
      link.download='sole-city.glb';link.click();
    },role);
    await (await download).saveAs(out);
    const s=await fs.stat(out);console.log(out,s.size);
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
