import {createViewer} from './model-viewer.js';

const $=id=>document.getElementById(id);
const descriptions={
 'blue-book':'书页化成层层白崖，石阶从海风小屋绕向水边；圆形瞭望亭隔着海湾，与小屋遥遥相望。',
 'orange-book':'赤岩峡谷夹着一线碧水，木桥横跨两岸。沿石阶向上，进入有阴凉露台的峡湾旅舍。',
 'phone':'银白边框里展开一片潮汐港。海水浴屋、船棚和栈道环绕浅湾，远端留下熟悉的三枚镜头。',
};
const ids=Object.keys(descriptions),assetButtons=[...document.querySelectorAll('[data-asset]')];
const modelButtons=[...document.querySelectorAll('[data-model]')],viewButtons=[...document.querySelectorAll('[data-view]')];
const allButtons=[...assetButtons,...modelButtons,...viewButtons];
const viewer=createViewer($('model-view'),{shadows:true,fitToViewport:true});
let assets,selected=ids.includes(location.hash.slice(1))?location.hash.slice(1):ids[0],version='expanded',viewName='overview',loading=false;
const views={overview:{angle:-.35,pitch:.48,distance:3.15},side:{angle:Math.PI/2,pitch:.3,distance:3.15},top:{angle:0,pitch:1.1,distance:3.15},back:{angle:Math.PI,pitch:.4,distance:3.15}};

function setView(name){
 viewName=name;viewer.setView(selected==='phone'&&version==='expanded'&&name==='overview'?{angle:-.65,pitch:.58,distance:2.7}:views[name]);
 for(const button of viewButtons)button.setAttribute('aria-pressed',String(button.dataset.view===name));
}
async function load(){
 loading=true;for(const b of allButtons)b.disabled=true;
 window.islandPreview={ready:false,asset:selected,version};window.assetModelStats=null;
 const asset=assets.find(a=>a.id===selected),model=version==='expanded'?asset.expandedModel:asset.model;
 $('island-name').textContent=asset.name;$('island-description').textContent=descriptions[selected];
 $('catalog-link').href=$('source-link').href='index.html#'+selected;
 $('concept').src=asset.expandedReference;$('download-link').href=model.file;
 $('model-note').textContent='正在载入'+asset.name+'…';
 for(const b of assetButtons)b.setAttribute('aria-current',String(b.dataset.asset===selected));
 for(const b of modelButtons)b.setAttribute('aria-pressed',String(b.dataset.model===version));
 history.replaceState(null,'','#'+selected);
 try{
  await viewer.load(model.file,model.yaw||0);setView('overview');
  $('model-note').textContent=(version==='expanded'?'新版整体景观':'旧版薄边景观')+' · 拖动旋转，滚轮缩放。';
  window.islandPreview={ready:true,asset:selected,version,triangles:window.assetModelStats.triangles};
 }catch(error){$('model-note').textContent='模型未能载入：'+error.message;window.islandPreview.error=error.message;}
 finally{loading=false;for(const b of allButtons)b.disabled=false;}
}
for(const b of assetButtons)b.onclick=()=>{if(loading)return;selected=b.dataset.asset;version='expanded';load();};
for(const b of modelButtons)b.onclick=()=>{if(loading)return;version=b.dataset.model;load();};
for(const b of viewButtons)b.onclick=()=>setView(b.dataset.view);
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(ids.includes(id)&&!loading){selected=id;version='expanded';load();}});
try{const response=await fetch('catalog.json');if(!response.ok)throw Error(response.status);assets=await response.json();await load();}
catch(error){$('model-note').textContent='资产记录未能载入：'+error.message;for(const b of allButtons)b.disabled=true;}
