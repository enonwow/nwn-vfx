import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {STUDIO_VERSION} from '../packages/core/src/model.js';
const root=fileURLToPath(new URL('../',import.meta.url)),base=resolve(root,'output/mesh-acceptance');
await mkdir(base,{recursive:true});const output=await mkdtemp(join(base,'run-')),dataDir=join(output,'instance');
const port=14335,origin=`http://127.0.0.1:${port}`;
const app=await createApp({dataDir,port,webDir:resolve(root,'dist/web'),render:createRenderer(origin)});
await app.listen({host:'127.0.0.1',port});
async function owner(operation:string,input:object) {
  const result=(await app.inject({method:'POST',url:'/api/commands',headers:{host:`127.0.0.1:${port}`,authorization:`Bearer ${app.studio.config.ownerToken}`},payload:{operation,input,idempotencyKey:randomUUID()}})).json();
  assert.notEqual(result.status,'failed',JSON.stringify(result.error));return result.data;
}
let actorId:string|undefined;
try {
  const actor=await owner('actors.create',{name:'Mesh CLI acceptance',projectIds:[],scopes:['read','edit','create','export','render','build','jobs','artifacts']});actorId=actor.id;
  const configPath=join(output,'consumer-connection.json');await writeFile(configPath,JSON.stringify({endpoint:origin,instanceId:app.studio.config.instanceId,workspaceId:app.studio.config.workspaceId}));
  const env={...process.env,NWN_VFX_CONFIG:configPath,NWN_VFX_DATA_DIR:dataDir,NWN_VFX_TOKEN:actor.token,NWN_VFX_ENDPOINT:origin,NWN_VFX_WORKSPACE:app.studio.config.workspaceId};
  const cwd=resolve(root,'../the last city'),runFile=promisify(execFile);
  async function cli(args:string[]) {
    const {stdout}=await runFile(process.execPath,[resolve(root,'dist/node/cli.js'),'--json',...args],{cwd,env,windowsHide:true,maxBuffer:8*1024*1024});
    const result=JSON.parse(stdout);assert.notEqual(result.status,'failed',JSON.stringify(result.error));return result.data;
  }
  const doctor=await cli(['doctor']);assert.equal(doctor.client.version,STUDIO_VERSION);
  const project=await cli(['projects','create','--preset','empty','--name','Mesh animation acceptance','--idempotency-key',randomUUID()]);
  const patch=resolve(root,'docs/agents/examples/mesh-impact.changes.json');
  await cli(['changes','preview','--project',project.id,'--expected-revision','1','--input-file',patch]);
  const edited=await cli(['changes','apply','--project',project.id,'--expected-revision','1','--input-file',patch,'--idempotency-key',randomUUID()]);
  assert.equal(edited.document.schemaVersion,2);assert.equal(edited.revision,2);
  const jobs:any[]=[];
  for(const [label,format,time] of [['before','png',.2],['impact','png',.8],['after','png',1.8],['timeline','webm',.8]] as const) {
    const job=await cli(['preview','request','--project',project.id,'--revision','2','--time',String(time),'--format',format,'--idempotency-key',randomUUID()]);
    const done=await cli(['jobs','wait',job.id,'--timeout','30s']);assert.equal(done.status,'succeeded',JSON.stringify(done.error));
    const file=done.artifacts.find((a:any)=>a.name===`preview.${format}`),destination=join(output,`${label}.${format}`);
    await cli(['artifacts','get',file.id,'--out',destination]);
    const bytes=await readFile(destination);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    const handoff=done.artifacts.find((a:any)=>a.name==='handoff.json');
    const handoffPath=join(output,`${label}-handoff.json`);await cli(['artifacts','get',handoff.id,'--out',handoffPath]);
    jobs.push({label,id:done.id,revision:done.revision,status:done.status,artifact:file,path:destination,handoff:JSON.parse(await readFile(handoffPath,'utf8'))});
    process.stdout.write(`${label}: ${done.status}, ${file.size} bytes\n`);
  }
  assert.equal(new Set(jobs.slice(0,3).map(j=>j.artifact.sha256)).size,3,'Three visual phases must differ');
  const build=await cli(['candidate','build','--project',project.id,'--revision','2','--idempotency-key',randomUUID()]);
  const completed=await cli(['jobs','wait',build.id,'--timeout','30s']);assert.equal(completed.status,'succeeded',JSON.stringify(completed.error));
  for(const artifact of completed.artifacts.filter((a:any)=>['candidate.zip','handoff.json','validation.json'].includes(a.name)||a.name.endsWith('.mdl')||a.name.endsWith('.hak'))) {
    await cli(['artifacts','get',artifact.id,'--out',join(output,artifact.name)]);
  }
  const handoff=JSON.parse(await readFile(join(output,'handoff.json'),'utf8'));
  assert.ok(jobs.every(j=>j.handoff.snapshotSha256===handoff.snapshotSha256));
  assert.equal(completed.metadata.validation.readback.meshes.length,2);
  assert.equal(completed.metadata.validation.readback.layers.length,2);
  const report={orderId:'TLC-WYROK-STUDIO-01',version:STUDIO_VERSION,recordedAt:new Date().toISOString(),cwd,instanceId:app.studio.config.instanceId,workspaceId:app.studio.config.workspaceId,
    projectId:project.id,revision:2,actorId,documentSchemaVersion:2,snapshotSha256:handoff.snapshotSha256,jobs,build:completed,nativeVerified:false,output};
  await writeFile(join(output,'acceptance.json'),JSON.stringify(report,null,2));await writeFile(join(base,'latest.json'),JSON.stringify({reportPath:join(output,'acceptance.json'),output},null,2));
  process.stdout.write(`REPORT ${join(output,'acceptance.json')}\n`);
} finally {if(actorId)await owner('actors.revoke',{actorId});await app.close();}
