import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothDeformationExample} from './fixtures/smooth-deformation.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {compileMeshDeformation,sampleMeshDeformation,assertMeshDeformationBudget} from '../packages/core/src/deformation.js';
import {validateNormalMotion} from '../packages/core/src/normal-motion.js';
import {smoothVertexNormals} from '../packages/core/src/shading.js';
import {createMeshPreviewGeometry,updateMeshPreviewVertices} from '../packages/renderer/src/index.js';
import {buildCandidate,readAsciiMdl} from '../packages/nwn-format/src/index.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {verifyBinaryNormals} from '../packages/nwn-format/src/binary-normals.js';
import {deformationNormalSamples} from '../packages/nwn-format/src/normal-samples.js';
import {readbackMesh} from '../packages/nwn-format/src/mesh-readback.js';

test('smooth deformation keeps source topology, UV and budgets and recomputes normals at interpolated time',()=>{
  const {document,layer}=smoothDeformationExample(),before=structuredClone(document);assertDocument(document);
  if(layer.geometry.kind!=='custom')throw new Error('custom');
  const compiled=compileMeshDeformation(layer,document.duration),budget=assertMeshDeformationBudget(document),preview=createMeshPreviewGeometry(layer);
  assert.equal(compiled.frames.length,121);assert.equal(budget.vertexSamples,layer.geometry.vertices.length*121);assert.equal(budget.uvSamples,layer.geometry.uv!.length*121);
  const originalNormals=Array.from(preview.getAttribute('normal').array);
  for(const time of [.23,.4917,.5,1.5]){
    const vertices=sampleMeshDeformation(compiled,time);updateMeshPreviewVertices(layer,preview,vertices);
    const normals=smoothVertexNormals(vertices,layer.geometry.faces),seen=new Map<number,number[]>(),attribute=preview.getAttribute('normal');
    layer.geometry.faces.flat().forEach((index,corner)=>{
      const actual=[attribute.getX(corner),attribute.getY(corner),attribute.getZ(corner)];
      actual.forEach((v,k)=>assert(Math.abs(v-normals[index][k])<1e-7));
      if(seen.has(index))assert.deepEqual(actual,seen.get(index),'UV seams must share the authored position normal');else seen.set(index,actual);
    });
    assert.notDeepEqual(Array.from(attribute.array),originalNormals);
  }
  assert.deepEqual(document,before);preview.dispose();
});

test('continuous normal validation catches collapse between samples, cancelling vertex sums and zero-time overrides',()=>{
  const a:[[number,number,number],[number,number,number],[number,number,number]]=[[0,0,0],[1,0,0],[0,1,0]],faces=[[0,1,2]];
  // Area vanishes at t=.37 although both endpoints and midpoint are nonzero.
  assert.throws(()=>validateNormalMotion(a,[[0,0,0],[1,0,0],[0,-.63/.37,0]],faces,{}),{code:'VALIDATION_ERROR'});
  // Individual triangles stay nondegenerate; their normals cancel at the seam.
  const start:any=[[0,0,0],[1,0,0],[0,1,0],[0,-1,1]],end:any=[[0,0,0],[1,0,0],[0,1,0],[0,-1,-1]];
  assert.throws(()=>validateNormalMotion(start,end,[[0,1,2],[0,1,3]],{}),{code:'VALIDATION_ERROR'});
  assert.doesNotThrow(()=>validateNormalMotion(a,a,faces,{}));
  const f=smoothDeformationExample();if(f.layer.geometry.kind!=='custom')throw new Error('custom');
  const bad=structuredClone(f.document);bad.layers[0].animation.vertices![1].value[0]=[...bad.layers[0].animation.vertices![1].value[1]];
  assert.throws(()=>assertDocument(bad),{code:'VALIDATION_ERROR'});
  // A t=0 key replaces the base; there is no interpolation from base to that key.
  f.layer.animation.vertices=[{time:0,value:f.layer.geometry.vertices.map(([x,y,z])=>[-x,-y,z])}];assertDocument(f.document);
});

test('smooth animmesh ASCII retains all samples and masks; normal hashes derive from actual readback positions',()=>{
  const {document,layer}=smoothDeformationExample(),result=buildCandidate(document,'smooth_move'),proof=result.validation.readback.meshes[0];
  assert.equal(proof.shading!.mode,'smooth');assert.equal(proof.shading!.exportedAnimatedNormals,false);
  if(layer.geometry.kind!=='custom')throw new Error('custom');
  assert.deepEqual(proof.shading!.deformationNormals,deformationNormalSamples(compileMeshDeformation(layer,2).frames,layer.geometry.faces));
  assert(result.validation.diagnostics.some(d=>d.code==='MESH_ANIMATED_NORMALS_NOT_EXPORTED'));
  const source=result.files.find(f=>f.name==='smooth_move.mdl')!.data,parsed=readAsciiMdl(source),anim=parsed.animations[0];
  assert.equal(anim.nodes.find(n=>n.name===proof.node)!.type,'animmesh');
  const before=structuredClone(parsed);anim.nodes.find(n=>n.name===proof.node)!.tables.faces[0][3]=0;
  assert.throws(()=>readbackMesh(parsed,anim,layer,proof.node,proof.parent,proof.texture),{code:'EXPORT_VALIDATION_FAILED'});
  assert.equal(before.animations[0].nodes.find(n=>n.name===proof.node)!.tables.animverts.length,121*layer.geometry.vertices.length);
});

test('binary reads actual smooth animmesh base normals in base and animation nodes, with empty animated-normal arrays',{skip:!binaryCompilerAvailable()},async()=>{
  const {document}=smoothDeformationExample(),result=await buildCompiledCandidate(document,'smooth_move');
  const proof=result.validation.compilation!.normalReadback;
  assert.equal(proof.animmeshNodes,2);assert.equal(proof.animatedNormalSamples,0);assert(proof.allCornersRead);assert(proof.maxComponentError<.0002);
  const source=result.files.find(f=>f.name==='source-model.mdl.txt')!.data,bytes=Buffer.from(result.files.find(f=>f.name==='smooth_move.mdl')!.data);
  const animTable=bytes.readUInt32LE(12+0x78),animation=bytes.readUInt32LE(12+animTable),root=bytes.readUInt32LE(12+animation+0x48);
  function find(o:number):number{if(bytes.readUInt32LE(12+o+0x6c)===0xa1)return o;
    const children=bytes.readUInt32LE(12+o+0x48),count=bytes.readUInt32LE(12+o+0x4c);
    for(let i=0;i<count;i++){const n=find(bytes.readUInt32LE(12+children+4*i));if(n>=0)return n;}return -1;}
  const node=find(root);assert(node>=0);
  const normal=12+bytes.readUInt32LE(4)+bytes.readUInt32LE(12+node+0x244),original=bytes.readFloatLE(normal);
  bytes.writeFloatLE(9,normal);assert.throws(()=>verifyBinaryNormals(source,bytes),{code:'COMPILE_VALIDATION_FAILED'});
  bytes.writeFloatLE(original,normal);bytes.writeUInt32LE(1,12+node+0x290);
  assert.throws(()=>verifyBinaryNormals(source,bytes),{code:'COMPILE_VALIDATION_FAILED'});
});
