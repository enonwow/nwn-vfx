import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {createApp} from '../apps/service/src/app.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {assertDocument,validateOperationOutput} from '../packages/contracts/src/schema.js';
import {applyChanges,makeDocument,makeMeshLayer,type MeshLayer} from '../packages/core/src/model.js';
import {durationSeams,effectTime,previewDuration} from '../packages/core/src/lifecycle.js';
import {sampleMeshLayer} from '../packages/core/src/mesh.js';
import {compileMeshDeformation,sampleMeshDeformation} from '../packages/core/src/deformation.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {readAsciiMdl,sampleTrack} from '../packages/nwn-format/src/mdl-reader.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {durationExample} from './fixtures/duration.js';

const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
test('DUR checks every seam channel and restrictions without altering source; ZIP roundtrips schema 13',()=>{
  const d=durationExample().loop,original=canonical(d);assertDocument(d);assert.equal(durationSeams(d)[0].errors.vertices,0);
  const m=d.layers[0] as MeshLayer;
  for(const [channel,value] of Object.entries({position:[1,0,1.2],orientation:[0,0,1,.1],scale:1.1,alpha:.9,vertices:m.geometry.kind==='custom'?m.geometry.vertices.map(v=>[v[0],v[1]+.01,v[2]]):[]})){
    const bad=structuredClone(d);(bad.layers[0] as MeshLayer).animation[channel as 'alpha']=[{time:1,value}] as any;
    assert.throws(()=>assertDocument(bad),{code:'DURATION_INCOMPATIBLE'},channel);
  }
  for(const layer of [{...m,start:.1,duration:.9,animation:{}},makeDocument('empty').layers[0]])assert.throws(()=>assertDocument({...d,layers:[layer]}),{code:'DURATION_INCOMPATIBLE'});
  const offgrid=structuredClone(d);offgrid.duration=1.001;(offgrid.layers[0] as MeshLayer).duration=1.001;assert.throws(()=>assertDocument(offgrid),{code:'DURATION_INCOMPATIBLE'});
  assert.equal(previewDuration(d,3),3);for(const n of [0,11,1.5])assert.throws(()=>previewDuration(d,n));
  assert.throws(()=>previewDuration(makeDocument(),2));
  const box=makeDocument('empty','Box','duration');assertDocument(box);
  const q=structuredClone(d);(q.layers[0] as MeshLayer).animation.orientation=[{time:1,value:[0,0,1,2*Math.PI]}];assertDocument(q);
  const zip=exportProjectBundle({id:'loop',revision:1,document:d,createdAt:'',updatedAt:''});
  const manifest=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));assert.equal(manifest.schemaVersion,8);assert.equal(manifest.minimumStudioVersion,'0.22.0');
  assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),d);assert.equal(canonical(d),original);
});

test('three phases share geometry/UV/pivot; measured source and serialized alpha/deformation agree across cycles',async()=>{
  const phases=durationExample();let geometry:string|undefined;
  const pose=(name:keyof typeof phases,t:number)=>{const d=phases[name],l=d.layers[0] as MeshLayer,time=effectTime(d,t);return {state:sampleMeshLayer(l,time),vertices:sampleMeshDeformation(compileMeshDeformation(l,d.duration),time)};};
  assert.deepEqual(pose('opening',1),pose('loop',0));assert.deepEqual(pose('loop',3),pose('closing',0));
  for(const t of [0,.25,.5,.999])for(const cycle of [1,2,5]){
    const a=pose('loop',t),b=pose('loop',cycle+t);
    assert(Math.max(...a.vertices.flatMap((v,i)=>v.map((n,j)=>Math.abs(n-b.vertices[i][j]))))<1e-12);
  }
  assert.notDeepEqual(pose('loop',.5).vertices,pose('closing',0).vertices,'arbitrary phase cannot promise a matched closing pose');
  for(const [phase,d] of Object.entries(phases)){
    assertDocument(d);const g=canonical((d.layers[0] as MeshLayer).geometry);if(geometry)assert.equal(g,geometry);else geometry=g;
    const a=buildCandidate(d,`dur_${phase}`);try{validateOperationOutput('candidate.build',{id:'x',jobId:'x',projectId:'x',revision:1,actorId:'owner',type:'candidate.build',status:'succeeded',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),artifacts:[{id:'artifact',artifactId:'artifact',projectId:'x',name:'model.mdl',fileName:'model.mdl',mime:'application/octet-stream',size:1,sha256:'0'.repeat(64),hash:{algorithm:'sha256',value:'0'.repeat(64)},downloadUrl:'/api/artifacts/artifact'}],metadata:{modelName:`dur_${phase}`,validation:a.validation,nativeVerified:false}});}catch(e){console.dir((e as any).details,{depth:8});throw e;}
    const parsed=readAsciiMdl(a.files.find(f=>f.name===`dur_${phase}.mdl`)!.data);assert.equal(parsed.animations[0].name,d.lifecycle);
    const node=parsed.animations[0].nodes.find(n=>n.type==='animmesh')!;assert.deepEqual(node.tracks.alpha,[[0,1],[1,1]]);
    assert.equal(sampleTrack(node.tracks.alpha,.5)[0],1);assert.deepEqual(a.validation.readback.meshes[0].visibilityRampSeconds,{start:0,end:0});
    assert.equal(a.validation.integration.effect!.visualeffects2da.columns.Type_FD,phase==='loop'?'D':'F');
    if(binaryCompilerAvailable()){
      const b=await buildCompiledCandidate(d,`dur_${phase}`);assert(b.validation.compilation!.roundtripVerified);assert.equal(b.validation.readback.animation,d.lifecycle);
      assert.equal(b.validation.integration.effect!.model.sha256,hash(b.files.find(f=>f.name===`dur_${phase}.mdl`)!.data));
    }
  }
  const old=makeDocument('empty');old.schemaVersion=2;old.layers=[makeMeshLayer('old')];const a=buildCandidate(old,'legacy_alpha');
  assert.equal(a.validation.readback.meshes[0].alpha,0);assert(Math.abs(a.validation.readback.meshes[0].visibilityRampSeconds.start-.001)<1e-12);assert(Math.abs(a.validation.readback.meshes[0].visibilityRampSeconds.end-.001)<1e-12);assert.equal(a.validation.exporterVersion,'nwn-ascii-vfx-0.21.1');
});

test('DUR uses shared revision, pause, lock, idempotency and selective undo rules; old clients refuse before mutation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-duration-')),app=await createApp({dataDir:dir});
  const call=(op:string,input:Record<string,unknown>={},actor='owner',key=randomUUID(),schema=13)=>app.studio.dispatch(actor,{operation:op,input,idempotencyKey:key},schema);
  try{
    const d=durationExample().loop;let p=ok(call('projects.import',{document:{...d,lifecycle:'impact',profileId:'nwn-ee-impact-ascii-experimental-v1'},projectId:'duration-rules'}));
    const actor=ok(call('actors.create',{name:'Duration agent',projectIds:[p.id],scopes:['read','edit','build','render','artifacts','jobs']}));
    const input=()=>({projectId:p.id,expectedRevision:p.revision,changes:[{type:'project.set',values:{lifecycle:'duration'}}]});
    assert.equal(call('changes.apply',input(),actor.id,randomUUID(),12).error!.code,'CLIENT_UPGRADE_REQUIRED');
    assert.equal(call('projects.create',{preset:'empty',lifecycle:'duration'},'owner',randomUUID(),12).error!.code,'CLIENT_UPGRADE_REQUIRED');
    const key=randomUUID(),payload=input(),applied=call('changes.apply',payload,actor.id,key);p=ok(applied);assert.deepEqual(ok(call('changes.apply',payload,actor.id,key)),p);
    assert.equal(call('changes.apply',payload,actor.id).error!.code,'REVISION_CONFLICT');
    const original=structuredClone(p.document);ok(call('policy.set',{projectId:p.id,paused:true}));assert.equal(call('changes.apply',input(),actor.id).error!.code,'AI_PAUSED');ok(call('policy.set',{projectId:p.id,paused:false}));
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'@effect',field:'lifecycle'}]}]}));
    assert.equal(call('changes.apply',input(),actor.id).error!.code,'LOCKED');assert.equal(call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:applied.operationId},actor.id).error!.code,'LOCKED');
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]},{type:'project.set',values:{name:'Independent rename'}}]}));
    p=ok(call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:applied.operationId},actor.id));assert.equal(p.document.lifecycle,'impact');assert.equal(p.document.name,'Independent rename');assert.deepEqual(p.document.layers,original.layers);
    assert.equal(call('candidate.build',{projectId:p.id,revision:p.revision,profileId:'nwn-ee-duration-ascii-experimental-v1'},actor.id).error!.code,'CAPABILITY_UNAVAILABLE');
    const legacy=durationExample().loop;delete legacy.lifecycle;legacy.profileId='nwn-ee-impact-ascii-experimental-v1';let l=ok(call('projects.import',{document:legacy}));const mode=call('changes.apply',{projectId:l.id,expectedRevision:1,changes:[{type:'project.set',values:{lifecycle:'duration'}}]});l=ok(mode);l=ok(call('changes.revert',{projectId:l.id,expectedRevision:2,operationId:mode.operationId}));assert.equal(l.document.lifecycle,undefined);assert.equal(l.document.profileId,legacy.profileId);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
