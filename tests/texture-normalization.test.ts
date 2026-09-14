import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTextureAsset, decodePngRgba8, decodeTextureAsset, encodePngRgba8, MAX_TEXTURE_BYTES, MAX_NORMALIZATION_INPUT_BYTES, TEXTURE_CAPABILITIES, textureAssetMetadata } from '../packages/core/src/textures.js';
import { makeDocument, type TextureAsset } from '../packages/core/src/model.js';
import { assertDocument, validateOperationInput, validateOperationOutput } from '../packages/contracts/src/schema.js';
import { orientationTexture, rgbaPng, rgbPng } from './fixtures/rgba-texture.js';

const base64=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64');
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const rgba=(asset:TextureAsset,x:number,y:number,pixels=decodeTextureAsset(asset))=>Array.from(pixels.rgba.subarray((y*pixels.width+x)*4,(y*pixels.width+x)*4+4));
function patchHeader(png:Uint8Array,offset:number,value:number):Uint8Array {
  const result=png.slice();result[offset]=value;let crc=0xffffffff;
  for(const byte of result.subarray(12,29)){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
  new DataView(result.buffer).setUint32(29,(crc^0xffffffff)>>>0);return result;
}

test('omitting targetSize preserves exact strict PNG bytes and identity; 1254-pixel originals require explicit normalization',()=>{
  const original=orientationTexture(32),asset=createTextureAsset('original.png',base64(original));
  assert.equal(asset.pngBase64,base64(original));assert.equal(asset.id,hash(original));assert.equal(asset.source.sha256,asset.id);assert.equal(asset.source.normalization,undefined);
  const nonPot=rgbaPng(1254,1254,()=>[220,100,30,128]);
  assert.ok(nonPot.length<MAX_TEXTURE_BYTES);assert.throws(()=>createTextureAsset('1254.png',base64(nonPot)),/potęgami dwóch/);
  assert.throws(()=>decodePngRgba8(nonPot),/potęgami dwóch/);
  const normalized=createTextureAsset('1254.png',base64(nonPot),1024);
  assert.equal(normalized.width,1024);assert.equal(normalized.height,1024);assert.equal(normalized.source.normalization?.originalSha256,hash(nonPot));
  assert.equal(normalized.source.normalization?.method,'area');assert.equal(normalized.source.normalization?.originalWidth,1254);
  assert.deepEqual(rgba(normalized,512,512),[220,100,30,128]);
});

test('area downsampling averages in linear sRGB and never mixes hidden transparent color into an alpha edge',()=>{
  const grayscale=rgbaPng(1024,512,(x)=>x%2?[0,0,0,255]:[255,255,255,255]);
  const average=createTextureAsset('linear.png',base64(grayscale),512),pixels=decodeTextureAsset(average);
  for(const [x,y] of [[0,128],[237,200],[511,383]])assert.deepEqual(rgba(average,x,y,pixels),[188,188,188,255]);
  assert.deepEqual(rgba(average,20,127,pixels),[0,0,0,0]);assert.deepEqual(rgba(average,20,384,pixels),[0,0,0,0]);
  const alpha=rgbaPng(1024,512,(x,y)=>y<2?[0,255,255,0]:x%2?[0,0,255,0]:[255,0,0,255]);
  const edge=createTextureAsset('alpha.png',base64(alpha),512),edgePixels=decodeTextureAsset(edge);
  assert.deepEqual(rgba(edge,120,200,edgePixels),[255,0,0,128]);assert.deepEqual(rgba(edge,120,128,edgePixels),[0,0,0,0]);
  // A 3:2 reduction must use fractional pixel coverage, not a fixed box or nearest sample.
  const fractional=createTextureAsset('fractional.png',base64(rgbaPng(768,512,x=>x%2?[0,0,0,255]:[255,255,255,255])),512),fractionalPixels=decodeTextureAsset(fractional);
  assert.deepEqual([0,1,2,3].map(x=>rgba(fractional,x,100,fractionalPixels)[0]),[213,213,156,156]);
});

test('bilinear upscale uses clamped pixel centers, linear sRGB and premultiplied alpha',()=>{
  const source=rgbaPng(2,1,(x)=>x?[0,0,0,255]:[255,255,255,255]),asset=createTextureAsset('two-pixels.png',base64(source),512),pixels=decodeTextureAsset(asset);
  assert.equal(asset.source.normalization?.method,'bilinear');assert.deepEqual(rgba(asset,255,128,pixels),[188,188,188,255]);
  assert.deepEqual(rgba(asset,0,128,pixels),[255,255,255,255]);assert.deepEqual(rgba(asset,511,128,pixels),[0,0,0,255]);
  const edge=createTextureAsset('edge.png',base64(rgbaPng(2,1,x=>x?[0,0,255,0]:[255,0,0,255])),512),edgePixels=decodeTextureAsset(edge);
  assert.deepEqual(rgba(edge,255,256,edgePixels),[255,0,0,128]);assert.deepEqual(rgba(edge,511,256,edgePixels),[0,0,0,0]);
  const single=createTextureAsset('one.png',base64(rgbaPng(1,1,()=>[11,99,201,77])),512),singlePixels=decodeTextureAsset(single);
  assert.deepEqual(rgba(single,0,0,singlePixels),[11,99,201,77]);assert.deepEqual(rgba(single,511,511,singlePixels),[11,99,201,77]);
});

test('contain fitting records deterministic rounded content dimensions and transparent centered padding with no crop or stretch to square',()=>{
  const source=rgbaPng(3,2,(x,y)=>[x*100,y*200,50,255]),asset=createTextureAsset('landscape.png',base64(source),512),pixels=decodeTextureAsset(asset);
  assert.deepEqual(asset.source.normalization,{version:1,method:'bilinear',colorSpace:'linear-srgb',alphaMode:'premultiplied',originalSha256:hash(source),
    originalWidth:3,originalHeight:2,originalColorType:6,targetSize:512,contentWidth:512,contentHeight:341,offsetX:0,offsetY:85});
  assert.deepEqual(rgba(asset,0,84,pixels),[0,0,0,0]);assert.deepEqual(rgba(asset,0,85,pixels),[0,0,50,255]);
  assert.deepEqual(rgba(asset,511,425,pixels),[200,200,50,255]);assert.deepEqual(rgba(asset,511,426,pixels),[0,0,0,0]);
  const portrait=createTextureAsset('portrait.png',base64(rgbaPng(2,3,()=>[5,40,240,255])),512),portraitPixels=decodeTextureAsset(portrait);
  assert.equal(portrait.source.normalization?.contentWidth,341);assert.equal(portrait.source.normalization?.contentHeight,512);assert.equal(portrait.source.normalization?.offsetX,85);
  assert.deepEqual(rgba(portrait,84,100,portraitPixels),[0,0,0,0]);assert.deepEqual(rgba(portrait,425,100,portraitPixels),[5,40,240,255]);assert.deepEqual(rgba(portrait,426,100,portraitPixels),[0,0,0,0]);
  const thin=createTextureAsset('thin.png',base64(rgbaPng(1,4096,()=>[255,30,10,255])),512),thinPixels=decodeTextureAsset(thin);
  assert.equal(thin.source.normalization?.contentWidth,1);assert.equal(thin.source.normalization?.offsetX,255);
  assert.deepEqual(rgba(thin,255,100,thinPixels),[255,30,10,255]);assert.deepEqual(rgba(thin,254,100,thinPixels),[0,0,0,0]);
});

test('normalization is deterministic and hashes stored PNG separately from immutable original provenance',()=>{
  const source=rgbaPng(37,21,(x,y)=>[x*6,y*11,90,(x+y)%3?180:0]),encoded=base64(source);
  const first=createTextureAsset('deterministic.png',encoded,512),again=createTextureAsset('deterministic.png',encoded,512);
  assert.deepEqual(again,first);assert.equal(first.id,hash(Buffer.from(first.pngBase64,'base64')));assert.equal(first.source.sha256,first.id);
  assert.equal(first.source.normalization?.originalSha256,hash(source));assert.notEqual(first.id,hash(source));
  assert.equal(first.source.normalization?.originalWidth,37);assert.equal(first.source.normalization?.originalHeight,21);
  const strict=decodePngRgba8(Buffer.from(first.pngBase64,'base64'));assert.equal(strict.width,512);assert.equal(strict.height,512);
  assertDocument({...makeDocument('empty'),schemaVersion:3,assets:[first]});
  validateOperationOutput('assets.get',first);validateOperationOutput('assets.list',{items:[textureAssetMetadata(first)],nextCursor:null});
  assert.equal(textureAssetMetadata(first).source.normalization?.originalSha256,hash(source));
  assert.equal(Object.hasOwn(textureAssetMetadata(first),'pngBase64'),false);
});

test('normalization rejects invalid original formats, dimensions, CRC, invalid target and excessive input bytes',()=>{
  const small=rgbaPng(3,2,()=>[255,255,255,255]);
  for(const source of [patchHeader(small,24,16),patchHeader(small,25,3),patchHeader(small,28,1),small.subarray(0,small.length-1),
    rgbaPng(4097,1,()=>[1,2,3,4]),rgbaPng(0,8,()=>[1,2,3,4])])assert.throws(()=>createTextureAsset('invalid.png',base64(source),512));
  const badCrc=small.slice();badCrc[badCrc.length-1]^=1;assert.throws(()=>createTextureAsset('crc.png',base64(badCrc),512),/CRC/);
  assert.throws(()=>createTextureAsset('oversize.png',base64(new Uint8Array(MAX_NORMALIZATION_INPUT_BYTES+1)),512),/8 MiB/);
  for(const target of [0,256,513,2048,NaN,null])assert.throws(()=>createTextureAsset('size.png',base64(small),target as any));
  for(const targetSize of [512,1024])validateOperationInput('assets.import',{projectId:'project',expectedRevision:1,fileName:'size.png',pngBase64:base64(small),targetSize});
  assert.throws(()=>validateOperationInput('assets.import',{projectId:'project',expectedRevision:1,fileName:'size.png',pngBase64:base64(small),targetSize:256}));
  assert.deepEqual(TEXTURE_CAPABILITIES.normalization.targetSizes,[512,1024]);assert.equal(TEXTURE_CAPABILITIES.normalization.maxInputDimension,4096);
});

test('normalized metadata must agree with recomputed geometry and actual transparent padding',()=>{
  const asset=createTextureAsset('metadata.png',base64(rgbaPng(6,3,()=>[128,64,20,255])),512);
  for(const patch of [{offsetX:1},{offsetY:127},{contentHeight:257},{contentWidth:511},{targetSize:1024},{originalWidth:0},{originalHeight:4097},
    {method:'area'},{version:2},{colorSpace:'srgb'},{alphaMode:'straight'},{originalColorType:3},{originalColorType:undefined},{originalSha256:'not-a-hash'}]) {
    const altered=structuredClone(asset);Object.assign(altered.source.normalization!,patch);assert.throws(()=>decodeTextureAsset(altered));
  }
  const pixels=decodeTextureAsset(asset);pixels.rgba[3]=255;const wrongPadding=encodePngRgba8(pixels),id=hash(wrongPadding);
  assert.throws(()=>decodeTextureAsset({...asset,id,pngBase64:base64(wrongPadding),source:{...asset.source,sha256:id}}),/Dopełnienie/);
  // Without original source bytes, a syntactically valid claimed original digest is
  // provenance only. Validation deliberately does not pretend to re-derive it.
  const provenance=structuredClone(asset);provenance.source.normalization!.originalSha256='0'.repeat(64);assert.doesNotThrow(()=>decodeTextureAsset(provenance));
  const unknown=structuredClone(asset) as any;unknown.source.normalization.arbitrary='ignored';
  assert.throws(()=>assertDocument({...makeDocument('empty'),schemaVersion:3,assets:[unknown]}));
});

test('RGB8 normalization reconstructs all PNG filters with three-byte stride and supplies opaque alpha',()=>{
  const color=(x:number,y:number):[number,number,number]=>[(x*73+y*41)&255,(x*19+y*127)&255,(x*227+y*53)&255];
  const expected=new Uint8Array(512*512*4);
  for(let y=0;y<8;y++)for(let x=0;x<512;x++)expected.set([...color(x,y),255],((y+252)*512+x)*4);
  for(let filter=0;filter<=4;filter++) {
    const source=rgbPng(512,8,color,filter);
    assert.throws(()=>createTextureAsset('rgb-strict.png',base64(source)),/RGBA/);
    assert.throws(()=>decodePngRgba8(source),/RGBA/);
    const asset=createTextureAsset('rgb-filter.png',base64(source),512),decoded=decodeTextureAsset(asset);
    assert.deepEqual(decoded.rgba,expected,`RGB PNG filter ${filter}`);
    assert.equal(asset.source.normalization?.originalColorType,2);assert.equal(asset.source.normalization?.originalSha256,hash(source));
    assert.equal(Buffer.from(asset.pngBase64,'base64')[25],6,'stored PNG must be RGBA8');
  }
});

test('large valid RGB source is accepted only with explicit target; strict and stored payload limits remain 2 MiB',()=>{
  let seed=71236789;
  const byte=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed&255;};
  const source=rgbPng(1024,768,()=>[byte(),byte(),byte()]),encoded=base64(source);
  assert.ok(source.length>MAX_TEXTURE_BYTES);assert.ok(source.length<MAX_NORMALIZATION_INPUT_BYTES);
  assert.throws(()=>createTextureAsset('large-rgb.png',encoded),error=>(error as any).code==='LIMIT_EXCEEDED');
  const asset=createTextureAsset('large-rgb.png',encoded,512);
  assert.ok(Buffer.from(asset.pngBase64,'base64').length<=MAX_TEXTURE_BYTES);assert.equal(asset.source.normalization?.originalColorType,2);
  const decoded=decodeTextureAsset(asset);for(let y=64;y<448;y++)for(let x=0;x<512;x++)assert.equal(decoded.rgba[(y*512+x)*4+3],255);
  const input={projectId:'project',expectedRevision:1,fileName:'large-rgb.png',pngBase64:encoded};
  assert.throws(()=>validateOperationInput('assets.import',input));
  validateOperationInput('assets.import',{...input,targetSize:512});
  validateOperationOutput('assets.get',asset);
  assert.throws(()=>validateOperationOutput('assets.get',{...asset,pngBase64:encoded}));
  assert.equal(TEXTURE_CAPABILITIES.normalization.maxInputFileBytes,8*1024*1024);
  assert.deepEqual(TEXTURE_CAPABILITIES.normalization.formats,['png-rgb8','png-rgba8']);
  assert.deepEqual(TEXTURE_CAPABILITIES.formats,['png-rgba8']);
});

test('RGB normalization rejects transparency keys and unsupported RGB encoding features',()=>{
  const source=rgbPng(8,8,()=>[20,40,60]);
  for(const invalid of [patchHeader(source,24,16),patchHeader(source,25,0),patchHeader(source,25,3),patchHeader(source,28,1)])
    assert.throws(()=>createTextureAsset('unsupported-rgb.png',base64(invalid),512));
  // Independent ancillary chunk constructor for the RGB tRNS transparency key.
  const transparency=Uint8Array.of(0,20,0,40,0,60),chunk=new Uint8Array(12+transparency.length),view=new DataView(chunk.buffer);
  view.setUint32(0,transparency.length);chunk.set(new TextEncoder().encode('tRNS'),4);chunk.set(transparency,8);
  let crc=0xffffffff;for(const byte of chunk.subarray(4,chunk.length-4)){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
  view.setUint32(chunk.length-4,(crc^0xffffffff)>>>0);
  const keyed=Buffer.concat([source.subarray(0,33),chunk,source.subarray(33)]);
  assert.throws(()=>createTextureAsset('keyed-rgb.png',base64(keyed),512),/tRNS/);
});

test('production encoder roundtrips exact RGBA and refuses oversized normalized output',()=>{
  const pixels={width:8,height:16,rgba:Uint8Array.from({length:8*16*4},(_,i)=>(i*71)&255)};
  const encoded=encodePngRgba8(pixels);assert.deepEqual(decodePngRgba8(encoded),pixels);assert.deepEqual(encodePngRgba8(pixels),encoded);
  assert.throws(()=>encodePngRgba8({...pixels,width:7}));assert.throws(()=>encodePngRgba8({...pixels,rgba:pixels.rgba.subarray(1)}));
  let seed=123456789;const noise=Uint8Array.from({length:512*512*4},()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed&255;});
  const noisyOriginal=encodePngRgba8({width:512,height:512,rgba:noise});assert.ok(noisyOriginal.length<MAX_TEXTURE_BYTES);
  assert.throws(()=>createTextureAsset('noise.png',base64(noisyOriginal),1024),error=>(error as any).code==='LIMIT_EXCEEDED'&&/Wynik normalizacji/.test((error as Error).message));
});
