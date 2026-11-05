// One retained, same-origin GS experience. A failed load is removable and
// retryable; repeated visits reuse the renderer instead of nesting iframes.
export function createBookPortal(container,{onChange,onRevisit,onError}){
 let frame,state='idle',pending=null,entry=null,sequence=0;
 const origin=location.origin;
 function change(next){state=next;container.dataset.state=state;onChange?.(state);}
 function send(type,detail={}){frame?.contentWindow?.postMessage({type,...detail},origin);}
 function fail(message){
  const error=new Error(message);change('error');
  for(const request of [pending,entry])if(request){clearTimeout(request.timer);request.reject(error);}
  pending=entry=null;frame?.remove();frame=null;onError?.(error);
 }
 window.addEventListener('message',event=>{
  if(event.origin!==origin||!frame||event.source!==frame.contentWindow)return;
  const data=event.data;
  if(data?.type==='book-world:ready'&&pending){
   clearTimeout(pending.timer);const done=pending.resolve;pending=null;change('ready');done();
  }else if(data?.type==='book-world:prepared'&&entry&&data.id===entry.id){
   clearTimeout(entry.timer);const done=entry.resolve;entry=null;done();
  }else if(data?.type==='book-world:revisit'&&state==='active')onRevisit();
  else if(data?.type==='book-world:leave'&&state==='active')onChange?.('leave');
  else if(data?.type==='book-world:error')fail('照片里的空间未能载入，请重试。');
 });
 return {
  get state(){return state;},
  preload(){
   if(state==='ready'||state==='active')return Promise.resolve();
   if(pending)return pending.promise;
   change('loading');
   const promise=new Promise((resolve,reject)=>{pending={resolve,reject,timer:setTimeout(()=>fail('载入时间较长，仍可留在书屋或重新尝试。'),90000)};});
   pending.promise=promise;
   frame=document.createElement('iframe');frame.title='书页中的最初空间';frame.tabIndex=-1;
   frame.src='../marble-transition-lab/index.html?portal=book';container.replaceChildren(frame);
   return promise;
  },
  async prepare(reduced){
   await this.preload();
   await new Promise((resolve,reject)=>{
    const id=++sequence;entry={resolve,reject,id,timer:setTimeout(()=>fail('原空间暂未准备好，请重新尝试。'),20000)};
    send('book-world:prepare',{id,reduced});
   });
  },
  show(){if(state!=='ready'||!frame)throw Error('原空间连接已中断，请重新尝试。');change('active');container.inert=false;container.setAttribute('aria-hidden','false');container.style.opacity='1';send('book-world:active',{active:true});},
  focus(){frame?.contentWindow?.focus();},
  setReduced(reduced){send('book-world:motion',{reduced});},
  hide(){container.style.opacity='0';container.inert=true;container.setAttribute('aria-hidden','true');send('book-world:active',{active:false});if(state==='active')change('ready');},
 };
}
