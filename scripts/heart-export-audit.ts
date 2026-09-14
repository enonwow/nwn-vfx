/** Read-only consumer inputs; mutations are public operations on explicit forks. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectBinaryMeshes,verifyBinaryGeometry} from '../packages/nwn-format/src/binary-geometry.js';
import {verifyBinaryNormals} from '../packages/nwn-format/src/binary-normals.js';
import {verifyCompiledRoundtrip} from '../packages/nwn-format/src/compiled-readback.js';
import {execute,downloadArtifact,health,connection} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {BINARY_PROFILE_ID} from '../packages/core/src/export-profiles.js';
const input=resolve('C:/Projects/the last city/assets/vfx/wampir/bijace-serce/export/r4/candidate');
const out=resolve('output/animmesh-audit');await mkdir(out,{recursive:true});
const write=async(name:string,value:unknown)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n');
const call=async(operation:string,input:Record<string,unknown>={},key?:string)=>{
  const r=await execute(operation,input,{},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r;
};
const projectId='tlc-wampir-bijace-serce';
const original=(await call('projects.inspect',{projectId,revision:4})).data as any;
const latestBefore=(await call('projects.inspect',{projectId})).data as any;
const originalHash=hash(canonical(original.document));
const service=await health(await connection({}));
if(process.argv.includes('--inspect')){
  const source=await readFile(join(input,'source-model.mdl.txt')),binary=await readFile(join(input,'vfxe9dd4bc745f9.mdl')),
    roundtrip=await readFile(join(input,'compiled-roundtrip.mdl.txt')),tga=await readFile(join(input,'vfx_0f8dabf324e1.tga'));
  const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
  const meshes=inspectBinaryMeshes(binary),oldRoundtrip=verifyCompiledRoundtrip(source,roundtrip),normals=verifyBinaryNormals(source,binary);
  const directGeometry=verifyBinaryGeometry(source,binary,{allowDuplicateControllers:true});
  let strictError:string|undefined;try{verifyBinaryGeometry(source,binary);}catch(e){strictError=(e as Error).message;}
  assert(strictError?.includes('duplicate controller'));
  const layer=original.document.layers.find((l:any)=>l.id==='heart'),edges=new Map<string,number>(),oriented=new Map<string,number>();
  for(const face of layer.geometry.faces)for(let i=0;i<3;i++){
    const a=face[i],b=face[(i+1)%3],key=[a,b].sort((a,b)=>a-b).join('/');edges.set(key,(edges.get(key)??0)+1);oriented.set(key,(oriented.get(key)??0)+(a<b?1:-1));
  }
  const alpha=new Set(Array.from({length:(tga.length-18)/4},(_,i)=>tga[21+i*4]));
  await write('r4-offline-audit.json',{projectId,revision:4,snapshotSha256:originalHash,modelSha256:sha(binary),sourceSha256:sha(source),
    oldRoundtrip,normals,directGeometry,strictError,textureAlpha:[...alpha],topology:{triangles:layer.geometry.faces.length,edges:edges.size,
      boundaryOrNonmanifoldEdges:[...edges.values()].filter(n=>n!==2).length,inconsistentWindingEdges:[...oriented.values()].filter(n=>n!==0).length},
    meshes:meshes.map(m=>({context:m.context,name:m.name,render:m.render,vertexCount:m.positions.length,faceCount:m.faces.length,
      draws:m.draws.map(d=>d.length),vertexSetCount:m.vertexSetCount,textureSetCount:m.textureSetCount,samplePeriod:m.samplePeriod,
      controllerTypes:m.controllerTypes,duplicateTypes:[...new Set(m.controllerTypes.filter((n,i,a)=>a.indexOf(n)!==i))]})),
    nativeCause:'unresolved; duplicate controllers are a confirmed exporter ambiguity, not a proven cause of screenshot artifacts',nativeVerified:false});
  assert.equal(sha(await readFile(join(input,'vfxe9dd4bc745f9.mdl'))),sha(binary));
  console.log(JSON.stringify({directGeometry,strictError,modelSha256:sha(binary)}));
}else{
  const fixed=process.argv.includes('--fixed');assert.equal(service.version,fixed?'0.14.1':'0.14.0');
  const results:any[]=[];
  for(const variant of fixed?['controllers-fixed']:['static','held']){
    const suffix=fixed?'0141':'0140',id=`studio-heart-audit-${variant}-${suffix}`;
    const fork=(await call('projects.fork',{projectId,revision:4,newProjectId:id,name:fixed?original.document.name:`Studio audit — heart ${variant} ${suffix}`},`heart-audit-fork-${variant}-${suffix}-v1`)).data as any;
    if(fixed)assert.equal(hash(canonical(fork.document)),originalHash);
    let saved=fork;
    if(!fixed){
      const l=fork.document.layers.find((l:any)=>l.id==='heart'),animation=structuredClone(l.animation);
      if(variant==='static')delete animation.vertices;
      // Two identical boundary keys produce the same 121 held samples without
      // repeating long full-precision coordinates 62 times in the document.
      else animation.vertices=[0,l.duration].map(time=>({time,value:structuredClone(l.geometry.vertices)}));
      saved=(await call('changes.apply',{projectId:id,expectedRevision:1,changes:[{type:'layer.set',layerId:'heart',values:{animation}}]},`heart-audit-change-${variant}-${suffix}-${variant==='held'?'v2':'v1'}`)).data as any;
    }
    const revision=saved.revision,dir=join(out,`${variant}-${suffix}`);await mkdir(dir,{recursive:true});
    await writeFile(join(dir,'source-document.json'),JSON.stringify(saved.document,null,2));
    const modelName=fixed?'vh_ctrl0141':variant==='static'?'vh_static0140':'vh_hold0140';
    const accepted=(await call('candidate.build',{projectId:id,revision,profileId:BINARY_PROFILE_ID,modelName},`heart-audit-build-${variant}-${suffix}-v1`)).data as any;
    const deadline=Date.now()+180000;let job:any;
    do{
      job=(await call('jobs.get',{jobId:accepted.id})).data;
      if(['succeeded','failed','cancelled'].includes(job.status))break;
      assert(Date.now()<deadline,'job timeout; recover original job/key');await delay(1000);
    }while(true);
    assert.equal(job.status,'succeeded',JSON.stringify(job.error));
    for(const a of job.artifacts)if(a.name.endsWith('.zip')||a.name===`${modelName}.mdl`||['validation.json','handoff.json'].includes(a.name))
      await downloadArtifact(a,join(dir,a.name),true,{});
    results.push({variant,projectId:id,revision,modelName,jobId:job.id,snapshotSha256:hash(canonical(saved.document)),artifacts:job.artifacts,
      geometryReadback:job.metadata.validation.compilation.geometryReadback,directory:dir,nativeVerified:false});
    await write(`${fixed?'fixed':'controls'}-handoff.json`,{service,source:{projectId,revision:4,snapshotSha256:originalHash},results});
    console.log(JSON.stringify({variant,projectId:id,revision,jobId:job.id,modelName}));
  }
}
const latestAfter=(await call('projects.inspect',{projectId})).data as any;
assert.equal(latestAfter.revision,latestBefore.revision);assert.equal(hash(canonical(latestAfter.document)),hash(canonical(latestBefore.document)));
assert.equal(hash(canonical(((await call('projects.inspect',{projectId,revision:4})).data as any).document)),originalHash);
