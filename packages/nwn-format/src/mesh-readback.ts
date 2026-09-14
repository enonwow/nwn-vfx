import { DomainError, type BlendMode, type MeshLayer } from '../../core/src/model.js';
import { meshCornerNormals } from '../../core/src/shading.js';
import { deformationNormalSamples } from './normal-samples.js';
import { buildMeshGeometry } from '../../core/src/mesh.js';
import { createHash } from 'node:crypto';
import { compileMeshDeformation,type CompiledMeshDeformation } from '../../core/src/deformation.js';
import { effectiveBlend } from './textures.js';
import { numeric, sampleTrack, textProperty, vector, type MdlAnimation, type MdlReadback } from './mdl-reader.js';

export interface MeshReadback {
  layerId: string; node: string; parent: string; geometryKind: MeshLayer['geometry']['kind'];
  vertices: number[][]; faces: number[][]; position: number[]; orientation: number[];
  scale: number; color: number[]; diffuse: number[]; selfIllumination: number[]; alpha: number;
  uv: number[][]; uvFaces: number[][]; texture: string | null; blend: BlendMode;
  positionKeys: number[][]; orientationKeys: number[][]; scaleKeys: number[][]; alphaKeys: number[][];
  visibilityRampSeconds: { start: number; end: number };
  shading?: {mode:'flat'|'smooth';smoothingMask:0|1;normalRule:'area-weighted-by-shared-vertex-index';cornerNormalsSha256:string;
    deformationNormals?:ReturnType<typeof deformationNormalSamples>;exportedAnimatedNormals?:false};
  deformation?: { frameSets: number; samplePeriod: number; vertexSamples: number; uvSamples: number; animvertsSha256: string; animtvertsSha256: string; allSamplesRead: true; maxDeviationMetres: number; interpolation?:CompiledMeshDeformation['interpolation'] };
}
const checked = (condition: boolean, message: string) => { if (!condition) throw new DomainError('EXPORT_VALIDATION_FAILED', `Mesh: ${message}`); };
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => close(v, b[i]));

/** Compare independently parsed MDL tables/controllers against authored data.
 * Rotation checks compare key endpoints only: linear axis-angle sampling would
 * invent an interpolation guarantee that the native renderer has not proved.
 */
export function readbackMesh(parsed: MdlReadback, anim: MdlAnimation, layer: MeshLayer, node: string, parent: string, textureResref: string | null = null, blend: BlendMode = 'normal', preserveBoundaryAlpha=false): MeshReadback {
  const baseAlpha=preserveBoundaryAlpha?(layer.animation.alpha?.[0]?.time===0?layer.animation.alpha[0].value:layer.alpha):0;
  const mesh = parsed.nodes.find(entry => entry.name === node)!;
  const ancestor = parsed.nodes.find(entry => entry.name === parent)!;
  const animated = anim.nodes.find(entry => entry.name === node)!;
  const kind = layer.animation.vertices === undefined ? 'trimesh' : 'animmesh';
  checked(!!mesh && !!ancestor && !!animated && mesh.type === kind && animated.type === kind, `Brak węzła ${node}.`);
  checked(textProperty(mesh, 'parent') === parent && textProperty(mesh, 'bitmap') === (textureResref ?? 'NULL'), 'Utracony rodzic lub materiał.');
  checked(blend === effectiveBlend(layer), 'Utracony blend materiału po odczycie TXI.');
  checked(same(vector(ancestor, 'position'), [0, 0, 0]) && close(numeric(ancestor, 'scale'), 1), 'Rodzic siatki nie jest neutralny.');
  checked(same(vector(mesh, 'position'), layer.position) && same(vector(mesh, 'orientation', 4), layer.orientation) && close(numeric(mesh, 'scale'), layer.scale), 'Utracona transformacja siatki.');
  const rgb = (hex: string) => [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const diffuse = vector(mesh, 'diffuse'), selfIllumination = vector(mesh, 'selfillumcolor');
  checked(same(diffuse, rgb(layer.material?.diffuse ?? layer.color))
    && same(selfIllumination, rgb(layer.material?.selfIllumination ?? layer.color)) && numeric(mesh, 'alpha') === baseAlpha,
  'Utracony diffuse, selfIllumination albo bazowa widoczność.');
  checked(same(vector(mesh, 'ambient'), [0, 0, 0]) && same(vector(mesh, 'specular'), [0, 0, 0]) && numeric(mesh, 'shininess') === 0,
    'Nieobsługiwane ambient, specular lub shininess.');
  const expected = buildMeshGeometry(layer.geometry), { verts, tverts, faces } = mesh.tables;
  const expectedUv = expected.uv.length ? expected.uv : expected.vertices.map(() => [0, 0]);
  const expectedUvFaces = expected.uvFaces.length ? expected.uvFaces : expected.faces;
  checked(verts.length === expected.vertices.length && verts.every((v, i) => same(v, expected.vertices[i])), 'Zmienione wierzchołki po serializacji.');
  checked(faces.length === expected.faces.length && faces.every((face, index) => same(face.slice(0, 3), expected.faces[index]) && face[3] === (layer.shading === 'smooth' ? 1 : 0) && same(face.slice(4, 7), expectedUvFaces[index]) && face[7] === 0), 'Zmienione indeksy, winding lub materiał trójkątów.');
  checked(tverts.length === expectedUv.length && tverts.every((v, i) => same(v, [...expectedUv[i], 0])), 'Zmienione współrzędne UV.');
  let deformation: MeshReadback['deformation'];
  if (kind === 'animmesh') {
    const compiled = compileMeshDeformation(layer, anim.length);
    const exact = (a: number[][], b: number[][]) => !!a && a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((n, j) => n === b[i][j]));
    for (const table of ['verts', 'tverts', 'faces']) checked(exact(animated.tables[table], mesh.tables[table]), `Utracona stała topologia/UV animmesh: ${table}.`);
    for (const property of ['parent','bitmap','diffuse','selfillumcolor'])
      checked(JSON.stringify(animated.properties[property]) === JSON.stringify(mesh.properties[property]), `Zmieniony materiał/transformacja animmesh: ${property}.`);
    for (const field of ['position','orientation','scale','alpha'])
      checked(animated.properties[field] === undefined, `Powtórzony kontroler animmesh: ${field}.`);
    checked(numeric(mesh,'sampleperiod') === 0 && numeric(animated,'sampleperiod') === compiled.period, 'Zmieniony okres deformacji.');
    const av = animated.tables.animverts, at = animated.tables.animtverts;
    checked(exact(av, compiled.frames.flat()) && exact(at, compiled.frames.flatMap(() => expectedUv.map(v => [...v, 0]))), 'Utracone próbki deformacji lub stabilne UV.');
    const hash = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
    deformation = { frameSets: compiled.frames.length, samplePeriod: compiled.period, vertexSamples: av.length, uvSamples: at.length,
      animvertsSha256: hash(av), animtvertsSha256: hash(at), allSamplesRead: true, maxDeviationMetres: compiled.maxDeviationMetres,
      ...(compiled.interpolation?{interpolation:compiled.interpolation}:{}) };
  }
  for (const field of ['position', 'orientation', 'scale', 'alpha'] as const) {
    const rows = animated.tracks[field];
    checked(!!rows?.length && rows[0][0] === 0 && close(rows[rows.length - 1][0], anim.length), `Brak pełnego kontrolera ${field}.`);
    const authored = layer.animation[field] ?? [];
    for (const key of authored) {
      if (!preserveBoundaryAlpha && field === 'alpha' && (key.time === 0 || key.time === layer.duration)) continue;
      const actual = rows.find(row => row[0] === Math.min(anim.length, layer.start + key.time));
      const value = Array.isArray(key.value) ? key.value : [key.value];
      checked(!!actual && same(actual.slice(1), value), `Utracony klucz ${field} przy ${key.time}.`);
    }
    if (field !== 'alpha' || preserveBoundaryAlpha) {
      const base = authored.length && authored[0].time === 0 ? authored[0].value : layer[field];
      checked(same(rows[0].slice(1), Array.isArray(base) ? base : [base]), `Utracona wartość początkowa ${field}.`);
      const last = authored.length ? authored[authored.length - 1].value : layer[field];
      checked(same(rows[rows.length - 1].slice(1), Array.isArray(last) ? last : [last]), `Utracona wartość końcowa ${field}.`);
    }
  }
  const alphaRows = animated.tracks.alpha, end = layer.start + layer.duration;
  checked(alphaRows.every(row => row[1] >= 0 && row[1] <= 1), 'Opacity poza zakresem.');
  if(!preserveBoundaryAlpha)checked(sampleTrack(alphaRows, layer.start)[0] === 0 && sampleTrack(alphaRows, end)[0] === 0, 'Siatka widoczna poza swoim przedziałem czasu.');
  const firstAlpha = layer.animation.alpha?.[0]?.time === 0 ? layer.animation.alpha[0].value : layer.alpha;
  const authoredAlpha = layer.animation.alpha;
  const lastAlpha = authoredAlpha?.length ? authoredAlpha[authoredAlpha.length - 1].value : layer.alpha;
  // The first/last interior row is the boundary ramp endpoint when authored
  // boundary alpha is nonzero. Derive durations from serialized bytes.
  const opening = preserveBoundaryAlpha || firstAlpha === 0 ? 0 : alphaRows.find(row => row[0] > layer.start)![0] - layer.start;
  const closing = preserveBoundaryAlpha || lastAlpha === 0 ? 0 : end - alphaRows.filter(row => row[0] < end).at(-1)![0];
  checked(opening <= .001 + 1e-9 && closing <= .001 + 1e-9, 'Zbyt długa rampa widoczności.');
  const shading: MeshReadback['shading'] = {mode:layer.shading??'flat',smoothingMask:layer.shading === 'smooth'?1:0,normalRule:'area-weighted-by-shared-vertex-index',
    cornerNormalsSha256:createHash('sha256').update(JSON.stringify(meshCornerNormals(verts,faces.map(f=>f.slice(0,3)),layer.shading??'flat'))).digest('hex')};
  if(kind==='animmesh'&&layer.shading==='smooth'){
    const av=animated.tables.animverts,frames=Array.from({length:av.length/verts.length},(_,i)=>av.slice(i*verts.length,(i+1)*verts.length));
    shading.deformationNormals=deformationNormalSamples(frames,faces.map(f=>f.slice(0,3)));shading.exportedAnimatedNormals=false;
  }
  return { shading, layerId: layer.id, node, parent, geometryKind: layer.geometry.kind, ...(deformation ? { deformation } : {}),
    vertices: verts, faces: faces.map(face => face.slice(0, 3)), position: vector(mesh, 'position'), orientation: vector(mesh, 'orientation', 4),
    scale: numeric(mesh, 'scale'), color: diffuse, diffuse, selfIllumination, alpha: numeric(mesh, 'alpha'),
    uv: tverts.map(row => row.slice(0, 2)), uvFaces: faces.map(face => face.slice(4, 7)), texture: textureResref, blend,
    positionKeys: animated.tracks.position, orientationKeys: animated.tracks.orientation, scaleKeys: animated.tracks.scale, alphaKeys: alphaRows,
    // Eliminate subtraction roundoff (e.g. .501 - .5 > .001) in the bounded DTO.
    visibilityRampSeconds: { start: Math.min(.001, opening), end: Math.min(.001, closing) } };
}
