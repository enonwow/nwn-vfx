import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
import {periodicFixture} from './fixtures/beam-periodic.js';
import {flowFixture} from './fixtures/beam-flow.js';
import {applyChanges,promoteDocumentSchema,makeDocument} from '../packages/core/src/model.js';
import {mixAudio,pcmWave,readPcmWav,audioLevelReport} from '../packages/core/src/audio.js';
import {previewDuration} from '../packages/core/src/lifecycle.js';
import {importAudio} from '../apps/service/src/audio-import.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {exportAudio} from '../packages/nwn-format/src/audio-export.js';
import {buildCompiledCandidate} from '../packages/nwn-format/src/compiled-candidate.js';
import {readHak} from '../packages/nwn-format/src/binary.js';
import {createApp} from '../apps/service/src/app.js';
import {hash} from '../apps/service/src/store.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';

function fixture(periodic=true){
  const document=periodic?periodicFixture().document:flowFixture(true);document.duration=3.6;
  const pcm=new Uint8Array(158760*2),view=new DataView(pcm.buffer);
  for(let i=0;i<158760;i++)view.setInt16(i*2,Math.round(12000*Math.sin(i*2*Math.PI*313/44100)),true);
  const wav=pcmWave(pcm,44100,1),asset=importAudio('beam-tone.wav',Buffer.from(wav).toString('base64'));
  const clip={id:'sound',type:'audio' as const,name:'Beam tone',assetId:asset.id,enabled:true,start:0,duration:3.6,offset:0,gain:1,fadeIn:0,fadeOut:0};
  document.audioAssets=[asset];document.audioClips=[clip];promoteDocumentSchema(document);return{document,asset,clip,wav,pcm};
}
const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};

test('finite beam mixes one 3.6s activation, preserves unity PCM and reports gain/fades/offset/clipping',()=>{
  const {document:d,pcm}=fixture();assertDocument(d);assert.equal(d.schemaVersion,24);
  const mono=mixAudio(d,44100,1),stereo=mixAudio(d);assert.equal(mono.frames,158760);assert.equal(stereo.frames,172800);
  assert.equal(hash(mono.pcm),hash(pcm));assert.equal(mono.clippedSamples,0);
  const after=mixAudio(d,44100,1,3.6,.6);assert(after.pcm.every(n=>n===0));assert.throws(()=>previewDuration(d,2));
  const old={...d,schemaVersion:23 as const};assert.throws(()=>assertDocument(old));
  const bad={...d,duration:3.6001};assert.throws(()=>mixAudio(bad),{code:'BEAM_AUDIO_INVALID'});
  const staticOnly={...d,layers:d.layers.filter(l=>l.type==='beam')};assert.throws(()=>assertDocument(staticOnly),{code:'BEAM_AUDIO_INVALID'});
  const edited=applyChanges(d,[{type:'audio.set',clipId:'sound',values:{start:.3,duration:1,offset:.2,gainDb:-6,fadeIn:.1,fadeOut:.2}}],false);
  const em=mixAudio(edited,44100,1);assert(em.pcm.slice(0,13230*2).every(n=>n===0));assert(em.pcm.slice(57330*2).every(n=>n===0));
  const ev=new DataView(em.pcm.buffer),src=new DataView(pcm.buffer);
  // At time0.5, source0.4; fades finished, exact authored dB conversion.
  assert.equal(ev.getInt16(22050*2,true),Math.round(src.getInt16(17640*2,true)*10**(-6/20)));
  assert.equal(ev.getInt16(13230*2,true),0);
  const loud=mixAudio(applyChanges(d,[{type:'audio.set',clipId:'sound',values:{gainDb:24}}],false));
  assert(loud.clippedSamples>0);assert(audioLevelReport(loud).peakDbFS!>0);
  assert.equal(audioLevelReport(loud).automaticNormalization,false);
});

test('beam binary candidate adds one full mix without changing any MDL/TGA/TXI, including endpoint models',async()=>{
  for(const periodic of [false,true]){
    const {document:d}=fixture(periodic),visual={...d};delete visual.audioClips;delete visual.audioAssets;
    const [withAudio,before]=await Promise.all([buildCompiledCandidate(d,'beam_audio'),buildCompiledCandidate(visual,'beam_audio')]);
    const file=(name:string)=>{const f=withAudio.files.find(f=>f.name===name);assert(f,name);return f.data;};
    for(const f of before.files.filter(f=>/\.(mdl|tga|txi)$/.test(f.name)))assert.equal(hash(file(f.name)),hash(f.data),f.name);
    assert.equal(withAudio.validation.exporterVersion,'nwn-binary-vfx-0.30.0');assert.equal(withAudio.validation.nativeVerified,false);
    assert.equal(new Set(withAudio.files.map(f=>f.name)).size,withAudio.files.length);
    assert.equal(withAudio.files.filter(f=>f.name==='audio-events.json').length,1);
    const manifest=JSON.parse(strFromU8(file('audio-events.json'))),b=manifest.preferredIntegration,decoded=readPcmWav(file(b.file));
    assert.equal(manifest.version,3);assert.equal(b.method,'consumer-once-full-mix-wav');assert.deepEqual(b.dispatch,{count:1,startSeconds:0,anchor:'same activation as finite beam and endpoint effects',repeatAtFeedEnd:false});
    assert.equal(b.automaticSoundImpact,false);assert.equal(b.stop.stopHandleForIssuedSound,false);
    assert.equal(b.frames,158760);assert.equal(decoded.sampleRate,44100);assert.equal(decoded.channels,1);
    assert.equal(hash(decoded.pcm),b.pcmSha256);assert.equal(hash(file(b.file)),b.sha256);
    assert.equal(hash(readHak(file('beam_audio.hak')).find(f=>f.name===b.file)!.data),b.sha256);
    assert.equal((strFromU8(file('audio-events.nss')).match(/PlaySound\(/g)??[]).length,1);
  }
});

test('portable19 roundtrip is exact; muted finite and historical impact audio keep old contracts',()=>{
  const {document:d}=fixture(),zip=exportProjectBundle({id:'fixture',revision:1,document:d} as any),manifest=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));
  assert.equal(manifest.schemaVersion,19);assert.equal(manifest.minimumStudioVersion,'0.30.0');
  assert(isDeepStrictEqual(importProjectBundle(Buffer.from(zip).toString('base64')),d));
  const disabled={...d,schemaVersion:23 as const,audioClips:d.audioClips!.map(c=>({...c,enabled:false}))};assertDocument(disabled);assert.equal(promoteDocumentSchema(disabled).schemaVersion,23);
  const impact={...makeDocument('empty'),duration:3.6,audioAssets:d.audioAssets,audioClips:d.audioClips,schemaVersion:9 as const};
  const legacy=exportAudio(impact,'legacy');assert.equal(JSON.parse(strFromU8(legacy.files.find(f=>f.name==='audio-events.json')!.data)).version,1);
});

test('public import/add/set guard old clients and retain scope, pause, locks, idempotency, conflict, undo and reload',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-beam-audio-'));let app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,schema='24',key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+token,'x-nwn-vfx-document-schema':schema},payload:{operation,input,idempotencyKey:key}})).json();
  try{
    const {document:d,wav,clip}=fixture(),initial=periodicFixture().document;initial.duration=3.6;let p=ok(await call('projects.import',{document:initial}));
    const agent=ok(await call('actors.create',{name:'Beam audio',projectIds:[p.id],scopes:['read','edit','build','export','jobs','artifacts','render']}));
    const foreign=ok(await call('actors.create',{name:'Foreign',projectIds:[],scopes:['read','edit']}));
    const imported=ok(await call('audio.import',{projectId:p.id,expectedRevision:p.revision,fileName:'beam-tone.wav',dataBase64:Buffer.from(wav).toString('base64')},agent.token));p=imported.project;
    assert.equal(p.document.schemaVersion,23);const input={projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.add',clip}]};
    assert.equal((await call('changes.apply',input,agent.token,'23')).error.code,'CLIENT_UPGRADE_REQUIRED');assert.equal(ok(await call('projects.inspect',{projectId:p.id})).revision,p.revision);
    const key=randomUUID();p=ok(await call('changes.apply',input,agent.token,'24',key));assert.equal(p.document.schemaVersion,24);
    assert.equal(ok(await call('changes.apply',input,agent.token,'24',key)).revision,p.revision);assert.equal((await call('changes.apply',input,agent.token)).error.code,'REVISION_CONFLICT');
    assert.equal((await call('projects.inspect',{projectId:p.id},agent.token,'23')).error.code,'CLIENT_UPGRADE_REQUIRED');
    const modify=()=>({projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.set',clipId:'sound',values:{gainDb:-6,fadeIn:.1}}]});
    assert.equal((await call('changes.apply',modify(),foreign.token)).error.code,'FORBIDDEN');
    ok(await call('policy.set',{projectId:p.id,paused:true}));assert.equal((await call('changes.apply',modify(),agent.token)).error.code,'AI_PAUSED');ok(await call('policy.set',{projectId:p.id,paused:false}));
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'sound',field:'gain'}]}]}));assert.equal((await call('changes.apply',modify(),agent.token)).error.code,'LOCKED');
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    const changed=await call('changes.apply',modify(),agent.token);p=ok(changed);assert.equal(p.document.audioClips[0].gain,10**(-6/20));
    p=ok(await call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:changed.operationId},agent.token));assert.equal(p.document.audioClips[0].gain,1);
    assert(isDeepStrictEqual(p.document.layers,d.layers));
    const q=ok(await call('candidate.build',{projectId:p.id,revision:p.revision,modelName:'beam_audio_http',profileId:'nwn-ee-beam-binary-experimental-v1'},agent.token));await app.studio.drainJobs();const j=ok(await call('jobs.get',{jobId:q.id},agent.token));assert.equal(j.status,'succeeded',JSON.stringify(j.error));
    assert.equal(j.metadata.validation.exporterVersion,'nwn-binary-vfx-0.30.0');
    await app.close();app=await createApp({dataDir:dir});assert(isDeepStrictEqual(ok(await call('projects.inspect',{projectId:p.id})).document,p.document));
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
