import { DomainError, type AxisAngle, type Change, type EffectDocument, type MeshGeometry, type MeshLayer, type Vec2, type Vec3 } from './model.js';
import { prepareEmitterOrientation } from './simulation.js';

export const OBJ_IMPORT_LIMITS = {
  maxTextBytes: 1024 * 1024, maxVertices: 2048, maxTriangles: 4096,
  maxTextureCoordinates: 8192, maxNormals: 8192, minCoordinate: -20, maxCoordinate: 20,
} as const;

export interface ObjImportTransform { translation: Vec3; orientation: AxisAngle; scale: number }
export interface ObjImportOptions {
  sourceUpAxis: 'y' | 'z'; metersPerUnit: number; normalMode: 'flat';
  transform?: ObjImportTransform; requireUv?: boolean;
}
export interface ObjImportWarning {
  code: 'OBJ_NORMALS_RECOMPUTED' | 'OBJ_SMOOTHING_IGNORED' | 'OBJ_UNREFERENCED_UV' | 'OBJ_LABELS_IGNORED'; message: string;
}
export interface ObjImportReport {
  version: 'nwn-vfx-obj-import/v1';
  source: { utf8Bytes: number; vertices: number; textureCoordinates: number; normals: number; triangles: number; smoothingStatements: number };
  conversion: {
    sourceUpAxis: 'y' | 'z'; metersPerUnit: number; targetUpAxis: 'z'; targetUnit: 'meter';
    axisMapping: 'x,-z,y' | 'x,y,z'; transform: ObjImportTransform;
    order: ['axis','units','scale','rotation','translation']; centered: false;
  };
  normals: { mode: 'flat'; sourceNormalsPreserved: false; smoothingPreserved: false };
  uv: { present: boolean; origin: 'bottom-left' };
  bounds: { min: Vec3; max: Vec3 };
  warnings: ObjImportWarning[];
}
export interface ObjImportResult { geometry: Extract<MeshGeometry, { kind: 'custom' }>; report: ObjImportReport }
export interface PrepareObjImportInput extends Omit<ObjImportOptions, 'requireUv'> {
  objText: string;
  target: { layerId: string } | { newLayer: Omit<MeshLayer, 'geometry'> };
  textureAssetId?: string;
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const INDEX = /^[+-]?\d+$/u;
type Face = [number, number, number];

/** Strict triangulated OBJ subset. This function never reads referenced files.
 * Coordinates are baked as translation + R(scale * metersPerUnit * axis(v)).
 * Flat normals are a declared output policy; source normal/smoothing data is
 * validated and diagnosed, not silently retained or treated as authored normals.
 */
export function parseObjGeometry(objText: string, options: ObjImportOptions): ObjImportResult {
  const transform = validateOptions(options);
  if (typeof objText !== 'string') fail('OBJ_INVALID_INPUT', 'OBJ input must be text.');
  if (objText.length > OBJ_IMPORT_LIMITS.maxTextBytes) limit('textBytes', OBJ_IMPORT_LIMITS.maxTextBytes);
  const utf8Bytes = new TextEncoder().encode(objText).length;
  if (utf8Bytes > OBJ_IMPORT_LIMITS.maxTextBytes) limit('textBytes', OBJ_IMPORT_LIMITS.maxTextBytes);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(objText)) fail('OBJ_INVALID_INPUT', 'OBJ contains unsupported control characters.');
  const vertices: Vec3[] = [], uv: Vec2[] = [], faces: Face[] = [], uvFaces: Face[] = [];
  let normals = 0, smoothingStatements = 0, texturedFaces: boolean | undefined;
  let objectLabelSeen = false, labelsSeen = false;
  const faceLines: number[] = [];
  const rotation = prepareEmitterOrientation({ orientation: transform.orientation });
  const lines = objText.replace(/^\uFEFF/u, '').split(/\r\n|\n|\r/u);
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1, source = lines[index].split('#', 1)[0].trim();
    if (!source) continue;
    const [record, ...fields] = source.split(/\s+/u);
    if (record === 'v') {
      if (vertices.length === OBJ_IMPORT_LIMITS.maxVertices) limit('vertices', OBJ_IMPORT_LIMITS.maxVertices, line);
      arity(fields, 3, line, record);
      const raw = fields.map(value => number(value, line)) as Vec3;
      const axis: Vec3 = options.sourceUpAxis === 'y' ? [raw[0], -raw[2], raw[1]] : raw;
      const scaled = axis.map(value => value * options.metersPerUnit * transform.scale) as Vec3;
      const converted: Vec3 = rotation ? [
        rotation[0]*scaled[0] + rotation[1]*scaled[1] + rotation[2]*scaled[2],
        rotation[3]*scaled[0] + rotation[4]*scaled[1] + rotation[5]*scaled[2],
        rotation[6]*scaled[0] + rotation[7]*scaled[1] + rotation[8]*scaled[2],
      ] : scaled;
      const vertex = converted.map((value, component) => {
        const coordinate = value + transform.translation[component];
        if (!Number.isFinite(coordinate) || coordinate < OBJ_IMPORT_LIMITS.minCoordinate || coordinate > OBJ_IMPORT_LIMITS.maxCoordinate)
          fail('OBJ_COORDINATE_RANGE', 'Converted OBJ coordinate exceeds the supported -20..20 meter range.', { line, component });
        return coordinate === 0 ? 0 : coordinate;
      }) as Vec3;
      vertices.push(vertex);
    } else if (record === 'vt') {
      if (uv.length === OBJ_IMPORT_LIMITS.maxTextureCoordinates) limit('textureCoordinates', OBJ_IMPORT_LIMITS.maxTextureCoordinates, line);
      arity(fields, 2, line, record);
      const coordinate = fields.map(value => number(value, line)) as Vec2;
      if (coordinate.some(value => value < 0 || value > 1)) fail('OBJ_UV_RANGE', 'OBJ texture coordinates must be within 0..1.', { line });
      uv.push(coordinate.map(value => value === 0 ? 0 : value) as Vec2);
    } else if (record === 'vn') {
      if (normals === OBJ_IMPORT_LIMITS.maxNormals) limit('normals', OBJ_IMPORT_LIMITS.maxNormals, line);
      arity(fields, 3, line, record);
      const vector = fields.map(value => number(value, line));
      const magnitude = Math.hypot(...vector);
      if (!Number.isFinite(magnitude) || magnitude === 0) fail('OBJ_NORMAL_INVALID', 'OBJ source normal must be finite and nonzero.', { line });
      normals++;
    } else if (record === 's') {
      arity(fields, 1, line, record);
      if (fields[0] !== 'off' && (!/^\d+$/u.test(fields[0]) || !Number.isSafeInteger(Number(fields[0]))))
        fail('OBJ_SMOOTHING_INVALID', 'OBJ smoothing must be off, 0, or a positive integer group.', { line });
      smoothingStatements++;
    } else if (record === 'o' || record === 'g') {
      const label = fields.join(' ');
      if (!label || label.length > 128) fail('OBJ_LABEL_INVALID', 'OBJ labels must contain 1..128 characters.', { line });
      if (record === 'o' && objectLabelSeen) fail('OBJ_MULTIPLE_OBJECTS', 'OBJ import supports one object label; split objects explicitly before import.', { line });
      if (record === 'o') objectLabelSeen = true;
      labelsSeen = true;
    } else if (record === 'f') {
      if (faces.length === OBJ_IMPORT_LIMITS.maxTriangles) limit('triangles', OBJ_IMPORT_LIMITS.maxTriangles, line);
      if (fields.length !== 3) fail('OBJ_TRIANGLES_REQUIRED', 'OBJ import requires pre-triangulated faces with exactly three corners.', { line });
      const corners = fields.map(value => corner(value, vertices.length, uv.length, normals, line));
      const hasUv = corners[0].uv !== undefined, hasNormal = corners[0].normal !== undefined;
      if (corners.some(item => (item.uv !== undefined) !== hasUv || (item.normal !== undefined) !== hasNormal))
        fail('OBJ_FACE_FORMAT_MISMATCH', 'All corners of a face must use the same v/vt/vn form.', { line });
      if (texturedFaces !== undefined && texturedFaces !== hasUv)
        fail('OBJ_INCOMPLETE_UV', 'Texture coordinates must be present for every triangle or absent for all triangles.', { line });
      texturedFaces = hasUv;
      const face = corners.map(item => item.vertex) as Face;
      if (new Set(face).size !== 3) fail('OBJ_DEGENERATE_TRIANGLE', 'OBJ face repeats a vertex.', { line });
      faces.push(face); faceLines.push(line);
      if (hasUv) uvFaces.push(corners.map(item => item.uv!) as Face);
    } else {
      // Never follow OBJ material paths, infer materials, or flatten curves or
      // polygonal topology implicitly. Supported labels are diagnosed below.
      fail('OBJ_UNSUPPORTED_RECORD', 'OBJ record is outside the supported v/vt/vn/f/s/o/g subset.', { line });
    }
  }
  if (vertices.length < 3 || faces.length === 0) fail('OBJ_EMPTY_GEOMETRY', 'OBJ must contain at least three vertices and one triangle.');
  if (options.requireUv && !texturedFaces) fail('OBJ_MISSING_UV', 'This OBJ import requires UV for every triangle.');
  for (const [index, face] of faces.entries()) {
    const [a,b,c] = face.map(vertex => vertices[vertex]);
    const u = b.map((value, component) => value-a[component]), v = c.map((value, component) => value-a[component]);
    const twiceArea = Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]);
    if (!Number.isFinite(twiceArea) || twiceArea < 1e-10)
      fail('OBJ_DEGENERATE_TRIANGLE', 'Converted OBJ contains a zero-area or unsupported sub-resolution triangle.', { line: faceLines[index], faceIndex: index });
  }
  const warnings: ObjImportWarning[] = [];
  if (normals) warnings.push({ code: 'OBJ_NORMALS_RECOMPUTED', message: 'Source normals are not preserved; output uses recomputed flat face normals.' });
  if (smoothingStatements) warnings.push({ code: 'OBJ_SMOOTHING_IGNORED', message: 'Source smoothing groups are not preserved; output uses flat face normals.' });
  if (labelsSeen) warnings.push({ code: 'OBJ_LABELS_IGNORED', message: 'OBJ object and group labels are not preserved; geometry is imported as one selected layer.' });
  if (uv.length && !texturedFaces) warnings.push({ code: 'OBJ_UNREFERENCED_UV', message: 'Unreferenced texture coordinates are omitted from the output geometry.' });
  const geometry: ObjImportResult['geometry'] = { kind: 'custom', vertices, faces, ...(texturedFaces ? { uv, uvFaces } : {}) };
  return { geometry, report: {
    version: 'nwn-vfx-obj-import/v1', source: { utf8Bytes, vertices: vertices.length, textureCoordinates: uv.length, normals, triangles: faces.length, smoothingStatements },
    conversion: { sourceUpAxis: options.sourceUpAxis, metersPerUnit: options.metersPerUnit, targetUpAxis: 'z', targetUnit: 'meter',
      axisMapping: options.sourceUpAxis === 'y' ? 'x,-z,y' : 'x,y,z', transform, order: ['axis','units','scale','rotation','translation'], centered: false },
    normals: { mode: 'flat', sourceNormalsPreserved: false, smoothingPreserved: false },
    uv: { present: Boolean(texturedFaces), origin: 'bottom-left' },
    bounds: { min: [0,1,2].map(i => Math.min(...vertices.map(v => v[i]))) as Vec3,
      max: [0,1,2].map(i => Math.max(...vertices.map(v => v[i]))) as Vec3 }, warnings,
  } };
}

/** Build the same reviewable changes for browser and command-service callers.
 * Applying locks, revisions, schema promotion and full document invariants is
 * deliberately left to the existing applyChanges / command transaction.
 */
export function prepareObjImport(document: EffectDocument, input: PrepareObjImportInput): { changes: Change[]; report: ObjImportReport } {
  const target = input?.target;
  if (!target || typeof target !== 'object' || Array.isArray(target)
    || Object.keys(target).length !== 1 || (Object.hasOwn(target,'layerId') === Object.hasOwn(target,'newLayer')))
    throw new DomainError('VALIDATION_ERROR', 'OBJ import requires one existing mesh layer or one explicit new mesh layer.');
  let layer: MeshLayer | Omit<MeshLayer,'geometry'>;
  if ('layerId' in target) {
    const found = document.layers.find(item => item.id === target.layerId);
    if (!found) throw new DomainError('NOT_FOUND', 'OBJ import target layer was not found.');
    if (found.type !== 'mesh') throw new DomainError('VALIDATION_ERROR', 'OBJ geometry requires a mesh layer.');
    layer = found;
  } else {
    if (!target.newLayer || target.newLayer.type !== 'mesh' || typeof target.newLayer.id !== 'string' || !target.newLayer.id)
      throw new DomainError('VALIDATION_ERROR', 'OBJ import requires an explicit new mesh layer with an ID.');
    if (document.layers.some(item => item.id === target.newLayer.id)) throw new DomainError('CONFLICT', 'OBJ import layer ID already exists.');
    layer = target.newLayer;
  }
  if (input.textureAssetId !== undefined && !document.assets?.some(asset => asset.id === input.textureAssetId))
    throw new DomainError('MISSING_ASSET', 'Selected OBJ texture asset was not found in the document.');
  const texture = input.textureAssetId === undefined ? layer.texture : `asset:${input.textureAssetId}` as const;
  const parsed = parseObjGeometry(input.objText, { sourceUpAxis:input.sourceUpAxis, metersPerUnit:input.metersPerUnit,
    normalMode:input.normalMode, transform:input.transform, requireUv:Boolean(texture) });
  const selectedTexture = input.textureAssetId === undefined ? {} : { texture: texture! };
  const change: Change = 'layerId' in target
    ? { type:'layer.set',layerId:target.layerId,values:{geometry:parsed.geometry,...selectedTexture} }
    : { type:'layer.add',layer:{...structuredClone(target.newLayer),geometry:parsed.geometry,...selectedTexture} };
  return { changes:[change],report:parsed.report };
}

function validateOptions(options: ObjImportOptions): ObjImportTransform {
  if (!options || !['y','z'].includes(options.sourceUpAxis) || options.normalMode !== 'flat'
    || !Number.isFinite(options.metersPerUnit) || options.metersPerUnit <= 0
    || (options.requireUv !== undefined && typeof options.requireUv !== 'boolean'))
    fail('OBJ_INVALID_OPTIONS', 'OBJ requires explicit sourceUpAxis, positive metersPerUnit and normalMode flat.');
  const transform = options.transform === undefined ? { translation: [0,0,0], orientation: [0,0,1,0], scale: 1 } : options.transform;
  if (!transform || !Array.isArray(transform.translation) || transform.translation.length !== 3 || transform.translation.some(value => !Number.isFinite(value) || Math.abs(value)>20)
    || !Array.isArray(transform.orientation) || transform.orientation.length !== 4 || transform.orientation.some(value => !Number.isFinite(value))
    || Math.abs(Math.hypot(...transform.orientation.slice(0,3))-1)>1e-5 || Math.abs(transform.orientation[3])>8*Math.PI
    || !Number.isFinite(transform.scale) || transform.scale<.01 || transform.scale>10)
    fail('OBJ_INVALID_OPTIONS', 'OBJ transform requires translation within ±20 m, a unit axis-angle (±8π), and scale 0.01..10.');
  return { translation: [...transform.translation] as Vec3, orientation: [...transform.orientation] as AxisAngle, scale: transform.scale };
}
function corner(value: string, vertices: number, uv: number, normals: number, line: number): { vertex: number; uv?: number; normal?: number } {
  const parts = value.split('/');
  if (parts.length > 3 || !parts[0] || (parts.length === 2 && !parts[1]) || (parts.length === 3 && !parts[2]))
    fail('OBJ_FACE_FORMAT_INVALID', 'OBJ corner must be v, v/vt, v//vn, or v/vt/vn.', { line });
  return { vertex: reference(parts[0], vertices, line),
    ...(parts[1] ? { uv: reference(parts[1], uv, line) } : {}),
    ...(parts[2] ? { normal: reference(parts[2], normals, line) } : {}) };
}
function reference(value: string, count: number, line: number): number {
  const index = Number(value);
  if (!INDEX.test(value) || !Number.isSafeInteger(index) || index === 0) fail('OBJ_INDEX_INVALID', 'OBJ index must be a nonzero integer.', { line });
  const resolved = index < 0 ? count + index : index - 1;
  if (resolved < 0 || resolved >= count) fail('OBJ_INDEX_INVALID', 'OBJ index refers outside the declarations available at this face.', { line });
  return resolved;
}
function number(value: string, line: number): number {
  const parsed = Number(value);
  if (!NUMBER.test(value) || !Number.isFinite(parsed)) fail('OBJ_NUMBER_INVALID', 'OBJ numeric value must be a finite decimal number.', { line });
  return parsed;
}
function arity(fields: string[], required: number, line: number, record: string): void {
  if (fields.length !== required) fail('OBJ_RECORD_ARITY', `OBJ ${record} requires exactly ${required} values.`, { line });
}
function limit(field: string, maximum: number, line?: number): never {
  return fail('OBJ_LIMIT_EXCEEDED', 'OBJ exceeds the supported import limit.', { field, maximum, ...(line ? { line } : {}) });
}
function fail(code: string, message: string, details?: unknown): never { throw new DomainError(code, message, details); }
