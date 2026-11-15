// Shared preparation states. Counts describe completed resources, never elapsed-time guesses.
import {t,onLanguageChange} from '../i18n/core.js';
export function createFilmLoading({stage=document.querySelector('#stage')}={}) {
  const panel=stage.querySelector('[data-film-loading]'),bar=panel.querySelector('[role=progressbar]');
  const status=panel.querySelector('[data-load-status]'),detail=panel.querySelector('[data-load-detail]');
  const note=panel.querySelector('[data-load-note]'),elapsed=panel.querySelector('[data-load-elapsed]');
  const started=performance.now();let ended=false,message='正在准备放映…',description='正在连接场景资源…';
  function paint(){status.textContent=t(message);detail.textContent=t(description);bar.setAttribute('aria-label',t(message));}
  const off=onLanguageChange(paint);
  const timer=setInterval(()=>{
    const seconds=Math.floor((performance.now()-started)/1000);
    elapsed.textContent=t(`已等待 ${seconds} 秒`);
    if(seconds>=20)note.textContent=t('仍在载入，你可以先返回相簿，稍后继续。');
  },1000);
  function phase(label,extra='正在处理三维场景') {
    if(ended)return;
    message=label;description=extra;paint();bar.removeAttribute('aria-valuenow');bar.dataset.indeterminate='true';
  }
  function progress(done,total) {
    if(ended||!(total>0))return;
    message='正在准备街区模型';description=`${done} / ${total}`;paint();
    const percent=Math.floor(Math.min(1,done/total)*100);
    bar.dataset.indeterminate='false';bar.setAttribute('aria-valuenow',percent);
    bar.style.setProperty('--loaded',`${percent}%`);
  }
  function finish(){
    if(ended)return;
    ended=true;clearInterval(timer);off();panel.hidden=true;
    stage.removeAttribute('data-loading');stage.setAttribute('aria-busy','false');
    stage.dataset.ready='true';stage.dataset.readyMs=String(Math.round(performance.now()-started));
  }
  function fail(error){
    if(ended)return;
    phase('场景暂时未能加载','请检查网络连接，然后重新加载。');
    ended=true;clearInterval(timer);off();panel.dataset.error='true';bar.hidden=true;note.hidden=true;
    panel.querySelector('[data-load-retry]').hidden=false;stage.setAttribute('aria-busy','false');
    stage.dataset.loadError='true';console.error(error);
  }
  panel.querySelector('[data-load-retry]').onclick=()=>location.reload();
  paint();return {phase,progress,finish,fail};
}
