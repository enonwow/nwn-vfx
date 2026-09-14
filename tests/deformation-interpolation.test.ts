import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {durationExample} from './fixtures/duration.js';
import {interpolationFixture} from './fixtures/deformation-interpolation.js';
import {applyChanges,type MeshLayer} from '../packages/core/src/model.js';
import {createMonotoneDeformationCurve} from '../packages/core/src/deformation-curve.js';
import {compileMeshDeformation,sampleMeshDeformation} from '../packages/core/src/deformation.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {readAsciiMdl} from '../packages/nwn-format/src/mdl-reader.js';
import {createApp} from '../apps/service/src/app.js';
import {canonical} from '../apps/service/src/store.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const okay=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
test('monotone Hermite is C1, coordinate bounded, pinned and periodic without source repair',()=>{
  const d=interpolationFixture(),l=d.layers[0] as MeshLayer,source=canonical(d),curve=createMonotoneDeformationCurve(l),keys=l.animation.vertices!;
  assertDocument(d);assert.equal(d.schemaVersion,14);
  assert.deepEqual(curve.velocity(0),curve.velocity(1));assert.notEqual(curve.velocity(0)[1][1],0);
  for(const k of keys)assert.deepEqual(curve.at(k.time),k.value);
  for(let k=1;k<keys.length;k++)for(let i=0;i<=100;i++){
    const t=keys[k-1].time+(keys[k].time-keys[k-1].time)*i/100,values=curve.at(t);
    values.forEach((p,v)=>p.forEach((n,c)=>assert(n>=Math.min(keys[k-1].value[v][c],keys[k].value[v][c])-1e-12&&n<=Math.max(keys[k-1].value[v][c],keys[k].value[v][c])+1e-12)));
    assert.deepEqual(values[0],keys[0].value[0]);assert.deepEqual(values[3],keys[0].value[3]);
  }
  for(const k of keys.slice(1,-1)){
    const a=curve.velocity(k.time-1e-8),b=curve.velocity(k.time+1e-8);
    assert(Math.max(...a.flatMap((v,i)=>v.map((n,c)=>Math.abs(n-b[i][c]))))<1e-6);
  }
  const clamped=createMonotoneDeformationCurve({...l,deformationInterpolation:'monotone-cubic'});
  for(const t of [-1,0,1,2])assert(clamped.velocity(t).flat().every(n=>n===0));
  const bad=structuredClone(d);(bad.layers[0] as MeshLayer).animation.vertices!.at(-1)!.value[1][1]+=1e-10;
  assert.throws(()=>assertDocument(bad),{code:'DEFORMATION_INTERPOLATION_INVALID'});
  const close=structuredClone(d);(close.layers[0] as MeshLayer).animation.vertices![1].time=1e-8;
  assert.throws(()=>assertDocument(close),{code:'DEFORMATION_INTERPOLATION_INVALID'});
  const old=structuredClone(d);old.schemaVersion=13;assert.throws(()=>assertDocument(old));
  assert.equal(canonical(d),source);
});
test('60 Hz cubic samples share a conservative error bound, including off-grid clamped boundaries',()=>{
  const d=interpolationFixture(),l=d.layers[0] as MeshLayer;
  for(const [start,duration,mode] of [[0,1,'monotone-cubic-loop'],[.071,1.05,'monotone-cubic'],[.071,1.05,'monotone-cubic-loop']] as const){
    const layer=structuredClone(l);layer.start=start;layer.duration=duration;layer.deformationInterpolation=mode;
    for(const k of layer.animation.vertices!)k.time*=duration;
    const curve=createMonotoneDeformationCurve(layer),compiled=compileMeshDeformation(layer,1.4);
    assert.equal(compiled.frames.length,85);assert.equal(compiled.interpolation?.errorMethod,'curvature-bound');
    for(let i=0;i<=2800;i++){
      const t=i/2000,a=sampleMeshDeformation(compiled,t),b=curve.at(t-start);
      assert(Math.max(...a.map((v,j)=>Math.hypot(...v.map((n,c)=>n-b[j][c]))))<=compiled.maxDeviationMetres+1e-12);
    }
  }
});
test('explicit interpolation preserves omitted linear resources and exports exact cubic samples with ZIP v9',async()=>{
  const legacy=durationExample().loop,source=canonical(legacy),old=buildCandidate(legacy,'interp_test');
  const explicit=applyChanges(legacy,[{type:'layer.set',layerId:'panels',values:{deformationInterpolation:'linear'}}],true);
  const same=buildCandidate(explicit,'interp_test');
  for(const name of ['interp_test.mdl','interp_test.hak','vfx_635ef45015a7.tga','vfx_635ef45015a7.txi'])assert.equal(sha(old.files.find(f=>f.name===name)!.data),sha(same.files.find(f=>f.name===name)!.data));
  const d=interpolationFixture(),l=d.layers[0] as MeshLayer;
  const back=structuredClone(l);back.id='back';if(back.geometry.kind==='custom'){back.geometry.faces=back.geometry.faces.map(([a,b,c])=>[a,c,b]);back.geometry.uvFaces=back.geometry.uvFaces!.map(([a,b,c])=>[a,c,b]);}
  d.layers.push(back);assertDocument(d);
  const candidate=buildCandidate(d,'interp_test'),parsed=readAsciiMdl(candidate.files.find(f=>f.name==='interp_test.mdl')!.data);
  const meshes=parsed.animations[0].nodes.filter(n=>n.type==='animmesh'),compiled=compileMeshDeformation(l,1);
  assert.deepEqual(meshes[0].tables.animverts,compiled.frames.flat());assert.deepEqual(meshes[1].tables.animverts,meshes[0].tables.animverts);
  assert.equal(candidate.validation.exporterVersion,'nwn-ascii-vfx-0.23.0');assert.equal(candidate.validation.readback.meshes![0].deformation!.interpolation!.curveContinuity,'C1');
  const zip=exportProjectBundle({id:'interpolation',revision:1,document:d,createdAt:'',updatedAt:''});
  const manifest=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));assert.equal(manifest.schemaVersion,9);assert.equal(manifest.minimumStudioVersion,'0.23.0');
  assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),d);
  if(binaryCompilerAvailable()){
    const binary=await buildCompiledCandidate(d,'interp_test');assert.equal(binary.validation.compilation!.geometryReadback.animationMeshBindings,2);assert.equal(binary.validation.compilation!.roundtripVerified,true);
  }
  assert.equal(canonical(legacy),source);
});
test('shared interpolation operation enforces version, animation/field locks, pause, retry, conflict and undo',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-interpolation-')),app=await createApp({dataDir:dir});
  const owner=(operation:string,input:Record<string,unknown>={})=>okay(app.studio.dispatch('owner',{operation,input,idempotencyKey:randomUUID()}));
  try{
    const d=durationExample().loop;let project=owner('projects.import',{document:d});
    const agent=owner('actors.create',{name:'interpolation test',projectIds:[project.id],scopes:['read','edit','render','build','jobs','artifacts','export']});
    const actor=agent.id;
    const call=(operation:string,input:Record<string,unknown>,key=randomUUID(),schema=14)=>app.studio.dispatch(actor,{operation,input,idempotencyKey:key},schema);
    const change=[{type:'layer.set',layerId:'panels',values:{deformationInterpolation:'monotone-cubic-loop'}}];
    assert.equal(call('changes.apply',{projectId:project.id,expectedRevision:1,changes:change},randomUUID(),13).error!.code,'CLIENT_UPGRADE_REQUIRED');
    for(const field of ['animation','deformationInterpolation']){
      project=owner('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:[{type:'locks.set',locks:[{layerId:'panels',field}]}]});
      assert.equal(call('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:change}).error!.code,'LOCKED');
      project=owner('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:[{type:'locks.set',locks:[]}]});
    }
    owner('policy.set',{projectId:project.id,paused:true});assert.equal(call('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:change}).error!.code,'AI_PAUSED');owner('policy.set',{projectId:project.id,paused:false});
    const input={projectId:project.id,expectedRevision:project.revision,changes:change},key=randomUUID(),applied=call('changes.apply',input,key);project=okay(applied);
    assert.deepEqual(okay(call('changes.apply',input,key)),project);assert.equal(call('changes.apply',input).error!.code,'REVISION_CONFLICT');
    assert.equal(project.document.schemaVersion,14);assert.equal(project.document.layers[0].deformationInterpolation,'monotone-cubic-loop');
    assert.equal(call('projects.inspect',{projectId:project.id},randomUUID(),13).error!.code,'CLIENT_UPGRADE_REQUIRED');
    project=okay(call('changes.revert',{projectId:project.id,expectedRevision:project.revision,operationId:applied.operationId}));
    assert.equal(project.document.layers[0].deformationInterpolation,undefined);assert.equal(project.document.schemaVersion,14);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
