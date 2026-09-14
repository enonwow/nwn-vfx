import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {durationAudioFixture} from './fixtures/duration-audio.js';
import {applyChanges,promoteDocumentSchema} from '../packages/core/src/model.js';
import {mixAudio,readPcmWav} from '../packages/core/src/audio.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {exportAudio} from '../packages/nwn-format/src/audio-export.js';
import {createApp} from '../apps/service/src/app.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};

test('DUR audio repeats exact PCM phases, gain, offsets, fades and silence for three periods and partial windows',()=>{
  const {document:d}=durationAudioFixture(),original=canonical(d);assertDocument(d);assert.equal(d.schemaVersion,15);
  for(const rate of [44100,48000])for(const channels of [1,2] as const){
    const one=mixAudio(d,rate,channels),three=mixAudio(d,rate,channels,0,4.8),finite=mixAudio({...d,lifecycle:'impact'},rate,channels);
    assert.deepEqual(one.pcm,finite.pcm);assert.equal(one.frames,1.6*rate);assert.equal(three.frames,4.8*rate);
    for(let i=0;i<3;i++)assert.deepEqual(three.pcm.slice(i*one.pcm.length,(i+1)*one.pcm.length),one.pcm);
    const window=mixAudio(d,rate,channels,1.6+123/rate,2.4);
    assert.deepEqual(window.pcm,three.pcm.slice((one.frames+123)*channels*2,(one.frames+123+window.frames)*channels*2));
    assert(one.pcm.slice(0,.2*rate*channels*2).every(n=>n===0));assert(one.pcm.slice(1.3*rate*channels*2).every(n=>n===0));assert(one.pcm.some(n=>n!==0));
    const muted=applyChanges(d,[{type:'audio.set',clipId:'up',values:{gain:0}},{type:'audio.set',clipId:'down',values:{enabled:false}}],true);assert(mixAudio(muted,rate,channels,0,4.8).pcm.every(n=>n===0));
  }
  assert.equal(canonical(d),original);
  const old=structuredClone(d);old.schemaVersion=14;assert.throws(()=>assertDocument(old));
  old.audioClips!.forEach(c=>c.enabled=false);assertDocument(old);assert.equal(promoteDocumentSchema(old).schemaVersion,14);
  const bad=structuredClone(d);bad.duration=1.6001;assert.throws(()=>mixAudio(bad),{code:'DURATION_AUDIO_INVALID'});
  assert.throws(()=>mixAudio(d,12346),{code:'DURATION_AUDIO_INVALID'});
});

test('DUR WAV is one exact period with an explicit finite consumer schedule; ZIP10 preserves all source bytes',()=>{
  const {document:d}=durationAudioFixture(),source=canonical(d),exported=exportAudio(d,'audio_dur'),manifest=JSON.parse(Buffer.from(exported.files.find(f=>f.name==='audio-events.json')!.data).toString());
  assert.equal(manifest.version,2);assert.equal(manifest.nativeVerified,false);assert.equal(manifest.autoPlayback,false);
  const binding=manifest.preferredIntegration,wav=exported.resources.find(f=>f.name===binding.file)!.data,decoded=readPcmWav(wav);
  assert.equal(binding.method,'consumer-scheduled-period-wav');assert.equal(binding.automaticSoundImpactLoop,false);
  assert.equal(binding.schedule.intervalSeconds,1.6);assert.equal(binding.schedule.firstStartSeconds,0);assert.equal(binding.schedule.repetitions,null);
  assert.equal(binding.stop.stopHandleForIssuedSound,false);assert.equal(binding.stop.actionQueueMayExtendTailBeyondExternalEnd,true);
  assert.equal(decoded.frames,70560);assert.equal(hash(wav),binding.sha256);assert.equal(hash(decoded.pcm),binding.pcmSha256);assert.deepEqual(decoded.pcm,mixAudio(d,44100,1).pcm);
  assert.deepEqual(manifest.events.map((e:any)=>[e.start,e.offset,e.gain]),[[.2,.1,.25],[1,.25,.125]]);
  const zip=exportProjectBundle({id:'audio-dur',revision:1,document:d,createdAt:'',updatedAt:''}),bundle=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));
  assert.equal(bundle.schemaVersion,10);assert.equal(bundle.minimumStudioVersion,'0.24.0');assert.equal(canonical(importProjectBundle(Buffer.from(zip).toString('base64'))),source);
  const fnf={...d,lifecycle:'impact' as const,profileId:'nwn-ee-impact-ascii-experimental-v1'};
  const original=exportAudio(fnf,'audio_fnf'),fnfManifest=JSON.parse(Buffer.from(original.files.find(f=>f.name==='audio-events.json')!.data).toString());
  assert.equal(fnfManifest.version,1);assert.equal(fnfManifest.preferredIntegration.method,'visualeffects.2da.SoundImpact');assert.equal(canonical(d),source);
});

test('DUR audio shared operations retain grants, locks, pause, retries, undo and old-client rollback',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-duration-audio-')),app=await createApp({dataDir:dir});
  const call=(operation:string,input:Record<string,unknown>={},actor='owner',key=randomUUID(),schema=15)=>app.studio.dispatch(actor,{operation,input,idempotencyKey:key},schema);
  try{
    const {document:d}=durationAudioFixture(),initial=structuredClone(d);initial.audioClips=[];initial.schemaVersion=13;let p=ok(call('projects.import',{document:initial}));
    const actor=ok(call('actors.create',{name:'DUR audio agent',projectIds:[p.id],scopes:['read','edit','export','render','build','artifacts','jobs']}));
    const input={projectId:p.id,expectedRevision:1,changes:d.audioClips!.map(clip=>({type:'audio.add',clip}))};
    assert.equal(call('changes.apply',input,actor.id,randomUUID(),14).error!.code,'CLIENT_UPGRADE_REQUIRED');assert.equal(ok(call('projects.inspect',{projectId:p.id})).revision,1);
    const key=randomUUID(),applied=call('changes.apply',input,actor.id,key);p=ok(applied);assert.deepEqual(ok(call('changes.apply',input,actor.id,key)),p);assert.equal(call('changes.apply',input,actor.id).error!.code,'REVISION_CONFLICT');assert.equal(p.document.schemaVersion,15);
    assert.equal(call('projects.inspect',{projectId:p.id},actor.id,randomUUID(),14).error!.code,'CLIENT_UPGRADE_REQUIRED');
    const modify=()=>({projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.set',clipId:'up',values:{gainDb:-18,offset:.15}}]});
    ok(call('policy.set',{projectId:p.id,paused:true}));assert.equal(call('changes.apply',modify(),actor.id).error!.code,'AI_PAUSED');ok(call('policy.set',{projectId:p.id,paused:false}));
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'up',field:'gain'}]}]}));assert.equal(call('changes.apply',modify(),actor.id).error!.code,'LOCKED');
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));const changed=call('changes.apply',modify(),actor.id);p=ok(changed);assert.equal(p.document.audioClips[0].gain,10**(-18/20));
    p=ok(call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:changed.operationId},actor.id));assert.equal(p.document.audioClips[0].gain,.25);assert.deepEqual(p.document.layers,d.layers);
    const other=ok(call('actors.create',{name:'Foreign',projectIds:[],scopes:['read','edit']}));assert.equal(call('changes.apply',modify(),other.id).error!.code,'FORBIDDEN');
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
