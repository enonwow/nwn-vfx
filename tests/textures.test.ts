import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zlibSync } from 'fflate';
import { applyChanges, assertDocumentInvariants, changedFields, makeDocument, makeLayer, makeMeshLayer, promoteDocumentSchema, type EffectDocument } from '../packages/core/src/model.js';
import { buildMeshGeometry } from '../packages/core/src/mesh.js';
import { createTextureAsset, decodePngRgba8, decodeTextureAsset, effectiveBlend, emitterAppearancePoints, MAX_TEXTURE_BYTES, pngBytesFromBase64, resolveTexture, sampleEmitterAppearance, sha256Bytes, textureAssetMetadata } from '../packages/core/src/textures.js';
import { assertDocument, validateChanges, validateOperationInput, validateOperationOutput } from '../packages/contracts/src/schema.js';
import { orientationTexture, rgbaPng } from './fixtures/rgba-texture.js';

const bytes=orientationTexture(8),base64=Buffer.from(bytes).toString('base64');
const asset=createTextureAsset('asymmetric.png',base64);
const assetDocument=():EffectDocument=>({...makeDocument('empty'),schemaVersion:3,assets:[structuredClone(asset)]});
function concat(...parts:Uint8Array[]):Uint8Array {return Buffer.concat(parts);}
function u32(value:number){return Uint8Array.of(value>>>24,value>>>16,value>>>8,value);}
function chunk(type:string,data:Uint8Array):Uint8Array {
  const payload=concat(new TextEncoder().encode(type),data);let crc=0xffffffff;
  for(const byte of payload){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
  return concat(u32(data.length),payload,u32((crc^0xffffffff)>>>0));
}
function pngRaw(raw:Uint8Array,options:{width?:number;height?:number;depth?:number;type?:number;interlace?:number;extra?:Uint8Array;compressed?:Uint8Array}={}):Uint8Array {
  return concat(Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',concat(u32(options.width??8),u32(options.height??8),Uint8Array.of(options.depth??8,options.type??6,0,0,options.interlace??0))),options.extra??new Uint8Array(),chunk('IDAT',options.compressed??zlibSync(raw)),chunk('IEND',new Uint8Array()));
}

test('pure SHA256 matches published NIST vectors and independent Node implementation at block boundaries',()=>{
  for(const [input,expected] of [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc','ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq','248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['a'.repeat(1_000_000),'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
  ]) assert.equal(sha256Bytes(new TextEncoder().encode(input)),expected);
  for(const length of [1,55,56,63,64,65,127,128,129,2048]) {const source=Uint8Array.from({length},(_,i)=>(i*71+19)&255);assert.equal(sha256Bytes(source),createHash('sha256').update(source).digest('hex'));}
});
test('RGBA PNG roundtrip preserves top-down colored pixels, alpha, original bytes, identity and metadata',()=>{
  const source=rgbaPng(8,16,(x,y)=>[x*31,y*15,255-x*23,(x+y)*10]);const encoded=Buffer.from(source).toString('base64');
  const imported=createTextureAsset('kwadranty alfa.png',encoded),decoded=decodeTextureAsset(imported);
  assert.equal(imported.id,createHash('sha256').update(source).digest('hex'));assert.equal(imported.source.sha256,imported.id);assert.equal(imported.pngBase64,encoded);
  assert.deepEqual([...decoded.rgba.slice(0,8)],[0,0,255,0,31,0,232,10]);assert.deepEqual([...decoded.rgba.slice(-4)],[217,225,94,220]);
  assert.equal(decoded.width,8);assert.equal(decoded.height,16);assert.equal(Object.hasOwn(textureAssetMetadata(imported),'pngBase64'),false);
  for(const patch of [{id:'0'.repeat(64)},{width:16},{source:{fileName:'file.png',sha256:'0'.repeat(64)}}]) assert.throws(()=>decodeTextureAsset({...imported,...patch}));
});
test('PNG decoder handles all five scanline filters against independent encoded rows',()=>{
  const width=8,height=8,stride=width*4,expected=Uint8Array.from({length:stride*height},(_,i)=>(i*73+Math.floor(i/stride)*19)&255);
  for(let filter=0;filter<=4;filter++) {
    const raw=new Uint8Array((stride+1)*height);
    for(let y=0;y<height;y++){raw[y*(stride+1)]=filter;for(let x=0;x<stride;x++) {
      const i=y*stride+x,a=x>=4?expected[i-4]:0,b=y?expected[i-stride]:0,c=y&&x>=4?expected[i-stride-4]:0;
      const distances=[Math.abs(b-c),Math.abs(a-c),Math.abs(a+b-2*c)];let predictor=0;
      if(filter===1)predictor=a;else if(filter===2)predictor=b;else if(filter===3)predictor=(a+b)>>>1;else if(filter===4)predictor=[a,b,c][distances.indexOf(Math.min(...distances))];
      raw[y*(stride+1)+x+1]=(expected[i]-predictor)&255;
    }}
    assert.deepEqual(decodePngRgba8(pngRaw(raw)).rgba,expected,`filter ${filter}`);
  }
});
test('PNG rejects invalid chunks, CRC, dimensions, unsupported formats and decompression bounds',()=>{
  const raw=new Uint8Array(33*8),corrupt=bytes.slice();corrupt[corrupt.length-1]^=1;
  for(const input of [bytes.subarray(0,bytes.length-1),concat(bytes,Uint8Array.of(0)),corrupt,
    pngRaw(raw,{width:7}),pngRaw(raw,{height:2048}),pngRaw(raw,{type:2}),pngRaw(raw,{depth:16}),pngRaw(raw,{interlace:1}),
    pngRaw(new Uint8Array(33*8-1)),pngRaw(new Uint8Array(33*8+1)),pngRaw(new Uint8Array(5_000_000)),
    pngRaw(raw,{extra:chunk('ABCD',new Uint8Array())}),pngRaw(raw,{extra:chunk('acTL',new Uint8Array(8))}),
    pngRaw(raw,{extra:chunk('iCCP',new Uint8Array(8))}),pngRaw(raw,{extra:chunk('cHRM',new Uint8Array(32))}),
    pngRaw(raw,{extra:chunk('gAMA',u32(100000))}),
  ]) assert.throws(()=>decodePngRgba8(input));
  raw[0]=5;assert.throws(()=>decodePngRgba8(pngRaw(raw)),/filtr/);raw[0]=0;
  const compressed=zlibSync(raw);compressed[compressed.length-1]^=1;assert.throws(()=>decodePngRgba8(pngRaw(raw,{compressed})),/Adler/);
  assert.doesNotThrow(()=>decodePngRgba8(pngRaw(raw,{extra:concat(chunk('gAMA',u32(45455)),chunk('sRGB',Uint8Array.of(0)))})));
  assert.throws(()=>decodePngRgba8(new Uint8Array(MAX_TEXTURE_BYTES+1)),/2 MiB/);
});
test('base64 and filename input is bounded and does not accept paths or alternate byte encodings',()=>{
  assert.deepEqual(pngBytesFromBase64(base64),bytes);
  for(const value of ['',base64+'\n','AAAA=A==','A===','AB==','data:image/png;base64,'+base64,'A'.repeat(2796208)]) assert.throws(()=>pngBytesFromBase64(value));
  for(const name of ['../image.png','C:\\temp\\image.png','/tmp/image.png','https://host/image.png','bad\u0000.png']) assert.throws(()=>createTextureAsset(name,base64));
});
test('schema 3 assets are portable and immutable, missing references and duplicate assets fail before rendering',()=>{
  const document=assetDocument();document.layers[0].texture=`asset:${asset.id}`;assertDocument(document);
  const portable=JSON.parse(JSON.stringify(document));assert.deepEqual(resolveTexture(portable,portable.layers[0].texture).rgba,decodePngRgba8(bytes).rgba);
  assert.throws(()=>assertDocument({...document,schemaVersion:2}));
  assert.throws(()=>assertDocument({...document,assets:[]}),error=>(error as any).code==='MISSING_ASSET');
  assert.throws(()=>assertDocument({...document,assets:[asset,asset]}),/unikalne/);
  assert.throws(()=>assertDocument({...document,assets:[{...asset,pngBase64:Buffer.from(orientationTexture(16)).toString('base64')}]}),/Tożsamość/);
  assert.throws(()=>assertDocumentInvariants({...document,assets:Array(9).fill(asset)}),/8 tekstur/);
  assert.throws(()=>assertDocumentInvariants({...document,name:'x'.repeat(6*1024*1024)}),/6 MiB/);
  assert.equal(validateChanges([{type:'layer.set',layerId:'sparks',values:{assets:[]}}]),false);
});
test('procedural UV is bottom-left and custom UV has independent validated indexing',()=>{
  const disk=buildMeshGeometry({kind:'ring',innerRadius:0,outerRadius:2,segments:8});assert.deepEqual(disk.uv[0],[.5,.5]);assert.deepEqual(disk.uv[1],[1,.5]);assert.deepEqual(disk.uv[3],[.5,1]);assert.deepEqual(disk.uvFaces,disk.faces);
  const box=buildMeshGeometry({kind:'box',dimensions:[1,1,1]});assert.equal(box.uv.length,24);assert.equal(box.uvFaces.length,box.faces.length);
  // Every vertex shared by two triangles on one box face must sample identical UV.
  for(let face=0;face<12;face+=2) {const mapping=new Map<number,string>();for(let t=face;t<face+2;t++)for(let i=0;i<3;i++){
    const key=box.faces[t][i],uv=JSON.stringify(box.uv[box.uvFaces[t][i]]);if(mapping.has(key))assert.equal(mapping.get(key),uv);mapping.set(key,uv);
  }}
  const mesh={...makeMeshLayer('mesh','Triangle','custom'),texture:`asset:${asset.id}` as const};
  const document={...assetDocument(),layers:[mesh]};assert.throws(()=>assertDocument(document),/UV/);
  const geometry={kind:'custom' as const,vertices:[[0,0,0],[1,0,0],[0,1,0]] as [number,number,number][],faces:[[0,1,2]] as [number,number,number][],uv:[[0,1],[0,0],[1,0],[1,1]] as [number,number][],uvFaces:[[1,2,0]] as [number,number,number][]};
  mesh.geometry=geometry;assertDocument(document);
  for(const patch of [{uvFaces:[[0,1,4]]},{uvFaces:[]},{uv:[[0,-.1],[0,0],[1,1]]},{uv:undefined}])assert.throws(()=>assertDocument({...document,layers:[{...mesh,geometry:{...geometry,...patch}}]}));
});
test('new layer fields promote without demoting and null reset creates a reversible JSON diff',()=>{
  const old=makeDocument('empty'),next=applyChanges(old,[{type:'layer.set',layerId:'sparks',values:{blend:'normal',midPercent:.3,midAlpha:.8}}],true);
  assert.equal(old.schemaVersion,1);assert.equal(next.schemaVersion,3);assertDocument(next);
  assert.deepEqual(changedFields(old,next).find(item=>item.path.endsWith('/midAlpha')),{path:'/layers/sparks/midAlpha',before:null,after:.8});
  const reset=applyChanges(next,[{type:'layer.set',layerId:'sparks',values:{blend:null,midPercent:null,midAlpha:null}}],true);assertDocument(reset);assert.equal(Object.hasOwn(reset.layers[0],'midAlpha'),false);assert.equal(reset.schemaVersion,3);
  assert.equal(applyChanges(next,[{type:'layer.add',layer:makeMeshLayer('mesh')}],true).schemaVersion,3);
  const meshDoc={...assetDocument(),layers:[makeMeshLayer('mesh')]};
  assert.throws(()=>applyChanges(meshDoc,[{type:'layer.set',layerId:'mesh',values:{texture:null,midPercent:null}}],true),/emitera/);
  assert.throws(()=>applyChanges(old,[{type:'layer.set',layerId:'sparks',values:{texture:null}}],true),/Emiter wymaga/);
  const locked=structuredClone(next);locked.locks=[{layerId:'sparks',field:'midAlpha'}];assert.throws(()=>applyChanges(locked,[{type:'layer.set',layerId:'sparks',values:{midAlpha:null}}],false),/blokad/);
  assert.equal(promoteDocumentSchema({...makeDocument('empty'),assets:[]}).schemaVersion,3);
});
test('particle mid controls hit authored points, clamp ages and preserve linear legacy values',()=>{
  const layer={...makeLayer('particle'),color:'#000000',endColor:'#ffffff',alpha:1,endAlpha:0,size:1,endSize:0};
  const middle=sampleEmitterAppearance(layer,.5);assert.deepEqual(middle,{color:[.5,.5,.5],alpha:.5,size:.5});
  const authored={...layer,midColor:'#ff0000',midAlpha:.2,midSize:2,midPercent:.25};
  const atMid=sampleEmitterAppearance(authored,.25);assert.deepEqual(atMid.color,[1,0,0]);assert.equal(atMid.size,2);assert.ok(Math.abs(atMid.alpha-.2)<1e-12);
  assert.deepEqual(sampleEmitterAppearance(authored,-1),sampleEmitterAppearance(authored,0));assert.deepEqual(sampleEmitterAppearance(authored,2),sampleEmitterAppearance(authored,1));
  const auto={...layer,midPercent:.8};for(const age of [0,.1,.4,.8,.9,1]) {const result=sampleEmitterAppearance(auto,age);assert.ok(Math.abs(result.alpha-(1-age))<1e-12);assert.ok(Math.abs(result.color[0]-age)<1e-12);}
  const points=emitterAppearancePoints(authored);assert.deepEqual(sampleEmitterAppearance(authored,.7,points),sampleEmitterAppearance(authored,.7));
  for(const percent of [0,1,-.1,NaN])assert.throws(()=>assertDocument({...makeDocument('empty'),schemaVersion:3,layers:[{...authored,midPercent:percent}]}));
  assert.equal(effectiveBlend(layer),'additive');assert.equal(effectiveBlend({...layer,texture:'smoke'}),'normal');assert.equal(effectiveBlend({...layer,texture:`asset:${asset.id}`}),'normal');assert.equal(effectiveBlend(makeMeshLayer('mesh')),'normal');
});
test('asset operation schemas publish bounded inputs and metadata-only list outputs',()=>{
  validateOperationInput('assets.import',{projectId:'p',expectedRevision:1,fileName:'rgba.png',pngBase64:base64});
  assert.throws(()=>validateOperationInput('assets.import',{projectId:'p',expectedRevision:1,fileName:'C:\\file.png',pngBase64:base64}));
  validateOperationOutput('assets.list',{items:[textureAssetMetadata(asset)],nextCursor:null});
  assert.throws(()=>validateOperationOutput('assets.list',{items:[asset],nextCursor:null}));
  assert.throws(()=>validateOperationOutput('assets.list',{items:[textureAssetMetadata(asset)],nextCursor:'cursor'}));
  validateOperationOutput('assets.get',asset);assert.throws(()=>validateOperationOutput('assets.get',textureAssetMetadata(asset)));
  const project={id:'p',revision:2,document:assetDocument(),createdAt:'2026-09-05T00:00:00.000Z',updatedAt:'2026-09-05T00:00:00.000Z'};
  validateOperationOutput('assets.import',{project,assetId:asset.id});assert.throws(()=>validateOperationOutput('assets.import',{project,assetId:'fake'}));
});
