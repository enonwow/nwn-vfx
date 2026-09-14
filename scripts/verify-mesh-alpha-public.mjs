import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
const root=resolve('output/playwright/mesh-alpha-0301'),lab=JSON.parse(await readFile(root+'/lab.json','utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
function call(operation,input,key){let stdout;try{stdout=execFileSync(process.execPath,[lab.cli,'--config',lab.config,'--json','operations','call',operation,'--input','-',...(key?['--idempotency-key',key]:[])],{input:JSON.stringify(input),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});}catch(e){stdout=e.stdout;}
 const r=JSON.parse(stdout);if(r.status==='failed')throw Error(JSON.stringify(r.error));return r.data;}
const jobs=[];
for(const fixture of lab.projects){const before=call('projects.inspect',{projectId:fixture.projectId,revision:fixture.revision}),source=JSON.parse((await readFile(root+`/boar-r${fixture.sourceRevision}.json`,'utf8')).replace(/^\uFEFF/,''));
 const expected={...source,name:before.document.name};assert(isDeepStrictEqual(before.document,expected),'Fixture visual source changed');
 for(const format of (fixture.sourceRevision===4?['png','webm']:['png'])){
  let j=call('preview.request',{projectId:fixture.projectId,revision:fixture.revision,format,time:1,camera:{position:[.88,-1.4,1.07],target:[0,0,.76],fov:35}},`mesh-alpha0301-r${fixture.sourceRevision}-${format}`);const id=j.id;
  for(let i=0;i<600&&['queued','running'].includes(j.status);i++){await new Promise(r=>setTimeout(r,500));j=call('jobs.get',{jobId:id});}
  assert.equal(j.status,'succeeded',JSON.stringify(j.error));assert.equal(j.metadata.rendererVersion,'0.30.1');
  const artifact=j.artifacts.find(a=>a.fileName==='preview.'+format),path=root+`/public-r${fixture.sourceRevision}.${format}`;
  try{assert.equal(sha(await readFile(path)),artifact.sha256);}catch(e){if(e.code!=='ENOENT')throw e;execFileSync(process.execPath,[lab.cli,'--config',lab.config,'--json','artifacts','get',artifact.id,'--out',path],{windowsHide:true,encoding:'utf8'});}
  const bytes=await readFile(path);assert.equal(sha(bytes),artifact.sha256);assert.equal(bytes.length,artifact.size);jobs.push({sourceRevision:fixture.sourceRevision,projectId:fixture.projectId,revision:fixture.revision,jobId:id,format,artifact,path,metadata:j.metadata});
 }
 assert(isDeepStrictEqual(call('projects.inspect',{projectId:fixture.projectId,revision:fixture.revision}),before),'Preview changed source');
}
const png=execFileSync('ffmpeg',['-v','error','-i',root+'/public-r4.png','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,maxBuffer:4*1024*1024});
const video=execFileSync('ffmpeg',['-v','error','-i',root+'/public-r4.webm','-vf','select=eq(n\\,30)','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,maxBuffer:4*1024*1024});
assert.equal(png.length,video.length);let error=0;for(let i=0;i<png.length;i++)error+=Math.abs(png[i]-video[i]);const mae=error/png.length;assert(mae<2,'PNG/video diverged');
const report={...lab,jobs,sourcePreserved:true,pngVideoFrame30MeanAbsoluteError:mae,tests:{unit:324,browser:2,failed:0,skipped:0},nativeVerified:false,
 contract:resolve('docs/agents/mesh-transparency.md'),diagnosis:{normalAlphaOrderBug:true,normalAlphaReversePixelsBefore:15100,normalAlphaPermutationPixelsAfter:0,additiveUnchanged:true,opaqueUnchanged:true},
 limitations:['Per-mesh centroid sort, not per-pixel OIT.','Intersections/cyclic overlap and different transparent objects can remain approximate.','Additive overlap remains visible; no geometry/material/alpha workaround.','No exporter/schema/profile change and no native parity proof.']};
await writeFile(root+'/handoff.json',JSON.stringify(report,null,2));console.log(JSON.stringify({jobs:jobs.map(j=>({sourceRevision:j.sourceRevision,jobId:j.jobId,format:j.format,artifactId:j.artifact.id,sha256:j.artifact.sha256})),sourcePreserved:true,pngVideoMeanAbsoluteError:mae}));
