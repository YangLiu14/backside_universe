import {nativeAt} from './digestive-tract.js';

export function createDigestiveMap({stops,worldFromNative,enter,onChange}){
  const root=document.getElementById('digestive-map'),stage=document.getElementById('stage');
  const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),toggle=document.getElementById('tour-map-toggle');
  const k=[1.4,7.2,12.6,21,28.5,36.2],labelOffsets=[[-.10,-.10],[-.20,.03],[-.24,.15],[.12,.21],[.20,-.10],[.14,.085]];
  const chain=Array.from({length:193},(_,i)=>worldFromNative(nativeAt(38*i/192)));
  const anchors=k.map(n=>worldFromNative(nativeAt(n)));
  let enabled=false;
  const buttons=stops.map((s,i)=>{
    const button=document.createElement('button');button.type='button';button.className='tract-stop';button.textContent=(i+1)+' '+s.title;
    button.setAttribute('aria-label','从'+s.title+'进入第一视角');button.onclick=()=>enter(i);root.append(button);return button;
  });
  function set(value){enabled=value;toggle.setAttribute('aria-pressed',String(value));toggle.textContent=value?'查看器官展馆':'显示消化路线';onChange();}
  toggle.onclick=()=>set(!enabled);
  function draw(camera,available){
    const visible=enabled&&available;root.hidden=!visible;stage.dataset.routeMap=String(visible);if(!visible)return;
    const w=stage.clientWidth,h=stage.clientHeight,dpr=Math.min(devicePixelRatio,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    function screen(world){const p=world.clone().project(camera);return [(p.x+1)*w/2,(1-p.y)*h/2,p.z];}
    ctx.beginPath();chain.forEach((p,i)=>{const [x,y]=screen(p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=4.5;ctx.strokeStyle='#3c2018c9';ctx.stroke();
    ctx.lineWidth=2.1;ctx.strokeStyle='#ffcd79';ctx.stroke();
    const previousY=[-100,-100];
    // Order the labels vertically on each side of the dog, preserving their anatomical anchors.
    for(const i of [0,1,2,4,5,3]){
      const [x,y,z]=screen(anchors[i]),button=buttons[i],side=i<3?0:1;
      button.hidden=z< -1||z>1||x<0||x>w||y<0||y>h;if(button.hidden)continue;
      const [dx,dy]=labelOffsets[i],half=button.offsetWidth/2+4;
      const bx=Math.max(half,Math.min(w-half,x+dx*w)),by=Math.min(h-35,Math.max(18,previousY[side]+button.offsetHeight+5,y+dy*h));
      previousY[side]=by;button.style.left=bx+'px';button.style.top=by+'px';
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(bx,by);ctx.lineWidth=1;ctx.strokeStyle='#fff3d9';ctx.stroke();
      ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fillStyle='#ffdb8d';ctx.fill();ctx.strokeStyle='#713a24';ctx.stroke();
    }
  }
  return {draw,set,get enabled(){return enabled;}};
}
