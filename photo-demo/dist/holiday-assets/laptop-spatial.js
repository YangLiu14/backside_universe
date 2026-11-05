import {createViewer} from './model-viewer.js';
const viewer=createViewer(document.getElementById('model-view'));
const buttons=[...document.querySelectorAll('[data-angle]')];
const compare=document.getElementById('compare-version');
let previous=false,view={angle:.65,pitch:.45,distance:3.1},serial=0;
async function loadVersion(){
 const token=++serial;for(const b of buttons)b.disabled=true;compare.disabled=true;
 document.getElementById('model-note').textContent='正在载入模型…';
 try{
  window.assetModelStats=null;
  await viewer.load(previous?'assets/laptop/model-spatial-v2.glb':'assets/laptop/model-spatial-v3.glb',Math.PI);
  if(token!==serial)return;
  viewer.setView(view);
  document.getElementById('model-note').textContent=(previous?'上一版：上下两层重复水景，屏幕后仰约25°。':'本次改版：Tripo 独立观景书屋、拱廊与露台，屏幕后仰约25°。')+' 拖动旋转，滚轮缩放。';
  compare.textContent=previous?'返回本次改版':'对比上一版';
  for(const b of buttons)b.disabled=false;compare.disabled=false;
 }catch(e){document.getElementById('model-note').textContent='模型未能载入：'+e.message;compare.disabled=false;}
}
for(const b of buttons)b.onclick=()=>{view={angle:Number(b.dataset.angle),pitch:Number(b.dataset.pitch),distance:3.1};viewer.setView(view);for(const x of buttons)x.setAttribute('aria-pressed',String(x===b));};
compare.onclick=()=>{previous=!previous;loadVersion();};
loadVersion();
