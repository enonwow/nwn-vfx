import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {readAsciiMdl} from '../packages/nwn-format/src/mdl-reader.js';
import {inspectBinaryMeshes,verifyBinaryGeometry} from '../packages/nwn-format/src/binary-geometry.js';
import {verifyBinaryNormals} from '../packages/nwn-format/src/binary-normals.js';
import {canonical,hash} from '../apps/service/src/store.js';
const original=resolve('C:/Projects/the last city/assets/vfx/wampir/bijace-serce/export/r4/candidate'),out=resolve('output/animmesh-audit');
const dir=join(out,'controllers-fixed-0141'),files=unzipSync(await readFile(join(dir,'candidate.zip')));
const find=(name:string)=>{const k=Object.keys(files).find(k=>k===name||k.endsWith('/'+name));assert(k,name);return files[k];};
const sourceBefore=await readFile(join(original,'source-model.mdl.txt')),sourceAfter=find('source-model.mdl.txt');
const before=readAsciiMdl(sourceBefore),after=readAsciiMdl(sourceAfter);
const normalized=readAsciiMdl(new TextDecoder().decode(sourceBefore).replaceAll(before.model,after.model));
const removed:Array<{context:string;node:string;field:string;value:string[]}> = [];
for(const a of normalized.animations)for(const n of a.nodes)if(n.type==='animmesh')for(const field of ['position','orientation','scale','alpha']){
  assert(n.properties[field]&&n.tracks[field]);removed.push({context:a.name,node:n.name,field,value:n.properties[field]});delete n.properties[field];
}
assert.deepEqual(after,normalized,'unexpected source semantic change');
const binaryBefore=await readFile(join(original,'vfxe9dd4bc745f9.mdl')),binaryAfter=await readFile(join(dir,'vh_ctrl0141.mdl'));
const oldMeshes=inspectBinaryMeshes(binaryBefore),newMeshes=inspectBinaryMeshes(binaryAfter);
const arrays=['positions','uv','faces','draws','vertexSets','textureSets'] as const;
const nodes=oldMeshes.map(a=>{
  const b=newMeshes.find(b=>a.context===b.context&&a.name===b.name);assert(b);
  const unchanged=Object.fromEntries(arrays.map(k=>{assert.deepEqual(b[k],a[k],k);return[k,true];}));
  for(const k of ['flags','render','samplePeriod','vertexSetCount','textureSetCount'] as const)assert.equal(b[k],a[k],k);
  assert.equal(new Set(b.controllerTypes).size,b.controllerTypes.length);
  return{context:a.context,name:a.name,unchanged,controllersBefore:a.controllerTypes,controllersAfter:b.controllerTypes};
});
const oldNormals=verifyBinaryNormals(sourceBefore,binaryBefore),newNormals=verifyBinaryNormals(sourceAfter,binaryAfter);
assert.equal(oldNormals.binaryCornerNormalsSha256,newNormals.binaryCornerNormalsSha256);
const oldDoc=JSON.parse(await readFile(join(original,'effect-document.json'),'utf8')),newDoc=JSON.parse(new TextDecoder().decode(find('effect-document.json')));
assert.equal(hash(canonical(oldDoc)),hash(canonical(newDoc)));
const oldTga=await readFile(join(original,'vfx_0f8dabf324e1.tga')),newTga=find('vfx_0f8dabf324e1.tga');assert.deepEqual(Uint8Array.from(oldTga),newTga);
const sha=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
const proof={passed:true,documentSha256:hash(canonical(newDoc)),sourceModelBefore:before.model,sourceModelAfter:after.model,
  binarySha256Before:sha(binaryBefore),binarySha256After:sha(binaryAfter),removedStaticControllers:removed,sourceOtherwiseIdentical:true,
  nodes,normalArraysUnchanged:true,textureBytesUnchanged:true,geometryReadback:verifyBinaryGeometry(sourceAfter,binaryAfter),
  nativeCause:'unresolved until controlled consumer observation',nativeVerified:false};
await writeFile(join(out,'fixed-vs-r4.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
