import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
import {applyChanges,assertDocumentInvariants,type BeamLayer,type EmitterLayer} from '../packages/core/src/model.js';
import {makeStaticFlowStrand,beamBindingChanges} from '../packages/core/src/beam-flow.js';
import {makeBuiltinTexture} from '../packages/core/src/textures.js';
import {buildBeamTexture} from '../packages/core/src/beam-texture.js';
import {flowFixture} from './fixtures/beam-flow.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {readAsciiMdl,numeric,textProperty} from '../packages/nwn-format/src/mdl-reader.js';
import {verifyBinaryBeam} from '../packages/nwn-format/src/binary-beam.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {createApp} from '../apps/service/src/app.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';

const base=()=>flowFixture(false);
function strand(i:number):BeamLayer{return {...makeStaticFlowStrand(base(),'strand-'+i),texture:'beam-soft',
  width:.006+i*.001,alpha:.2+i*.1,color:['#cc2233','#bb3344','#aa4455','#995566'][i%4],
  radius:.01+i*.01,delay:.1+i*.05,lightningScale:.02+i*.01,segments:2**(i+1)};}
const mixed=(count=4)=>applyChanges(base(),Array.from({length:count},(_,i)=>({type:'layer.add',layer:strand(i)})),false);
const file=(r:ReturnType<typeof buildCandidate>,name:string)=>{const f=r.files.find(f=>f.name===name);assert(f,name);return f.data;};

test('four strands share bindings atomically, retain per-layer locks, and reject a fifth or old schema',()=>{
  const d=mixed();assert.equal(d.schemaVersion,22);assertDocumentInvariants(d);
  assert.throws(()=>assertDocumentInvariants({...d,schemaVersion:21}),/dokumentu 22/);
  assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.add',layer:strand(4)}],false)),/maksymalnie 4/);
  const emitter=d.layers[0] as EmitterLayer;
  const changes=beamBindingChanges(d,emitter.id,{...emitter.beamBinding!,target:[0,5,1.2],direction:'target-to-source'});
  assert.equal(changes.length,5);const next=applyChanges(d,changes,false);assertDocumentInvariants(next);
  for(const l of next.layers.filter((l):l is BeamLayer=>l.type==='beam')){assert.deepEqual(l.target,[0,5,1.2]);assert.equal(l.flow.direction,'target-to-source');}
  for(const i of [0,3])assert.throws(()=>applyChanges({...d,locks:[{layerId:'strand-'+i,field:'target'}]},changes,false),(e:any)=>e.code==='LOCKED');
  assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:'strand-3',values:{target:[1,4,1]}}],false)),/wspólne końce/);
  const motion=applyChanges(d,[{type:'layer.set',layerId:'strand-2',values:{texture:'glow',textureMapping:null,segments:2,radius:0,lightningScale:0,nativeMotion:{phase:'flow',direction:'source-to-target',fps:16,pulseWidth:.25,fit:'source'}}}],false);
  assert.throws(()=>buildCandidate(motion,'blocked'),(e:any)=>e.code==='BEAM_MOTION_EXPORT_BLOCKED');
});

test('beam-soft has identical rows, white RGB, symmetric soft alpha and zero side edges',()=>{
  const p=makeBuiltinTexture('beam-soft'),row=p.rgba.slice(0,p.width*4),alphas=[];
  for(let y=0;y<p.height;y++)assert.deepEqual(p.rgba.slice(y*p.width*4,(y+1)*p.width*4),row);
  for(let x=0;x<p.width;x++){
    assert.deepEqual(Array.from(row.slice(x*4,x*4+3)),[255,255,255]);alphas.push(row[x*4+3]);
    assert.equal(row[x*4+3],row[(p.width-1-x)*4+3]);
  }
  assert.equal(alphas[0],0);assert.equal(alphas.at(-1),0);assert.equal(Math.max(...alphas),255);
  for(let x=1;x<p.width/2;x++)assert(alphas[x]>=alphas[x-1]);
  const d=mixed(3);assert.deepEqual(buildBeamTexture(d,d.layers[1] as BeamLayer).pixels,p);
  assert.throws(()=>assertDocumentInvariants(applyChanges(base(),[{type:'layer.set',layerId:'flow',values:{texture:'beam-soft'}}],false)),/statycznej warstwy/);
  assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:'strand-0',values:{textureMapping:{axis:'u',fit:'source'}}}],false)),/mapowaniem V/);
});

test('one Fountain with three and four Linked nodes preserves exact Fountain and cast01 readback',{skip:!binaryCompilerAvailable()},async()=>{
  const old=await buildCompiledCandidate(base(),'multistrand'),oldSource=file(old,'source-model.mdl.txt');
  const oldParsed=readAsciiMdl(oldSource),oldBinary=verifyBinaryBeam(oldSource,file(old,'multistrand.mdl'));
  for(const count of [3,4]){
    const d=mixed(count),before=JSON.stringify(d),r=await buildCompiledCandidate(d,'multistrand');
    const source=file(r,'source-model.mdl.txt'),parsed=readAsciiMdl(source),proof=verifyBinaryBeam(source,file(r,'multistrand.mdl'));
    assert.deepEqual(parsed.animations,oldParsed.animations);
    assert.deepEqual(parsed.nodes.filter(n=>!n.name.startsWith('strand_')),oldParsed.nodes);
    assert.deepEqual(proof.nodes.filter(n=>!n.node.startsWith('strand_')),oldBinary.nodes);
    assert.equal(proof.nodes.filter(n=>n.type==='emitter'&&n.update==='Lightning').length,count);
    for(let i=0;i<count;i++){
      const n=parsed.nodes.find(n=>n.name==='strand_'+i)!,l=strand(i);
      for(const [key,v] of Object.entries({birthrate:l.segments+1,lightningradius:l.radius,lightningdelay:l.delay,lightningscale:l.lightningScale,sizestart:l.width,alphastart:l.alpha}))assert.equal(numeric(n,key),v);
      assert.equal(textProperty(parsed.nodes.find(n=>n.name==='strand_target_'+i)!,'parent'),n.name);
    }
    const flow=JSON.parse(strFromU8(file(r,'beam-flow.json'))),beam=JSON.parse(strFromU8(file(r,'beam.json')));
    assert.equal(flow.staticStrands.profile,'finite-flow-static-strands-v2');assert.equal(beam.composite.profile,flow.staticStrands.profile);
    assert.equal(flow.staticStrands.layers.length,count);assert.equal(flow.removeNoEarlierThan,3.6);
    assert.equal(r.validation.exporterVersion,'nwn-binary-vfx-0.28.2');assert.equal(r.validation.nativeVerified,false);
    for(const f of old.files.filter(f=>/\.(tga|txi)$/.test(f.name)))assert.deepEqual(file(r,f.name),f.data);
    assert.equal(JSON.stringify(d),before);
    const changedSeed=applyChanges(d,[{type:'layer.set',layerId:'strand-0',values:{seed:123456}}],false);
    assert.deepEqual(file(buildCandidate(changedSeed,'multistrand'),'multistrand.mdl'),source,'seed must not claim a native phase or random-state controller');
  }
});

test('public HTTP multi-strand schema22/ZIP17, old-client rollback, rights, locks, pause, retry and binary export',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-multistrand-')),app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,schema='22',key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+token,'x-nwn-vfx-document-schema':schema},payload:{operation,input,idempotencyKey:key}})).json();
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    let p=ok(await call('projects.import',{document:base()}));
    const agent=ok(await call('actors.create',{name:'Multi',projectIds:[p.id],scopes:['read','edit','build','export','jobs','artifacts']}));
    const add={projectId:p.id,expectedRevision:p.revision,changes:Array.from({length:4},(_,i)=>({type:'layer.add',layer:strand(i)}))};
    const old=await call('changes.apply',add,agent.token,'21');assert.equal(old.error.code,'CLIENT_UPGRADE_REQUIRED');assert.equal(old.error.details.minimumStudioVersion,'0.28.2');
    assert.equal(ok(await call('projects.inspect',{projectId:p.id})).revision,p.revision);
    const key=randomUUID();p=ok(await call('changes.apply',add,agent.token,'22',key));assert.equal(p.document.schemaVersion,22);
    assert.equal(ok(await call('changes.apply',add,agent.token,'22',key)).revision,p.revision);
    assert.equal((await call('changes.apply',add,agent.token)).error.code,'REVISION_CONFLICT');
    assert.equal((await call('projects.inspect',{projectId:p.id},agent.token,'21')).error.code,'CLIENT_UPGRADE_REQUIRED');
    const zip=exportProjectBundle(p),manifest=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));assert.equal(manifest.schemaVersion,17);assert.equal(manifest.minimumStudioVersion,'0.28.2');assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),p.document);
    const input=()=>({projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'strand-3',values:{width:.02}}]});
    ok(await call('policy.set',{projectId:p.id,paused:true}));assert.equal((await call('changes.apply',input(),agent.token)).error.code,'AI_PAUSED');ok(await call('policy.set',{projectId:p.id,paused:false}));
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'strand-3',field:'width'}]}]}));
    assert.equal((await call('changes.apply',input(),agent.token)).error.code,'LOCKED');
    const foreign=ok(await call('actors.create',{name:'Foreign',projectIds:[],scopes:['read','edit']}));assert.equal((await call('projects.inspect',{projectId:p.id},foreign.token)).error.code,'FORBIDDEN');
    const invalid={projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.add',layer:strand(4)}]};assert.equal((await call('changes.apply',invalid,agent.token)).error.code,'BEAM_FLOW_INVALID');
    assert.equal(ok(await call('projects.inspect',{projectId:p.id})).revision,p.revision);
    const q=ok(await call('candidate.build',{projectId:p.id,revision:p.revision,modelName:'multi_http',profileId:'nwn-ee-beam-binary-experimental-v1'},agent.token));
    await app.studio.drainJobs();const j=ok(await call('jobs.get',{jobId:q.id},agent.token));assert.equal(j.status,'succeeded',JSON.stringify(j.error));
    assert.equal(j.metadata.validation.exporterVersion,'nwn-binary-vfx-0.28.2');assert(j.artifacts.some((a:any)=>a.fileName==='beam.json'));
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
