import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execute,downloadArtifact,health,connection} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {makeLayer} from '../packages/core/src/model.js';
import {rgbaPng} from '../tests/fixtures/rgba-texture.js';

const before=process.argv.includes('--before'),phase=before?'before':'after',out=resolve('output/releases/0.21.2'),folder=join(out,phase);
await mkdir(folder,{recursive:true});
const projectId='studio-metric-preview-0212',camera={position:[0,-8,.7],target:[0,0,.7],fov:39};
const call=async(operation:string,input:Record<string,unknown>={},key?:string)=>{
  const r=await execute(operation,input,{},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data as any;
};
const service=await health(await connection({}));assert.equal(service.version,before?'0.21.1':'0.21.2');
if(before){
  let p=await call('projects.create',{projectId,name:'Studio · metryczny billboard 0.21.2',preset:'empty'},'metric-0212-fixture-create');
  const imported=await call('assets.import',{projectId,expectedRevision:p.revision,fileName:'metric-white.png',
    pngBase64:Buffer.from(rgbaPng(8,8,()=>[255,255,255,255])).toString('base64')},'metric-0212-fixture-png');
  p=imported.project;
  p=await call('changes.apply',{projectId,expectedRevision:p.revision,changes:[{type:'layer.remove',layerId:'sparks'},
    {type:'layer.add',layer:{...makeLayer('metric','Metryczny billboard'),texture:`asset:${imported.assetId}`,blend:'normal',
      start:0,duration:.1,count:1,life:1,speed:1.2,spread:0,gravity:0,position:[0,0,.7],
      size:1,endSize:1,alpha:.2,midAlpha:1,endAlpha:0,midPercent:.25,color:'#ffffff',endColor:'#ffffff'}}]},'metric-0212-fixture-layers');
  await writeFile(join(out,'fixture.json'),JSON.stringify(await call('projects.inspect',{projectId}),null,2));
  await writeFile(join(out,'fixture-history.json'),JSON.stringify(await call('revisions.list',{projectId}),null,2));
}
const frozen=JSON.parse(await readFile(join(out,'fixture.json'),'utf8')),current=await call('projects.inspect',{projectId});
assert.equal(canonical(current),canonical(frozen),'fixture source and revision stay exact');
const sourceHash=hash(canonical(frozen.document)),jobs:any[]=[];
for(const [operation,input,suffix] of [
  ['preview.request',{projectId,revision:frozen.revision,time:.25,format:'png',camera},'png'],
  ['candidate.build',{projectId,revision:frozen.revision,modelName:'metric_probe'},'candidate'],
] as const){
  let job=await call(operation,input,`metric-0212-${phase}-${suffix}`);
  const deadline=Date.now()+120000;
  while(['queued','running','cancelling'].includes(job.status)){
    assert(Date.now()<deadline,'Job timed out');await new Promise(r=>setTimeout(r,250));job=await call('jobs.get',{jobId:job.id});
  }
  assert.equal(job.status,'succeeded',JSON.stringify(job.error));
  for(const artifact of job.artifacts)await downloadArtifact(artifact,join(folder,artifact.name),true,{});
  await writeFile(join(folder,suffix+'-job.json'),JSON.stringify(job,null,2));jobs.push(job);
}
assert.equal(jobs[0].metadata.rendererVersion,service.version);
const result:any={passed:true,serviceVersion:service.version,projectId,revision:frozen.revision,snapshotSha256:sourceHash,camera,jobs:jobs.map(j=>({id:j.id,type:j.type,artifacts:j.artifacts,metadata:j.metadata}))};
if(!before){
  const old=JSON.parse(await readFile(join(out,'before','candidate-job.json'),'utf8')),fresh=jobs[1];
  const resources=(j:any)=>j.artifacts.filter((a:any)=>/\.(mdl|tga|txi|hak)$/.test(a.name)).map((a:any)=>({name:a.name,size:a.size,sha256:a.sha256})).sort((a:any,b:any)=>a.name.localeCompare(b.name));
  assert.deepEqual(resources(fresh),resources(old),'All native resource bytes stay identical');
  assert.equal(canonical(await call('revisions.list',{projectId})),canonical(JSON.parse(await readFile(join(out,'fixture-history.json'),'utf8'))));
  const manifest=JSON.parse(await readFile('docs/releases/0.21.1/source-manifest.json','utf8'));
  const files=manifest.files.filter((f:any)=>f.path.startsWith('packages/nwn-format/'));
  for(const f of files)assert.equal(hash(await readFile(f.path)),f.sha256,`Exporter source unchanged: ${f.path}`);
  result.exportResourcesUnchanged=resources(fresh);result.exporterSourceFilesUnchanged=files.length;result.historyUnchanged=true;
  result.previewChanged=hash(await readFile(join(out,'before','preview.png')))!==hash(await readFile(join(folder,'preview.png')));
  assert(result.previewChanged,'The control must distinguish old/new preview');
}
await writeFile(join(out,phase+'-acceptance.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:true,phase,version:service.version,projectId,revision:frozen.revision,jobs:jobs.map(j=>j.id),previewChanged:result.previewChanged,exportResourcesUnchanged:result.exportResourcesUnchanged?.length}));
