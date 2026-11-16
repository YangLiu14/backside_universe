// Window coordinates: x right, y up, z toward the booth. All animation is sampled, never integrated.
export const duration=8, release=1;
export const clamp=(x,lo=0,hi=1)=>Math.min(hi,Math.max(lo,x));
export function sample(t){
 t=clamp(t,0,duration);
 return {t,spin:t*2.55,supplySpin:t*2.55*1.53,
  caption:t<1.94?'今天的校园广播就到这里。':t<3.2?'操场上的同学，':t<4?'明天见。':''};
}
export function memoryClock(){
 let time=0,hold=null,running=false,seen=false;
 return {get time(){return time},get held(){return hold},get playing(){return running&&!hold&&time<duration},
  enter(){if(!seen){seen=true;time=0;}running=true;},leave(){hold=null;running=false;},
  begin(kind){if(!hold){hold=kind;running=false;}},scrub(s){if(hold==='pencil')time=clamp(time+s,0,duration);},
  release(){if(hold){hold=null;running=true;}},advance(dt){if(hold==='button')time=clamp(time-dt*2.9,0,duration);else if(running&&!hold)time=clamp(time+dt,0,duration);},
  restart(){time=0;running=false;seen=false;hold=null;},
 };
}
