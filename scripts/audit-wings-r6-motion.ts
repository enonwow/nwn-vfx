import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compileMeshDeformation,authoredMeshVertices,sampleMeshDeformation} from '../packages/core/src/deformation.js';
import type {EffectDocument,MeshLayer,Vec3} from '../packages/core/src/model.js';
import {canonical} from '../apps/service/src/store.js';

const root='C:/Projects/the last city/assets/vfx/wampir/skrzydla/studio';
const doc:EffectDocument=JSON.parse(await readFile(root+'/v4/loop-candidate/effect-document.json','utf8'));
const raw=JSON.parse(await readFile(root+'/v2/geometry-source.json','utf8'));
const inputBytes=await readFile(root+'/v4/loop-candidate/effect-document.json');
const norm=(v:number[])=>Math.hypot(...v),delta=(a:number[],b:number[])=>a.map((n,i)=>n-b[i]);
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const pose=(p:number[],sign:number,pulse:number):Vec3=>{
  const rootX=.055*sign,dx=p[0]-rootX,u=Math.abs(dx),free=smooth((Math.abs(p[0])-.07)/.11);
  const angle=pulse*(18*Math.PI/180)*free,dz=p[2]-.365;
  const x=rootX+dx*Math.cos(angle)-sign*dz*Math.sin(angle),z=.365+Math.abs(dx)*Math.sin(angle)+dz*Math.cos(angle);
  const y=p[1]+pulse*.01*free*(u/.45);
  return [-x*2.8,-(y+.12)*2.8-.10,(z-.365)*2.8+1.42].map(n=>Math.round(n*1e7)/1e7) as Vec3;
};
const result:any={sourceRevision:6,loopSeconds:doc.duration,sourceSha256:createHash('sha256').update(inputBytes).digest('hex'),
  authoredInterpolation:'piecewise linear positions, not a spline',renderInterpolation:'linear between 60 Hz sampled positions',
  nativeInterpolationVerified:false,layers:[],comparison:[],passed:false};
for(const layer of doc.layers.filter((l):l is MeshLayer=>l.type==='mesh')){
  const part=raw.parts.find((p:any)=>p.name===layer.id),track=layer.animation.vertices!;
  for(const key of track)assert.deepEqual(key.value,part.vertices.map((p:number[])=>pose(p,part.sign,Math.sin(2*Math.PI*key.time/doc.duration)**3)));
  const compiled=compileMeshDeformation(layer,doc.duration);
  const steps=compiled.frames.slice(1).map((frame,k)=>Math.max(...frame.map((p,i)=>norm(delta(p,compiled.frames[k][i])))));
  let maxVelocityJump=0,seamVelocityJump=0;
  for(let k=1;k<track.length-1;k++)for(let v=0;v<track[k].value.length;v++){
    const before=delta(track[k].value[v],track[k-1].value[v]).map(n=>n/(track[k].time-track[k-1].time));
    const after=delta(track[k+1].value[v],track[k].value[v]).map(n=>n/(track[k+1].time-track[k].time));
    maxVelocityJump=Math.max(maxVelocityJump,norm(delta(after,before)));
  }
  for(let v=0;v<track[0].value.length;v++){
    const before=delta(track.at(-1)!.value[v],track.at(-2)!.value[v]).map(n=>n/(track.at(-1)!.time-track.at(-2)!.time));
    const after=delta(track[1].value[v],track[0].value[v]).map(n=>n/(track[1].time-track[0].time));
    seamVelocityJump=Math.max(seamVelocityJump,norm(delta(after,before)));
  }
  let idealError=0,sourceError=0;const tip=part.vertices.map((p:number[],i:number)=>({i,span:norm(delta(pose(p,part.sign,1),pose(p,part.sign,-1)))})).sort((a:any,b:any)=>b.span-a.span)[0].i;
  const frames=[];
  for(let tick=0;tick<=420;tick++){
    const t=tick*doc.duration/420,actual=sampleMeshDeformation(compiled,t),authored=authoredMeshVertices(layer,t);
    for(let v=0;v<actual.length;v++){
      idealError=Math.max(idealError,norm(delta(actual[v],pose(part.vertices[v],part.sign,Math.sin(2*Math.PI*t/doc.duration)**3))));
      sourceError=Math.max(sourceError,norm(delta(actual[v],authored[v])));
    }
    if(tick%5===0)frames.push({time:t,tip:actual[tip],ideal:pose(part.vertices[tip],part.sign,Math.sin(2*Math.PI*t/doc.duration)**3)});
  }
  result.layers.push({id:layer.id,keys:track.length,keyTimes:track.map(k=>k.time),samplePeriod:compiled.period,frames:compiled.frames.length,
    fixedSourceVertices:track[0].value.filter((p,i)=>track.every(key=>key.value[i].every((n,j)=>n===p[j]))).length,
    layerTransform:{position:layer.position,orientation:layer.orientation,scale:layer.scale},
    maxAuthoredTo60HzDeviationMetres:compiled.maxDeviationMetres,measuredAuthoredTo60HzDeviationMetres:sourceError,
    denseIdealSinCubedToExportMaxMetres:idealError,maxAuthoredVelocityJumpMetresPerSecond:maxVelocityJump,
    authoredSeamVelocityJumpMetresPerSecond:seamVelocityJump,
    minimumMaximumVertexStepMetres:Math.min(...steps),maximumVertexStepMetres:Math.max(...steps),
    maximumSegmentSpeedMetresPerSecond:Math.max(...steps)/compiled.period,tipVertex:tip,tipFrames:frames});
}
for(const keys of [17,33,43,49,61])for(const law of ['sinCubed','sin']){
  const authored=Array.from({length:keys},(_,i)=>{const t=i/(keys-1),pulse=Math.sin(2*Math.PI*t);return{t,value:18*(law==='sinCubed'?pulse**3:pulse)};});
  let maxErrorDegrees=0,maxSpeedJumpDegreesPerSecond=0;
  for(let i=0;i<=4200;i++){
    const t=i/4200,index=Math.min(keys-2,Math.floor(t*(keys-1))),a=authored[index],b=authored[index+1];
    const estimate=a.value+(b.value-a.value)*(t-a.t)/(b.t-a.t),pulse=Math.sin(2*Math.PI*t),ideal=18*(law==='sinCubed'?pulse**3:pulse);
    maxErrorDegrees=Math.max(maxErrorDegrees,Math.abs(estimate-ideal));
  }
  for(let i=1;i<keys-1;i++)maxSpeedJumpDegreesPerSecond=Math.max(maxSpeedJumpDegreesPerSecond,Math.abs((authored[i+1].value-2*authored[i].value+authored[i-1].value)*(keys-1)/doc.duration));
  result.comparison.push({law,keys,amplitudeDegrees:18,maxPiecewiseLinearAngleErrorDegrees:maxErrorDegrees,maxSpeedJumpDegreesPerSecond});
}
result.sourceSizes=[17,25,29,33,43,49,61].map(keys=>{
  const candidate=structuredClone(doc);
  for(const layer of candidate.layers.filter((l):l is MeshLayer=>l.type==='mesh')){
    const part=raw.parts.find((p:any)=>p.name===layer.id);
    layer.animation.vertices=Array.from({length:keys},(_,i)=>({time:Math.round(i*doc.duration/(keys-1)*1e7)/1e7,
      value:part.vertices.map((p:number[])=>pose(p,part.sign,Math.sin(2*Math.PI*i/(keys-1))))}));
    layer.animation.vertices.at(-1)!.value=structuredClone(layer.animation.vertices[0].value);
  }
  const canonicalBytes=Buffer.byteLength(canonical(candidate));
  return {keys,law:'sin',amplitudeDegrees:18,canonicalBytes,withinSixMiB:canonicalBytes<=6*1024*1024,
    authoredKeysOn60HzGrid:Number.isInteger(84/(keys-1)),sourceWritten:false};
});
assert.equal(createHash('sha256').update(await readFile(root+'/v4/loop-candidate/effect-document.json')).digest('hex'),result.sourceSha256);
result.passed=true;await writeFile('output/wings-0220-r6-audit/motion.json',JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({...result,layers:result.layers.map(({tipFrames,...l}:any)=>l)})+'\n');
