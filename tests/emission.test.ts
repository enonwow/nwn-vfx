import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument,makeLayer} from '../packages/core/src/model.js';
import {buildCandidate,readAsciiMdl,numeric} from '../packages/nwn-format/src/index.js';
import {readEmissionTiming} from '../packages/nwn-format/src/emission-readback.js';
import {readBinaryEmission,verifyBinaryEmission} from '../packages/nwn-format/src/binary-emission.js';
import {binaryCompilerAvailable,buildCompiledCandidate} from '../packages/nwn-format/src/compiled-candidate.js';
import {validateOperationOutput} from '../packages/contracts/src/schema.js';

for(const start of [0,.317])test(`single global burst at ${start}: constant count survives pre/post-frame sampling without moving the event`,()=>{
  const doc={...makeDocument('empty'),duration:2,layers:[{...makeLayer('a'),start,count:1},{...makeLayer('b'),start,count:37},
    {...makeLayer('zero'),start,count:0},{...makeLayer('disabled'),start:.01,enabled:false}]};
  const original=JSON.stringify(doc),built=buildCandidate(doc,'constant_burst'),source=built.files.find(f=>f.name==='constant_burst.mdl')!.data;
  const parsed=readAsciiMdl(source),proof=readEmissionTiming(source);
  assert.equal(JSON.stringify(doc),original);
  assert.deepEqual(parsed.animations[0].events,[{time:start,name:'detonate'}]);
  assert.deepEqual(parsed.nodes.filter(n=>n.type==='emitter').map(n=>numeric(n,'birthrate')),[1,37,0]);
  assert.equal(proof.policy,'constant-single-event');
  assert.equal(proof.experiment.allScenariosPreserveEventCounts,true);
  assert.equal(proof.experiment.scenarios.length,24);
  for(const sample of proof.experiment.scenarios){assert.equal(sample.intendedParticles,38);assert.equal(sample.sampledAtOwnEvents,38);assert.equal(sample.foreignParticles,0);}
  assert.equal(built.validation.nativeVerified,false);
});

test('dense 2ms gates retain authored times but expose missing bursts and cross-firing in explicit frame experiments',()=>{
  const doc={...makeDocument('empty'),layers:[0,.012,.014,.016].map((start,i)=>({...makeLayer('p'+i),start,count:1}))};
  const built=buildCandidate(doc,'dense_bursts'),source=built.files.find(f=>f.name==='dense_bursts.mdl')!.data,proof=readEmissionTiming(source);
  assert.deepEqual(proof.events,[0,.012,.014,.016]);
  assert.ok(Math.abs(proof.minEventGap!-.002)<1e-10);
  assert.equal(proof.policy,'event-time-gated');
  assert.equal(proof.experiment.allScenariosPreserveEventCounts,false);
  assert.ok(proof.experiment.scenarios.some(s=>s.missingOwnBursts>0));
  assert.ok(proof.experiment.scenarios.some(s=>s.foreignParticles>0));
  assert.equal(built.validation.checks.burstEventsIsolated,false);
  assert.ok(built.files.some(f=>f.name==='emitter-emission.json'));
});

test('direct binary evidence rejects modified event time/name, birthrate and emitter flags',{skip:!binaryCompilerAvailable()},async()=>{
  const doc={...makeDocument('empty'),layers:[{...makeLayer('a'),start:0,count:11}]};
  const candidate=await buildCompiledCandidate(doc,'emission_binary');
  const source=candidate.files.find(f=>f.name==='source-model.mdl.txt')!.data;
  const binary=candidate.files.find(f=>f.name==='emission_binary.mdl')!.data;
  const result=readBinaryEmission(binary);assert.equal(result.baseEmitters[0].birthrate![0][1],11);
  assert.deepEqual(result.animations[0].events,[{time:0,name:'detonate'}]);
  const b=Buffer.from(binary),u=(o:number)=>b.readUInt32LE(o+12);
  const anim=u(u(0x78)),events=u(anim+0xb8),root=u(0x48),parent=u(u(root+0x48)),emitter=u(u(parent+0x48));
  const keys=u(emitter+0x54),n=u(emitter+0x58),data=u(emitter+0x60);
  let rateOffset=-1;for(let i=0;i<n;i++)if(u(keys+i*12)===88)rateOffset=12+data+b.readInt16LE(12+keys+i*12+8)*4;
  assert.ok(rateOffset>=12);
  for(const mutate of [
    (x:Buffer)=>x.writeFloatLE(.05,12+events),
    (x:Buffer)=>x.write('other',12+events+4,'ascii'),
    (x:Buffer)=>x.writeFloatLE(0,rateOffset),
    (x:Buffer)=>x.writeUInt32LE(0,12+emitter+0x144),
    (x:Buffer)=>x.writeUInt32LE(0xfffffff0,12+anim+0xb8),
  ]){const changed=Buffer.from(binary);mutate(changed);assert.throws(()=>verifyBinaryEmission(source,changed),{code:'COMPILE_VALIDATION_FAILED'});}
  const report=JSON.parse(Buffer.from(candidate.files.find(f=>f.name==='emitter-emission.json')!.data).toString());
  assert.equal(report.binaryReadback.allEventRecordsRead,true);assert.equal(report.binaryReadback.nativeVerified,false);
  const v=candidate.validation;
  validateOperationOutput('jobs.get',{id:'test',jobId:'test',projectId:'test',revision:1,actorId:'owner',type:'candidate.build',status:'running',
    createdAt:'2026-09-08T00:00:00.000Z',updatedAt:'2026-09-08T00:00:00.000Z',artifacts:[],metadata:{modelName:v.modelName,nativeVerified:false,validation:v}});
});
