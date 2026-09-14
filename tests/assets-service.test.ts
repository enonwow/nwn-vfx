import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { createApp } from '../apps/service/src/app.js';
import { makeMeshLayer } from '../packages/core/src/model.js';
import { orientationTexture } from './fixtures/rgba-texture.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const png = orientationTexture(), pngBase64 = Buffer.from(png).toString('base64'), assetId = sha(png);
const ok = (result: any) => { assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data; };
test('project assets are immutable revisions, shared by texture/UV edits, locks, pause, history and selective undo', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nwn-vfx-assets-')); let app = await createApp({ dataDir });
  const call = async (operation: string, input: object, token = app.studio.config.ownerToken, key = randomUUID()) =>
    (await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:`Bearer ${token}`},payload:{operation,input,idempotencyKey:key}})).json();
  try {
    let p = ok(await call('projects.create', {preset:'empty',name:'RGBA resources fixture'}));
    const agent = ok(await call('actors.create', {name:'Texture author',projectIds:[p.id],scopes:['read','edit','create','export']}));
    const importKey = randomUUID();
    const input = {projectId:p.id,expectedRevision:p.revision,fileName:'quadrants.png',pngBase64};
    const imported = await call('assets.import', input, agent.token, importKey); p = ok(imported).project;
    assert.equal(imported.data.assetId, assetId); assert.equal(p.revision, 2); assert.equal(p.document.schemaVersion, 3);
    assert.deepEqual(ok(await call('assets.import', input, agent.token, importKey)), imported.data);
    assert.equal(ok(await call('operations.resolve', {projectId:p.id,operation:'assets.import',idempotencyKey:importKey}, agent.token)).operationId, imported.operationId);
    assert.equal(ok(await call('assets.import', {...input,expectedRevision:2}, agent.token)).project.revision, 2);
    const listed = ok(await call('assets.list', {projectId:p.id,revision:2}, agent.token));
    assert.equal(listed.items.length, 1); assert.equal(listed.items[0].id, assetId); assert.equal(listed.items[0].pngBase64, undefined);
    assert.equal((await call('assets.get', {projectId:p.id,revision:1,assetId}, agent.token)).error.code, 'MISSING_ASSET');
    const mesh = {...makeMeshLayer('surface','Texture surface','ring'),texture:`asset:${assetId}`,blend:'normal'};
    p = ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.add',layer:mesh},{type:'layer.set',layerId:'sparks',values:{texture:`asset:${assetId}`,blend:'normal'}}]},agent.token));
    assert.equal((await call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:imported.operationId},agent.token)).error.code, 'UNDO_CONFLICT');
    const assigned = await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'surface',values:{texture:null,midPercent:null}}]},agent.token);
    // A wrong layer-specific field cannot be smuggled into a mesh.
    assert.equal(assigned.status, 'failed');
    const clear = await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'surface',values:{texture:null}}]},agent.token); p = ok(clear);
    p = ok(await call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:clear.operationId},agent.token));
    assert.equal(p.document.layers.find((l:any)=>l.id==='surface').texture, `asset:${assetId}`);
    const age = await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'sparks',values:{midColor:'#18aaff',midAlpha:.8,midSize:.3,midPercent:.35}}]},agent.token);p=ok(age);
    p=ok(await call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:age.operationId},agent.token));
    assert.equal(p.document.layers[0].midPercent, undefined);
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'surface',field:'texture'},{layerId:'surface',field:'geometry'}]}]}));
    assert.equal((await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'surface',values:{texture:null}}]},agent.token)).error.code,'LOCKED');
    assert.equal((await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'surface',values:{geometry:{kind:'box',dimensions:[1,1,1]}}}]},agent.token)).error.code,'LOCKED');
    ok(await call('policy.set',{projectId:p.id,paused:true}));
    assert.equal((await call('assets.import',{...input,expectedRevision:p.revision},agent.token)).error.code,'AI_PAUSED');
    assert.equal(ok(await call('assets.get',{projectId:p.id,assetId},agent.token)).pngBase64,pngBase64);
    const other=ok(await call('projects.create',{preset:'empty'}));
    assert.equal((await call('assets.get',{projectId:other.id,assetId},agent.token)).error.code,'FORBIDDEN');
    await app.close();app=await createApp({dataDir});
    assert.deepEqual(ok(await call('projects.inspect',{projectId:p.id})).document,p.document);
    const history=ok(await call('revisions.list',{projectId:p.id}));
    assert.equal(history.items.find((r:any)=>r.revision===2).actorId,agent.id);
    assert.equal(ok(await call('assets.get',{projectId:p.id,revision:2,assetId})).pngBase64,pngBase64);
  } finally {await app.close();assert.equal(resolve(dataDir,'..'),resolve(tmpdir()));rmSync(dataDir,{recursive:true,force:true});}
});

test('portable ZIP verifies exact PNG dependencies, metadata, missing files and document hashes', async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'nwn-vfx-assets-zip-')),app=await createApp({dataDir});
  const headers={host:'127.0.0.1:4317',authorization:`Bearer ${app.studio.config.ownerToken}`};
  const call=async(operation:string,input:object)=>(await app.inject({method:'POST',url:'/api/commands',headers,payload:{operation,input,idempotencyKey:randomUUID()}})).json();
  try {
    let p=ok(await call('projects.create',{preset:'empty'}));
    const imported=await call('assets.import',{projectId:p.id,expectedRevision:1,fileName:'quadrants.png',pngBase64});p=ok(imported).project;
    const reverted=ok(await call('changes.revert',{projectId:p.id,expectedRevision:2,operationId:imported.operationId}));
    assert.equal(reverted.document.assets,undefined);assert.equal(reverted.document.schemaVersion,3);
    assert.equal(ok(await call('assets.get',{projectId:p.id,revision:2,assetId})).pngBase64,pngBase64);
    const bundle=ok(await call('projects.export',{projectId:p.id,revision:2}));
    const bytes=(await app.inject({url:`/api/artifacts/${bundle.artifact.id}`,headers})).rawPayload;
    const files=unzipSync(bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
    assert.equal(manifest.schemaVersion,3);assert.equal(manifest.assets[0].id,assetId);
    assert.equal(sha(files[`assets/${assetId}.png`]),assetId);
    assert.deepEqual(ok(await call('projects.import',{bundleBase64:bytes.toString('base64')})).document,p.document);
    const missing={...files};delete missing[`assets/${assetId}.png`];
    assert.equal((await call('projects.import',{bundleBase64:Buffer.from(zipSync(missing)).toString('base64')})).error.code,'MISSING_ASSET');
    const tampered={...files,[`assets/${assetId}.png`]:orientationTexture(16)};
    assert.equal((await call('projects.import',{bundleBase64:Buffer.from(zipSync(tampered)).toString('base64')})).error.code,'BUNDLE_HASH_MISMATCH');
    const unsafe={...files,'../outside.png':png};
    assert.equal((await call('projects.import',{bundleBase64:Buffer.from(zipSync(unsafe)).toString('base64')})).error.code,'UNSAFE_BUNDLE');
    const badManifest={...files,'manifest.json':strToU8(JSON.stringify({...manifest,assets:[]}))};
    assert.equal((await call('projects.import',{bundleBase64:Buffer.from(zipSync(badManifest)).toString('base64')})).error.code,'BUNDLE_HASH_MISMATCH');
    const invalid=structuredClone(p.document);invalid.layers[0].texture='asset:'+'0'.repeat(64);
    assert.equal((await call('projects.import',{document:invalid})).error.code,'MISSING_ASSET');
    const badUv=structuredClone(p.document);badUv.layers.push({...makeMeshLayer('custom','Custom','custom'),texture:`asset:${assetId}`,geometry:{kind:'custom',vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],uv:[[0,0],[1,0],[0,1]],uvFaces:[[0,1,9]]}});
    assert.equal((await call('projects.import',{document:badUv})).status,'failed');
  }finally{await app.close();assert.equal(resolve(dataDir,'..'),resolve(tmpdir()));rmSync(dataDir,{recursive:true,force:true});}
});
