import {execFileSync} from 'node:child_process';
import {DomainError,type EffectDocument} from '../../../packages/core/src/model.js';
import {audioBytes,audioBase64,readPcmWav,waveform,type AudioAsset} from '../../../packages/core/src/audio.js';
import {sha256Bytes} from '../../../packages/core/src/textures.js';

export function importAudio(fileName:string,dataBase64:string):AudioAsset {
  const bytes=audioBytes(dataBase64,2097152),id=sha256Bytes(bytes);
  let sampleRate:number,channels:1|2,frames:number,pcm:Uint8Array,mime:AudioAsset['mime'],decoder:string;
  if(/\.wav$/i.test(fileName)){
    ({sampleRate,channels,frames,pcm}=readPcmWav(bytes));mime='audio/wav';decoder='studio-pcm16-exact-v1';
  }else if(/\.mp3$/i.test(fileName)){
    if(bytes.length<4||!(String.fromCharCode(...bytes.subarray(0,3))==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))throw new DomainError('INVALID_AUDIO','Plik nie ma nagłówka MP3.');
    try{
      pcm=new Uint8Array(execFileSync(process.env.NWN_VFX_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-xerror','-f','mp3','-i','pipe:0','-map','0:a:0','-vn','-t','30.01','-ac','2','-ar','48000','-c:a','pcm_s16le','-f','s16le','pipe:1'],
        {input:bytes,windowsHide:true,timeout:15000,maxBuffer:6_000_000,stdio:['pipe','pipe','pipe']}));
    }catch(error){const e=error as NodeJS.ErrnoException;throw new DomainError(e.code==='ENOENT'?'AUDIO_DECODER_UNAVAILABLE':'INVALID_AUDIO',e.code==='ENOENT'?'Dekodowanie MP3 wymaga FFmpeg.':'Nie można zdekodować kompletnego MP3 w limicie 15 s.');}
    sampleRate=48000;channels=2;frames=pcm.length/4;mime='audio/mpeg';decoder='ffmpeg-pcm16-stereo-48000-v1';
    if(!frames||!Number.isInteger(frames)||frames/sampleRate>30)throw new DomainError('INVALID_AUDIO','MP3 jest pusty lub przekracza 30 s.');
  }else throw new DomainError('INVALID_AUDIO','Importuj WAV PCM16 albo MP3.');
  return{id,name:fileName,mime,dataBase64,source:{fileName,sha256:id,bytes:bytes.length},
    decoded:{codec:'pcm-s16le',sampleRate,channels,frames,sha256:sha256Bytes(pcm),pcmBase64:audioBase64(pcm),decoder},
    duration:frames/sampleRate,waveform:waveform(pcm,channels,frames)};
}
/** Portable/untrusted documents cannot substitute unrelated decoded MP3 samples. */
export function verifyAudioImports(document:EffectDocument){
  for(const asset of document.audioAssets??[])if(asset.mime==='audio/mpeg'){
    const decoded=importAudio(asset.name,asset.dataBase64);if(decoded.decoded.sha256!==asset.decoded.sha256)throw new DomainError('INVALID_AUDIO','PCM w projekcie nie odpowiada dekodowaniu źródłowego MP3.');
  }
}
