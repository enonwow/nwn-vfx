import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { unzipSync } from 'fflate';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { canonical } from '../apps/service/src/store.js';
import { makeMeshLayer, type Change } from '../packages/core/src/model.js';
import { orientationTexture } from '../tests/fixtures/rgba-texture.js';

// Uses the actual compiled CLI from the consumer cwd, but only an owned isolated
// service/fixture. It cannot select or mutate tlc-wyrok or the browser's draft.
const cwd = resolve('C:/Projects/the last city'), root = resolve(import.meta.dirname, '..');
const parent = join(root, 'output', 'textures-cli-acceptance'); await mkdir(parent, {recursive:true});
const out = await mkdtemp(join(parent, 'run-')), dataDir = join(out, 'instance');
const port = 14344, origin = `http://127.0.0.1:${port}`, cli = join(root, 'dist/node/cli.js');
const app = await createApp({dataDir,port,webDir:join(root,'dist/web'),render:createRenderer(origin)});
await app.listen({host:'127.0.0.1',port});
const sha = (bytes: Uint8Array|string) => createHash('sha256').update(bytes).digest('hex');
const env = {...process.env, NWN_VFX_CONFIG:join(dataDir,'config.json')};
for (const key of ['NWN_VFX_TOKEN','NWN_VFX_ENDPOINT','NWN_VFX_WORKSPACE','NWN_VFX_DATA_DIR']) delete env[key as keyof typeof env];
const commands: Array<{args:string[];status:string;operationId?:string}> = [];
async function call(...args: string[]) {
  const child = spawn(process.execPath,[cli,'--json',...args],{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const exitCode = await new Promise<number|null>((done,reject)=>{child.on('error',reject);child.on('close',done);});
  let response:any;try{response=JSON.parse(stdout.trim());}catch{throw new Error(`CLI did not return JSON (${exitCode}): ${stderr}`);}
  commands.push({args,status:response.status,...(response.operationId?{operationId:response.operationId}:{})});
  assert.equal(exitCode,0,JSON.stringify(response.error));assert.notEqual(response.status,'failed',JSON.stringify(response.error));return response.data;
}
const mutation = () => ['--idempotency-key',randomUUID()];
async function download(artifact:any,path:string) {const data=await call('artifacts','get',artifact.id,'--out',path);assert.equal(data.verifiedSha256,artifact.sha256);return readFile(path);}
try {
  const doctor=await call('doctor');assert.equal(doctor.client.version,'0.4.0');
  const pngPath=join(out,'orientation.png'),png=orientationTexture(64);await writeFile(pngPath,png);
  let project=await call('projects','create','--preset','empty','--name','Texture and lifecycle acceptance',...mutation());
  const imported=await call('assets','import','--project',project.id,'--expected-revision','1','--file',pngPath,...mutation());project=imported.project;
  assert.equal(imported.assetId,sha(png));
  const ref=`asset:${imported.assetId}` as const;
  const ring={...makeMeshLayer('ring','Animated RGBA ring','ring'),texture:ref,blend:'normal' as const,duration:1.2,
    geometry:{kind:'ring' as const,innerRadius:.35,outerRadius:1,segments:48},
    animation:{scale:[{time:0,value:.2},{time:.6,value:1},{time:1.2,value:1.4}],alpha:[{time:0,value:0},{time:.12,value:.85},{time:.8,value:.6},{time:1.2,value:0}]}};
  const panel={...makeMeshLayer('panel','UV orientation panel','custom'),texture:ref,blend:'normal' as const,duration:1.2,position:[-.7,.55,.2] as [number,number,number],
    geometry:{kind:'custom' as const,vertices:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]] as [number,number,number][],faces:[[0,1,2],[0,2,3]] as [number,number,number][],uv:[[1,1],[0,1],[0,0],[1,0]] as [number,number][],uvFaces:[[2,3,0],[2,0,1]] as [number,number,number][]},
    animation:{alpha:[{time:0,value:0},{time:.05,value:1},{time:1.15,value:1},{time:1.2,value:0}]}};
  const changes:Change[]=[{type:'project.set',values:{duration:1.2}},{type:'layer.set',layerId:'sparks',values:{name:'RGBA particle lifecycle',texture:ref,blend:'additive',count:12,start:.05,duration:.1,life:1,speed:.3,spread:1.1,gravity:.2,position:[.65,0,.4],color:'#fff0cc',midColor:'#ffffff',endColor:'#aaccff',alpha:0,midAlpha:.8,endAlpha:0,size:.06,midSize:.3,endSize:.5,midPercent:.35}},{type:'layer.add',layer:ring},{type:'layer.add',layer:panel}];
  const patch=join(out,'changes.json');await writeFile(patch,JSON.stringify(changes,null,2));
  await call('changes','preview','--project',project.id,'--expected-revision','2','--input-file',patch);
  project=await call('changes','apply','--project',project.id,'--expected-revision','2','--input-file',patch,...mutation());
  await writeFile(join(out,'project.json'),JSON.stringify(project,null,2));
  const snapshot=sha(canonical(project.document)),jobs:any[]=[],handoffs:any[]=[];
  for (const format of ['png','webm','candidate']) {
    const accepted=format==='candidate'?await call('candidate','build','--project',project.id,'--revision',String(project.revision),...mutation()):await call('preview','request','--project',project.id,'--revision',String(project.revision),'--time','.4','--format',format,...mutation());
    const job=await call('jobs','wait',accepted.id,'--timeout','90s');jobs.push(job);
    const handoff=JSON.parse((await download(job.artifacts.find((a:any)=>a.name==='handoff.json'),join(out,`${format}-handoff.json`))).toString('utf8'));
    assert.equal(handoff.snapshotSha256,snapshot);assert.equal(handoff.assets[0].id,imported.assetId);handoffs.push(handoff);
    const name=format==='candidate'?'candidate.zip':`preview.${format}`;
    const bytes=await download(job.artifacts.find((a:any)=>a.name===name),join(out,name));
    if(format==='candidate') {
      const files=unzipSync(bytes),validation=JSON.parse(Buffer.from(files['validation.json']).toString('utf8'));
      assert.equal(validation.nativeVerified,false);assert.equal(validation.assets[0].id,imported.assetId);
      assert.ok(validation.readback.meshes.length === 2 && validation.readback.meshes.every((mesh:any)=>typeof mesh.texture==='string' && mesh.texture.length > 0 && mesh.uv.length>0));
      assert.equal(validation.readback.layers[0].percentMid,.35);assert.equal(validation.readback.layers[0].alphaMid,.8);assert.equal(validation.readback.layers[0].sizeMid,.3);
      const extracted=join(out,'candidate');await mkdir(extracted);for(const [name,data] of Object.entries(files)){assert.match(name,/^[a-zA-Z0-9_.-]+$/);await writeFile(join(extracted,name),data);}
    }
  }
  const portable=await call('projects','export','--project',project.id,'--revision',String(project.revision),'--out',join(out,'studio-project.zip'),...mutation());
  const restored=await call('projects','import','--file',join(out,'studio-project.zip'),...mutation());assert.deepEqual(restored.document,project.document);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_streams','-show_format','-of','json',join(out,'preview.webm')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}));
  const pts=probe.frames.map((frame:any)=>Number(frame.best_effort_timestamp_time));assert.equal(pts.length,36);
  pts.forEach((time:number,index:number)=>assert.ok(Math.abs(time-index/30)<=.001));
  const report={version:'0.4.0',projectId:project.id,revision:project.revision,assetId:imported.assetId,snapshotSha256:snapshot,consumerCwd:cwd,origin,portableRoundTrip:true,
    video:{frames:pts.length,duration:probe.format.duration,maxGap:Math.max(...pts.slice(1).map((time:number,index:number)=>time-pts[index]))},jobs,commands,portable,nativeVerified:false};
  await writeFile(join(out,'ffprobe.json'),JSON.stringify(probe,null,2));await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  await writeFile(join(parent,'latest.json'),JSON.stringify({directory:out,report:join(out,'report.json')},null,2));
  process.stdout.write(JSON.stringify({directory:out,projectId:project.id,assetId:imported.assetId,snapshotSha256:snapshot,video:report.video})+'\n');
} finally {await app.close();}
