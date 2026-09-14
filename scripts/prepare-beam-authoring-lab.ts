import assert from 'node:assert/strict';
import {cp,mkdir,readFile,readdir,writeFile,access} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),out=join(root,'output/beam-authoring-lab/2026-09-10-param6');
const runtime=join(out,'runtime'),dataDir=join(root,'output/beam-flow-diagnostic/isolated-service');
const endpoint='http://127.0.0.1:14384',ownerConfig=join(dataDir,'config.json'),agentConfig=join(out,'tlc-agent.config.json');
const consumer='C:/Projects/the last city',run=promisify(execFile),sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
assert(!await access(join(out,'acceptance.json')).then(()=>true,()=>false),'Already handed off: do not rerun provisioning or acceptance against an active authoring lab');
const frozenManifest=join(out,'runtime-manifest.json');
const exists=async(p:string)=>access(p).then(()=>true,()=>false);
if(!await exists(frozenManifest)){
  assert(!await exists(runtime),'Do not overwrite an existing unmanifested runtime');
  await mkdir(runtime);
  for(const path of ['dist','bin','package.json','docs/agents','skills/nwn-vfx'])await cp(join(root,path),join(runtime,path),{recursive:true,force:false,errorOnExist:true});
  const files:Array<{path:string;size:number;sha256:string}>=[];
  async function walk(folder:string){for(const entry of await readdir(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory())await walk(path);else{const bytes=await readFile(path);files.push({path:relative(runtime,path),size:bytes.length,sha256:sha(bytes)});}}}
  await walk(runtime);files.sort((a,b)=>a.path.localeCompare(b.path));
  await writeFile(frozenManifest,JSON.stringify({kind:'frozen isolated authoring runtime; not a global release',version:'0.27.0',integrationVersion:6,
    globalInstall:false,dependencyRoot:join(root,'node_modules'),packageLockSha256:sha(await readFile(join(root,'package-lock.json'))),files},null,2)+'\n');
}
const manifest=JSON.parse(await readFile(frozenManifest,'utf8'));
assert.equal(manifest.packageLockSha256,sha(await readFile(join(root,'package-lock.json'))));
for(const file of manifest.files)assert.equal(sha(await readFile(join(runtime,file.path))),file.sha256,file.path);
const cli=join(runtime,'bin/nwn-vfx.mjs'),env={...process.env,NWN_VFX_DATA_DIR:dataDir};
for(const key of ['NWN_VFX_TOKEN','NWN_VFX_CONFIG','NWN_VFX_ENDPOINT','NWN_VFX_WORKSPACE','NWN_VFX_WEB_DIR'])delete env[key];
let serial=0;
async function command(args:string[],config=ownerConfig){
  try{const r=await run(process.execPath,[cli,'--json','--config',config,'--endpoint',endpoint,...args],{cwd:consumer,env,windowsHide:true,maxBuffer:24*1024*1024});return JSON.parse(r.stdout);}
  catch(error:any){if(error.stdout)return JSON.parse(error.stdout);throw error;}
}
async function raw(operation:string,input:object={},config=ownerConfig,key?:string){
  const path=join(out,`request-${++serial}.json`);await writeFile(path,JSON.stringify(input));
  return command(['operations','call',operation,'--input-file',path,...(key?['--idempotency-key',key]:[])],config);
}
const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
const call=async(operation:string,input:object={},config=ownerConfig,key?:string)=>ok(await raw(operation,input,config,key));
const status=ok(await command(['service','start']));
assert.equal(status.workspaceId,'956bb5be-f64b-415b-8a40-64917ecbee85');
assert.equal(status.instanceId,'41aae96c-5a3a-4390-84f3-637d218df963');assert.equal(status.version,'0.27.0');
const sources=[];
for(const projectId of ['studio-finite-essence-diagnostic','studio-finite-essence-visibility-v10'])sources.push(await call('projects.inspect',{projectId}));
const lab=await call('projects.fork',{projectId:'studio-finite-essence-visibility-v10',revision:3,newProjectId:'tlc-beam-authoring-lab',name:'The Last City - isolated beam authoring'},ownerConfig,'tlc-beam-lab-fork-20260910');
const previousActors=await call('actors.list');
for(const previous of previousActors.items.filter((a:any)=>a.name==='The Last City - isolated beam authoring'&&!a.revoked&&a.projectIds.includes(lab.id)&&!a.scopes.includes('create')))
  await call('actors.revoke',{actorId:previous.id},ownerConfig,'tlc-beam-lab-revoke-incomplete-20260910');
const actor=await call('actors.create',{name:'The Last City - isolated beam authoring v2',projectIds:[lab.id],scopes:['read','create','edit','render','build','export','artifacts','jobs']},ownerConfig,'tlc-beam-lab-actor-v2-20260910');
// The config field is legacy naming: its credential belongs to this restricted
// agent. It is never the owner's token and is not printed or embedded in reports.
const config={endpoint,instanceId:status.instanceId,workspaceId:status.workspaceId,ownerToken:actor.token};
await writeFile(agentConfig,JSON.stringify(config,null,2)+'\n',{mode:0o600});
const doctor=ok(await command(['doctor'],agentConfig));assert.equal(doctor.client.version,'0.27.0');
assert.equal((await call('projects.inspect',{projectId:lab.id},agentConfig)).revision,1);
assert.equal((await raw('projects.inspect',{projectId:'studio-finite-essence-diagnostic'},agentConfig)).error.code,'FORBIDDEN');
assert.equal((await raw('actors.list',{},agentConfig)).error.code,'FORBIDDEN');
assert.equal((await raw('policy.set',{projectId:lab.id,paused:true},agentConfig,'tlc-lab-denied-policy-001')).error.code,'FORBIDDEN');

// Exercise mutation protections only in an additional disposable fork.
let fixture=await call('projects.fork',{projectId:lab.id,newProjectId:'tlc-beam-lab-cli-check',name:'Disposable CLI acceptance'},agentConfig,'tlc-lab-cli-fixture-001');
const mutation={projectId:fixture.id,expectedRevision:fixture.revision,changes:[{type:'layer.set',layerId:'essence',values:{count:145}}]};
await call('changes.preview',mutation,agentConfig);
fixture=await call('changes.apply',mutation,agentConfig,'tlc-lab-cli-count-001');
assert.equal((await call('changes.apply',mutation,agentConfig,'tlc-lab-cli-count-001')).revision,fixture.revision);
assert.equal((await raw('changes.apply',mutation,agentConfig,'tlc-lab-cli-stale-001')).error.code,'REVISION_CONFLICT');
await call('policy.set',{projectId:fixture.id,paused:true},ownerConfig,'tlc-lab-cli-pause-001');
const next={...mutation,expectedRevision:fixture.revision};
assert.equal((await raw('changes.apply',next,agentConfig,'tlc-lab-cli-paused-001')).error.code,'AI_PAUSED');
await call('policy.set',{projectId:fixture.id,paused:false},ownerConfig,'tlc-lab-cli-unpause-001');
fixture=await call('changes.apply',{projectId:fixture.id,expectedRevision:fixture.revision,changes:[{type:'locks.set',locks:[{layerId:'essence',field:'count'}]}]},ownerConfig,'tlc-lab-cli-lock-001');
assert.equal((await raw('changes.apply',{...mutation,expectedRevision:fixture.revision},agentConfig,'tlc-lab-cli-locked-001')).error.code,'LOCKED');
const jobs=[];
for(const format of ['binary','png']){
  const queued=await call(format==='binary'?'candidate.build':'preview.request',{projectId:fixture.id,revision:fixture.revision,...(format==='binary'?{modelName:'vl_cli_check',profileId:'nwn-ee-beam-binary-experimental-v1'}:{format:'png',time:1.4})},agentConfig,'tlc-lab-cli-'+format+'-001');
  const job=ok(await command(['jobs','wait',queued.id,'--timeout','45s'],agentConfig));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
  if(format==='binary')assert.equal(job.metadata.validation.integration.effect.schemaVersion,6);
  const folder=join(out,format);await mkdir(folder,{recursive:true});
  const selected=job.artifacts.filter((a:any)=>['handoff.json','candidate.zip','preview.png'].includes(a.fileName));
  for(const a of selected){const path=join(folder,a.fileName);if(!await exists(path))ok(await command(['artifacts','get',a.id,'--out',path],agentConfig));assert.equal(sha(await readFile(path)),a.sha256);}
  jobs.push({id:job.id,format,status:job.status,downloaded:selected.map((a:any)=>({name:a.fileName,sha256:a.sha256}))});
}
for(const before of sources)assert.deepEqual(await call('projects.inspect',{projectId:before.id}),before);
assert.equal((await call('projects.inspect',{projectId:lab.id},agentConfig)).revision,1);
const proof={passed:true,qualification:'CLI authoring/export/render and permission checks only; not global release or native qualification',
  endpoint,service:status,cli,configPath:agentConfig,actor:{id:actor.id,kind:actor.kind,scopes:actor.scopes,initialProjectIds:[lab.id]},
  lab:{projectId:lab.id,revision:1},fixture:{projectId:fixture.id,revision:fixture.revision},
  checks:['doctor 0.27.0','scoped project read','foreign project denied','actor administration denied','policy administration denied','preview/apply','idempotent retry','revision conflict','AI pause','human field lock','integration6 binary build','PNG render','artifact download hashes','accepted sources unchanged','authoring lab untouched'],jobs,
  runtimeManifest:frozenManifest,runtimeManifestSha256:sha(await readFile(frozenManifest)),serviceLeftRunning:true,globalInstall:false};
await writeFile(join(out,'acceptance.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({passed:true,endpoint,cli,configPath:agentConfig,actorId:actor.id,projectId:lab.id,revision:1,jobs:jobs.map(j=>j.id)}));
