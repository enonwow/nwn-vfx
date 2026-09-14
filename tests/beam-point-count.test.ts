import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument,type BeamLayer} from '../packages/core/src/model.js';
import {buildCandidate,readAsciiMdl,numeric} from '../packages/nwn-format/src/index.js';
import {verifyBeamPointCounts} from '../packages/nwn-format/src/beam-point-count.js';
import {verifyBinaryBeam} from '../packages/nwn-format/src/binary-beam.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';

// Independent bounded replay of the observed retail midpoint *indices*, not
// our serializer's formula. It dereferences both neighbors even at radius=0.
// Crash: center=16, distance=16, count=32 -> point[32] -> null + 0x10.
function replayNativeReads(count:number) {
  const reads=new Set<number>();
  function midpoint(center:number,distance:number):void {
    for(const index of [center,center+distance,center-distance]){
      assert(index>=0&&index<count,`native point[${index}] outside 0..${count-1}`);reads.add(index);
    }
    if(distance){const next=Math.trunc(distance/2);midpoint(center-next,next);midpoint(center+next,next);}
  }
  midpoint(Math.trunc(count/2),Math.trunc(count/2));return reads;
}

test('serialized Lightning points survive every midpoint read for all supported segments; original crash is reproduced',()=>{
  assert.throws(()=>replayNativeReads(32),/point\[32\]/);
  assert.throws(()=>replayNativeReads(2),/point\[2\]/);
  // Retail stock point counts: vim_rayfire 3/65, vdu_beam000 5/9/9.
  for(const count of [3,5,9,9,65])assert.equal(replayNativeReads(count).size,count);
  for(const segments of [2,4,8,16,32,64])for(const radius of [0,.02]){
    const document=makeDocument('empty','Beam boundary fixture','beam'),layer=document.layers[0] as BeamLayer;
    layer.segments=segments;layer.radius=radius;
    const result=buildCandidate(document,'point_fixture'),mdl=result.files.find(f=>f.name==='point_fixture.mdl')!.data;
    const node=readAsciiMdl(mdl).nodes.find(n=>n.type==='emitter')!,count=numeric(node,'birthrate');
    assert.equal(replayNativeReads(count).size,segments+1);
    const bad=new TextEncoder().encode(new TextDecoder().decode(mdl).replace(`birthrate ${count}`,`birthrate ${segments}`));
    assert.throws(()=>verifyBeamPointCounts(bad),(e:any)=>e.code==='BEAM_POINT_COUNT_UNSAFE');
  }
});

test('binary point count is checked against runtime bounds even when corrupt ASCII and binary agree',{skip:!binaryCompilerAvailable()},async()=>{
  const document=makeDocument('empty','Beam binary boundary fixture','beam');(document.layers[0] as BeamLayer).segments=32;
  const r=await buildCompiledCandidate(document,'points_binary'),binary=r.files.find(f=>f.name==='points_binary.mdl')!.data,source=r.files.find(f=>f.name==='source-model.mdl.txt')!.data;
  const read=verifyBinaryBeam(source,binary),emitter=read.nodes.find(n=>n.type==='emitter')!;
  assert.equal(replayNativeReads(emitter.controllers![88][0]).size,33);
  const d=new DataView(binary.buffer,binary.byteOffset,binary.byteLength),u=(o:number)=>d.getUint32(12+o,true),root=u(0x48),node=u(u(root+0x48)),keys=u(node+0x54),data=u(node+0x60);
  let value=-1;for(let i=0;i<u(node+0x58);i++)if(u(keys+12*i)===88)value=data+4*d.getInt16(12+keys+12*i+8,true);assert(value>=0);
  const bad=new Uint8Array(binary);new DataView(bad.buffer).setFloat32(12+value,32,true);
  assert.throws(()=>verifyBinaryBeam(source,bad),(e:any)=>e.code==='BEAM_POINT_COUNT_UNSAFE');
  const badSource=new TextEncoder().encode(new TextDecoder().decode(source).replace('birthrate 33','birthrate 32'));
  assert.throws(()=>verifyBinaryBeam(badSource,bad),(e:any)=>e.code==='BEAM_POINT_COUNT_UNSAFE');
});
