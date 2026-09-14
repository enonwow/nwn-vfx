import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { operationSchemas } from '../packages/contracts/src/schema.js';
import { makeDocument, makeMeshLayer, makeTrailLayer } from '../packages/core/src/model.js';
import { compactWebMCPInputSchema, webMCPInputSchemas, toolsForProfile } from '../apps/web/src/webmcp-schemas.js';
import { createStudioWebMCPTools } from '../apps/web/src/webmcp.js';

function expand(schema: any): object {
  const definitions = schema.$defs ?? {};
  const anchors=new Map<string,any>();
  function collect(value:any):void{if(!value||typeof value!=='object')return;if(value.$anchor){assert(!anchors.has(value.$anchor),'Anchor names are unique within the tool');anchors.set(value.$anchor,value);}for(const [k,v] of Object.entries(value))if(!['const','enum','default','examples'].includes(k))collect(v);}
  collect(schema);
  function visit(value: any): any {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    if (Object.keys(value).length === 1 && typeof value.$ref === 'string') {
      assert.match(value.$ref, /^(#\/\$defs\/[0-9a-z]+|#[a-zA-Z][a-zA-Z0-9]*)$/u, 'Only document-local generated references are permitted');
      const resolved=value.$ref.startsWith('#/$defs/')?definitions[value.$ref.slice('#/$defs/'.length)]:anchors.get(value.$ref.slice(1));
      assert(resolved, 'Every generated reference resolves within this tool schema');
      const {$anchor: _anchor,...definition}=resolved;
      return visit(definition);
    }
    return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='$anchor').map(([key, item]) => [key, visit(item)]));
  }
  const { $defs: _definitions, ...root } = schema;
  return visit(root);
}

function validationOnly(value:any):any {
  if(Array.isArray(value))return value.map(validationOnly);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([k,v])=>!(k==='description'&&typeof v==='string')).map(([k,v])=>[k,['const','enum','default','examples'].includes(k)?v:validationOnly(v)]));
}
test('compact WebMCP schemas preserve all validation keywords; only descriptive annotations are omitted', () => {
  const original = webMCPInputSchemas(operationSchemas, { compact: false }), saved = structuredClone(original);
  const compact = webMCPInputSchemas(operationSchemas);
  assert.equal(Object.keys(compact).length, 67); assert.deepEqual(Object.keys(compact), Object.keys(original));
  for (const [name, schema] of Object.entries(compact)) assert.deepEqual(expand(schema), validationOnly(original[name]), name);
  assert.deepEqual(original, saved, 'Compaction must not mutate the source schemas');
  assert.deepEqual(webMCPInputSchemas(operationSchemas), compact, 'Definition names and output are deterministic');
  const scopes = { type: 'object', properties: { child: { $ref: '#/definitions/item' } }, definitions: { item: { type: 'string' } } };
  assert.deepEqual(compactWebMCPInputSchema(scopes), scopes, 'Existing reference scopes are preserved rather than moved');
  const literal = { type: 'object', properties: { sample: { const: { type: 'object', properties: { repeated: 'literal data' } } } } };
  assert.deepEqual(compactWebMCPInputSchema(literal), literal, 'Literal object values and property maps are not schema nodes');
});

test('compact and canonical AJV decisions match across all 67 tools for valid and malformed operation input', () => {
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  const canonical = webMCPInputSchemas(operationSchemas, { compact: false }), compact = webMCPInputSchemas(operationSchemas);
  const mesh = makeMeshLayer('mesh', 'Stone'), doc = makeDocument();
  const common = { viewSessionId: 'view', input: { projectId: 'project', expectedRevision: 1 }, idempotencyKey: 'stable-key' };
  const obj = { projectId: 'project', expectedRevision: 1, fileName: 'mesh.obj', objText: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3',
    sourceUpAxis: 'z', metersPerUnit: 1, normalMode: 'flat', target: { layerId: 'mesh' } };
  const samples: unknown[] = [null, undefined, [], {}, 12, false, { extra: true }, { viewSessionId: 'view' }, { viewSessionId: 'view', input: {} },
    common, { ...common, input: { ...common.input, assetIds: ['a'.repeat(64)] } },
    { ...common, input:{...common.input,changes:[{type:'layer.add',layer:makeTrailLayer('trail')}] } },
    { ...common, input:{...common.input,changes:[{type:'layer.add',layer:{...makeTrailLayer('trail'),profile:'smoke'}}]} },
    { ...common, input:{...common.input,changes:[{type:'layer.set',layerId:'trail',values:{path:[{time:0,position:[0,0,0]},{time:1,position:[0,0,1]}],head:{enabled:true,size:.02}}}]} },
    { ...common, input: obj }, { viewSessionId: 'view', input: obj },
    { ...common, input: { ...obj, normalMode: 'smooth' } }, { ...common, input: { ...obj, metersPerUnit: -1 } },
    { ...common, input: { ...obj, target: { layerId: 'mesh', newLayer: mesh } } },
    { ...common, input: { ...obj, transform: { translation: [0, 0, 0], orientation: [0, 0, 1, 0], scale: 1, unknown: true } } },
    { ...common, input: { ...common.input, changes: [{ type: 'layer.add', layer: mesh }] } },
    { ...common, input: { ...common.input, changes: [{ type: 'layer.add', layer: doc.layers[0] }] } },
    { ...common, input: { ...common.input, changes: [{ type: 'layer.set', layerId: 'mesh', values: { material: { diffuse: '#abcdef', selfIllumination: '#000000' } } }] } },
    { ...common, input: { ...common.input, changes: [{ type: 'layer.set', layerId: 'mesh', values: { material: { diffuse: '#bad' } } }] } },
    { ...common, input: { ...common.input, changes: [{ type: 'layer.set', layerId: 'mesh', values: { geometry: { kind: 'custom', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]], uv: [[0, 0], [1, 0], [0, 1]], uvFaces: [[0, 1, 2]] } } }] } },
    { ...common, idempotencyKey: 'short' }, { ...common, actorId: 'owner' },
    { viewSessionId: 'view', projectId: 'project', expectedRevision: 1, expectedViewRevision: 0, selectedLayerId: null, time: 0.5 },
    { viewSessionId: 'view', projectId: 'project', expectedRevision: 1, expectedViewRevision: 0, time: 31 },
    { viewSessionId: 'view', artifactId: 'artifact', offset: 0, length: 65536 }, { viewSessionId: 'view', artifactId: 'artifact', length: 262145 },
  ];
  for (const name of Object.keys(canonical)) {
    const expected = ajv.compile(canonical[name]), actual = ajv.compile(compact[name]);
    for (const sample of samples) assert.equal(actual(sample), expected(sample), `${name}: ${JSON.stringify(sample)?.slice(0, 180)}`);
  }
});

test('all shipped descriptors stay below the host page budget including annotations and real origin metadata', () => {
  const tools = createStudioWebMCPTools({ getGrant: () => null, view: { inspect: () => { throw new Error('No view access'); }, set: () => { throw new Error('No view mutation'); } } });
  const descriptors = tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations,
    origin: 'http://127.0.0.1:4317', pageUrl: 'http://127.0.0.1:4317/' }));
  assert.equal(descriptors.length, 67, 'Compaction must retain every public tool');
  for(const profile of ['authoring','workflow'] as const){
  const bytes = new TextEncoder().encode(JSON.stringify(toolsForProfile(descriptors,profile))).length;
  // The actual connected host has max_tools=100 and a 65,536-byte descriptor
  // cap. Origin/provenance above are included. Version 0.23 retains all tools,
  // validation and trust hints with 128 bytes reserve; real-host discovery is
  // additionally required for release because host metadata can change.
  assert(bytes <= 65536 - 128, `${bytes} bytes exceed the host budget with 128 bytes reserve`);
  assert(65536 - bytes >= 128, 'Keep the release below the host hard limit');
  }
  assert.equal(new Set([...toolsForProfile(tools,'authoring'),...toolsForProfile(tools,'workflow')].map(t=>t.name)).size,67,'Every tool is available without broadening grants');
});
