import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/service/src/app.js';
import { orientationTexture } from './fixtures/rgba-texture.js';

async function fixture() {
  const dataDir=mkdtempSync(join(tmpdir(),'nwn-vfx-assets-undo-'));
  let app=await createApp({dataDir});
  const call=async(operation:string,input:Record<string,unknown>)=>(await app.inject({method:'POST',url:'/api/commands',
    headers:{host:'127.0.0.1:4317',authorization:`Bearer ${app.studio.config.ownerToken}`},payload:{operation,input,idempotencyKey:randomUUID()}})).json();
  return {call,restart:async()=>{await app.close();app=await createApp({dataDir});},close:async()=>{
    await app.close();assert.equal(resolve(dataDir,'..'),resolve(tmpdir()));rmSync(dataDir,{recursive:true,force:true});
  }};
}
function ok(result:any):any {assert.equal(result.status,'ok',JSON.stringify(result.error));return result.data;}
const image=(size:number)=>Buffer.from(orientationTexture(size)).toString('base64');

test('undo first immutable texture import preserves later midpoint and second import, including restart and historical PNG bytes',async()=>{
  const f=await fixture();
  try {
    let project=ok(await f.call('projects.create',{preset:'empty',name:'Independent asset undo'}));
    const first=await f.call('assets.import',{projectId:project.id,expectedRevision:1,fileName:'first.png',pngBase64:image(8)});
    const firstData=ok(first);project=firstData.project;
    assert.equal(project.revision,2);assert.equal(project.document.schemaVersion,3);
    const firstSnapshot=structuredClone(project.document),firstAssetId=firstData.assetId;
    project=ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'sparks',values:{midAlpha:.72}}]}));
    const second=ok(await f.call('assets.import',{projectId:project.id,expectedRevision:3,fileName:'second.png',pngBase64:image(16)}));
    project=second.project;assert.equal(project.revision,4);assert.notEqual(second.assetId,firstAssetId);
    const secondAsset=structuredClone(project.document.assets.find((asset:any)=>asset.id===second.assetId));
    project=ok(await f.call('changes.revert',{projectId:project.id,expectedRevision:4,operationId:first.operationId}));
    assert.equal(project.revision,5);assert.equal(project.document.schemaVersion,3);assert.equal(project.document.layers[0].midAlpha,.72);
    assert.deepEqual(project.document.assets,[secondAsset]);
    assert.equal((await f.call('assets.get',{projectId:project.id,assetId:firstAssetId})).error.code,'MISSING_ASSET');
    assert.deepEqual(ok(await f.call('revisions.get',{projectId:project.id,revision:2})).document,firstSnapshot);
    assert.equal(ok(await f.call('assets.get',{projectId:project.id,revision:2,assetId:firstAssetId})).pngBase64,image(8));
    assert.deepEqual(ok(await f.call('operations.get',{operationId:first.operationId})).result.data,firstData);
    await f.restart();
    const {diff:_,...persistedProject}=project;
    assert.deepEqual(ok(await f.call('projects.inspect',{projectId:project.id})),persistedProject);
    assert.deepEqual(ok(await f.call('assets.get',{projectId:project.id,assetId:second.assetId})),secondAsset);
    assert.equal(ok(await f.call('assets.get',{projectId:project.id,revision:2,assetId:firstAssetId})).pngBase64,image(8));
    assert.deepEqual(ok(await f.call('revisions.list',{projectId:project.id})).items.map((revision:any)=>revision.revision),[5,4,3,2,1]);
  } finally {await f.close();}
});

test('undo refuses an imported texture still assigned to a layer without committing a revision',async()=>{
  const f=await fixture();
  try {
    let project=ok(await f.call('projects.create',{preset:'empty',name:'Assigned texture undo guard'}));
    const imported=await f.call('assets.import',{projectId:project.id,expectedRevision:1,fileName:'assigned.png',pngBase64:image(8)});
    const data=ok(imported);project=data.project;
    project=ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'sparks',values:{texture:`asset:${data.assetId}`}}]}));
    const rejected=await f.call('changes.revert',{projectId:project.id,expectedRevision:3,operationId:imported.operationId});
    assert.equal(rejected.status,'failed');assert.equal(rejected.error.code,'UNDO_CONFLICT');
    const {diff:_,...persistedProject}=project;
    assert.deepEqual(ok(await f.call('projects.inspect',{projectId:project.id})),persistedProject);
    assert.equal(ok(await f.call('revisions.list',{projectId:project.id})).items.length,3);
    assert.equal(ok(await f.call('assets.get',{projectId:project.id,assetId:data.assetId})).pngBase64,image(8));
  } finally {await f.close();}
});

test('undo authored midpoint fields on a legacy document retains schema promotion and an independent later edit',async()=>{
  const f=await fixture();
  try {
    let project=ok(await f.call('projects.create',{preset:'empty',name:'Legacy midpoint undo'}));
    const original=structuredClone(project.document);assert.equal(original.schemaVersion,1);
    const authored=await f.call('changes.apply',{projectId:project.id,expectedRevision:1,changes:[{type:'layer.set',layerId:'sparks',values:{midColor:'#18aaff',midAlpha:.7,midSize:.3,midPercent:.35}}]});
    project=ok(authored);assert.equal(project.document.schemaVersion,3);
    project=ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'sparks',values:{alpha:.9}}]}));
    project=ok(await f.call('changes.revert',{projectId:project.id,expectedRevision:3,operationId:authored.operationId}));
    assert.equal(project.revision,4);assert.equal(project.document.schemaVersion,3);
    assert.deepEqual(project.document.layers[0],{...original.layers[0],alpha:.9});
    for(const field of ['midColor','midAlpha','midSize','midPercent'])assert.equal(Object.hasOwn(project.document.layers[0],field),false);
    assert.deepEqual(ok(await f.call('revisions.get',{projectId:project.id,revision:1})).document,original);
    assert.equal(ok(await f.call('revisions.get',{projectId:project.id,revision:2})).document.layers[0].midPercent,.35);
  } finally {await f.close();}
});
