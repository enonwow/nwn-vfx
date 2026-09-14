import {WORKFLOW_OPERATIONS as workflowOperations} from '../../../packages/contracts/src/workflow-schema.js';
/** Pure schema construction shared by browser discovery and build-time compilation. */
export const WEBMCP_OPERATIONS = [
  ...workflowOperations,
  'version', 'doctor', 'capabilities', 'workspaces.list', 'operations.list', 'schema.get',
  'projects.list', 'projects.resolve', 'projects.inspect', 'projects.create', 'projects.fork', 'projects.export',
  'assets.import', 'assets.list', 'assets.get', 'assets.remove',
  'audio.import', 'audio.list', 'audio.get', 'audio.remove',
  'meshes.importObj.preview', 'meshes.importObj',
  'palette.preview', 'palette.apply',
  'native.test.status',
  'changes.preview', 'changes.apply', 'changes.revert', 'revisions.list', 'revisions.get', 'policy.inspect',
  'candidate.build', 'preview.request', 'preview.compose', 'jobs.list', 'jobs.get', 'jobs.cancel', 'artifacts.list', 'artifacts.get',
  'operations.get', 'operations.resolve', 'events.list', 'reviews.list', 'reviews.add',
] as const;
export type WebMCPToolProfile='authoring'|'workflow';
export function toolsForProfile<T extends {name:string}>(tools:T[],profile:WebMCPToolProfile):T[]{
  return tools.filter(t=>profile==='workflow'?!['studio.changes.apply','studio.changes.preview'].includes(t.name):!workflowOperations.map(n=>'studio.'+n).includes(t.name)&&!['studio.meshes.importObj','studio.meshes.importObj.preview'].includes(t.name));
}
const id = { type: 'string', pattern: '^[\\w-]{1,100}$' };
const integer = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, ...(required.length?{required}:{}), additionalProperties: false });

type SchemaNode = Record<string, any>;
/** Hoist repeated schema subtrees using local $defs references. This changes
 * representation only; property maps, literal values and array data are never
 * replaced by references. Both registration and standalone validators consume
 * the same compact schema. Inputs with existing resolution scopes stay intact.
 */
export function compactWebMCPInputSchema(source: object): object {
  let original = structuredClone(source) as SchemaNode;
  if (/"(?:\$id|\$ref|\$anchor|\$defs|definitions)"\s*:/u.test(JSON.stringify(original))) return original;
  function children(schema: SchemaNode, visit: (node: SchemaNode) => SchemaNode): SchemaNode {
    const result = { ...schema };
    for (const key of ['properties', 'patternProperties', 'dependentSchemas']) {
      if (schema[key] && typeof schema[key] === 'object' && !Array.isArray(schema[key]))
        result[key] = Object.fromEntries(Object.entries(schema[key]).map(([name, node]) => [name, node && typeof node === 'object' ? visit(node as SchemaNode) : node]));
    }
    for (const key of ['items', 'additionalItems', 'additionalProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else']) {
      if (Array.isArray(schema[key])) result[key] = schema[key].map((node: SchemaNode) => typeof node === 'object' && node ? visit(node) : node);
      else if (schema[key] && typeof schema[key] === 'object') result[key] = visit(schema[key]);
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems'])
      if (Array.isArray(schema[key])) result[key] = schema[key].map((node: SchemaNode) => typeof node === 'object' && node ? visit(node) : node);
    return result;
  }
  // Descriptions are annotations, not validation. Full text remains available
  // from schema.get; omit it in host registration without visiting const data.
  function concise(schema:SchemaNode):SchemaNode {const result=children(schema,concise);if(typeof result.description==='string')delete result.description;if(Array.isArray(result.required)&&result.required.length===0)delete result.required;return result;}
  original=concise(original);
  const counts = new Map<string, number>();
  // JSON object key order is immaterial to schemas. Match equivalent helper
  // output regardless of insertion order; arrays (including tuples) stay exact.
  const keyOf=(schema:SchemaNode)=>JSON.stringify(schema,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)
    ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
  function count(schema: SchemaNode): SchemaNode {
    const key = keyOf(schema);
    counts.set(key, (counts.get(key) ?? 0) + 1); children(schema, count); return schema;
  }
  count(original);
  const names = new Map<string, string>(), definitions: Record<string, SchemaNode> = {};
  function replace(schema: SchemaNode): SchemaNode {
    const key = keyOf(schema);
    // Consider frequent scalar schemas too; the cost pass retains only profitable references.
    if ((counts.get(key) ?? 0) < 2) return children(schema, replace);
    let name = names.get(key);
    if (!name) {
      name = names.size.toString(36); names.set(key, name);
      definitions[name] = children(schema, replace);
    }
    return { $ref: `#/$defs/${name}` };
  }
  let root = children(original, replace);
  // A subtree repeated solely inside an already-hoisted parent may now have
  // one use. Inline it again so nested deduplication does not add overhead.
  for (;;) {
    const uses = new Map<string, number>();
    function references(schema: SchemaNode): SchemaNode {
      if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/$defs/')) {
        const name = schema.$ref.slice('#/$defs/'.length); uses.set(name, (uses.get(name) ?? 0) + 1);
      }
      children(schema, references); return schema;
    }
    references(root); for (const schema of Object.values(definitions)) references(schema);
    const name = Object.keys(definitions).find(name => {
      const count=uses.get(name)??0,size=JSON.stringify(definitions[name]).length;
      const referenceSize=JSON.stringify({$ref:`#/$defs/${name}`}).length;
      // Hoisting a short schema used twice can cost more than keeping both
      // copies. Recompute actual savings after parent subtrees were hoisted.
      // The later anchor pass can place the definition directly at its first
      // occurrence. Account for that representation before pruning: otherwise
      // short repeated schemas are discarded just before their cheaper local
      // anchor form becomes available. Use a conservative two-character name.
      const anchorCost=JSON.stringify({$anchor:'aa'}).length-2;
      const anchoredReferenceSize=JSON.stringify({$ref:'#aa'}).length;
      const hoistedCost=Math.min(size+name.length+4+count*referenceSize,size+anchorCost+(count-1)*anchoredReferenceSize);
      return count<=1 || count*size<=hoistedCost;
    });
    if (!name) break;
    const replacement = definitions[name]; delete definitions[name];
    function inline(schema: SchemaNode): SchemaNode { return schema.$ref === `#/$defs/${name}` ? replacement : children(schema, inline); }
    root = inline(root); for (const key of Object.keys(definitions)) definitions[key] = inline(definitions[key]);
  }
  // Pruning leaves holes in the generated names. Renumber live definitions so
  // high-frequency references keep single-character names where possible.
  const liveNames=new Map(Object.keys(definitions).map((name,index)=>[name,index.toString(36)]));
  function rename(schema:SchemaNode):SchemaNode {
    if(typeof schema.$ref==='string'&&schema.$ref.startsWith('#/$defs/'))return {$ref:`#/$defs/${liveNames.get(schema.$ref.slice('#/$defs/'.length))}`};
    return children(schema,rename);
  }
  let compact:SchemaNode = liveNames.size ? { ...rename(root), $defs: Object.fromEntries(Object.entries(definitions).map(([name,schema])=>[liveNames.get(name)!,rename(schema)])) } : root;
  // Named JSON Schema anchors shorten frequently used local references. Keep
  // the normal $defs container; anchors are applied only when their added
  // declaration costs less than the repeated JSON Pointer suffixes they save.
  // Every input schema has its own resolution scope, so names never cross tools.
  if(compact.$defs){
    const uses=new Map<string,number>();
    function countRefs(schema:SchemaNode):SchemaNode {if(typeof schema.$ref==='string'&&schema.$ref.startsWith('#/$defs/')){const n=schema.$ref.slice(8);uses.set(n,(uses.get(n)??0)+1);}children(schema,countRefs);return schema;}
    countRefs(compact);for(const def of Object.values(compact.$defs))countRefs(def as SchemaNode);
    const anchors=new Map<string,string>();
    for(const name of Object.keys(compact.$defs)){
      const i=anchors.size,anchor=i<52?'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]:'a'+i;
      const saving=(uses.get(name)??0)*(('#/$defs/'+name).length-('#'+anchor).length);
      const inlineSaving=JSON.stringify({$ref:'#'+anchor}).length+name.length+4;
      if(saving+inlineSaving>JSON.stringify({$anchor:anchor}).length-1)anchors.set(name,anchor);
    }
    function anchored(schema:SchemaNode):SchemaNode {return typeof schema.$ref==='string'&&anchors.has(schema.$ref.slice(8))?{$ref:'#'+anchors.get(schema.$ref.slice(8))}:children(schema,anchored);}
    compact={...anchored(compact),$defs:Object.fromEntries(Object.entries(compact.$defs).map(([name,schema])=>[name,{...(anchors.has(name)?{$anchor:anchors.get(name)}:{}),...anchored(schema as SchemaNode)}]))};
    // An anchor can live on the first actual occurrence instead of in $defs.
    // Later occurrences keep referencing that same subschema. This removes a
    // redundant definition key and first $ref without weakening validation.
    for(const [name,anchor] of anchors){
      const definition=compact.$defs[name];let inserted=false;
      function first(schema:SchemaNode):SchemaNode {if(!inserted&&schema.$ref==='#'+anchor){inserted=true;return definition;}return children(schema,first);}
      compact=first(compact);
      for(const key of Object.keys(compact.$defs))if(key!==name)compact.$defs[key]=first(compact.$defs[key]);
      if(inserted)delete compact.$defs[name];
    }
    if(!Object.keys(compact.$defs).length)delete compact.$defs;
  }
  return JSON.stringify(compact).length < JSON.stringify(original).length ? compact : original;
}

export function webMCPInputSchemas(operations: Record<string, { inputSchema: object; mutates: boolean }>, options: { compact?: boolean } = {}): Record<string, object> {
  const schemas: Record<string, object> = {};
  for (const name of WEBMCP_OPERATIONS) {
    const definition = operations[name];
    schemas[`studio.${name}`] = object({ viewSessionId: id, input: definition.inputSchema,
      ...(definition.mutates ? { idempotencyKey: { type: 'string', minLength: 8, maxLength: 160 } } : {}) },['input',...(definition.mutates?['idempotencyKey']:[])]);
  }
  schemas['studio.connection.inspect'] = object({});
  schemas['studio.tools.select'] = object({viewSessionId:id,profile:{enum:['authoring','workflow']}},['profile']);
  schemas['studio.view.inspect'] = object({ viewSessionId: id },[]);
  schemas['studio.view.set'] = object({ viewSessionId: id, projectId: id, expectedRevision: integer(1, 2147483647),
    expectedViewRevision: integer(0, Number.MAX_SAFE_INTEGER), selectedLayerId: { anyOf: [id, { type: 'null' }] },
    time: { type: 'number', minimum: 0, maximum: 30 }, playing: { type: 'boolean' },loop:{type:'boolean'} },
  ['projectId', 'expectedRevision', 'expectedViewRevision']);
  schemas['studio.view.open'] = object({ viewSessionId: id, projectId: id, expectedViewRevision: integer(0, Number.MAX_SAFE_INTEGER) },['projectId','expectedViewRevision']);
  schemas['studio.artifacts.read'] = object({ viewSessionId: id, artifactId: id, offset: integer(0, 268435456), length: integer(1, 262144) }, ['artifactId']);
  return options.compact === false ? schemas : Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, compactWebMCPInputSchema(schema)]));
}
