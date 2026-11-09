export function createLoadingProgress(){
  const panel=document.querySelector('#loading');
  const status=document.querySelector('#status');
  const progress=document.querySelector('#load-progress');
  const value=document.querySelector('#load-value');
  const detail=document.querySelector('#load-detail');
  const elapsed=document.querySelector('#load-elapsed');
  const started=performance.now();
  let stopped=false;
  const timer=setInterval(()=>{
    const seconds=Math.floor((performance.now()-started)/1000);
    elapsed.textContent=`已等待 ${seconds} 秒`;
    document.querySelector('#load-note').textContent=seconds<20
      ?'首次打开需要下载高清场景，请稍等。'
      :'高清资源较大，仍在准备中，请保持此页打开。';
  },1000);

  function phase(message){
    if(stopped)return;
    status.textContent=message;
    progress.removeAttribute('aria-valuenow');
    progress.setAttribute('aria-label',message);
    progress.dataset.indeterminate='true';
    value.textContent='';
    detail.textContent='正在处理三维场景';
  }
  function download({loaded,total}){
    if(stopped||!(total>0))return;
    const ratio=Math.max(0,Math.min(1,loaded/total));
    if(ratio===1){phase('高清实景已下载，正在解码…');return;}
    const percent=Math.floor(ratio*100);
    status.textContent='正在下载高清实景';
    progress.setAttribute('aria-label','高清实景下载进度');
    progress.setAttribute('aria-valuenow',String(percent));
    progress.dataset.indeterminate='false';
    progress.style.setProperty('--loaded',`${ratio*100}%`);
    value.textContent=`${percent}%`;
    detail.textContent=`${(loaded/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MB`;
  }
  function finish(){
    stopped=true;clearInterval(timer);panel.hidden=true;
    document.querySelector('#stage').removeAttribute('aria-busy');
  }
  function fail(){
    phase('场景暂时未能加载');stopped=true;clearInterval(timer);
    panel.dataset.error='true';progress.hidden=true;
    detail.textContent='请检查网络连接，然后重新加载。';
    document.querySelector('#load-note').hidden=true;
    document.querySelector('#load-retry').hidden=false;
    document.querySelector('#stage').removeAttribute('aria-busy');
  }
  document.querySelector('#load-retry').addEventListener('click',()=>location.reload());
  return {phase,download,finish,fail};
}
