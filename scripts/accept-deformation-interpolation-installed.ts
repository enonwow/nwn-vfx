import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,hash} from '../apps/service/src/store.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {interpolationFixture} from '../tests/fixtures/deformation-interpolation.js';

const root=resolve(import.meta.dirname,'..'),out=join(root,'output/releases/0.23.0'),consumer='C:/Projects/the last city';await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs'),run=promisify(execFile);
async function call(args:string[]){const r=await run(process.execPath,[cli,'--json',...args],{cwd:consumer,windowsHide:true,maxBuffer:32*1024*1024});const value=JSON.parse(r.stdout);assert.notEqual(value.status,'failed',JSON.stringify(value.error));return value.data;}
const report:any={version:'0.23.0',consumerCwd:consumer,nativeVerified:false,projects:[],jobs:[]};
report.doctor=await call(['doctor']);report.capabilities=await call(['capabilities']);assert(report.capabilities.documentSchemaVersions.includes(14));assert.equal(report.capabilities.meshDeformation.interpolationSelection.minimumStudioVersion,'0.23.0');
const legacy=JSON.parse((await readFile(join(root,'output/duration-legacy-reference.json'),'utf8')).replace(/^\uFEFF/,''));
const old=buildCandidate(legacy.data.document,'metric_probe');const expected:Record<string,string>={'metric_probe.mdl':'6b69b4bed8dff1316822c5cfa334a2113da7e00be3ad8dc539592f0534c77d7b','metric_probe.hak':'b27ad9af4305cacae525be2105812012511aff0e474aff7a27b3464f9750c67f','vfx_b78bb1191df6.tga':'57dd82303a6a5a4a790431efa248c10a1a11885cac2aaef8243dd94e96e773b0','vfx_b78bb1191df6.txi':'9b26a0cf7d00deb3b749e47c17cc74cd73c6c411a5ea88705e5483822a3e57e6'};
for(const [name,sha] of Object.entries(expected))assert.equal(hash(old.files.find(f=>f.name===name)!.data),sha);report.legacyResourceHashes=expected;
async function download(artifact:any,folder:string){await mkdir(folder,{recursive:true});const path=join(folder,artifact.fileName);await call(['artifacts','get',artifact.id,'--out',path,'--overwrite']);const bytes=await readFile(path);assert.equal(hash(bytes),artifact.sha256);assert.equal(bytes.length,artifact.size);return {name:artifact.fileName,path,sha256:hash(bytes),bytes:bytes.length,artifactId:artifact.id};}
async function job(args:string[],folder:string){const queued=await call(args);const done=await call(['jobs','wait',queued.id,'--timeout','60s']);assert.equal(done.status,'succeeded',JSON.stringify(done.error));const files=[];for(const a of done.artifacts)files.push(await download(a,folder));report.jobs.push({id:done.id,projectId:done.projectId,revision:done.revision,metadata:done.metadata,files});console.log(JSON.stringify({job:done.id,project:done.projectId,type:done.type,files:files.length}));await writeFile(join(out,'installed-acceptance-progress.json'),JSON.stringify(report,null,2));return done;}
for(const name of ['fixture','r6']){
  const folder=join(out,name);await mkdir(folder,{recursive:true});
  const doc=name==='fixture'?interpolationFixture():JSON.parse(await readFile(join(out,'r6-isolated-source.json'),'utf8'));
  const initial=structuredClone(doc);for(const l of initial.layers)delete l.deformationInterpolation;initial.schemaVersion=13;
  const sourcePath=join(folder,'initial.json'),changesPath=join(folder,'changes.json');await writeFile(sourcePath,JSON.stringify(initial));
  const changes=doc.layers.map((l:any)=>({type:'layer.set',layerId:l.id,values:{deformationInterpolation:l.deformationInterpolation}}));await writeFile(changesPath,JSON.stringify(changes));
  const projectId=`studio-interpolation-0230-${name}`;
  let p=await call(['projects','import','--project',projectId,'--file',sourcePath,'--idempotency-key',`${projectId}-import`]);
  const baseChange=['--project',p.id,'--expected-revision',String(p.revision),'--input-file',changesPath];
  const proposal=await call(['changes','preview',...baseChange]);assert.equal(canonical(proposal.document),canonical(doc));
  p=await call(['changes','apply',...baseChange,'--idempotency-key',`${projectId}-apply`]);assert.equal(canonical(p.document),canonical(doc));
  report.projects.push({id:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document))});const base=['--project',p.id,'--revision',String(p.revision)];
  const zip=await call(['projects','export',...base,'--idempotency-key',`${projectId}-zip`]);await download(zip.artifact,folder);
  const cameraFile=join(folder,'camera.json');await writeFile(cameraFile,JSON.stringify({position:[0,-6,1.2],target:[0,0,1.2],fov:39}));
  for(const format of ['ascii','binary'])await job(['candidate','build',...base,'--model-name',`interp_${name}`,'--profile',`nwn-ee-duration-${format}-experimental-v1`,'--idempotency-key',`${projectId}-${format}`],join(folder,format));
  await job(['preview','request',...base,'--time','0.35','--camera-file',cameraFile,'--idempotency-key',`${projectId}-png`],join(folder,'png'));
  if(name==='r6')await job(['preview','request',...base,'--format','webm','--cycles','2','--camera-file',cameraFile,'--idempotency-key',`${projectId}-webm`],join(folder,'video'));
}
for(const p of report.projects){const current=await call(['projects','inspect','--project',p.id]);assert.equal(current.revision,p.revision);assert.equal(hash(canonical(current.document)),p.snapshotSha256);}
report.passed=true;await writeFile(join(out,'installed-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,projects:report.projects,jobs:report.jobs.length,nativeVerified:false}));
