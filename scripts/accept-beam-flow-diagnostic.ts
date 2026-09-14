import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {execute,downloadArtifact,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {makeFlowLayer} from '../packages/core/src/beam-flow.js';
import {BEAM_PROFILE_ID,type EffectDocument,type EmitterLayer} from '../packages/core/src/model.js';

const out=resolve('output/beam-flow-diagnostic'),dataDir=join(out,'isolated-service'),port=14384;await mkdir(out,{recursive:true});
const options={config:join(dataDir,'config.json'),endpoint:`http://127.0.0.1:${port}`};
const app=await createApp({dataDir,port,webDir:resolve('dist/web'),render:createRenderer(options.endpoint)});await app.listen({host:'127.0.0.1',port});
const call=async(op:string,input:Record<string,unknown>={},key?:string)=>{const r=await execute(op,input,options,key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data as any;};
const report:any={prerelease:true,version:'0.27.0',nativeVerified:false,transport:'public CLI client / HTTP',jobs:[]};
try{
  const source=JSON.parse(await readFile('output/beam-crash-research/wisp-reference.json','utf8')).data;
  report.source={projectId:source.id,revision:source.revision,snapshotSha256:hash(canonical(source.document))};
  const original=source.document.layers[0] as EmitterLayer;
  const layer:EmitterLayer={...makeFlowLayer('essence',3.6),texture:original.texture,blend:'normal',color:original.color,midColor:original.midColor,endColor:original.endColor,
    alpha:0,midAlpha:.55,endAlpha:0,size:.12,midSize:.16,endSize:.04,midPercent:.5,count:144,seed:1827,
    beamBinding:{role:'flow',source:[0,0,1.2],target:[0,3,1.2],direction:'source-to-target',pulse:{period:.55,duty:.65}}};
  const document:EffectDocument={schemaVersion:19,name:'Studio diagnostic - finite moving essence',duration:3.6,seed:1827,lifecycle:'beam',profileId:BEAM_PROFILE_ID,locks:[],layers:[layer],assets:source.document.assets};
  const imported=await call('projects.import',{document,projectId:'studio-finite-essence-diagnostic'},'finite-essence-diagnostic-import-v1');
  const p=imported.project??imported;assert.equal(p.revision,1);
  report.project={id:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document))};report.service=await health(await connection(options));
  await writeFile(join(out,'diagnostic-document.json'),JSON.stringify(p.document,null,2));
  for(const format of ['ascii','binary','png','webm']){
    const build=['ascii','binary'].includes(format),q=await call(build?'candidate.build':'preview.request',{projectId:p.id,revision:p.revision,...(build?{modelName:'vd_essence01',profileId:`nwn-ee-beam-${format}-experimental-v1`}:{format,time:1.4,camera:{position:[4,-4,3],target:[0,1.5,1.2],fov:39}})},'finite-essence-diagnostic-'+format+'-v1');
    await app.studio.drainJobs();const j=await call('jobs.get',{jobId:q.id});assert.equal(j.status,'succeeded',JSON.stringify(j.error));
    const folder=join(out,format);await mkdir(folder,{recursive:true});
    for(const artifact of j.artifacts)await downloadArtifact(artifact,join(folder,artifact.fileName),true,options);
    report.jobs.push({id:j.id,projectId:j.projectId,revision:j.revision,metadata:j.metadata,artifacts:j.artifacts.map((a:any)=>({id:a.id,name:a.fileName,sha256:a.sha256,size:a.size,path:join(folder,a.fileName)}))});
    await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({format,job:j.id,artifacts:j.artifacts.length}));
  }
  report.passed=true;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
}finally{await app.close();}
