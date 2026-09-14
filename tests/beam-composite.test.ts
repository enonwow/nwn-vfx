import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
import {applyChanges,assertDocumentInvariants,type BeamLayer,type EmitterLayer} from '../packages/core/src/model.js';
import {makeStaticFlowStrand,beamBindingChanges} from '../packages/core/src/beam-flow.js';
import {flowFixture} from './fixtures/beam-flow.js';
import {validateDocument} from '../packages/contracts/src/schema.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {readAsciiMdl,numeric,textProperty} from '../packages/nwn-format/src/mdl-reader.js';
import {verifyBinaryBeam} from '../packages/nwn-format/src/binary-beam.js';
import {verifyCompiledRoundtrip} from '../packages/nwn-format/src/compiled-readback.js';
import {readHak} from '../packages/nwn-format/src/binary.js';
import {createApp} from '../apps/service/src/app.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const mixed=()=>{const d=flowFixture();return applyChanges(d,[{type:'layer.add',layer:makeStaticFlowStrand(d,'strand')}],false);};
const file=(r:ReturnType<typeof buildCandidate>,name:string)=>{const f=r.files.find(f=>f.name===name);assert(f,name);return f.data;};
const json=(r:ReturnType<typeof buildCandidate>,name:string)=>JSON.parse(strFromU8(file(r,name)));

test('one static strand promotes schema21, shares endpoint edits and rejects incompatible mixes',()=>{
  const d=mixed();assert.equal(d.schemaVersion,21);assert(validateDocument(d),JSON.stringify(validateDocument.errors));assertDocumentInvariants(d);
  assert.throws(()=>assertDocumentInvariants({...d,schemaVersion:20}),/dokumentu 21/);
  for(const values of [{source:[1,0,1.2] as [number,number,number]},{flow:{direction:'source-to-target' as const,speed:1}}])
    assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:'strand',values}],false)));
  assert.throws(()=>assertDocumentInvariants({...applyChanges(d,[{type:'layer.add',layer:makeStaticFlowStrand(d,'extra')}],false),schemaVersion:21}),/dokumentu 22/);
  const f=d.layers[0] as EmitterLayer,binding={...f.beamBinding!,source:[1,0,1.2] as [number,number,number],direction:'target-to-source' as const};
  const changes=beamBindingChanges(d,'flow',binding),next=applyChanges(d,changes,false);assertDocumentInvariants(next);
  const strand=next.layers.find(l=>l.id==='strand') as BeamLayer;assert.deepEqual(strand.source,binding.source);assert.equal(strand.flow.direction,binding.direction);assert.equal(strand.flow.speed,0);
  const locked={...d,locks:[{layerId:'strand',field:'source'}]};assert.throws(()=>applyChanges(locked,changes,false),(e:any)=>e.code==='LOCKED');
  const motion=applyChanges(d,[{type:'layer.set',layerId:'strand',values:{textureMapping:null,segments:2,nativeMotion:{phase:'flow',direction:'source-to-target',fps:16,pulseWidth:.25,fit:'source'}}}],false);
  assert.throws(()=>buildCandidate(motion,'motion_block'),(e:any)=>e.code==='BEAM_MOTION_EXPORT_BLOCKED');
});

test('mixed ASCII adds exactly two static nodes; finite cast01, endpoints and material pixels stay identical',()=>{
  const d=mixed(),before=JSON.stringify(d),r=buildCandidate(d,'mixed'),base=buildCandidate(flowFixture(),'mixed');
  const source=file(r,'mixed.mdl'),parsed=readAsciiMdl(source),prior=readAsciiMdl(file(base,'mixed.mdl'));
  assert.deepEqual(parsed.animations,prior.animations);assert.deepEqual(parsed.nodes.filter(n=>!n.name.startsWith('strand_')),prior.nodes);
  const strand=parsed.nodes.find(n=>n.name==='strand_0')!,ref=parsed.nodes.find(n=>n.name==='strand_target_0')!;
  assert.equal(textProperty(strand,'update'),'Lightning');assert.equal(textProperty(strand,'render'),'Linked');assert.equal(numeric(strand,'birthrate'),5);
  assert.equal(textProperty(ref,'parent'),strand.name);assert.equal(numeric(ref,'reattachable'),1);
  assert(!parsed.animations[0].nodes.some(n=>n.name.startsWith('strand_')));
  const staticOnly=buildCandidate({...d,layers:d.layers.filter(l=>l.type==='beam')},'mixed');
  for(const f of staticOnly.files.filter(f=>/\.(tga|txi)$/.test(f.name)))assert.deepEqual(file(r,f.name),f.data);
  const flow=json(r,'beam-flow.json'),beam=json(r,'beam.json'),emission=json(r,'emitter-emission.json');
  assert.equal(flow.sourceModelSha256,sha(source));assert.equal(beam.sourceModelSha256,sha(source));assert.equal(emission.sourceMdlSha256,sha(source));
  assert.equal(emission.emitters.length,2);assert.equal(beam.composite.lifetime,'until-consumer-removal');assert.equal(flow.staticStrands.layers[0].node,'strand_0');
  assert.deepEqual(flow.endpoints,json(base,'beam-flow.json').endpoints);assert.equal(flow.removeNoEarlierThan,3.6);
  const integration=r.validation.integration.effect!;assert.equal(integration.schemaVersion,6);assert.equal(integration.beam!.progfx2da.columns.Param6,'cast01');
  assert.equal(r.validation.exporterVersion,'nwn-ascii-vfx-0.28.1');assert.equal(r.validation.nativeVerified,false);assert.equal(JSON.stringify(d),before);
  const reset=applyChanges(d,[{type:'layer.remove',layerId:'strand'}],false),removed=buildCandidate(reset,'mixed');
  assert.deepEqual(removed.files.filter(f=>/\.(mdl|hak|tga|txi)$/.test(f.name)),base.files.filter(f=>/\.(mdl|hak|tga|txi)$/.test(f.name)));
});

test('binary reads both emitter modes and rejects corrupted static points or flags in a finite main model',{skip:!binaryCompilerAvailable()},async()=>{
  const r=await buildCompiledCandidate(mixed(),'mixed'),source=file(r,'source-model.mdl.txt'),binary=file(r,'mixed.mdl');
  const proof=verifyBinaryBeam(source,binary),emitters=proof.nodes.filter(n=>n.type==='emitter');
  assert.deepEqual(emitters.map(n=>[n.update,n.flags]).sort(),[['Fountain',3],['Lightning',258]]);
  assert.equal(json(r,'beam.json').binaryModelSha256,sha(binary));assert.equal(json(r,'beam-flow.json').compiledEndpointModels.length,2);
  for(const f of readHak(file(r,'mixed.hak')).filter(f=>f.name.endsWith('.mdl')))assert.equal(new DataView(f.data.buffer,f.data.byteOffset).getUint32(0,true),0);
  const offset=Buffer.from(binary).indexOf(Buffer.from('strand_0\0'))-0x20;assert(offset>12);
  const damaged=new Uint8Array(binary),view=new DataView(damaged.buffer),controllers=12+view.getUint32(offset+0x54,true),data=12+view.getUint32(offset+0x60,true),count=view.getUint32(offset+0x58,true);
  let birth=-1;for(let i=0;i<count;i++)if(view.getUint32(controllers+i*12,true)===88)birth=data+view.getInt16(controllers+i*12+8,true)*4;
  assert(birth>0);view.setFloat32(birth,2,true);assert.throws(()=>verifyBinaryBeam(source,damaged),(e:any)=>e.code==='BEAM_POINT_COUNT_UNSAFE');
  const flags=new Uint8Array(binary);new DataView(flags.buffer).setUint32(offset+0x144,3,true);assert.throws(()=>verifyBinaryBeam(source,flags),/mode\/flags/);
});

test('compiler decimal 3.9 boundary accepts only identical float32 and preserves strict source parsing',{skip:!binaryCompilerAvailable()},async()=>{
  // Minimal numeric reproduction of consumer 50338414-2f51-45a8-b776-11be5243c452@2.
  const d=flowFixture(false),l=d.layers[0] as EmitterLayer;d.duration=3.9;l.life=.9;l.duration=3;l.beamBinding!.pulse={period:.85,duty:.5};
  d.layers.push({...structuredClone(l),id:'pulse',start:.1,duration:2.9,beamBinding:{...l.beamBinding!,pulse:{period:.85,duty:.15}}});
  const r=await buildCompiledCandidate(d,'decimal'),source=file(r,'source-model.mdl.txt'),round=file(r,'compiled-roundtrip.mdl.txt');
  assert.throws(()=>readAsciiMdl(round,{requireAnimationOrder:false}),/Klucz poza/);
  const parsed=readAsciiMdl(round,{requireAnimationOrder:false,compiledTimeBounds:true});
  assert.equal(parsed.animations[0].length,3.9);assert.equal(parsed.animations[0].nodes.find(n=>n.name==='em_0')!.tracks.birthrate.at(-1)![0],3.9000001);
  assert.doesNotThrow(()=>verifyCompiledRoundtrip(source,round));
  const outOfRange=strFromU8(round).replaceAll('3.9000001','3.9000010');assert.throws(()=>readAsciiMdl(outOfRange,{requireAnimationOrder:false,compiledTimeBounds:true}),/Klucz poza/);
  assert.throws(()=>readAsciiMdl(strFromU8(source).replaceAll('3.9 0','3.9000001 0')),/Klucz poza/);
});

test('HTTP schema21, scope, pause, endpoint lock, retry, conflict, undo and ZIP16 with no old-client mutation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-composite-')),app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,schema='21',key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+token,'x-nwn-vfx-document-schema':schema},payload:{operation,input,idempotencyKey:key}})).json();
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    let p=ok(await call('projects.import',{document:flowFixture()}));const initial=p;
    const agent=ok(await call('actors.create',{name:'Mixed beam',projectIds:[p.id],scopes:['read','edit','build','export','jobs','artifacts']}));
    const add={projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.add',layer:makeStaticFlowStrand(p.document,'strand')}]};
    const old=await call('changes.apply',add,agent.token,'20');assert.equal(old.error.code,'CLIENT_UPGRADE_REQUIRED');assert.equal(old.error.details.minimumStudioVersion,'0.28.1');
    assert.equal(ok(await call('projects.inspect',{projectId:p.id})).revision,p.revision);
    const key=randomUUID(),applied=await call('changes.apply',add,agent.token,'21',key);p=ok(applied);assert.equal(p.document.schemaVersion,21);
    assert.equal(ok(await call('changes.apply',add,agent.token,'21',key)).revision,p.revision);assert.equal((await call('changes.apply',add,agent.token)).error.code,'REVISION_CONFLICT');
    assert.equal((await call('projects.inspect',{projectId:p.id},agent.token,'20')).error.code,'CLIENT_UPGRADE_REQUIRED');
    const zip=exportProjectBundle(p),manifest=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));assert.equal(manifest.schemaVersion,16);assert.equal(manifest.minimumStudioVersion,'0.28.1');assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),p.document);
    const foreign=ok(await call('actors.create',{name:'Unshared',projectIds:[],scopes:['read','edit']}));assert.equal((await call('projects.inspect',{projectId:p.id},foreign.token)).error.code,'FORBIDDEN');
    const changes=beamBindingChanges(p.document,'flow',{...p.document.layers[0].beamBinding,target:[0,4,1.2]});
    const input=()=>({projectId:p.id,expectedRevision:p.revision,changes});
    ok(await call('policy.set',{projectId:p.id,paused:true}));assert.equal((await call('changes.apply',input(),agent.token)).error.code,'AI_PAUSED');ok(await call('policy.set',{projectId:p.id,paused:false}));
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'strand',field:'target'}]}]}));assert.equal((await call('changes.apply',input(),agent.token)).error.code,'LOCKED');
    assert.equal(ok(await call('projects.inspect',{projectId:p.id})).revision,p.revision);
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    for(const format of ['ascii','binary']){
      const q=ok(await call('candidate.build',{projectId:p.id,revision:p.revision,modelName:'composite_http',profileId:`nwn-ee-beam-${format}-experimental-v1`},agent.token));await app.studio.drainJobs();const j=ok(await call('jobs.get',{jobId:q.id},agent.token));assert.equal(j.status,'succeeded',JSON.stringify(j.error));
      assert(j.artifacts.some((a:any)=>a.fileName==='beam.json'));assert(j.artifacts.some((a:any)=>a.fileName==='beam-flow.json'));
      assert.equal(j.metadata.validation.exporterVersion,`nwn-${format}-vfx-0.28.1`);
    }
    const beforeParameters=p.document,parameters=await call('changes.apply',input(),agent.token);p=ok(parameters);
    p=ok(await call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:parameters.operationId},agent.token));assert.deepEqual(p.document,beforeParameters);
    // Structural undo is not a Studio feature; explicit removal keeps schema21.
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.remove',layerId:'strand'}]},agent.token));
    assert.deepEqual(p.document.layers,initial.document.layers);assert.equal(p.document.schemaVersion,21);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
