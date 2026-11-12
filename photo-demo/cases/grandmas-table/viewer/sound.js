export class DinnerSound {
  constructor(){this.muted=false;this.live=new Set();this.pending={};this.generation=0;}
  async start(){
    if(!this.context){
      const ctx=this.context=new AudioContext();
      this.master=ctx.createGain();this.master.gain.value=this.muted?0:.75;this.master.connect(ctx.destination);
      for(const key of ['welcome','pair']){
        this.pending[key]=fetch(key+'.mp3').then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).catch(()=>null);
      }
    }
    if(this.context.state==='suspended')await this.context.resume().catch(()=>{});
  }
  mute(){this.muted=!this.muted;if(this.master)this.master.gain.value=this.muted?0:.75;return this.muted;}
  rain(visible,eye,forward,strength=1){
    if(!this.context)return;
    const ctx=this.context;
    let level=visible?.055:0,pan=-.36;
    if(visible&&eye){
      const dx=-.31-eye.x,dz=-.89-eye.z,distance=Math.hypot(dx,dz);
      level=.10+.19*Math.exp(-distance*1.35);
      const side=(dx*(-forward.z)+dz*forward.x)/Math.max(.001,distance*Math.hypot(forward.x,forward.z));
      pan=Math.round(side*10)/16;
    }
    level=Math.round(level*(.36+.64*strength)*100)/100;
    if(level===this.rainLevel&&pan===this.rainPan)return;
    if(!this.weather){
      if(!visible)return;
      const b=ctx.createBuffer(1,ctx.sampleRate*5,ctx.sampleRate),samples=b.getChannelData(0);
      let low=0;
      for(let i=0;i<samples.length;i++){
        const noise=Math.random()*2-1;
        low=low*.88+noise*.12;
        samples[i]=low*.79+noise*.09;
      }
      // Short, scattered impacts at the eaves, heard through the closed sash.
      for(let drop=0;drop<45;drop++){
        const at=Math.floor(Math.random()*samples.length),freq=1250+Math.random()*1500;
        for(let i=0;i<ctx.sampleRate*.026;i++){
          const t=i/ctx.sampleRate;
          samples[(at+i)%samples.length]+=.12*Math.exp(-t*205)*Math.sin(t*freq*6.283);
        }
      }
      const s=ctx.createBufferSource(),filter=ctx.createBiquadFilter();
      this.rainPanner=ctx.createStereoPanner();
      this.weather=ctx.createGain();this.weather.gain.value=0;
      filter.type='lowpass';filter.frequency.value=2200;
      s.buffer=b;s.loop=true;s.connect(filter).connect(this.rainPanner).connect(this.weather).connect(this.master);s.start();
    }
    this.rainLevel=level;this.rainPan=pan;
    this.weather.gain.setTargetAtTime(level,ctx.currentTime,.25);
    this.rainPanner.pan.setTargetAtTime(pan,ctx.currentTime,.14);
  }
  stop(){this.generation++;for(const src of this.live){try{src.stop();}catch{}}this.live.clear();}
  async play(key){
    if(!this.context||this.muted)return;
    const sequence=this.generation,buffer=await this.pending[key];
    if(!buffer||this.muted||sequence!==this.generation)return;
    const ctx=this.context,s=ctx.createBufferSource(),p=ctx.createStereoPanner();
    p.pan.value=key==='welcome'?-.48:-.32;s.buffer=buffer;s.connect(p).connect(this.master);
    s.onended=()=>{this.live.delete(s);s.disconnect();p.disconnect();};this.live.add(s);s.start();
  }
  scrape(){
    if(!this.context||this.muted)return;
    const ctx=this.context,t=ctx.currentTime,b=ctx.createBuffer(1,ctx.sampleRate*.57,ctx.sampleRate),a=b.getChannelData(0);
    for(let i=0;i<a.length;i++){const u=i/a.length;a[i]=(Math.random()*2-1)*(.45+.55*Math.sin(i*.011)**2)*Math.sin(Math.PI*u)**.7;}
    const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=b;f.type='bandpass';f.frequency.setValueAtTime(690,t);f.frequency.exponentialRampToValueAtTime(280,t+.51);f.Q.value=.8;g.gain.value=.27;
    s.connect(f).connect(g).connect(this.master);this.live.add(s);s.onended=()=>this.live.delete(s);s.start();
  }
  clink(){
    if(!this.context||this.muted)return;
    const ctx=this.context;
    for(const [dt,freq,amp] of [[0,1820,.095],[0,3410,.033],[.105,2090,.067],[.105,3970,.02]]){
      const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+dt;
      o.frequency.value=freq;g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+.36);
      o.connect(g).connect(this.master);o.start(t);o.stop(t+.4);this.live.add(o);o.onended=()=>this.live.delete(o);
    }
  }
}
