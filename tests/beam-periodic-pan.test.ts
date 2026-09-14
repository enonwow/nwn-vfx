import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import * as THREE from 'three';
import {unzipSync,strFromU8} from 'fflate';
import {periodicFixture} from './fixtures/beam-periodic.js';
import {applyChanges,assertDocumentInvariants,type BeamLayer} from '../packages/core/src/model.js';
import {buildMaterialMotionAtlas,validatePeriodicPixels} from '../packages/core/src/beam-material-motion.js';
import {buildBeamTexture} from '../packages/core/src/beam-texture.js';
import {createBeamPreview,updateBeamPreview} from '../packages/renderer/src/beam.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {readAsciiMdl} from '../packages/nwn-format/src/mdl-reader.js';
import {verifyBinaryBeam} from '../packages/nwn-format/src/binary-beam.js';
import {readNwnTga} from '../packages/nwn-format/src/binary.js';
import {readTxi} from '../packages/nwn-format/src/textures.js';
import {createApp} from '../apps/service/src/app.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {validateDocument} from '../packages/contracts/src/schema.js';

test('periodic atlas is seamless, directional, immutable and identical to static frame zero',()=>{
  const {document:d,layer:l,pixels}=periodicFixture(),before=JSON.stringify(d),atlas=buildMaterialMotionAtlas(d,l).pixels;
  assertDocumentInvariants(d);assert.equal(d.schemaVersion,23);validateDocument(d);
  for(let f=0;f<16;f++)for(let x=0;x<64;x++)assert.deepEqual(atlas.rgba.slice((f*64+x)*4,(f*64+x)*4+4),atlas.rgba.slice((255*1024+f*64+x)*4,(255*1024+f*64+x)*4+4));
  for(let y=0;y<256;y++)assert.deepEqual(atlas.rgba.slice(y*1024*4,(y*1024+64)*4),pixels.rgba.slice(y*64*4,(y+1)*64*4));
  const reverse=buildMaterialMotionAtlas(d,{...l,materialMotion:{...l.materialMotion!,direction:'target-to-source'}}).pixels;
  for(let y=0;y<256;y++)for(let f=1;f<16;f++)assert.deepEqual(atlas.rgba.slice((y*1024+f*64)*4,(y*1024+f*64+64)*4),reverse.rgba.slice((y*1024+(16-f)*64)*4,(y*1024+(16-f)*64+64)*4));
  assert.equal(JSON.stringify(d),before);const broken=structuredClone(pixels);broken.rgba[0]=0;assert.throws(()=>validatePeriodicPixels(broken));
  for(const values of [{radius:.1},{segments:4},{textureMapping:{axis:'u',fit:'source'}},{materialMotion:{...l.materialMotion,fps:31}},{materialMotion:{...l.materialMotion,phase:1}}])assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:l.id,values:values as any}],false)));
  assert.throws(()=>assertDocumentInvariants({...d,schemaVersion:22}));
});

test('preview uses exactly16 sampled cells, repeated twice at native width with no continuous interpolation',()=>{
  const {layer:l}=periodicFixture(),mesh=createBeamPreview(l,new THREE.Texture()),camera=new THREE.PerspectiveCamera();camera.position.set(3,-5,3);
  for(const time of [0,.04,1/15,.4,16/15,1.21]){
    updateBeamPreview(mesh,l,time,camera);const uv=mesh.geometry.getAttribute('uv'),f=Math.floor(time*15)%16;
    for(const i of [0,4]){assert.equal(uv.getX(i),f/16);assert.equal(uv.getX(i+1),(f+1)/16);assert.equal(uv.getY(i),0);assert.equal(uv.getY(i+2),1);}
    const p=mesh.geometry.getAttribute('position');assert(Math.abs(new THREE.Vector3().fromBufferAttribute(p,0).distanceTo(new THREE.Vector3().fromBufferAttribute(p,1))-2*l.width)<1e-6);
  }
  mesh.geometry.dispose();mesh.material.dispose();
});

test('binary periodic carrier reads atlas grid/FPS/flags and preserves static control Fountain exactly',{skip:!binaryCompilerAvailable()},async()=>{
  const {document:d,layer:l}=periodicFixture(),staticDoc=applyChanges(d,[{type:'layer.set',layerId:l.id,values:{materialMotion:null}}],false);
  const moving=await buildCompiledCandidate(d,'periodic'),fixed=await buildCompiledCandidate(staticDoc,'periodic');
  const file=(r:typeof moving,name:string)=>{const f=r.files.find(f=>f.name===name);assert(f,name);return f.data;};
  const source=file(moving,'source-model.mdl.txt'),fixedSource=file(fixed,'source-model.mdl.txt'),proof=verifyBinaryBeam(source,file(moving,'periodic.mdl')),oldProof=verifyBinaryBeam(fixedSource,file(fixed,'periodic.mdl'));
  assert.deepEqual(readAsciiMdl(source).animations,readAsciiMdl(fixedSource).animations);
  assert.deepEqual(proof.nodes.filter(n=>!n.node.startsWith('strand_')),oldProof.nodes.filter(n=>!n.node.startsWith('strand_')));
  const b=JSON.parse(strFromU8(file(moving,'beam.json')));assert.equal(b.profile,'linked-periodic-pan-v1');assert.equal(b.layers[0].materialMotion.wholeSpanRepeats,2);
  const emitter=proof.nodes.find(n=>n.type==='emitter'&&n.update==='Lightning')!;assert.equal(emitter.flags,258);
  assert.equal(emitter.controllers![88][0],3);assert.equal(emitter.controllers![128][0],15);assert.equal(emitter.controllers![132][0],15);
  const texture=b.layers[0].texture,decoded=readNwnTga(file(moving,texture+'.tga'));
  assert.deepEqual(decoded.rgba,buildMaterialMotionAtlas(d,l).pixels.rgba);
  assert.equal(readTxi(file(moving,texture+'.txi'),'linked-periodic-pan-v1').mipmap,0);assert.throws(()=>readTxi(file(moving,texture+'.txi')));
  assert.deepEqual(buildBeamTexture(staticDoc,staticDoc.layers[1] as BeamLayer).pixels,periodicFixture().pixels);
  assert.equal(moving.validation.exporterVersion,'nwn-binary-vfx-0.29.0');assert.equal(moving.validation.nativeVerified,false);
  const z=unzipSync(exportProjectBundle({id:'fixture',revision:1,document:d} as any));assert.equal(JSON.parse(strFromU8(z['manifest.json'])).schemaVersion,18);
});

test('public schema23/ZIP18, old-client rollback, scope, pause, field locks, null/undo, save/reload and closed binary outputs',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-periodic-'));let app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,schema='23',key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+token,'x-nwn-vfx-document-schema':schema},payload:{operation,input,idempotencyKey:key}})).json();
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    const {document:d,layer:l}=periodicFixture();let p=ok(await call('projects.import',{document:d}));
    const oldDocument=applyChanges(d,[{type:'layer.set',layerId:l.id,values:{materialMotion:null}}],false);oldDocument.schemaVersion=21;
    const oldProject=ok(await call('projects.import',{document:oldDocument}));
    const oldNull=await call('changes.apply',{projectId:oldProject.id,expectedRevision:oldProject.revision,changes:[{type:'layer.set',layerId:l.id,values:{materialMotion:null}}]},undefined,'22');
    assert.equal(oldNull.error.code,'CLIENT_UPGRADE_REQUIRED');assert.equal(ok(await call('projects.inspect',{projectId:oldProject.id})).revision,oldProject.revision);
    const agent=ok(await call('actors.create',{name:'Periodic',projectIds:[p.id],scopes:['read','edit','build','export','jobs','artifacts']}));
    const readOnly=ok(await call('actors.create',{name:'Reader',projectIds:[p.id],scopes:['read']}));
    const input=()=>({projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:l.id,values:{materialMotion:{...l.materialMotion,fps:12}}}]});
    assert.equal((await call('changes.apply',input(),agent.token,'22')).error.code,'CLIENT_UPGRADE_REQUIRED');
    assert.equal((await call('changes.apply',input(),readOnly.token)).error.code,'FORBIDDEN');
    ok(await call('policy.set',{projectId:p.id,paused:true}));assert.equal((await call('changes.apply',input(),agent.token)).error.code,'AI_PAUSED');ok(await call('policy.set',{projectId:p.id,paused:false}));
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:l.id,field:'materialMotion'}]}]}));
    assert.equal((await call('changes.apply',input(),agent.token)).error.code,'LOCKED');
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    const args=input(),key=randomUUID();p=ok(await call('changes.apply',args,agent.token,'23',key));assert.equal(ok(await call('changes.apply',args,agent.token,'23',key)).revision,p.revision);
    assert.equal((await call('changes.apply',args,agent.token)).error.code,'REVISION_CONFLICT');
    const before=p.document,reset=await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:l.id,values:{materialMotion:null}}]},agent.token);p=ok(reset);
    assert.equal(p.document.layers[1].materialMotion,undefined);assert.equal(p.document.schemaVersion,23);
    p=ok(await call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:reset.operationId},agent.token));assert.deepEqual(p.document,before);
    assert.deepEqual(importProjectBundle(Buffer.from(exportProjectBundle(p)).toString('base64')),p.document);
    const q=ok(await call('candidate.build',{projectId:p.id,revision:p.revision,modelName:'periodic_http',profileId:'nwn-ee-beam-binary-experimental-v1'},agent.token));await app.studio.drainJobs();const j=ok(await call('jobs.get',{jobId:q.id},agent.token));assert.equal(j.status,'succeeded',JSON.stringify(j.error));assert.equal(j.metadata.validation.exporterVersion,'nwn-binary-vfx-0.29.0');
    await app.close();app=await createApp({dataDir:dir});assert.deepEqual(ok(await call('projects.inspect',{projectId:p.id})).document,p.document);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
