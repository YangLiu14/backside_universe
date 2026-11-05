import {createViewer} from './model-viewer.js';
const viewer=createViewer(document.getElementById('model-view'),{shadows:true});
const angles=[...document.querySelectorAll('[data-angle]')],models=[...document.querySelectorAll('[data-model]')];
const note=document.getElementById('model-note');
const versions={assembled:['assets/laptop/model-spatial-v6.glb','完整电脑与洞窟景观'],environment:['assets/laptop/environment-spatial-v6.glb','洞窟、书屋、岩岸与海湾整体生成'],previous:['assets/laptop/model-spatial-v3.glb','旧版：书屋、海湾与白色拱架分件装配']};
let selected='assembled',view={angle:.35,pitch:.18,distance:3.1};
async function load(){
 for(const b of [...angles,...models])b.disabled=true;
 note.textContent='正在载入模型…';window.assetModelStats=null;
 try{
  await viewer.load(versions[selected][0],Math.PI);viewer.setView(view);
  note.textContent=versions[selected][1]+' · 拖动旋转，滚轮缩放。';
  for(const b of models)b.setAttribute('aria-pressed',String(b.dataset.model===selected));
 }catch(error){note.textContent='模型未能载入：'+error.message;}
 finally{for(const b of [...angles,...models])b.disabled=false;}
}
for(const b of angles)b.onclick=()=>{view={angle:Number(b.dataset.angle),pitch:Number(b.dataset.pitch),distance:3.1};viewer.setView(view);for(const x of angles)x.setAttribute('aria-pressed',String(x===b));};
for(const b of models)b.onclick=()=>{selected=b.dataset.model;load();};
load();
