import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync} from 'fflate';
import {createApp} from '../apps/service/src/app.js';
import {flowFixture} from './fixtures/beam-flow.js';
import {artifactBytes,analyzeDocument} from '../apps/service/src/workflow-analysis.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {durationAudioFixture} from './fixtures/duration-audio.js';

test('public workflow isolates variants, hashes reports, pins a stable benchmark, protects scopes and old clients',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-workflow-')),app=await createApp({dataDir:dir});
  const call=(op:string,input:any={},actor='owner',key=randomUUID(),schema=20)=>app.studio.dispatch(actor,{operation:op,input,idempotencyKey:key},schema);
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    const base=ok(call('projects.import',{document:flowFixture()}));
    const observed=ok(call('projects.fork',{projectId:base.id,revision:1}));
    const changed=ok(call('changes.apply',{projectId:observed.id,expectedRevision:1,changes:[{type:'layer.set',layerId:'flow',values:{size:.3,midSize:.4,color:'#aa0033',alpha:.1}},{type:'layer.add',layer:{...flowFixture().layers[0],id:'additional'}}]}));
    const agent=ok(call('actors.create',{name:'Iteration author',projectIds:[base.id,observed.id],scopes:['read','edit','create','build','render','export','jobs','artifacts','review']}));
    const summary=ok(call('workflow.inspect',{projectId:base.id},agent.id));assert(!JSON.stringify(summary).includes('pngBase64'));assert(!JSON.stringify(summary).includes('pcmBase64'));
    const compare=ok(call('workflow.compare',{projectId:observed.id,revision:changed.revision,baseline:{projectId:base.id,revision:1}},agent.id));
    assert(compare.detail.authored.layers.some((l:any)=>l.status==='added'&&l.id==='additional'));assert(compare.detail.authored.layers.find((l:any)=>l.id==='flow').behavior.some((d:any)=>d.path==='/color'));
    const input={projectId:base.id,revision:1,observed:{projectId:observed.id,revision:changed.revision},layerId:'flow',groups:['color','size','alpha'],binary:false,render:false};
    const plan=ok(call('diagnostics.plan',input,agent.id));assert.equal(plan.detail.variants.length,4);
    assert.equal(call('workflow.inspect',{projectId:base.id},agent.id,randomUUID(),19).error?.code,'CLIENT_UPGRADE_REQUIRED');
    const key=randomUUID(),queued=ok(call('iteration.prepare',input,agent.id,key));assert.equal(ok(call('iteration.prepare',input,agent.id,key)).id,queued.id);
    await app.studio.drainJobs();const job=ok(call('jobs.get',{jobId:queued.id},agent.id));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
    const zipArtifact=job.artifacts.find((a:any)=>a.name==='diagnostic.zip');
    // Artifact download uses the same public HTTP route as CLI.
    const downloaded=await app.inject({method:'GET',url:zipArtifact.downloadUrl,headers:{host:'127.0.0.1:4317','x-nwn-vfx-document-schema':'20',authorization:`Bearer ${agent.token}`}});
    assert.equal(downloaded.statusCode,200,downloaded.body.slice(0,200));
    const files=unzipSync(downloaded.rawPayload),manifest=JSON.parse(Buffer.from(files['diagnostic-manifest.json']).toString());
    assert.equal(manifest.variants.length,4);assert.equal(new Set(manifest.variants.map((v:any)=>v.candidate.modelName)).size,4);
    const variant=manifest.variants[0],nested=unzipSync(files[variant.candidate.path]),handoff=JSON.parse(Buffer.from(nested['handoff.json']).toString());
    assert.equal(handoff.jobId,job.id);assert.equal(handoff.variantId,'control');
    const jobsBefore=ok(call('jobs.list',{projectId:base.id},agent.id)).items.length;
    const analyzed=ok(call('workflow.analyze',{projectId:variant.project.projectId,revision:variant.project.revision,candidateId:job.id},agent.id));
    assert.equal(analyzed.detail.candidate.variantId,'control');assert.equal(analyzed.detail.candidate.candidateSha256,variant.candidate.sha256);
    assert.equal(analyzed.detail.candidate.rootSha256,zipArtifact.sha256);assert(!analyzed.detail.findings.some((f:any)=>f.severity==='error'));
    const other=manifest.variants[1];
    const compared=ok(call('workflow.compare',{projectId:other.project.projectId,revision:other.project.revision,candidateId:job.id,baseline:{projectId:variant.project.projectId,revision:variant.project.revision},baselineCandidateId:job.id},agent.id));
    assert.equal(compared.detail.subjectCandidate.variantId,other.id);assert.equal(compared.detail.baselineCandidate.variantId,'control');
    assert.equal(ok(call('jobs.list',{projectId:base.id},agent.id)).items.length,jobsBefore,'Analysis and comparison must not create exports');
    assert.equal(call('workflow.analyze',{projectId:base.id,revision:1,candidateId:job.id},agent.id).error?.code,'CANDIDATE_TARGET_MISMATCH');
    const partial=ok(call('actors.create',{name:'Variant only',projectIds:[variant.project.projectId],scopes:['read','artifacts']}));
    assert.equal(call('workflow.analyze',{projectId:variant.project.projectId,revision:1,candidateId:job.id},partial.id).error?.code,'FORBIDDEN');
    // Corrupt only this disposable store through its fixture API, never a user workspace.
    const replaceManifest=(value:any)=>{const replacement=app.studio.artifact(base.id,'diagnostic-manifest.json',Buffer.from(JSON.stringify(value)),job.id);app.studio.saveJob({...job,artifacts:job.artifacts.map((a:any)=>a.name==='diagnostic-manifest.json'?replacement:a)});};
    replaceManifest({...manifest,variants:[...manifest.variants,variant]});
    assert.equal(call('workflow.analyze',{projectId:variant.project.projectId,revision:1,candidateId:job.id},agent.id).error?.code,'CANDIDATE_TARGET_MISMATCH');
    replaceManifest({...manifest,variants:manifest.variants.map((v:any)=>v.id===variant.id?{...v,candidate:{...v.candidate,sha256:'0'.repeat(64)}}:v)});
    assert.equal(call('workflow.analyze',{projectId:variant.project.projectId,revision:1,candidateId:job.id},agent.id).error?.code,'ARTIFACT_HASH_MISMATCH');
    app.studio.saveJob(job);
    const report={schemaVersion:1,kind:'nwn-vfx-external-report',target:{...variant.project,instanceId:manifest.instanceId,workspaceId:manifest.workspaceId,jobId:job.id,variantId:variant.id,candidateSha256:variant.candidate.sha256},runner:{name:'isolated test declaration',version:'1'},conditions:{description:'Synthetic contract fixture, not an NWN observation'},installation:[],session:{id:'fixture',startedAt:'2026-09-10T12:00:00Z'},observations:[{id:'visible',kind:'visibility',result:'pass',description:'Synthetic intake test',evidenceIds:['video']}],evidence:[{id:'video',name:'fixture.mp4',sha256:'a'.repeat(64),size:1,uri:'fixture://not-a-native-proof'}]};
    assert.equal(call('reports.import',{projectId:variant.project.projectId,report:{...report,target:{...report.target,candidateSha256:'0'.repeat(64)}}},agent.id).error?.code,'REPORT_TARGET_MISMATCH');
    const imported=ok(call('reports.import',{projectId:variant.project.projectId,report},agent.id));assert.equal(imported.detail.report.evidenceVerification,'external-declaration');assert.equal(imported.nativeVerified,false);
    const pin=ok(call('benchmarks.pin',{projectId:base.id,expectedRevision:1,source:variant.project,reportId:imported.detail.report.id,observationId:'visible'},agent.id));assert.equal(pin.revision,2);
    const p=ok(call('projects.inspect',{projectId:base.id},agent.id));assert.equal(p.document.schemaVersion,20);
    const bundle=exportProjectBundle(p);assert.deepEqual(importProjectBundle(Buffer.from(bundle).toString('base64')),p.document);
    ok(call('changes.apply',{projectId:base.id,expectedRevision:2,changes:[{type:'project.set',values:{name:'Later revision'}}]},agent.id));
    assert.deepEqual(ok(call('workflow.inspect',{projectId:base.id},agent.id)).detail.source.authoring.benchmark.source,variant.project);
    ok(call('policy.set',{projectId:base.id,paused:true}));assert.equal(call('iteration.prepare',input,agent.id).error?.code,'AI_PAUSED');
    ok(call('policy.set',{projectId:base.id,paused:false}));
    const foreign=ok(call('actors.create',{name:'No baseline access',projectIds:[observed.id],scopes:['read','build','create','export','jobs','artifacts']}));
    assert.equal(call('workflow.compare',{projectId:observed.id,revision:changed.revision,baseline:{projectId:base.id,revision:1}},foreign.id).error?.code,'FORBIDDEN');
    assert.equal(call('jobs.get',{jobId:job.id},foreign.id).error?.code,'FORBIDDEN');
    assert.equal(ok(call('projects.inspect',{projectId:observed.id})).revision,changed.revision);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});

test('analysis distinguishes animated zero base rate and corrupted TGA without native claims',()=>{
  const doc=flowFixture(),candidate=buildCandidate(doc,'analyze_flow'),valid=analyzeDocument(doc,candidate.files);
  assert(valid.findings.some(f=>f.code==='ANIMATED_EMISSION_GATE'&&f.severity==='info'));
  assert(!valid.findings.some(f=>f.severity==='error'));assert.equal(valid.nativeVerified,false);
  const broken=candidate.files.map(f=>({...f,data:f.data.slice()})),texture=broken.find(f=>f.name.endsWith('.tga'))!;texture.data[16]=24;
  assert(analyzeDocument(doc,broken).findings.some(f=>f.severity==='error'));
});

test('retiming keeps source WAV/PCM and downstroke binding; components preserve dependencies, source and locks',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-workflow-time-')),app=await createApp({dataDir:dir});
  const call=(operation:string,input:any={},actor='owner',key=randomUUID())=>app.studio.dispatch(actor,{operation,input,idempotencyKey:key},20);
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    const fixture=durationAudioFixture(),p=ok(call('projects.import',{document:fixture.document}));
    const bound=ok(call('timing.apply',{projectId:p.id,expectedRevision:1,markers:[{id:'downstroke',name:'Downstroke',time:1}],bindings:[{targetType:'audio',targetId:'down',markerId:'downstroke',offset:0}]}));
    const payload={projectId:p.id,expectedRevision:bound.revision,period:2.4},preview=ok(call('timing.preview',payload));
    assert(Math.abs(preview.detail.schedule[0].time-1.5)<1e-12);assert.equal(preview.detail.schedule[0].repeatPeriod,2.4);assert.match(preview.detail.schedule[0].stopRule,/at or after external stop/);
    assert.equal(ok(call('projects.inspect',{projectId:p.id})).revision,2);
    const changed=call('timing.apply',payload),after=ok(call('projects.inspect',{projectId:p.id}));ok(changed);
    assert.deepEqual(after.document.audioAssets,fixture.document.audioAssets);
    assert.deepEqual({...after.document.audioClips[1],start:1},fixture.document.audioClips![1]);
    assert(Math.abs(after.document.authoring.markers[0].time-1.5)<1e-12);
    assert.equal(call('timing.apply',payload).error?.code,'REVISION_CONFLICT');
    const undone=ok(call('changes.revert',{projectId:p.id,expectedRevision:3,operationId:changed.operationId}));
    assert.equal(undone.document.duration,1.6);assert.equal(undone.document.authoring.markers[0].time,1);
    ok(call('changes.apply',{projectId:p.id,expectedRevision:4,changes:[{type:'locks.set',locks:[{layerId:'down',field:'start'}]}]}));
    assert.equal(call('timing.apply',{projectId:p.id,expectedRevision:5,period:2.4}).error?.code,'LOCKED');
    const source=ok(call('projects.inspect',{projectId:p.id})),selection={layerIds:[source.document.layers[0].id],audioClipIds:['down']};
    const component=ok(call('components.publish',{projectId:p.id,revision:5,name:'Wing and downstroke',...selection})).detail.component;
    const targetDoc=structuredClone(fixture.document);targetDoc.layers=targetDoc.layers.map(l=>({...l,id:'existing-'+l.id}));targetDoc.audioClips=[];targetDoc.audioAssets=[];
    const target=ok(call('projects.import',{document:targetDoc}));
    const insertion=ok(call('components.insert.apply',{projectId:target.id,expectedRevision:1,componentId:component.id,prefix:'new'}));
    assert.equal(insertion.detail.mapping.down,'new-down');
    const inserted=ok(call('projects.inspect',{projectId:target.id}));
    assert.deepEqual(inserted.document.audioAssets,fixture.document.audioAssets);assert.deepEqual(inserted.document.layers.find((l:any)=>l.id==='new-'+source.document.layers[0].id),{...source.document.layers[0],id:'new-'+source.document.layers[0].id});
    assert(inserted.document.locks.some((l:any)=>l.layerId==='new-down'&&l.field==='start'));assert.deepEqual(ok(call('projects.inspect',{projectId:p.id})),source);
    assert.equal(inserted.document.authoring.bindings[0].targetId,'new-down');assert.equal(inserted.document.authoring.markers[0].time,1);
    const foreign=ok(call('actors.create',{name:'Target only',projectIds:[target.id],scopes:['read','edit']}));
    assert.equal(call('components.insert.preview',{projectId:target.id,expectedRevision:2,componentId:component.id,prefix:'forbidden'},foreign.id).error?.code,'FORBIDDEN');
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});

test('iteration checkpoints survive restart; resume verifies scope, bytes and does not duplicate projects',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-workflow-resume-'));let renders=0;
  let app=await createApp({dataDir:dir,render:async()=>{renders++;throw Error('Injected renderer failure after completed build');}});
  const call=(operation:string,input:any={},actor='owner',key=randomUUID())=>app.studio.dispatch(actor,{operation,input,idempotencyKey:key},20);
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    const p=ok(call('projects.import',{document:flowFixture()})),agent=ok(call('actors.create',{name:'Resumable',projectIds:[p.id],scopes:['read','edit','create','build','render','export','jobs','artifacts']}));
    const job=ok(call('iteration.prepare',{projectId:p.id,revision:1,binary:false,mode:'single'},agent.id));await app.studio.drainJobs();
    const failed=ok(call('jobs.get',{jobId:job.id},agent.id));assert.equal(failed.status,'failed');assert.equal(renders,1);assert.equal(failed.metadata.stages.filter((s:any)=>s.status==='succeeded').length,2);
    const count=ok(call('projects.list',{limit:100},agent.id)).items.length;
    await app.close();
    app=await createApp({dataDir:dir,render:async()=>{renders++;return{files:[{name:'preview.png',data:new Uint8Array([137,80,78,71])}]};}});
    ok(call('policy.set',{projectId:p.id,paused:true}));assert.equal(call('jobs.resume',{jobId:job.id},agent.id).error?.code,'AI_PAUSED');ok(call('policy.set',{projectId:p.id,paused:false}));
    ok(call('jobs.resume',{jobId:job.id},agent.id));await app.studio.drainJobs();
    const done=ok(call('jobs.get',{jobId:job.id},agent.id));assert.equal(done.status,'succeeded',JSON.stringify(done.error));assert.equal(renders,2);
    assert.equal(done.metadata.stages.filter((s:any)=>s.reused).length,2);assert.equal(ok(call('projects.list',{limit:100},agent.id)).items.length,count);
    const next=ok(call('iteration.prepare',{projectId:p.id,revision:1,binary:false,mode:'single'},agent.id));await app.studio.drainJobs();
    const reused=ok(call('jobs.get',{jobId:next.id},agent.id));assert.equal(reused.status,'succeeded',JSON.stringify(reused.error));assert.equal(renders,2,'Exact source/renderer/camera/time reuses immutable preview bytes across jobs');
    assert.equal(reused.metadata.stages.find((s:any)=>s.key==='control-render-0').sourceJobId,job.id);
    const different=ok(call('iteration.prepare',{projectId:p.id,revision:1,binary:false,mode:'single',conditions:{filtering:'export-mipmaps',background:'light'}},agent.id));await app.studio.drainJobs();assert.equal(ok(call('jobs.get',{jobId:different.id},agent.id)).status,'succeeded');assert.equal(renders,3,'Different conditions cannot reuse an earlier render');
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
