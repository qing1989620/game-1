import { musicVoices, stepSeconds, type MusicCity } from './music';

/** Original procedural soundtrack. No files, tracking, external requests or autoplay. */
export class CityAudio {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private enabled = false;
  private paused = false;
  private timer: number | null = null;
  private beat = 0;
  private next = 0;
  recovered = false;
  city: MusicCity = 'dock';
  windSeverity=0;
  private windBuffer:AudioBuffer|null=null;
  unlock(): void {
    try {
      if(!this.ctx){this.ctx=new AudioContext();this.bus=this.ctx.createGain();this.bus.gain.value=0;const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.ratio.value=6;this.bus.connect(limiter);limiter.connect(this.ctx.destination);}
      if(this.ctx.state==='suspended')void this.ctx.resume().catch(()=>{});
    } catch {this.enabled=false;}
  }
  setEnabled(enabled: boolean): void {
    this.enabled=enabled;if(enabled)this.unlock();
    this.applyVolume();
    if(enabled&&!this.timer&&this.ctx){this.next=this.ctx.currentTime+.05;this.timer=window.setInterval(()=>this.schedule(),80);}
    if(!enabled&&this.timer){clearInterval(this.timer);this.timer=null;}
  }
  setPaused(paused: boolean): void {
    this.paused=paused;this.applyVolume();
    if(!paused&&this.ctx)this.next=this.ctx.currentTime+.1;
  }
  private applyVolume(): void {
    if(this.ctx&&this.bus)this.bus.gain.setTargetAtTime(this.enabled && !this.paused ? .5 : 0,this.ctx.currentTime,.12);
  }
  private tone(freq: number,at: number,duration: number,volume: number,type: OscillatorType='sine'): void {
    if(!this.ctx||!this.bus)return;
    const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type=type;osc.frequency.value=freq;
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(this.bus);osc.start(at);osc.stop(at+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  private schedule(): void {
    if(!this.ctx||this.paused)return;
    const now=this.ctx.currentTime;
    if(this.next<now-.5)this.next=now+.05;
    while(this.next<now+.2){
      const at=this.next;
      // The arrangement itself lives in music.ts so it can be unit-tested;
      // this method only turns voices into nodes.
      for(const voice of musicVoices(this.city,this.recovered,this.beat)){
        this.tone(voice.freq,at+voice.offset,voice.dur,voice.gain,voice.wave);
      }
      // Wind needs a noise buffer, so it stays here rather than in the plan.
      if((this.city==='snow'||this.city==='dune')&&this.beat%4===0)this.wind(at);
      this.beat++;this.next+=stepSeconds(this.city);
    }
  }
  private wind(at:number):void {
    if(!this.ctx||!this.bus)return;
    if(!this.windBuffer){this.windBuffer=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate);const data=this.windBuffer.getChannelData(0);let seed=177;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=((seed>>>0)/4294967296)*2-1;}}
    const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();source.buffer=this.windBuffer;filter.type=this.city==='dune'?'bandpass':'lowpass';filter.frequency.value=(this.city==='dune'?480:220)+this.windSeverity*600;
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.012+this.windSeverity*.04,at+.5);gain.gain.exponentialRampToValueAtTime(.0001,at+1.9);source.connect(filter);filter.connect(gain);gain.connect(this.bus);source.start(at);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  cue(kind:'scan'|'select'|'fail'|'success'|'step'|'jump'): void {
    if(!this.enabled||this.paused||!this.ctx)return;
    const at=this.ctx.currentTime;
    if(kind==='scan'){for(let i=0;i<5;i++)this.tone(220+i*110,at+i*.06,.22,.04);}
    if(kind==='select'){this.tone(660,at,.09,.07);this.tone(880,at+.03,.12,.025);}
    if(kind==='fail'){this.tone(146.83,at,.3,.08,'triangle');this.tone(138.59,at+.1,.4,.06,'triangle');}
    if(kind==='success'){[146.83,220,293.66,369.99,440].forEach((n,i)=>this.tone(n,at+i*.16,1.5,.07));}
    if(kind==='jump')this.tone(220,at,.18,.03,'triangle');
    if(kind==='step')this.tone(68,at,.04,.04);
  }
}
