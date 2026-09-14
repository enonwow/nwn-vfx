import type {EffectDocument} from '../../../packages/core/src/model.js';
import {mixAudio} from '../../../packages/core/src/audio.js';

export function audioTimelineBuffer(context:BaseAudioContext,document:EffectDocument):AudioBuffer {
  const mix=mixAudio(document),buffer=context.createBuffer(2,mix.frames,48000),v=new DataView(mix.pcm.buffer);
  for(let c=0;c<2;c++){const channel=buffer.getChannelData(c);for(let f=0;f<mix.frames;f++)channel[f]=v.getInt16((f*2+c)*2,true)/32768;}
  return buffer;
}
/** At most one full-timeline source. Only explicit human gestures unlock audio. */
export class AudioTimelinePlayer {
  private context?:AudioContext;private master?:GainNode;private source?:AudioBufferSourceNode;private buffer?:AudioBuffer;
  private document?:EffectDocument;private offset=0;private anchor=performance.now()/1000;private playing=false;private loop=true;
  private muted=true;private gain=.15;
  // Once an AudioContext exists it owns time even while suspended: its clock
  // freezes with the samples. Never mix its epoch with performance.now().
  private clock(){return this.context?this.context.currentTime:performance.now()/1000;}
  position(){const length=this.document?.duration??1,elapsed=this.playing?Math.max(0,this.clock()-this.anchor):0;
    return this.loop?(this.offset+elapsed)%length:Math.min(length,this.offset+elapsed);}
  private stopSource(){if(this.source){this.source.onended=null;try{this.source.stop();}catch{}this.source.disconnect();this.source=undefined;}}
  configure(document:EffectDocument,time:number,playing:boolean,loop:boolean){
    this.stopSource();
    if(document!==this.document){this.document=document;this.buffer=undefined;}
    this.offset=Math.max(0,Math.min(document.duration,time));this.playing=playing;this.loop=loop;
    if(this.context&&this.master&&playing&&document.audioClips?.some(c=>c.enabled)){
      this.buffer??=audioTimelineBuffer(this.context,document);
      if(loop||this.offset<document.duration){
        const source=this.context.createBufferSource();source.buffer=this.buffer;source.loop=loop;source.connect(this.master);
        source.onended=()=>{if(this.source===source){source.disconnect();this.source=undefined;}};
        source.start(0,loop?this.offset%document.duration:this.offset);this.source=source;
      }
    }
    this.anchor=this.clock();
  }
  async unlock(){
    const position=this.position();
    if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);
      // Convert the clock epoch synchronously. A delayed resume must never
      // overwrite a newer Play/Stop/seek with the position from the old click.
      if(this.document)this.configure(this.document,position,this.playing,this.loop);
    }
    await this.context.resume();this.monitor(this.muted,this.gain);
  }
  monitor(muted:boolean,gain:number){this.muted=muted;this.gain=Math.max(0,Math.min(1,gain));
    if(this.master&&this.context){const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);this.master.gain.setValueAtTime(this.master.gain.value,now);this.master.gain.linearRampToValueAtTime(muted?0:this.gain,now+.015);}}
  status(){return{muted:this.muted,gain:this.gain,unlocked:!!this.context,activeSources:this.source?1:0,loop:this.loop};}
  close(){this.stopSource();void this.context?.close();}
}
