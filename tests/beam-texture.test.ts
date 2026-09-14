import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import * as THREE from 'three';
import {unzipSync,strFromU8} from 'fflate';
import {applyChanges,assertDocumentInvariants,makeDocument,changedFields,type BeamLayer} from '../packages/core/src/model.js';
import {buildBeamTexture} from '../packages/core/src/beam-texture.js';
import {createTextureAsset,encodePngRgba8,resolveTexture} from '../packages/core/src/textures.js';
import {validateChanges,validateDocument} from '../packages/contracts/src/schema.js';
import {createBeamPreview,updateBeamPreview} from '../packages/renderer/src/beam.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {readNwnTga} from '../packages/nwn-format/src/binary.js';
import {binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {createApp} from '../apps/service/src/app.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';

function fixture(){
  const pixels={width:16,height:8,rgba:new Uint8Array(16*8*4)};
  for(let y=0;y<8;y++)for(let x=0;x<16;x++)pixels.rgba.set([x*17,y*31,255-x*17,y>=2&&y<6?255:0],(y*16+x)*4);
  const asset=createTextureAsset('horizontal.png',Buffer.from(encodePngRgba8(pixels)).toString('base64'));
  const d=makeDocument('empty','Mapping fixture','beam');d.assets=[asset];
  const document=applyChanges(d,[{type:'layer.set',layerId:'beam',values:{texture:`asset:${asset.id}`,textureMapping:{axis:'u',fit:'source'},segments:2,radius:0}}],false);
  return {document,layer:document.layers[0] as BeamLayer,pixels,asset};
}
test('explicit U rotates rectangular pixels losslessly into native V, preserving hidden RGB and source',()=>{
  const {document,layer,pixels}=fixture(),before=JSON.stringify(document),result=buildBeamTexture(document,layer);
  assert.equal(result.pixels.width,8);assert.equal(result.pixels.height,16);
  for(let x=0;x<16;x++)for(let y=0;y<8;y++)assert.deepEqual([...result.pixels.rgba.slice(((15-x)*8+y)*4,((15-x)*8+y)*4+4)],[x*17,y*31,255-x*17,y>=2&&y<6?255:0]);
  assert.equal(result.metadata!.nativeAlongAxis,'V');assert.equal(result.metadata!.repetitions,2);assert.equal(JSON.stringify(document),before);
  const native=buildBeamTexture(document,{...layer,textureMapping:{axis:'v',fit:'source'}});assert.deepEqual(native.pixels,pixels);
});
test('alpha bounds are explicit, stretch only the derivative and reject transparent crops',()=>{
  const {document,layer,pixels}=fixture(),cropped=buildBeamTexture(document,{...layer,textureMapping:{axis:'u',fit:'alpha-bounds'}});
  assert.deepEqual(cropped.metadata!.crop,{x:0,y:2,width:16,height:4});
  for(let i=3;i<cropped.pixels.rgba.length;i+=4)assert.equal(cropped.pixels.rgba[i],255);
  const empty=createTextureAsset('empty.png',Buffer.from(encodePngRgba8({...pixels,rgba:new Uint8Array(pixels.rgba.length)})).toString('base64'));
  document.assets=[empty];const l={...layer,texture:'asset:'+empty.id,textureMapping:{axis:'u',fit:'alpha-bounds'}} as BeamLayer;
  assert.throws(()=>buildBeamTexture(document,l),(e:any)=>e.code==='BEAM_TEXTURE_MAPPING_INVALID');
  assert.doesNotThrow(()=>buildBeamTexture(document,{...l,textureMapping:{axis:'u',fit:'source'}}));
});
test('omission/reset preserves legacy source resources; explicit mapping changes only derivative texture binding',()=>{
  const {document,layer}=fixture(),legacy=applyChanges(document,[{type:'layer.set',layerId:layer.id,values:{textureMapping:null}}],false);
  assert.deepEqual(buildBeamTexture(legacy,legacy.layers[0] as BeamLayer).pixels,resolveTexture(document,layer.texture));
  const old=buildCandidate(legacy,'mapping'),mapped=buildCandidate(document,'mapping'),identity=buildCandidate(applyChanges(document,[{type:'layer.set',layerId:layer.id,values:{textureMapping:{axis:'v',fit:'source'}}}],false),'mapping');
  const resources=(r:typeof old)=>r.files.filter(f=>/\.(mdl|hak|tga|txi)$/.test(f.name));assert.deepEqual(resources(old),resources(identity));
  assert.equal(old.validation.exporterVersion,'nwn-ascii-vfx-0.26.1');assert.equal(mapped.validation.exporterVersion,'nwn-ascii-vfx-0.26.2');
  const tga=readNwnTga(mapped.files.find(f=>f.name.endsWith('.tga'))!.data);assert.deepEqual(tga.rgba,buildBeamTexture(document,layer).pixels.rgba);
  const meta=JSON.parse(new TextDecoder().decode(mapped.files.find(f=>f.name==='beam.json')!.data));assert.equal(meta.layers[0].textureMapping.repetitions,2);assert.equal(meta.layers[0].textureMapping.sourceUnchanged,true);
});
test('mapped preview repeats native V per edge, uses native half width and omits fake flow pulses',()=>{
  const {layer}=fixture(),camera=new THREE.PerspectiveCamera();camera.position.set(5,-4,3);
  for(const segments of [2,8,32]){const l={...layer,segments} as BeamLayer,mesh=createBeamPreview(l,new THREE.Texture());updateBeamPreview(mesh,l,.7,camera);
    assert.equal(mesh.material.uniforms.moving.value,0);assert.equal(mesh.geometry.getAttribute('position').count,segments*4);
    assert.deepEqual([...mesh.geometry.getAttribute('uv').array],Array.from({length:segments},()=>[0,0,1,0,0,1,1,1]).flat());
    const p=mesh.geometry.getAttribute('position');for(let i=0;i<segments*4;i+=2)assert(Math.abs(new THREE.Vector3().fromBufferAttribute(p,i).distanceTo(new THREE.Vector3().fromBufferAttribute(p,i+1))-2*l.width)<1e-6);
    mesh.geometry.dispose();mesh.material.dispose();}
});
test('mapping is closed, beam-only, schema18, atomic and mutually exclusive with atlas motion',()=>{
  const {document,layer}=fixture();assert(validateDocument(document),JSON.stringify(validateDocument.errors));assertDocumentInvariants(document);
  assert.equal(document.schemaVersion,18);assert.equal(validateDocument({...document,schemaVersion:17}),false);assert.throws(()=>assertDocumentInvariants({...document,schemaVersion:17}),/dokumentu 18/);
  for(const m of [{axis:'x',fit:'source'},{axis:'u'}, {axis:'v',fit:'auto'},{axis:'u',fit:'source',extra:true}])assert.equal(validateChanges([{type:'layer.set',layerId:'beam',values:{textureMapping:m}}]),false);
  const changed=applyChanges(document,[{type:'layer.set',layerId:'beam',values:{textureMapping:{axis:'v',fit:'alpha-bounds'}}}],false);assert.deepEqual(changedFields(document,changed).map(c=>c.path),['/layers/beam/textureMapping']);
  assert.throws(()=>applyChanges(makeDocument(),[{type:'layer.set',layerId:'sparks',values:{textureMapping:layer.textureMapping}}],false),/wymaga beam/);
  assert.throws(()=>assertDocumentInvariants({...document,layers:[{...layer,lightningScale:0,nativeMotion:{phase:'flow',direction:'source-to-target',fps:16,pulseWidth:.25,fit:'source'} as const}]}),/nativeMotion/);
});
test('service supports mapping edits, old-client rollback, grants, pause, locks, retry, conflict, undo, ZIP13 and both exports',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-beam-map-')),app=await createApp({dataDir:dir});
  const call=(operation:string,input:object={},actor='owner',key=randomUUID(),schema=18)=>app.studio.dispatch(actor,{operation,input:input as any,idempotencyKey:key},schema),ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    let p=ok(call('projects.create',{preset:'empty',lifecycle:'beam'}));const actor=ok(call('actors.create',{name:'Mapping agent',projectIds:[p.id],scopes:['read','edit','export','build','jobs','artifacts']}));
    const foreign=ok(call('actors.create',{name:'Foreign',projectIds:[],scopes:['read','edit']}));
    const input=()=>({projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'beam',values:{textureMapping:{axis:'u',fit:'alpha-bounds'}}}]});
    assert.equal(call('changes.apply',input(),actor.id,randomUUID(),17).error!.code,'CLIENT_UPGRADE_REQUIRED');assert.equal(ok(call('projects.inspect',{projectId:p.id})).revision,1);
    assert.equal(call('changes.apply',input(),foreign.id).error!.code,'FORBIDDEN');
    ok(call('policy.set',{projectId:p.id,paused:true}));assert.equal(call('changes.apply',input(),actor.id).error!.code,'AI_PAUSED');ok(call('policy.set',{projectId:p.id,paused:false}));
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'beam',field:'textureMapping'}]}]}));assert.equal(p.document.schemaVersion,18);assert.equal(call('changes.apply',input(),actor.id).error!.code,'LOCKED');
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    const key=randomUUID(),patch=input(),r=call('changes.apply',patch,actor.id,key);p=ok(r);assert.equal(ok(call('changes.apply',patch,actor.id,key)).revision,p.revision);assert.equal(call('changes.apply',patch,actor.id).error!.code,'REVISION_CONFLICT');
    assert.equal(call('projects.inspect',{projectId:p.id},actor.id,randomUUID(),17).error!.code,'CLIENT_UPGRADE_REQUIRED');
    const zip=exportProjectBundle(p),manifest=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));assert.equal(manifest.schemaVersion,13);assert.equal(manifest.minimumStudioVersion,'0.26.2');assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),p.document);
    for(const format of ['ascii','binary']){if(format==='binary'&&!binaryCompilerAvailable())continue;const q=ok(call('candidate.build',{projectId:p.id,revision:p.revision,profileId:`nwn-ee-beam-${format}-experimental-v1`,modelName:'mapping_service'},actor.id));await app.studio.drainJobs();const j=ok(call('jobs.get',{jobId:q.id},actor.id));assert.equal(j.status,'succeeded',JSON.stringify(j.error));assert.equal(j.metadata.validation.exporterVersion,`nwn-${format}-vfx-0.26.2`);assert.equal(j.metadata.validation.nativeVerified,false);}
    p=ok(call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:r.operationId},actor.id));assert.equal(p.document.layers[0].textureMapping,undefined);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
