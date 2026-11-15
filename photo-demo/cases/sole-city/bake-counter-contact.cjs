// Integrate the assembled counter feet once, in the same WebGL/browser coordinate frame as the street.
const {playwright,installedBrowser}=require('../../pipeline/verify.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');

async function bake(url,out) {
  const browser=await playwright().chromium.launch({executablePath:await installedBrowser(),args:['--use-angle=metal']});
  try {
    const page=await browser.newPage();
    page.on('pageerror',error=>console.error(error));
    await page.goto(new URL('?bake-contact=1',url).href);
    await page.waitForFunction(()=>window.soleCityContactBake,null,{timeout:240000});
    const {image,pose,task}=await page.evaluate(()=>window.soleCityContactBake);
    if(!task||!pose||!image?.startsWith('data:image/png;base64,'))throw Error('Missing the assembled stall or its contact integration');
    await fs.mkdir(out,{recursive:true});
    await fs.writeFile(path.join(out,'counter-contact.png'),Buffer.from(image.split(',')[1],'base64'));
    await fs.writeFile(path.join(out,'counter-contact.json'),JSON.stringify({task,pose})+'\n');
    console.log('Baked 12-direction stall contact for',task);
  } finally {await browser.close();}
}
bake(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
