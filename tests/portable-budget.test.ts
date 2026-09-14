import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import { exportProjectBundle, importProjectBundle } from '../apps/service/src/project-bundle.js';
import { canonical, hash } from '../apps/service/src/store.js';
import { CONTRACT_VERSION, MAX_DOCUMENT_BYTES, makeDocument, makeMeshLayer, type EffectDocument, type Project, type Vec3 } from '../packages/core/src/model.js';
import { createTextureAsset, textureAssetMetadata } from '../packages/core/src/textures.js';
import { assertDocument } from '../packages/contracts/src/schema.js';
import { rgbaPng, orientationTexture } from './fixtures/rgba-texture.js';

const MiB = 1024 * 1024;
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const project = (document: EffectDocument): Project => ({id:'portable-fixture',revision:35,document,createdAt:'2026-09-06T00:00:00Z',updatedAt:'2026-09-06T00:00:00Z'});
function filesFor(document: EffectDocument, version: 1|2|3, pretty = false) {
  const stored = version === 3 && document.assets !== undefined ? {...document,assets:document.assets.map(textureAssetMetadata)} : document;
  const bytes = strToU8(JSON.stringify(stored,null,pretty?2:undefined));
  const files: Record<string,Uint8Array> = {'project.json':bytes};
  const assets = (document.assets??[]).map(asset => {
    const path = `assets/${asset.id}.png`, png = Buffer.from(asset.pngBase64,'base64'); files[path]=png;
    return {...textureAssetMetadata(asset),path,size:png.length};
  });
  files['manifest.json']=strToU8(JSON.stringify({schemaVersion:version,contractVersion:CONTRACT_VERSION,projectId:'portable-fixture',revision:35,
    documentSha256:hash(bytes),snapshotSha256:hash(canonical(document)),assets}));
  return files;
}
function smallDocument() {
  const document=makeDocument('empty','Portable exact snapshot'); document.schemaVersion=5;
  const asset=createTextureAsset('quadrants.png',base64(orientationTexture(16)),512);
  document.assets=[asset]; document.layers[0].texture=`asset:${asset.id}`;
  const mesh={...makeMeshLayer('mesh'),texture:`asset:${asset.id}` as const,material:{diffuse:'#839ac2',selfIllumination:'#000000'}};
  document.layers.push(mesh); document.locks=[{layerId:'mesh',field:'texture'}];
  return document;
}
let nearBudget: EffectDocument | undefined;
function nearBudgetDocument() {
  if (nearBudget) return structuredClone(nearBudget);
  const document=makeDocument('empty','B');document.schemaVersion=5;
  // Independent deterministic high-entropy RGBA PNGs reproduce cross-entry duplication.
  let random=0x47a6392d;
  const byte=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return random>>>24;};
  document.assets=[512,512,512,512,256].map((size,index)=>createTextureAsset(`noise-${index}.png`,base64(rgbaPng(size,size,()=>[byte(),byte(),byte(),byte()]))));
  document.layers[0].texture=`asset:${document.assets[0].id}`;
  let size=Buffer.byteLength(JSON.stringify(document));
  while (size < MAX_DOCUMENT_BYTES-180) {
    const mesh=makeMeshLayer(`geometry-${document.layers.length}`,'Budget geometry','custom');
    assert.equal(mesh.geometry.kind,'custom');
    if(mesh.geometry.kind!=='custom')throw new Error('fixture');
    const overhead=Buffer.byteLength(JSON.stringify(mesh))+1;
    if(size+overhead>MAX_DOCUMENT_BYTES-16)break;
    const vertex: Vec3=[.12345678901234568,0,0], cost=Buffer.byteLength(JSON.stringify(vertex))+1;
    const count=Math.min(2045,Math.floor((MAX_DOCUMENT_BYTES-16-size-overhead)/cost));
    mesh.geometry.vertices.push(...Array.from({length:count},()=>[...vertex] as Vec3));
    document.layers.push(mesh);size=Buffer.byteLength(JSON.stringify(document));
  }
  const padding=MAX_DOCUMENT_BYTES-16-size;
  assert.ok(padding>=0&&padding<160,`remaining fixture padding ${padding}`);
  document.name+='x'.repeat(padding);
  assert.equal(Buffer.byteLength(JSON.stringify(document)),MAX_DOCUMENT_BYTES-16);
  assertDocument(document);nearBudget=structuredClone(document);return document;
}
const importFiles=(files:Record<string,Uint8Array>)=>importProjectBundle(base64(zipSync(files)));
const rejectsCode=(run:()=>unknown,code:string)=>assert.throws(run,(error:any)=>error.code===code);

test('portable v3 stores PNG once and reconstructs all authored fields, provenance and canonical snapshot',()=>{
  const document=smallDocument(),before=canonical(document),bundle=exportProjectBundle(project(document));
  const files=unzipSync(bundle),manifest=JSON.parse(strFromU8(files['manifest.json'])),stored=JSON.parse(strFromU8(files['project.json']));
  assert.equal(manifest.schemaVersion,3);
  assert.deepEqual(stored.assets,document.assets!.map(textureAssetMetadata));
  assert.equal(manifest.documentSha256,hash(files['project.json']));
  assert.equal(manifest.snapshotSha256,hash(before));
  assert.equal(Object.hasOwn(stored.assets[0],'pngBase64'),false);
  for(const asset of document.assets!) assert.deepEqual(Buffer.from(files[`assets/${asset.id}.png`]),Buffer.from(asset.pngBase64,'base64'));
  const restored=importProjectBundle(base64(bundle));assert.deepEqual(restored,document);assert.equal(canonical(restored),before);
  assert.equal(canonical(document),before,'export cannot mutate the source snapshot');
});

test('independent document 16 bytes below 6 MiB roundtrips within unchanged ZIP and expanded budgets',()=>{
  const document=nearBudgetDocument(),legacy=zipSync(filesFor(document,2),{level:9});
  assert.ok(legacy.length>8*MiB,`legacy ZIP must reproduce the issue: ${legacy.length}`);
  const bundle=exportProjectBundle(project(document)),files=unzipSync(bundle);
  assert.ok(bundle.length<=8*MiB);
  assert.ok(Object.values(files).reduce((sum,file)=>sum+file.length,0)<=12*MiB);
  const restored=importProjectBundle(base64(bundle));assert.deepEqual(restored,document);
  assert.equal(hash(canonical(restored)),hash(canonical(document)));
  assert.equal(Buffer.byteLength(JSON.stringify(restored)),MAX_DOCUMENT_BYTES-16);
});

test('legacy v1 and v2 bundles remain readable, including pretty JSON',()=>{
  const legacy=makeDocument('empty');assert.deepEqual(importFiles(filesFor(legacy,1,true)),legacy);
  const withAssets=smallDocument();assert.deepEqual(importFiles(filesFor(withAssets,2,true)),withAssets);
});

test('v3 rejects missing, tampered, duplicate and malformed asset dependencies',()=>{
  const document=smallDocument(),files=filesFor(document,3),asset=document.assets![0],path=`assets/${asset.id}.png`;
  const missing={...files};delete missing[path];rejectsCode(()=>importFiles(missing),'MISSING_ASSET');
  rejectsCode(()=>importFiles({...files,[path]:orientationTexture(8)}),'BUNDLE_HASH_MISMATCH');
  const changeStored=(edit:(value:any)=>void)=>{
    const stored=JSON.parse(strFromU8(files['project.json']));edit(stored);
    const bytes=strToU8(JSON.stringify(stored)),manifest=JSON.parse(strFromU8(files['manifest.json']));
    return {...files,'project.json':bytes,'manifest.json':strToU8(JSON.stringify({...manifest,documentSha256:hash(bytes)}))};
  };
  rejectsCode(()=>importFiles(changeStored(stored=>stored.assets[0].pngBase64=asset.pngBase64)),'INVALID_BUNDLE');
  rejectsCode(()=>importFiles(changeStored(stored=>stored.assets.push(stored.assets[0]))),'INVALID_BUNDLE');
  rejectsCode(()=>importFiles(changeStored(stored=>stored.assets[0].id='../foreign')),'INVALID_BUNDLE');
  rejectsCode(()=>importFiles(changeStored(stored=>stored.assets[0].width=8)),'INVALID_TEXTURE');
  rejectsCode(()=>importFiles({...files,'unexpected.png':orientationTexture(8)}),'UNSAFE_BUNDLE');
  const badManifest=JSON.parse(strFromU8(files['manifest.json']));badManifest.assets[0].size++;
  rejectsCode(()=>importFiles({...files,'manifest.json':strToU8(JSON.stringify(badManifest))}),'BUNDLE_HASH_MISMATCH');
});

test('ZIP, per-entry, total expansion and hydrated document limits remain enforced',()=>{
  rejectsCode(()=>importProjectBundle(base64(new Uint8Array(8*MiB+1))),'LIMIT_EXCEEDED');
  const files=filesFor(smallDocument(),3);
  rejectsCode(()=>importFiles({...files,'project.json':new Uint8Array(MAX_DOCUMENT_BYTES+1)}),'UNSAFE_BUNDLE');
  rejectsCode(()=>importFiles({...files,'manifest.json':new Uint8Array(128*1024+1)}),'UNSAFE_BUNDLE');
  rejectsCode(()=>importFiles({...files,[`assets/${'0'.repeat(64)}.png`]:new Uint8Array(2*MiB+1)}),'UNSAFE_BUNDLE');
  const expanded:Record<string,Uint8Array>={'project.json':new Uint8Array(MAX_DOCUMENT_BYTES),'manifest.json':strToU8('{}')};
  for(let i=0;i<4;i++)expanded[`assets/${String(i).repeat(64)}.png`]=new Uint8Array(2*MiB);
  rejectsCode(()=>importFiles(expanded),'UNSAFE_BUNDLE');
  const oversized=nearBudgetDocument();oversized.name+='x'.repeat(17);
  assert.equal(Buffer.byteLength(JSON.stringify(oversized)),MAX_DOCUMENT_BYTES+1);
  rejectsCode(()=>exportProjectBundle(project(oversized)),'LIMIT_EXCEEDED');
  rejectsCode(()=>importFiles(filesFor(oversized,3)),'LIMIT_EXCEEDED');
});

test('understated ZIP original size cannot hide actual DEFLATE expansion behind valid JSON prefix',()=>{
  const document=makeDocument('empty'),files=filesFor(document,1),prefix=files['project.json'];
  files['project.json']=strToU8(strFromU8(prefix)+' '.repeat(MAX_DOCUMENT_BYTES));
  const bytes=Buffer.from(zipSync(files));
  // Preserve hashes for the valid prefix; falsify both local and directory sizes.
  for(let offset=0;offset<bytes.length-46;offset++) {
    const signature=bytes.readUInt32LE(offset);
    if(signature===0x04034b50&&bytes.toString('utf8',offset+30,offset+42)==='project.json')bytes.writeUInt32LE(prefix.length,offset+22);
    if(signature===0x02014b50&&bytes.toString('utf8',offset+46,offset+58)==='project.json')bytes.writeUInt32LE(prefix.length,offset+24);
  }
  rejectsCode(()=>importProjectBundle(base64(bytes)),'UNSAFE_BUNDLE');
});
