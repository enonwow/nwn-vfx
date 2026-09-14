import {usesExtendedBeam} from './beam-multistrand.js';
import {makeBeamLayer} from './beam.js';
export const CONTRACT_VERSION = '0.1.0';
import {normalizeAudioValues,type AudioAsset,type AudioClip,type AudioClipInput,type AudioValues} from './audio.js';
export const STUDIO_VERSION = '0.30.1';
export const EFFECT_LOCK_ID = '@effect';
export const EFFECT_INTEGRATION_CAPABILITIES = { version: 1, field: 'orientWithObject', default: false,
  documentSchemaVersion: 11, lock: { layerId: EFFECT_LOCK_ID, field: 'orientWithObject' },
  artifact: 'vfx-integration.json', table: 'visualeffects.2da', column: 'OrientWithObject',
  attachmentControlledByConsumer: true, rotatingCharacterPreview: false, nativeVerified: false } as const;
export { MAX_DOCUMENT_BYTES } from './constants.js';
export const PROFILE_ID = 'nwn-ee-impact-ascii-experimental-v1';
export const DURATION_PROFILE_ID = 'nwn-ee-duration-ascii-experimental-v1';
export const BEAM_PROFILE_ID='nwn-ee-beam-ascii-experimental-v1';
export function documentProfile(lifecycle?:'impact'|'duration'|'beam') { return lifecycle==='beam'?BEAM_PROFILE_ID:lifecycle==='duration'?DURATION_PROFILE_ID:PROFILE_ID; }
export type LayerType = 'emitter' | 'ribbon' | 'light' | 'mesh' | 'trail' | 'beam';
export type UpdateMode = 'Explosion' | 'Fountain';
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type TextureRef = 'spark' | 'smoke' | 'glow' | 'beam-soft' | `asset:${string}`;
export type BlendMode = 'normal' | 'additive';
export interface TextureNormalization {
  version: 1; method: 'area' | 'bilinear'; colorSpace: 'linear-srgb'; alphaMode: 'premultiplied';
  /** Provenance of the source upload; original bytes are not retained in the normalized asset. */
  originalSha256: string; originalWidth: number; originalHeight: number; originalColorType: 2 | 6; targetSize: 512 | 1024;
  contentWidth: number; contentHeight: number; offsetX: number; offsetY: number;
}
export interface TextureAsset {
  id: string; name: string; mime: 'image/png'; width: number; height: number; pngBase64: string;
  source: { fileName: string; sha256: string; normalization?: TextureNormalization };
}
export type AxisAngle = [number, number, number, number];
export interface Keyframe<T> { time: number; value: T }
export type MeshGeometry =
  | { kind: 'box'; dimensions: Vec3 }
  | { kind: 'ring'; innerRadius: number; outerRadius: number; segments: number }
  | { kind: 'custom'; vertices: Vec3[]; faces: [number, number, number][]; uv?: Vec2[]; uvFaces?: [number, number, number][] };
export interface MeshAnimation {
  position?: Keyframe<Vec3>[]; orientation?: Keyframe<AxisAngle>[];
  scale?: Keyframe<number>[]; alpha?: Keyframe<number>[];
  /** Absolute mesh-local positions, fixed custom vertex order/topology. */
  vertices?: Keyframe<Vec3[]>[];
}
export interface MeshLayer {
  id: string; name: string; type: 'mesh'; enabled: boolean;
  color: string; alpha: number; start: number; duration: number;
  position: Vec3; orientation: AxisAngle; scale: number;
  geometry: MeshGeometry; animation: MeshAnimation;
  shading?: 'flat' | 'smooth';
  /** Omission preserves historical linear vertex interpolation. */
  deformationInterpolation?: 'linear' | 'monotone-cubic' | 'monotone-cubic-loop';
  texture?: TextureRef | null; blend?: BlendMode;
  /** Atomic material. Omission retains the legacy unlit preview and export. */
  material?: { diffuse: string; selfIllumination: string };
}
export interface EmitterLayer {
  id: string; name: string; type: 'emitter' | 'ribbon' | 'light'; enabled: boolean;
  color: string; endColor: string; alpha: number; endAlpha: number;
  size: number; endSize: number; count: number; life: number;
  speed: number; spread: number; gravity: number; start: number; duration: number;
  position: [number, number, number]; scale: number; seed: number;
  /** Static right-handed rotation of the local +Z launch direction; omission is identity. */
  orientation?: AxisAngle;
  texture: TextureRef; update: UpdateMode; blend?: BlendMode;
  midColor?: string; midAlpha?: number; midSize?: number; midPercent?: number;
  flipbook?: import('./flipbook.js').EmitterFlipbook;
  beamBinding?: import('./beam-flow.js').BeamBinding;
}
export interface TrailLayer {
  id: string; name: string; type: 'trail'; enabled: boolean;
  color: string; alpha: number; start: number; duration: number;
  path: Array<{time:number;position:Vec3}>;
  width: number; tailLifetime: number; profile: 'soft'; blend: 'additive';
  glowStrength: number; head: {enabled:boolean;size:number}; maxSegmentLength: number;
  /** Trail textures/transforms are generated internally, not editable assets. */
  texture?: never; orientation?: never;
}
export interface BeamLayer {
  id:string;name:string;type:'beam';enabled:boolean;color:string;alpha:number;width:number;
  texture:TextureRef;blend:BlendMode;source:Vec3;target:Vec3;radius:number;delay:number;lightningScale:number;segments:number;seed:number;
  /** Preview intent only; the first Lightning/Linked profile has no native flow control. */
  flow:{direction:'source-to-target'|'target-to-source';speed:number};
  materialMotion?: import('./beam-material-motion.js').BeamMaterialMotion;
  nativeMotion?: import('./beam-motion.js').BeamNativeMotion;
  textureMapping?: import('./beam-texture.js').BeamTextureMapping;
  orientation?:never;
}
export type Layer = EmitterLayer | MeshLayer | TrailLayer | BeamLayer;
export function makeTrailLayer(id:string,name='Świetlny ślad',length=3):TrailLayer {
  const tailLifetime=Math.min(.7,length/2),journey=length-tailLifetime;
  return {id,name,type:'trail',enabled:true,color:'#ffca73',alpha:.8,start:0,duration:length,width:.018,tailLifetime,profile:'soft',blend:'additive',glowStrength:.12,
    head:{enabled:true,size:.025},maxSegmentLength:.05,path:[{time:0,position:[0,0,.1]},{time:journey*.5,position:[.1,.04,.8]},{time:journey,position:[0,.1,1.5]}]};
}
type EditableLayer = Omit<EmitterLayer, 'id' | 'type'> & Omit<MeshLayer, 'id' | 'type'>;
export type LayerValues = Partial<Omit<EditableLayer, 'texture' | 'blend' | 'midColor' | 'midAlpha' | 'midSize' | 'midPercent' | 'orientation' | 'material' | 'shading' | 'flipbook' | 'deformationInterpolation' | 'beamBinding'>> & Partial<Pick<BeamLayer,'source'|'target'|'radius'|'delay'|'lightningScale'|'segments'|'flow'>> & Partial<Pick<TrailLayer,'path'|'width'|'tailLifetime'|'profile'|'glowStrength'|'head'|'maxSegmentLength'>> & {
  flipbook?: EmitterLayer['flipbook'] | null;
  materialMotion?: BeamLayer['materialMotion'] | null;
  nativeMotion?: BeamLayer['nativeMotion'] | null;
  textureMapping?: BeamLayer['textureMapping'] | null;
  beamBinding?: EmitterLayer['beamBinding'] | null;
  texture?: TextureRef | null; blend?: BlendMode | null; midColor?: string | null;
  midAlpha?: number | null; midSize?: number | null; midPercent?: number | null;
  orientation?: AxisAngle | null;
  material?: MeshLayer['material'] | null; shading?: MeshLayer['shading'] | null;
  deformationInterpolation?: MeshLayer['deformationInterpolation'] | null;
};
export interface EffectDocument {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24; name: string; duration: number; seed: number;
  authoring?: import('./workflow.js').AuthoringState;
  /** Whole-effect integration setting. Historical omission means false. */
  orientWithObject?: boolean;
  /** Omission preserves historical FnF; duration is one loop, never NWScript lifetime. */
  lifecycle?: 'impact' | 'duration' | 'beam';
  profileId: string; layers: Layer[];
  locks: Array<{ layerId: string; field: string }>;
  assets?: TextureAsset[];
  audioAssets?: AudioAsset[];
  audioClips?: AudioClip[];
}
export interface Project {
  id: string; revision: number; document: EffectDocument;
  createdAt: string; updatedAt: string; parentId?: string;
}
export type Change =
  | {type:'audio.add';clip:AudioClipInput}
  | {type:'audio.set';clipId:string;values:AudioValues}
  | {type:'audio.remove';clipId:string}
  | { type: 'layer.set'; layerId: string; values: LayerValues }
  | { type: 'layer.add'; layer: Layer }
  | { type: 'layer.remove'; layerId: string }
  | { type: 'layer.move'; layerId: string; index: number }
  | { type: 'project.set'; values: Partial<Pick<EffectDocument, 'name' | 'duration' | 'seed' | 'orientWithObject' | 'lifecycle'>> }
  | { type: 'locks.set'; locks: EffectDocument['locks'] };
export interface Command {
  operation: string; input: Record<string, unknown>; idempotencyKey?: string;
  contractVersion?: string; workspaceId?: string;
}
export interface Result<T = unknown> {
  contractVersion: string; requestId: string; operationId?: string;
  status: 'ok' | 'accepted' | 'failed'; data?: T;
  error?: { code: string; message: string; details?: unknown; retryable: boolean };
  diagnostics: unknown[];
}
export class DomainError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}
export function makeLayer(id: string, name = 'Iskry', type: EmitterLayer['type'] = 'emitter'): EmitterLayer {
  return { id, name, type, enabled: true, color: '#ffbd59', endColor: '#ff572e',
    alpha: 1, endAlpha: 0, size: .055, endSize: .01, count: 70, life: .9,
    speed: 2.1, spread: 1.1, gravity: 1.5, start: .1, duration: .25,
    position: [0, 0, .6], scale: 1, seed: 42, texture: 'spark', update: 'Explosion' };
}
export function makeMeshLayer(id: string, name = 'Geometria', kind: MeshGeometry['kind'] = 'box'): MeshLayer {
  const geometry: MeshGeometry = kind === 'box' ? { kind, dimensions: [.2, .15, 1] }
    : kind === 'ring' ? { kind, innerRadius: .8, outerRadius: 1, segments: 48 }
    : { kind, vertices: [[-.5, 0, 0], [.5, 0, 0], [0, 0, 1]], faces: [[0, 1, 2]] };
  return { id, name, type: 'mesh', enabled: true, color: '#d4b474', alpha: 1,
    start: 0, duration: 3, position: [0, 0, 0], orientation: [0, 0, 1, 0], scale: 1, geometry, animation: {} };
}
export { assertDocumentInvariants } from './mesh.js';
export const OPTIONAL_LAYER_FIELDS = ['texture', 'blend', 'midColor', 'midAlpha', 'midSize', 'midPercent', 'orientation', 'material', 'shading', 'flipbook', 'deformationInterpolation', 'nativeMotion', 'materialMotion', 'textureMapping', 'beamBinding'] as const;
/** Promote only; historical documents keep their original format until a new feature is used. */
export function promoteDocumentSchema(document: EffectDocument): EffectDocument {
  if(document.schemaVersion<24&&document.lifecycle==='beam'&&document.audioClips?.some(c=>c.enabled))document.schemaVersion=24;
  else if(document.schemaVersion<23&&(document.layers.some(l=>Object.hasOwn(l,'materialMotion'))||document.locks.some(l=>l.field==='materialMotion')))document.schemaVersion=23;
  else if(document.schemaVersion<22&&usesExtendedBeam(document))document.schemaVersion=22;
  else if(document.schemaVersion<21&&document.layers.some(l=>l.enabled&&l.type==='beam')&&document.layers.some(l=>l.enabled&&l.type==='emitter'&&l.beamBinding))document.schemaVersion=21;
  else if(document.schemaVersion<20&&(document.authoring!==undefined||document.locks.some(l=>l.layerId==='@effect'&&l.field==='authoring')))document.schemaVersion=20;
  else if(document.schemaVersion<19&&(document.layers.some(l=>Object.hasOwn(l,'beamBinding'))||document.locks.some(l=>l.field==='beamBinding')))document.schemaVersion=19;
  else if(document.schemaVersion<18&&(document.layers.some(l=>Object.hasOwn(l,'textureMapping'))||document.locks.some(l=>l.field==='textureMapping')))document.schemaVersion=18;
  else if(document.schemaVersion<17&&(document.layers.some(l=>Object.hasOwn(l,'nativeMotion'))||document.locks.some(l=>l.field==='nativeMotion')))document.schemaVersion=17;
  else if(document.schemaVersion<16&&(document.lifecycle==='beam'||document.layers.some(l=>l.type==='beam')||document.locks.some(l=>['source','target','radius','delay','lightningScale','segments','flow'].includes(l.field))))document.schemaVersion=16;
  else if(document.schemaVersion<15&&document.lifecycle==='duration'&&document.audioClips?.some(c=>c.enabled))document.schemaVersion=15;
  else if (document.schemaVersion < 14 && (document.layers.some(l=>Object.hasOwn(l,'deformationInterpolation'))||document.locks.some(l=>l.field==='deformationInterpolation'))) document.schemaVersion=14;
  else if (document.schemaVersion < 13 && (document.lifecycle !== undefined || document.locks.some(l=>l.layerId===EFFECT_LOCK_ID&&l.field==='lifecycle'))) document.schemaVersion=13;
  else if (document.schemaVersion < 12 && (document.layers.some(l=>Object.hasOwn(l,'flipbook')) || document.locks.some(l=>l.field==='flipbook'))) document.schemaVersion = 12;
  else if (document.schemaVersion < 11 && (document.orientWithObject !== undefined || document.locks.some(l=>l.layerId===EFFECT_LOCK_ID))) document.schemaVersion = 11;
  else if (document.schemaVersion < 10 && document.audioClips?.some(c=>c.gain>4)) document.schemaVersion = 10;
  else if (document.schemaVersion < 9 && (document.audioAssets!==undefined||document.audioClips!==undefined)) document.schemaVersion = 9;
  else if (document.schemaVersion < 8 && document.layers.some(layer => layer.type === 'mesh' && layer.shading !== undefined)) document.schemaVersion = 8;
  else if (document.schemaVersion < 7 && document.layers.some(layer => layer.type === 'mesh' && layer.animation.vertices !== undefined)) document.schemaVersion = 7;
  else if (document.schemaVersion < 6 && document.layers.some(layer => layer.type === 'trail')) document.schemaVersion = 6;
  else if (document.schemaVersion < 5 && document.layers.some(layer => layer.type === 'mesh' && layer.material !== undefined)) document.schemaVersion = 5;
  else if (document.schemaVersion < 4 && document.layers.some(layer => layer.type !== 'mesh' && layer.orientation !== undefined)) document.schemaVersion = 4;
  else if (document.schemaVersion < 3 && (document.assets !== undefined || document.layers.some(layer =>
    layer.blend !== undefined || (layer.type === 'mesh'
      ? layer.texture !== undefined || (layer.geometry.kind === 'custom' && (layer.geometry.uv !== undefined || layer.geometry.uvFaces !== undefined))
      : layer.texture?.startsWith('asset:') || ['midColor','midAlpha','midSize','midPercent'].some(key => Object.hasOwn(layer,key)))))) document.schemaVersion = 3;
  else if (document.schemaVersion === 1 && document.layers.some(layer => layer.type === 'mesh')) document.schemaVersion = 2;
  return document;
}
export function makeDocument(preset: string = 'coil', name?: string, lifecycle?: 'impact'|'duration'|'beam'): EffectDocument {
  if(lifecycle==='beam'){if(preset!=='empty')throw new DomainError('BEAM_INVALID','Nowy beam wymaga pustego projektu.');return {schemaVersion:16,name:name||'Nowy beam',duration:3,seed:1827,lifecycle,profileId:BEAM_PROFILE_ID,locks:[],layers:[makeBeamLayer('beam')]};}
  if(lifecycle==='duration') {
    if(preset!=='empty')throw new DomainError('DURATION_INCOMPATIBLE','Nowy DUR wymaga pustego projektu siatki.');
    return {schemaVersion:13,name:name||'Nowy efekt DUR',duration:3,seed:1827,lifecycle,profileId:DURATION_PROFILE_ID,locks:[],layers:[makeMeshLayer('mesh')]};
  }
  const spark = makeLayer('sparks');
  const glow = { ...makeLayer('flash', 'Błysk'), count: 1, size: .48, endSize: .05,
    speed: 0, gravity: 0, life: .35, texture: 'glow' as const, color: '#fff3c7' };
  const smoke = { ...makeLayer('smoke', 'Dym'), count: 26, size: .14, endSize: .38,
    speed: .35, gravity: -.1, life: 1.7, start: .2, duration: .45, alpha: .4,
    color: '#709aaf', endColor: '#2b4859', texture: 'smoke' as const, update: 'Fountain' as const };
  const vial = preset === 'vial';
  return { schemaVersion: lifecycle===undefined?1:13, ...(lifecycle===undefined?{}:{lifecycle}), name: name || (preset === 'empty' ? 'Nowy efekt' : vial ? 'Fiolka alchemiczna' : 'Przeciążenie cewki'),
    duration: 3, seed: 1827, profileId: PROFILE_ID, locks: [],
    layers: preset === 'empty' ? [spark] : vial
      ? [{ ...spark, color: '#88ffba', endColor: '#22a68c', count: 90, spread: 1.8, speed: 1.65 },
         { ...glow, color: '#bcffe0' }, { ...smoke, color: '#4dc492', endColor: '#285b51' }]
      : [spark, glow, smoke] };
}
export function changedFields(before: EffectDocument, after: EffectDocument): Array<{ path: string; before: unknown; after: unknown }> {
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    // Geometry and animation are replaced and locked as whole layer fields.
    // Keep their diffs atomic so selective undo uses the same public operation.
    if (/^\/layers\/[^/]+\/(geometry|animation|material|path|head|flipbook|flow|textureMapping|beamBinding)$/.test(path)) { changes.push({ path, before: a ?? null, after: b ?? null }); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk((a as any)[key], (b as any)[key], `${path}/${key}`);
    } else changes.push({ path, before: a ?? null, after: b ?? null });
  };
  for (const key of ['schemaVersion', 'name', 'duration', 'seed', 'orientWithObject', 'lifecycle', 'locks', 'assets','audioAssets','authoring'] as const) walk(before[key], after[key], `/${key}`);
  for(const clipId of new Set([...(before.audioClips??[]),...(after.audioClips??[])].map(c=>c.id)))
    walk(before.audioClips?.find(c=>c.id===clipId),after.audioClips?.find(c=>c.id===clipId),`/audioClips/${clipId}`);
  const beforeIds = before.layers.map(l => l.id), afterIds = after.layers.map(l => l.id);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) walk(before.layers, after.layers, '/layers');
  else for (const layer of before.layers) walk(layer, after.layers.find(l => l.id === layer.id), `/layers/${layer.id}`);
  return changes;
}
export function applyChanges(document: EffectDocument, changes: Change[], owner: boolean): EffectDocument {
  const next = structuredClone(document);
  for (const change of changes) {
    if (change.type === 'locks.set') {
      if (!owner) throw new DomainError('FORBIDDEN', 'Tylko właściciel może zmieniać blokady.');
      next.locks = change.locks; continue;
    }
    if (change.type === 'project.set') {
      if(Object.hasOwn(change.values,'lifecycle')) {
        if(!['impact','duration','beam'].includes(change.values.lifecycle!))throw new DomainError('VALIDATION_ERROR','Nieznany tryb efektu.');
        assertEffectLifecycleUnlocked(next);
        next.profileId=documentProfile(change.values.lifecycle);
      }
      if (Object.hasOwn(change.values, 'orientWithObject')) {
        if (typeof change.values.orientWithObject !== 'boolean') throw new DomainError('VALIDATION_ERROR', 'Obracanie z postacią wymaga wartości logicznej.');
        assertEffectOrientationUnlocked(next);
      }
      Object.assign(next, change.values); continue;
    }
    if(change.type==='audio.add'){
      if(next.layers.some(l=>l.id===change.clip.id)||next.audioClips?.some(c=>c.id===change.clip.id))throw new DomainError('CONFLICT','ID klipu jest już używane.');
      (next.audioClips??=[]).push(normalizeAudioValues(structuredClone(change.clip)) as AudioClip);continue;
    }
    if(change.type==='audio.set'||change.type==='audio.remove'){
      const clip=next.audioClips?.find(c=>c.id===change.clipId);if(!clip)throw new DomainError('NOT_FOUND','Nie znaleziono klipu audio.');
      const locked=next.locks.filter(l=>l.layerId===clip.id);
      if(change.type==='audio.remove'){
        if(locked.length)throw new DomainError('LOCKED','Klip audio zawiera zablokowane parametry.');
        next.audioClips=next.audioClips!.filter(c=>c.id!==clip.id);
      }else{
        const values=normalizeAudioValues(change.values);
        if(Object.keys(values).some(key=>locked.some(l=>l.field==='*'||l.field===key)))throw new DomainError('LOCKED','Zmiana narusza blokadę klipu audio.');
        Object.assign(clip,values);
      }
      continue;
    }
    if (change.type === 'layer.add') {
      if (next.layers.some(l => l.id === change.layer.id)||next.audioClips?.some(c=>c.id===change.layer.id)) throw new DomainError('CONFLICT', 'Warstwa o tym ID istnieje.');
      next.layers.push(change.layer);
      continue;
    }
    const layer = next.layers.find(l => l.id === change.layerId);
    if (!layer) throw new DomainError('NOT_FOUND', 'Nie znaleziono warstwy.');
    const locked = next.locks.filter(l => l.layerId === layer.id);
    if (change.type === 'layer.set') {
      if(Object.hasOwn(change.values,'deformationInterpolation')&&locked.some(l=>l.field==='animation'))
        throw new DomainError('LOCKED','Interpolacja zmienia ruch zablokowanej animacji.');
      if (Object.keys(change.values).some(key => locked.some(l => l.field === key || l.field === '*')))
        throw new DomainError('LOCKED', 'Zmiana narusza blokadę parametru.');
      for (const [key,value] of Object.entries(change.values)) {
        if(key==='beamBinding'&&layer.type!=='emitter')throw new DomainError('VALIDATION_ERROR','Powiązanie cząstek wymaga emitera.');
        if(key==='flipbook' && layer.type!=='emitter') throw new DomainError('VALIDATION_ERROR','Atlas animacji jest dostępny tylko dla emitera.');
        const beamFields=['source','target','radius','delay','lightningScale','segments','flow','nativeMotion','materialMotion','textureMapping'];
        if(layer.type==='beam'&&!['name','enabled','color','alpha','width','texture','blend','seed',...beamFields].includes(key))throw new DomainError('VALIDATION_ERROR','Pole nie jest parametrem beam.',{layerId:layer.id,field:key});
        if(layer.type!=='beam'&&beamFields.includes(key))throw new DomainError('VALIDATION_ERROR','Pole wymaga beam.',{layerId:layer.id,field:key});
        const trailFields=['path','width','tailLifetime','profile','glowStrength','head','maxSegmentLength'];
        if(layer.type==='trail'&&!['name','enabled','color','alpha','start','duration','blend',...trailFields].includes(key))
          throw new DomainError('VALIDATION_ERROR','Pole nie jest parametrem smugi.',{layerId:layer.id,field:key});
        if(layer.type!=='trail'&&!(layer.type==='beam'&&key==='width')&&trailFields.includes(key))throw new DomainError('VALIDATION_ERROR','Pole wymaga warstwy trail.',{layerId:layer.id,field:key});
        if (['material','shading','deformationInterpolation'].includes(key) && layer.type !== 'mesh')
          throw new DomainError('VALIDATION_ERROR','Pole wymaga warstwy mesh.',{layerId:layer.id,field:key});
        if (layer.type === 'mesh' && ['midColor','midAlpha','midSize','midPercent'].includes(key))
          throw new DomainError('VALIDATION_ERROR','Parametry wieku cząstki wymagają emitera.',{layerId:layer.id,field:key});
        if (value === null && OPTIONAL_LAYER_FIELDS.includes(key as any)) {
          if (key === 'orientation' && layer.type === 'mesh') throw new DomainError('VALIDATION_ERROR','Geometria wymaga orientacji; ustaw [0,0,1,0], aby przywrócić brak obrotu.');
          if (key === 'texture' && layer.type !== 'mesh') throw new DomainError('VALIDATION_ERROR','Emiter wymaga tekstury; wybierz spark, smoke lub glow.');
          delete (layer as any)[key];
        } else (layer as any)[key] = value;
      }
    } else if (change.type === 'layer.remove') {
      if (locked.length) throw new DomainError('LOCKED', 'Warstwa zawiera zablokowane parametry.');
      next.layers = next.layers.filter(l => l.id !== layer.id);
    } else if (change.type === 'layer.move') {
      next.layers = next.layers.filter(l => l.id !== layer.id);
      next.layers.splice(change.index, 0, layer);
    }
  }
  return promoteDocumentSchema(next);
}

export function assertEffectLifecycleUnlocked(document:EffectDocument):void {
  if(document.locks.some(l=>l.layerId===EFFECT_LOCK_ID&&l.field==='lifecycle'))throw new DomainError('LOCKED','Tryb efektu jest zablokowany.');
}
export function assertEffectOrientationUnlocked(document: EffectDocument): void {
  if (document.locks.some(l=>l.layerId===EFFECT_LOCK_ID && l.field==='orientWithObject'))
    throw new DomainError('LOCKED', 'Obracanie efektu z postacią jest zablokowane.');
}
