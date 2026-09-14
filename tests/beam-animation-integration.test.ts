import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {makeDocument} from '../packages/core/src/model.js';
import {operationSchemas} from '../packages/contracts/src/schema.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {flowFixture} from './fixtures/beam-flow.js';

// Derive the expected column from pinned retail instructions, independently of
// the exporter constant. This is offline evidence, not a native playback test.
function retailAnimationColumn():string {
  const evidence=JSON.parse(readFileSync(new URL('./fixtures/beam-animation-column-evidence.json',import.meta.url),'utf8'));
  const bytes=Buffer.from(evidence.bytesHex,'hex');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.bytesSha256);
  assert.equal(evidence.sourceSha256,'6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700');
  assert.equal(evidence.address,'0x815bf4');
  assert.equal(bytes[0],0xba); // mov edx, imm32; low word is stored at +4
  assert.equal(bytes.subarray(9,13).toString('hex'),'c6400600'); // NUL at +6
  assert.equal(bytes.subarray(13,17).toString('hex'),'66895004');
  assert.equal(bytes.subarray(21,23).toString('hex'),'c700'); // mov dword [rax], imm32
  const name=Buffer.concat([bytes.subarray(23,27),bytes.subarray(1,3)]).toString('ascii');
  return name[0].toUpperCase()+name.slice(1);
}

const definitions=(operationSchemas['jobs.get'].outputSchema as any).definitions;
const validate=new Ajv({strict:false,allErrors:true}).compile({$ref:'#/definitions/candidateValidation',definitions});

test('new static and finite Type7 exports bind animation using the audited retail column',()=>{
  const column=retailAnimationColumn();
  for(const document of [makeDocument('empty','Static evidence','beam'),flowFixture()]){
    const result=buildCandidate(document,'binding_evidence'),effect=result.validation.integration.effect!;
    assert.equal(effect.schemaVersion,6);
    assert.deepEqual(effect.beam!.progfx2da.columns,{Type:7,Param1:'binding_evidence',[column]:'cast01'});
    assert(validate(result.validation),JSON.stringify(validate.errors));
    const read=(name:string)=>JSON.parse(Buffer.from(result.files.find(f=>f.name===name)!.data).toString());
    assert.deepEqual(read('vfx-integration.json'),effect);
    assert.deepEqual(read('validation.json').integration.effect,effect);
    if(document.schemaVersion===19)for(const endpoint of read('beam-flow.json').endpoints){
      assert.deepEqual(endpoint.integration.progfx2da.columns,{Type:12,Param1:endpoint.node,Param2:endpoint.model.resref});
    }
  }
});

test('closed job contracts read legacy Param2 without accepting ambiguous or mismatched animation columns',()=>{
  const current=buildCandidate(flowFixture(false),'binding_history').validation;
  const variant=(version:number,columns:Record<string,unknown>)=>{
    const value=structuredClone(current) as any;
    value.integration.effect.schemaVersion=version;
    value.integration.effect.beam.progfx2da.columns={Type:7,Param1:'binding_history',...columns};
    return value;
  };
  for(const version of [3,4,5]){
    assert(validate(variant(version,{Param2:'cast01'})),JSON.stringify(validate.errors));
    assert.equal(validate(variant(version,{Param6:'cast01'})),false);
  }
  assert(validate(variant(6,{Param6:'cast01'})),JSON.stringify(validate.errors));
  for(const columns of [{Param2:'cast01'},{Param2:'cast01',Param6:'cast01'},{},{Param6:'impact'}]){
    assert.equal(validate(variant(6,columns)),false);
  }
  assert.equal(validate(variant(7,{Param6:'cast01'})),false);
});
