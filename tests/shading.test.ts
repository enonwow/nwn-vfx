import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createApp } from '../apps/service/src/app.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, applyChanges, type MeshLayer } from '../packages/core/src/model.js';
import { meshCornerNormals, smoothVertexNormals } from '../packages/core/src/shading.js';
import { assertDocument, validateChanges, validateOperationOutput } from '../packages/contracts/src/schema.js';
import { createMeshPreviewGeometry, createMeshPreviewMaterial } from '../packages/renderer/src/index.js';
import { buildCandidate, readAsciiMdl } from '../packages/nwn-format/src/index.js';
import { readbackMesh } from '../packages/nwn-format/src/mesh-readback.js';
import { buildCompiledCandidate, binaryCompilerAvailable } from '../packages/nwn-format/src/compiled-candidate.js';
import { verifyBinaryNormals } from '../packages/nwn-format/src/binary-normals.js';
import {smoothDeformationExample} from './fixtures/smooth-deformation.js';
import { shadingExample } from './fixtures/mesh-shading.js';

test('shading is optional, promotes schema 8, and rejects primitives and cancelling normals',()=>{
  const {document,layer}=shadingExample();assertDocument(document);assert(validateChanges([{type:'layer.add',layer}]));
  const initial=structuredClone(document);delete initial.layers[0].shading;(initial as any).schemaVersion=5;
  assertDocument(initial);
  const changes=[{type:'layer.set' as const,layerId:layer.id,values:{shading:'smooth' as const}}];
  const changed=applyChanges(initial,changes,true);assertDocument(changed);assert.equal(changed.schemaVersion,8);
  const reset=applyChanges(changed,[{...changes[0],values:{shading:null}}],true);assertDocument(reset);assert.equal(reset.schemaVersion,8);assert.equal((reset.layers[0] as MeshLayer).shading,undefined);
  for(const version of [1,2,3,4,5,6,7])assert.throws(()=>assertDocument({...document,schemaVersion:version}));
  for(const mutate of [
    (l:MeshLayer)=>{l.shading='wrong' as any;},
    (l:MeshLayer)=>{l.geometry={kind:'box',dimensions:[1,1,1]};},
    (l:MeshLayer)=>{l.geometry={kind:'custom',vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2],[0,2,1]]};delete l.texture;},
  ]){const bad=structuredClone(document);mutate(bad.layers[0]);assert.throws(()=>assertDocument(bad));}
  assert.throws(()=>applyChanges(makeDocument('empty'),[{type:'layer.set',layerId:'sparks',values:{shading:'smooth'}}],true));
  const flat=structuredClone(initial);flat.layers[0].shading='flat';(flat as any).schemaVersion=8;
  const mdl=(d:any)=>buildCandidate(d,'flat_identity').files.find(f=>f.name==='flat_identity.mdl')!.data;
  assert.deepEqual(mdl(initial),mdl(flat),'omission retains historical flat MDL');
});

test('area weighting follows position indices across UV seams; coincident and distant components remain separate',()=>{
  const vertices=[[0,0,0],[2,0,0],[0,1,0],[0,0,.5],[0,0,0],[0,1,0],[2,0,0],[5,0,0],[5,0,1],[6,0,0]];
  const faces=[[0,1,2],[0,3,1],[4,5,6],[7,8,9]],normals=smoothVertexNormals(vertices,faces);
  assert(Math.abs(normals[0][1]-1/Math.sqrt(5))<1e-12);assert(Math.abs(normals[0][2]-2/Math.sqrt(5))<1e-12);
  assert.deepEqual(normals[4],[0,0,-1]);assert.deepEqual(normals[7],[0,1,0]);
  const layer=shadingExample().layer;layer.geometry={kind:'custom',vertices:vertices as any,faces:faces as any,
    uv:Array.from({length:12},(_,i)=>[i/12,(i%2)]),uvFaces:[[0,1,2],[3,4,5],[6,7,8],[9,10,11]]};
  for(const mode of ['flat','smooth'] as const){layer.shading=mode;const geometry=createMeshPreviewGeometry(layer),attribute=geometry.getAttribute('normal');
    const expected=meshCornerNormals(vertices,faces,mode);assert.equal(attribute.count,12);
    expected.forEach((n,i)=>n.forEach((value,k)=>assert(Math.abs(attribute.getComponent(i,k)-value)<1e-7)));
    const material=createMeshPreviewMaterial(layer,null);assert.equal((material as any).flatShading,mode==='flat');geometry.dispose();material.dispose();
  }
});

test('ASCII smoothing masks and binary stored normals are checked at every corner, including UV seams',{skip:!binaryCompilerAvailable()},async()=>{
  const {document}=shadingExample(),ascii=buildCandidate(document,'smooth_test'),source=ascii.files.find(f=>f.name==='smooth_test.mdl')!.data;
  const parsed=readAsciiMdl(source),report=ascii.validation.readback.meshes[0];
  assert.equal(report.shading!.mode,'smooth');assert.equal(report.shading!.smoothingMask,1);
  const mesh=parsed.nodes.find(n=>n.name===report.node)!;assert(mesh.tables.faces.every(f=>f[3]===1));
  mesh.tables.faces[0][3]=0;
  assert.throws(()=>readbackMesh(parsed,parsed.animations[0],document.layers[0],report.node,report.parent,report.texture),{code:'EXPORT_VALIDATION_FAILED'});
  const binary=await buildCompiledCandidate(document,'smooth_test'),proof=binary.validation.compilation!.normalReadback;
  assert.equal(proof.corners,document.layers[0].geometry.kind==='custom'?document.layers[0].geometry.faces.length*3:0);
  assert(proof.allCornersRead&&proof.maxComponentError<.00001);
  const bytes=Buffer.from(binary.files.find(f=>f.name==='smooth_test.mdl')!.data),rawBase=12+bytes.readUInt32LE(4);
  const visit=(o:number):number=>{if(bytes.readUInt32LE(12+o+0x6c)===0x21)return o;const c=bytes.readUInt32LE(12+o+0x48),count=bytes.readUInt32LE(12+o+0x4c);for(let i=0;i<count;i++){const found=visit(bytes.readUInt32LE(12+c+i*4));if(found>=0)return found;}return -1;};
  const node=visit(bytes.readUInt32LE(12+0x48)),normal=rawBase+bytes.readUInt32LE(12+node+0x244);
  bytes.writeFloatLE(9,normal);assert.throws(()=>verifyBinaryNormals(source,bytes),{code:'COMPILE_VALIDATION_FAILED'});
  bytes.writeUInt32LE(0xffffffff,12+node+0x244);assert.throws(()=>verifyBinaryNormals(source,bytes),{code:'COMPILE_VALIDATION_FAILED'});
  // Coincident positions with separate indices and opposite winding must retain opposite normals.
  const two=structuredClone(document),l=two.layers[0];delete l.texture;l.geometry={kind:'custom',vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2],[3,5,4]]};
  const opposite=await buildCompiledCandidate(two,'opposite_test');assert.equal(opposite.validation.compilation!.normalReadback.corners,6);
});

for(const deform of [false,true])test(`${deform?'deformed':'rigid'} shading public operations preserve grants, locks, pause, retry, history, undo and portable source`,async()=>{
  const root=resolve(tmpdir()),dir=mkdtempSync(join(root,'nwn-shading-')),app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:`Bearer ${token}`},payload:{operation,input,idempotencyKey:key}})).json();
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try {
    const fixture=deform?smoothDeformationExample():shadingExample(),initial=structuredClone(fixture.document);delete initial.layers[0].shading;delete initial.layers[0].animation.vertices;(initial as any).schemaVersion=5;
    const p=ok(await call('projects.import',{document:initial}));
    const actor=ok(await call('actors.create',{name:'Shading agent',projectIds:[p.id],scopes:['read','edit','export','artifacts']}));
    const input={projectId:p.id,expectedRevision:1,changes:[{type:'layer.set',layerId:fixture.layer.id,values:{shading:fixture.layer.shading,...(deform?{animation:fixture.layer.animation}:{})}}]};
    const preview=ok(await call('changes.preview',input,actor.token));assert(preview);
    await call('policy.set',{projectId:p.id,paused:true});assert.equal((await call('changes.apply',input,actor.token)).error.code,'AI_PAUSED');await call('policy.set',{projectId:p.id,paused:false});
    const key=randomUUID(),changed=await call('changes.apply',input,actor.token,key),saved=ok(changed);
    assert.equal(saved.document.schemaVersion,8);assert.deepEqual(ok(await call('changes.apply',input,actor.token,key)),saved);
    assert.equal((await call('changes.apply',input,actor.token)).error.code,'REVISION_CONFLICT');
    const color=ok(await call('changes.apply',{projectId:p.id,expectedRevision:2,changes:[{type:'layer.set',layerId:fixture.layer.id,values:{color:'#ff0000'}}]},actor.token));
    const reverted=ok(await call('changes.revert',{projectId:p.id,expectedRevision:3,operationId:changed.operationId},actor.token));
    assert.equal(reverted.document.layers[0].shading,undefined);assert.equal(reverted.document.layers[0].color,'#ff0000');
    const resaved=ok(await call('changes.apply',{...input,expectedRevision:4},actor.token));
    for(const [i,field] of ['shading','animation','geometry'].entries()){
      const locked=ok(await call('changes.apply',{projectId:p.id,expectedRevision:5+i,changes:[{type:'locks.set',locks:[{layerId:fixture.layer.id,field}]}]}));
      const attempt={projectId:p.id,expectedRevision:locked.revision,changes:[{type:'layer.set',layerId:fixture.layer.id,values:{[field]:fixture.layer[field as 'shading'|'animation'|'geometry']}}]};
      assert.equal((await call('changes.apply',attempt,actor.token)).error.code,'LOCKED');
    }
    const history=ok(await call('revisions.list',{projectId:p.id}));assert.equal(history.items.find((r:any)=>r.revision===2).actorId,actor.id);assert(history.items.find((r:any)=>r.revision===2).committedAt);
    const exported=ok(await call('projects.export',{projectId:p.id,revision:5},actor.token));
    const bytes=(await app.inject({url:`/api/artifacts/${exported.artifact.id}`,headers:{host:'127.0.0.1:4317',authorization:`Bearer ${actor.token}`}})).rawPayload;
    const imported=ok(await call('projects.import',{bundleBase64:bytes.toString('base64')}));assert.deepEqual(imported.document,resaved.document);
    const caps=ok(await call('capabilities'));validateOperationOutput('capabilities',caps);assert.equal(caps.meshShading.documentSchemaVersion,8);
  } finally {await app.close();assert.equal(dirname(dir),root);rmSync(dir,{recursive:true,force:true});}
});
