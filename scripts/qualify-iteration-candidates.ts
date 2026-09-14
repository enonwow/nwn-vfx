import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
const root=resolve(process.argv[2]??'output/iteration-lab/2026-09-10/qualified');
const handoff=JSON.parse(await readFile(join(root,'handoff.json'),'utf8')),run=promisify(execFile);
const call=async(args:string[])=>{const r=JSON.parse((await run(process.execPath,[handoff.cli,'--config',handoff.configPath,'--json',...args],{maxBuffer:32*1024*1024})).stdout);if(r.status==='failed')throw Error(JSON.stringify(r.error));return r.data;};
const job=await call(['jobs','get',handoff.jobId]),artifact=job.artifacts.find((a:any)=>a.name==='diagnostic.zip');
const bytes=await readFile(join(root,'diagnostic.zip'));if(createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)throw Error('Root SHA mismatch');
const files=unzipSync(bytes),manifest=JSON.parse(Buffer.from(files['diagnostic-manifest.json']).toString()),rows:any[]=[];
const before=await call(['jobs','list','--project',handoff.sources.v10.projectId]);
for(const variant of manifest.variants){
  const input={projectId:variant.project.projectId,revision:variant.project.revision,candidateId:job.id},path=join(root,'inputs',`analyze-${variant.id}.json`);
  await writeFile(path,JSON.stringify(input));const analyzed=await call(['workflow','analyze','--input-file',path]);
  await writeFile(join(root,`analysis-${variant.id}.json`),JSON.stringify(analyzed,null,2));
  if(analyzed.detail.findings.some((f:any)=>f.severity==='error'))throw Error('Analyzer errors in '+variant.id);
  if(analyzed.detail.candidate.candidateSha256!==variant.candidate.sha256)throw Error('Candidate identity mismatch');
  rows.push({variantId:variant.id,project:variant.project,candidateSha256:variant.candidate.sha256,exportDifferences:variant.exportDifferences.length,models:analyzed.detail.exported.models.map((m:any)=>m.file),compiledReadback:analyzed.detail.exported.readback.available});
}
const baseline=manifest.variants[0].project,subject=manifest.variants[1].project,comparePath=join(root,'inputs','compare-existing.json');
await writeFile(comparePath,JSON.stringify({projectId:subject.projectId,revision:subject.revision,candidateId:job.id,baseline:{projectId:baseline.projectId,revision:baseline.revision},baselineCandidateId:job.id}));
const comparison=await call(['workflow','compare','--input-file',comparePath]);await writeFile(join(root,'comparison-existing.json'),JSON.stringify(comparison,null,2));
const after=await call(['jobs','list','--project',handoff.sources.v10.projectId]);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Read operations changed jobs');
const result={instanceId:handoff.instanceId,workspaceId:handoff.workspaceId,jobId:job.id,artifactId:artifact.id,sha256:artifact.sha256,size:artifact.size,rows,noAdditionalBuild:true,nativeVerified:false};
await writeFile(join(root,'candidate-qualification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
