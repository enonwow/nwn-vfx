import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../apps/service/src/app.js';
import {paletteFixture,paletteOptions} from './fixtures/palette.js';
import {rgbaPng} from './fixtures/rgba-texture.js';
const ok=(r:any):any=>{assert.equal(r.status,'ok',JSON.stringify(r.error));return r.data;};
async function fixture(){const dir=mkdtempSync(join(tmpdir(),'studio-palette-')),app=await createApp({dataDir:dir});
 const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:`Bearer ${token}`},payload:{operation,input,idempotencyKey:key}})).json();
 return {app,call,close:async()=>{await app.close();assert.equal(dirname(dir),resolve(tmpdir()));rmSync(dir,{recursive:true,force:true});}};}
test('palette preview is read-only, hash-bound commit is atomic/idempotent and undo preserves independent imports/history',async()=>{
 const f=await fixture();try{
  const original=paletteFixture(),project=ok(await f.call('projects.import',{document:original})),actor=ok(await f.call('actors.create',{name:'Palette agent',projectIds:[project.id],scopes:['edit','read','import','export']}));
  const input={projectId:project.id,expectedRevision:1,options:paletteOptions},preview=ok(await f.call('palette.preview',input,actor.token));
  assert.equal(ok(await f.call('projects.inspect',{projectId:project.id})).revision,1);
  assert.equal((await f.call('palette.apply',{...input,proposalHash:'0'.repeat(64)},actor.token)).error.code,'PALETTE_PROPOSAL_CONFLICT');
  assert.equal(ok(await f.call('projects.inspect',{projectId:project.id})).revision,1);
  const apply={...input,proposalHash:preview.proposalHash},key=randomUUID(),result=await f.call('palette.apply',apply,actor.token,key),saved=ok(result);
  assert.deepEqual(saved.project.document,preview.document);assert.equal(saved.project.revision,2);
  assert.deepEqual(ok(await f.call('palette.apply',apply,actor.token,key)),saved);
  assert.equal((await f.call('palette.apply',apply,actor.token)).error.code,'REVISION_CONFLICT');
  assert.equal((await f.call('palette.apply',{...apply,options:{...paletteOptions,to:'#0000ff'}},actor.token,key)).error.code,'IDEMPOTENCY_CONFLICT');
  const operation=ok(await f.call('operations.get',{operationId:result.operationId}));assert.equal(operation.actorId,actor.id);assert.equal(operation.name,'palette.apply');
  const added=ok(await f.call('assets.import',{projectId:project.id,expectedRevision:2,fileName:'independent.png',pngBase64:Buffer.from(rgbaPng(8,8,()=>[2,3,4,255])).toString('base64')}));
  const undone=ok(await f.call('changes.revert',{projectId:project.id,expectedRevision:3,operationId:result.operationId},actor.token));
  assert.deepEqual(undone.document.layers,original.layers);assert.equal(undone.document.assets.length,2);assert.equal(undone.document.assets[1].id,added.assetId);
  assert.deepEqual(ok(await f.call('revisions.get',{projectId:project.id,revision:2})).document,preview.document);
  const history=ok(await f.call('revisions.list',{projectId:project.id})).items;assert.equal(history.find((h:any)=>h.revision===2).actorId,actor.id);
 }finally{await f.close();}
});
test('WebMCP palette operations enforce scope, pause, locks, revisions and protect shared excluded layers',async()=>{
 const f=await fixture();try{
  const project=ok(await f.call('projects.import',{document:paletteFixture()})),origin='http://127.0.0.1:4317';
  const bootstrap=await f.app.inject({url:'/api/session',headers:{host:'127.0.0.1:4317',referer:origin+'/', 'sec-fetch-site':'same-origin'}});
  const headers={host:'127.0.0.1:4317',origin,cookie:String(bootstrap.headers['set-cookie']).split(';')[0],'sec-fetch-site':'same-origin'};
  const grant=(await f.app.inject({method:'POST',url:'/api/webmcp/sessions',headers,payload:{projectId:project.id,viewSessionId:randomUUID()}})).json();
  const web=async(operation:string,input:object,key=randomUUID())=>(await f.app.inject({method:'POST',url:'/api/webmcp/commands',headers:{...headers,'x-nwn-view-session':grant.viewSessionId,'x-nwn-webmcp-session':grant.token},payload:{operation,input,idempotencyKey:key}})).json();
  let input={projectId:project.id,expectedRevision:1,options:paletteOptions};
  const preview=ok(await web('palette.preview',input));ok(await f.call('policy.set',{projectId:project.id,paused:true}));
  assert.equal((await web('palette.apply',{...input,proposalHash:preview.proposalHash})).error.code,'AI_PAUSED');ok(await web('palette.preview',input));
  ok(await f.call('policy.set',{projectId:project.id,paused:false}));
  ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:1,changes:[{type:'locks.set',locks:[{layerId:'blood',field:'texture'}]}]}));input.expectedRevision=2;
  assert.equal((await web('palette.preview',input)).error.code,'LOCKED');assert.equal((await web('palette.apply',{...input,proposalHash:preview.proposalHash})).error.code,'LOCKED');
  const excluded={...input,options:{...paletteOptions,scope:{...paletteOptions.scope,excludeLayerIds:['blood']}}};
  const p=ok(await web('palette.preview',excluded)),saved=ok(await web('palette.apply',{...excluded,proposalHash:p.proposalHash}));
  assert.equal(saved.project.document.assets.length,1);assert.deepEqual(saved.project.document.layers[0],project.document.layers[0]);
  const other=ok(await f.call('projects.create',{}));assert.equal((await web('palette.preview',{...input,projectId:other.id,expectedRevision:1})).error.code,'FORBIDDEN');
 }finally{await f.close();}
});
test('palette undo refuses a later dependency on the derived PNG with no partial mutation',async()=>{
 const f=await fixture();try{
  const project=ok(await f.call('projects.import',{document:paletteFixture()})),input={projectId:project.id,expectedRevision:1,options:paletteOptions};
  const p=ok(await f.call('palette.preview',input)),r=await f.call('palette.apply',{...input,proposalHash:p.proposalHash}),saved=ok(r);
  const current=ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'excluded',values:{texture:saved.project.document.layers[0].texture}}]}));
  assert.equal((await f.call('changes.revert',{projectId:project.id,expectedRevision:3,operationId:r.operationId})).error.code,'UNDO_CONFLICT');
  const unchanged=ok(await f.call('projects.inspect',{projectId:project.id}));assert.equal(unchanged.revision,current.revision);assert.deepEqual(unchanged.document,current.document);
 }finally{await f.close();}
});
