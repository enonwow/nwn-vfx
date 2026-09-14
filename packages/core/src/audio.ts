import {DomainError,type EffectDocument} from './model.js';
import {sha256Bytes} from './textures.js';

export const MIN_AUDIO_GAIN_DB=-60,MAX_AUDIO_GAIN_DB=24;
export const MAX_AUDIO_GAIN=10**(MAX_AUDIO_GAIN_DB/20);
import {BEAM_AUDIO_CAPABILITIES} from './beam-audio-types.js';
export {BEAM_AUDIO_CAPABILITIES} from './beam-audio-types.js';
export function hasBeamAudio(document:EffectDocument):boolean {return document.lifecycle==='beam'&&!!document.audioClips?.some(c=>c.enabled);}
export const DURATION_AUDIO_CAPABILITIES={version:1,minimumStudioVersion:'0.24.0',documentSchemaVersion:15,portableVersion:10,
  period:'document.duration',sampleRates:[48000,44100],periodMustFitWholeSamples:true,preview:'repeat-one-period-pcm',
  composition:'audio-omitted',nativeRepeat:'explicit-consumer-schedule',nativeImmediateStop:false,nativeVerified:false} as const;
export const AUDIO_CAPABILITIES={version:6,minimumStudioVersion:'0.18.0',trackType:'audio',inputFormats:['wav-pcm16','mp3'],maxFileBytes:2097152,maxDuration:30,
  gain:{min:0,max:MAX_AUDIO_GAIN,unity:1,storedField:'gain',mute:0},
  gainDb:{min:MIN_AUDIO_GAIN_DB,max:MAX_AUDIO_GAIN_DB,unity:0,sliderStep:0.5,formula:'gain = 10^(gainDb/20)',exclusiveWith:'gain',silenceReadValue:null},
  migration:{legacySchema:9,legacyMaxGain:4,expandedSchema:10,expandedPortableVersion:5,automaticOnGainAbove:4,existingGainsPreserved:true},
  clipping:{policy:'hard-clip-pcm16',automaticNormalization:false,limiter:false,peakMeasurement:'sample-before-clamp',peakUnit:'dBFS',silencePeakDbFS:null},
  maxAssets:8,maxClips:32,maxDocumentBytes:6291456,mixSampleRate:48000,mixChannels:2,
  sourceBytesPreserved:true,previewStartsMuted:true,clipControls:['start','duration','offset','gain','gainDb','fadeIn','fadeOut','enabled'],
  duration:DURATION_AUDIO_CAPABILITIES,beam:BEAM_AUDIO_CAPABILITIES,
  export:{video:'webm-opus',resource:'wav-pcm16-mono-44100',timing:'explicit-soundimpact-full-mix',alternateTiming:'explicit-nwscript-events',nativeVerified:false}} as const;
export interface AudioAsset {
  id:string; name:string; mime:'audio/wav'|'audio/mpeg'; dataBase64:string;
  source:{fileName:string;sha256:string;bytes:number};
  decoded:{codec:'pcm-s16le';sampleRate:number;channels:1|2;frames:number;sha256:string;pcmBase64:string;decoder:string};
  duration:number; waveform:number[];
}
export interface AudioClip {id:string;type:'audio';name:string;assetId:string;enabled:boolean;start:number;duration:number;offset:number;gain:number;fadeIn:number;fadeOut:number}
export type AudioValues=Partial<Omit<AudioClip,'id'|'type'>> & {gainDb?:number};
export type AudioClipInput=Omit<AudioClip,'gain'> & ({gain:number;gainDb?:never}|{gainDb:number;gain?:never});
function fail(message:string):never {throw new DomainError('INVALID_AUDIO',message);}
export function gainFromDb(gainDb:number):number {
  if(!Number.isFinite(gainDb)||gainDb<MIN_AUDIO_GAIN_DB||gainDb>MAX_AUDIO_GAIN_DB)fail('Wzmocnienie musi być liczbą od -60 do +24 dB. Wyciszenie: gain=0.');
  return 10**(gainDb/20);
}
/** Null is silence; never put an infinite dB value in a public JSON result. */
export function gainToDb(gain:number):number|null {
  if(!Number.isFinite(gain)||gain<0)fail('Wzmocnienie musi być skończone i nieujemne.');
  return gain===0?null:20*Math.log10(gain);
}
export function normalizeAudioValues<T extends AudioValues>(values:T):Omit<T,'gainDb'> {
  if(Object.hasOwn(values,'gainDb')&&Object.hasOwn(values,'gain'))fail('Podaj tylko gainDb albo gain, nigdy oba naraz.');
  const {gainDb,...rest}=values;
  if(Object.hasOwn(values,'gainDb'))(rest as AudioValues).gain=gainFromDb(gainDb!);
  return rest;
}
export function audioClipGains(document:EffectDocument|null){
  return (document?.audioClips??[]).map(c=>({clipId:c.id,gain:c.gain,gainDb:gainToDb(c.gain),muted:c.gain===0,enabled:c.enabled}));
}
export function audioGainDiagnostic(document:EffectDocument){
  return {code:'AUDIO_CLIP_GAINS',severity:'info',clips:audioClipGains(document)};
}
export function audioBytes(value:string,max=6_000_000):Uint8Array {
  if(typeof value!=='string'||value.length>4*Math.ceil(max/3)||value.length%4||!value.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))fail('Audio wymaga poprawnego, ograniczonego base64.');
  const str=atob(value),bytes=Uint8Array.from(str,c=>c.charCodeAt(0));
  if(bytes.length>max||audioBase64(bytes)!==value)fail('Niekanoniczne base64 lub przekroczony rozmiar audio.');return bytes;
}
export function audioBase64(bytes:Uint8Array):string {
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);
}
export function readPcmWav(bytes:Uint8Array){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=(i:number)=>String.fromCharCode(...bytes.subarray(i,i+4));
  if(bytes.length<44||tag(0)!=='RIFF'||tag(8)!=='WAVE'||view.getUint32(4,true)+8!==bytes.length)fail('Wymagany kompletny RIFF/WAVE PCM16.');
  let format:{sampleRate:number;channels:1|2}|undefined,pcm:Uint8Array|undefined;
  for(let i=12;i<bytes.length;){
    if(i+8>bytes.length)fail('Ucięty nagłówek WAV.');const size=view.getUint32(i+4,true),end=i+8+size;
    if(end>bytes.length)fail('Ucięte dane WAV.');
    if(tag(i)==='fmt '){
      if(format||size<16)fail('Niepoprawny fmt WAV.');const channels=view.getUint16(i+10,true),rate=view.getUint32(i+12,true);
      if(view.getUint16(i+8,true)!==1||view.getUint16(i+22,true)!==16||![1,2].includes(channels)||rate<8000||rate>48000
        ||view.getUint16(i+20,true)!==channels*2||view.getUint32(i+16,true)!==rate*channels*2)fail('Obsługiwany WAV: PCM16, mono/stereo, 8–48 kHz.');
      format={sampleRate:rate,channels:channels as 1|2};
    }else if(tag(i)==='data'){if(pcm)fail('Powtórzony blok danych WAV.');pcm=bytes.slice(i+8,end);}
    i=end+(size%2);
  }
  if(!format||!pcm?.length||pcm.length%(format.channels*2))fail('Brak pełnych próbek WAV.');
  const frames=pcm.length/(format.channels*2);if(frames/format.sampleRate>30)fail('Audio przekracza 30 s.');
  return{...format!,frames,pcm:pcm!};
}
export function pcmWave(pcm:Uint8Array,sampleRate:number,channels:number):Uint8Array {
  const bytes=new Uint8Array(44+pcm.length),v=new DataView(bytes.buffer),tag=(i:number,s:string)=>bytes.set(new TextEncoder().encode(s),i);
  tag(0,'RIFF');v.setUint32(4,36+pcm.length,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
  v.setUint16(22,channels,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);
  tag(36,'data');v.setUint32(40,pcm.length,true);bytes.set(pcm,44);return bytes;
}
export function waveform(pcm:Uint8Array,channels:number,frames:number):number[]{
  const view=new DataView(pcm.buffer,pcm.byteOffset,pcm.byteLength);
  return Array.from({length:128},(_,bin)=>{let peak=0;for(let f=Math.floor(bin*frames/128);f<Math.floor((bin+1)*frames/128);f++)for(let c=0;c<channels;c++)peak=Math.max(peak,Math.abs(view.getInt16((f*channels+c)*2,true)/32768));return peak;});
}
export function audioMetadata(asset:AudioAsset){const{dataBase64,decoded,...rest}=asset;const{pcmBase64,...decodedMetadata}=decoded;return{...rest,decoded:decodedMetadata};}
const verifiedAssets=new WeakSet<object>();
export function validateAudioAsset(asset:AudioAsset){
  if(verifiedAssets.has(asset))return;
  const bytes=audioBytes(asset.dataBase64,AUDIO_CAPABILITIES.maxFileBytes),pcm=audioBytes(asset.decoded.pcmBase64),d=asset.decoded;
  if(sha256Bytes(bytes)!==asset.id||asset.source.sha256!==asset.id||asset.source.bytes!==bytes.length||asset.source.fileName!==asset.name
    ||sha256Bytes(pcm)!==d.sha256||pcm.length!==d.frames*d.channels*2||asset.duration!==d.frames/d.sampleRate)fail('Niezgodny hash, pochodzenie lub długość audio.');
  if(asset.mime==='audio/wav'){
    const wav=readPcmWav(bytes);if(wav.sampleRate!==d.sampleRate||wav.channels!==d.channels||sha256Bytes(wav.pcm)!==d.sha256)fail('PCM nie odpowiada źródłowemu WAV.');
  }else if(bytes.length<4||!(String.fromCharCode(...bytes.subarray(0,3))==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))fail('Niepoprawny nagłówek MP3.');
  if(JSON.stringify(waveform(pcm,d.channels,d.frames))!==JSON.stringify(asset.waveform))fail('Przebieg fali nie odpowiada próbkom.');
  verifiedAssets.add(asset);
}
export function assertAudioDocument(document:EffectDocument){
  if(hasBeamAudio(document)){
    if(document.schemaVersion<24||!document.layers.some(l=>l.enabled&&l.type==='emitter'&&l.beamBinding?.role==='flow'))
      throw new DomainError('BEAM_AUDIO_INVALID','Audio beama wymaga skończonego Fountain/P2P i dokumentu 24 (Studio 0.30.0).');
    for(const rate of [44100,48000])if(Math.abs(document.duration*rate-Math.round(document.duration*rate))>1e-7)
      throw new DomainError('BEAM_AUDIO_INVALID','Czas beama z audio musi mieścić całe próbki 44100 i 48000 Hz (wielokrotność 1/300 s). Źródło nie zostanie zaokrąglone.',{sampleRate:rate,durationSeconds:document.duration});
  }
  if(document.lifecycle==='duration'&&document.audioClips?.some(c=>c.enabled)&&document.schemaVersion<15)
    throw new DomainError('DURATION_AUDIO_INVALID','Aktywne audio DUR wymaga dokumentu 15 i Studio 0.24.0.');
  if(document.lifecycle==='duration'&&document.audioClips?.some(c=>c.enabled))
    for(const rate of [44100,48000])if(Math.abs(document.duration*rate-Math.round(document.duration*rate))>1e-7)
      throw new DomainError('DURATION_AUDIO_INVALID','Okres DUR z audio musi mieścić całe próbki 44100 i 48000 Hz (wielokrotność 1/300 s). Długość nie zostanie zaokrąglona.',{sampleRate:rate,periodSeconds:document.duration});
  if((document.audioAssets?.length??0)>8||(document.audioClips?.length??0)>32)fail('Limit audio: 8 zasobów i 32 klipy.');
  const ids=new Set(document.layers.map(l=>l.id)),assets=new Map<string,AudioAsset>();
  for(const asset of document.audioAssets??[]){if(assets.has(asset.id))fail('Powtórzony zasób audio.');validateAudioAsset(asset);assets.set(asset.id,asset);}
  for(const clip of document.audioClips??[]){
    for(const [key,min,max] of [['start',0,30],['duration',.001,30],['offset',0,30],['gain',0,document.schemaVersion<10?4:MAX_AUDIO_GAIN],['fadeIn',0,2],['fadeOut',0,2]] as const)
      if(!Number.isFinite(clip[key])||clip[key]<min||clip[key]>max)fail(`Niepoprawny parametr klipu: ${key}.`);
    if(ids.has(clip.id))fail('ID klipu musi być unikalne także względem warstw VFX.');ids.add(clip.id);
    const asset=assets.get(clip.assetId);if(!asset)fail('Klip odwołuje się do nieistniejącego dźwięku.');
    if(clip.start+clip.duration>document.duration+1e-9||clip.offset+clip.duration>asset.duration+1e-9)fail('Klip wykracza poza efekt lub źródło audio.');
    if(clip.fadeIn+clip.fadeOut>clip.duration+1e-9)fail('Fade-in i fade-out razem przekraczają długość klipu.');
  }
}
export function clipEnvelope(clip:AudioClip,local:number){
  if(local<0||local>=clip.duration)return 0;
  return clip.gain*Math.min(1,clip.fadeIn>0?local/clip.fadeIn:1,clip.fadeOut>0?(clip.duration-local)/clip.fadeOut:1);
}
/** Same finite PCM mixer for browser playback, video and resource derivatives.
 * Sample k belongs to timeline k/rate; overlap adds linearly then clamps once. */
function audioSum(document:EffectDocument,rate:number,channels:1|2,start:number,duration:number){
  assertAudioDocument(document);
  if(!Number.isInteger(rate)||rate<8000||rate>48000||![1,2].includes(channels)||!Number.isFinite(duration)||duration<.001||duration>30||!Number.isFinite(start)||start<0||start>30)fail('Niepoprawny zakres miksu audio.');
  const frames=Math.round(duration*rate),sum=new Float64Array(frames*channels);
  for(const clip of document.audioClips??[]){
    if(!clip.enabled)continue;const asset=document.audioAssets?.find(a=>a.id===clip.assetId);if(!asset)fail('Brak zasobu audio do miksu.');
    const d=asset.decoded,bytes=audioBytes(d.pcmBase64),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const from=Math.max(0,Math.ceil((clip.start-start)*rate-1e-7)),to=Math.min(frames,Math.ceil((clip.start+clip.duration-start)*rate-1e-7));
    const sample=(frame:number,ch:number)=>v.getInt16((Math.min(d.frames-1,Math.max(0,frame))*d.channels+ch)*2,true)/32768;
    for(let i=from;i<to;i++){
      const local=start+i/rate-clip.start,position=(clip.offset+local)*d.sampleRate,f=Math.floor(position),t=position-f,gain=clipEnvelope(clip,Math.max(0,local));
      for(let c=0;c<channels;c++){
        const interpolate=(ch:number)=>sample(f,ch)*(1-t)+sample(f+1,ch)*t;
        const value=channels===1&&d.channels===2?(interpolate(0)+interpolate(1))*.5:interpolate(d.channels===1?0:c);
        sum[i*channels+c]+=value*gain;
      }
    }
  }
  return sum;
}
export function mixAudio(document:EffectDocument,rate=48000,channels:1|2=2,start=0,duration=document.duration){
  let sum:Float64Array;
  if(document.lifecycle==='duration'&&document.audioClips?.some(c=>c.enabled)){
    // Build one period before quantization, then repeat its exact sample phase.
    // This avoids floating-point drift from repeated subtraction of k*period.
    const period=audioSum(document,rate,channels,0,document.duration),periodFrames=period.length/channels;
    if(Math.abs(document.duration*rate-periodFrames)>1e-7)throw new DomainError('DURATION_AUDIO_INVALID','Okres nie mieści całych próbek wybranej częstotliwości.');
    if(!Number.isFinite(duration)||duration<.001||duration>30||!Number.isFinite(start)||start<0||start>30)fail('Niepoprawny zakres miksu audio.');
    sum=new Float64Array(Math.round(duration*rate)*channels);
    const first=start*rate,index=Math.floor(first),fraction=first-index;
    for(let i=0;i<sum.length/channels;i++)for(let c=0;c<channels;c++){
      const a=((index+i)%periodFrames)*channels+c,b=((index+i+1)%periodFrames)*channels+c;
      sum[i*channels+c]=fraction===0?period[a]:period[a]*(1-fraction)+period[b]*fraction;
    }
  }else sum=audioSum(document,rate,channels,start,duration);
  const frames=sum.length/channels,pcm=new Uint8Array(sum.length*2),v=new DataView(pcm.buffer);let peak=0,clippedSamples=0,overFullScaleSamples=0;
  for(let i=0;i<sum.length;i++){
    peak=Math.max(peak,Math.abs(sum[i]));if(Math.abs(sum[i])>1)overFullScaleSamples++;
    if(sum[i]<-1||sum[i]>32767/32768)clippedSamples++;
    v.setInt16(i*2,Math.round(Math.max(-1,Math.min(32767/32768,sum[i]))*32768),true);
  }
  return{pcm,sampleRate:rate,channels,frames,peak,clippedSamples,overFullScaleSamples};
}

export function audioLevelReport(mix:ReturnType<typeof mixAudio>){
  const {pcm,...levels}=mix;
  return{...levels,peakDbFS:gainToDb(levels.peak),clippingPolicy:'hard-clip-pcm16' as const,automaticNormalization:false as const,limiter:false as const};
}
export function audioLevelDiagnostic(report:ReturnType<typeof audioLevelReport>){
  return{code:report.clippedSamples?'AUDIO_CLIPPING':'AUDIO_LEVEL',severity:report.clippedSamples?'warning' as const:'info' as const,
    message:`${report.sampleRate} Hz ${report.channels===2?'stereo':'mono'}: szczyt ${report.peakDbFS===null?'−∞ dBFS (cisza)':`${report.peakDbFS.toFixed(2)} dBFS`}; ${report.overFullScaleSamples} próbek powyżej |1|, ${report.clippedSamples} przyciętych do zakresu PCM16. Bez normalizacji i limitera.`};
}
export function analyzeAudioLevels(document:EffectDocument){
  return [audioLevelReport(mixAudio(document)),audioLevelReport(mixAudio(document,44100,1))];
}
