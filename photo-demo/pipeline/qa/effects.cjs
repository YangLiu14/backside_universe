const assert=require('node:assert/strict');
async function changedPixels(page,cameraMatrix,x,y,width,height){
  const clip={x:Math.round(x),y:Math.round(y),width,height};
  const view=await cameraMatrix();
  const first=await page.screenshot({type:'png',clip});await page.waitForTimeout(680);
  const second=await page.screenshot({type:'png',clip});
  const next=await cameraMatrix();
  assert(Math.hypot(...view.map((n,i)=>n-next[i]))<.0001,'effect probe camera moved');
  return page.evaluate(async frames=>{
    const data=await Promise.all(frames.map(async src=>{
      const img=new Image();img.src='data:image/png;base64,'+src;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height).data;
    }));
    let count=0;for(let i=0;i<data[0].length;i+=4)
      if(Math.max(...[0,1,2].map(k=>Math.abs(data[0][i+k]-data[1][i+k])))>4)count++;
    return count;
  },[first.toString('base64'),second.toString('base64')]);
}
module.exports={changedPixels};
