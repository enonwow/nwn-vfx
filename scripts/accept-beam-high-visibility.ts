import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {execute,downloadArtifact,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {validateOperationOutput} from '../packages/contracts/src/schema.js';
import {encodePngRgba8,decodePngRgba8} from '../packages/core/src/textures.js';
import {readAsciiMdl} from '../packages/nwn-format/src/index.js';

const out=resolve('output/beam-high-visibility-v10'),dataDir=resolve('output/beam-flow-diagnostic/isolated-service'),port=14384;
const options={config:join(dataDir,'config.json'),endpoint:`http://127.0.0.1:${port}`};
await mkdir(out,{recursive:true});
const app=await createApp({dataDir,port,webDir:resolve('dist/web'),render:createRenderer(options.endpoint)});
const call=async(operation:string,input:Record<string,unknown>={},key?:string)=>{
  const result=await execute(operation,input,options,key);assert.notEqual(result.status,'failed',JSON.stringify(result.error));
  validateOperationOutput(operation,result.data);return result.data as any;
};
try{
  await app.listen({host:'127.0.0.1',port});
  const service=await health(await connection(options));assert.equal(service.workspaceId,'956bb5be-f64b-415b-8a40-64917ecbee85');
  const source=await call('projects.inspect',{projectId:'studio-finite-essence-diagnostic'});
  assert.equal(source.revision,1);assert.equal(hash(canonical(source.document)),'9b66d3aa119b2a88a48d65734d6666cf99af4de8726d25fd20442a0b15cb0731');
  let project=await call('projects.fork',{projectId:source.id,revision:1,newProjectId:'studio-finite-essence-visibility-v10',name:'V10 diagnostic - opaque white particles'},'finite-essence-v10-fork-001');
  const png=encodePngRgba8({width:32,height:32,rgba:new Uint8Array(32*32*4).fill(255)});
  assert(decodePngRgba8(png).rgba.every(v=>v===255));
  const asset=await call('assets.import',{projectId:project.id,expectedRevision:project.revision,fileName:'diagnostic-opaque-white-32.png',pngBase64:Buffer.from(png).toString('base64')},'finite-essence-v10-white-001');
  project=asset.project;
  const values={texture:'asset:'+asset.assetId,color:'#ffffff',midColor:'#ffffff',endColor:'#ffffff',alpha:1,midAlpha:1,endAlpha:1,size:.5,midSize:.5,endSize:.5};
  project=await call('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:[{type:'layer.set',layerId:source.document.layers[0].id,values}]},'finite-essence-v10-appearance-001');
  const expected=structuredClone(source.document);expected.name='V10 diagnostic - opaque white particles';
  expected.assets=project.document.assets;Object.assign(expected.layers[0],values);
  assert.deepEqual(project.document,expected,'Only the named appearance fields, fork name and additional asset may change');
  for(const old of source.document.assets)assert.deepEqual(project.document.assets.find((a:any)=>a.id===old.id),old);
  assert.equal(project.document.assets.length,source.document.assets.length+1);
  const report:any={passed:false,nativeVerified:false,globalInstall:false,purpose:'Visibility diagnostic only; same emission, cast01, lifeExp, P2P and reference as V9',service,
    source:{id:source.id,revision:1,snapshotSha256:hash(canonical(source.document))},project:{id:project.id,revision:project.revision,snapshotSha256:hash(canonical(project.document))},
    changedLayerFields:values,whiteTexture:{sha256:hash(png),width:32,height:32,rgba:[255,255,255,255],coverage:1},jobs:[]};
  for(const format of ['binary','png']){
    const build=format==='binary';
    const queued=await call(build?'candidate.build':'preview.request',{projectId:project.id,revision:project.revision,...(build?{modelName:'vd_essence10',profileId:'nwn-ee-beam-binary-experimental-v1'}:{format:'png',time:1.4,camera:{position:[4,-4,3],target:[0,1.5,1.2],fov:39}})},'finite-essence-v10-'+format+'-001');
    await app.studio.drainJobs();const job=await call('jobs.get',{jobId:queued.id});assert.equal(job.status,'succeeded',JSON.stringify(job.error));
    const folder=join(out,format);await mkdir(folder,{recursive:true});
    const artifacts=[];
    for(const artifact of job.artifacts){
      const path=join(folder,artifact.fileName),existing=await readFile(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      if(existing===null)await downloadArtifact(artifact,path,false,options);
      const bytes=existing??await readFile(path);assert.equal(hash(bytes),artifact.sha256);assert.equal(bytes.length,artifact.size);
      artifacts.push({id:artifact.id,name:artifact.fileName,sha256:artifact.sha256,size:artifact.size,path});
    }
    if(build){
      const effect=job.metadata.validation.integration.effect;assert.equal(effect.schemaVersion,6);
      assert.deepEqual(effect.beam.progfx2da.columns,{Type:7,Param1:'vd_essence10',Param6:'cast01'});
      const previous=readAsciiMdl(await readFile('output/beam-animation-correction/source-model.mdl.txt'));
      const current=readAsciiMdl(await readFile(join(folder,'source-model.mdl.txt')));
      const normalize=(text:string)=>text.replaceAll('vd_essence01','diagnostic').replaceAll('vd_essence10','diagnostic');
      assert.equal(normalize(JSON.stringify(current.animations)),normalize(JSON.stringify(previous.animations)),'Animation and all birthrate keys must remain identical');
      const sourceFlow=JSON.parse(await readFile('output/beam-animation-correction/beam-flow.json','utf8'));
      const currentFlow=JSON.parse(await readFile(join(folder,'beam-flow.json'),'utf8'));
      for(const key of ['layers','endpoints','nativeObjects','animation','duration','removeNoEarlierThan','direction','pool'])assert.deepEqual(currentFlow[key],sourceFlow[key],key+' must remain identical');
      report.animationAndFlowUnchanged=true;
    }
    report.jobs.push({id:job.id,format,metadata:job.metadata,artifacts});
    await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({format,jobId:job.id,artifacts:artifacts.length}));
  }
  assert.deepEqual((await call('projects.inspect',{projectId:source.id})).document,source.document);
  assert.equal((await call('projects.inspect',{projectId:source.id})).revision,1);
  report.passed=true;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,projectId:project.id,revision:project.revision,snapshotSha256:report.project.snapshotSha256,handoff:join(out,'binary','handoff.json')}));
}finally{await app.close();}
