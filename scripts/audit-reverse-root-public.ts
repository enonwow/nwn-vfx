import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
const out=resolve('output/beam-reverse-root-audit/2026-09-10');await mkdir(out,{recursive:true});
const lab=resolve('output/iteration-lab/2026-09-10/qualified'),h=JSON.parse(await readFile(join(lab,'handoff.json'),'utf8')),run=promisify(execFile),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const call=async(args:string[])=>{const r=JSON.parse((await run(process.execPath,[h.cli,'--config',join(lab,'tlc-import-agent.config.json'),'--json',...args],{maxBuffer:16*1024*1024})).stdout);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
const op=async(name:string,input:any,key?:string)=>{const file=join(out,`${key??name}.json`);await writeFile(file,JSON.stringify(input,null,2));return call(['operations','call',name,'--input-file',file,...(key?['--idempotency-key',key]:[])]);};
const evidenceRoot='C:/Projects/New Folder/beam-reverse-audit-2026-09-10',evidence=JSON.parse(await readFile(join(evidenceRoot,'verification.json'),'utf8')),inputs=JSON.parse(await readFile(join(evidenceRoot,'inputs.json'),'utf8'));
for(const f of [...inputs.inputs,...evidence.files]){const bytes=await readFile(f.path);assert.equal(sha(bytes),f.sha256);assert.equal(bytes.length,f.bytes??f.size);}
const baseline=await call(['projects','inspect','--project','tlc-v10-028-qualified','--revision','1']),variants:any[]=[];
for(const [label,direction] of [['forward','source-to-target'],['reverse','target-to-source']]){
  const fork=await op('projects.fork',{projectId:baseline.id,revision:baseline.revision,name:'Reverse root audit',newProjectId:`studio-reverse-root-${label}`},`reverse-root-${label}-fork`);
  const changes=fork.document.layers.filter((l:any)=>l.beamBinding).map((l:any)=>({type:'layer.set',layerId:l.id,values:{beamBinding:{...l.beamBinding,direction}}}));
  const p=await op('changes.apply',{projectId:fork.id,expectedRevision:fork.revision,changes},`reverse-root-${label}-direction`);
  const job=await op('candidate.build',{projectId:p.id,revision:p.revision,profileId:p.document.profileId,modelName:'vreverseproof'},`reverse-root-${label}-candidate`);
  const done=await call(['jobs','wait',job.id,'--timeout','30s']);const artifact=done.artifacts.find((a:any)=>a.name==='candidate.zip');const local=join(out,`${label}-candidate.zip`);
  await call(['artifacts','get',artifact.id,'--out',local,'--overwrite']);const bytes=await readFile(local);assert.equal(sha(bytes),artifact.sha256);const files=unzipSync(bytes);
  const flow=JSON.parse(Buffer.from(files['beam-flow.json']).toString()),integration=JSON.parse(Buffer.from(files['vfx-integration.json']).toString());
  assert.equal(integration.schemaVersion,6);assert.equal(integration.beam.progfx2da.columns.Param6,'cast01');assert(!('Param2' in integration.beam.progfx2da.columns));
  const resources=Object.entries(files).filter(([name])=>/\.(mdl|tga|txi)$/.test(name)).map(([name,data])=>({name,sha256:sha(data),size:data.length})).sort((a,b)=>a.name.localeCompare(b.name));
  const analyzed=await op('workflow.analyze',{projectId:p.id,revision:p.revision,candidateId:job.id});assert(!analyzed.detail.findings.some((f:any)=>f.severity==='error'));
  variants.push({label,projectId:p.id,revision:p.revision,jobId:job.id,artifactId:artifact.id,candidateSha256:artifact.sha256,sourceSnapshotSha256:integration.snapshotSha256,flowDirection:flow.direction,nativeObjects:flow.nativeObjects,progfx:integration.beam.progfx2da.columns,resources,readback:true});
}
assert.deepEqual(variants[0].resources,variants[1].resources);
assert.deepEqual(await call(['projects','inspect','--project',baseline.id,'--revision','1']),baseline);
const result={kind:'public-export-and-offline-audit-not-native-test',status:'passed',studioVersion:'0.28.0',instanceId:h.instanceId,workspaceId:h.workspaceId,baselineProject:baseline.id,baselineUnchanged:true,evidenceFilesVerified:evidence.files.length,sourceFilesVerified:inputs.inputs.length,retailElfSha256:inputs.inputs[0].sha256,variants,resourceBytesIdenticalAcrossDirections:true,reverseAtFixedCasterHandRootSupported:false,scope:'Current finite Fountain/P2PBezier profile and audited standard EffectBeam path; not a proof of impossibility for every engine extension or unqualified architecture.',nativeVerified:false};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
