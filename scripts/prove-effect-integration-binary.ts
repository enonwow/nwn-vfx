import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {applyChanges,makeTrailLayer,promoteDocumentSchema} from '../packages/core/src/model.js';
import {buildCompiledCandidate} from '../packages/nwn-format/src/compiled-candidate.js';
import {inspectBinaryMeshes} from '../packages/nwn-format/src/binary-geometry.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {audioFixture} from '../tests/fixtures/audio.js';
import {deformationExample} from '../tests/fixtures/mesh-deformation.js';
const out=resolve('output/releases/0.19.0/binary-proof');await mkdir(out,{recursive:true});
const audio=audioFixture(true),mesh=deformationExample();
mesh.layer.shading='smooth';
const document=promoteDocumentSchema({...audio.document,duration:3,assets:mesh.document.assets,layers:[...audio.document.layers,mesh.layer,makeTrailLayer('proof_trail','Proof trail',3)]});
await writeFile(join(out,'source-document.json'),JSON.stringify(document,null,2)+'\n');
const builds=[];
for(const [label,value] of [['implicit-a',undefined],['implicit-b',undefined],['false',false],['true',true]] as const){
  const doc=value===undefined?document:applyChanges(document,[{type:'project.set',values:{orientWithObject:value}}],true);
  const result=await buildCompiledCandidate(doc,'orient_binary');
  const bytes=Buffer.from(result.files.find(f=>f.name==='orient_binary.mdl')!.data),roundtrip=result.files.find(f=>f.name==='compiled-roundtrip.mdl.txt')!.data;
  const source=result.files.find(f=>f.name==='source-model.mdl.txt')!.data;
  const geometry=inspectBinaryMeshes(bytes),compilation=result.validation.compilation!;
  await writeFile(join(out,label+'.mdl'),bytes);await writeFile(join(out,label+'-roundtrip.mdl.txt'),roundtrip);
  const entry={label,bytes,modelSha256:hash(bytes),sourceSha256:hash(source),roundtripSha256:hash(roundtrip),binaryMeshContentSha256:hash(canonical(geometry)),geometryReadback:compilation.geometryReadback,normalReadback:compilation.normalReadback,
    roundtripMetrics:{nodes:compilation.nodes,triangles:compilation.triangles,vertexSamples:compilation.vertexSamples,uvSamples:compilation.uvSamples,controllers:compilation.controllers,maxSampleError:compilation.maxSampleError}};
  if(builds.length){const first=builds[0];assert.equal(entry.sourceSha256,first.sourceSha256);assert.equal(entry.roundtripSha256,first.roundtripSha256);assert.deepEqual(geometry,inspectBinaryMeshes(first.bytes));assert.deepEqual(entry.geometryReadback,first.geometryReadback);assert.deepEqual(entry.normalReadback,first.normalReadback);assert.deepEqual(entry.roundtripMetrics,first.roundtripMetrics);}
  builds.push(entry);
}
const report={passed:true,nativeVerified:false,scope:'Mixed emitter, deforming mesh, animated trail and audio fixture. Exact whole decompiler output and every directly read binary mesh field match across four builds; each build independently verifies source/controller/sample/normal mapping.',
  builds:builds.map(({bytes,...entry})=>({...entry,size:bytes.length})),differences:builds.slice(1).map(b=>{
    const before=builds[0].bytes,ranges:Array<{offset:number;beforeHex:string;afterHex:string}>=[];assert.equal(b.bytes.length,before.length);
    for(let i=0;i<before.length;i++)if(before[i]!==b.bytes[i]){const start=i;while(i+1<before.length&&before[i+1]!==b.bytes[i+1])i++;ranges.push({offset:start,beforeHex:before.subarray(start,i+1).toString('hex'),afterHex:b.bytes.subarray(start,i+1).toString('hex')});}
    const u=(o:number)=>before.readUInt32LE(12+o),tails:Array<{event:string;start:number;end:number}>=[];
    for(let i=0;i<u(0x7c);i++){
      const animation=u(u(0x78)+i*4);
      for(let j=0;j<u(animation+0xbc);j++){
        const event=12+u(animation+0xb8)+j*36,name=event+4,end=name+32,nul=before.indexOf(0,name);
        assert(nul>=name&&nul<end);tails.push({event:before.subarray(name,nul).toString('ascii'),start:nul+1,end});
      }
    }
    for(const r of ranges)assert(tails.some(t=>r.offset>=t.start&&r.offset+r.beforeHex.length/2<=t.end),'Unexpected difference outside event-name trailing storage');
    return {label:b.label,changedBytes:ranges.reduce((n,r)=>n+r.beforeHex.length/2,0),ranges,eventNameTrailingStorage:tails,
      classification:'Every differing byte lies after the NUL terminator of an animation-event name. The compiler parses a non-zero-initialized stack NwnMdlAnimationEvent then serializes all 36 bytes. No compiler or output bytes were changed.'};
  })};
await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,builds:report.builds,differences:report.differences}));
