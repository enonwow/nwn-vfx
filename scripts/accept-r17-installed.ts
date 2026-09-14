import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {STUDIO_VERSION} from '../packages/core/src/model.js';
import {verifyCompiledRoundtrip} from '../packages/nwn-format/src/compiled-readback.js';
import {verifyBinaryNormals} from '../packages/nwn-format/src/binary-normals.js';

const run=promisify(execFile),root=resolve('output/ugryzienie-02/r17-regression'),out=join(root,'installed');
await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/dist/node/cli.js');
const call=async(args:string[])=>{
  const {stdout}=await run(process.execPath,[cli,'--json',...args],{cwd:'C:/Projects/the last city',windowsHide:true,timeout:45000,maxBuffer:64*1024*1024});
  const response=JSON.parse(stdout);assert.notEqual(response.status,'failed',JSON.stringify(response.error));return response.data;
};
const save=(name:string,value:unknown)=>writeFile(join(out,name),JSON.stringify(value,null,2));
const fork=JSON.parse(await readFile(join(root,'fork.json'),'utf8'));
const version=await call(['version']),status=await call(['service','status']);
assert.equal(version.cliVersion,STUDIO_VERSION);assert.equal(status.version,STUDIO_VERSION);
await save('discovery.json',{version,status});
const before=await call(['projects','inspect','--project',fork.id]);assert.equal(before.revision,1);
const accepted=await call(['candidate','build','--project',fork.id,'--revision','1',
  '--profile','nwn-ee-impact-binary-experimental-v1','--idempotency-key','studio-ugryzienie02-r17-patch0121-001']);
await save('accepted.json',accepted);
const job=await call(['jobs','wait',accepted.id,'--timeout','30s']);await save('job.json',job);
assert.equal(job.status,'succeeded',JSON.stringify(job.error));
assert.equal(job.metadata.validation.exporterVersion,'nwn-binary-vfx-0.12.1');
assert.equal(job.metadata.validation.nativeVerified,false);
for(const artifact of job.artifacts){
  assert.equal(basename(artifact.name),artifact.name);
  const target=join(out,artifact.name);await call(['artifacts','get',artifact.id,'--out',target]);
  const bytes=await readFile(target);assert.equal(bytes.length,artifact.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);
}
const source=await readFile(join(out,'source-model.mdl.txt')),roundtrip=await readFile(join(out,'compiled-roundtrip.mdl.txt')),
  binary=await readFile(join(out,`${job.metadata.modelName}.mdl`));
const proof=verifyCompiledRoundtrip(source,roundtrip),normals=verifyBinaryNormals(source,binary);
assert.deepEqual(await call(['projects','inspect','--project',fork.id]),before);
const report={passed:true,version:STUDIO_VERSION,projectId:fork.id,revision:1,jobId:job.id,
  artifacts:job.artifacts.length,allArtifactHashesVerified:true,proof,normals,nativeVerified:false};
await save('report.json',report);console.log(JSON.stringify(report));
