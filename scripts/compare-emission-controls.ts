import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readAsciiMdl,readHak} from '../packages/nwn-format/src/index.js';
import {readEmissionTiming} from '../packages/nwn-format/src/emission-readback.js';

const out=resolve('output/releases/0.21.1'),hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const load=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const before=await load(join(out,'before/acceptance.json')),after=await load(join(out,'after/acceptance.json')),pairs=[];
for(const old of before.fixtures){
  const next=after.fixtures.find((f:any)=>f.kind===old.kind);assert.ok(next);
  assert.equal(next.projectId,old.projectId);assert.equal(next.revision,old.revision);assert.equal(next.snapshotSha256,old.snapshotSha256);
  const oldDoc=await readFile(join(old.directory,'effect-document.json')),newDoc=await readFile(join(next.directory,'effect-document.json'));assert.deepEqual(newDoc,oldDoc);
  const oldSource=await readFile(join(old.directory,'source-model.mdl.txt')),newSource=await readFile(join(next.directory,'source-model.mdl.txt'));
  const normalized=(bytes:Uint8Array,name:string)=>{const p=readAsciiMdl(new TextDecoder().decode(bytes).replaceAll(name,'control_model'));
    for(const n of [...p.nodes,...p.animations.flatMap(a=>a.nodes)]){delete n.properties.birthrate;delete n.tracks.birthrate;}return p;};
  assert.deepEqual(normalized(oldSource,old.modelName),normalized(newSource,next.modelName));
  const dependencies=async(f:any)=>readHak(await readFile(join(f.directory,f.modelName+'.hak'))).filter(r=>!r.name.endsWith('.mdl')).map(r=>({name:r.name,sha256:hash(r.data)}));
  assert.deepEqual(await dependencies(old),await dependencies(next));
  const timing=readEmissionTiming(newSource);assert.equal(timing.policy,'constant-single-event');assert.equal(timing.experiment.allScenariosPreserveEventCounts,true);
  pairs.push({kind:old.kind,projectId:old.projectId,revision:old.revision,snapshotSha256:old.snapshotSha256,documentSha256:hash(newDoc),documentBytesUnchanged:true,
    mdlChangesOnlyBirthrateAndModelIdentity:true,textureDependenciesUnchanged:true,intendedParticles:timing.experiment.scenarios[0].intendedParticles,
    old:{modelName:old.modelName,jobId:old.jobId,directory:old.directory,modelSha256:hash(await readFile(join(old.directory,old.modelName+'.mdl')))},
    new:{modelName:next.modelName,jobId:next.jobId,directory:next.directory,modelSha256:hash(await readFile(join(next.directory,next.modelName+'.mdl')))},
    oldTiming:readEmissionTiming(oldSource),newTiming:timing});
}
const proof={passed:true,nativeVerified:false,pairs};await writeFile(join(out,'controlled-comparison.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({passed:true,pairs:pairs.map(p=>({kind:p.kind,count:p.intendedParticles,snapshot:p.snapshotSha256,old:p.old,new:p.new}))},null,2));
