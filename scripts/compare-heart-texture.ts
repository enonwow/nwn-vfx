/** Independent comparison of two immutable exports: only resource names/TGA row storage may change. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {readAsciiMdl} from '../packages/nwn-format/src/mdl-reader.js';
import {readTga,readNwnTga} from '../packages/nwn-format/src/binary.js';
import {inspectBinaryMeshes,verifyBinaryGeometry} from '../packages/nwn-format/src/binary-geometry.js';
import {verifyBinaryNormals} from '../packages/nwn-format/src/binary-normals.js';
import {decodeTextureAsset} from '../packages/core/src/textures.js';
import {canonical,hash} from '../apps/service/src/store.js';

const out=resolve('output/texture-orientation-audit'),dir=join(out,'bottom-first-0142');
const baselineDir=resolve('output/animmesh-audit/controllers-fixed-0141');
const oldZip=await readFile(join(baselineDir,'candidate.zip')),newZip=await readFile(join(dir,'candidate.zip'));
const oldFiles=unzipSync(oldZip),newFiles=unzipSync(newZip);
const find=(files:Record<string,Uint8Array>,name:string)=>{const k=Object.keys(files).find(k=>k===name||k.endsWith('/'+name));assert(k,name);return files[k];};
const decode=(b:Uint8Array)=>new TextDecoder().decode(b),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const oldDoc=JSON.parse(decode(find(oldFiles,'effect-document.json'))),newDoc=JSON.parse(decode(find(newFiles,'effect-document.json')));
assert.deepEqual(newDoc,oldDoc);assert.equal(hash(canonical(newDoc)),'5675ce09546c078f6d1aa0359b0b61a3c4f9dbace033f54c4d88e9ed254ba5bf');
const oldValidation=JSON.parse(decode(find(oldFiles,'validation.json'))),newValidation=JSON.parse(decode(find(newFiles,'validation.json')));
assert.equal(newValidation.exporterVersion,'nwn-binary-vfx-0.14.2');
const oldTexture=oldValidation.readback.textures[0],newTexture=newValidation.readback.textures[0];
assert.equal(oldValidation.readback.textures.length,1);assert.equal(newValidation.readback.textures.length,1);
const oldRef=oldTexture.name.replace(/\.tga$/,''),newRef=newTexture.name.replace(/\.tga$/,'');assert.notEqual(newRef,oldRef);
const oldSource=find(oldFiles,'source-model.mdl.txt'),newSource=find(newFiles,'source-model.mdl.txt');
const oldParsed=readAsciiMdl(oldSource),newParsed=readAsciiMdl(newSource);
assert.notEqual(newParsed.model,oldParsed.model);
assert.deepEqual(newParsed,readAsciiMdl(decode(oldSource).replaceAll(oldParsed.model,newParsed.model).replaceAll(oldRef,newRef)),
  'Source MDL must differ only by model and texture resource names');
const oldBinary=find(oldFiles,`${oldParsed.model}.mdl`),newBinary=find(newFiles,`${newParsed.model}.mdl`);
const oldMeshes=inspectBinaryMeshes(oldBinary),newMeshes=inspectBinaryMeshes(newBinary);assert.equal(newMeshes.length,oldMeshes.length);
const nodes=oldMeshes.map(a=>{
  const b=newMeshes.find(b=>a.context===b.context&&a.name===b.name);assert(b);
  const arrays=['positions','uv','faces','draws','vertexSets','textureSets','controllerTypes'] as const;
  const unchanged=Object.fromEntries(arrays.map(k=>{assert.deepEqual(b[k],a[k],k);return[k,true];}));
  for(const k of ['flags','render','samplePeriod','vertexSetCount','textureSetCount'] as const)assert.equal(b[k],a[k],k);
  return{context:a.context,name:a.name,unchanged,vertexCount:b.positions.length,triangles:b.faces.length,
    vertexSetCount:b.vertexSetCount,textureSetCount:b.textureSetCount,samplePeriod:b.samplePeriod};
});
const oldNormals=verifyBinaryNormals(oldSource,oldBinary),newNormals=verifyBinaryNormals(newSource,newBinary);
assert.equal(newNormals.binaryCornerNormalsSha256,oldNormals.binaryCornerNormalsSha256);
const oldTga=find(oldFiles,oldTexture.name),newTga=find(newFiles,newTexture.name);
assert.equal(oldTga[17],0x28);assert.equal(newTga[17],0x08);
const png=decodeTextureAsset(newDoc.assets[0]),oldImage=readTga(oldTga),image=readTga(newTga),nativeImage=readNwnTga(newTga);
assert.equal(image.width,png.width);assert.equal(image.height,png.height);assert.equal(image.origin,'bottom-left');
assert.deepEqual(image.rgba,png.rgba);assert.deepEqual(nativeImage.rgba,png.rgba);assert.deepEqual(oldImage.rgba,png.rgba);
assert.notDeepEqual(readNwnTga(oldTga).rgba,png.rgba);
// Read every new raw payload pixel independently of both production decoders.
let minAlpha=255,maxAlpha=0;
for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
  const i=(y*png.width+x)*4,j=18+((png.height-1-y)*png.width+x)*4;
  assert.equal(newTga[j+2],png.rgba[i]);assert.equal(newTga[j+1],png.rgba[i+1]);
  assert.equal(newTga[j],png.rgba[i+2]);assert.equal(newTga[j+3],png.rgba[i+3]);
  minAlpha=Math.min(minAlpha,newTga[j+3]);maxAlpha=Math.max(maxAlpha,newTga[j+3]);
}
const historical=Uint8Array.from(newTga),stride=png.width*4;historical[17]=0x28;
for(let y=0;y<png.height;y++)historical.set(newTga.subarray(18+(png.height-1-y)*stride,18+(png.height-y)*stride),18+y*stride);
assert.deepEqual(historical,oldTga,'Only row order and descriptor may change in TGA');
assert.equal(newTexture.rgbaSha256,sha(png.rgba));assert.equal(newTexture.nwnBottomFirstRgbaSha256,sha(png.rgba));
assert.equal(newTexture.generator,'shared-rgba-tga-bottom-first-2');
assert.deepEqual(find(newFiles,newTexture.txi.name),find(oldFiles,oldTexture.txi.name));
assert.equal(minAlpha,255);assert.equal(maxAlpha,255);
const proof={passed:true,documentSha256:hash(canonical(newDoc)),documentUnchanged:true,
  sourceModelBefore:oldParsed.model,sourceModelAfter:newParsed.model,sourceOnlyModelAndBitmapNamesChanged:true,
  binarySha256Before:sha(oldBinary),binarySha256After:sha(newBinary),zipSha256:sha(newZip),
  nodes,normalArraysUnchanged:true,staticNormalSha256:newNormals.binaryCornerNormalsSha256,
  texture:{before:oldTexture.name,after:newTexture.name,txiBefore:oldTexture.txi.name,txiAfter:newTexture.txi.name,
    tgaSha256Before:sha(oldTga),tgaSha256After:sha(newTga),descriptorBefore:oldTga[17],descriptorAfter:newTga[17],
    width:png.width,height:png.height,checkedRgbaBytes:png.rgba.length,rgbaSha256:sha(png.rgba),
    pngSha256:newDoc.assets[0].id,minAlpha,maxAlpha,allRawPayloadTexelsMatchPng:true,standardAndBottomFirstDecodersMatchPng:true,
    oldBottomFirstDecoderMatchesPng:false,onlySerializedRowsAndDescriptorChanged:true,txiBytesUnchanged:true},
  geometryReadback:verifyBinaryGeometry(newSource,newBinary),nativeVerified:false,
  nativeInterpretation:'The row-order reproducer explains the observed texture patches; confirmation requires the consumer\'s single labeled SERCE-A test. Playback and actor attachment are not established by this export.'};
await writeFile(join(out,'bottom-first-vs-0141.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));
