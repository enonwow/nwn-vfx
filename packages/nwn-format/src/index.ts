import {isBeamFlow} from '../../core/src/beam-flow.js';
import {buildFiniteBeamCandidate} from './beam-flow-candidate.js';
import {buildBeamCandidate} from './beam-candidate.js';
import { createHash } from 'node:crypto';
import { zipSync, type Zippable } from 'fflate';
import { DomainError, MAX_DOCUMENT_BYTES, type BlendMode, type EffectDocument, type EmitterLayer, type MeshLayer, type TextureAsset, type TextureRef } from '../../core/src/model.js';
import { decodeTextureAsset, resolveTexture, resolveTextureAsset, textureAssetMetadata, type TexturePixels } from '../../core/src/textures.js';
import { assertResref, readHak, readTga, readNwnTga, writeHak, type ResourceFile } from './binary.js';
import { numeric, readAsciiMdl, sampleTrack, textProperty, vector } from './mdl-reader.js';
import { describeExportLayers, exporterVersion, EXPORTER_VERSION, fountainEnvelope, rgb, validateDocumentForExport, writeAsciiMdl } from './mdl-writer.js';
import { effectiveBlend, makeTexture, readTxi, textureInfo, TEXTURE_VERSION } from './textures.js';
import { readbackMesh, type MeshReadback } from './mesh-readback.js';
import { describeTrailExports, readbackTrail, type TrailReadback } from './trail-writer.js';
import { trailHeadPixels, trailProfilePixels, TRAIL_CAPABILITIES } from '../../core/src/trails.js';
import type { CompilationValidation } from './compiled-candidate.js';
import {exportAudio} from './audio-export.js';
import {bindEffectIntegration,type EffectIntegration} from './effect-integration.js';
import {readEmissionTiming} from './emission-readback.js';

export { assertResref, readHak, readTga, writeHak } from './binary.js';
export type { ResourceFile, TgaReadback } from './binary.js';
export { numeric, readAsciiMdl, sampleTrack, textProperty, vector } from './mdl-reader.js';
export type { MdlReadback, MdlNode, MdlAnimation } from './mdl-reader.js';
export { EXPORTER_VERSION } from './mdl-writer.js';
export type { MeshReadback } from './mesh-readback.js';
export { readTxi } from './textures.js';

export interface CandidateValidation {
  formatVersion: 1; exporterVersion: string; profileId: string; modelName: string;
  nativeVerified: false; structuralValidation: 'passed';
  documentSha256: string; coordinateSystem: 'NWN Z-up';
  checks: Record<string, boolean>;
  resources: Array<{ name: string; bytes: number; sha256: string }>;
  assets: Array<Omit<TextureAsset, 'pngBase64'> & { referenced: boolean; resources: string[] }>;
  readback: {
    animation: string; duration: number; detonateEvents: number[]; hakResourceCount: number;
    layers: Array<Record<string, unknown>>; meshes: MeshReadback[]; textures: Array<Record<string, unknown>>;trails?:TrailReadback[];
  };
  diagnostics: Array<{ code: string; severity: 'info' | 'warning'; message: string; layerId?: string }>;
  limitations: string[];
  integration: { moduleIncluded: false; visualeffects2daIncluded: false; installed: false; effect?: EffectIntegration };
  references: string[];
  compilation?: CompilationValidation;
}
export interface CandidateResult { files: ResourceFile[]; validation: CandidateValidation }
const utf8 = (value: string) => new TextEncoder().encode(value);
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const checked = (condition: boolean, message: string) => {
  if (!condition) throw new DomainError('EXPORT_VALIDATION_FAILED', message);
};
const close = (actual: number, expected: number) => Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
const sameVector = (actual: number[], expected: number[]) => actual.length === expected.length && actual.every((value, index) => close(value, expected[index]));

/** Produces downloadable assets without touching the filesystem, NWN or another
 * project. Validation reads serialized bytes, independently of serialization.
 * The experimental profile is deliberately not called native-qualified.
 */
export function buildCandidate(document: EffectDocument, modelName: string): CandidateResult {
  if(isBeamFlow(document))return buildFiniteBeamCandidate(document,modelName,buildTimelineCandidate);
  if(document.lifecycle==='beam')return buildBeamCandidate(document,modelName);
  return buildTimelineCandidate(document,modelName);
}
function buildTimelineCandidate(document:EffectDocument,modelName:string):CandidateResult {
  assertResref(modelName); validateDocumentForExport(document);
  const entries = describeExportLayers(document, modelName);
  const trails=describeTrailExports(document);
  const emitterEntries = entries.filter((entry): entry is typeof entry & { layer: EmitterLayer } => entry.layer.type === 'emitter');
  const meshEntries = entries.filter((entry): entry is typeof entry & { layer: MeshLayer } => entry.layer.type === 'mesh');
  const resources: ResourceFile[] = [];
  const sourceBytes = utf8(JSON.stringify(document));
  if (sourceBytes.length > MAX_DOCUMENT_BYTES || (document.assets?.length ?? 0) > 8)
    throw new DomainError('LIMIT_EXCEEDED', 'Przekroczony limit dokumentu lub 8 zasobów tekstur.');
  const assetIds = new Set<string>(), pixelCache = new Map<string, TexturePixels>();
  for (const asset of document.assets ?? []) {
    if (assetIds.has(asset.id)) throw new DomainError('INVALID_INPUT', 'Powtórzona tożsamość zasobu tekstury.');
    assetIds.add(asset.id); pixelCache.set(`asset:${asset.id}`, decodeTextureAsset(asset));
  }
  // Disabled references must remain valid in the source document, even though
  // they do not produce native resources for this candidate.
  for (const layer of document.layers) if (layer.texture) resolveTextureAsset(document, layer.texture);
  const textureMap = new Map<string, { resref: string; pixels: TexturePixels; sourceRefs: Set<TextureRef>; blend: BlendMode }>();
  for (const entry of entries) {
    const { layer } = entry, ref = layer.texture, blend = effectiveBlend(layer);
    if (!ref && blend === 'normal') continue;
    // A solid white native material represents additive untextured meshes.
    const key = ref ?? 'internal:white';
    let pixels = pixelCache.get(key);
    if (!pixels) {
      pixels = ref ? resolveTexture(document, ref) : { width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4).fill(255) };
      pixelCache.set(key, pixels);
    }
    const data = makeTexture(pixels), txi = utf8(textureInfo(blend));
    const digest = createHash('sha256').update(data).update(txi).digest('hex');
    let material = textureMap.get(digest);
    if (!material) {
      const resref = `vfx_${digest.slice(0, 12)}`;
      checked(![...textureMap.values()].some(value => value.resref === resref), 'Kolizja skróconego resref tekstury.');
      material = { resref, pixels, sourceRefs: new Set(), blend }; textureMap.set(digest, material);
      resources.push({ name: `${resref}.tga`, data }, { name: `${resref}.txi`, data: txi });
    }
    if (ref) material.sourceRefs.add(ref);
    entry.textureResref = material.resref;
  }
  for(const entry of trails) {
    const pixels=entry.part.kind==='head'?trailHeadPixels():trailProfilePixels(entry.layer.glowStrength),data=makeTexture(pixels),txi=utf8(textureInfo('additive'));
    const digest=createHash('sha256').update(data).update(txi).digest('hex');let material=textureMap.get(digest);
    if(!material){const resref=`vfx_${digest.slice(0,12)}`;checked(![...textureMap.values()].some(value=>value.resref===resref),'Kolizja skróconego resref smugi.');
      material={resref,pixels,sourceRefs:new Set<TextureRef>(),blend:'additive'};textureMap.set(digest,material);resources.push({name:`${resref}.tga`,data},{name:`${resref}.txi`,data:txi});}
    entry.textureResref=material.resref;
  }
  const mdl = writeAsciiMdl(document, modelName, entries,trails);
  if(mdl.length>TRAIL_CAPABILITIES.maxMdlBytes)throw new DomainError('LIMIT_EXCEEDED','MDL przekracza limit 128 MiB.',{mdlBytes:mdl.length,maxMdlBytes:TRAIL_CAPABILITIES.maxMdlBytes});
  resources.unshift({ name: `${modelName}.mdl`, data: mdl });
  const parsed = readAsciiMdl(mdl), anim = parsed.animations[0];
  checked(parsed.model === modelName && parsed.classification.toUpperCase() === 'EFFECT' && parsed.animations.length === 1 && anim.name === (document.lifecycle==='beam'?'cast01':document.lifecycle??'impact'), 'Niezgodna tożsamość/model animacji po odczycie.');
  checked(close(anim.length, document.duration) && parsed.nodes.length === 1 + entries.length * 2+trails.length+emitterEntries.filter(e=>e.layer.beamBinding?.role==='flow').length, 'Niezgodny czas lub liczba węzłów.');
  const eventTimes = anim.events.map(event => event.time);
  const expectedEvents = [...new Set(emitterEntries.filter(entry => entry.layer.update === 'Explosion').map(entry => entry.layer.start))].sort((a, b) => a - b);
  checked(sameVector(eventTimes, expectedEvents) && anim.events.every(event => event.name === 'detonate'), 'Niezgodny harmonogram detonate.');
  const layerReadback = emitterEntries.map(({ layer, node, parent, textureResref }) => {
    const emitter = parsed.nodes.find(entry => entry.name === node)!;
    const parentNode = parsed.nodes.find(entry => entry.name === parent)!;
    const animatedEmitter = anim.nodes.find(entry => entry.name === node)!;
    const animatedParent = anim.nodes.find(entry => entry.name === parent)!;
    checked(!!emitter && !!parentNode && !!animatedEmitter && !!animatedParent, `Brak węzła ${node} po odczycie.`);
    checked(textProperty(emitter, 'update') === layer.update && textProperty(emitter, 'texture') === textureResref && textProperty(emitter, 'parent') === parent, 'Niezgodny emiter/tekstura/rodzic.');
    checked(sameVector(vector(parentNode, 'position'), layer.position) && close(numeric(parentNode, 'scale'), layer.scale) && sameVector(vector(emitter, 'position'), [0, 0, 0]), 'Utracona pozycja lub skala rodzica.');
    const orientation = vector(emitter, 'orientation', 4), parentOrientation = vector(parentNode, 'orientation', 4);
    checked(sameVector(orientation, layer.orientation ?? [0, 0, 1, 0]) && sameVector(parentOrientation, [0, 0, 1, 0]), 'Utracona orientacja emitera lub nieoczekiwany obrót rodzica.');
    checked(!animatedEmitter.tracks.orientation && !animatedParent.tracks.orientation
      && !animatedEmitter.properties.orientation && !animatedParent.properties.orientation, 'Statyczną orientację emitera nadpisuje animacja.');
    // This profile uses world-space particles. Verify the serialized flags too;
    // a rotated attachment or P2P gravity must not silently change the contract.
    for (const field of ['inherit', 'inheritvel', 'inherit_local', 'inherit_part', 'grav', 'affectedByWind'])
      checked(numeric(emitter, field) === 0, `Nieoczekiwana flaga przestrzeni/grawitacji ${node}.${field}.`);
    checked(numeric(emitter,'p2p')===(layer.beamBinding?.role==='flow'?1:0),'Utracona flaga P2P.');
    checked(sameVector(sampleTrack(animatedParent.tracks.position, 0), layer.position) && close(sampleTrack(animatedParent.tracks.scale, 0)[0], layer.scale), 'Utracona animowana hierarchia.');
    const sheet={columns:numeric(emitter,'xgrid'),rows:numeric(emitter,'ygrid'),frameStart:numeric(emitter,'frameStart'),frameEnd:numeric(emitter,'frameEnd'),fps:numeric(emitter,'fps')};
    checked(JSON.stringify(sheet)===JSON.stringify(layer.flipbook?{columns:layer.flipbook.columns,rows:layer.flipbook.rows,frameStart:layer.flipbook.frameStart,frameEnd:layer.flipbook.frameEnd,fps:layer.flipbook.fps}:{columns:1,rows:1,frameStart:0,frameEnd:0,fps:0}) && numeric(emitter,'random')===0 && numeric(emitter,'loop')===0,'Niezgodny atlas po odczycie.');
    for(const name of ['fps','framestart','frameend']) checked(!animatedEmitter.tracks[name] && !animatedEmitter.properties[name],'Animacja nadpisuje atlas.');
    const midPercent = layer.midPercent ?? .5;
    const fields = { alphaStart: layer.alpha, alphaEnd: layer.endAlpha, alphaMid: layer.midAlpha ?? layer.alpha + (layer.endAlpha - layer.alpha) * midPercent,
      sizeStart: layer.size, sizeEnd: layer.endSize, sizeMid: layer.midSize ?? layer.size + (layer.endSize - layer.size) * midPercent,
      percentStart: 0, percentMid: midPercent, percentEnd: 1,
      lifeExp: layer.life, mass: layer.gravity, spread: layer.spread, velocity: layer.speed };
    for (const [field, expected] of Object.entries(fields)) checked(close(numeric(emitter, field), expected), `Utracony parametr ${node}.${field}.`);
    checked(sameVector(vector(emitter, 'colorStart'), rgb(layer.color)) && sameVector(vector(emitter, 'colorEnd'), rgb(layer.endColor)), `Utracony kolor ${node}.`);
    const midColor = layer.midColor ? rgb(layer.midColor) : rgb(layer.color).map((value, index) => value + (rgb(layer.endColor)[index] - value) * midPercent);
    checked(sameVector(vector(emitter, 'colorMid'), midColor), `Utracony kolor środkowy ${node}.`);
    checked(textProperty(emitter, 'blend') === (effectiveBlend(layer) === 'normal' ? 'Normal' : 'Lighten'), `Utracony blend ${node}.`);
    const rateKeys = animatedEmitter.tracks.birthrate;
    checked(!!rateKeys, `Brak birthratekey ${node}.`);
    let estimatedCount = layer.count;
    if (layer.update === 'Explosion') {
      for (const time of eventTimes) checked(close(sampleTrack(rateKeys, time)[0], time === layer.start ? layer.count : 0), `Nieprawidłowa izolacja globalnego detonate: ${node}.`);
      checked(numeric(emitter,'birthrate')===(eventTimes.length===1?layer.count:0),`Nieprawidłowy bazowy birthrate: ${node}.`);
      if(eventTimes.length===1) checked(rateKeys.every(row=>row[1]===layer.count),`Pojedynczy detonate wymaga stałego count: ${node}.`);
    } else {
      const end = layer.start + layer.duration;
      checked(close(sampleTrack(rateKeys, layer.start)[0], 0) && close(sampleTrack(rateKeys, end)[0], 0), 'Fountain nie jest wygaszony na granicach emisji.');
      estimatedCount = rateKeys.slice(1).reduce((sum, row, index) => sum + (row[0] - rateKeys[index][0]) * (row[1] + rateKeys[index][1]) / 2, 0);
      checked(close(estimatedCount, layer.count), 'Nieprawidłowa całka emisji Fountain.');
      checked(close(sampleTrack(rateKeys, document.duration)[0], 0), 'Fountain pozostaje aktywny po końcu.');
    }
    return { ...(layer.flipbook?{flipbook:sheet}:{}), layerId: layer.id, node, parent, update: textProperty(emitter, 'update'),
      position: vector(parentNode, 'position'), parentScale: numeric(parentNode, 'scale'), orientation, parentOrientation,
      texture: textProperty(emitter, 'texture'), blend: textProperty(emitter, 'blend'),
      ...Object.fromEntries(Object.keys(fields).map(field => [field, numeric(emitter, field)])),
      colorStart: vector(emitter, 'colorStart'), colorMid: vector(emitter, 'colorMid'), colorEnd: vector(emitter, 'colorEnd'),
      birthrateKeys: rateKeys, authoredParticleCount: layer.count, integratedBirthrate: layer.update === 'Fountain' ? estimatedCount : null,
      emissionRampSeconds: layer.update === 'Fountain' ? fountainEnvelope(layer, document.duration).ramp : null };
  });
  const textureReadback = [...textureMap.values()].map(({ resref, pixels, sourceRefs, blend }) => {
    const file = resources.find(file => file.name === `${resref}.tga`)!;
    const texture = readTga(file.data), nwnTexture = readNwnTga(file.data);
    const txiName = `${resref}.txi`, txi = readTxi(resources.find(file => file.name === txiName)!.data);
    checked(texture.width === pixels.width && texture.height === pixels.height && texture.rgba.every((v, i) => v === pixels.rgba[i]), 'TGA nie zachowało dokładnych pikseli RGBA.');
    checked(texture.origin === 'bottom-left' && txi.blending === (blend === 'normal' ? 'default' : 'additive'), 'Utracona orientacja tekstury albo blend TXI.');
    checked(nwnTexture.rgba.every((v,i)=>v===pixels.rgba[i]), 'TGA odczytane od dołu nie odpowiada źródłu PNG.');
    let minAlpha = 255, maxAlpha = 0;
    for (let index = 3; index < texture.rgba.length; index += 4) {
      minAlpha = Math.min(minAlpha, texture.rgba[index]); maxAlpha = Math.max(maxAlpha, texture.rgba[index]);
    }
    return { name: file.name, width: texture.width, height: texture.height, bitsPerPixel: 32, minAlpha, maxAlpha, generator: TEXTURE_VERSION,
      origin: texture.origin, rgbaSha256: sha256(texture.rgba), nwnBottomFirstRgbaSha256:sha256(nwnTexture.rgba), sourceRefs: [...sourceRefs].sort(), blend, txi: { name: txiName, ...txi } };
  });
  const meshReadback = meshEntries.map(({ layer, node, parent, textureResref }) => {
    const material = textureReadback.find(value => value.name === `${textureResref}.tga`);
    return readbackMesh(parsed, anim, layer, node, parent, textureResref || null, material?.txi.blending === 'additive' ? 'additive' : 'normal', document.lifecycle!==undefined);
  });
  const trailReadback=trails.map(entry=>readbackTrail(parsed,entry));
  for (const node of parsed.nodes.filter(node => node.type === 'emitter' || node.type === 'trimesh'||node.type==='animmesh')) {
    const ref = textProperty(node, node.type === 'emitter' ? 'texture' : 'bitmap');
    if (ref === 'NULL') continue;
    checked(resources.some(file => file.name === `${ref}.tga`) && resources.some(file => file.name === `${ref}.txi`), 'Brak zależnej tekstury lub materiału TXI.');
  }
  const audio=exportAudio(document,modelName);resources.push(...audio.resources);
  const hak = writeHak(resources), unpacked = readHak(hak);
  checked(unpacked.length === resources.length && unpacked.every(file => {
    const original = resources.find(resource => resource.name === file.name);
    return !!original && sha256(file.data) === sha256(original.data);
  }), 'HAK nie zachował dokładnych bajtów zasobów.');
  const documentBytes = utf8(`${JSON.stringify(document, null, 2)}\n`);
  const emission=readEmissionTiming(mdl);
  const diagnostics: CandidateValidation['diagnostics'] = [
    ...audio.diagnostics,
    { code: 'NATIVE_NOT_VERIFIED', severity: 'warning', message: 'Odczyt zasobów przeszedł; NWN/Toolset nie zostały uruchomione. Podgląd nie stanowi dowodu zachowania gry.' },
    { code: 'NWN_INTEGRATION_REQUIRED', severity: 'warning', message: 'HAK zawiera zasoby efektu. Rejestracja visualeffects.2da, MOD i konfiguracja centralnego runnera należą do osobnej integracji konsumenta.' },
  ];
  if(trails.length) {
    diagnostics.push({code:'TRAIL_COMPILED_COST',severity:'info',message:`Smugi: ${new Set(trails.map(t=>t.layer.id)).size} warstw, ${trails.length} węzłów, ${trailReadback.reduce((n,t)=>n+t.vertexSamples,0)} próbek wierzchołków i UV. Cały MDL: ${mdl.length} B; HAK: ${hak.length} B. Budżet: ${TRAIL_CAPABILITIES.maxVertexSamples} próbek.`});
    diagnostics.push({code:'TRAIL_SAMPLED_APPROXIMATION',severity:'warning',message:`Animmesh i podgląd interpolują te same próbki 60 Hz. Początek smugi ma przyczynową rampę do 2/60 s. Maksymalny sprawdzony błąd punktu względem łamanej (kontrola 240 Hz): ${Math.max(...trailReadback.map(t=>t.maxCheckedHeadDeviationMetres))} m. Przecięte wstęgi, próbkowanie tekstur i zachowanie w NWN pozostają niezakwalifikowane.`});
  }
  if (emitterEntries.length) diagnostics.push(
    { code: 'PREVIEW_SEED_ONLY', severity: 'warning', message: 'Seedy dokumentu i warstw zachowano w JSON; native emitter ASCII nie udostępnia tu deterministycznego seeda. Rozkład cząstek w grze będzie inny.' },
    { code: 'NATIVE_MASS_MAPPING', severity: 'info', message: 'gravity zapisano bezpośrednio jako signed mass; nie jako parametr grav (P2P) ani potwierdzone przyspieszenie SI. Podgląd stosuje gravity w osi Z świata niezależnie od orientation. Spread zapisano w radianach, pozycję w układzie NWN Z-up; inherit/inheritvel/inherit_local/inherit_part i grav są zerowe.' },
  );
  if(eventTimes.length===1) diagnostics.push({code:'EXPLOSION_CONSTANT_SINGLE_EVENT',severity:'info',message:'Jeden wspólny detonate: bazowy i animowany birthrate są stałe i równe count. Usunięto zależność liczby cząstek od czasu próbkowania kontrolera. Uruchomienie eventu i widoczność nadal wymagają próby NWN.'});
  if(eventTimes.length>1) diagnostics.push({code:'EXPLOSION_FRAME_SAMPLING_UNQUALIFIED',severity:'warning',message:`${eventTimes.length} globalnych detonate; minimalny odstęp ${emission.minEventGap} s. Izolacja birthrate jest sprawdzona tylko w dokładnych czasach zdarzeń. Krok silnika może pominąć pik lub wyemitować cząstki przy cudzym zdarzeniu. Zobacz emitter-emission.json. Do kontroli użyj osobnego wariantu z jednym wspólnym startem; Studio nie przesuwa startów automatycznie.`});
  for (const { layer } of emitterEntries) {
    if (layer.orientation !== undefined) diagnostics.push({ code: 'EMITTER_ORIENTATION_NATIVE_UNQUALIFIED', severity: 'warning', layerId: layer.id, message: 'Statyczny axis-angle w radianach zapisano i odczytano na węźle emitter; dummy rodzic pozostaje bez obrotu. W podglądzie obrót dotyczy lokalnej osi wyrzutu +Z i stożka spread, a gravity pozostaje world Z. Odczyt MDL potwierdza dane; natywny rozkład, fizyka i wygląd wymagają osobnej kwalifikacji.' });
    if (layer.update === 'Explosion') diagnostics.push({ code: 'EXPLOSION_INSTANT', severity: 'info', layerId: layer.id, message: 'Autorski zamiar: count cząstek w start. duration jest parametrem Fountain i nie wydłuża eksplozji; życie cząstek określa life. Natywny moment i liczba emisji nie są zakwalifikowane.' });
    else diagnostics.push({ code: 'FOUNTAIN_COUNT_APPROXIMATE', severity: 'warning', layerId: layer.id, message: 'Count oznacza całkę birthrate po duration, z rampami do 1 ms. Rzeczywista liczba cząstek zależy od kroków czasowych NWN.' });
    if (layer.scale !== 1) diagnostics.push({ code: 'PARENT_SCALE_UNQUALIFIED', severity: 'warning', layerId: layer.id, message: 'Skalę zapisano na dummy rodzicu i sprawdzono w bajtach. Wpływ dziedziczenia skali na rozmiar/ruch cząstek wymaga próby natywnej.' });
  }
  for (const mesh of meshReadback) {
    if (mesh.deformation) diagnostics.push({code:'MESH_DEFORMATION_SAMPLES',severity:'info',layerId:mesh.layerId,
      message:`Animmesh: ${mesh.deformation.frameSets} klatek 60 Hz, ${mesh.deformation.vertexSamples} pozycji i ${mesh.deformation.uvSamples} UV; wszystkie próbki odczytano. Maksymalna odległość próbkowanej krzywej od autorskiej w lokalnych metrach: ${mesh.deformation.maxDeviationMetres}. Faces/UV są stałe; brak automatycznego glow. Interpolacja i oświetlenie NWN wymagają osobnego proof.`});
    if(mesh.shading?.deformationNormals)diagnostics.push({code:'MESH_ANIMATED_NORMALS_NOT_EXPORTED',severity:'warning',layerId:mesh.layerId,
      message:'Studio przelicza gładkie normalne z deformowanych pozycji. MDL zachowuje smoothing mask i pełne próbki pozycji/UV; przypięty kompilator zapisuje tylko normalne bazowe, bez animacji normalnych. Wygląd oświetlonej deformacji w NWN nie jest potwierdzony.'});
    diagnostics.push({ code: 'MESH_NATIVE_UNQUALIFIED', severity: 'warning', layerId: mesh.layerId, message: 'Geometrię mesh, UV, materiał i endpointy kontrolerów position/orientation/scale/alpha odczytano z MDL/TXI. Studio używa shortest-path slerp rotacji; interpolacja i wygląd natywny nie zostały zakwalifikowane. Materiał ma diffuse/selfillumcolor; winding określa widoczną stronę.' });
    if (mesh.visibilityRampSeconds.start || mesh.visibilityRampSeconds.end)
      diagnostics.push({ code: 'MESH_VISIBILITY_RAMP', severity: 'warning', layerId: mesh.layerId, message: `Twarde granice widoczności zapisano jako liniowe rampy alpha: początek ${mesh.visibilityRampSeconds.start} s, koniec ${mesh.visibilityRampSeconds.end} s (maks. 1 ms). Wszystkie wewnętrzne klucze zachowano.` });
  }
  if (textureReadback.length) diagnostics.push({ code: 'TEXTURE_RGBA_PRESERVED', severity: 'info', message: 'TGA zachowuje dokładne RGBA8 wspólnego źródła podglądu, łącznie z RGB pod zerowym alpha. UV ma początek w lewym dolnym rogu. Materiał normal/additive sprawdzono w TXI; filtrowanie, kolor i mieszanie w grze wymagają testu natywnego.' });
  if (emitterEntries.some(({ layer }) => ['midColor', 'midAlpha', 'midSize', 'midPercent'].some(key => Object.hasOwn(layer, key)))) diagnostics.push({ code: 'PARTICLE_AGE_MIDPOINT', severity: 'info', message: 'color/alpha/size Start–Mid–End mają wspólny percentMid jako ułamek wieku cząstki. Odczyt MDL potwierdza wartości, nie kwalifikuje natywnej interpolacji ani zarządzania kolorem.' });
  if(audio.resources.length)diagnostics.push({code:'AUDIO_SCRIPT_REQUIRED',severity:'warning',message:document.lifecycle==='duration'&&document.audioClips?.some(c=>c.enabled)
    ?'Audio DUR eksportuje WAV jednego okresu. Konsument musi zaplanować powtórzenia i anulować przyszłe wywołania przy końcu umiejętności. Pojedynczy SoundImpact nie zapewnia pętli. Już uruchomiony dźwięk może wybrzmieć; timing i odsłuch NWN pozostają niesprawdzone. Kontrakt: audio-events.json v2.'
    :'Audio wymaga jawnego powiązania pełnego miksu z SoundImpact lub alternatywnego harmonogramu audio-events.nss. Nie uruchamiaj obu dróg. WAV w HAK nie uruchamia się sam. Parametry klipu są wypalone do PCM16 mono 44100 Hz; źródła zachowano. Native timing i odsłuch nie są zakwalifikowane.'});
  const files = [...resources,...audio.files, { name: `${modelName}.hak`, data: hak }, { name: 'effect-document.json', data: documentBytes },
    {name:'emitter-emission.json',data:utf8(JSON.stringify({...emission,sourceMdlSha256:sha256(mdl)},null,2)+'\n')}];
  const validation: CandidateValidation = {
    formatVersion: 1, exporterVersion: exporterVersion(document), profileId: document.profileId, modelName,
    nativeVerified: false, structuralValidation: 'passed', documentSha256: sha256(documentBytes), coordinateSystem: 'NWN Z-up',
    checks: { asciiParsed: true, hierarchyAndParentScaleRead: true, parametersRead: true, burstEventsIsolated: eventTimes.length<=1,
      burstEventTimeValuesRead:true, nativeBurstTimingVerified:false,
      fountainEmissionBounded: true, allTextureDependenciesIncluded: true, tgaRead: true, hakExactResourceReadback: true,
      meshGeometryRead: true, meshControllerKeysRead: true, meshUvRead: true, rgbaPixelsExact: true, txiRead: true, particleAgeMidpointRead: true,
      emitterOrientationRead: true, emitterWorldSpaceFlagsRead: true,trailAnimationSamplesRead:true,meshDeformationSamplesRead:true,meshShadingMasksRead:true },
    resources: files.map(file => ({ name: file.name, bytes: file.data.length, sha256: sha256(file.data) })),
    assets: (document.assets ?? []).map(asset => {
      const assetResources = textureReadback.filter(texture => texture.sourceRefs.includes(`asset:${asset.id}`)).flatMap(texture => [texture.name, texture.txi.name]);
      return { ...textureAssetMetadata(asset), referenced: assetResources.length > 0, resources: assetResources };
    }),
    readback: { animation: anim.name, duration: anim.length, detonateEvents: eventTimes, hakResourceCount: unpacked.length, layers: layerReadback, meshes: meshReadback, textures: textureReadback,trails:trailReadback },
    diagnostics,
    limitations: [
      'Experimental ASCII emitter, textured trimesh, fixed-topology custom mesh deformation and generated trail animmesh subset; light, topology animation, rigs and arbitrary animated model imports are unsupported.',
      'Custom smooth shading uses area-weighted normals at shared position indices, independent of UV seams. Studio recomputes them from interpolated deformation positions. ASCII stores smoothing masks; the pinned binary compiler stores static base normals, checked in both base and animation smooth animmesh nodes. Animated normals are not exported. Native lighting and appearance remain unqualified.',
      'Custom vertex deformation linearly resamples authored mesh-local positions on the shared global 60 Hz grid. Readback reports maximum local resampling deviation and hashes every position/UV sample. Faces and UV remain fixed. No fluid solver, collision or automatic glow; native normals and lighting remain unqualified.',
      'No native engine build has been qualified. File integrity does not establish visibility, timing, artistic quality or renderer parity.',
      'One shared Explosion start uses constant base and animated count with one global detonate. Multiple starts retain legacy event-time gates: isolation is not guaranteed at engine frame times. emitter-emission.json reports explicit before/after frame sampling experiments at 30/60/120 Hz, not retail engine observations.',
      'Native particle randomness, inherited scale, blending and signed-mass dynamics require comparison with NWN.',
      'Emitter orientation is static parent-relative axis-angle in radians. Studio rotates the local +Z launch cone, then applies gravity in world Z; it does not rotate the full cloud or the billboard plane. World-space inherit flags and P2P grav are zero. This analytical mapping is not native runtime qualification.',
      'Mesh orientation keys preserve axis-angle radians; Studio shortest-path slerp is not a qualified native interpolation guarantee. Nonzero lifetime-boundary opacity uses <=1 ms linear ramps.',
      (document.lifecycle!==undefined?'Explicit lifecycle mesh alpha preserves authored cycle endpoints without visibility ramps. Native interpolation remains unqualified.': 'Mesh material optionally separates diffuse and selfillumcolor. Omission exports both from color. Preview lighting is a fixed Lambert approximation, not native-qualified; geometry alpha is zero until impact animation controls visibility. No automatic double-sided material or arbitrary controller interpolation.'),
      'Texture import is RGBA8 non-interlaced PNG, POT dimensions 8–1024, at most 2 MiB per asset and 8 assets per 6 MiB document. TGA conversion preserves raw pixels, not ICC color management. TXI supports explicit default/additive blending, mipmap 1 and filter 1 only.',
      'Particle lifetime curves use one shared percentMid (0.01–0.99) for color/alpha/size, with percentStart 0 and percentEnd 1. MDL RGB fractions preserve authored hex/255; Studio works in a linear-light rendering pipeline, and native color/interpolation parity remains unqualified.',
      ...(document.layers.some(l=>l.type==='emitter'&&l.flipbook)?['Atlas playback uses PNG top-left row-major frames, inclusive range, repeating integer FPS from each particle birth. Retail NWN frame order, UV sampling and playback rate require separate qualification.']:[]),
      'No collision/bounce, moving attachment, P2P, random atlas playback, arbitrary curves or binary MDL compilation in this profile.',
      'No MOD, NWScript or visualeffects.2da is generated. The resource HAK requires the consumer integration profile.',
    ],
    integration: { moduleIncluded: false, visualeffects2daIncluded: false, installed: false },
    references: [
      'https://nwn.wiki/spaces/NWN1/pages/12027273/MDL+ASCII',
      'https://nwn.wiki/pages/viewpage.action?pageId=139690011',
      'https://github.com/niv/neverwinter.nim/blob/master/neverwinter/erf.nim',
      'https://neverwintervault.org/article/tutorial/bioware-txi-example',
      'https://raw.githubusercontent.com/jd28/rollnw/main/lib/nw/model/mdl_particle_import.cpp',
      'https://raw.githubusercontent.com/jd28/rollnw/main/lib/nw/render/particle_system.cpp',
      'https://raw.githubusercontent.com/xoreos/xoreos/master/src/graphics/aurora/model_nwn.cpp',
    ],
  };
  files.push({ name: 'validation.json', data: utf8(`${JSON.stringify(validation, null, 2)}\n`) });
  files.push({ name: 'README.txt', data: utf8(`NWN VFX Studio — experimental candidate\n\nModel: ${modelName}.mdl\nAnimation: ${document.lifecycle??'impact'}\nResource HAK: ${modelName}.hak\n\nUse validation.json for exact resource hashes, property readback and limitations.\nThe package has NOT been tested in NWN or the Toolset.\nThe HAK does not include visualeffects.2da or a module. Your integration must\nchoose collision-free VFX registration, HAK order and a central runner profile.\nDo not install over a live module as a side effect of inspecting this package.\n\nSource document: effect-document.json\nNative emitter randomness is not controlled by the Studio seed.\n`) });
  return bindEffectIntegration({ files, validation },document);
}

/** Reproducible ZIP; timestamps do not change candidate hashes on a retry. */
export function zipCandidate(candidate: CandidateResult): Uint8Array {
  const content: Zippable = {};
  for (const file of candidate.files) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file.name) || Object.hasOwn(content, file.name))
      throw new DomainError('INVALID_INPUT', 'Nieprawidłowa lub powtórzona nazwa w paczce.');
    content[file.name] = [file.data, { mtime: new Date('2000-01-01T00:00:00Z') }];
  }
  return zipSync(content, { level: 6 });
}
