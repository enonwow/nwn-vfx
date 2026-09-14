import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {unzipSync,zipSync} from 'fflate';
import {readPcmWav,mixAudio,pcmWave,audioBytes,validateAudioAsset,analyzeAudioLevels} from '../packages/core/src/audio.js';
import {importAudio} from '../apps/service/src/audio-import.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {audioFixture} from './fixtures/audio.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {buildCandidate,readHak} from '../packages/nwn-format/src/index.js';

test('PCM16 import preserves exact source; a 0.4–1.0 clip has exact silence, samples, seeking and repeated mixes',()=>{
  const f=audioFixture();assertDocument(f.document);assert.deepEqual(audioBytes(f.asset.dataBase64),f.wav);
  const mix=mixAudio(f.document),v=new DataView(mix.pcm.buffer);assert.equal(mix.frames,48000);
  for(let i=0;i<48000;i++){assert.equal(v.getInt16(i*4,true),i<19200?0:4000);assert.equal(v.getInt16(i*4+2,true),i<19200?0:-2000);}
  for(let cycle=0;cycle<3;cycle++)assert.deepEqual(mixAudio(f.document).pcm,mix.pcm);
  for(const [start,length] of [[0,.2],[.25,.4],[.4,.3],[.75,.25]]){
    const seek=mixAudio(f.document,48000,2,start,length);assert.deepEqual(seek.pcm,mix.pcm.slice(Math.round(start*48000)*4,Math.round((start+length)*48000)*4));
  }
});
test('linear fades, source offset, overlapping clips, mute and clipping diagnostics are explicit',()=>{
  const f=audioFixture();f.document.audioClips=[{...f.clip,start:.2,duration:.4,offset:.1,gain:.5,fadeIn:.1,fadeOut:.1}];
  const mix=mixAudio(f.document),v=new DataView(mix.pcm.buffer);
  for(const [time,expected] of [[.2,0],[.25,1000],[.3,2000],[.5,2000],[.55,1000],[.6,0]])assert.ok(Math.abs(v.getInt16(Math.round(time*48000)*4,true)-expected)<=1);
  f.document.audioClips[0].enabled=false;assert(mixAudio(f.document).pcm.every(x=>x===0));
  f.document.audioClips=Array.from({length:10},(_,i)=>({...f.clip,id:'c'+i}));assert(mixAudio(f.document).clippedSamples>0);
  const invalid=structuredClone(f.document);invalid.audioClips![0].offset=.5;assert.throws(()=>assertDocument(invalid));
});
test('clip gains 0, 0.5, 1, 1.5, 2, 3 and 4 preserve exact linear PCM without changing source bytes',()=>{
  const f=audioFixture(),original=structuredClone(f.asset);
  for(const gain of [0,.5,1,1.5,2,3,4]){
    const document={...f.document,audioClips:[{...f.clip,gain}]};
    assertDocument(document);
    const portable={id:'gain-roundtrip',revision:1,document,createdAt:'2026-09-08T00:00:00Z',updatedAt:'2026-09-08T00:00:00Z'};
    assert.deepEqual(importProjectBundle(Buffer.from(exportProjectBundle(portable)).toString('base64')),document);
    const preview=mixAudio(document),pv=new DataView(preview.pcm.buffer);
    for(let i=0;i<48000;i++)for(let c=0;c<2;c++)assert.equal(pv.getInt16((i*2+c)*2,true),i<19200||gain===0?0:(c===0?4000:-2000)*gain);
    const candidate=buildCandidate(document,'gain_probe'),events=JSON.parse(new TextDecoder().decode(candidate.files.find(f=>f.name==='audio-events.json')!.data));
    assert.equal(events.events[0].gain,gain);
    for(const [file,rate,channels,start,expected] of [[events.preferredIntegration.file,44100,1,17640,[1000]],['audio-mix.wav',48000,2,19200,[4000,-2000]]] as const){
      const decoded=readPcmWav(candidate.files.find(f=>f.name===file)!.data),v=new DataView(decoded.pcm.buffer);
      assert.equal(decoded.sampleRate,rate);assert.equal(decoded.channels,channels);
      for(let i=0;i<decoded.frames;i++)for(let c=0;c<channels;c++)assert.equal(v.getInt16((i*channels+c)*2,true),i<start||gain===0?0:expected[c]*gain);
    }
    assert.deepEqual(document.audioAssets![0],original);assert.deepEqual(candidate.files.find(file=>file.name===`source-audio-${f.asset.id}.wav`)!.data,f.wav);
  }
});
test('300% doubles the 150% preview and native tone within PCM quantization without changing source',()=>{
  const f=audioFixture(true),original=structuredClone(f.document);
  const variants=[1.5,3].map(gain=>({...f.document,audioClips:[{...f.clip,gain}]}));
  for(const [rate,channels] of [[48000,2],[44100,1]] as const){
    const [half,double]=variants.map(d=>mixAudio(d,rate,channels));
    assert.equal(half.clippedSamples,0);assert.equal(double.clippedSamples,0);assert.equal(double.peak,half.peak*2);
    const a=new DataView(half.pcm.buffer),b=new DataView(double.pcm.buffer);
    for(let i=0;i<half.frames*channels;i++)assert(Math.abs(b.getInt16(i*2,true)-2*a.getInt16(i*2,true))<=1,'two quantized samples differ by at most one PCM unit');
  }
  const candidates=variants.map(d=>buildCandidate(d,'ratio_probe'));
  const native=candidates.map(c=>{const m=JSON.parse(new TextDecoder().decode(c.files.find(f=>f.name==='audio-events.json')!.data));return readPcmWav(c.files.find(f=>f.name===m.preferredIntegration.file)!.data);});
  const a=new DataView(native[0].pcm.buffer),b=new DataView(native[1].pcm.buffer);
  for(let i=0;i<native[0].frames;i++)assert(Math.abs(b.getInt16(i*2,true)-2*a.getInt16(i*2,true))<=1);
  assert.deepEqual(f.document,original);
});
test('MP3 is decoded once into explicit immutable PCM; corrupt/unsupported/oversize WAV and MP3 fail',()=>{
  const f=audioFixture(),mp3=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-f','wav','-i','pipe:0','-c:a','libmp3lame','-f','mp3','pipe:1'],{input:f.wav,windowsHide:true,maxBuffer:2097152});
  const a=importAudio('tone.mp3',mp3.toString('base64'));validateAudioAsset(a);assert.deepEqual(audioBytes(a.dataBase64),Uint8Array.from(mp3));
  assert.equal(a.decoded.channels,2);assert.equal(a.decoded.sampleRate,48000);assert(a.duration>=.6&&a.duration<.75);
  assert.throws(()=>importAudio('bad.mp3',Buffer.from('ID3broken').toString('base64')));
  assert.throws(()=>importAudio('wrong.wav',mp3.toString('base64')));
  assert.throws(()=>importAudio('unsupported.ogg',Buffer.from(f.wav).toString('base64')));
  const bad=Uint8Array.from(f.wav);new DataView(bad.buffer).setUint16(34,8,true);assert.throws(()=>readPcmWav(bad));
  assert.throws(()=>importAudio('big.wav',Buffer.alloc(2097153).toString('base64')));
});
test('gain above unity reports pre-clamp peaks and exact PCM16 clipping without normalization',()=>{
  const f=audioFixture(),pcm=new Uint8Array(800*2),raw=new DataView(pcm.buffer);
  const source=[30000,-30000,10001,-10001,0];
  for(let i=0;i<800;i++)raw.setInt16(i*2,source[i%source.length],true);
  const wav=pcmWave(pcm,8000,1),asset=importAudio('headroom.wav',Buffer.from(wav).toString('base64'));
  const document={...f.document,duration:1,audioAssets:[asset],audioClips:[{...f.clip,start:0,duration:.1,assetId:asset.id,gain:1.5}]};
  const mixed=mixAudio(document,8000,1,0,.1),v=new DataView(mixed.pcm.buffer);
  for(let i=0;i<800;i++)assert.equal(v.getInt16(i*2,true),[32767,-32768,15002,-15001,0][i%5]);
  assert.equal(mixed.peak,45000/32768);assert.equal(mixed.clippedSamples,320);assert.equal(mixed.overFullScaleSamples,320);
  for(const report of analyzeAudioLevels(document)){assert(report.peak>1);assert(report.clippedSamples>0);assert.equal(report.automaticNormalization,false);assert.equal(report.limiter,false);}
  const exported=buildCandidate(document,'overload_probe'),manifest=JSON.parse(new TextDecoder().decode(exported.files.find(f=>f.name==='audio-events.json')!.data));
  assert(manifest.preferredIntegration.audio.peak>1);assert(manifest.events[0].audio.clippedSamples>0);assert(exported.validation.diagnostics.some(d=>d.code==='AUDIO_CLIPPING'));
  assert.deepEqual(audioBytes(asset.dataBase64),wav);
  for(const gain of [-.01,4.01,NaN,Infinity])assert.throws(()=>assertDocument({...document,audioClips:[{...document.audioClips[0],gain}]}));
  // Positive full scale is 32767/32768; +1 already needs a one-unit clamp.
  for(let i=0;i<800;i++)raw.setInt16(i*2,16384,true);
  const edge=importAudio('edge.wav',Buffer.from(pcmWave(pcm,8000,1)).toString('base64'));
  const positive=mixAudio({...document,audioAssets:[edge],audioClips:[{...document.audioClips[0],assetId:edge.id,gain:2}]},8000,1,0,.1);
  assert.equal(positive.peak,1);assert.equal(positive.overFullScaleSamples,0);assert.equal(positive.clippedSamples,800);
});
test('portable v4 roundtrip binds source and PCM; NWN export supplies one full SoundImpact mix, clip events and real WAV resources',()=>{
  const f=audioFixture(),project={id:'audio-fixture',revision:1,document:f.document,createdAt:'2026-09-08T00:00:00Z',updatedAt:'2026-09-08T00:00:00Z'};
  const zip=exportProjectBundle(project);assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),f.document);
  const files=unzipSync(zip),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));assert.equal(manifest.schemaVersion,4);
  assert.deepEqual(files[`audio/${f.asset.id}.wav`],f.wav);delete files[`audio/${f.asset.id}.pcm`];
  assert.throws(()=>importProjectBundle(Buffer.from(zipSync(files)).toString('base64')));
  const candidate=buildCandidate(f.document,'audio_probe'),events=JSON.parse(new TextDecoder().decode(candidate.files.find(f=>f.name==='audio-events.json')!.data));
  assert.equal(events.autoPlayback,false);assert.equal(events.preferredIntegration.method,'visualeffects.2da.SoundImpact');assert.equal(events.events[0].start,.4);
  const full=readPcmWav(candidate.files.find(f=>f.name===events.preferredIntegration.file)!.data);assert.equal(full.channels,1);assert.equal(full.sampleRate,44100);assert.equal(full.frames,44100);
  const v=new DataView(full.pcm.buffer);for(let i=0;i<44100;i++)assert.equal(v.getInt16(i*2,true),i<17640?0:1000);
  const clip=readPcmWav(candidate.files.find(f=>f.name===events.events[0].file)!.data);assert.equal(clip.frames,26460);assert.equal(new DataView(clip.pcm.buffer).getInt16(0,true),1000);
  const hak=readHak(candidate.files.find(f=>f.name.endsWith('.hak'))!.data);assert.deepEqual(hak.find(f=>f.name===events.preferredIntegration.file)!.data,pcmWave(full.pcm,44100,1));
});
