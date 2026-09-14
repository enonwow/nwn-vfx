import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {applyChanges} from '../packages/core/src/model.js';
import {gainFromDb,gainToDb,MAX_AUDIO_GAIN,mixAudio,audioClipGains,analyzeAudioLevels,readPcmWav} from '../packages/core/src/audio.js';
import {assertDocument,validateOperationInput} from '../packages/contracts/src/schema.js';
import {validateToolInput} from '../apps/web/src/browser-contracts.js';
import {audioFixture} from './fixtures/audio.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';

test('dB input is exclusive, converted once, bounded, and still respects canonical gain locks',()=>{
  const f=audioFixture();
  for(const [gain,display] of [[1.5,'3.52'],[3,'9.54'],[6,'15.56']] as const)assert.equal(gainToDb(gain)!.toFixed(2),display);
  assert.equal(gainFromDb(0),1);assert.equal(gainFromDb(-20),.1);assert.equal(gainFromDb(20),10);
  assert.equal(gainFromDb(-60),.001);assert.equal(gainFromDb(24),MAX_AUDIO_GAIN);
  assert.equal(gainToDb(0),null);assert(Number.isFinite(gainToDb(Number.MIN_VALUE)));
  for(const gainDb of [-60.001,24.001,NaN,Infinity])assert.throws(()=>gainFromDb(gainDb));
  const command=(values:object)=>({projectId:'test',expectedRevision:1,changes:[{type:'audio.set',clipId:f.clip.id,values}]});
  for(const values of [{gain:1,gainDb:0},{gainDb:25},{gainDb:null},{gainDb:-61}]){
    assert.throws(()=>validateOperationInput('changes.apply',command(values)));
    assert.throws(()=>validateToolInput('studio.changes.apply',{viewSessionId:'view',input:command(values),idempotencyKey:'invalid-db-value'}));
    assert.throws(()=>applyChanges(f.document,command(values).changes as any,true));
  }
  const doc=applyChanges(f.document,[{type:'audio.set',clipId:f.clip.id,values:{gainDb:20}}],false);
  assertDocument(doc);assert.equal(doc.audioClips![0].gain,10);assert(!Object.hasOwn(doc.audioClips![0],'gainDb'));assert.equal(doc.schemaVersion,10);
  assert.equal(applyChanges(doc,[{type:'audio.set',clipId:f.clip.id,values:{gain:1}}],false).schemaVersion,10,'no implicit downgrade');
  const locked={...f.document,locks:[{layerId:f.clip.id,field:'gain'}]};
  assert.throws(()=>applyChanges(locked,[{type:'audio.set',clipId:f.clip.id,values:{gainDb:20}}],false),/blokad/);
  const {gain,...clip}=f.clip;
  const add={projectId:'test',expectedRevision:1,changes:[{type:'audio.add',clip:{...clip,id:'new',gainDb:-20}}]};
  validateOperationInput('changes.apply',add);validateToolInput('studio.changes.apply',{viewSessionId:'view',input:add,idempotencyKey:'add-with-db-value'});
  assert.equal(applyChanges(f.document,add.changes as any,false).audioClips![1].gain,.1);
});

test('schema 9 remains exact; expansion is schema 10 / portable v5 with explicit minimum version',()=>{
  const f=audioFixture();
  for(const gain of [0,1.5,3,6,MAX_AUDIO_GAIN]){
    const doc=applyChanges(f.document,[{type:'audio.set',clipId:f.clip.id,values:{gain}}],true);
    assert.equal(doc.schemaVersion,gain>4?10:9);
    const project={id:'db-test',revision:1,document:doc,createdAt:'2026-09-08T00:00:00.000Z',updatedAt:'2026-09-08T00:00:00.000Z'};
    const bytes=exportProjectBundle(project),manifest=JSON.parse(strFromU8(unzipSync(bytes)['manifest.json']));
    assert.equal(manifest.schemaVersion,gain>4?5:4);assert.equal(manifest.minimumStudioVersion,gain>4?'0.18.0':undefined);
    assert.deepEqual(importProjectBundle(Buffer.from(bytes).toString('base64')),doc);
    assert.deepEqual(doc.audioAssets,f.document.audioAssets);
    assert.equal(audioClipGains(doc)[0].muted,gain===0);
    if(gain>4)assert.throws(()=>assertDocument({...doc,schemaVersion:9}));
  }
});

test('dB drives actual preview and native WAV samples once, with dBFS measured before clipping',()=>{
  const f=audioFixture();
  for(const [gainDb,gain] of [[-20,.1],[0,1],[20,10],[24,MAX_AUDIO_GAIN]]){
    const doc=applyChanges(f.document,[{type:'audio.set',clipId:f.clip.id,values:{gainDb}}],true);
    const preview=mixAudio(doc),v=new DataView(preview.pcm.buffer);
    for(let i=0;i<48000;i++)for(let c=0;c<2;c++)assert.equal(v.getInt16((i*2+c)*2,true),i<19200?0:Math.round(Math.max(-32768,Math.min(32767,(c===0?4000:-2000)*gain))));
    const reports=analyzeAudioLevels(doc);assert.equal(reports[0].peakDbFS,20*Math.log10(4000*gain/32768));assert.equal(reports[0].clippedSamples,gain>=10?28800:0);
    const candidate=buildCandidate(doc,'db_signal'),events=JSON.parse(strFromU8(candidate.files.find(f=>f.name==='audio-events.json')!.data));
    const wav=readPcmWav(candidate.files.find(f=>f.name===events.preferredIntegration.file)!.data),native=new DataView(wav.pcm.buffer);
    for(let i=0;i<44100;i++)assert.equal(native.getInt16(i*2,true),i<17640?0:Math.round(1000*gain));
    assert.equal(events.preferredIntegration.audio.peakDbFS,20*Math.log10(1000*gain/32768));
    assert.deepEqual(candidate.files.find(x=>x.name===`source-audio-${f.asset.id}.wav`)!.data,f.wav);
  }
  const muted=applyChanges(f.document,[{type:'audio.set',clipId:f.clip.id,values:{gain:0}}],true);
  assert.equal(analyzeAudioLevels(muted)[0].peakDbFS,null);assert(mixAudio(muted).pcm.every(x=>x===0));
});
