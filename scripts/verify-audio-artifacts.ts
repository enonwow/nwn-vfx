import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readPcmWav} from '../packages/core/src/audio.js';
const out=resolve('output/releases/0.15.0/audio'),proof=JSON.parse(await readFile(join(out,'installed-audio-proof.json'),'utf8')),report:any={passed:false,nativeVerified:false,fixtures:[]};
for(const f of proof.fixtures){
  const name=f.projectId.includes('bite')?'bite':'heart',dir=join(out,name),manifest=JSON.parse(await readFile(join(dir,'candidate/audio-events.json'),'utf8'));
  const source=readPcmWav(await readFile(join(dir,'candidate',`source-audio-${f.source.audioSha256}.wav`))),native=readPcmWav(await readFile(join(dir,'candidate',manifest.preferredIntegration.file)));
  const sv=new DataView(source.pcm.buffer,source.pcm.byteOffset,source.pcm.byteLength),nv=new DataView(native.pcm.buffer,native.pcm.byteOffset,native.pcm.byteLength);let maxDifference=0;
  for(let frame=0;frame<native.frames;frame++){
    let sum=0;
    for(const e of manifest.events){const time=frame/44100-e.start;if(time< -1e-12||time>=e.duration)continue;const position=Math.max(0,time)*source.sampleRate,a=Math.floor(position),b=Math.min(source.frames-1,a+1),fraction=position-a;
      for(let c=0;c<source.channels;c++)sum+=(sv.getInt16((a*source.channels+c)*2,true)*(1-fraction)+sv.getInt16((b*source.channels+c)*2,true)*fraction)/source.channels;
    }
    maxDifference=Math.max(maxDifference,Math.abs(nv.getInt16(frame*2,true)-Math.round(sum)));
  }
  assert.ok(maxDifference<=1,`Independent native timing: ${maxDifference} PCM units`);
  const path=join(dir,'video/decoded-opus.pcm');await promisify(execFile)('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',join(dir,'video/preview.webm'),'-map','0:a:0','-ar','48000','-ac','2','-f','s16le',path],{windowsHide:true});
  const movie=await readFile(path),mv=new DataView(movie.buffer,movie.byteOffset,movie.byteLength);assert.equal(movie.length/4,manifest.duration*48000);
  const rms=(from:number,to:number)=>{let sum=0,count=0;for(let n=Math.round(from*48000);n<Math.round(to*48000);n++){sum+=(mv.getInt16(n*4,true)/32768)**2;count++;}return Math.sqrt(sum/count);};
  const preClipRms=rms(0,manifest.events[0].start-.03),activeRms=rms(manifest.events[0].start+.04,manifest.events[0].start+manifest.events[0].duration-.04);assert.ok(preClipRms<.0001);assert.ok(activeRms>.0001);
  const entry:any={projectId:f.projectId,revision:f.revision,independentMonoMaxPcmUnitDifference:maxDifference,decodedMovieFrames:movie.length/4,preClipRms,activeRms,opusLossy:true};
  if(name==='heart'){
    const reference=readPcmWav(await readFile('C:/Projects/the last city/assets/vfx/wampir/audio/heartbeat/v1/heartbeat-two-beats-v1-2s.wav'));
    entry.reference={sampleRate:reference.sampleRate,channels:reference.channels,frames:reference.frames};
    entry.accentTimes=manifest.events.map((e:any)=>e.start+.3128344671201814);assert.ok(Math.abs(entry.accentTimes[0]-.45)<1e-12&&Math.abs(entry.accentTimes[1]-1.2)<1e-12);
    entry.artisticTimingApproved=false;
  }
  report.fixtures.push(entry);
}
report.passed=true;await writeFile(join(out,'signal-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
