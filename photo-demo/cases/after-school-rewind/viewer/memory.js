// Window coordinates: x right, y up, z toward the booth. All animation is sampled, never integrated.
export const duration=4, release=1, apex=2.3;
export const clamp=(x,lo=0,hi=1)=>Math.min(hi,Math.max(lo,x));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export function sample(t){
 t=clamp(t,0,duration);
 const reach=smooth(t/release), phase=clamp((t-release)/(duration-release)), after=Math.max(0,t-release);
 const palm=[-.29+.057*reach,.25+.226*reach,.035-.019*reach];
 // Ball and fingertips use exactly the same release anchor. d(height)/dt vanishes at 2.3 s.
 const ball=t<=release?palm.slice():[-.233+.619*phase,.476+.135*(1.3**2-(after-1.3)**2),.016-.055*phase];
 const walk=t*Math.PI*.5;
 return {t,palm,ball,reach,follow:smooth(after/.22)*(1-.60*smooth((after-.5)/1.4)),
  spin:t*2.55, supplySpin:t*2.55*1.53, backspin:after*3.7,
  students:[0,1].map(i=>({x:.025+i*.13+.032*t,step:Math.sin(walk+i*.94),lift:1-Math.abs(Math.cos(walk+i*.94))})),
  caption:t<1.94?'今天的校园广播就到这里。':t<3.2?'操场上的同学，':'明天见。'};
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
