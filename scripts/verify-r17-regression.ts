import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyCompiledRoundtrip} from '../packages/nwn-format/src/compiled-readback.js';
import {verifyBinaryNormals} from '../packages/nwn-format/src/binary-normals.js';
import {buildCompiledCandidate} from '../packages/nwn-format/src/compiled-candidate.js';

// Diagnostic files were produced from our public fork, never the consumer's
// project. Revalidate unchanged old compiler output before making a new build.
const out=resolve('output/ugryzienie-02/r17-regression');
const source=readFileSync(join(out,'source.mdl')),binary=readFileSync(join(out,'compiled.mdl')),
  roundtrip=readFileSync(join(out,'roundtrip.mdl'));
const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const before=JSON.parse(readFileSync(join(out,'diagnosis.json'),'utf8'));
assert.equal(hash(source),before.sourceMdlSha256);assert.equal(hash(binary),before.binaryMdlSha256);
const proof=verifyCompiledRoundtrip(source,roundtrip),normals=verifyBinaryNormals(source,binary);
const fork=JSON.parse(readFileSync(join(out,'fork.json'),'utf8'));
const result=await buildCompiledCandidate(fork.document,'ugryz17_diag');
assert.equal(result.validation.compilation!.sourceMdlSha256,before.sourceMdlSha256);
assert.equal(result.validation.compilation!.roundtripVerified,true);
assert.equal(result.validation.nativeVerified,false);
const report={passed:true,projectId:fork.id,revision:fork.revision,unchangedBytes:{sourceMdlSha256:hash(source),binaryMdlSha256:hash(binary),roundtripMdlSha256:hash(roundtrip),proof,normals},freshBuild:result.validation};
writeFileSync(join(out,'local-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,projectId:fork.id,revision:fork.revision,unchangedBytes:report.unchangedBytes,freshBuildCompilation:result.validation.compilation}));
