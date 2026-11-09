import {messages} from './messages.en.js';
const key='backside-universe:language';
const browser=typeof window!=='undefined';
const normalize=value=>/^en(?:-|$)/i.test(value||'')?'en':'zh';
let language='zh';
if(browser){
  const requested=new URLSearchParams(location.search).get('lang');
  try{
    language=normalize(requested||localStorage.getItem(key));
    if(requested)localStorage.setItem(key,language);
  }catch{language=normalize(requested);}
}
const listeners=new Set();
const segments=Object.keys(messages).filter(s=>/[\u3400-\u9fff]/.test(s)).sort((a,b)=>b.length-a.length);
const reverse=new Map(Object.entries(messages).filter(([,en])=>en).map(([zh,en])=>[en,zh]));
export const getLanguage=()=>language;
export const isEnglish=()=>language==='en';
export function t(value){
  const text=String(value??'');
  if(language!=='en'||!/[\u3400-\u9fff]/.test(text))return text;
  if(Object.hasOwn(messages,text))return messages[text];
  const clean=text.replace(/\s+/g,' ').trim();
  if(Object.hasOwn(messages,clean))return text.replace(text.trim(),messages[clean]);
  const waiting=clean.match(/^已等待 (\d+) 秒$/);
  if(waiting)return `Waiting ${waiting[1]} seconds`;
  const count=clean.match(/^(\d+) 组$/);if(count)return `${count[1]} objects`;
  let result=text;
  // Composed UI labels reuse the same reviewed phrases and proper names.
  for(const source of segments)if(result.includes(source))result=result.split(source).join(messages[source]);
  return result;
}
export const sourceText=text=>reverse.get(text)||text;
export function onLanguageChange(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export function setLanguage(value,{persist=true,share=true}={}){
  const next=normalize(value),changed=next!==language;language=next;
  if(browser){
    document.documentElement.lang=next==='en'?'en':'zh-CN';
    if(persist){
      try{localStorage.setItem(key,next);}catch{}
    }
    const url=new URL(location.href);
    if(persist||url.searchParams.has('lang')){
      url.searchParams.set('lang',next);
      try{history.replaceState(history.state,'',url);}catch{}
    }
    if(share){
      for(const frame of document.querySelectorAll('iframe'))frame.contentWindow?.postMessage({type:'universe:language',language:next},location.origin);
      if(parent!==window)parent.postMessage({type:'universe:language',language:next},location.origin);
    }
  }
  if(changed)for(const listener of [...listeners])listener(next);
}
if(browser){
  document.documentElement.lang=language==='en'?'en':'zh-CN';
  addEventListener('storage',event=>{if(event.key===key)setLanguage(event.newValue,{persist:false});});
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.data?.type!=='universe:language')return;
    const trusted=event.source===parent||[...document.querySelectorAll('iframe')].some(f=>f.contentWindow===event.source);
    if(trusted&&normalize(event.data.language)!==language)setLanguage(event.data.language,{persist:false});
  });
}
// A texture owns its redraw subscription, including when disposed by a viewer.
export function localizedTexture(texture,draw){
  const render=()=>{draw();texture.needsUpdate=true;};
  render();const off=onLanguageChange(render);texture.addEventListener('dispose',off);return texture;
}
