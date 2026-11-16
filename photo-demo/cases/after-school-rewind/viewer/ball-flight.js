// Analytic metre/second trajectory: arbitrary seeks and reverse playback sample
// the very same solution. Only the net and floor exert forces beyond gravity.
export function basketballFlight({from,rim,releaseTime=1,radius=.121,groundY=0,gravity=9.81,rimRadius=.3281,netDepth=.78464}) {
  const g=gravity, floor=groundY+radius, segments=[], events=[];
  const add=(a,b)=>a.map((v,i)=>v+b[i]);
  const travel=(p,v,t)=>[p[0]+v[0]*t,p[1]+v[1]*t-.5*g*t*t,p[2]+v[2]*t];
  const velocity=(v,t)=>[v[0],v[1]-g*t,v[2]];
  const event=(type,time,position,before,after=before)=>events.push({type,time,position:[...position],velocityBefore:[...before],velocityAfter:[...after]});
  const free=(start,end,p,v,phase='flight')=>segments.push({start,end,phase,sample:t=>({position:travel(p,v,t),velocity:velocity(v,t)})});
  const distance=Math.hypot(rim[0]-from[0],rim[2]-from[2]);
  // 55 degree descending entry leaves clearance for the complete ball diameter.
  const flightTime=Math.sqrt(2*(rim[1]-from[1]+distance*Math.tan(55*Math.PI/180))/g);
  const initial=[(rim[0]-from[0])/flightTime,(rim[1]-from[1]+.5*g*flightTime**2)/flightTime,(rim[2]-from[2])/flightTime];
  const hoopTime=releaseTime+flightTime,apexTime=releaseTime+initial[1]/g;
  event('release',releaseTime,from,initial);
  event('apex',apexTime,travel(from,initial,initial[1]/g),velocity(initial,initial[1]/g));
  event('rim-crossing',hoopTime,rim,velocity(initial,flightTime));
  // The hanging net gradually removes horizontal momentum. Its vertical
  // opening stays free, so vertical acceleration remains g through the net.
  let time=hoopTime+.012,p=travel(from,initial,time-releaseTime),v=velocity(initial,time-releaseTime);
  free(releaseTime,time,from,initial);
  event('net-entry',time,p,v);
  const netDrop=p[1]-(rim[1]-netDepth),netDuration=(v[1]+Math.sqrt(v[1]**2+2*g*netDrop))/g;
  const netP=[...p],netV=[...v],delta=[.58-v[0],0,.82-v[2]];
  const netSample=t=>{
    const u=t/netDuration,blend=u*u*(3-2*u),integral=netDuration*(u**3-.5*u**4);
    return {position:add(travel(netP,netV,t),delta.map(d=>d*integral)),velocity:add(velocity(netV,t),delta.map(d=>d*blend))};
  };
  segments.push({start:time,end:time+netDuration,phase:'net',sample:netSample});
  time+=netDuration;({position:p,velocity:v}=netSample(netDuration));event('net-exit',time,p,v);
  let bounce=0;
  while(bounce<12){
    const fall=(v[1]+Math.sqrt(v[1]**2+2*g*Math.max(0,p[1]-floor)))/g;
    free(time,time+fall,p,v,bounce?'bounce':'flight');
    const before=velocity(v,fall);p=travel(p,v,fall);p[1]=floor;time+=fall;
    const rebound=-before[1]*.64;
    v=[before[0]*.83,rebound>=.55?rebound:0,before[2]*.83];
    event('ground-impact',time,p,before,v);bounce++;
    if(!v[1])break;
  }
  const rollP=[...p],rollV=[...v],speed=Math.hypot(v[0],v[2]),deceleration=.48,rollDuration=speed/deceleration;
  segments.push({start:time,end:time+rollDuration,phase:'rolling',sample:t=>{
    const fraction=Math.max(0,1-t/rollDuration),distance=t-.5*t*t/rollDuration;
    return {position:add(rollP,rollV.map(n=>n*distance)),velocity:rollV.map(n=>n*fraction)};
  }});
  p=add(rollP,rollV.map(n=>n*rollDuration*.5));time+=rollDuration;event('rest',time,p,[0,0,0]);
  const rest=[...p];
  return {
    events,apexTime,hoopTime,restTime:time,
    sample(t){
      const segment=segments.find(s=>t>=s.start&&t<s.end);
      const state=t<releaseTime?{position:[...from],velocity:[0,0,0]}:segment?segment.sample(t-segment.start):{position:[...rest],velocity:[0,0,0]};
      const phase=t<releaseTime?'held':segment?.phase||'rest';
      // Backspin before contact, then diminish with the rolling ball's speed.
      const firstImpact=events.find(e=>e.type==='ground-impact').time;
      const airSpin=Math.max(0,Math.min(t,firstImpact)-releaseTime)*8;
      let rollSpin=0;
      for(const s of segments){
        if(s.start<firstImpact||t<=s.start)continue;
        const a=s.sample(0).position,b=s.sample(Math.min(t,s.end)-s.start).position;
        rollSpin+=Math.hypot(b[0]-a[0],b[2]-a[2])/radius;
      }
      return {...state,spin:airSpin+rollSpin,airSpin,rollSpin,physics:{gravity:g,radius,groundY,rim:[...rim],rimRadius,phase,velocity:state.velocity,apexTime,events}};
    }
  };
}
