import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { deformationExample } from './fixtures/mesh-deformation.js';
import { assertDocument, validateChanges, validateOperationOutput } from '../packages/contracts/src/schema.js';
import { applyChanges, makeDocument, makeTrailLayer, promoteDocumentSchema, type MeshLayer, type Vec3 } from '../packages/core/src/model.js';
import { authoredMeshVertices, compileMeshDeformation, sampleMeshDeformation } from '../packages/core/src/deformation.js';
import { sampleMeshLayer } from '../packages/core/src/mesh.js';
import { createMeshPreviewGeometry, updateMeshPreviewVertices } from '../packages/renderer/src/index.js';
import { buildCandidate, readAsciiMdl } from '../packages/nwn-format/src/index.js';
import { readbackMesh } from '../packages/nwn-format/src/mesh-readback.js';
import { buildCompiledCandidate, binaryCompilerAvailable } from '../packages/nwn-format/src/compiled-candidate.js';
import { verifyCompiledRoundtrip } from '../packages/nwn-format/src/compiled-readback.js';
import { createApp } from '../apps/service/src/app.js';
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

test('deformation validates fixed topology, finite bounded positions, local times, schema promotion and allocation budgets',()=>{
  const {document,layer}=deformationExample(); assertDocument(document);
  assert(validateChanges([{type:'layer.add',layer}]));
  const promoted=applyChanges(makeDocument('empty'),[{type:'layer.add',layer}],true);
  promoted.assets=document.assets;assertDocument(promoted);assert.equal(promoted.schemaVersion,7);
  // A later trail must never downgrade schema 7.
  assert.equal(promoteDocumentSchema({...document,layers:[...document.layers,{...makeTrailLayer('trail'),enabled:false}]}).schemaVersion,7);
  assert.throws(()=>assertDocument({...document,schemaVersion:6}));
  const invalid:Array<(l:MeshLayer)=>void>=[
    l=>{l.animation.vertices=[];},l=>{l.animation.vertices![1].time=0;},l=>{l.animation.vertices![1].time=-.1;},
    l=>{l.animation.vertices![1].time=.5;},l=>{l.animation.vertices![1].time=NaN;},
    l=>{l.animation.vertices![1].value.pop();},l=>{l.animation.vertices![1].value[2][1]=Infinity;},
    l=>{l.animation.vertices![1].value[2][1]=21;},l=>{l.geometry={kind:'box',dimensions:[1,1,1]};},
    l=>{l.animation.vertices=Array.from({length:65},(_,i)=>({time:i/200,value:(l.geometry as any).vertices}));},
  ];
  for(const mutate of invalid){const bad=structuredClone(document);mutate(bad.layers[0] as MeshLayer);assert.throws(()=>assertDocument(bad));}
  const enormous=structuredClone(document),large=enormous.layers[0] as MeshLayer;
  assert(large.geometry.kind==='custom');
  large.geometry.vertices=Array.from({length:2048},(_,i)=>[i/1024,(i%2)/100,.01]);large.geometry.faces=[[0,1,2]];
  large.geometry.uvFaces=[[0,1,2]];
  large.animation.vertices=[{time:0,value:large.geometry.vertices}];enormous.duration=30;
  assert.throws(()=>assertDocument(enormous),{code:'LIMIT_EXCEEDED'});
  const overBytes=structuredClone(document),bulky=overBytes.layers[0] as MeshLayer;bulky.enabled=false;
  assert(bulky.geometry.kind==='custom');
  bulky.geometry.vertices=[...bulky.geometry.vertices,...Array.from({length:2041},()=>[.12345678901234567,.23456789012345678,.34567890123456789] as Vec3)];
  bulky.animation.vertices=Array.from({length:64},(_,i)=>({time:i/200,value:(bulky.geometry as any).vertices}));
  assert.throws(()=>assertDocument(overBytes),{code:'LIMIT_EXCEEDED',message:'Dokument przekracza limit 6 MiB.'});
});

test('shared samples anchor the contact point and change shape/normals before layer transforms; off-grid error is reported',()=>{
  const {layer}=deformationExample(),compiled=compileMeshDeformation(layer,2);
  assert(compiled.maxDeviationMetres>0 && compiled.maxDeviationMetres<.02);
  const expected=authoredMeshVertices(layer,.137),sample=sampleMeshDeformation(compiled,.537);
  assert.deepEqual(sample[0],[0,0,0]);assert.notDeepEqual(sample,expected);
  const geometry=createMeshPreviewGeometry(layer),before=[...geometry.attributes.normal.array];
  updateMeshPreviewVertices(layer,geometry,sample);
  assert.notDeepEqual([...geometry.attributes.normal.array],before);
  assert(geometry.boundingSphere!.radius>.1);
  for(let t=0;t<=2;t+=.011)assert.deepEqual(sampleMeshDeformation(compiled,t)[0],[0,0,0]);
  const transformed={...layer,position:[1,2,3] as Vec3,scale:2,orientation:[0,0,1,Math.PI/2] as MeshLayer['orientation']};
  assert.deepEqual(compileMeshDeformation(transformed,2),compiled,'Layer transforms must not be baked into local samples');
  assert.deepEqual(sampleMeshLayer(transformed,.6).position,[1,2,3]);
  // Off-grid peak is an endpoint of the difference of the two linear curves.
  for(let t=.4;t<=.85;t+=.001){const a=sampleMeshDeformation(compiled,t),b=authoredMeshVertices(layer,t-.4);a.forEach((v,i)=>assert(Math.hypot(...v.map((x,j)=>x-b[i][j]))<=compiled.maxDeviationMetres+1e-12));}
  geometry.dispose();
});

test('ASCII and binary readback preserve every deforming position, independent UV and normal-blend PNG',{skip:!binaryCompilerAvailable()},async()=>{
  const {document,layer}=deformationExample(),source=JSON.stringify(document);
  const candidate=buildCandidate(document,'deformation'),mesh=candidate.validation.readback.meshes[0];
  assert(mesh.deformation?.allSamplesRead);assert.equal(mesh.deformation.frameSets,121);assert.equal(mesh.blend,'normal');
  assert.equal(mesh.deformation.animvertsSha256,hash(compileMeshDeformation(layer,2).frames.flat()));
  assert.equal(mesh.deformation.uvSamples,847);assert.deepEqual(mesh.selfIllumination,[0,0,0]);
  const mdl=candidate.files.find(f=>f.name==='deformation.mdl')!.data,parsed=readAsciiMdl(mdl);
  const original=parsed.animations[0].nodes.find(n=>n.name===mesh.node)!;
  original.tables.animverts[500][0]+=.1;
  assert.throws(()=>readbackMesh(parsed,parsed.animations[0],layer,mesh.node,mesh.parent,mesh.texture,'normal'),{code:'EXPORT_VALIDATION_FAILED'});
  const binary=await buildCompiledCandidate(document,'deformation');
  assert.equal(JSON.stringify(document),source);assert.equal(binary.validation.nativeVerified,false);
  assert.deepEqual(binary.validation.readback.meshes[0].deformation,mesh.deformation);
  assert.equal(binary.validation.compilation!.vertexSamples,847);
  const roundtrip=binary.files.find(f=>f.name==='compiled-roundtrip.mdl.txt')!.data;
  const corrupted=new TextEncoder().encode(new TextDecoder().decode(roundtrip).replace(/(animverts \d+\s+)[^\r\n]+/,'$1 99 99 99'));
  assert.throws(()=>verifyCompiledRoundtrip(mdl,corrupted),{code:'COMPILE_VALIDATION_FAILED'});
});

test('deformation public operations preserve grants, locks, pause, retry, history, undo and portable source',async()=>{
  const root=resolve(tmpdir()),dir=mkdtempSync(join(root,'nwn-deformation-')),app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:`Bearer ${token}`},payload:{operation,input,idempotencyKey:key}})).json();
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try {
    const fixture=deformationExample(),initial=structuredClone(fixture.document);delete (initial.layers[0] as MeshLayer).animation.vertices;initial.schemaVersion=5;
    const p=ok(await call('projects.import',{document:initial}));
    const actor=ok(await call('actors.create',{name:'Deformation agent',projectIds:[p.id],scopes:['read','edit','export','artifacts']}));
    const input={projectId:p.id,expectedRevision:1,changes:[{type:'layer.set',layerId:fixture.layer.id,values:{animation:fixture.layer.animation}}]};
    const preview=ok(await call('changes.preview',input,actor.token));assert(preview);
    await call('policy.set',{projectId:p.id,paused:true});assert.equal((await call('changes.apply',input,actor.token)).error.code,'AI_PAUSED');await call('policy.set',{projectId:p.id,paused:false});
    const key=randomUUID(),changed=await call('changes.apply',input,actor.token,key),saved=ok(changed);
    assert.equal(saved.document.schemaVersion,7);assert.deepEqual(ok(await call('changes.apply',input,actor.token,key)),saved);
    assert.equal((await call('changes.apply',input,actor.token)).error.code,'REVISION_CONFLICT');
    const color=ok(await call('changes.apply',{projectId:p.id,expectedRevision:2,changes:[{type:'layer.set',layerId:fixture.layer.id,values:{color:'#ff0000'}}]},actor.token));
    const reverted=ok(await call('changes.revert',{projectId:p.id,expectedRevision:3,operationId:changed.operationId},actor.token));
    assert.equal(reverted.document.layers[0].animation.vertices,undefined);assert.equal(reverted.document.layers[0].color,'#ff0000');
    const resaved=ok(await call('changes.apply',{...input,expectedRevision:4},actor.token));
    const locked=ok(await call('changes.apply',{projectId:p.id,expectedRevision:5,changes:[{type:'locks.set',locks:[{layerId:fixture.layer.id,field:'animation'}]}]}));
    assert.equal((await call('changes.apply',{...input,expectedRevision:locked.revision},actor.token)).error.code,'LOCKED');
    const history=ok(await call('revisions.list',{projectId:p.id}));assert.equal(history.items.find((r:any)=>r.revision===2).actorId,actor.id);assert(history.items.find((r:any)=>r.revision===2).committedAt);
    const exported=ok(await call('projects.export',{projectId:p.id,revision:5},actor.token));
    const bytes=(await app.inject({url:`/api/artifacts/${exported.artifact.id}`,headers:{host:'127.0.0.1:4317',authorization:`Bearer ${actor.token}`}})).rawPayload;
    const imported=ok(await call('projects.import',{bundleBase64:bytes.toString('base64')}));assert.deepEqual(imported.document,resaved.document);
    const caps=ok(await call('capabilities'));validateOperationOutput('capabilities',caps);assert.equal(caps.meshDeformation.documentSchemaVersion,7);
  } finally {await app.close();assert.equal(dirname(dir),root);rmSync(dir,{recursive:true,force:true});}
});
