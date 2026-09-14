import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCompiledRoundtrip } from '../packages/nwn-format/src/compiled-readback.js';

const encode=(text:string)=>new TextEncoder().encode(text);
const table=(name:string,rows:number[][])=>`${name} ${rows.length}\n${rows.map(row=>row.join(' ')).join('\n')}`;
/** Two coincident corners are equivalent only if their entire sampled paths agree. */
function sampled(welded=false,vertexEnd=.9600000000000001,uvEnd=.9600000000000001) {
  const verts=[[0,0,0],[1,0,0],[0,1,0]],uv=[[.75,.96,0],[0,0,0],[1,0,0]];
  const faces=[[0,1,2,0,0,1,2,0],[welded?0:3,1,2,0,welded?0:3,1,2,0]];
  const v=welded?verts:[...verts,[0,0,0]],u=welded?uv:[...uv,[.75,.9600000000000001,0]];
  const endV=[[0,0,.96],[1,0,0],[0,1,0]],endU=[[.75,.96,0],[0,0,0],[1,0,0]];
  return encode(`newmodel regression
classification Effect
beginmodelgeom regression
node dummy regression
parent NULL
endnode
node animmesh mesh_0
parent regression
${table('verts',verts)}
${table('tverts',uv)}
${table('faces',[[0,1,2,0,0,1,2,0]])}
endnode
endmodelgeom regression
newanim impact regression
length 1
animroot regression
node animmesh mesh_0
parent regression
sampleperiod 1
${table('verts',v)}
${table('tverts',u)}
${table('faces',faces)}
${table('animverts',[...v,...endV,...(welded?[]:[[0,0,vertexEnd]])])}
${table('animtverts',[...u,...endU,...(welded?[]:[[.75,uvEnd,0]])])}
endnode
doneanim impact regression
donemodel regression
`);
}

test('float32-equivalent source UV and full sampled paths may share a compiled corner',()=>{
  const proof=verifyCompiledRoundtrip(sampled(),sampled(true));
  assert.equal(proof.triangles,3);
  assert.equal(proof.vertexSamples,8);
  assert.equal(proof.uvSamples,8);
});

test('coincident base corners with distinct later vertex or UV samples must survive',()=>{
  for(const source of [sampled(false,.8),sampled(false,.96,.8)]) {
    assert.throws(()=>verifyCompiledRoundtrip(source,sampled(true)),{code:'COMPILE_VALIDATION_FAILED'});
  }
  // Even values within the numeric comparison tolerance remain distinct if
  // their float32 encodings differ. This is not tolerance-based deduplication.
  assert.notEqual(Math.fround(.96),Math.fround(.9600001));
  for(const source of [sampled(false,.9600001),sampled(false,.96,.9600001)]) {
    assert.throws(()=>verifyCompiledRoundtrip(source,sampled(true)),{code:'COMPILE_VALIDATION_FAILED'});
  }
});

test('real UV corruption and changed winding remain rejected after alias remapping',()=>{
  const source=sampled(),roundtrip=new TextDecoder().decode(sampled(true));
  for(const text of [roundtrip.replaceAll('0.75 0.96 0','0.75 0.8 0'),
    roundtrip.replaceAll('0 1 2 0 0 1 2 0','0 2 1 0 0 2 1 0')]) {
    assert.throws(()=>verifyCompiledRoundtrip(source,encode(text)),{code:'COMPILE_VALIDATION_FAILED'});
  }
});
