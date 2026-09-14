import { Unzlib, zlibSync } from 'fflate';
import { DomainError, type EffectDocument, type Layer, type TextureAsset, type TextureNormalization, type TextureRef } from './model.js';
import { MAX_DOCUMENT_BYTES } from './constants.js';
export { sampleEmitterAppearance, emitterAppearancePoints, colorToLinear } from './particles.js';

export const MAX_TEXTURE_BYTES = 2 * 1024 * 1024;
export const MAX_NORMALIZATION_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_TEXTURE_ASSETS = 8;
export const TEXTURE_VERSION = 'procedural-particles-1';
export const TEXTURE_CAPABILITIES = { formats: ['png-rgba8'], minDimension: 8, maxDimension: 1024, powerOfTwo: true,
  maxFileBytes: MAX_TEXTURE_BYTES, maxAssets: MAX_TEXTURE_ASSETS, maxDocumentBytes: MAX_DOCUMENT_BYTES,
  uvOrigin: 'bottom-left', blendModes: ['normal','additive'],
  normalization: { targetSizes: [512,1024], formats: ['png-rgb8','png-rgba8'], minInputDimension: 1, maxInputDimension: 4096, maxInputFileBytes: MAX_NORMALIZATION_INPUT_BYTES,
    fit: 'contain', padding: 'transparent-centered', downscaleFilter: 'area', upscaleFilter: 'bilinear',
    colorSpace: 'linear-srgb', alphaMode: 'premultiplied', version: 1 } } as const;
export const PARTICLE_AGE_CAPABILITIES = { channels: ['color','alpha','size'], points: ['start','mid','end'],
  midPercentRange: [.01,.99], sharedMidPercent: true, defaultMidPercent: .5 } as const;
export interface TexturePixels { width: number; height: number; /** Straight RGBA, rows top-to-bottom; RGB bytes are sRGB. */ rgba: Uint8Array }
function invalid(message: string, details?: unknown): never { throw new DomainError('INVALID_TEXTURE', message, details); }

// FIPS 180-4 SHA-256. No Node runtime or asynchronous WebCrypto dependency.
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,
  0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,
  0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotr = (x: number,n: number) => (x>>>n)|(x<<(32-n));
export function sha256Bytes(bytes: Uint8Array): string {
  const padded = new Uint8Array(Math.ceil((bytes.length+9)/64)*64); padded.set(bytes); padded[bytes.length]=128;
  const view=new DataView(padded.buffer); view.setUint32(padded.length-8,Math.floor(bytes.length/0x20000000)); view.setUint32(padded.length-4,bytes.length*8);
  const hash = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w=new Uint32Array(64);
  for(let offset=0;offset<padded.length;offset+=64) {
    for(let i=0;i<16;i++) w[i]=view.getUint32(offset+i*4);
    for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2]; w[i]=w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10));}
    let [a,b,c,d,e,f,g,h]=hash;
    for(let i=0;i<64;i++){const t1=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;
      const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    for(const [i,value] of [a,b,c,d,e,f,g,h].entries()) hash[i]+=value;
  }
  return Array.from(hash,v=>v.toString(16).padStart(8,'0')).join('');
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let b=0;b<8;b++) i=(i>>>1)^((i&1)?0xedb88320:0);return i>>>0;});
export function pngCrc32(bytes: Uint8Array): number {let crc=0xffffffff;for(const byte of bytes) crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function adler32(bytes: Uint8Array): number {let a=1,b=0;for(const value of bytes){a=(a+value)%65521;b=(b+a)%65521;}return ((b<<16)|a)>>>0;}
function paeth(a:number,b:number,c:number):number {const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
const dimensionValid=(value:number)=>Number.isInteger(value)&&value>=8&&value<=1024&&(value&(value-1))===0;
const normalizationDimensionValid=(value:number)=>Number.isInteger(value)&&value>=1&&value<=4096;
function decodePng(bytes: Uint8Array, normalizationInput=false): TexturePixels & {colorType:2|6} {
  const maxBytes=normalizationInput?MAX_NORMALIZATION_INPUT_BYTES:MAX_TEXTURE_BYTES;
  if (!(bytes instanceof Uint8Array)||bytes.length>maxBytes) throw new DomainError('LIMIT_EXCEEDED',`PNG przekracza limit ${maxBytes/1048576} MiB.`);
  if(bytes.length<57||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v)) invalid(normalizationInput?'Wymagany plik PNG RGB8 lub RGBA8.':'Wymagany plik PNG RGBA8.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8,width=0,height=0,seenData=false,closedData=false,ended=false,colorType:2|6=6;
  const chunks:Uint8Array[]=[];let compressedLength=0;
  const seen=new Set<string>();
  while(offset<bytes.length) {
    if(offset+12>bytes.length) invalid('Ucięty nagłówek fragmentu PNG.');
    const length=view.getUint32(offset),end=offset+12+length;
    if(end>bytes.length) invalid('Fragment PNG wykracza poza plik.');
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if(!/^[A-Za-z]{4}$/.test(type)||type[2]!==type[2].toUpperCase()) invalid('Niepoprawny typ fragmentu PNG.');
    if(pngCrc32(bytes.subarray(offset+4,end-4))!==view.getUint32(end-4)) invalid('Niezgodna suma CRC fragmentu PNG.',{chunk:type});
    const data=bytes.subarray(offset+8,end-4);
    if(offset===8&&type!=='IHDR') invalid('IHDR musi być pierwszym fragmentem PNG.');
    if(type==='IHDR') {
      if(seen.has(type)||length!==13) invalid('Niepoprawny IHDR.');
      width=view.getUint32(offset+8);height=view.getUint32(offset+12);
      if(normalizationInput) {
        if(!normalizationDimensionValid(width)||!normalizationDimensionValid(height)) invalid('Normalizacja obsługuje wymiary PNG od 1 do 4096.');
      } else if(!dimensionValid(width)||!dimensionValid(height)) invalid('Wymiary PNG muszą być potęgami dwóch od 8 do 1024.');
      if(data[8]!==8||(data[9]!==6&&!(normalizationInput&&data[9]===2))||data[10]!==0||data[11]!==0||data[12]!==0)
        invalid(normalizationInput?'Normalizacja obsługuje PNG RGB/RGBA 8 bitów, bez przeplotu.':'Obsługiwany PNG: RGBA 8 bitów, bez przeplotu.');
      colorType=data[9] as 2|6;
    } else if(type==='IDAT') {
      if(closedData) invalid('Fragmenty IDAT muszą być kolejne.');seenData=true;chunks.push(data);compressedLength+=length;
    } else if(type==='IEND') {if(length!==0||!seenData||end!==bytes.length) invalid('Niepoprawny koniec PNG.');ended=true;}
    else {
      if(seenData) closedData=true;
      if(type==='iCCP'||type==='cHRM'||['acTL','fcTL','fdAT'].includes(type)) invalid('Profile ICC/chromatyczności i animowane PNG nie są obsługiwane.',{chunk:type});
      if(type==='gAMA'&&(length!==4||view.getUint32(offset+8)!==45455)) invalid('Obsługiwana jest wyłącznie gamma sRGB (45455).');
      if(type==='sRGB'&&(length!==1||data[0]>3)) invalid('Niepoprawny profil sRGB.');
      if(['sRGB','gAMA','PLTE'].includes(type)&&(seen.has(type)||seenData)) invalid('Powtórzony lub spóźniony fragment PNG.',{chunk:type});
      if(type==='PLTE'&&(length===0||length%3!==0||length>768)) invalid('Niepoprawny PLTE.');
      if(type[0]===type[0].toUpperCase()&&type!=='PLTE') invalid('Nieobsługiwany krytyczny fragment PNG.',{chunk:type});
      if(type==='tRNS') invalid('Przezroczystość PNG tRNS nie jest obsługiwana; użyj kanału alpha RGBA8.');
    }
    seen.add(type);offset=end;
  }
  if(!ended||compressedLength<6) invalid('Brak danych lub końca PNG.');
  const compressed=new Uint8Array(compressedLength);let cursor=0;for(const chunk of chunks){compressed.set(chunk,cursor);cursor+=chunk.length;}
  // Feed small chunks so even a malicious deflate stream cannot allocate its full expansion.
  const bpp=colorType===2?3:4,stride=width*bpp,expected=(stride+1)*height,raw=new Uint8Array(expected);let written=0;
  try {
    const stream=new Unzlib((chunk)=>{if(written+chunk.length>expected) invalid('Rozpakowane PNG przekracza deklarowane wymiary.');raw.set(chunk,written);written+=chunk.length;});
    for(let i=0;i<compressed.length;i+=128) stream.push(compressed.subarray(i,i+128),i+128>=compressed.length);
  } catch(error) {if(error instanceof DomainError) throw error;invalid('Uszkodzone dane deflate PNG.');}
  if(written!==expected) invalid('Niepełne dane pikseli PNG.');
  if(adler32(raw)!==new DataView(compressed.buffer).getUint32(compressed.length-4)) invalid('Niezgodna suma Adler PNG.');
  // Reconstruct rows in place. RGB normalization expands only after filtering,
  // so Sub/Average/Paeth use the original three-byte pixel stride.
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)];if(filter>4) invalid('Nieobsługiwany filtr wiersza PNG.',{row:y,filter});
    for(let x=0;x<stride;x++) {const index=y*(stride+1)+x+1,a=x>=bpp?raw[index-bpp]:0,b=y?raw[index-stride-1]:0,c=y&&x>=bpp?raw[index-stride-1-bpp]:0;
      raw[index]=(raw[index]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
  }
  const rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++) {
    if(colorType===6)rgba.set(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),y*width*4);
    else for(let x=0;x<width;x++) {const source=y*(stride+1)+1+x*3,destination=(y*width+x)*4;
      rgba[destination]=raw[source];rgba[destination+1]=raw[source+1];rgba[destination+2]=raw[source+2];rgba[destination+3]=255;}
  }
  return {width,height,rgba,colorType};
}
/** Strict decoder for stored assets and byte-preserving imports. */
export function decodePngRgba8(bytes: Uint8Array): TexturePixels {const {colorType:_,...pixels}=decodePng(bytes);return pixels;}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const result=new Uint8Array(parts.reduce((size,part)=>size+part.length,0));let offset=0;
  for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
function pngChunk(type: string,data: Uint8Array): Uint8Array {
  const chunk=new Uint8Array(data.length+12),view=new DataView(chunk.buffer);
  view.setUint32(0,data.length);chunk.set(new TextEncoder().encode(type),4);chunk.set(data,8);
  view.setUint32(chunk.length-4,pngCrc32(chunk.subarray(4,chunk.length-4)));return chunk;
}
/** Deterministic RGBA8 encoder. Output is subject to the same 2 MiB stored-asset limit. */
export function encodePngRgba8(pixels: TexturePixels): Uint8Array {
  const {width,height,rgba}=pixels;
  if(!dimensionValid(width)||!dimensionValid(height)||!(rgba instanceof Uint8Array)||rgba.length!==width*height*4)
    invalid('Niepoprawne wymiary lub liczba pikseli kodowanego PNG.');
  const stride=width*4,raw=new Uint8Array((stride+1)*height);
  for(let y=0;y<height;y++)raw.set(rgba.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
  const result=joinBytes([Uint8Array.of(137,80,78,71,13,10,26,10),pngChunk('IHDR',header),pngChunk('sRGB',Uint8Array.of(0)),
    pngChunk('IDAT',zlibSync(raw,{level:6})),pngChunk('IEND',new Uint8Array())]);
  if(result.length>MAX_TEXTURE_BYTES)throw new DomainError('LIMIT_EXCEEDED','Wynik normalizacji PNG przekracza 2 MiB; wybierz targetSize 512.');
  return result;
}
function normalizationGeometry(width: number,height: number,targetSize: 512|1024) {
  if(targetSize!==512&&targetSize!==1024)invalid('targetSize normalizacji musi wynosić 512 lub 1024.');
  if(!normalizationDimensionValid(width)||!normalizationDimensionValid(height))invalid('Normalizacja obsługuje wymiary PNG od 1 do 4096.');
  const scale=targetSize/Math.max(width,height),contentWidth=Math.max(1,Math.floor(width*scale+.5)),contentHeight=Math.max(1,Math.floor(height*scale+.5));
  return {contentWidth,contentHeight,offsetX:Math.floor((targetSize-contentWidth)/2),offsetY:Math.floor((targetSize-contentHeight)/2),
    method:(scale<=1?'area':'bilinear') as 'area'|'bilinear'};
}
const srgbToLinear=Float64Array.from({length:256},(_,index)=>{const value=index/255;return value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4);});
function linearToSrgbByte(value: number): number {
  const bounded=Math.max(0,Math.min(1,value));return Math.round(255*(bounded<=.0031308?bounded*12.92:1.055*Math.pow(bounded,1/2.4)-.055));
}
type WeightedPixel={index:number;weight:number};
function filterWeights(sourceSize: number,targetSize: number,method:'area'|'bilinear'): WeightedPixel[][] {
  return Array.from({length:targetSize},(_,destination)=>{
    if(method==='bilinear') {
      const center=Math.max(0,Math.min(sourceSize-1,(destination+.5)*sourceSize/targetSize-.5)),first=Math.floor(center),last=Math.min(sourceSize-1,first+1),fraction=center-first;
      return first===last?[{index:first,weight:1}]:[{index:first,weight:1-fraction},{index:last,weight:fraction}];
    }
    const start=destination*sourceSize/targetSize,end=(destination+1)*sourceSize/targetSize,result:WeightedPixel[]=[];
    for(let index=Math.floor(start);index<Math.ceil(end);index++)if(index>=0&&index<sourceSize)
      result.push({index,weight:(Math.min(end,index+1)-Math.max(start,index))/(end-start)});
    return result;
  });
}
function normalizePixels(pixels:TexturePixels,targetSize:512|1024): {pixels:TexturePixels;geometry:ReturnType<typeof normalizationGeometry>} {
  const {width,height,rgba}=pixels,geometry=normalizationGeometry(width,height,targetSize),output=new Uint8Array(targetSize*targetSize*4);
  const xWeights=filterWeights(width,geometry.contentWidth,geometry.method),yWeights=filterWeights(height,geometry.contentHeight,geometry.method);
  for(let y=0;y<geometry.contentHeight;y++)for(let x=0;x<geometry.contentWidth;x++) {
    let alpha=0,red=0,green=0,blue=0;
    for(const row of yWeights[y])for(const column of xWeights[x]) {
      const source=(row.index*width+column.index)*4,weight=row.weight*column.weight,coverage=rgba[source+3]/255*weight;
      alpha+=coverage;red+=srgbToLinear[rgba[source]]*coverage;green+=srgbToLinear[rgba[source+1]]*coverage;blue+=srgbToLinear[rgba[source+2]]*coverage;
    }
    const destination=((y+geometry.offsetY)*targetSize+x+geometry.offsetX)*4,alphaByte=Math.round(Math.max(0,Math.min(1,alpha))*255);
    // RGB under fully transparent pixels is canonical zero; transparent source colors never contaminate an edge.
    if(alphaByte>0){output[destination]=linearToSrgbByte(red/alpha);output[destination+1]=linearToSrgbByte(green/alpha);output[destination+2]=linearToSrgbByte(blue/alpha);output[destination+3]=alphaByte;}
  }
  return {pixels:{width:targetSize,height:targetSize,rgba:output},geometry};
}
/** Explicit derivative used by beam atlases; does not mutate the source asset.
 * Each axis chooses area reduction or bilinear enlargement independently. */
export function resizeTextureRegion(pixels:TexturePixels,crop:{x:number;y:number;width:number;height:number},width:number,height:number):TexturePixels {
  const out=new Uint8Array(width*height*4),xs=filterWeights(crop.width,width,crop.width>=width?'area':'bilinear'),ys=filterWeights(crop.height,height,crop.height>=height?'area':'bilinear');
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let a=0,r=0,g=0,b=0;
    for(const row of ys[y])for(const column of xs[x]){
      const i=((row.index+crop.y)*pixels.width+column.index+crop.x)*4,w=row.weight*column.weight*pixels.rgba[i+3]/255;
      a+=w;r+=srgbToLinear[pixels.rgba[i]]*w;g+=srgbToLinear[pixels.rgba[i+1]]*w;b+=srgbToLinear[pixels.rgba[i+2]]*w;
    }
    const i=(y*width+x)*4,alpha=Math.round(Math.max(0,Math.min(1,a))*255);
    if(alpha){out[i]=linearToSrgbByte(r/a);out[i+1]=linearToSrgbByte(g/a);out[i+2]=linearToSrgbByte(b/a);out[i+3]=alpha;}
  }
  return {width,height,rgba:out};
}
function bytesToBase64(bytes: Uint8Array): string {
  const chunks:string[]=[];for(let offset=0;offset<bytes.length;offset+=8192)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+8192)));
  return btoa(chunks.join(''));
}
function decodePngBase64(value: string,maxBytes:number): Uint8Array {
  if(typeof value!=='string'||value.length>Math.ceil(maxBytes/3)*4) throw new DomainError('LIMIT_EXCEEDED',`PNG przekracza limit ${maxBytes/1048576} MiB.`);
  // A flat character-class check avoids recursive regex backtracking on large uploads.
  if(!value.length||value.length%4!==0||/[^A-Za-z0-9+/=]/.test(value)) invalid('Niepoprawne base64 PNG.');
  const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;
  if(value.slice(0,value.length-padding).includes('=')) invalid('Niepoprawne dopełnienie base64.');
  let decoded:string;try{decoded=atob(value);}catch{invalid('Niepoprawne base64 PNG.');}
  if(decoded.length>maxBytes) throw new DomainError('LIMIT_EXCEEDED',`PNG przekracza limit ${maxBytes/1048576} MiB.`);
  if(btoa(decoded)!==value) invalid('Base64 PNG musi mieć postać kanoniczną.');
  return Uint8Array.from(decoded,c=>c.charCodeAt(0));
}
export function pngBytesFromBase64(value: string): Uint8Array {return decodePngBase64(value,MAX_TEXTURE_BYTES);}
function validateFileName(name: string):void {if(typeof name!=='string'||name.length<1||name.length>160||/[\\/:\x00-\x1f\x7f]/.test(name)||name==='.'||name==='..') invalid('Podaj samą nazwę pliku PNG, bez ścieżki.');}
export function createTextureAsset(fileName: string,pngBase64: string,targetSize?:512|1024): TextureAsset {
  validateFileName(fileName);let bytes=decodePngBase64(pngBase64,targetSize===undefined?MAX_TEXTURE_BYTES:MAX_NORMALIZATION_INPUT_BYTES);
  let normalization:TextureNormalization|undefined;
  if(targetSize!==undefined) {
    if(targetSize!==512&&targetSize!==1024)invalid('targetSize normalizacji musi wynosić 512 lub 1024.');
    const original=decodePng(bytes,true),originalSha256=sha256Bytes(bytes),normalized=normalizePixels(original,targetSize);
    normalization={version:1,colorSpace:'linear-srgb',alphaMode:'premultiplied',originalSha256,
      originalWidth:original.width,originalHeight:original.height,originalColorType:original.colorType,targetSize,...normalized.geometry};
    bytes=encodePngRgba8(normalized.pixels);pngBase64=bytesToBase64(bytes);
  }
  const {width,height}=decodePngRgba8(bytes),id=sha256Bytes(bytes);
  return {id,name:fileName,mime:'image/png',width,height,pngBase64,source:{fileName,sha256:id,...(normalization?{normalization}:{})}};
}
export function validateTextureAsset(asset: TextureAsset): TexturePixels {
  if(!asset||typeof asset!=='object'||!asset.source) invalid('Niepoprawny zasób tekstury.');
  validateFileName(asset.source.fileName);validateFileName(asset.name);
  const bytes=pngBytesFromBase64(asset.pngBase64),id=sha256Bytes(bytes);
  if(asset.id!==id||asset.source.sha256!==id||asset.mime!=='image/png') invalid('Tożsamość tekstury nie odpowiada oryginalnym bajtom PNG.');
  const decoded=decodePngRgba8(bytes);
  if(asset.width!==decoded.width||asset.height!==decoded.height) invalid('Wymiary zasobu nie odpowiadają PNG.');
  if(asset.source.normalization!==undefined) {
    const n=asset.source.normalization;
    if(!n||typeof n!=='object'||n.version!==1||n.colorSpace!=='linear-srgb'||n.alphaMode!=='premultiplied'||![2,6].includes(n.originalColorType)||!/^[a-f0-9]{64}$/.test(n.originalSha256))
      invalid('Niepoprawne metadane normalizacji PNG.');
    const expected=normalizationGeometry(n.originalWidth,n.originalHeight,n.targetSize);
    if(asset.width!==n.targetSize||asset.height!==n.targetSize||Object.entries(expected).some(([key,value])=>(n as any)[key]!==value))
      invalid('Geometria normalizacji nie odpowiada deklarowanym wymiarom.');
    for(let y=0;y<decoded.height;y++)for(let x=0;x<decoded.width;x++) {
      if(x>=n.offsetX&&x<n.offsetX+n.contentWidth&&y>=n.offsetY&&y<n.offsetY+n.contentHeight)continue;
      const offset=(y*decoded.width+x)*4;
      if(decoded.rgba[offset]||decoded.rgba[offset+1]||decoded.rgba[offset+2]||decoded.rgba[offset+3])invalid('Dopełnienie normalizacji PNG musi być przezroczyste.');
    }
    // The original digest is provenance only: the original upload is intentionally
    // not embedded, so its pixels/hash cannot be recomputed from this stored PNG.
  }
  return decoded;
}
export const decodeTextureAsset=validateTextureAsset;
export function textureAssetMetadata(asset: TextureAsset): Omit<TextureAsset,'pngBase64'> {
  const {pngBase64:_,...metadata}=asset;return structuredClone(metadata);
}
export function resolveTextureAsset(document: EffectDocument,ref: TextureRef|string): TextureAsset|undefined {
  if(['spark','smoke','glow','beam-soft'].includes(ref)) return undefined;
  if(!/^asset:[a-f0-9]{64}$/.test(ref)) throw new DomainError('INVALID_TEXTURE_REFERENCE','Niepoprawna referencja tekstury.',{texture:ref});
  const asset=document.assets?.find(asset=>asset.id===ref.slice(6));
  if(!asset) throw new DomainError('MISSING_ASSET','Brakuje zasobu tekstury w dokumencie.',{assetId:ref.slice(6)});
  return asset;
}
export function makeBuiltinTexture(kind: 'spark'|'smoke'|'glow'|'beam-soft',size=128): TexturePixels {
  if(!['spark','smoke','glow','beam-soft'].includes(kind)||!dimensionValid(size)) invalid('Nieobsługiwana tekstura wbudowana.');
  const rgba=new Uint8Array(size*size*4),clamp=(v:number)=>Math.max(0,Math.min(1,v));
  if(kind==='beam-soft'){
    // Straight white RGBA. Every V row is identical, including both endpoints;
    // repeating a full Linked segment introduces no texture-alpha seam.
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=2*x/(size-1)-1,offset=(y*size+x)*4;
      rgba.set([255,255,255,Math.round(255*Math.pow(Math.max(0,1-u*u),3))],offset);
    }
    return {width:size,height:size,rgba};
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const px=2*x/(size-1)-1,py=2*y/(size-1)-1,radius=Math.hypot(px,py),edge=clamp((1-radius)*6);
    const field=.5+.16*Math.sin(px*9+Math.cos(py*7))+.13*Math.sin(py*14-px*6)+.08*Math.cos(px*28+py*17);
    const luminance=kind==='spark'?Math.exp(-px*px*26-py*py*5):Math.exp(-radius*radius*7);
    const opacity=kind==='smoke'?Math.pow(clamp(1-radius),.9)*clamp(field*1.7)*edge:Math.sqrt(luminance)*edge;
    const value=Math.round(255*(kind==='smoke'?.75+.25*field:luminance)),offset=(y*size+x)*4;
    rgba[offset]=value;rgba[offset+1]=value;rgba[offset+2]=value;rgba[offset+3]=Math.round(255*clamp(opacity));
  }
  return {width:size,height:size,rgba};
}
export function resolveTexture(document: EffectDocument,ref: TextureRef|string): TexturePixels {
  const asset=resolveTextureAsset(document,ref);return asset?decodeTextureAsset(asset):makeBuiltinTexture(ref as 'spark'|'smoke'|'glow'|'beam-soft');
}
export function effectiveBlend(layer: Layer): 'normal'|'additive' {
  return layer.blend??(layer.type==='mesh'||layer.texture==='smoke'||layer.texture?.startsWith('asset:')?'normal':'additive');
}
