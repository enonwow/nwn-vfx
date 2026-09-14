import {authoringSchema,previewConditionsSchema,WORKFLOW_SCHEMAS,workflowOutputSchema} from './workflow-schema.js';
import {BEAM_CAPABILITIES} from '../../core/src/beam.js';
import {COMPOSITION_CAPABILITIES,validateCompositionInput,type CompositionInput} from '../../core/src/composition.js';
import {LIFECYCLE_CAPABILITIES} from '../../core/src/lifecycle.js';
import Ajv from 'ajv';
import {FLIPBOOK_CAPABILITIES} from '../../core/src/flipbook.js';
import {AUDIO_CAPABILITIES,MAX_AUDIO_GAIN,MIN_AUDIO_GAIN_DB,MAX_AUDIO_GAIN_DB} from '../../core/src/audio.js';
import { PALETTE_CAPABILITIES, PALETTE_VERSION } from '../../core/src/palette.js';
import { assertPreviewCamera } from '../../core/src/camera.js';
import { EFFECT_LOCK_ID, EFFECT_INTEGRATION_CAPABILITIES, DomainError, CONTRACT_VERSION, STUDIO_VERSION, PROFILE_ID, DURATION_PROFILE_ID, BEAM_PROFILE_ID, assertDocumentInvariants } from '../../core/src/model.js';
import { TEXTURE_CAPABILITIES, PARTICLE_AGE_CAPABILITIES } from '../../core/src/textures.js';
import { EMITTER_ORIENTATION_CAPABILITIES } from '../../core/src/simulation.js';
import { NATIVE_WORKFLOW } from '../../core/src/native-workflow.js';
import { OBJ_IMPORT_CAPABILITIES, MESH_MATERIAL_CAPABILITIES } from '../../core/src/authoring-capabilities.js';
import { TRAIL_CAPABILITIES } from '../../core/src/trails.js';
import { MESH_SHADING_CAPABILITIES } from '../../core/src/shading.js';
import { MESH_DEFORMATION_CAPABILITIES } from '../../core/src/deformation.js';
import { DEFORMATION_INTERPOLATION_MODES } from '../../core/src/deformation-curve.js';
import { EXPORT_PROFILE_IDS, BINARY_PROFILE_ID, DURATION_BINARY_PROFILE_ID, BEAM_BINARY_PROFILE_ID, BINARY_COMPILER } from '../../core/src/export-profiles.js';
const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
const id = { type: 'string', pattern: '^[\\w-]{1,100}$' };
const text = { type: 'string', minLength: 1, maxLength: 160 };
const number = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum });
const integer = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: 'object', properties, ...(required.length?{required}:{}), additionalProperties: false });
const colorSchema={type:'string',pattern:'^#[0-9a-fA-F]{6}$'};
const textureRefSchema={type:'string',pattern:'^(spark|smoke|glow|beam-soft|asset:[a-f0-9]{64})$'};
const blendSchema={enum:['normal','additive']};
const assetIdSchema={type:'string',pattern:'^[a-f0-9]{64}$'};
const pngBase64Schema={type:'string',minLength:4,maxLength:2796204,description:'PNG RGBA8, 2 MiB.'};
const normalizationPngBase64Schema={type:'string',minLength:4,maxLength:11184812,description:'targetSize: explicit PNG resize; 8 MiB input, 2 MiB stored.'};
const fileNameSchema={type:'string',minLength:1,maxLength:160,pattern:'^[^\\\\/:\\u0000-\\u001f\\u007f]+$'};
const textureNormalizationSchema=obj({version:{const:1},method:{enum:['area','bilinear']},colorSpace:{const:'linear-srgb'},alphaMode:{const:'premultiplied'},
  originalSha256:assetIdSchema,originalWidth:integer(1,4096),originalHeight:integer(1,4096),originalColorType:{enum:[2,6]},targetSize:{enum:[512,1024]},
  contentWidth:integer(1,1024),contentHeight:integer(1,1024),offsetX:integer(0,1023),offsetY:integer(0,1023)});
const textureAssetProperties={id:assetIdSchema,name:fileNameSchema,mime:{const:'image/png'},width:{enum:[8,16,32,64,128,256,512,1024]},height:{enum:[8,16,32,64,128,256,512,1024]},
  pngBase64:pngBase64Schema,source:obj({fileName:fileNameSchema,sha256:assetIdSchema,normalization:textureNormalizationSchema},['fileName','sha256'])};
export const textureAssetSchema=obj(textureAssetProperties);
export const textureAssetMetadataSchema=obj(Object.fromEntries(Object.entries(textureAssetProperties).filter(([key])=>key!=='pngBase64')));
const audioBase64Schema={type:'string',minLength:4,maxLength:2796204};
const audioDecodedProperties={codec:{const:'pcm-s16le'},sampleRate:integer(8000,48000),channels:{enum:[1,2]},frames:integer(1,1440000),sha256:assetIdSchema,decoder:text};
const audioAssetProperties={id:assetIdSchema,name:fileNameSchema,mime:{enum:['audio/wav','audio/mpeg']},dataBase64:audioBase64Schema,
  source:obj({fileName:fileNameSchema,sha256:assetIdSchema,bytes:integer(1,2097152)}),
  decoded:obj({...audioDecodedProperties,pcmBase64:{type:'string',minLength:4,maxLength:7680000}}),duration:number(1/48000,30),
  waveform:{type:'array',minItems:128,maxItems:128,items:number(0,1)}};
export const audioAssetSchema=obj(audioAssetProperties);
const audioMetadataSchema=obj({...Object.fromEntries(Object.entries(audioAssetProperties).filter(([k])=>k!=='dataBase64')),decoded:obj(audioDecodedProperties)});
const audioClipProperties={id,type:{const:'audio'},name:text,assetId:assetIdSchema,enabled:{type:'boolean'},start:number(0,30),duration:number(.001,30),offset:number(0,30),gain:number(0,MAX_AUDIO_GAIN),fadeIn:number(0,2),fadeOut:number(0,2)};
export const audioClipSchema=obj(audioClipProperties);
const audioInputProperties={...audioClipProperties,gainDb:{...number(MIN_AUDIO_GAIN_DB,MAX_AUDIO_GAIN_DB),description:'dB; exclusive with gain. Mute: gain=0. Requires Studio 0.18.0.'}};
const audioClipInputSchema={...obj(audioInputProperties,Object.keys(audioClipProperties).filter(k=>k!=='gain')),oneOf:[{required:['gain']},{required:['gainDb']}]};
const audioValuesSchema={...obj(Object.fromEntries(Object.entries(audioInputProperties).filter(([k])=>!['id','type'].includes(k))),[]),minProperties:1,not:{required:['gain','gainDb']}};
const layerProperties = {
  id, name: text, type: { enum: ['emitter', 'ribbon', 'light'] }, enabled: { type: 'boolean' },
  color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, endColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  alpha: number(0, 1), endAlpha: number(0, 1), size: number(.001, 5), endSize: number(0, 5),
  count: integer(1, 2000), life: number(.01, 10), speed: number(0, 20), spread: number(0, 3.141593),
  gravity: number(-20, 20), start: number(0, 30), duration: number(.01, 10),
  position: { type: 'array', items: number(-20, 20), minItems: 3, maxItems: 3 },
  scale: number(.01, 10), seed: integer(0, 2147483647), texture: { enum: ['spark', 'smoke', 'glow'] },
  update: { enum: ['Explosion', 'Fountain'] },
};
const legacyEmitterLayerSchema=obj(layerProperties);
const particleProperties={blend:blendSchema,midColor:colorSchema,midAlpha:number(0,1),midSize:number(0,5),midPercent:number(.01,.99)};
const modernEmitterProperties={...layerProperties,texture:textureRefSchema,...particleProperties};
const boundedVec3 = (min: number, max: number) => ({ type: 'array', items: number(min,max), minItems: 3, maxItems: 3 });
const orientation = { type: 'array', items: number(-8*Math.PI,8*Math.PI), minItems: 4, maxItems: 4 };
export const flipbookSchema=obj({columns:{enum:[1,2,4,8,16]},rows:{enum:[1,2,4,8,16]},frameStart:integer(0,254),frameEnd:integer(1,255),fps:integer(1,60)});
export const beamBindingSchema=obj({role:{enum:['flow','source','target']},source:boundedVec3(-20,20),target:boundedVec3(-20,20),direction:{enum:['source-to-target','target-to-source']},pulse:obj({period:number(.05,3),duty:number(.05,.95)}),node:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,31}$'}},['role','source','target','direction']);
const orientedEmitterProperties={beamBinding:beamBindingSchema,flipbook:flipbookSchema,...modernEmitterProperties,orientation:{...orientation,description:'Unit-axis/radians; local +Z, gravity world-Z.'}};
const meshTrack = (value: object) => ({ type: 'array', maxItems: 64, items: obj({time:number(0,30),value}) });
const legacyMeshGeometrySchema = { oneOf: [
  obj({kind:{const:'box'},dimensions:boundedVec3(.001,20)}),
  obj({kind:{const:'ring'},innerRadius:number(0,10),outerRadius:number(.001,10),segments:integer(8,128)}),
  obj({kind:{const:'custom'},vertices:{type:'array',minItems:3,maxItems:2048,items:boundedVec3(-20,20)},
    faces:{type:'array',minItems:1,maxItems:4096,items:{type:'array',minItems:3,maxItems:3,items:integer(0,2047)}}}),
] };
export const meshGeometrySchema={oneOf:[...legacyMeshGeometrySchema.oneOf.slice(0,2),
  obj({kind:{const:'custom'},vertices:{type:'array',minItems:3,maxItems:2048,items:boundedVec3(-20,20)},
    faces:{type:'array',minItems:1,maxItems:4096,items:{type:'array',minItems:3,maxItems:3,items:integer(0,2047)}},
    uv:{type:'array',minItems:3,maxItems:8192,items:{type:'array',minItems:2,maxItems:2,items:number(0,1)}},
    uvFaces:{type:'array',minItems:1,maxItems:4096,items:{type:'array',minItems:3,maxItems:3,items:integer(0,8191)}}},['kind','vertices','faces'])]};
const legacyMeshAnimationSchema = obj({position:meshTrack(boundedVec3(-20,20)),orientation:meshTrack(orientation),scale:meshTrack(number(.01,10)),alpha:meshTrack(number(0,1))},[]);
export const meshAnimationSchema = obj({...legacyMeshAnimationSchema.properties,
  vertices:{...meshTrack({type:'array',minItems:3,maxItems:2048,items:boundedVec3(-20,20)}),minItems:1,
    description:'Local Z-up metres; fixed topology; 60 Hz.'}},[]);
const meshProperties = {id,name:text,type:{const:'mesh'},enabled:{type:'boolean'},color:layerProperties.color,alpha:number(0,1),
  start:number(0,30),duration:number(.01,30),position:boundedVec3(-20,20),orientation,scale:number(.01,10),geometry:meshGeometrySchema,animation:meshAnimationSchema};
const legacyMeshLayerSchema=obj({...meshProperties,geometry:legacyMeshGeometrySchema,animation:legacyMeshAnimationSchema});
const schema3MeshProperties={...meshProperties,texture:{anyOf:[textureRefSchema,{type:'null'}]},blend:blendSchema};
export const meshMaterialSchema=obj({diffuse:colorSchema,selfIllumination:colorSchema});
const schema7MeshProperties={...schema3MeshProperties,material:meshMaterialSchema};
const deformationInterpolationSchema={enum:DEFORMATION_INTERPOLATION_MODES};
const modernMeshProperties={...schema7MeshProperties,deformationInterpolation:deformationInterpolationSchema,shading:{enum:['flat','smooth'],description:'Smooth: custom; static MDL normals.'}};
const schema3MeshLayerSchema=obj({...schema3MeshProperties,animation:legacyMeshAnimationSchema},Object.keys(meshProperties));
const schema3EmitterLayerSchema=obj(modernEmitterProperties,Object.keys(layerProperties));
export const emitterLayerSchema = obj(orientedEmitterProperties,Object.keys(layerProperties));
export const meshLayerSchema = obj(modernMeshProperties,Object.keys(meshProperties));
const schema7MeshLayerSchema = obj(schema7MeshProperties,Object.keys(meshProperties));
const schema5MeshLayerSchema = obj({...schema7MeshProperties,animation:legacyMeshAnimationSchema},Object.keys(meshProperties));
const trailOnlyProperties={path:{type:'array',minItems:2,maxItems:64,items:obj({time:number(0,30),position:boundedVec3(-20,20)})},
  width:number(.001,.2),tailLifetime:number(.05,10),profile:{const:'soft'},glowStrength:number(0,.3),head:obj({enabled:{type:'boolean'},size:number(.001,.2)}),maxSegmentLength:number(.005,1)};
export const trailLayerSchema=obj({id,name:text,type:{const:'trail'},enabled:{type:'boolean'},color:colorSchema,alpha:number(0,1),start:number(0,30),duration:number(.05,30),blend:{const:'additive'},...trailOnlyProperties});
export const beamMotionSchema=obj({phase:{enum:['flow','opening','closing']},direction:{enum:['source-to-target','target-to-source']},fps:integer(1,60),pulseWidth:number(.02,1),fit:{enum:['source','alpha-bounds']}});
const beamMotionSummary={type:'array',maxItems:8,items:obj({layerId:id,encoding:{const:'linked-rgba-atlas-v1'},settings:beamMotionSchema,frameCount:{const:16},fps:integer(1,60),cycleSeconds:number(16/60,16),finalFrameStartSeconds:number(.25,15),transitionWindowSeconds:{type:'array',items:number(.25,16),minItems:2,maxItems:2},repeat:{const:true},automaticStop:{const:false},scheduling:{const:'consumer-switches-during-final-frame'},nativeCadenceVerified:{const:false}})};
const beamProperties={id,name:text,type:{const:'beam'},enabled:{type:'boolean'},color:colorSchema,alpha:number(0,1),width:number(.001,.5),texture:textureRefSchema,blend:blendSchema,
 materialMotion:obj({mode:{const:'periodic-pan'},direction:{enum:['source-to-target','target-to-source']},fps:integer(1,30)}),textureMapping:obj({axis:{enum:['u','v']},fit:{enum:['source','alpha-bounds']}}),nativeMotion:beamMotionSchema,source:boundedVec3(-20,20),target:boundedVec3(-20,20),radius:number(0,1),delay:number(0,1),lightningScale:number(0,1),segments:{enum:[2,4,8,16,32,64]},seed:integer(0,2147483647),flow:obj({direction:{enum:['source-to-target','target-to-source']},speed:number(0,10)})};
export const beamLayerSchema=obj(beamProperties,Object.keys(beamProperties).filter(k=>!['nativeMotion','materialMotion','textureMapping'].includes(k)));
export const layerSchema = { oneOf: [emitterLayerSchema,meshLayerSchema,trailLayerSchema,beamLayerSchema] };
const lifecycleSchema={enum:['impact','duration','beam']};
const effectLock = obj({layerId:{const:EFFECT_LOCK_ID},field:{enum:['orientWithObject','lifecycle','authoring','*']}});
const locks = { type: 'array', maxItems: 256, items: {oneOf:[effectLock,obj({ layerId: id, field: { enum: ['*', ...new Set([...Object.keys(audioClipProperties),...Object.keys(orientedEmitterProperties),...Object.keys(modernMeshProperties),...Object.keys(trailOnlyProperties),...Object.keys(beamProperties)].filter(k => k !== 'id' && k !== 'type'))] } })]} };
export const documentSchema = { ...obj({ schemaVersion: { enum: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24] }, name: text, duration: number(.1, 30),
  authoring:authoringSchema, seed: integer(0, 2147483647), orientWithObject:{type:'boolean'}, lifecycle:lifecycleSchema, profileId: { enum: [PROFILE_ID,DURATION_PROFILE_ID,BEAM_PROFILE_ID] },
  layers: { type: 'array', minItems: 1, maxItems: 32, items: layerSchema }, locks,assets:{type:'array',maxItems:8,items:textureAssetSchema},
  audioAssets:{type:'array',maxItems:8,items:audioAssetSchema},audioClips:{type:'array',maxItems:32,items:audioClipSchema} },['schemaVersion','name','duration','seed','profileId','layers','locks']),
  allOf:[{if:{properties:{schemaVersion:{maximum:22}}},then:{properties:{layers:{items:{not:{required:['materialMotion']}}},locks:{items:{not:{properties:{field:{const:'materialMotion'}}}}}}}},{if:{properties:{schemaVersion:{maximum:18}}},then:{properties:{layers:{items:{not:{required:['beamBinding']}}},locks:{items:{not:{properties:{field:{const:'beamBinding'}}}}}}}},{if:{properties:{schemaVersion:{maximum:17}}},then:{properties:{layers:{items:{not:{required:['textureMapping']}}},locks:{items:{not:{properties:{field:{const:'textureMapping'}}}}}}}},{if:{properties:{schemaVersion:{maximum:16}}},then:{properties:{layers:{items:{not:{required:['nativeMotion']}}},locks:{items:{not:{properties:{field:{const:'nativeMotion'}}}}}}}}, {if:{properties:{schemaVersion:{maximum:15}}},then:{properties:{lifecycle:{enum:['impact','duration']},profileId:{enum:[PROFILE_ID,DURATION_PROFILE_ID,BEAM_PROFILE_ID]},layers:{items:{not:{properties:{type:{const:'beam'}}}}}}}}, {if:{properties:{schemaVersion:{maximum:13}}},then:{properties:{layers:{items:{not:{required:['deformationInterpolation']}}},locks:{items:{not:{properties:{field:{const:'deformationInterpolation'}}}}}}}},
    {if:{properties:{schemaVersion:{maximum:12}}},then:{not:{required:['lifecycle']},properties:{profileId:{const:PROFILE_ID},locks:{items:{not:{properties:{layerId:{const:EFFECT_LOCK_ID},field:{const:'lifecycle'}}}}}}}},
    {if:{properties:{schemaVersion:{maximum:11}}},then:{properties:{layers:{items:{not:{required:['flipbook']}}},locks:{items:{not:{properties:{field:{const:'flipbook'}}}}}}}},
    {if:{properties:{schemaVersion:{maximum:10}}},then:{not:{required:['orientWithObject']},properties:{locks:{items:{not:effectLock}}}}},
    {if:{properties:{schemaVersion:{const:9}}},then:{properties:{audioClips:{items:{properties:{gain:number(0,4)}}}}}},
    {if:{properties:{schemaVersion:{maximum:8}}},then:{not:{anyOf:[{required:['audioAssets']},{required:['audioClips']}]}}},
    {if:{properties:{schemaVersion:{const:1}}},then:{not:{required:['assets']},properties:{layers:{items:legacyEmitterLayerSchema}}}},
    {if:{properties:{schemaVersion:{const:2}}},then:{not:{required:['assets']},properties:{layers:{items:{oneOf:[legacyEmitterLayerSchema,legacyMeshLayerSchema]}}}}},
    {if:{properties:{schemaVersion:{const:3}}},then:{properties:{layers:{items:{oneOf:[schema3EmitterLayerSchema,schema3MeshLayerSchema]}}}}},
    {if:{properties:{schemaVersion:{const:4}}},then:{properties:{layers:{items:{oneOf:[emitterLayerSchema,schema3MeshLayerSchema]}}}}},
    {if:{properties:{schemaVersion:{const:5}}},then:{properties:{layers:{items:{oneOf:[emitterLayerSchema,schema5MeshLayerSchema]}}}}},
    {if:{properties:{schemaVersion:{const:6}}},then:{properties:{layers:{items:{oneOf:[emitterLayerSchema,schema5MeshLayerSchema,trailLayerSchema]}}}}},
    {if:{properties:{schemaVersion:{const:7}}},then:{properties:{layers:{items:{oneOf:[emitterLayerSchema,schema7MeshLayerSchema,trailLayerSchema]}}}}}] };
const editableProperties = Object.fromEntries(Object.entries({...orientedEmitterProperties,...modernMeshProperties,...trailOnlyProperties,...Object.fromEntries(Object.entries(beamProperties).filter(([key])=>!["id","type","name","enabled","color","alpha","texture","blend","seed"].includes(key)))}).filter(([key]) => !['id', 'type'].includes(key)).map(([key,value])=>
  [key,key==='orientation'?{anyOf:[orientedEmitterProperties.orientation,{type:'null'}],description:'Null: emitter only.'}
    :['blend','midColor','midAlpha','midSize','midPercent','material','shading','flipbook','deformationInterpolation','nativeMotion','materialMotion','textureMapping','beamBinding'].includes(key)?{anyOf:[value,{type:'null'}]}:value]));
export const changesSchema = { type: 'array', minItems: 1, maxItems: 64, items: { oneOf: [
  obj({type:{const:'audio.add'},clip:audioClipInputSchema}),
  obj({type:{const:'audio.set'},clipId:id,values:audioValuesSchema}),
  obj({type:{const:'audio.remove'},clipId:id}),
  obj({ type: { const: 'layer.set' }, layerId: id, values: { ...obj(editableProperties, []), minProperties: 1 } }),
  obj({ type: { const: 'layer.add' }, layer: layerSchema }),
  obj({ type: { const: 'layer.remove' }, layerId: id }),
  obj({ type: { const: 'layer.move' }, layerId: id, index: integer(0, 31) }),
  obj({ type: { const: 'project.set' }, values: { ...obj({ name: text, duration: number(.1, 30), authoring:authoringSchema, seed: integer(0, 2147483647), orientWithObject:{type:'boolean'}, lifecycle:lifecycleSchema }, []), minProperties: 1 } }),
  obj({ type: { const: 'locks.set' }, locks }),
] } };
export const validateDocument = ajv.compile(documentSchema);
export const validateChanges = ajv.compile(changesSchema);
export const validateCommand = ajv.compile(obj({ operation: { type: 'string', minLength: 1, maxLength: 80 }, input: { type: 'object' },
  idempotencyKey: { type: 'string', minLength: 8, maxLength: 160 }, contractVersion: { type: 'string', maxLength: 32 }, workspaceId: id }, ['operation', 'input']));
export const validateResult = ajv.compile({ type: 'object', required: ['contractVersion', 'requestId', 'status', 'diagnostics'],
  properties: { contractVersion: { const: CONTRACT_VERSION }, requestId: { type: 'string' }, operationId: { type: 'string' },
    status: { enum: ['ok', 'accepted', 'failed'] }, data: {}, diagnostics: { type: 'array' },
    error: { type: 'object', required: ['code', 'message', 'retryable'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {}, retryable: { type: 'boolean' } }, additionalProperties: false } },
  additionalProperties: false,
  allOf: [
    { if: { properties: { status: { const: 'failed' } } }, then: { required: ['error'] }, else: { required: ['data'] } }],
});
const paging = { limit: integer(1, 100), cursor: { type: 'string', maxLength: 100 } };
const revision = integer(1, 2147483647);
const projectInput = { projectId: id };
export const operationSchemas: Record<string, { description: string; inputSchema: object; outputSchema: object; mutates: boolean }> = {};
function op(name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = Object.keys(properties), mutates = false) {
  // Results are installed below only after all input contracts are known.
  operationSchemas[name] = { description, inputSchema: obj(properties, required), outputSchema: { not: {} }, mutates };
}
op('doctor', 'Sprawdź instancję, dostęp i możliwości.');
op('version', 'Wersja usługi i kontraktu.');
op('capabilities', 'Obsługiwane możliwości profilu.', { profileId: id }, []);
op('workspaces.list', 'Dostępne przestrzenie Studio.');
op('operations.list', 'Katalog operacji.');
op('schema.get', 'Schemat wejścia i wyniku.', { operation: { type: 'string' } });
op('projects.list', 'Lista dostępnych projektów.', paging, []);
op('projects.resolve', 'Znajdź jednoznaczne ID projektu.', { name: text });
op('projects.inspect', 'Odczytaj projekt i rewizję.', { ...projectInput, revision }, ['projectId']);
op('projects.create', 'Utwórz projekt; empty + duration zaczyna od siatki.', { projectId: id, name: text, lifecycle:lifecycleSchema, preset: { enum: ['coil', 'vial', 'empty'] } }, [], true);
op('projects.fork', 'Utwórz wariant projektu.', { ...projectInput, revision, name: text, newProjectId: id }, ['projectId'], true);
op('projects.import', 'Importuj dokument Studio jako nowy projekt.', { document: documentSchema, bundleBase64: { type: 'string', maxLength: 12000000 }, projectId: id }, [], true);
op('projects.export', 'Zbuduj przenośny projekt.', { ...projectInput, revision }, ['projectId', 'revision'], true);
op('audio.import','Importuj WAV PCM16 lub MP3. Zachowaj oryginalne bajty; zapisz jawny PCM odsłuchu i waveform.',{...projectInput,expectedRevision:revision,fileName:fileNameSchema,dataBase64:audioBase64Schema},undefined,true);
op('audio.list','Metadane audio konkretnej rewizji.',{...projectInput,revision},['projectId']);
op('audio.get','Oryginalne audio i zdekodowany PCM w konkretnej rewizji.',{...projectInput,revision,assetId:assetIdSchema},['projectId','assetId']);
op('audio.remove','Usuń tylko jawnie wskazane nieużywane zasoby audio.',{...projectInput,expectedRevision:revision,assetIds:{type:'array',minItems:1,maxItems:8,uniqueItems:true,items:assetIdSchema}},undefined,true);
op('assets.import','Importuj PNG RGBA8 bez zmiany bajtów lub jawnie dopasuj RGB8/RGBA8 do 512/1024 z zachowaniem proporcji.',{...projectInput,expectedRevision:revision,fileName:fileNameSchema,pngBase64:normalizationPngBase64Schema,targetSize:{enum:[512,1024]}},['projectId','expectedRevision','fileName','pngBase64'],true);
operationSchemas['assets.import'].inputSchema={...operationSchemas['assets.import'].inputSchema,allOf:[{
  if:{required:['targetSize']},then:{properties:{pngBase64:normalizationPngBase64Schema}},else:{properties:{pngBase64:pngBase64Schema}},
}]};
op('assets.list','Odczytaj metadane tekstur konkretnej rewizji.',{...projectInput,revision},['projectId']);
op('assets.get','Odczytaj teksturę wraz z zapisanymi bajtami PNG i metadanymi pochodzenia.',{...projectInput,revision,assetId:assetIdSchema},['projectId','assetId']);
op('assets.remove','Usuń z bieżącej rewizji tylko jawnie wskazane, nieużywane tekstury. Zachowaj historyczne rewizje.',{
  ...projectInput,expectedRevision:revision,assetIds:{type:'array',minItems:1,maxItems:8,uniqueItems:true,items:assetIdSchema}},undefined,true);
const objTransformSchema=obj({translation:boundedVec3(-20,20),orientation,scale:number(.01,10)});
const objImportProperties={...projectInput,expectedRevision:revision,fileName:fileNameSchema,
  objText:{type:'string',minLength:1,maxLength:1048576,description:'Triangulated OBJ UTF-8, 1 MiB; no path reads.'},
  sourceUpAxis:{enum:['y','z']},metersPerUnit:{type:'number',exclusiveMinimum:0},normalMode:{const:'flat'},transform:objTransformSchema,
  target:{oneOf:[obj({layerId:id}),obj({newLayer:obj(Object.fromEntries(Object.entries(modernMeshProperties).filter(([key])=>key!=='geometry')),Object.keys(meshProperties).filter(key=>key!=='geometry'))})]},
  textureAssetId:assetIdSchema};
const objImportRequired=['projectId','expectedRevision','fileName','objText','sourceUpAxis','metersPerUnit','normalMode','target'];
op('meshes.importObj.preview','Sprawdź import OBJ do wskazanej warstwy bez zapisu; zwróć dokument, różnice i jawny raport konwersji.',objImportProperties,objImportRequired);
op('meshes.importObj','Importuj OBJ do istniejącej albo jawnie nowej warstwy. Zachowaj timing, animację i pozostałe ustawienia istniejącej warstwy.',objImportProperties,objImportRequired,true);
op('changes.preview', 'Sprawdź propozycję i różnice bez zapisu.', { ...projectInput, expectedRevision: revision, changes: changesSchema });
export const paletteOptionsSchema=obj({from:colorSchema,to:colorSchema,
  scope:obj({layerIds:{oneOf:[{const:'all'},{type:'array',items:id,minItems:1,maxItems:32,uniqueItems:true}]},
    excludeLayerIds:{type:'array',items:id,maxItems:32,uniqueItems:true},includeDisabled:{type:'boolean'}}),textureMode:{enum:['preserve','transform']}});
const paletteInput={...projectInput,expectedRevision:revision,options:paletteOptionsSchema};
op('palette.preview','Podgląd przesunięcia odcienia całego efektu lub wskazanych warstw, bez zapisu. PNG transform wymaga neutralnych mnożników.',paletteInput);
op('palette.apply','Zatwierdź dokładny podgląd palety atomowo; proposalHash z palette.preview, blokady i pauza AI obowiązują.',{...paletteInput,proposalHash:assetIdSchema},undefined,true);
op('changes.apply', 'Zatwierdź propozycję jako nową rewizję.', { ...projectInput, expectedRevision: revision, changes: changesSchema }, undefined, true);
op('changes.revert', 'Cofnij jedną niezależną operację.', { ...projectInput, expectedRevision: revision, operationId: id }, undefined, true);
op('revisions.list', 'Historia projektu.', { ...projectInput, ...paging }, ['projectId']);
op('revisions.get', 'Odczytaj konkretną rewizję.', { ...projectInput, revision });
op('revisions.restore', 'Odtwórz rewizję jako nową zmianę.', { ...projectInput, expectedRevision: revision, revision }, undefined, true);
op('policy.inspect', 'Sprawdź kontrolę zapisów AI.', projectInput);
op('policy.set', 'Wstrzymaj lub wznów zapisy AI.', { ...projectInput, paused: { type: 'boolean' } }, undefined, true);
op('actors.list', 'Lista autoryzowanych klientów.');
op('actors.create', 'Utwórz poświadczenie klienta o wskazanym zakresie.', { name: text, projectIds: { type: 'array', items: id, maxItems: 100 }, scopes: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 20 } }, undefined, true);
op('actors.revoke', 'Odbierz poświadczenie klienta.', { actorId: id }, undefined, true);
op('candidate.build', 'Zbuduj zasoby NWN dla konkretnej rewizji.', { ...projectInput, revision, profileId: id, modelName: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,15}$' } }, ['projectId', 'revision'], true);
const previewCameraSchema = { ...obj({ position: boundedVec3(-100,100), target: boundedVec3(-100,100), fov: number(10,120) }),
  description: 'Metres, Z-up, vertical FOV degrees; fixed across frames.' };
const compositionInstanceSchema=obj({id,projectId:id,revision,start:number(0,30),position:boundedVec3(-50,50),yawRadians:number(-8*Math.PI,8*Math.PI),scale:number(.01,10),duration:number(.1,30),snapshotSha256:assetIdSchema},['id','projectId','revision','start','position','yawRadians']);
op('preview.compose','Render exact source instances in one scene.',{instances:{type:'array',items:compositionInstanceSchema,maxItems:24,minItems:1},duration:number(.1,30),time:number(0,30),format:{enum:['png','webm']},camera:previewCameraSchema,referenceGeometry:{type:'boolean'}},['instances','duration'],true);
op('preview.request', 'Wyrenderuj rewizję bez aktywnej karty.', { ...projectInput, revision, time: number(0, 30), cycles:integer(1,10), conditions:previewConditionsSchema, format: { enum: ['png', 'webm'] }, camera: previewCameraSchema }, ['projectId', 'revision'], true);
op('jobs.list', 'Odczytaj zadania projektu.', { ...projectInput, ...paging }, ['projectId']);
op('jobs.get', 'Stan i wyniki zadania.', { jobId: id });
op('jobs.cancel', 'Zażądaj anulowania zadania.', { jobId: id }, undefined, true);
op('artifacts.list', 'Artefakty projektu.', { ...projectInput, ...paging }, ['projectId']);
op('artifacts.get', 'Metadane artefaktu.', { artifactId: id });
op('operations.get', 'Odzyskaj wynik operacji.', { operationId: id });
op('operations.resolve', 'Odzyskaj wynik po kluczu idempotencji.', { idempotencyKey: { type: 'string' }, operation: { type: 'string' }, projectId: id }, ['idempotencyKey', 'operation']);
op('events.list', 'Odbierz zmiany po kursorze.', { ...projectInput, cursor: integer(0, 2147483647), limit: integer(1, 100) }, ['projectId']);
op('reviews.list', 'Uwagi do projektu.', projectInput);
op('reviews.add', 'Dodaj uwagę do konkretnej rewizji.', { ...projectInput, revision, text: { type: 'string', minLength: 1, maxLength: 2000 }, verdict: { enum: ['note', 'approved', 'needs-work'] } }, ['projectId', 'revision', 'text'], true);
op('native.test.request', 'Test natywny wymaga skonfigurowanego kwalifikowanego runnera.', { candidateId: id, profileId: id }, undefined, true);
op('native.test.status', 'Odczytaj gotowość kandydata i brakujące zależności kwalifikowanego testu NWN.', { candidateId: id });

// These are the schemas returned by discovery AND compiled by the dispatcher.
// Closed DTOs deliberately make an unannounced result change a release decision.
const ref = (name: string) => ({ $ref: '#/definitions/' + name });
const array = (items: object, maximum = 10000) => ({ type: 'array', items, maxItems: maximum });
const boolean = { type: 'boolean' };
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const timestamp = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' };
const sha256 = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const message = { type: 'string', minLength: 1, maxLength: 8000 };
const operationName = { type: 'string', minLength: 1, maxLength: 80 };
const vec3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const keyframes = array({ type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, 10000);
const jobStatus = { enum: ['queued', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled', 'blocked'] };
const projectProperties = { id, revision, document: documentSchema, createdAt: timestamp, updatedAt: timestamp, parentId: id };
const projectRequired = ['id', 'revision', 'document', 'createdAt', 'updatedAt'];
const actorProperties = { id, name: text, kind: { enum: ['owner', 'agent'] }, scopes: array({ type: 'string', minLength: 1, maxLength: 50 }, 32), projectIds: array({ anyOf: [id, { const: '*' }] }, 1000), revoked: boolean };
const artifactProperties = { id, artifactId: id, projectId: id, jobId: id, name: { type: 'string', pattern: '^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,100}$' },
  fileName: { type: 'string', pattern: '^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,100}$' }, mime: { type: 'string', minLength: 3, maxLength: 120 },
  size: integer(0, 268435456), sha256, hash: obj({ algorithm: { const: 'sha256' }, value: sha256 }), downloadUrl: { type: 'string', pattern: '^/api/artifacts/[a-zA-Z0-9_-]+$' } };
const paged = (item: object) => obj({ items: array(item, 100), nextCursor: nullable({ type: 'string', minLength: 1, maxLength: 100 }) });
const review = obj({ id, projectId: id, revision, text: { type: 'string', minLength: 1, maxLength: 2000 }, verdict: { enum: ['note', 'approved', 'needs-work'] }, actorId: id, actorKind: { enum: ['owner', 'agent'] }, createdAt: timestamp });
const diagnostic = obj({ code: operationName, severity: { enum: ['info', 'warning'] }, message, layerId: id }, ['code', 'severity', 'message']);
const scalarNativeFields = Object.fromEntries(['alphaStart', 'alphaEnd', 'alphaMid', 'sizeStart', 'sizeEnd', 'sizeMid', 'lifeExp', 'mass', 'spread', 'velocity'].map(key => [key, { type: 'number' }]));
const nativeKeys = (components: number) => array({type:'array',minItems:components,maxItems:components,items:{type:'number'}},256);
const deformationNormals=obj({method:{const:'recomputed-from-interpolated-60Hz-positions'},source:{const:'derived-from-position-samples'},
  frameSets:integer(2,1801),cornerSamples:integer(1,24_000_000),frameNormalHashesSha256:sha256});
const deformationInterpolationReport=obj({mode:deformationInterpolationSchema,boundary:{enum:['hold','clamped','periodic']},curveContinuity:{enum:['C0','C1']},sampledContinuity:{const:'C0'},errorMethod:{enum:['exact-linear-knots','curvature-bound']}});
const meshReadback = obj({layerId:id,node:text,parent:text,geometryKind:{enum:['box','ring','custom']},vertices:array(vec3,2048),
  faces:array({type:'array',minItems:3,maxItems:3,items:integer(0,2047)},4096),position:vec3,
  orientation:{type:'array',minItems:4,maxItems:4,items:{type:'number'}},scale:number(.01,10),color:vec3,diffuse:vec3,selfIllumination:vec3,alpha:number(0,1),
  positionKeys:nativeKeys(4),orientationKeys:nativeKeys(5),scaleKeys:keyframes,alphaKeys:keyframes,
  uv:array({type:'array',minItems:2,maxItems:2,items:number(0,1)},8192),uvFaces:array({type:'array',minItems:3,maxItems:3,items:integer(0,8191)},4096),texture:nullable(text),blend:blendSchema,
  shading:obj({mode:{enum:['flat','smooth']},smoothingMask:{enum:[0,1]},normalRule:{const:'area-weighted-by-shared-vertex-index'},cornerNormalsSha256:sha256,
    deformationNormals,exportedAnimatedNormals:{const:false}},['mode','smoothingMask','normalRule','cornerNormalsSha256']),
  deformation:obj({frameSets:integer(2,1801),samplePeriod:number(.001,1),vertexSamples:integer(1,1_000_000),uvSamples:integer(1,1_000_000),animvertsSha256:sha256,animtvertsSha256:sha256,allSamplesRead:{const:true},maxDeviationMetres:number(0,100),interpolation:deformationInterpolationReport},['frameSets','samplePeriod','vertexSamples','uvSamples','animvertsSha256','animtvertsSha256','allSamplesRead','maxDeviationMetres']),
  visibilityRampSeconds:obj({start:number(0,.001),end:number(0,.001)})},['layerId','node','parent','geometryKind','vertices','faces','position','orientation','scale','color','alpha','positionKeys','orientationKeys','scaleKeys','alphaKeys','visibilityRampSeconds']);
const candidateValidation = { ...obj({
  formatVersion: { const: 1 }, exporterVersion: text, profileId: { enum: EXPORT_PROFILE_IDS }, modelName: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,15}$' },
  // The first 0.10.0 receipts mislabelled the source-reference commit as the
  // compiler build commit. Preserve those immutable receipts; new builds use
  // the verified local build identity (the executable hash is unchanged).
  compilation: obj({compiler:obj({name:{const:BINARY_COMPILER.name},sha256:{const:BINARY_COMPILER.sha256},platform:{const:BINARY_COMPILER.platform},sourceCommit:{enum:[BINARY_COMPILER.sourceCommit,'3660b18459c2c762806bc0f00458fc590b376ca9']}}),sourceProfileId:{enum:[PROFILE_ID,DURATION_PROFILE_ID,BEAM_PROFILE_ID]},sourceMdlSha256:sha256,binaryMdlSha256:sha256,roundtripMdlSha256:sha256,
    sourceMdlBytes:integer(1,134217728),binaryMdlBytes:integer(1,134217728),roundtripVerified:{const:true},nodes:integer(1,256),triangles:integer(0,1000000),vertexSamples:integer(0,1000000),uvSamples:integer(0,1000000),controllers:integer(0,10000),maxSampleError:number(0,.001),
    emitterFlipbookReadback:obj({emitters:integer(0,64),animationBindings:integer(0,64),allSettingsRead:{const:true},animationOverrides:{const:false}}),
    geometryReadback:obj({meshNodes:integer(0,128),baseRenderableMeshes:integer(0,64),animationMeshBindings:integer(0,64),drawTriangles:integer(0,262144),vertexSamples:integer(0,16777216),uvSamples:integer(0,16777216),duplicateControllers:{const:0},allDrawIndicesRead:{const:true},allSamplesRead:{const:true},baseAnimationVertexOrderChecked:{const:true}}),
    normalReadback:obj({nodes:integer(0,64),corners:integer(0,786432),allCornersRead:{const:true},maxComponentError:number(0,.0002),componentTolerance:{const:.0002},sourceCornerNormalsSha256:sha256,binaryCornerNormalsSha256:sha256,
      animmeshNodes:integer(0,64),animatedNormalSamples:{const:0},coverage:{const:'base-trimesh-and-smooth-animmesh-in-base-and-animations'}},['nodes','corners','allCornersRead','maxComponentError','componentTolerance','sourceCornerNormalsSha256','binaryCornerNormalsSha256'])},['compiler','sourceProfileId','sourceMdlSha256','binaryMdlSha256','roundtripMdlSha256','sourceMdlBytes','binaryMdlBytes','roundtripVerified','nodes','triangles','vertexSamples','uvSamples','controllers','maxSampleError']),
  nativeVerified: { const: false }, structuralValidation: { const: 'passed' }, documentSha256: sha256, coordinateSystem: { const: 'NWN Z-up' },
  checks: { type: 'object', minProperties: 1, additionalProperties: boolean },
  resources: array(obj({ name: text, bytes: integer(0, 268435456), sha256 }), 256),
  readback: obj({ animation: text, duration: number(0, 60), detonateEvents: array(number(0, 60), 64), hakResourceCount: integer(1, 65535),
    layers: array(obj({ layerId: id, node: text, parent: text, update: { enum: ['Explosion', 'Fountain'] }, position: vec3, orientation, parentOrientation:orientation, parentScale: number(.001, 100), texture: text, blend: { enum: ['Normal', 'Lighten'] },
      flipbook:flipbookSchema, ...scalarNativeFields, colorStart: vec3, colorMid:vec3,colorEnd: vec3,percentStart:{const:0},percentMid:number(.01,.99),percentEnd:{const:1}, birthrateKeys: keyframes, authoredParticleCount: integer(0, 10000), integratedBirthrate: nullable(number(0, 10000.001)), emissionRampSeconds: nullable(number(0, .001)) },['layerId','node','parent','update','position','parentScale','texture','blend',...Object.keys(scalarNativeFields),'colorStart','colorEnd','birthrateKeys','authoredParticleCount','integratedBirthrate','emissionRampSeconds']), 64),
    textures: array(obj({ name: text, width: integer(1, 4096), height: integer(1, 4096), bitsPerPixel: { const: 32 }, minAlpha: integer(0, 255), maxAlpha: integer(0, 255), generator: text,
      origin:{enum:['top-left','bottom-left']},rgbaSha256:sha256,nwnBottomFirstRgbaSha256:sha256,sourceRefs:array(textureRefSchema,64),blend:blendSchema,
      txi:{...obj({name:text,blending:{enum:['default','additive']},mipmap:{enum:[0,1]},filter:{const:1},profile:{const:'linked-periodic-pan-v1'}},['name','blending','mipmap','filter']),oneOf:[{properties:{mipmap:{const:1}},not:{required:['profile']}},{properties:{mipmap:{const:0}},required:['profile']}]} },['name','width','height','bitsPerPixel','minAlpha','maxAlpha','generator']), 64),
    meshes:array(meshReadback,32),
    trails:array(obj({layerId:id,node:text,kind:{enum:['body','head']},vertices:integer(1,2048),triangles:integer(1,4096),frameSets:integer(2,1801),samplePeriod:number(.001,1),
      vertexSamples:integer(1,1_000_000),uvSamples:integer(1,1_000_000),animvertsSha256:sha256,animtvertsSha256:sha256,texture:text,alphaKeys:keyframes,maxCheckedHeadDeviationMetres:number(0,100),allSamplesRead:{const:true}}),64),
  },['animation','duration','detonateEvents','hakResourceCount','layers','textures']),
  diagnostics: array(diagnostic, 256), limitations: array(message, 100), integration: obj({ moduleIncluded: { const: false }, visualeffects2daIncluded: { const: false }, installed: { const: false },
    effect:{...obj({schemaVersion:{enum:[1,2,3,4,5,6]},projectId:nullable(id),revision:nullable(revision),snapshotSha256:sha256,documentSha256:sha256,
      model:obj({resref:text,file:text,sha256}),orientWithObject:boolean,visualeffects2da:obj({rowId:{type:'null'},columns:obj({OrientWithObject:{enum:[0,1]},Type_FD:{enum:['F','D','B']},ProgFX_Duration:{type:'null'},SoundDuration:{const:'****'}},['OrientWithObject'])}),nativeVerified:{const:false},
      beam:obj({profile:{enum:['lightning-linked-v1','fountain-p2p-bezier-finite-v1']},finite:obj({artifact:{const:'beam-flow.json'},duration:number(.1,30),removeNoEarlierThan:number(.01,30),direction:{enum:['source-to-target','target-to-source']}}),progfx2da:obj({rowId:{type:'null'},columns:{...obj({Type:{const:7},Param1:text,Param2:{const:'cast01'},Param6:{const:'cast01'}},['Type','Param1']),oneOf:[{required:['Param2'],not:{required:['Param6']}},{required:['Param6'],not:{required:['Param2']}}]}}),consumerBinding:{const:'visualeffects.ProgFX_Duration = allocated progfx row'},externalLifetime:{const:true},nativeFlowControl:boolean,nativeMotion:beamMotionSummary,start:{enum:['continuous-on-application','cast01-on-application']},stop:{enum:['consumer-removes-effect','finite-gate-then-consumer-removes-effect']},cessationAnimation:{const:false},sourceNode:{const:'consumer'},targetBodyPart:{const:'consumer'},referenceModel:{const:'fx_ref'}},['profile','progfx2da','consumerBinding','externalLifetime','nativeFlowControl','start','stop','cessationAnimation','sourceNode','targetBodyPart','referenceModel']),
      lifecycle:obj({mode:lifecycleSchema,animation:lifecycleSchema,loopSeconds:nullable(number(.1,30)),consumerLifetime:{const:'external'},phaseOnRemoval:{const:'unknown'},seams:array(obj({layerId:id,errors:obj({position:number(0,1e-6),orientation:number(0,1e-6),scale:number(0,1e-6),alpha:number(0,1e-6),vertices:number(0,1e-6)}),tolerance:{const:1e-6},continuity:{const:'C0'},implicitAlphaFade:{const:false}}),32)}),
      resourceBinding:obj({modelResref:text,allowedColumns:array(text,5),selection:{const:'consumer'}})},['schemaVersion','projectId','revision','snapshotSha256','documentSha256','model','orientWithObject','visualeffects2da','nativeVerified']),allOf:[{if:{properties:{schemaVersion:{const:6}}},then:{required:['beam'],properties:{beam:{properties:{progfx2da:{properties:{columns:{required:['Param6']}}}}}}},else:{properties:{beam:{properties:{progfx2da:{properties:{columns:{required:['Param2']}}}}}}}}]}
  },['moduleIncluded','visualeffects2daIncluded','installed']),
  references: array({ type: 'string', pattern: '^https://', maxLength: 2048 }, 100),
  assets:array(obj({...Object.fromEntries(Object.entries(textureAssetProperties).filter(([key])=>key!=='pngBase64')),referenced:boolean,resources:array(text,64)}),8),
},['formatVersion','exporterVersion','profileId','modelName','nativeVerified','structuralValidation','documentSha256','coordinateSystem','checks','resources','readback','diagnostics','limitations','integration','references']),
  // Persisted 0.1–0.3 job metadata remains readable. New exporter results must
  // contain the extra readback proof; merely accepting input assets is insufficient.
  allOf:[{if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{
    checks:{required:['burstEventTimeValuesRead','nativeBurstTimingVerified','burstEventsIsolated'],properties:{burstEventTimeValuesRead:{const:true},nativeBurstTimingVerified:{const:false}}},
    resources:{contains:{type:'object',required:['name'],properties:{name:{const:'emitter-emission.json'}}}}}}},
    {if:{properties:{exporterVersion:{const:'nwn-binary-vfx-0.21.1'}}},then:{properties:{checks:{required:['compiledDetonateEventsRead','compiledBirthrateRead','compiledEmitterFlagsRead'],properties:{compiledDetonateEventsRead:{const:true},compiledBirthrateRead:{const:true},compiledEmitterFlagsRead:{const:true}}}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{compilation:{required:['emitterFlipbookReadback']}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.19.0','nwn-ascii-vfx-0.20.0','nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0','nwn-binary-vfx-0.19.0','nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{integration:{required:['effect']}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.14.2','nwn-ascii-vfx-0.15.0','nwn-ascii-vfx-0.16.0','nwn-ascii-vfx-0.18.0','nwn-ascii-vfx-0.19.0','nwn-ascii-vfx-0.20.0','nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0','nwn-binary-vfx-0.14.2','nwn-binary-vfx-0.15.0','nwn-binary-vfx-0.16.0','nwn-binary-vfx-0.18.0','nwn-binary-vfx-0.19.0','nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{readback:{properties:{textures:{items:{required:['origin','nwnBottomFirstRgbaSha256'],properties:{origin:{const:'bottom-left'},generator:{const:'shared-rgba-tga-bottom-first-2'}}}}}}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.14.0','nwn-ascii-vfx-0.14.1','nwn-ascii-vfx-0.14.2','nwn-ascii-vfx-0.15.0','nwn-ascii-vfx-0.16.0','nwn-ascii-vfx-0.18.0','nwn-ascii-vfx-0.19.0','nwn-ascii-vfx-0.20.0','nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0','nwn-binary-vfx-0.14.0','nwn-binary-vfx-0.14.1','nwn-binary-vfx-0.14.2','nwn-binary-vfx-0.15.0','nwn-binary-vfx-0.16.0','nwn-binary-vfx-0.18.0','nwn-binary-vfx-0.19.0','nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{readback:{properties:{meshes:{items:{allOf:[{if:{required:['deformation'],properties:{shading:{properties:{mode:{const:'smooth'}}}}},then:{properties:{shading:{required:['deformationNormals','exportedAnimatedNormals']}}}}]}}}}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-binary-vfx-0.14.1','nwn-binary-vfx-0.14.2','nwn-binary-vfx-0.15.0','nwn-binary-vfx-0.16.0','nwn-binary-vfx-0.18.0','nwn-binary-vfx-0.19.0','nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{compilation:{required:['geometryReadback']}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-binary-vfx-0.14.0','nwn-binary-vfx-0.14.1','nwn-binary-vfx-0.14.2','nwn-binary-vfx-0.15.0','nwn-binary-vfx-0.16.0','nwn-binary-vfx-0.18.0','nwn-binary-vfx-0.19.0','nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{compilation:{properties:{normalReadback:{required:['animmeshNodes','animatedNormalSamples','coverage']}}}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.12.0','nwn-ascii-vfx-0.14.0','nwn-ascii-vfx-0.14.1','nwn-ascii-vfx-0.14.2','nwn-ascii-vfx-0.15.0','nwn-ascii-vfx-0.16.0','nwn-ascii-vfx-0.18.0','nwn-ascii-vfx-0.19.0','nwn-ascii-vfx-0.20.0','nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0','nwn-binary-vfx-0.12.0','nwn-binary-vfx-0.12.1','nwn-binary-vfx-0.14.0','nwn-binary-vfx-0.14.1','nwn-binary-vfx-0.14.2','nwn-binary-vfx-0.15.0','nwn-binary-vfx-0.16.0','nwn-binary-vfx-0.18.0','nwn-binary-vfx-0.19.0','nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{readback:{properties:{meshes:{items:{required:['shading']}}}}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-binary-vfx-0.12.0','nwn-binary-vfx-0.12.1','nwn-binary-vfx-0.14.0','nwn-binary-vfx-0.14.1','nwn-binary-vfx-0.14.2','nwn-binary-vfx-0.15.0','nwn-binary-vfx-0.16.0','nwn-binary-vfx-0.18.0','nwn-binary-vfx-0.19.0','nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']}}},then:{properties:{compilation:{required:['normalReadback']}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.4.0','nwn-ascii-vfx-0.4.1','nwn-ascii-vfx-0.5.0','nwn-ascii-vfx-0.7.0','nwn-ascii-vfx-0.9.0','nwn-ascii-vfx-0.11.0','nwn-ascii-vfx-0.12.0','nwn-ascii-vfx-0.14.0','nwn-ascii-vfx-0.14.1','nwn-ascii-vfx-0.14.2','nwn-ascii-vfx-0.15.0','nwn-ascii-vfx-0.16.0','nwn-ascii-vfx-0.18.0','nwn-ascii-vfx-0.19.0','nwn-ascii-vfx-0.20.0','nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0']}}},then:{required:['assets'],properties:{readback:{required:['meshes'],properties:{
    layers:{items:{required:['colorMid','percentStart','percentMid','percentEnd']}},
    meshes:{items:{required:['uv','uvFaces','texture','blend']}},
    textures:{items:{required:['origin','rgbaSha256','sourceRefs','blend','txi']}},
  }}}}}, {if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.5.0','nwn-ascii-vfx-0.7.0','nwn-ascii-vfx-0.9.0','nwn-ascii-vfx-0.11.0','nwn-ascii-vfx-0.12.0','nwn-ascii-vfx-0.14.0','nwn-ascii-vfx-0.14.1','nwn-ascii-vfx-0.14.2','nwn-ascii-vfx-0.15.0','nwn-ascii-vfx-0.16.0','nwn-ascii-vfx-0.18.0','nwn-ascii-vfx-0.19.0','nwn-ascii-vfx-0.20.0','nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0']}}},then:{properties:{readback:{properties:{layers:{items:{required:['orientation','parentOrientation']}}}}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.7.0','nwn-ascii-vfx-0.9.0','nwn-ascii-vfx-0.11.0','nwn-ascii-vfx-0.12.0','nwn-ascii-vfx-0.14.0','nwn-ascii-vfx-0.14.1','nwn-ascii-vfx-0.14.2','nwn-ascii-vfx-0.15.0','nwn-ascii-vfx-0.16.0','nwn-ascii-vfx-0.18.0','nwn-ascii-vfx-0.19.0','nwn-ascii-vfx-0.20.0','nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0']}}},then:{properties:{readback:{properties:{meshes:{items:{required:['diffuse','selfIllumination']}}}}}}},
    {if:{properties:{exporterVersion:{enum:['nwn-ascii-vfx-0.9.0','nwn-ascii-vfx-0.11.0','nwn-ascii-vfx-0.12.0','nwn-ascii-vfx-0.14.0','nwn-ascii-vfx-0.14.1','nwn-ascii-vfx-0.14.2','nwn-ascii-vfx-0.15.0','nwn-ascii-vfx-0.16.0','nwn-ascii-vfx-0.18.0','nwn-ascii-vfx-0.19.0','nwn-ascii-vfx-0.20.0','nwn-ascii-vfx-0.21.1','nwn-ascii-vfx-0.22.0','nwn-ascii-vfx-0.23.0','nwn-ascii-vfx-0.24.0','nwn-ascii-vfx-0.25.0','nwn-ascii-vfx-0.26.0','nwn-ascii-vfx-0.26.1','nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0','nwn-ascii-vfx-0.28.1','nwn-ascii-vfx-0.28.2','nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0']}}},then:{properties:{readback:{required:['trails']}}}},
    {if:{properties:{profileId:{enum:[BINARY_PROFILE_ID,DURATION_BINARY_PROFILE_ID,BEAM_BINARY_PROFILE_ID]}}},then:{required:['compilation','assets'],properties:{exporterVersion:{enum:['nwn-binary-vfx-0.10.0','nwn-binary-vfx-0.11.0','nwn-binary-vfx-0.12.0','nwn-binary-vfx-0.12.1','nwn-binary-vfx-0.14.0','nwn-binary-vfx-0.14.1','nwn-binary-vfx-0.14.2','nwn-binary-vfx-0.15.0','nwn-binary-vfx-0.16.0','nwn-binary-vfx-0.18.0','nwn-binary-vfx-0.19.0','nwn-binary-vfx-0.20.0','nwn-binary-vfx-0.21.1','nwn-binary-vfx-0.22.0','nwn-binary-vfx-0.23.0','nwn-binary-vfx-0.24.0','nwn-binary-vfx-0.25.0','nwn-binary-vfx-0.26.0','nwn-binary-vfx-0.26.1','nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0','nwn-binary-vfx-0.28.1','nwn-binary-vfx-0.28.2','nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0']},readback:{required:['meshes','trails']}}}}],
};
const candidateMetadata = obj({ modelName: text, validation: ref('candidateValidation'), nativeVerified: { const: false } });
const compositionMetadata=obj({compositionVersion:{const:1},duration:number(.1,30),referenceGeometry:boolean,audio:{const:'omitted'},nativeVerified:{const:false},
  budget:obj({instances:integer(1,24),layers:integer(1,256),particles:integer(0,32000),vertexSamples:integer(0,2000000),uvSamples:integer(0,2000000),sourceBytes:integer(1,25165824),textureBytes:integer(0,67108864)}),
  instances:{...array(obj({...compositionInstanceSchema.properties,scale:number(.01,10),snapshotSha256:assetIdSchema,documentSchemaVersion:integer(1,18),sourceDuration:number(.1,30),visibleUntil:number(0,30),clipped:boolean},['id','projectId','revision','start','position','yawRadians','scale','snapshotSha256','documentSchemaVersion','sourceDuration','visibleUntil','clipped']),24),minItems:1},
  rendererVersion:text,format:{enum:['png','webm']},time:number(0,30),camera:previewCameraSchema,resolution:{const:[960,640]},approximation:{const:true},limitations:array(message,100)});
const renderMetadata = obj({ conditions:previewConditionsSchema,audio:obj({sampleRate:{const:48000},channels:{const:2},frames:integer(1,1440000),pcmSha256:sha256,peak:number(0,AUDIO_CAPABILITIES.maxClips*MAX_AUDIO_GAIN),peakDbFS:{type:['number','null']},clippedSamples:integer(0,2880000),muxCodec:{const:'opus'},masterPreviewGainApplied:{const:false}},['sampleRate','channels','frames','pcmSha256','peak','clippedSamples','muxCodec','masterPreviewGainApplied']), rendererVersion: text, documentSchemaVersion: { enum: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24] }, format: { enum: ['png', 'webm'] }, time: number(0, 30), duration: number(.1, 30), seed: integer(0, 2147483647),
  lifecycle:lifecycleSchema,loopSeconds:number(.1,30),previewWindowSeconds:number(.1,30),cycles:integer(1,10),
  emitterFlipbooks:array(obj({layerId:id,texture:textureRefSchema,settings:flipbookSchema,frameOrder:{const:'left-to-right-top-to-bottom'},clock:{const:'particle-age-seconds'},playback:{const:'repeat'}}),32),
  deformations:array(obj({layerId:id,frameSets:integer(2,1801),samplePeriod:number(.001,1),animvertsSha256:sha256,animtvertsSha256:sha256,maxDeviationMetres:number(0,100),interpolation:deformationInterpolationReport},['layerId','frameSets','samplePeriod','animvertsSha256','animtvertsSha256','maxDeviationMetres']),32),
  meshShading:array(obj({layerId:id,mode:{enum:['flat','smooth']},cornerNormalsSha256:sha256,deformationNormals},['layerId','mode','cornerNormalsSha256']),32),
  beamParticleFlow:array(obj({layerId:id,binding:beamBindingSchema,start:number(0,30),feedSeconds:number(.01,10),life:number(.01,10),count:integer(1,2000)}),8),
  beamTextureMapping:array(obj({layerId:id,settings:beamProperties.textureMapping,repetitions:{enum:[2,4,8,16,32,64]},nativeAlongAxis:{const:'V'},nativeFullWidth:number(.002,1),syntheticFlow:{const:false}}),8),
  beamMaterialMotion:array(obj({layerId:id,profile:{const:'linked-periodic-pan-v1'},version:{const:1},documentSchemaVersion:{const:23},minimumStudioVersion:{const:'0.29.0'},exportAvailable:{const:true},frameCount:{const:16},columns:{const:16},rows:{const:1},cellWidth:{const:64},cellHeight:{const:256},frameStart:{const:0},frameEnd:{const:15},mapping:{const:'per-segment'},wholeSpanRepeats:{const:2},pointCount:{const:3},randomStart:{const:false},mipmap:{const:0},filter:{const:1},geometryHelix:{const:false},nativeVerified:{const:false},nativeCadenceVerified:{const:false},settings:beamProperties.materialMotion,cycleSeconds:number(0,16),nativeFullWidth:number(.002,1)}),1),
  beamNativeMotion:beamMotionSummary,camera: previewCameraSchema, resolution: { type: 'array', items: integer(1, 16384), minItems: 2, maxItems: 2 }, approximation: { const: true }, nativeVerified: { const: false }, limitations: array(message, 100) },['rendererVersion','documentSchemaVersion','format','time','duration','seed','camera','resolution','approximation','nativeVerified','limitations']);
const resultError = obj({ code: operationName, message, details: ref('jsonValue'), retryable: boolean }, ['code', 'message', 'retryable']);
const renderContextProperties={stage:{enum:['launch','page','navigation','ready','document','render','frame','screenshot','encoder','cleanup','worker']},frameIndex:integer(0,900),frameTime:number(0,30)};
const renderCauseProperties={name:{type:'string',minLength:1,maxLength:80},message:{type:'string',minLength:1,maxLength:2000},code:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,80}$'}};
const renderCauseSchema=obj(renderCauseProperties,['name','message']);
const renderErrorDetailsSchema=obj({...renderContextProperties,cause:renderCauseSchema,
  pageErrors:array(obj({...renderContextProperties,...renderCauseProperties},['stage','name','message']),5),cleanupError:renderCauseSchema},['stage','cause']);
const envelopeProperties = { contractVersion: { const: CONTRACT_VERSION }, requestId: id, operationId: id, status: { enum: ['ok', 'accepted', 'failed'] }, data: ref('mutationData'), error: resultError, diagnostics: array(ref('jsonValue'), 256) };
const resultEnvelope = { ...obj(envelopeProperties, ['contractVersion', 'requestId', 'status', 'diagnostics']), allOf: [
  { if: { properties: { status: { const: 'failed' } } }, then: { required: ['error'], not: { required: ['data'] } }, else: { required: ['data'], not: { required: ['error'] } } },
  { if: { properties: { status: { const: 'accepted' } } }, then: { properties: { data: ref('job') } } },
] };
const serviceStop = obj({ stopping: { const: true }, instanceId: id });
const definitions: Record<string, object> = {
  // Recursive JSON is limited to places whose values really are domain-dependent
  // JSON: a diff's before/after values, error details, and schema descriptions.
  jsonValue: { anyOf: [{ type: 'null' }, { type: 'boolean' }, { type: 'number' }, { type: 'string' },
    { type: 'array', items: ref('jsonValue') }, { type: 'object', additionalProperties: ref('jsonValue') }] },
  diff: array(obj({ path: { type: 'string', pattern: '^/' }, before: ref('jsonValue'), after: ref('jsonValue') }), 10000),
  project: obj(projectProperties, projectRequired),
  changedProject: obj({ ...projectProperties, diff: ref('diff') }, [...projectRequired, 'diff']),
  revisionRecord: obj({ ...projectProperties, operationId: nullable(id), actorId: nullable(id), actorName: nullable(text),
    actorKind: nullable({ enum: ['owner', 'agent'] }), committedAt: nullable(timestamp) },
    [...projectRequired, 'operationId', 'actorId', 'actorName', 'actorKind', 'committedAt']),
  actor: obj(actorProperties),
  provisionedActor: obj({ ...actorProperties, token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$', description: 'Secret credential returned only by authorized actor provisioning; do not log it.' } }),
  artifact: obj(artifactProperties, Object.keys(artifactProperties).filter(key => key !== 'jobId')),
  candidateValidation,
  job: { ...obj({ id, jobId: id, projectId: id, revision, actorId: id, sourceProjectIds:{...array(id,24),minItems:1,uniqueItems:true}, type: { enum: ['candidate.build', 'preview.request','preview.compose','iteration.prepare'] }, status: jobStatus,
    createdAt: timestamp, updatedAt: timestamp, artifacts: array(ref('artifact'), 512), metadata: { anyOf: [obj({iterationVersion:{const:1},stageCount:integer(1,128),variantCount:integer(1,6),conditions:{...previewConditionsSchema,properties:{...previewConditionsSchema.properties,times:array(number(0,30),8)}},stages:array(obj({key:id,status:{enum:['running','succeeded']},milliseconds:number(0,86400000),reused:boolean,sourceJobId:id},['key','status','milliseconds','reused']),128),nativeVerified:{const:false}},['iterationVersion','stages','nativeVerified']),candidateMetadata, renderMetadata, compositionMetadata] },
    error: obj({ code: operationName, message,details:renderErrorDetailsSchema },['code','message']) }, ['id', 'jobId', 'projectId', 'revision', 'actorId', 'type', 'status', 'createdAt', 'updatedAt', 'artifacts']),
    allOf: [
      { if: { properties: { status: { enum: ['failed', 'blocked'] } } }, then: { required: ['error'] } },
      { if: { properties: { status: { const: 'succeeded' } } }, then: { properties: { artifacts: { minItems: 1 } } } },
      { if: { properties: { type: { const: 'candidate.build' } } }, then: { properties: { metadata: candidateMetadata } }, else: {if:{properties:{type:{const:'preview.compose'}}},then:{required:['sourceProjectIds'],properties:{metadata:compositionMetadata}},else:{if:{properties:{type:{const:'iteration.prepare'}}},then:{required:['sourceProjectIds']},else:{properties:{metadata:renderMetadata}}}} },
    ] },
  review,
  resultEnvelope,
};
const schemaDescription = { $ref: 'http://json-schema.org/draft-07/schema#' };
const operationDescription = obj({ name: operationName, description: message, inputSchema: schemaDescription, outputSchema: schemaDescription, mutates: boolean, available: boolean });
const catalogDescription = obj({ name: operationName, description: message, mutates: boolean, available: boolean });
const policy = obj({ projectId: id, paused: boolean });
const projectExport = obj({ projectId: id, revision, artifact: ref('artifact') });
const eventBase = { cursor: integer(1, Number.MAX_SAFE_INTEGER), at: timestamp };
const eventSchema = { oneOf: [
  obj({ ...eventBase, type: { const: 'project.changed' }, projectId: id, revision, operationId: id }),
  obj({ ...eventBase, type: { const: 'job.changed' }, jobId: id, status: jobStatus }),
  obj({ ...eventBase, type: { const: 'policy.changed' }, paused: boolean, actorId: id }),
  obj({ ...eventBase, type: { const: 'review.added' }, review: ref('review') }),
] };
const outputShapes: Record<string, object> = {
  version: obj({ version: { const: STUDIO_VERSION }, contractVersion: { const: CONTRACT_VERSION }, instanceId: id, workspaceId: id }),
  doctor: obj({ instanceId: id, workspaceId: id, contractVersion: { const: CONTRACT_VERSION }, actor: ref('actor'), checks: obj({ database: { const: 'ready' }, api: { const: 'ready' }, renderer: { enum: ['ready', 'unavailable'] }, native: { const: 'unavailable' } }), nativeTestAvailable: { const: false }, nativeWorkflow: { const: NATIVE_WORKFLOW } }),
  capabilities: obj({ contractVersion: { const: CONTRACT_VERSION }, profileId: { enum: EXPORT_PROFILE_IDS }, operations: array(operationName, 100),
    exportProfiles:array(obj({id:{enum:EXPORT_PROFILE_IDS},mdlFormat:{enum:['ascii','binary']},available:boolean}),6),
    layerTypes: { const: ['emitter','mesh','trail','beam'] },beamAuthoring:{const:BEAM_CAPABILITIES}, trailAuthoring:{const:TRAIL_CAPABILITIES}, meshShading:{const:MESH_SHADING_CAPABILITIES}, meshDeformation:{const:MESH_DEFORMATION_CAPABILITIES}, meshGeometryKinds:{const:['box','ring','custom']}, meshAnimationChannels:{const:['position','orientation','scale','alpha','vertices']}, documentSchemaVersions:{const:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]},compositionPreview:{const:COMPOSITION_CAPABILITIES},emitterFlipbook:{const:FLIPBOOK_CAPABILITIES},effectLifecycle:{const:LIFECYCLE_CAPABILITIES},effectIntegration:{const:EFFECT_INTEGRATION_CAPABILITIES},audio:{const:AUDIO_CAPABILITIES},
    objImport:{const:OBJ_IMPORT_CAPABILITIES},meshMaterial:{const:MESH_MATERIAL_CAPABILITIES},palette:{const:PALETTE_CAPABILITIES},
    emitterOrientation:{const:EMITTER_ORIENTATION_CAPABILITIES},
    customTextures:{const:TEXTURE_CAPABILITIES},particleAgeControls:{const:PARTICLE_AGE_CAPABILITIES},
    emitterModes: { const: ['Explosion', 'Fountain'] }, textures: { const: ['spark', 'smoke', 'glow'] }, exportFormats: { const: ['ascii-mdl', 'binary-mdl', 'tga', 'txi', 'hak'] },
    preview: boolean, nativeVerified: { const: false }, nativeTestAvailable: { const: false }, nativeWorkflow: { const: NATIVE_WORKFLOW }, lightAvailable: { const: false }, ribbonAvailable: { const: false }, mcp: { const: false }, webmcp: { const: true } }),
  'workspaces.list': paged(obj({ id, workspaceId: id, instanceId: id })),
  'operations.list': obj({ items: array(catalogDescription, 100) }),
  'schema.get': operationDescription,
  'projects.list': paged(ref('project')),
  'projects.resolve': ref('project'), 'projects.inspect': ref('project'), 'projects.create': ref('project'), 'projects.fork': ref('project'), 'projects.import': ref('project'),
  'projects.export': projectExport,
  'audio.import':obj({project:ref('project'),assetId:assetIdSchema}),
  'audio.remove':obj({project:ref('project'),removedAssetIds:array(assetIdSchema,8)}),
  'audio.list':obj({items:array(audioMetadataSchema,8),nextCursor:{type:'null'}}),
  'audio.get':audioAssetSchema,
  'assets.import':obj({project:ref('project'),assetId:assetIdSchema}),
  'assets.remove':obj({project:ref('project'),removedAssetIds:array(assetIdSchema,8)}),
  'meshes.importObj':obj({project:ref('project'),report:ref('objImportReport')}),
  'meshes.importObj.preview':obj({document:documentSchema,diff:ref('diff'),report:ref('objImportReport')}),
  'palette.preview':obj({projectId:id,revision,document:documentSchema,diff:ref('diff'),report:ref('paletteReport'),proposalHash:assetIdSchema}),
  'palette.apply':obj({project:ref('project'),report:ref('paletteReport'),proposalHash:assetIdSchema}),
  'assets.list':obj({items:array(textureAssetMetadataSchema,8),nextCursor:{type:'null'}}),
  'assets.get':textureAssetSchema,
  'changes.preview': obj({ projectId: id, revision, document: documentSchema, diff: ref('diff') }),
  'changes.apply': ref('changedProject'), 'changes.revert': ref('changedProject'), 'revisions.restore': ref('changedProject'),
  'revisions.list': paged(ref('revisionRecord')), 'revisions.get': ref('project'),
  'policy.inspect': policy, 'policy.set': policy,
  'actors.list': obj({ items: array(ref('actor'), 10000) }), 'actors.create': ref('provisionedActor'), 'actors.revoke': ref('actor'),
  'candidate.build': ref('job'), 'preview.request': ref('job'), 'preview.compose':ref('job'), 'jobs.get': ref('job'), 'jobs.cancel': ref('job'), 'jobs.list': paged(ref('job')),
  'artifacts.get': ref('artifact'), 'artifacts.list': paged(ref('artifact')),
  'operations.get': ref('operationRecord'), 'operations.resolve': ref('resultEnvelope'),
  'events.list': obj({ items: array(eventSchema, 100), cursor: integer(0, Number.MAX_SAFE_INTEGER) }),
  'reviews.list': paged(ref('review')), 'reviews.add': ref('review'),
  // No successful result can be advertised while the native adapter is absent.
  'native.test.request': { not: {} },
  'native.test.status': obj({
    version: { const: NATIVE_WORKFLOW.contract }, candidateId: id, projectId: id, revision, snapshotSha256: sha256, candidateStatus: jobStatus,
    state: { enum: ['candidate_pending', 'candidate_failed', 'awaiting_qualified_runner'] }, externalState: { const: 'not_observed_by_studio' },
    nativeVerified: { const: false }, nativeTestAvailable: { const: false }, proofCompleteness: { const: 'missing' },
    candidateArtifacts: array(ref('artifact'), 512), nativeArtifacts: { type: 'array', maxItems: 0 },
    dependencies: { ...array(obj({ id: { enum: ['candidate_resources', 'native_geometry_gate', 'entry_surface_observation', 'qualified_runtime_runner', 'runtime_capture', 'runtime_validation'] },
      status: { enum: ['ready', 'missing', 'failed'] }, message }), 6), minItems: 6 },
  }),
};
definitions.objImportReport=obj({version:{const:'nwn-vfx-obj-import/v1'},
  source:obj({utf8Bytes:integer(1,1048576),vertices:integer(3,2048),textureCoordinates:integer(0,8192),normals:integer(0,8192),triangles:integer(1,4096),smoothingStatements:integer(0,1048576)}),
  conversion:obj({sourceUpAxis:{enum:['y','z']},metersPerUnit:{type:'number',exclusiveMinimum:0},targetUpAxis:{const:'z'},targetUnit:{const:'meter'},
    axisMapping:{enum:['x,-z,y','x,y,z']},transform:objTransformSchema,order:{const:['axis','units','scale','rotation','translation']},centered:{const:false}}),
  normals:obj({mode:{const:'flat'},sourceNormalsPreserved:{const:false},smoothingPreserved:{const:false}}),
  uv:obj({present:boolean,origin:{const:'bottom-left'}}),bounds:obj({min:boundedVec3(-20,20),max:boundedVec3(-20,20)}),
  warnings:array(obj({code:{enum:['OBJ_NORMALS_RECOMPUTED','OBJ_SMOOTHING_IGNORED','OBJ_UNREFERENCED_UV','OBJ_LABELS_IGNORED']},message}),4)});
definitions.paletteReport=obj({version:{const:PALETTE_VERSION},hueShiftDegrees:number(-180,180),selectedLayerIds:array(id,32),skippedLayerIds:array(id,32),
  colors:array(obj({layerId:id,field:{enum:['color','midColor','endColor','material.diffuse','material.selfIllumination']},before:colorSchema,after:colorSchema}),96),
  textures:array(obj({sourceAssetId:assetIdSchema,assetId:assetIdSchema,layerIds:array(id,32),changedPixels:integer(0,1048576),maxLightnessError:number(0,1)}),8),warnings:array(message,32)});
Object.assign(operationSchemas,WORKFLOW_SCHEMAS);
for(const name of Object.keys(WORKFLOW_SCHEMAS))outputShapes[name]=['iteration.prepare','jobs.resume'].includes(name)?ref('job'):workflowOutputSchema;
definitions.mutationData = { anyOf: [workflowOutputSchema,ref('project'), ref('changedProject'), outputShapes['audio.import'], outputShapes['audio.remove'], outputShapes['assets.import'], outputShapes['assets.remove'], outputShapes['meshes.importObj'], outputShapes['palette.apply'], projectExport, policy, ref('provisionedActor'), ref('actor'), ref('job'), ref('review'), serviceStop] };
const recordedMutations = [...Object.entries(operationSchemas).filter(([, schema]) => schema.mutates).map(([name]) => name), 'service.stop'];
definitions.operationRecord = {
  ...obj({ id, operationId: id, actorId: id, name: { enum: recordedMutations }, input: { type: 'object' }, projectId: nullable(id), createdAt: timestamp, diff: ref('diff'), result: ref('resultEnvelope') }, ['id', 'operationId', 'actorId', 'name', 'input', 'projectId', 'createdAt', 'result']),
  allOf: recordedMutations.map(name => ({
    if: { properties: { name: { const: name } } },
    then: { properties: { input: name === 'service.stop' ? obj({}) : operationSchemas[name].inputSchema,
      result: { properties: { data: name === 'service.stop' ? serviceStop : outputShapes[name] } } } },
  })),
};
function referencedDefinitions(root: object): Record<string, object> {
  const selected: Record<string, object> = {};
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const reference = (value as Record<string, unknown>).$ref;
    if (typeof reference === 'string' && reference.startsWith('#/definitions/')) {
      const name = reference.slice('#/definitions/'.length);
      if (!Object.hasOwn(selected, name)) {
        if (!definitions[name]) throw new Error(`Unknown result definition: ${name}`);
        selected[name] = definitions[name]; visit(definitions[name]);
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root); return selected;
}
for (const [name, operation] of Object.entries(operationSchemas)) {
  if (!outputShapes[name]) throw new Error(`Missing result schema: ${name}`);
  operation.outputSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://nwn-vfx.local/contracts/${CONTRACT_VERSION}/results/${name}`,
    ...outputShapes[name], definitions: referencedDefinitions(outputShapes[name]),
  };
}
const inputs = new Map<string, ReturnType<typeof ajv.compile>>();
const outputs = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateOperationInput(name: string, value: unknown): void {
  if (!operationSchemas[name]) throw new DomainError('UNKNOWN_OPERATION', 'Nieobsługiwana operacja.', { operation: name });
  let validator = inputs.get(name);
  if (!validator) { validator = ajv.compile(operationSchemas[name].inputSchema); inputs.set(name, validator); }
  if (!validator(value)) throw new DomainError('VALIDATION_ERROR', 'Niepoprawne dane operacji.', validator.errors);
  if(name==='preview.compose')validateCompositionInput(value as CompositionInput);
  if (name === 'preview.request' && (value as any).camera !== undefined) assertPreviewCamera((value as any).camera);
}
export function validateOperationOutput(name: string, value: unknown): void {
  let validator = outputs.get(name);
  if (!validator && operationSchemas[name]) { validator = ajv.compile(operationSchemas[name].outputSchema); outputs.set(name, validator); }
  if (!validator || !validator(value)) throw new DomainError('INVALID_RESULT', 'Operacja zwróciła niepoprawny wynik.', { operation: name, errors: validator?.errors ?? [] });
}
export function assertDocument(value: unknown): asserts value is import('../../core/src/model.js').EffectDocument {
  if (!validateDocument(value)) throw new DomainError('VALIDATION_ERROR', 'Niepoprawny dokument.', validateDocument.errors);
  const doc = value as unknown as import('../../core/src/model.js').EffectDocument;
  if (new Set(doc.layers.map(l => l.id)).size !== doc.layers.length) throw new DomainError('VALIDATION_ERROR', 'ID warstw muszą być unikalne.');
  if (doc.layers.reduce((n, l) => n + (l.type==='mesh'||l.type==='trail'||l.type==='beam'?0:l.count), 0) > 8000) throw new DomainError('LIMIT_EXCEEDED', 'Limit sceny: 8000 cząstek.');
  if (doc.locks.some(lock => lock.layerId!==EFFECT_LOCK_ID&&!doc.layers.some(l => l.id === lock.layerId)&&!doc.audioClips?.some(c=>c.id===lock.layerId))) throw new DomainError('VALIDATION_ERROR', 'Blokada wskazuje nieistniejącą warstwę.');
  assertDocumentInvariants(doc);
}
