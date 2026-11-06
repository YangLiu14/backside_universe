// Each guide click uses the same scene action as a visitor's hand. Reading
// the live phase also lets someone put down the button and act on the object.
const stops=[
  {id:'cup',name:'蓝杯港湾',beats:{
    note:['折成纸船','fold'],folding:['纸条正在折起'],boat:['推船出海','release'],sailing:['目送纸船离岸'],
  }},
  {id:'blue-book',name:'蓝书白崖',beats:{telescope:['望向纸船','sight']}},
  {id:'orange-book',name:'橙书峡谷',beats:{bookmark:['压低书签','action']}},
  {id:'phone',name:'手机潮港',beats:{'waiting-message':['停靠潮港'],notification:['拨到静音','action']}},
  {id:'grotto',name:'洞窟书屋',beats:{
    terrace:['开门进书屋','enter'],inside:['走近桌上的书','read'],book:['从书页回到工位','photo'],
  }},
];

export function createStoryTour({bar,button,exit,position,title,label,location,open,act,onExit}){
  let index=-1,trip=null,error=false,finished=false,startingCycle=0;
  function instruction(here){
    if(index<0)return [finished?'再游览一次':'跟随故事','start'];
    if(trip)return ['正在前往'+stops[index].name];
    if(error)return ['重试本站','retry'];
    if(here.busy||here.phase==='approach')return ['镜头移动中'];
    const beat=stops[index].beats[here.phase];
    if(beat)return beat;
    if(here.id===stops[index].id&&index+1<stops.length)return ['下一站 · '+stops[index+1].name,'next'];
    return ['正在转场'];
  }
  function refresh(){
    const here=location();
    if(index===stops.length-1&&here.cycles>startingCycle){index=-1;finished=true;error=false;}
    const active=index>=0;
    bar.parentElement.classList.toggle('guided-tour',active);
    bar.hidden=here.embedded||(!active&&!!here.id);
    exit.hidden=!active;
    position.hidden=!active;
    if(active)position.textContent=(index+1)+' / '+stops.length;
    title.textContent=error?stops[index].name+'暂未载入':active?stops[index].name:finished?'已回到最初的工位':'从工位出发，游览五站';
    const [text,command]=instruction(here);
    label.textContent=text;
    button.setAttribute('aria-disabled',String(!here.ready||!command));
  }
  async function go(next){
    index=next;error=false;finished=false;
    const token=new AbortController();trip=token;refresh();
    try{await open(stops[next].id,token.signal);}
    catch(err){if(!token.signal.aborted){error=true;console.warn('故事导览暂未抵达',err);}}
    finally{if(trip===token){trip=null;refresh();}}
  }
  function end(){
    if(index<0)return;
    const token=trip;trip=null;index=-1;error=false;finished=false;
    token?.abort();onExit();refresh();
  }
  button.addEventListener('keydown',event=>{
    if(event.repeat&&['Enter',' '].includes(event.key))event.preventDefault();
  });
  button.addEventListener('click',()=>{
    if(button.getAttribute('aria-disabled')==='true')return;
    const here=location(),[,command]=instruction(here);
    if(command==='start'){startingCycle=here.cycles;go(0);}
    else if(command==='next')go(index+1);
    else if(command==='retry')go(index);
    else if(command)act(command);
  });
  exit.addEventListener('click',end);
  return {refresh,end,get active(){return index>=0;},get moving(){return !!trip;}};
}
