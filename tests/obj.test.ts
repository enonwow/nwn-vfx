import test from 'node:test';
import assert from 'node:assert/strict';
import { parseObjGeometry, prepareObjImport, OBJ_IMPORT_LIMITS, type ObjImportOptions } from '../packages/core/src/obj.js';
import { DomainError, applyChanges, makeDocument, makeMeshLayer, type EffectDocument, type TextureAsset } from '../packages/core/src/model.js';
import { assertDocument } from '../packages/contracts/src/schema.js';

const options: ObjImportOptions = { sourceUpAxis: 'y', metersPerUnit: .01, normalMode: 'flat', requireUv: true };
const textured = '# asymmetric centimeter fixture; independent UV indexing\nv 0 0 0\nv 200 0 0\nv 0 100 50\nv -50 20 125\nvt .125 .25\nvt 1 0\nvt .75 1\nvt 0 .5\nf 1/4 2/2 3/1\nf -4/3 -2/1 -1/2\n';
const triangle = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
const plain: ObjImportOptions = { sourceUpAxis: 'z', metersPerUnit: 1, normalMode: 'flat' };
function rejects(text: string, config: ObjImportOptions = plain, code?: string) {
  assert.throws(() => parseObjGeometry(text, config), (error: unknown) => error instanceof DomainError
    && error.code.startsWith('OBJ_') && (code === undefined || error.code === code));
}
function close(a: number[], b: number[]) { a.forEach((n, i) => assert.ok(Math.abs(n - b[i]) < 1e-12, `${n} != ${b[i]}`)); }

test('asymmetric textured OBJ preserves winding, seams and origin while converting explicit axis and units', () => {
  const result = parseObjGeometry(textured, options);
  assert.deepEqual(result.geometry.vertices, [[0,0,0], [2,0,0], [0,-.5,1], [-.5,-1.25,.2]]);
  assert.deepEqual(result.geometry.faces, [[0,1,2],[0,2,3]]);
  assert.deepEqual(result.geometry.uvFaces, [[3,1,0],[2,0,1]]);
  assert.deepEqual(result.geometry.uv, [[.125,.25],[1,0],[.75,1],[0,.5]]);
  assert.deepEqual(result.report.bounds, { min: [-.5,-1.25,0], max: [2,0,1] });
  assert.deepEqual(result.report.source, { utf8Bytes: new TextEncoder().encode(textured).length,
    vertices: 4, textureCoordinates: 4, normals: 0, triangles: 2, smoothingStatements: 0 });
  assert.equal(result.report.conversion.centered, false);
  assert.equal(result.report.uv.origin, 'bottom-left');
  assert.deepEqual(parseObjGeometry(textured, options), result);
  assertDocument({ ...makeDocument('empty'), schemaVersion: 3, layers: [{ ...makeMeshLayer('obj'), geometry: result.geometry, texture: 'spark' }] });
});

test('baked transform uses axis then units then positive scale then rotation then meter translation', () => {
  const transform = { translation: [1,2,3] as [number,number,number], orientation: [0,0,1,Math.PI/2] as [number,number,number,number], scale: 2 };
  const before = structuredClone(transform), result = parseObjGeometry(textured, { ...options, transform });
  close(result.geometry.vertices[0], [1,2,3]);
  close(result.geometry.vertices[1], [1,6,3]);
  close(result.geometry.vertices[2], [2,2,5]);
  assert.deepEqual(transform, before);
  assert.deepEqual(result.report.conversion.order, ['axis','units','scale','rotation','translation']);
  assert.deepEqual(result.report.conversion.transform, transform);
});

test('negative indices resolve against declarations at the face line, never final counts', () => {
  const result = parseObjGeometry('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\nv 2 2 2\n', plain);
  assert.deepEqual(result.geometry.faces, [[0,1,2]]);
  assert.equal(result.geometry.vertices.length, 4);
  assert.equal(result.geometry.uv, undefined);
  assert.equal(result.report.uv.present, false);
});

test('explicit flat mode validates source normals and smoothing while reporting loss', () => {
  const source = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\ns 12\nf 1//1 2//1 3//1\n';
  const result = parseObjGeometry(source, plain);
  assert.deepEqual(result.geometry.faces, [[0,1,2]]);
  assert.equal(result.report.normals.mode, 'flat');
  assert.equal(result.report.normals.sourceNormalsPreserved, false);
  assert.deepEqual(result.report.warnings.map(w => w.code), ['OBJ_NORMALS_RECOMPUTED','OBJ_SMOOTHING_IGNORED']);
  const withUv = textured.replace('f 1/4 2/2 3/1', 'vn 0 0 1\nf 1/4/1 2/2/1 3/1/1');
  assert.equal(parseObjGeometry(withUv, options).report.source.normals, 1);
  for (const bad of [source.replace('vn 0 0 1','vn 0 0 0'), source.replace('3//1','3//2'), source.replace('s 12','s nope')]) rejects(bad);
});

test('OBJ subset rejects external materials, unsupported records, polygons and inconsistent face forms', () => {
  for (const text of [
    `mtllib secret.mtl\n${triangle}`, `usemtl shiny\n${triangle}`,
    `l 1 2\n${triangle}`, triangle.replace('f 1 2 3','f 1 2 3 1'), triangle.replace('f 1 2 3','f 1 2'),
    textured.replace('f 1/4 2/2 3/1','f 1/4 2 3/1'), textured.replace('f -4/3 -2/1 -1/2','f 1 3 4'),
    triangle.replace('v 0 0 0','v 0 0 0 1'), textured.replace('vt .125 .25','vt .125 .25 0'),
  ]) rejects(text);
});

test('one OBJ object label and group labels are accepted with explicit loss diagnostics; empty or multiple objects reject', () => {
  const result=parseObjGeometry(`o asym object\ng authored_group\n${textured}`,options);
  assert.deepEqual(result.geometry,parseObjGeometry(textured,options).geometry);
  assert.deepEqual(result.report.warnings.map(w=>w.code),['OBJ_LABELS_IGNORED']);
  assert.equal(parseObjGeometry(`g first\ng second\n${triangle}`,plain).report.warnings[0].code,'OBJ_LABELS_IGNORED');
  for(const header of ['o\n','g # empty label\n','o first\no second\n',`o ${'x'.repeat(129)}\n`]) rejects(header+triangle);
});

test('all numeric fields, indices, source options and final geometry bounds fail closed', () => {
  for (const text of [
    triangle.replace('1 0 0','NaN 0 0'), triangle.replace('1 0 0','Infinity 0 0'), triangle.replace('1 0 0','1e999 0 0'),
    triangle.replace('1 0 0','0x1 0 0'), triangle.replace('f 1 2 3','f 0 2 3'), triangle.replace('f 1 2 3','f 1 2 4'),
    triangle.replace('f 1 2 3','f -4 2 3'), triangle.replace('f 1 2 3','f 1.0 2 3'), triangle.replace('f 1 2 3','f 1 1 3'),
    triangle.replace('v 0 1 0','v 2 0 0'), triangle.replace('v 1 0 0','v 21 0 0'), `${triangle}\u0000`,
    textured.replace('vt .125 .25','vt 1.001 .25'), textured.replace('vt .125 .25','vt -.01 .25'),
  ]) rejects(text);
  for (const config of [ {}, { ...plain, sourceUpAxis: 'x' }, { ...plain, metersPerUnit: 0 },
    { ...plain, metersPerUnit: -1 }, { ...plain, metersPerUnit: Infinity }, { ...plain, normalMode: 'smooth' },
    { ...plain, transform: { translation:[0,0,0],orientation:[0,0,2,1],scale:1 } },
    { ...plain, transform: { translation:[0,0,0],orientation:[0,0,1,0],scale:-1 } },
    { ...plain, transform: { translation:[20,0,0],orientation:[0,0,1,0],scale:1 } },
  ]) rejects(triangle, config as ObjImportOptions);
  rejects(triangle, { ...plain, requireUv: true }, 'OBJ_MISSING_UV');
});

test('byte, vertex, triangle and UV budgets are checked before returning geometry', () => {
  rejects(`#${'x'.repeat(OBJ_IMPORT_LIMITS.maxTextBytes)}\n${triangle}`, plain, 'OBJ_LIMIT_EXCEEDED');
  rejects(`#${'ą'.repeat(OBJ_IMPORT_LIMITS.maxTextBytes/2)}\n${triangle}`, plain, 'OBJ_LIMIT_EXCEEDED');
  rejects(`${'v 0 0 0\n'.repeat(2049)}f 1 2 3`, plain, 'OBJ_LIMIT_EXCEEDED');
  rejects(`v 0 0 0\nv 1 0 0\nv 0 1 0\n${'f 1 2 3\n'.repeat(4097)}`, plain, 'OBJ_LIMIT_EXCEEDED');
  rejects(`${'vt 0 0\n'.repeat(8193)}${triangle}`, plain, 'OBJ_LIMIT_EXCEEDED');
});

test('BOM, CRLF, numeric exponents and comments are deterministic and diagnostics do not echo source text', () => {
  const result = parseObjGeometry('\uFEFF# fixture\r\nv 0 0 0 # origin\r\nv 1e0 0 0\r\nv 0 +1.0 0\r\nf +1 2 3\r\n', plain);
  assert.deepEqual(result.geometry.vertices, [[0,0,0],[1,0,0],[0,1,0]]);
  try { parseObjGeometry('mtllib PRIVATE_ABSOLUTE_PATH.mtl', plain); assert.fail('must reject'); }
  catch (error) { assert.ok(error instanceof DomainError); assert.equal(JSON.stringify(error).includes('PRIVATE_ABSOLUTE_PATH'), false); }
});

test('import preparation stages only geometry and an explicitly selected texture, with no document mutation', () => {
  const document:EffectDocument = { ...makeDocument('empty'), layers: [{ ...makeMeshLayer('target'), color:'#abcdef', texture:'spark' as const }] };
  const original = structuredClone(document), textureAssetId = 'a'.repeat(64);
  document.assets = [{ id:textureAssetId } as TextureAsset];
  const input = { ...options, objText:textured, target:{layerId:'target'} };
  const result = prepareObjImport(document,input);
  assert.equal(result.changes.length,1); assert.equal(result.changes[0].type,'layer.set');
  if(result.changes[0].type !== 'layer.set') assert.fail('layer.set');
  assert.deepEqual(Object.keys(result.changes[0].values),['geometry']);
  const assigned = prepareObjImport(document,{...input,textureAssetId});
  if(assigned.changes[0].type !== 'layer.set') assert.fail('layer.set');
  assert.equal(assigned.changes[0].values.texture,`asset:${textureAssetId}`);
  assert.deepEqual(document.layers,original.layers);
  document.locks=[{layerId:'target',field:'geometry'}];
  assert.throws(()=>applyChanges(document,result.changes,false),(error:unknown)=>error instanceof DomainError&&error.code==='LOCKED');
});

test('import preparation enforces target identity and derives required UV from the effective texture', () => {
  const document = { ...makeDocument('empty'), layers:[...makeDocument('empty').layers,makeMeshLayer('mesh')] };
  assert.equal(prepareObjImport(document,{...plain,objText:triangle,target:{layerId:'mesh'}}).changes.length,1);
  for(const [input,code] of [
    [{...plain,objText:triangle,target:{layerId:'missing'}},'NOT_FOUND'],
    [{...plain,objText:triangle,target:{layerId:document.layers[0].id}},'VALIDATION_ERROR'],
    [{...plain,objText:triangle,target:{layerId:'mesh'},textureAssetId:'f'.repeat(64)},'MISSING_ASSET'],
    [{...plain,objText:triangle,target:{newLayer:makeMeshLayer('mesh')}},'CONFLICT'],
    [{...plain,objText:triangle,target:{layerId:'mesh',newLayer:makeMeshLayer('new')}},'VALIDATION_ERROR'],
  ] as const) assert.throws(()=>prepareObjImport(document,input as any),(error:unknown)=>error instanceof DomainError&&error.code===code);
  const texturedLayer={...makeMeshLayer('textured'),texture:'smoke' as const}; document.layers.push(texturedLayer);
  assert.throws(()=>prepareObjImport(document,{...plain,objText:triangle,target:{layerId:'textured'}}),(error:unknown)=>error instanceof DomainError&&error.code==='OBJ_MISSING_UV');
});

test('new-layer preparation combines the explicit layer with imported geometry and preserves authored settings', () => {
  const document=makeDocument('empty'), source=makeMeshLayer('new');
  const {geometry:unused,...newLayer}=source;
  const input={...options,objText:textured,target:{newLayer:{...newLayer,color:'#aabbcc',texture:'glow' as const}}};
  const before=structuredClone(input), result=prepareObjImport(document,input);
  assert.equal(result.changes[0].type,'layer.add');
  if(result.changes[0].type !== 'layer.add') assert.fail('layer.add');
  assert.equal(result.changes[0].layer.type,'mesh'); assert.equal(result.changes[0].layer.color,'#aabbcc');
  const next=applyChanges(document,result.changes,false); assert.equal(next.schemaVersion,3); assertDocument(next);
  assert.deepEqual(input,before); assert.equal(document.layers.length,1);
});
