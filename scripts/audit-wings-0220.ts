import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join} from 'node:path';
import {readAsciiMdl} from '../packages/nwn-format/src/mdl-reader.js';
import {inspectBinaryMeshes,verifyBinaryGeometry} from '../packages/nwn-format/src/binary-geometry.js';
import {readBinaryEmission} from '../packages/nwn-format/src/binary-emission.js';
import {authoredMeshVertices,compileMeshDeformation} from '../packages/core/src/deformation.js';
import {canonical} from '../apps/service/src/store.js';
import type {EffectDocument,MeshLayer} from '../packages/core/src/model.js';

// Exact-document, read-only consumer audit. No project writes or native control.
const root=process.argv[2]??'C:/Projects/the last city/assets/vfx/wampir/skrzydla/studio/v3';
const revision=Number(process.argv[3]??5);assert(Number.isSafeInteger(revision)&&revision>0);
const out=resolve(process.argv[4]??'output/wings-0220-audit');await mkdir(out,{recursive:true});
const run=promisify(execFile),sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const readJson=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const coordinate=(p:number[])=>p.map(n=>n.toFixed(6)).join(',');
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((n,i)=>n-b[i]));
const cyclic=(p:string[])=>[p,[p[1],p[2],p[0]],[p[2],p[0],p[1]]].map(a=>a.join('|')).sort()[0];
const documents:Record<string,EffectDocument>={};
const report:any={createdAt:new Date().toISOString(),studioVersion:'0.22.0',scope:'offline exact-document export audit; no native execution',phases:[],inputs:[],passed:false};
for(const phase of ['open','loop','close']){
  const dir=join(root,phase+'-candidate'),projectId='tlc-wampir-skrzydla-'+phase;
  const doc:EffectDocument=await readJson(join(dir,'effect-document.json'));documents[phase]=doc;
  const integration=await readJson(join(dir,'vfx-integration.json'));
  const receipt=JSON.parse((await run(process.execPath,['C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs','--json','revisions','get','--project',projectId,'--revision',String(revision)],{cwd:'C:/Projects/the last city',windowsHide:true,maxBuffer:32*1024*1024})).stdout);
  assert.equal(receipt.status,'ok');assert.equal(receipt.data.revision,revision);
  assert.equal(canonical(receipt.data.document),canonical(doc));assert.equal(sha(canonical(doc)),integration.snapshotSha256);
  const paths=['effect-document.json','source-model.mdl.txt','compiled-roundtrip.mdl.txt','validation.json','vfx-integration.json',integration.model.file];
  for(const name of paths){const path=join(dir,name),bytes=await readFile(path);report.inputs.push({path,bytes:bytes.length,sha256:sha(bytes)});}
  const source=await readFile(join(dir,'source-model.mdl.txt')),binary=await readFile(join(dir,integration.model.file));
  assert.equal(sha(binary),integration.model.sha256);
  const parsed=readAsciiMdl(source),anim=parsed.animations[0];assert.equal(parsed.animations.length,1);
  const allLayers=doc.layers.filter((l):l is MeshLayer=>l.type==='mesh'&&l.enabled);
  assert.equal(allLayers.length,4);assert.equal(parsed.nodes.filter(n=>n.type==='animmesh').length,4);
  assert.equal(anim.nodes.filter(n=>n.type==='animmesh').length,4);
  const meshes=allLayers.map((layer,i)=>{
    const base=parsed.nodes.find(n=>n.name==='mesh_'+i)!,animated=anim.nodes.find(n=>n.name==='mesh_'+i)!;
    const compiled=compileMeshDeformation(layer,doc.duration);
    assert.deepEqual(animated.tables.animverts,compiled.frames.flat());
    for(const field of ['position','orientation','scale','alpha'])assert.equal(animated.properties[field],undefined);
    assert.equal(Number(base.properties.sampleperiod[0]),0);
    return {layerId:layer.id,node:base.name,baseAlpha:Number(base.properties.alpha[0]),alpha: animated.tracks.alpha,
      position:animated.tracks.position,orientation:animated.tracks.orientation,scale:animated.tracks.scale,
      baseVertices:base.tables.verts.length,triangles:base.tables.faces.length,frames:compiled.frames.length,
      samplePeriod:Number(animated.properties.sampleperiod[0]),allDeformationSamplesExact:true,
      baseVersusAnimationStartMaxMetres:Math.max(...base.tables.verts.map((v,j)=>distance(v,compiled.frames[0][j])))};
  });
  const backfaces=['left','right'].map(side=>{
    const front=allLayers.find(l=>l.id===side)!,back=allLayers.find(l=>l.id===side+'_membrane_back')!;
    assert.equal(front.geometry.kind,'custom');assert.equal(back.geometry.kind,'custom');
    if(front.geometry.kind!=='custom'||back.geometry.kind!=='custom')throw new Error('custom');
    const fg=front.geometry,bg=back.geometry;
    const lookup=new Map<string,number[]>();fg.vertices.forEach((v,i)=>{const k=coordinate(v);lookup.set(k,[...(lookup.get(k)??[]),i]);});
    let maxMotionDifferenceMetres=0,missingBasePositions=0;
    const mapping=bg.vertices.map((v,i)=>{
      const candidates=lookup.get(coordinate(v))??[];if(!candidates.length){missingBasePositions++;return -1;}
      const differences=candidates.map(j=>Math.max(...back.animation.vertices!.map((frame,k)=>distance(frame.value[i],front.animation.vertices![k].value[j]))));
      const best=Math.min(...differences);maxMotionDifferenceMetres=Math.max(maxMotionDifferenceMetres,best);return candidates[differences.indexOf(best)];
    });
    const frontFaces=new Set(fg.faces.map(f=>cyclic(f.map(i=>coordinate(fg.vertices[i])))));
    let reversed=0,sameWinding=0,missing=0;
    for(const face of bg.faces){const points=face.map(i=>coordinate(bg.vertices[i]));if(frontFaces.has(cyclic([points[0],points[2],points[1]])))reversed++;else if(frontFaces.has(cyclic(points)))sameWinding++;else missing++;}
    assert.equal(missingBasePositions,0);assert.equal(maxMotionDifferenceMetres,0);assert.equal(sameWinding,0);assert.equal(missing,0);
    assert.deepEqual(front.position,back.position);assert.deepEqual(front.orientation,back.orientation);assert.equal(front.scale,back.scale);
    assert.deepEqual(front.animation.alpha,back.animation.alpha);
    return {side,backVertices:mapping.length,missingBasePositions,maxMotionDifferenceMetres,reversedFaces:reversed,sameWindingFaces:sameWinding,missingFaces:missing,transformsAndAlphaIdentical:true};
  });
  const binaryGeometry=verifyBinaryGeometry(source,binary),binaryAnimation=readBinaryEmission(binary);
  const binaryMeshes=inspectBinaryMeshes(binary).map(m=>({context:m.context,name:m.name,render:m.render,flags:m.flags,
    vertices:m.positions.length,faces:m.faces.length,drawTriangles:m.draws.reduce((n,d)=>n+d.length/3,0),
    vertexSetCount:m.vertexSetCount,samplePeriod:m.samplePeriod,controllerTypes:m.controllerTypes}));
  report.phases.push({phase,projectId,revision,snapshotSha256:integration.snapshotSha256,model:integration.model,
    lifecycle:doc.lifecycle,duration:doc.duration,integration:integration.visualeffects2da,meshes,backfaces,binaryGeometry,binaryAnimation,binaryMeshes});
  process.stdout.write(JSON.stringify({phase,passed:true,binaryGeometry,backfaces})+'\n');
}
const phasePose=(phase:string,time:number)=>documents[phase].layers.filter((l):l is MeshLayer=>l.type==='mesh'&&l.enabled).map(l=>({id:l.id,vertices:authoredMeshVertices(l,time),position:l.position,orientation:l.orientation,scale:l.scale}));
const boundary=(a:string,ta:number,b:string,tb:number)=>{
  const pa=phasePose(a,ta),pb=phasePose(b,tb);
  return pa.map((p,i)=>({layerId:p.id,vertexMaxMetres:Math.max(...p.vertices.map((v,j)=>distance(v,pb[i].vertices[j]))),positionMaxMetres:distance(p.position,pb[i].position),orientationExact:JSON.stringify(p.orientation)===JSON.stringify(pb[i].orientation),scaleExact:p.scale===pb[i].scale}));
};
report.boundaries={openingToLoop:boundary('open',.8,'loop',0),loopSeam:boundary('loop',1.4,'loop',0),loopToClosing:boundary('loop',1.4,'close',0),arbitraryHalfLoopToClosing:boundary('loop',.7,'close',0)};
for(const key of ['openingToLoop','loopSeam','loopToClosing'])for(const b of report.boundaries[key]){assert.equal(b.vertexMaxMetres,0);assert.equal(b.positionMaxMetres,0);assert(b.orientationExact&&b.scaleExact);}
for(const input of report.inputs)assert.equal(sha(await readFile(input.path)),input.sha256);
report.sourceArtifactsUnchanged=true;report.passed=true;
await writeFile(join(out,'exact-export-audit.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({passed:true,boundaries:report.boundaries,report:join(out,'exact-export-audit.json')})+'\n');
