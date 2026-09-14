import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {execute,downloadArtifact,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';

const before=process.argv.includes('--before'),version=before?'0.21.0':'0.21.1';
const out=resolve('output/releases/0.21.1'),stage=join(out,before?'before':'after');await mkdir(stage,{recursive:true});
const service=await health(await connection({}));assert.equal(service.version,version);
const call=async(op:string,input:Record<string,unknown>,key?:string)=>{const r=await execute(op,input,{},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data as any;};
const fixturesPath=join(out,'fixtures.json');let fixtures:any[];
if(before){
  const smoke=await call('projects.fork',{projectId:'tlc-wampir-skok-start',revision:8,newProjectId:'studio-smoke-single-0211',name:'Kontrola emisji — dym, wspólny start'},'emission-0211-smoke-fork');
  const smokeEdit=await call('changes.apply',{projectId:smoke.id,expectedRevision:smoke.revision,
    changes:smoke.document.layers.filter((l:any)=>l.enabled&&l.type==='emitter'&&l.update==='Explosion').map((l:any)=>({type:'layer.set',layerId:l.id,values:{start:0}}))},'emission-0211-smoke-start');
  const probe=await call('projects.create',{projectId:'studio-emission-probe-0211',name:'Kontrola emisji — 70 jasnych cząstek',preset:'empty'},'emission-0211-probe-create');
  const probeEdit=await call('changes.apply',{projectId:probe.id,expectedRevision:probe.revision,changes:[{type:'layer.set',layerId:probe.document.layers[0].id,
    values:{start:0,count:70,texture:'glow',blend:'additive',position:[0,0,1],size:.35,endSize:.1,alpha:1,endAlpha:0,color:'#ffffff',endColor:'#80cfff',life:1,speed:1,spread:1,gravity:0,scale:1}}]},'emission-0211-probe-edit');
  const atlas=await call('projects.fork',{projectId:'tlc-wampir-skok-start',revision:8,newProjectId:'studio-emission-atlas-0211',name:'Kontrola emisji — jedna cząstka atlasu'},'emission-0211-atlas-fork');
  const layer=atlas.document.layers.find((l:any)=>l.enabled&&l.type==='emitter'&&l.flipbook);
  assert.ok(layer);
  const atlasEdit=await call('changes.apply',{projectId:atlas.id,expectedRevision:atlas.revision,changes:atlas.document.layers.map((l:any)=>({type:'layer.set',layerId:l.id,
    values:l.id===layer.id?{start:0,count:1,position:[0,0,1],size:1.5,midSize:1.5,endSize:1.5,alpha:1,midAlpha:1,endAlpha:0,color:'#ffffff',midColor:'#ffffff',endColor:'#ffffff',life:1.3,speed:0,gravity:0,scale:1}:{enabled:false}}))},'emission-0211-atlas-edit');
  fixtures=[['smoke',smokeEdit],['probe',probeEdit],['atlas',atlasEdit]].map(([kind,p]:any)=>({kind,projectId:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document))}));
  await writeFile(fixturesPath,JSON.stringify(fixtures,null,2));
}else fixtures=JSON.parse(await readFile(fixturesPath,'utf8'));
const cli='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs';
const global=(args:string[])=>{const r=JSON.parse(execFileSync(process.execPath,[cli,'--json',...args],{cwd:'C:/Projects/the last city',windowsHide:true,encoding:'utf8',timeout:150000}));assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
const results=[];
for(const fixture of fixtures){
  const p=await call('projects.inspect',{projectId:fixture.projectId});assert.equal(p.revision,fixture.revision);assert.equal(hash(canonical(p.document)),fixture.snapshotSha256);
  const dir=join(stage,fixture.kind);await mkdir(dir,{recursive:true});
  const name=`sm${before?'old':'new'}_${fixture.kind}`;
  const request={projectId:p.id,revision:p.revision,modelName:name,profileId:'nwn-ee-impact-binary-experimental-v1'};
  const job=global(['candidate','build','--project',p.id,'--revision',String(p.revision),'--model-name',name,'--profile',request.profileId,'--idempotency-key',`emission-0211-${before?'old':'new'}-${fixture.kind}`]);
  const done=global(['jobs','wait',job.id,'--timeout','120s']);assert.equal(done.status,'succeeded',JSON.stringify(done.error));
  for(const artifact of done.artifacts){await downloadArtifact(artifact,join(dir,artifact.name),true,{});assert.equal(hash(await readFile(join(dir,artifact.name))),artifact.sha256);}
  if(!before){const report=JSON.parse(await readFile(join(dir,'emitter-emission.json'),'utf8'));assert.equal(report.policy,'constant-single-event');assert.equal(report.experiment.allScenariosPreserveEventCounts,true);assert.equal(report.binaryReadback.allEventRecordsRead,true);}
  await writeFile(join(dir,'job.json'),JSON.stringify(done,null,2));await writeFile(join(dir,'request.json'),JSON.stringify(request,null,2));
  results.push({...fixture,modelName:name,jobId:done.id,artifacts:done.artifacts,directory:dir});
}
await writeFile(join(stage,'acceptance.json'),JSON.stringify({passed:true,service,fixtures:results,nativeVerified:false},null,2));
console.log(JSON.stringify({passed:true,version,fixtures:results.map(r=>({projectId:r.projectId,revision:r.revision,model:r.modelName,jobId:r.jobId}))}));
