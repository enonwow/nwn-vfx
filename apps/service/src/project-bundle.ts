import { zipSync, unzipSync, Unzip, strToU8, strFromU8, type AsyncFlateStreamHandler, type UnzipFileInfo } from 'fflate';
import { inflateRawSync } from 'node:zlib';
import { CONTRACT_VERSION, MAX_DOCUMENT_BYTES, DomainError, type EffectDocument, type Project } from '../../../packages/core/src/model.js';
import { textureAssetMetadata } from '../../../packages/core/src/textures.js';
import { assertDocument } from '../../../packages/contracts/src/schema.js';
import { canonical, hash } from './store.js';
import {audioMetadata,audioBase64,type AudioAsset} from '../../../packages/core/src/audio.js';
import {verifyAudioImports} from './audio-import.js';

const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 12 * 1024 * 1024;
const assetPath = (id: string) => `assets/${id}.png`;
const audioPath=(a:AudioAsset)=>`audio/${a.id}.${a.mime==='audio/wav'?'wav':'mp3'}`;
const fail = (code: string, message: string): never => { throw new DomainError(code, message); };

/** Portable v3 stores each immutable PNG once. project.json carries asset metadata;
 * snapshotSha256 binds the complete hydrated document, including its exact PNGs. */
export function exportProjectBundle(project: Project): Uint8Array {
  assertDocument(project.document);
  const portable = project.document.assets === undefined ? {...project.document}
    : { ...project.document, assets: project.document.assets.map(textureAssetMetadata) };
  if(project.document.audioAssets!==undefined)(portable as any).audioAssets=project.document.audioAssets.map(audioMetadata);
  const document = strToU8(JSON.stringify(portable));
  const files: Record<string, Uint8Array> = { 'project.json': document };
  const assets = (project.document.assets ?? []).map(asset => {
    const path = assetPath(asset.id), bytes = Buffer.from(asset.pngBase64, 'base64');
    files[path] = bytes;
    return { ...textureAssetMetadata(asset), path, size: bytes.length };
  });
  const audioAssets=(project.document.audioAssets??[]).map(a=>{
    const path=audioPath(a),pcmPath=`audio/${a.id}.pcm`;files[path]=Buffer.from(a.dataBase64,'base64');files[pcmPath]=Buffer.from(a.decoded.pcmBase64,'base64');
    return{...audioMetadata(a),path,pcmPath};
  });
  const manifest = { schemaVersion: project.document.schemaVersion>=24?19:project.document.schemaVersion>=23?18:project.document.schemaVersion>=22?17:project.document.schemaVersion>=21?16:project.document.schemaVersion>=20?15:project.document.schemaVersion>=19?14:project.document.schemaVersion>=18?13:project.document.schemaVersion>=17?12:project.document.schemaVersion>=16?11:project.document.schemaVersion>=15?10:project.document.schemaVersion>=14?9:project.document.schemaVersion>=13?8:project.document.schemaVersion>=12?7:project.document.schemaVersion>=11?6:project.document.schemaVersion>=10?5:project.document.audioAssets===undefined?3:4,
    ...(project.document.schemaVersion>=10?{minimumStudioVersion:project.document.schemaVersion>=24?'0.30.0':project.document.schemaVersion>=23?'0.29.0':project.document.schemaVersion>=22?'0.28.2':project.document.schemaVersion>=21?'0.28.1':project.document.schemaVersion>=20?'0.28.0':project.document.schemaVersion>=19?'0.27.0':project.document.schemaVersion>=18?'0.26.2':project.document.schemaVersion>=17?'0.26.0':project.document.schemaVersion>=16?'0.25.0':project.document.schemaVersion>=15?'0.24.0':project.document.schemaVersion>=14?'0.23.0':project.document.schemaVersion>=13?'0.22.0':project.document.schemaVersion>=12?'0.20.0':project.document.schemaVersion>=11?'0.19.0':'0.18.0'}:{}),contractVersion: CONTRACT_VERSION, projectId: project.id, revision: project.revision,
    documentSha256: hash(document), snapshotSha256: hash(canonical(project.document)), assets,...(project.document.audioAssets===undefined&&project.document.schemaVersion<10?{}:{audioAssets}) };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const result = zipSync(files);
  if (result.length > MAX_BUNDLE_BYTES) fail('LIMIT_EXCEEDED', 'Paczka projektu przekracza 8 MiB.');
  return result;
}

const entryLimit = (name: string) => name === 'project.json' ? MAX_DOCUMENT_BYTES : name === 'manifest.json' ? 128 * 1024 : name.endsWith('.pcm')?5760000:2 * 1024 * 1024;

/** Check the central directory before any inflation, then independently bound real
 * DEFLATE output. fflate's fixed output buffer alone can silently truncate a stream
 * whose declared originalSize is smaller than its actual expanded size. */
function readBoundedZip(payload: Uint8Array): Record<string, Uint8Array> {
  const entries = new Map<string, UnzipFileInfo>(); let declaredTotal = 0;
  unzipSync(payload, { filter(file) {
    declaredTotal += file.originalSize;
    if ((!/^assets\/[a-f0-9]{64}\.png$/.test(file.name) && !/^audio\/[a-f0-9]{64}\.(wav|mp3|pcm)$/.test(file.name) && !['project.json','manifest.json'].includes(file.name))
      || entries.has(file.name) || entries.size >= 26 || !Number.isSafeInteger(file.originalSize) || file.originalSize < 0
      || file.originalSize > entryLimit(file.name) || declaredTotal > MAX_EXPANDED_BYTES
      || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_BUNDLE_BYTES || ![0,8].includes(file.compression))
      fail('UNSAFE_BUNDLE', 'Paczka ma nieobsługiwany wpis, duplikat lub rozmiar.');
    entries.set(file.name, file); return false;
  } });
  const files: Record<string, Uint8Array> = Object.create(null), started = new Set<string>(); let actualTotal = 0;
  class BoundedInflate {
    static compression = 8;
    ondata: AsyncFlateStreamHandler = () => {};
    private chunks: Uint8Array[] = []; private compressed = 0;
    constructor(private name: string) {}
    push(chunk: Uint8Array, final: boolean) {
      this.compressed += chunk.length;
      const expected = entries.get(this.name)!;
      if (this.compressed > expected.size) fail('UNSAFE_BUNDLE', 'Rozmiar strumienia ZIP nie zgadza się z katalogiem.');
      this.chunks.push(chunk);
      if (!final) return;
      let bytes: Uint8Array<ArrayBuffer>;
      try { bytes = new Uint8Array(inflateRawSync(Buffer.concat(this.chunks), { maxOutputLength: Math.max(1,expected.originalSize) })); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') fail('UNSAFE_BUNDLE', 'Wpis ZIP przekracza zadeklarowany rozmiar.');
        throw error;
      }
      this.chunks = []; this.ondata(null, bytes, true);
    }
  }
  const unzip = new Unzip(file => {
    const expected = entries.get(file.name);
    if (!expected || started.has(file.name) || file.compression !== expected.compression
      || (file.size !== undefined && file.size !== expected.size)
      || (file.originalSize !== undefined && file.originalSize !== expected.originalSize))
      fail('UNSAFE_BUNDLE', 'Nagłówek wpisu ZIP nie zgadza się z katalogiem.');
    started.add(file.name);
    const declared = expected!;
    let size = 0; const chunks: Uint8Array[] = [];
    file.ondata = (error, bytes, final) => {
      if (error) throw error;
      size += bytes.length; actualTotal += bytes.length;
      if (size > declared.originalSize || size > entryLimit(file.name) || actualTotal > MAX_EXPANDED_BYTES)
        fail('UNSAFE_BUNDLE', 'Rozpakowane dane przekraczają limit paczki.');
      chunks.push(bytes);
      if (final) {
        if (size !== declared.originalSize) fail('UNSAFE_BUNDLE', 'Rozmiar rozpakowanego wpisu nie zgadza się z katalogiem.');
        files[file.name] = Buffer.concat(chunks);
      }
    };
    file.start();
  });
  unzip.register(BoundedInflate); unzip.push(payload, true);
  if (Object.keys(files).length !== entries.size) fail('UNSAFE_BUNDLE', 'Niekompletna paczka ZIP.');
  return files;
}

export function importProjectBundle(bundleBase64: string): EffectDocument {
  try {
    if (bundleBase64.length > 4 * Math.ceil(MAX_BUNDLE_BYTES / 3)) fail('LIMIT_EXCEEDED', 'Paczka przekracza 8 MiB.');
    if (bundleBase64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(bundleBase64)) fail('INVALID_BUNDLE', 'Paczka wymaga poprawnego base64.');
    const payload = Buffer.from(bundleBase64, 'base64');
    if (payload.length > MAX_BUNDLE_BYTES) fail('LIMIT_EXCEEDED', 'Paczka przekracza 8 MiB.');
    const files = readBoundedZip(payload), names = new Set(Object.keys(files));
    if (!files['project.json'] || !files['manifest.json']) fail('INVALID_BUNDLE', 'Brakuje dokumentu lub manifestu.');
    const document = JSON.parse(strFromU8(files['project.json'])) as EffectDocument;
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].includes(manifest.schemaVersion))
      fail('UNSUPPORTED_BUNDLE_VERSION', `Nieobsługiwana wersja paczki ${manifest.schemaVersion}. Zaktualizuj Studio${typeof manifest.minimumStudioVersion==='string'?` do ${manifest.minimumStudioVersion} lub nowszego`:''}.`);
    if(document.schemaVersion===24&&(manifest.schemaVersion!==19||manifest.minimumStudioVersion!=='0.30.0'))fail('INVALID_BUNDLE','Dokument 24 wymaga paczki 19 i Studio 0.30.0.');
    if(document.schemaVersion===23&&(manifest.schemaVersion!==18||manifest.minimumStudioVersion!=='0.29.0'))fail('INVALID_BUNDLE','Dokument 23 wymaga paczki 18 i Studio 0.29.0.');
    if(document.schemaVersion===22&&(manifest.schemaVersion!==17||manifest.minimumStudioVersion!=='0.28.2'))fail('INVALID_BUNDLE','Dokument 22 wymaga paczki 17 i Studio 0.28.2.');
    if(document.schemaVersion===21&&(manifest.schemaVersion!==16||manifest.minimumStudioVersion!=='0.28.1'))fail('INVALID_BUNDLE','Dokument 21 wymaga paczki 16 i Studio 0.28.1.');
    if(document.schemaVersion===20&&(manifest.schemaVersion!==15||manifest.minimumStudioVersion!=='0.28.0'))fail('INVALID_BUNDLE','Dokument20 wymaga paczki15 i Studio0.28.0.');
    if(document.schemaVersion===19&&(manifest.schemaVersion!==14||manifest.minimumStudioVersion!=='0.27.0'))fail('INVALID_BUNDLE','Dokument 19 wymaga paczki v14 i Studio 0.27.0.');
    if(document.schemaVersion===18&&(manifest.schemaVersion!==13||manifest.minimumStudioVersion!=='0.26.2'))fail('INVALID_BUNDLE','Dokument 18 wymaga paczki v13 i Studio 0.26.2.');
    if(document.schemaVersion===17&&(manifest.schemaVersion!==12||manifest.minimumStudioVersion!=='0.26.0'))fail('INVALID_BUNDLE','Dokument 17 wymaga paczki v12 i Studio 0.26.0.');
    if(document.schemaVersion===16&&(manifest.schemaVersion!==11||manifest.minimumStudioVersion!=='0.25.0'))fail('INVALID_BUNDLE','Dokument 16 wymaga paczki v11 i Studio 0.25.0.');
    if(document.schemaVersion===15&&(manifest.schemaVersion!==10||manifest.minimumStudioVersion!=='0.24.0'))fail('INVALID_BUNDLE','Dokument 15 wymaga paczki v10 i Studio 0.24.0.');
    if(document.schemaVersion===14&&(manifest.schemaVersion!==9||manifest.minimumStudioVersion!=='0.23.0'))fail('INVALID_BUNDLE','Dokument 14 wymaga paczki v9 i Studio 0.23.0.');
    if(document.schemaVersion===13&&(manifest.schemaVersion!==8||manifest.minimumStudioVersion!=='0.22.0'))fail('INVALID_BUNDLE','Dokument 13 wymaga paczki v8 i Studio 0.22.0.');
    if(document.schemaVersion===12&&(manifest.schemaVersion!==7||manifest.minimumStudioVersion!=='0.20.0'))fail('INVALID_BUNDLE','Dokument 12 wymaga paczki v7 i Studio 0.20.0 lub nowszego.');
    if(document.schemaVersion===11&&(manifest.schemaVersion!==6||manifest.minimumStudioVersion!=='0.19.0'))fail('INVALID_BUNDLE','Dokument 11 wymaga paczki v6 i Studio 0.19.0 lub nowszego.');
    if(document.schemaVersion===10&&(manifest.schemaVersion!==5||manifest.minimumStudioVersion!=='0.18.0'))fail('INVALID_BUNDLE','Dokument 10 wymaga paczki v5 i Studio 0.18.0 lub nowszego.');
    if (manifest.documentSha256 !== hash(files['project.json']))
      fail('BUNDLE_HASH_MISMATCH', 'Niepoprawny manifest lub hash dokumentu paczki.');
    if (manifest.schemaVersion >= 3 && document.assets !== undefined) {
      if (!Array.isArray(document.assets) || document.assets.length > 8) fail('INVALID_BUNDLE', 'Niepoprawna lista metadanych zasobów.');
      const ids = new Set<string>();
      document.assets = document.assets.map(asset => {
        if (!asset || typeof asset !== 'object' || Object.hasOwn(asset,'pngBase64')
          || typeof asset.id !== 'string' || !/^[a-f0-9]{64}$/.test(asset.id) || ids.has(asset.id))
          fail('INVALID_BUNDLE', 'Paczka v3 wymaga unikalnych metadanych zasobów bez danych inline.');
        ids.add(asset.id);
        const bytes = files[assetPath(asset.id)];
        if (!bytes) fail('MISSING_ASSET', 'Paczka nie zawiera zadeklarowanego obrazu PNG.');
        if (hash(bytes) !== asset.id) fail('BUNDLE_HASH_MISMATCH', 'Obraz PNG nie zgadza się z referencją w dokumencie.');
        return { ...asset, pngBase64: Buffer.from(bytes).toString('base64') };
      });
    }
    if(manifest.schemaVersion>=4&&document.audioAssets!==undefined){
      if(!Array.isArray(document.audioAssets)||document.audioAssets.length>8)fail('INVALID_BUNDLE','Niepoprawna lista audio.');
      const ids=new Set<string>();
      document.audioAssets=document.audioAssets.map(a=>{
        if(!a||!/^[a-f0-9]{64}$/.test(a.id)||ids.has(a.id)||Object.hasOwn(a,'dataBase64')||Object.hasOwn(a.decoded??{},'pcmBase64'))fail('INVALID_BUNDLE','Niepoprawne metadane audio.');
        ids.add(a.id);const bytes=files[audioPath(a)],pcm=files[`audio/${a.id}.pcm`];
        if(!bytes||!pcm)fail('MISSING_ASSET','Brak źródła audio lub PCM w paczce.');
        return{...a,dataBase64:audioBase64(bytes),decoded:{...a.decoded,pcmBase64:audioBase64(pcm)}};
      });
    }else if(document.audioAssets!==undefined)fail('INVALID_BUNDLE','Audio wymaga przenośnego manifestu v4.');
    // Applies to the complete in-memory snapshot, not just compact portable metadata.
    if (Buffer.byteLength(JSON.stringify(document)) > MAX_DOCUMENT_BYTES) fail('LIMIT_EXCEEDED', 'Dokument przekracza 6 MiB.');
    assertDocument(document);
    verifyAudioImports(document);
    if (manifest.schemaVersion === 1) {
      if (names.size !== 2 || document.assets?.length) fail('INVALID_BUNDLE', 'Zasoby PNG wymagają manifestu paczki w wersji 2.');
      return document;
    }
    if (manifest.snapshotSha256 !== hash(canonical(document))) fail('BUNDLE_HASH_MISMATCH', 'Snapshot dokumentu nie zgadza się z manifestem.');
    const expected = (document.assets ?? []).map(asset => {
      const path = assetPath(asset.id), bytes = files[path];
      if (!bytes) fail('MISSING_ASSET', 'Paczka nie zawiera zadeklarowanego obrazu PNG.');
      if (hash(bytes) !== asset.id || Buffer.from(bytes).toString('base64') !== asset.pngBase64)
        fail('BUNDLE_HASH_MISMATCH', 'Obraz PNG nie zgadza się z referencją w dokumencie.');
      return { ...textureAssetMetadata(asset), path, size: bytes.length };
    });
    const expectedAudio=(document.audioAssets??[]).map(a=>({...audioMetadata(a),path:audioPath(a),pcmPath:`audio/${a.id}.pcm`}));
    if(manifest.schemaVersion>=4&&canonical(manifest.audioAssets)!==canonical(expectedAudio))fail('BUNDLE_HASH_MISMATCH','Lista dźwięków paczki nie zgadza się z dokumentem.');
    if (canonical(manifest.assets) !== canonical(expected) || names.size !== 2 + expected.length + expectedAudio.length*2)
      fail('BUNDLE_HASH_MISMATCH', 'Lista zależności paczki nie zgadza się z dokumentem.');
    return document;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('INVALID_BUNDLE', 'Nie można odczytać paczki Studio.');
  }
}
