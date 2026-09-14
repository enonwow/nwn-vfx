import {usesExtendedBeam} from '../../core/src/beam-multistrand.js';
import {beamFlowEnvelope,isBeamFlow,isCompositeBeam} from '../../core/src/beam-flow.js';
import { assertDocumentInvariants, DomainError, PROFILE_ID, documentProfile, type EffectDocument, type Layer, type EmitterLayer } from '../../core/src/model.js';
import { assertResref } from './binary.js';
import { validateMeshForExport, writeMeshNodes } from './mesh-writer.js';
import { effectiveBlend } from './textures.js';
import { validateTrail, assertTrailBudget } from '../../core/src/trails.js';
import { assertMeshDeformationBudget, validateMeshDeformation } from '../../core/src/deformation.js';
import { writeTrailNodes, type TrailExport } from './trail-writer.js';

import {validateEmitterFlipbook} from '../../core/src/flipbook.js';
import {durationSeams} from '../../core/src/lifecycle.js';
export const LIFECYCLE_EXPORTER_VERSION='nwn-ascii-vfx-0.22.0';
export const EXPORTER_VERSION = 'nwn-ascii-vfx-0.21.1';
export function exporterVersion(document:EffectDocument,binary=false) {
  if(document.lifecycle==='beam'&&document.audioClips?.some(c=>c.enabled))return `nwn-${binary?'binary':'ascii'}-vfx-0.30.0`;
  if(document.layers.some(l=>l.type==='beam'&&l.materialMotion))return `nwn-${binary?'binary':'ascii'}-vfx-0.29.0`;
  if(usesExtendedBeam(document))return `nwn-${binary?'binary':'ascii'}-vfx-0.28.2`;
  if(isCompositeBeam(document))return `nwn-${binary?'binary':'ascii'}-vfx-0.28.1`;
  const version=isBeamFlow(document)?'0.27.0':document.lifecycle==='beam'?(document.layers.some(l=>l.type==='beam'&&l.enabled&&l.textureMapping)?'0.26.2':'0.26.1'):document.lifecycle==='duration'&&document.audioClips?.some(c=>c.enabled)?'0.24.0':document.layers.some(l=>Object.hasOwn(l,'deformationInterpolation'))?'0.23.0':document.lifecycle!==undefined?'0.22.0':'0.21.1';
  return `nwn-${binary?'binary':'ascii'}-vfx-${version}`;
}
export function rgb(hex: string): number[] { return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255); }
const number = (value: number): string => Object.is(value, -0) ? '0' : value.toString();
const values = (row: number[]) => row.map(number).join(' ');
const keys = (property: string, rows: number[][]) => `  ${property}key ${rows.length}\n${rows.map(row => `    ${values(row)}`).join('\n')}\n  endlist\n`;

export interface ExportLayer { layer: Exclude<Layer,{type:'trail'|'beam'}>; node: string; parent: string; textureResref: string }
export function validateDocumentForExport(document: EffectDocument): void {
  const invalid = (message: string): never => { throw new DomainError('INVALID_INPUT', message); };
  if(document.lifecycle==='beam'){assertDocumentInvariants(document);return;}
  if(document.orientWithObject!==undefined&&(typeof document.orientWithObject!=='boolean'||document.schemaVersion<11))invalid('Obracanie z postacią wymaga wartości logicznej i dokumentu 11.');
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].includes(document.schemaVersion) || document.profileId !== documentProfile(document.lifecycle))
    throw new DomainError('UNSUPPORTED_EXPORT', 'Eksporter obsługuje tylko eksperymentalny profil ASCII VFX.', { supportedProfile: PROFILE_ID });
  const range = (value: number, min: number, max: number, path: string) => {
    if (!Number.isFinite(value) || value < min || value > max) invalid(`Wartość poza zakresem eksportu: ${path}`);
  };
  range(document.duration, .01, 60, 'duration');
  if (!Array.isArray(document.layers) || document.layers.length > 64) invalid('Eksporter obsługuje maksymalnie 64 warstwy.');
  const ids = new Set<string>();
  for (const layer of document.layers) {
    if(Object.hasOwn(layer,'deformationInterpolation')&&(layer.type!=='mesh'||document.schemaVersion<14))invalid('Interpolacja deformacji wymaga siatki i dokumentu 14.');
    if (!layer.id || ids.has(layer.id)) invalid('Brak lub powtórzone ID warstwy.');
    ids.add(layer.id);
    validateEmitterFlipbook(layer,document);
    if(Object.hasOwn(layer,'flipbook')&&document.schemaVersion<12)invalid('Atlas wymaga dokumentu 12.');
    if (layer.blend !== undefined && !['normal', 'additive'].includes(layer.blend))
      throw new DomainError('UNSUPPORTED_EXPORT', `Nieobsługiwany blend: ${layer.id}`);
    if (layer.type === 'mesh' && layer.shading !== undefined && document.schemaVersion < 8) invalid('Cieniowanie mesh wymaga schemaVersion 8.');
    const texture = layer.texture;
    if (layer.type === 'mesh' && layer.material !== undefined && document.schemaVersion < 5) invalid('Materiał mesh wymaga schemaVersion 5.');
    if (texture != null && !['spark', 'smoke', 'glow'].includes(texture) && !/^asset:[0-9a-f]{64}$/.test(texture)) invalid(`Nieobsługiwana tekstura: ${layer.id}`);
    const hasNewFields = layer.blend !== undefined || (layer.type === 'mesh'
      ? layer.texture !== undefined || (layer.geometry.kind === 'custom' && (layer.geometry.uv !== undefined || layer.geometry.uvFaces !== undefined))
      : layer.texture.startsWith('asset:') || ['midColor', 'midAlpha', 'midSize', 'midPercent'].some(key => Object.hasOwn(layer, key)));
    if (document.schemaVersion < 3 && hasNewFields) invalid('Tekstury, UV i parametry środkowe wymagają schemaVersion 3.');
    if (layer.type !== 'mesh' && layer.orientation !== undefined) {
      if (document.schemaVersion < 4) invalid('Orientacja emitera wymaga schemaVersion 4.');
      if (!Array.isArray(layer.orientation) || layer.orientation.length !== 4) invalid(`Nieprawidłowa orientacja: ${layer.id}`);
      for (const value of layer.orientation) range(value, -8 * Math.PI, 8 * Math.PI, `${layer.id}.orientation`);
      if (Math.abs(Math.hypot(...layer.orientation.slice(0, 3)) - 1) > 1e-5)
        invalid(`Oś orientation musi mieć długość 1: ${layer.id}`);
    }
    if(layer.type==='trail'){if(document.schemaVersion<6)invalid('Smuga wymaga schemaVersion 6.');validateTrail(layer,document.duration);continue;}
    if(layer.type==='mesh' && layer.animation.vertices !== undefined) {
      if(document.schemaVersion<7)invalid('Deformacja mesh wymaga schemaVersion 7.');
      validateMeshDeformation(layer);
    }
    if (!layer.enabled) continue;
    if (layer.type === 'mesh') {
      if (document.schemaVersion < 2) invalid('Warstwa mesh wymaga schemaVersion co najmniej 2.');
      validateMeshForExport(layer, document.duration); continue;
    }
    if (layer.type !== 'emitter') throw new DomainError('UNSUPPORTED_EXPORT', `Warstwa ${layer.id}: eksport ${layer.type} nie jest zaimplementowany w tym profilu.`, { layerId: layer.id, supported: ['emitter', 'mesh'] });
    if (!['Explosion', 'Fountain'].includes(layer.update) || !layer.texture) invalid(`Nieobsługiwany tryb/tekstura: ${layer.id}`);
    if (!/^#[0-9a-f]{6}$/i.test(layer.color) || !/^#[0-9a-f]{6}$/i.test(layer.endColor)) invalid(`Nieprawidłowy kolor: ${layer.id}`);
    if (layer.midColor !== undefined && !/^#[0-9a-f]{6}$/i.test(layer.midColor)) invalid(`Nieprawidłowy midColor: ${layer.id}`);
    if (layer.midAlpha !== undefined) range(layer.midAlpha, 0, 1, `${layer.id}.midAlpha`);
    if (layer.midSize !== undefined) range(layer.midSize, 0, 20, `${layer.id}.midSize`);
    if (layer.midPercent !== undefined) range(layer.midPercent, .01, .99, `${layer.id}.midPercent`);
    for (const key of ['colorMidPercent', 'alphaMidPercent', 'sizeMidPercent']) if (Object.hasOwn(layer, key))
      throw new DomainError('UNSUPPORTED_EXPORT', 'ASCII emiter ma jeden wspólny percentMid dla koloru, alpha i rozmiaru.');
    for (const field of ['alpha', 'endAlpha'] as const) range(layer[field], 0, 1, `${layer.id}.${field}`);
    for (const field of ['size', 'endSize'] as const) range(layer[field], 0, 20, `${layer.id}.${field}`);
    range(layer.count, 0, 10000, `${layer.id}.count`);
    if (!Number.isInteger(layer.count)) invalid(`Liczba cząstek musi być całkowita: ${layer.id}`);
    range(layer.life, .001, 60, `${layer.id}.life`);
    range(layer.speed, 0, 100, `${layer.id}.speed`);
    range(layer.spread, 0, 2 * Math.PI, `${layer.id}.spread`);
    range(layer.gravity, -100, 100, `${layer.id}.gravity`);
    range(layer.start, 0, document.duration, `${layer.id}.start`);
    range(layer.duration, .001, 60, `${layer.id}.duration`);
    range(layer.scale, .001, 100, `${layer.id}.scale`);
    if (!Array.isArray(layer.position) || layer.position.length !== 3) invalid(`Nieprawidłowa pozycja: ${layer.id}`);
    layer.position.forEach(value => range(value, -10000, 10000, `${layer.id}.position`));
    const emissionEnd = layer.start + (layer.update === 'Fountain' ? layer.duration : 0);
    if (emissionEnd + layer.life > document.duration + 1e-9)
      throw new DomainError('UNSUPPORTED_EXPORT', `Warstwa ${layer.id} wykracza poza czas efektu. Wydłuż projekt do co najmniej ${number(emissionEnd + layer.life)} s.`, { layerId: layer.id, minimumDuration: emissionEnd + layer.life });
  }
  if(document.lifecycle!==undefined&&(!['impact','duration'].includes(document.lifecycle)||document.schemaVersion<13))invalid('Tryb efektu wymaga dokumentu 13.');
  durationSeams(document);
  assertTrailBudget(document);
  assertMeshDeformationBudget(document);
  if (document.assets !== undefined && document.schemaVersion < 3) invalid('Zasoby tekstur wymagają schemaVersion 3.');
  if (!document.layers.some(layer => layer.enabled)) invalid('Eksport wymaga co najmniej jednej włączonej warstwy.');
}

export function describeExportLayers(document: EffectDocument, modelName: string): ExportLayer[] {
  assertResref(modelName);
  // Resource names are assigned by content hash in buildCandidate. Layer names
  // and project paths never become MDL identifiers or generated code.
  return document.layers.filter((layer):layer is Exclude<Layer,{type:'trail'|'beam'}> => layer.enabled&&layer.type!=='trail'&&layer.type!=='beam').map((layer, index) => ({
    layer, node: `${layer.type === 'mesh' ? 'mesh' : 'em'}_${index}`, parent: `layer_${index}`, textureResref: '',
  }));
}

/** A single global burst needs no time gate. Keep both base and animation
 * values constant so sampling before/after the event cannot lose its count.
 * Multi-event gates match only exact event times; frame isolation is unqualified.
 */
function explosionKeys(layer: EmitterLayer, events: number[], length: number): number[][] {
  if (events.length === 1) return [[0, layer.count], [length, layer.count]];
  const times = [...new Set([0, ...events, length])].sort((a, b) => a - b);
  return times.map(time => [time, time === layer.start ? layer.count : 0]);
}
/** A native linear birthrate track with 1 ms maximum edge ramps, compensated so
 * its integral equals count. NWN frame stepping may alter actual particle count.
 */
export function fountainEnvelope(layer: EmitterLayer, length: number): { rows: number[][]; ramp: number; rate: number } {
  if(layer.beamBinding)return beamFlowEnvelope(layer,length);
  const ramp = Math.min(.001, layer.duration / 4), end = layer.start + layer.duration;
  const rate = layer.count / (layer.duration - ramp);
  const rows = [[0, 0], [layer.start, 0], [layer.start + ramp, rate], [end - ramp, rate], [end, 0], [length, 0]];
  return { rows: rows.filter((row, index) => index === 0 || row[0] !== rows[index - 1][0]), ramp, rate };
}

export function writeAsciiMdl(document: EffectDocument, modelName: string, layers: ExportLayer[],trails:TrailExport[]=[]): Uint8Array {
  validateDocumentForExport(document); assertResref(modelName);
  const events = [...new Set(layers.filter(({ layer }) => layer.type === 'emitter' && layer.update === 'Explosion').map(({ layer }) => layer.start))].sort((a, b) => a - b);
  if (new Set(events.map(Math.fround)).size !== events.length)
    throw new DomainError('UNSUPPORTED_EXPORT', 'Czasy eksplozji są zbyt bliskie dla precyzji float32 silnika.');
  const geometry: string[] = [], animation: string[] = [];
  for(const trail of trails){const data=writeTrailNodes(trail,modelName);geometry.push(data.geometry);animation.push(data.animation);}
  for (const [index, entry] of layers.entries()) {
    const { layer, node, parent, textureResref } = entry;
    if (layer.type === 'mesh') {
      if (textureResref) assertResref(textureResref);
      const mesh = writeMeshNodes(layer, modelName, node, parent, document.duration, textureResref || null, document.lifecycle!==undefined);
      geometry.push(mesh.geometry); animation.push(mesh.animation); continue;
    }
    assertResref(textureResref);
    const startColor = rgb(layer.color), endColor = rgb(layer.endColor);
    const midPercent = layer.midPercent ?? .5;
    const midpoint = (start: number, end: number) => start + (end - start) * midPercent;
    geometry.push(`node dummy ${parent}\n  parent ${modelName}\n  position ${values(layer.position)}\n  orientation 0 0 1 0\n  scale ${number(layer.scale)}\nendnode\n`);
    const properties: Record<string, string | number | number[]> = {
      // Static emitter-local rotation changes the launch axis, while the parent
      // retains the historical position/scale. No orientation animation is added.
      parent, position: [0, 0, 0], orientation: layer.orientation ?? [0, 0, 1, 0],
      update: layer.update, render: 'Normal', blend: effectiveBlend(layer) === 'normal' ? 'Normal' : 'Lighten', texture: textureResref,
      xgrid: layer.flipbook?.columns ?? 1, ygrid: layer.flipbook?.rows ?? 1, xsize: 0, ysize: 0, spawntype: 0, twosidedtex: 1, loop: 0, renderorder: index,
      p2p: layer.beamBinding?.role==='flow'?1:0, p2p_sel: 1, affectedByWind: 0, m_isTinted: 0, bounce: 0, random: 0,
      inherit: 0, inheritvel: 0, inherit_local: 0, inherit_part: 0, splat: 0,
      alphaStart: layer.alpha, alphaMid: layer.midAlpha ?? midpoint(layer.alpha, layer.endAlpha), alphaEnd: layer.endAlpha,
      colorStart: startColor, colorMid: layer.midColor ? rgb(layer.midColor) : startColor.map((value, i) => midpoint(value, endColor[i])), colorEnd: endColor,
      sizeStart: layer.size, sizeMid: layer.midSize ?? midpoint(layer.size, layer.endSize), sizeEnd: layer.endSize,
      sizeStart_y: 0, sizeMid_y: 0, sizeEnd_y: 0,
      birthrate: layer.update === 'Explosion' && events.length === 1 ? layer.count : 0,
      lifeExp: layer.life, mass: layer.gravity, spread: layer.spread,
      velocity: layer.speed, randvel: 0, particleRot: 0,
      percentStart: 0, percentMid: midPercent, percentEnd: 1,
      bounce_co: 0, blurlength: 0, fps: layer.flipbook?.fps ?? 0, frameStart: layer.flipbook?.frameStart ?? 0, frameEnd: layer.flipbook?.frameEnd ?? 0,
      grav: 0, drag: 0, threshold: 0, combinetime: 0, deadspace: 0, blastRadius: 0, blastLength: 0,
      p2p_bezier2: 0, p2p_bezier3: 0,
    };
    geometry.push(`node emitter ${node}\n${Object.entries(properties).map(([key, value]) => `  ${key} ${Array.isArray(value) ? values(value) : typeof value === 'number' ? number(value) : value}`).join('\n')}\nendnode\n`);
    if(layer.beamBinding?.role==='flow')geometry.push(`node reference target_${index}\n  parent ${node}\n  position 0 1 0\n  orientation 0 0 1 0\n  refModel fx_ref\n  reattachable 1\nendnode\n`);
    animation.push(`node dummy ${parent}\n  parent ${modelName}\n${keys('position', [[0, ...layer.position]])}${keys('scale', [[0, layer.scale]])}endnode\n`);
    const rateKeys = layer.update === 'Explosion' ? explosionKeys(layer, events, document.duration) : fountainEnvelope(layer, document.duration).rows;
    animation.push(`node emitter ${node}\n  parent ${parent}\n${keys('birthrate', rateKeys)}endnode\n`);
  }
  return new TextEncoder().encode(`#MAXMODEL ASCII\n# NWN VFX Studio: experimental VFX profile; no native verification.\nnewmodel ${modelName}\nsetsupermodel ${modelName} NULL\nclassification EFFECT\nsetanimationscale 1\nbeginmodelgeom ${modelName}\nnode dummy ${modelName}\n  parent NULL\nendnode\n${geometry.join('')}endmodelgeom ${modelName}\nnewanim ${document.lifecycle==='beam'?'cast01':document.lifecycle??'impact'} ${modelName}\n  length ${number(document.duration)}\n  transtime 0\n  animroot ${modelName}\n${events.map(time => `  event ${number(time)} detonate\n`).join('')}node dummy ${modelName}\n  parent NULL\nendnode\n${animation.join('')}doneanim ${document.lifecycle==='beam'?'cast01':document.lifecycle??'impact'} ${modelName}\ndonemodel ${modelName}\n`);
}
