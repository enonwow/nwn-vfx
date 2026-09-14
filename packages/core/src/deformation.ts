import { DomainError, type EffectDocument, type MeshLayer, type Vec3 } from './model.js';
import { trailCost } from './trails.js';
import {createMonotoneDeformationCurve,DEFORMATION_INTERPOLATION_MODES,DEFORMATION_INTERPOLATION_CAPABILITIES} from './deformation-curve.js';
export {DEFORMATION_INTERPOLATION_CAPABILITIES} from './deformation-curve.js';

export const DEFORMATION_HZ = 60;
export const MESH_DEFORMATION_CAPABILITIES = {
  version: 2, documentSchemaVersion: 7, channel: 'animation.vertices', geometryKind: 'custom',
  maxKeys: 64, maxVertices: 2048, sampleHz: DEFORMATION_HZ,
  maxVertexSamples: 1_000_000, maxUvSamples: 1_000_000,
  budgetScope: 'enabled-deformed-meshes-and-trails-per-document',
  coordinates: 'absolute-mesh-local-Z-up-metres-before-layer-transform',
  interpolation: 'linear-authored-vertices; shared-global-60Hz-frame-interpolation',
  topology: 'fixed-faces-and-UV; no-remeshing', nativeVerified: false,
  interpolationSelection:DEFORMATION_INTERPOLATION_CAPABILITIES,
} as const;

export function validateMeshDeformation(layer: MeshLayer): void {
  if(layer.deformationInterpolation!==undefined&&!DEFORMATION_INTERPOLATION_MODES.includes(layer.deformationInterpolation))
    throw new DomainError('DEFORMATION_INTERPOLATION_INVALID','Nieznany tryb interpolacji deformacji.',{layerId:layer.id});
  const keys = layer.animation.vertices;
  if (keys === undefined) {
    if(layer.deformationInterpolation&&layer.deformationInterpolation!=='linear')
      throw new DomainError('DEFORMATION_INTERPOLATION_INVALID','Gładka interpolacja wymaga kluczy vertices.',{layerId:layer.id});
    return;
  }
  const bad = (message: string): never => { throw new DomainError('VALIDATION_ERROR', message, { layerId: layer.id, channel: 'vertices' }); };
  if (layer.geometry.kind !== 'custom') bad('Deformacja wymaga własnej geometrii custom.');
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 64) bad('Deformacja wymaga 1–64 klatek vertices. Usuń kanał, aby wyłączyć deformację.');
  const count = layer.geometry.kind === 'custom' ? layer.geometry.vertices.length : 0;
  let previous = -1;
  for (const key of keys) {
    if (!key || !Number.isFinite(key.time) || key.time < 0 || key.time > layer.duration || key.time <= previous)
      bad('Czasy vertices muszą być skończone, ściśle rosnące i mieścić się w czasie warstwy.');
    previous = key.time;
    if (!Array.isArray(key.value) || key.value.length !== count) bad('Każda klatka vertices musi zachować liczbę i kolejność wierzchołków geometrii.');
    for (const vertex of key.value)
      if (!Array.isArray(vertex) || vertex.length !== 3 || vertex.some(n => !Number.isFinite(n) || Math.abs(n) > 20))
        bad('Pozycje vertices wymagają trzech skończonych liczb w zakresie ±20 m.');
  }
  if(layer.deformationInterpolation&&layer.deformationInterpolation!=='linear')createMonotoneDeformationCurve(layer);
}

/** Bound allocation before building any sample arrays. UV seams count separately. */
export function assertMeshDeformationBudget(document: EffectDocument) {
  const frames = Math.ceil(document.duration * DEFORMATION_HZ) + 1;
  const trails = trailCost(document);
  const meshes = document.layers.filter((l): l is MeshLayer => l.type === 'mesh' && l.enabled && l.animation.vertices !== undefined)
    .map(layer => {
      validateMeshDeformation(layer);
      const geometry = layer.geometry;
      if (geometry.kind !== 'custom') throw new DomainError('VALIDATION_ERROR', 'Deformacja wymaga custom.');
      return { layerId: layer.id, frames, vertexSamples: geometry.vertices.length * frames, uvSamples: (geometry.uv?.length ?? geometry.vertices.length) * frames };
    });
  const vertexSamples = trails.vertexSamples + meshes.reduce((n, m) => n + m.vertexSamples, 0);
  const uvSamples = trails.vertexSamples + meshes.reduce((n, m) => n + m.uvSamples, 0);
  if (vertexSamples > 1_000_000 || uvSamples > 1_000_000)
    throw new DomainError('LIMIT_EXCEEDED', 'Przekroczono wspólny budżet animacji mesh i smug: maks. 1 000 000 pozycji i 1 000 000 UV.', { vertexSamples, uvSamples, meshes });
  return { vertexSamples, uvSamples, meshes };
}

/** Authored values are positions, never deltas; base geometry supplies t=0. */
export function authoredMeshVertices(layer: MeshLayer, localTime: number): Vec3[] {
  if (layer.geometry.kind !== 'custom') throw new DomainError('VALIDATION_ERROR', 'Deformacja wymaga custom.');
  if(layer.deformationInterpolation&&layer.deformationInterpolation!=='linear')return createMonotoneDeformationCurve(layer).at(localTime);
  let time = 0, vertices = layer.geometry.vertices;
  const t = Math.max(0, Math.min(layer.duration, localTime));
  for (const key of layer.animation.vertices ?? []) {
    if (key.time > t) {
      const weight = (t - time) / (key.time - time);
      return vertices.map((v, i) => v.map((x, j) => x + (key.value[i][j] - x) * weight) as Vec3);
    }
    time = key.time; vertices = key.value;
  }
  return vertices.map(v => [...v]);
}

export interface CompiledMeshDeformation { period: number; frames: Vec3[][]; maxDeviationMetres: number;
  interpolation?: {mode:NonNullable<MeshLayer['deformationInterpolation']>;boundary:'hold'|'clamped'|'periodic';curveContinuity:'C0'|'C1';sampledContinuity:'C0';errorMethod:'exact-linear-knots'|'curvature-bound'} }
export function sampleMeshDeformation(compiled: CompiledMeshDeformation, globalTime: number): Vec3[] {
  const tick = Math.max(0, Math.min(compiled.frames.length - 1, globalTime / compiled.period));
  const index = Math.floor(tick), a = compiled.frames[index], b = compiled.frames[Math.min(index + 1, compiled.frames.length - 1)], weight = tick - index;
  return a.map((v, i) => v.map((x, j) => x + (b[i][j] - x) * weight) as Vec3);
}
export function compileMeshDeformation(layer: MeshLayer, documentDuration: number): CompiledMeshDeformation {
  validateMeshDeformation(layer);
  const mode=layer.deformationInterpolation;
  const curve=mode&&mode!=='linear'?createMonotoneDeformationCurve(layer):undefined;
  const compiled: CompiledMeshDeformation = { period: 1 / DEFORMATION_HZ, maxDeviationMetres: 0,
    frames: Array.from({ length: Math.ceil(documentDuration * DEFORMATION_HZ) + 1 }, (_, i) => curve?curve.at(i / DEFORMATION_HZ - layer.start):authoredMeshVertices(layer, i / DEFORMATION_HZ - layer.start)),
    ...(mode?{interpolation:{mode,boundary:curve?.boundary??'hold',curveContinuity:curve?'C1':'C0',sampledContinuity:'C0',errorMethod:curve?'curvature-bound':'exact-linear-knots'}} as const:{}) };
  if(curve){compiled.maxDeviationMetres=curve.sampleErrorBound(compiled.period,[layer.start,layer.start+layer.duration].some(t=>Math.abs(t*DEFORMATION_HZ-Math.round(t*DEFORMATION_HZ))>1e-8));return compiled;}
  // Between the union of authored knots and grid points, both curves are linear.
  // The norm of their difference reaches its maximum at an endpoint.
  for (const t of [layer.start, layer.start + layer.duration, ...(layer.animation.vertices ?? []).map(k => layer.start + k.time)]) {
    const actual = sampleMeshDeformation(compiled, t), expected = authoredMeshVertices(layer, t - layer.start);
    for (let i = 0; i < actual.length; i++) compiled.maxDeviationMetres = Math.max(compiled.maxDeviationMetres, Math.hypot(...actual[i].map((n, j) => n - expected[i][j])));
  }
  return compiled;
}
