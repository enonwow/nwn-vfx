import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {applyChanges,changedFields,makeMeshLayer,makeTrailLayer} from '../packages/core/src/model.js';
import {assertDocument,validateOperationOutput} from '../packages/contracts/src/schema.js';
import {flipbookFrameUv,sampleFlipbookFrame} from '../packages/core/src/flipbook.js';
import {buildCandidate,readHak,readTga} from '../packages/nwn-format/src/index.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {verifyBinaryFlipbooks} from '../packages/nwn-format/src/binary-flipbook.js';
import {createApp} from '../apps/service/src/app.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {atlasSettings,flipbookFixture} from './fixtures/flipbook.js';

const changes=(flipbook:unknown):any=>[{type:'layer.set',layerId:'atlas',values:{flipbook}}];
test('atlas contract, exact boundaries, subset cycle and schema promotion; invalid assignments reject',()=>{
  const legacy=flipbookFixture(false),doc=applyChanges(legacy,changes(atlasSettings),true);assert.equal(doc.schemaVersion,12);assertDocument(doc);
  assert.deepEqual([0,.249999,.25,.5,.75,1,1.25].map(t=>sampleFlipbookFrame(atlasSettings,t)),[0,0,1,2,3,0,1]);
  const subset={...atlasSettings,frameStart:1,frameEnd:2};assert.deepEqual([0,.25,.5,.75].map(t=>sampleFlipbookFrame(subset,t)),[1,2,1,2]);
  assert.deepEqual([0,1,2,3].map(i=>flipbookFrameUv(atlasSettings,i)),[[0,.5,.5,1],[.5,.5,1,1],[0,0,.5,.5],[.5,0,1,.5]]);
  const removed=applyChanges(doc,changes(null),true);assert.equal(removed.schemaVersion,12);assert(!Object.hasOwn(removed.layers[0],'flipbook'));
  assert.deepEqual(changedFields(doc,applyChanges(doc,changes(subset),true)).map(d=>d.path),['/layers/atlas/flipbook']);
  const locked={...doc,locks:[{layerId:'atlas',field:'flipbook'}]};assert.throws(()=>applyChanges(locked,changes(null),false),{code:'LOCKED'});
  for(const value of [null,{...atlasSettings,columns:3},{...atlasSettings,fps:0},{...atlasSettings,fps:1.5},{...atlasSettings,frameEnd:4},{...atlasSettings,frameStart:2,frameEnd:1},{...atlasSettings,frameEnd:0},{...atlasSettings,columns:16},{...atlasSettings,loop:false}]){
    const bad=structuredClone(doc);(bad.layers[0] as any).flipbook=value;assert.throws(()=>assertDocument(bad));
  }
  for(const type of ['mesh','trail','light','ribbon']){
    const bad=structuredClone(doc);bad.layers=[type==='mesh'?makeMeshLayer('atlas'):type==='trail'?makeTrailLayer('atlas'):({...bad.layers[0],type} as any)];(bad.layers[0] as any).flipbook=atlasSettings;assert.throws(()=>assertDocument(bad));
  }
  const bad=structuredClone(doc);(bad.layers[0] as any).texture='smoke';assert.throws(()=>assertDocument(bad));
  assert.throws(()=>assertDocument({...doc,schemaVersion:11}));assertDocument(legacy);
});

test('ASCII and real binary retain grid/controllers, original RGBA, HAK and exact portable snapshot',async()=>{
  const document=flipbookFixture(),legacy=flipbookFixture(false),old=buildCandidate(legacy,'atlas_probe');
  for(const binary of [false,...(binaryCompilerAvailable()?[true]:[])]){
    const result=binary?await buildCompiledCandidate(document,'atlas_probe'):buildCandidate(document,'atlas_probe');
    assert.deepEqual(result.validation.readback.layers[0].flipbook,atlasSettings);
    assert.equal(result.validation.nativeVerified,false);
    const source=result.files.find(f=>f.name===(binary?'source-model.mdl.txt':'atlas_probe.mdl'))!.data;
    if(binary){assert.deepEqual(result.validation.compilation!.emitterFlipbookReadback,{emitters:1,animationBindings:1,allSettingsRead:true,animationOverrides:false});
      const model=result.files.find(f=>f.name==='atlas_probe.mdl')!.data;
      // Corrupt the actual serialized grid, independent of the decompiler.
      const corrupted=Uint8Array.from(model),view=new DataView(corrupted.buffer);let changed=false;
      for(let offset=12;offset<12+view.getUint32(4,true)-0x148;offset+=4)if(view.getUint32(offset+0x6c,true)===5&&view.getUint32(offset+0x7c,true)===2&&view.getUint32(offset+0x80,true)===2){view.setUint32(offset+0x7c,4,true);changed=true;break;}
      assert(changed);assert.throws(()=>verifyBinaryFlipbooks(source,corrupted),{code:'COMPILE_VALIDATION_FAILED'});
    }
    const textures=result.files.filter(f=>/\.(tga|txi)$/.test(f.name));assert.deepEqual(textures,old.files.filter(f=>/\.(tga|txi)$/.test(f.name)));
    const tga=readTga(textures.find(f=>f.name.endsWith('.tga'))!.data);assert.deepEqual(Array.from(tga.rgba.slice((16*64+16)*4,(16*64+16)*4+3)),[240,40,30]);
    const hak=readHak(result.files.find(f=>f.name==='atlas_probe.hak')!.data);for(const f of textures)assert.deepEqual(hak.find(h=>h.name===f.name)!.data,f.data);
  }
  const zip=exportProjectBundle({id:'fixture',revision:2,createdAt:'',updatedAt:'',document}),manifest=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));
  assert.equal(manifest.schemaVersion,7);assert.equal(manifest.minimumStudioVersion,'0.20.0');assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),document);
});

test('public operations preserve author/revision, undo, locks, pause, idempotency and old-client fences',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-flipbook-')),app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,schema='12',key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+token,'x-nwn-vfx-document-schema':schema},payload:{operation,input,idempotencyKey:key}})).json();
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    let p=ok(await call('projects.import',{document:flipbookFixture(false)}));const id=p.id;
    const actor=ok(await call('actors.create',{name:'Atlas agent',projectIds:[id],scopes:['read','edit','build','artifacts','jobs']}));
    const input=(value:unknown,revision=p.revision)=>({projectId:id,expectedRevision:revision,changes:changes(value)});
    assert.equal((await call('changes.apply',input(atlasSettings),actor.token,'11')).error.code,'CLIENT_UPGRADE_REQUIRED');
    assert.equal(ok(await call('changes.preview',input(atlasSettings),actor.token)).document.schemaVersion,12);
    const payload=input(atlasSettings),key=randomUUID(),applied=await call('changes.apply',payload,actor.token,'12',key);p=ok(applied);
    assert.deepEqual(ok(await call('changes.apply',payload,actor.token,'12',key)),p);
    assert.equal((await call('changes.apply',input(atlasSettings,p.revision-1),actor.token)).error.code,'REVISION_CONFLICT');
    assert.equal((await call('projects.inspect',{projectId:id},actor.token,'11')).error.code,'CLIENT_UPGRADE_REQUIRED');
    const h=ok(await call('revisions.list',{projectId:id})).items.find((r:any)=>r.revision===p.revision);assert.equal(h.actorId,actor.id);assert(h.committedAt);
    p=ok(await call('changes.revert',{projectId:id,expectedRevision:p.revision,operationId:applied.operationId},actor.token));assert(!Object.hasOwn(p.document.layers[0],'flipbook'));assert.equal(p.document.schemaVersion,12);
    p=ok(await call('changes.apply',input(atlasSettings),actor.token));
    p=ok(await call('changes.apply',{projectId:id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'atlas',field:'flipbook'}]}]}));
    assert.equal((await call('changes.apply',input(null),actor.token)).error.code,'LOCKED');
    p=ok(await call('changes.apply',{projectId:id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    ok(await call('policy.set',{projectId:id,paused:true}));assert.equal((await call('changes.apply',input(null),actor.token)).error.code,'AI_PAUSED');
    ok(await call('policy.set',{projectId:id,paused:false}));
    const job=ok(await call('candidate.build',{projectId:id,revision:p.revision}));validateOperationOutput('candidate.build',job);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
