import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {durationExample} from '../tests/fixtures/duration.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {sampleMeshLayer} from '../packages/core/src/mesh.js';
import {compileMeshDeformation,sampleMeshDeformation} from '../packages/core/src/deformation.js';
import type {MeshLayer} from '../packages/core/src/model.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';

const root=resolve(import.meta.dirname,'..'),out=join(root,'output/releases/0.22.0'),consumer='C:/Projects/the last city';await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs'),run=promisify(execFile);
async function call(args:string[]){const r=await run(process.execPath,[cli,'--json',...args],{cwd:consumer,windowsHide:true,maxBuffer:24*1024*1024});const value=JSON.parse(r.stdout);assert.notEqual(value.status,'failed',JSON.stringify(value.error));return value.data;}
const phases=durationExample(),report:any={version:'0.22.0',consumerCwd:consumer,nativeVerified:false,projects:[],jobs:[],boundaries:{}};
report.doctor=await call(['doctor']);report.capabilities=await call(['capabilities']);assert(report.capabilities.documentSchemaVersions.includes(13));
await writeFile(join(out,'capabilities.json'),JSON.stringify(report.capabilities,null,2));
const seam=(name:keyof typeof phases,t:number)=>{const l=phases[name].layers[0] as MeshLayer;return {pose:sampleMeshLayer(l,t),vertices:sampleMeshDeformation(compileMeshDeformation(l,1),t)};};
assert.deepEqual(seam('opening',1),seam('loop',0));assert.deepEqual(seam('loop',1),seam('closing',0));
report.boundaries={openingToLoop:'exact',loopToClosing:'exact',alpha:1,geometrySha256:hash(canonical((phases.loop.layers[0] as MeshLayer).geometry)),
  arbitraryHalfCycleMismatchMetres:Math.max(...seam('loop',.5).vertices.map((v,i)=>Math.hypot(...v.map((n,j)=>n-seam('closing',0).vertices[i][j]))))};
const legacy=JSON.parse((await readFile(join(root,'output/duration-legacy-reference.json'),'utf8')).replace(/^\uFEFF/,''));
const previous=buildCandidate(legacy.data.document,'metric_probe'),expected:Record<string,string>={'metric_probe.mdl':'6b69b4bed8dff1316822c5cfa334a2113da7e00be3ad8dc539592f0534c77d7b','metric_probe.hak':'b27ad9af4305cacae525be2105812012511aff0e474aff7a27b3464f9750c67f','vfx_b78bb1191df6.tga':'57dd82303a6a5a4a790431efa248c10a1a11885cac2aaef8243dd94e96e773b0','vfx_b78bb1191df6.txi':'9b26a0cf7d00deb3b749e47c17cc74cd73c6c411a5ea88705e5483822a3e57e6'};
for(const [name,sha] of Object.entries(expected))assert.equal(hash(previous.files.find(f=>f.name===name)!.data),sha);
report.legacyResources={projectId:legacy.data.id,revision:legacy.data.revision,snapshotSha256:hash(canonical(legacy.data.document)),unchanged:expected};
async function download(artifact:any,folder:string){await mkdir(folder,{recursive:true});const path=join(folder,artifact.fileName);await call(['artifacts','get',artifact.id,'--out',path,'--overwrite']);const bytes=await readFile(path);assert.equal(hash(bytes),artifact.sha256);assert.equal(bytes.length,artifact.size);return {name:artifact.fileName,path,bytes:bytes.length,sha256:hash(bytes),artifactId:artifact.id};}
async function job(args:string[],folder:string){const queued=await call(args);const done=await call(['jobs','wait',queued.id,'--timeout','30s']);assert.equal(done.status,'succeeded',JSON.stringify(done.error));const files=[];for(const artifact of done.artifacts)files.push(await download(artifact,folder));report.jobs.push({id:done.id,projectId:done.projectId,revision:done.revision,metadata:done.metadata,files});console.log(JSON.stringify({job:done.id,type:done.type,files:files.length}));return done;}
for(const [phase,document] of Object.entries(phases)){
  const folder=join(out,phase);await mkdir(folder,{recursive:true});const source=join(folder,'source.json');await writeFile(source,JSON.stringify(document,null,2));
  const projectId=`studio-dur-0220-${phase}`,p=await call(['projects','import','--project',projectId,'--file',source,'--idempotency-key',`duration-0220-${phase}-import-1`]);assert.equal(canonical(p.document),canonical(document));
  report.projects.push({id:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document)),source});
  const base=['--project',p.id,'--revision',String(p.revision)];
  const exported=await call(['projects','export',...base,'--idempotency-key',`duration-0220-${phase}-zip-1`]);await download(exported.artifact,folder);
  for(const format of ['ascii','binary'])await job(['candidate','build',...base,'--model-name',`dur_${phase}`,'--profile',`nwn-ee-${document.lifecycle}-${format}-experimental-v1`,'--idempotency-key',`duration-0220-${phase}-${format}-1`],join(folder,format));
}
const camera={position:[0,-6,1.2],target:[0,0,1.2],fov:39},cameraFile=join(out,'camera.json');await writeFile(cameraFile,JSON.stringify(camera));
const loop=report.projects.find((p:any)=>p.id.endsWith('-loop'));
await job(['preview','request','--project',loop.id,'--revision',String(loop.revision),'--format','webm','--cycles','3','--camera-file',cameraFile,'--idempotency-key','duration-0220-loop-video-1'],join(out,'loop/video'));
for(const time of ['0','0.5','2'])await job(['preview','request','--project',loop.id,'--revision',String(loop.revision),'--time',time,'--cycles','3','--camera-file',cameraFile,'--idempotency-key',`duration-0220-loop-png-${time.replace('.','_')}-1`],join(out,'loop',`t-${time}`));
const composition={duration:5,format:'webm',camera,referenceGeometry:false,instances:report.projects.map((p:any,i:number)=>({id:['opening','loop','closing'][i],projectId:p.id,revision:p.revision,snapshotSha256:p.snapshotSha256,start:[0,1,4][i],...(i===1?{duration:3}:{}),position:[0,0,0],yawRadians:0}))};
const compositionFile=join(out,'composition.json');await writeFile(compositionFile,JSON.stringify(composition,null,2));
await job(['preview','compose','--input-file',compositionFile,'--idempotency-key','duration-0220-three-phase-video-1'],join(out,'composition'));
for(const p of report.projects){const current=await call(['projects','inspect','--project',p.id]);assert.equal(current.revision,p.revision);assert.equal(hash(canonical(current.document)),p.snapshotSha256);}
report.passed=true;await writeFile(join(out,'installed-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,projects:report.projects.length,jobs:report.jobs.length,nativeVerified:false}));
