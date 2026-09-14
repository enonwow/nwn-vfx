import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {applyChanges,type EffectDocument,type MeshLayer} from '../packages/core/src/model.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {createMonotoneDeformationCurve} from '../packages/core/src/deformation-curve.js';
import {compileMeshDeformation} from '../packages/core/src/deformation.js';
import {interpolationFixture} from '../tests/fixtures/deformation-interpolation.js';

const out=resolve('output/releases/0.23.0'),examples=resolve('docs/agents/examples/deformation-interpolation');await mkdir(out,{recursive:true});await mkdir(examples,{recursive:true});
await writeFile(join(examples,'project.json'),JSON.stringify(interpolationFixture(),null,2));
for(const [name,mode] of [['smooth-loop','monotone-cubic-loop'],['smooth-stop','monotone-cubic'],['linear','linear'],['reset',null]])
  await writeFile(join(examples,`${name}.json`),JSON.stringify([{type:'layer.set',layerId:'panels',values:{deformationInterpolation:mode}}],null,2));
const path='C:/Projects/the last city/assets/vfx/wampir/skrzydla/studio/v4/loop-candidate/effect-document.json';
const bytes=await readFile(path),source:EffectDocument=JSON.parse(bytes.toString()),started=performance.now();
const sourceHash=hash(canonical(source));
assert.equal(sourceHash,'aee8d5b88dcb223a676cd2bda90f3e262040861a2e629b00fb9479f6c6f2223a');
const smooth=applyChanges(source,source.layers.map(l=>({type:'layer.set',layerId:l.id,values:{deformationInterpolation:'monotone-cubic-loop'}})),true);assertDocument(smooth);
const report:any={source:{path,revision:6,sha256:hash(bytes),snapshotSha256:sourceHash},nativeVerified:false,layers:[],frontBack:[]};
const samples=new Map<string,ReturnType<typeof compileMeshDeformation>>();
const normDelta=(a:number[],b:number[])=>Math.hypot(...a.map((n,c)=>n-b[c]));
function maxGridJump(frames:number[][][],period:number){let maximum=0;for(let i=1;i<frames.length-1;i++)for(let v=0;v<frames[i].length;v++)maximum=Math.max(maximum,Math.hypot(...[0,1,2].map(c=>(frames[i+1][v][c]-2*frames[i][v][c]+frames[i-1][v][c])/period)));return maximum;}
for(const layer of smooth.layers as MeshLayer[]){
  const old=source.layers.find(l=>l.id===layer.id) as MeshLayer,curve=createMonotoneDeformationCurve(layer),compiled=compileMeshDeformation(layer,smooth.duration),linear=compileMeshDeformation(old,source.duration);samples.set(layer.id,compiled);
  assert.equal(layer.animation.vertices!.length,17);assert.deepEqual(layer.animation,old.animation);assert.deepEqual(layer.geometry,old.geometry);assert.equal(compiled.frames.length,85);
  assert.deepEqual(curve.at(0),curve.at(layer.duration));assert.deepEqual(curve.velocity(0),curve.velocity(layer.duration));
  const keys=layer.animation.vertices!;let pinned=0,maxC1Residual=0;
  for(let v=0;v<keys[0].value.length;v++)if(keys.every(k=>normDelta(k.value[v],keys[0].value[v])===0)){pinned++;for(const f of compiled.frames)assert.deepEqual(f[v],keys[0].value[v]);}
  for(const k of keys.slice(1,-1)){const a=curve.velocity(k.time-1e-9),b=curve.velocity(k.time+1e-9);for(let v=0;v<a.length;v++)maxC1Residual=Math.max(maxC1Residual,normDelta(a[v],b[v]));}
  assert(maxC1Residual<1e-5);
  for(let k=1;k<keys.length;k++)for(let step=0;step<=8;step++){
    const positions=curve.at(keys[k-1].time+(keys[k].time-keys[k-1].time)*step/8);
    positions.forEach((p,v)=>p.forEach((n,c)=>assert(n>=Math.min(keys[k-1].value[v][c],keys[k].value[v][c])-1e-12&&n<=Math.max(keys[k-1].value[v][c],keys[k].value[v][c])+1e-12)));
  }
  report.layers.push({id:layer.id,keys:17,frames:85,pinnedVertices:pinned,analyticKnotVelocityResidualAt1ns:maxC1Residual,analyticSeamVelocityDifference:0,coordinateOvershoot:0,
    linear60HzMaxVelocityJump:maxGridJump(linear.frames,linear.period),cubic60HzMaxVelocityJump:maxGridJump(compiled.frames,compiled.period),sampleErrorBoundMetres:compiled.maxDeviationMetres,
    sampleSha256:hash(canonical(compiled.frames)),interpolation:compiled.interpolation});
}
for(const side of ['left','right']){
  const front=smooth.layers.find(l=>l.id===side) as MeshLayer,back=smooth.layers.find(l=>l.id===`${side}_membrane_back`) as MeshLayer;
  assert.equal(front.geometry.kind,'custom');assert.equal(back.geometry.kind,'custom');if(front.geometry.kind!=='custom'||back.geometry.kind!=='custom')throw new Error('custom');
  const fs=samples.get(front.id)!,bs=samples.get(back.id)!;
  for(let v=0;v<back.geometry.vertices.length;v++){
    const indices=front.geometry.vertices.map((p,i)=>normDelta(p,back.geometry.kind==='custom'?back.geometry.vertices[v]:[])===0?i:-1).filter(i=>i>=0);
    assert(indices.some(i=>fs.frames.every((f,k)=>normDelta(f[i],bs.frames[k][v])===0)),`${side} back vertex ${v}`);
  }
  report.frontBack.push({side,vertices:back.geometry.vertices.length,maxSampleDifferenceMetres:0});
}
const stripped=structuredClone(smooth);for(const l of stripped.layers as MeshLayer[])delete l.deformationInterpolation;stripped.schemaVersion=source.schemaVersion;assert.equal(canonical(stripped),canonical(source));
assert.equal(hash(await readFile(path)),hash(bytes));
await writeFile(join(out,'r6-isolated-source.json'),JSON.stringify(smooth));
report.elapsedSeconds=(performance.now()-started)/1000;report.isolatedSnapshotSha256=hash(canonical(smooth));report.documentBytes=Buffer.byteLength(canonical(smooth));report.passed=true;
await writeFile(join(out,'source-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
