import { DomainError, type MeshLayer } from '../../core/src/model.js';
import { buildMeshGeometry } from '../../core/src/mesh.js';
import { validateMeshShading } from '../../core/src/shading.js';
import { compileMeshDeformation, validateMeshDeformation } from '../../core/src/deformation.js';

const fail = (message: string): never => { throw new DomainError('INVALID_INPUT', `Mesh: ${message}`); };
const inRange = (value: number, min: number, max: number, field: string) => {
  if (!Number.isFinite(value) || value < min || value > max) fail(`Wartość poza zakresem: ${field}`);
};
const checkVec = (value: number[], size: number, min: number, max: number, field: string) => {
  if (!Array.isArray(value) || value.length !== size) fail(`Nieprawidłowy wektor: ${field}`);
  value.forEach(v => inRange(v, min, max, field));
};
function checkValue(field: string, value: unknown): void {
  if (field === 'position') checkVec(value as number[], 3, -20, 20, field);
  else if (field === 'orientation') {
    checkVec(value as number[], 4, -8 * Math.PI, 8 * Math.PI, field);
    if (Math.abs(Math.hypot(...(value as number[]).slice(0, 3)) - 1) > 1e-5) fail('Oś orientation musi mieć długość 1.');
  } else inRange(value as number, field === 'alpha' ? 0 : .01, field === 'alpha' ? 1 : 10, field);
}

export function validateMeshForExport(layer: MeshLayer, length: number): void {
  if (!/^#[0-9a-f]{6}$/i.test(layer.color)) fail('Nieprawidłowy kolor.');
  if (layer.material !== undefined && (!layer.material || typeof layer.material !== 'object' || Array.isArray(layer.material)
    || Object.keys(layer.material).length !== 2
    || !/^#[0-9a-f]{6}$/i.test(layer.material.diffuse) || !/^#[0-9a-f]{6}$/i.test(layer.material.selfIllumination)))
    fail('Materiał wymaga diffuse i selfIllumination w formacie #RRGGBB.');
  inRange(layer.start, 0, 30, 'start'); inRange(layer.duration, .01, 30, 'duration');
  if (layer.start + layer.duration > length + 1e-9)
    throw new DomainError('UNSUPPORTED_EXPORT', `Warstwa ${layer.id} wykracza poza czas efektu.`, { layerId: layer.id, minimumDuration: layer.start + layer.duration });
  if (!layer.animation || typeof layer.animation !== 'object' || Array.isArray(layer.animation)) fail('Brak obiektu animation.');
  for (const field of ['position', 'orientation', 'scale', 'alpha'] as const) {
    checkValue(field, layer[field]);
    const track = layer.animation[field];
    if (!track) continue;
    if (!Array.isArray(track) || track.length > 64) fail(`Ścieżka ${field} obsługuje maks. 64 klucze.`);
    let previous = -1;
    for (const key of track) {
      inRange(key.time, 0, layer.duration, `${field}.time`);
      if (key.time <= previous) fail(`Czasy ${field} muszą być ściśle rosnące.`);
      previous = key.time; checkValue(field, key.value);
    }
  }
  validateMeshDeformation(layer);
  if (Object.keys(layer.animation).some(field => !['position', 'orientation', 'scale', 'alpha', 'vertices'].includes(field)))
    throw new DomainError('UNSUPPORTED_EXPORT', 'Nieobsługiwany kontroler siatki.');
  const source = layer.geometry;
  if (!source || !['box', 'ring', 'custom'].includes(source.kind)) fail('Nieobsługiwany typ geometrii.');
  if (source.kind === 'box') checkVec(source.dimensions, 3, .001, 20, 'dimensions');
  else if (source.kind === 'ring') {
    inRange(source.innerRadius, 0, 10, 'innerRadius'); inRange(source.outerRadius, .001, 10, 'outerRadius');
    inRange(source.segments, 8, 128, 'segments');
    if (!Number.isInteger(source.segments) || source.innerRadius >= source.outerRadius) fail('Nieprawidłowy pierścień.');
  } else {
    if (!Array.isArray(source.vertices) || !Array.isArray(source.faces)) fail('Brak tabel custom geometry.');
    if (source.vertices.length < 3 || source.vertices.length > 2048 || !source.faces.length || source.faces.length > 4096) fail('Przekroczony limit geometrii custom.');
    for (const vertex of source.vertices) checkVec(vertex, 3, -20, 20, 'vertex');
    for (const face of source.faces) if (!Array.isArray(face) || face.length !== 3) fail('Nieprawidłowy trójkąt.');
  }
  const geometry = buildMeshGeometry(source);
  if (source.kind === 'custom') {
    if ((source.uv === undefined) !== (source.uvFaces === undefined)) fail('Custom UV wymaga zarówno uv, jak i uvFaces.');
    if (layer.texture && (source.uv === undefined || source.uvFaces === undefined)) fail('Teksturowana geometria custom wymaga jawnych UV.');
  }
  const neutralUv = source.kind === 'custom' && source.uv === undefined && source.uvFaces === undefined;
  if (!neutralUv) {
    if (!Array.isArray(geometry.uv) || geometry.uv.length < 3 || geometry.uv.length > 8192 || geometry.uvFaces.length !== geometry.faces.length) fail('Nieprawidłowe rozmiary tabel UV.');
    for (const uv of geometry.uv) checkVec(uv, 2, 0, 1, 'uv');
    for (const face of geometry.uvFaces) if (face.length !== 3 || face.some(index => !Number.isInteger(index) || index < 0 || index >= geometry.uv.length)) fail('Nieprawidłowy indeks UV.');
  }
  if (geometry.vertices.length > 2048 || geometry.faces.length > 4096) fail('Przekroczony limit geometrii.');
  if (geometry.vertices.length < 3 || !geometry.faces.length) fail('Pusta geometria.');
  for (const vertex of geometry.vertices) checkVec(vertex, 3, -20, 20, 'vertex');
  for (const face of geometry.faces) {
    if (face.length !== 3 || face.some(index => !Number.isInteger(index) || index < 0 || index >= geometry.vertices.length) || new Set(face).size !== 3)
      fail('Nieprawidłowy indeks trójkąta.');
    const [a, b, c] = face.map(index => geometry.vertices[index]);
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...cross) <= 1e-12 * Math.hypot(...u) * Math.hypot(...v)) fail('Zdegenerowany trójkąt.');
  }
  validateMeshShading(layer);
}

function localRows(layer: MeshLayer, field: 'position' | 'orientation' | 'scale' | 'alpha'): number[][] {
  const track = layer.animation[field];
  const row = (time: number, value: number | number[]) => [time, ...(Array.isArray(value) ? value : [value])];
  const rows = (track ?? []).map(key => row(key.time, key.value));
  if (!rows.length || rows[0][0] > 0) rows.unshift(row(0, layer[field]));
  if (rows[rows.length - 1][0] < layer.duration) rows.push([layer.duration, ...rows[rows.length - 1].slice(1)]);
  return rows;
}
function scalarAt(rows: number[][], time: number): number {
  for (let index = 1; index < rows.length; index++) if (time <= rows[index][0]) {
    const a = rows[index - 1], b = rows[index];
    return a[1] + (b[1] - a[1]) * (time - a[0]) / (b[0] - a[0]);
  }
  return rows[rows.length - 1][1];
}

/** Linear opacity cannot represent a discontinuous lifetime gate. Keep every
 * authored interior key and approximate nonzero boundary alpha with <=1 ms
 * ramps, shortened further when a key is close to the boundary.
 */
export function meshControllerTracks(layer: MeshLayer, length: number, preserveBoundaryAlpha=false): {
  tracks: Record<'position' | 'orientation' | 'scale' | 'alpha', number[][]>;
  visibilityRampSeconds: { start: number; end: number };
} {
  const tracks = {} as Record<'position' | 'orientation' | 'scale' | 'alpha', number[][]>;
  const alpha = localRows(layer, 'alpha');
  const opening = preserveBoundaryAlpha || alpha[0][1] === 0 ? 0 : Math.min(.001, layer.duration / 4, alpha[1][0] / 2);
  const closing = preserveBoundaryAlpha || alpha[alpha.length - 1][1] === 0 ? 0 : Math.min(.001, layer.duration / 4, (layer.duration - alpha[alpha.length - 2][0]) / 2);
  for (const field of ['position', 'orientation', 'scale', 'alpha'] as const) {
    let local = localRows(layer, field);
    if (field === 'alpha' && !preserveBoundaryAlpha) {
      local = [[0, 0], ...alpha.slice(1, -1), [layer.duration, 0]];
      if (opening) local.splice(1, 0, [opening, scalarAt(alpha, opening)]);
      if (closing) local.splice(local.length - 1, 0, [layer.duration - closing, scalarAt(alpha, layer.duration - closing)]);
    }
    const rows = local.map(row => [Math.min(length, layer.start + row[0]), ...row.slice(1)]);
    if (rows[0][0] > 0) rows.unshift([0, ...rows[0].slice(1)]);
    if (rows[rows.length - 1][0] < length) rows.push([length, ...rows[rows.length - 1].slice(1)]);
    if (new Set(rows.map(row => Math.fround(row[0]))).size !== rows.length)
      throw new DomainError('UNSUPPORTED_EXPORT', `Czasy kontrolera ${layer.id}.${field} są zbyt bliskie dla float32 silnika.`);
    tracks[field] = rows;
  }
  return { tracks, visibilityRampSeconds: { start: opening, end: closing } };
}

const values = (row: number[]) => row.map(value => Object.is(value, -0) ? '0' : value.toString()).join(' ');
const table = (name: string, rows: number[][]) => `  ${name} ${rows.length}\n${rows.map(row => `    ${values(row)}`).join('\n')}\n  endlist\n`;

export function writeMeshNodes(layer: MeshLayer, modelName: string, node: string, parent: string, length: number, textureResref: string | null = null, preserveBoundaryAlpha=false): { geometry: string; animation: string } {
  const geometry = buildMeshGeometry(layer.geometry), { vertices, faces } = geometry;
  // Legacy custom geometry has no UV in the document. Its untextured material
  // uses explicit neutral native coordinates; authored UV is never synthesized.
  const uv = geometry.uv.length ? geometry.uv : vertices.map(() => [0, 0]);
  const uvFaces = geometry.uvFaces.length ? geometry.uvFaces : faces;
  const rgb = (hex: string) => [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const diffuse = rgb(layer.material?.diffuse ?? layer.color), selfIllumination = rgb(layer.material?.selfIllumination ?? layer.color);
  const { tracks } = meshControllerTracks(layer, length, preserveBoundaryAlpha);
  const result = {
    geometry: `node dummy ${parent}\n  parent ${modelName}\n  position 0 0 0\n  orientation 0 0 1 0\n  scale 1\nendnode\nnode trimesh ${node}\n  parent ${parent}\n  position ${values(layer.position)}\n  orientation ${values(layer.orientation)}\n  scale ${layer.scale}\n  ambient 0 0 0\n  diffuse ${values(diffuse)}\n  selfillumcolor ${values(selfIllumination)}\n  specular 0 0 0\n  shininess 0\n  bitmap ${textureResref ?? 'NULL'}\n  alpha ${preserveBoundaryAlpha?tracks.alpha[0][1]:0}\n  transparencyhint 1\n  render 1\n  shadow 0\n  beaming 0\n  inheritcolor 0\n${table('verts', vertices)}${table('tverts', uv.map(value => [...value, 0]))}${table('faces', faces.map((face, index) => [...face, layer.shading === 'smooth' ? 1 : 0, ...uvFaces[index], 0]))}endnode\n`,
    animation: `node dummy ${parent}\n  parent ${modelName}\nendnode\nnode trimesh ${node}\n  parent ${parent}\n${Object.entries(tracks).map(([field, rows]) => table(`${field}key`, rows)).join('')}endnode\n`,
  };
  if (layer.animation.vertices !== undefined) {
    const compiled = compileMeshDeformation(layer, length), marker = `node trimesh ${node}\n`;
    // Native animmesh requires its static mesh/material tables in both sections.
    // Static values plus *key for the same property compile to two controller
    // entries of one type. Animation carries one keyed controller per field.
    const body = result.geometry.slice(result.geometry.indexOf(marker) + marker.length, -'endnode\n'.length)
      .replace(/^  (position|orientation|scale|alpha) .*\n/gm, '');
    result.geometry = result.geometry.replace(marker, `node animmesh ${node}\n`).slice(0, -'endnode\n'.length) + '  sampleperiod 0\nendnode\n';
    result.animation = `node dummy ${parent}\n  parent ${modelName}\nendnode\nnode animmesh ${node}\n${body}  sampleperiod ${compiled.period}\n`
      + table('animverts', compiled.frames.flat())
      + table('animtverts', compiled.frames.flatMap(() => uv.map(v => [...v, 0])))
      + Object.entries(tracks).map(([field, rows]) => table(`${field}key`, rows)).join('') + 'endnode\n';
  }
  return result;
}
