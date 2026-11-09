import {t,sourceText,getLanguage,setLanguage,onLanguageChange} from './core.js';
const originals=new WeakMap(),attributes=new WeakMap();
const skip='script,style,code,pre,[data-no-i18n],.language-switch';
const names=['alt','title','aria-label','aria-valuetext','placeholder','content'];
let observer;
function text(node){
  if(!node.parentElement||node.parentElement.closest(skip))return;
  const current=node.nodeValue,prior=originals.get(node);
  const source=prior&&current===prior.rendered?prior.source:sourceText(current);
  const rendered=t(source);originals.set(node,{source,rendered});
  if(rendered!==current)node.nodeValue=rendered;
}
function element(el){
  if(el.closest(skip))return;
  let saved=attributes.get(el);if(!saved){saved=new Map();attributes.set(el,saved);}
  for(const name of names){
    if(name==='content'&&!el.matches('meta[name="description"]'))continue;
    if(!el.hasAttribute(name))continue;
    const current=el.getAttribute(name),prior=saved.get(name);
    const source=prior&&current===prior.rendered?prior.source:sourceText(current);
    const rendered=t(source);saved.set(name,{source,rendered});
    if(current!==rendered)el.setAttribute(name,rendered);
  }
}
function walk(root){
  if(root.nodeType===Node.TEXT_NODE){text(root);return;}
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
  if(root.nodeType===Node.ELEMENT_NODE){if(root.closest(skip))return;element(root);}
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  while(walker.nextNode())if(walker.currentNode.nodeType===Node.TEXT_NODE)text(walker.currentNode);else element(walker.currentNode);
}
const options={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:names};
function batch(fn){observer?.disconnect();try{fn();}finally{observer?.observe(document.documentElement,options);}}
function switcher(){
  const group=document.createElement('div');group.className='language-switch';group.setAttribute('role','group');
  const buttons=[['zh','中文'],['en','English']].map(([language,label])=>{
    const button=document.createElement('button');button.type='button';button.lang=language==='en'?'en':'zh-CN';
    button.textContent=label;button.dataset.language=language;button.addEventListener('click',()=>setLanguage(language));group.append(button);return button;
  });
  const refresh=()=>{
    group.setAttribute('aria-label',getLanguage()==='en'?'Language':'语言');
    for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.language===getLanguage()));
  };
  refresh();onLanguageChange(refresh);
  (document.querySelector('header')||document.body).append(group);
}
function init(){
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('./style.css',import.meta.url);document.head.append(sheet);
  switcher();
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link||link.hasAttribute('download'))return;
    const url=new URL(link.href,location.href);
    if(url.origin===location.origin&&(/\.html$/.test(url.pathname)||url.pathname.endsWith('/'))){
      url.searchParams.set('lang',getLanguage());link.href=url;
    }
  },true);
  observer=new MutationObserver(records=>batch(()=>{
    for(const record of records){
      if(record.type==='characterData')text(record.target);
      else if(record.type==='attributes')element(record.target);
      else for(const child of record.addedNodes)walk(child);
    }
  }));
  batch(()=>walk(document));
  onLanguageChange(()=>batch(()=>walk(document)));
  // Text nodes keep their source independently of the rendered language. This
  // adapter covers existing scene controls without resetting their state.
  window.__universeLanguage={get current(){return getLanguage();},set:setLanguage,translate:t,refresh:()=>batch(()=>walk(document))};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
