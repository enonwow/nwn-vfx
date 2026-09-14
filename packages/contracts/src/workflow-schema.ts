const s=(maxLength=160)=>({type:'string',minLength:1,maxLength});
const n=(minimum:number,maximum:number)=>({type:'number',minimum,maximum});
const i=(minimum=1,maximum=2147483647)=>({...n(minimum,maximum),type:'integer'});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object',properties,...(required.length?{required}:{}),additionalProperties:false});
const arr=(items:any,maxItems=32,minItems=0)=>({type:'array',items,maxItems,minItems});
const id={...s(100),pattern:'^[\\w-]{1,100}$'},sha={...s(64),pattern:'^[a-f0-9]{64}$'},vec={...arr(n(-100,100),3,3)};
export const revisionRefSchema=obj({projectId:id,revision:i(),snapshotSha256:sha});
export const previewConditionsSchema=obj({filtering:{enum:['legacy-linear','export-mipmaps']},background:{enum:['dark','light','gray']},lightIntensity:n(0,4),
  camera:obj({position:vec,target:vec,fov:n(10,120)}),rig:obj({id:{const:'schematic-human-v1'},height:n(.5,3),position:vec,yaw:n(-25.133,25.133),velocity:vec,anchor:{enum:['origin','impact','left-hand','right-hand']},attachEffect:{type:'boolean'}})},['filtering','background']);
export const markerSchema=obj({id,name:s(),time:n(0,30)});
export const bindingSchema=obj({targetType:{enum:['layer','audio']},targetId:id,markerId:id,offset:n(-30,30)});
export const authoringSchema=obj({version:{const:1},benchmark:obj({source:revisionRefSchema,reportId:id,observationId:id}),preview:previewConditionsSchema,
  concepts:arr(obj({assetId:sha,name:s(),markerId:id},['assetId','name']),8),markers:arr(markerSchema,32),bindings:arr(bindingSchema,40),
  components:arr(obj({componentId:id,source:revisionRefSchema,mapping:{type:'object',maxProperties:40,propertyNames:id,additionalProperties:id}}),32)},['version']);
const record=obj({name:s(),sha256:sha,size:i(0,2147483647)});
export const externalReportSchema=obj({schemaVersion:{const:1},kind:{const:'nwn-vfx-external-report'},
  target:obj({instanceId:id,workspaceId:id,projectId:id,revision:i(),snapshotSha256:sha,jobId:id,variantId:id,candidateSha256:sha},['instanceId','workspaceId','projectId','revision','snapshotSha256','jobId','candidateSha256']),
  runner:obj({name:s(),version:s()}),conditions:obj({description:s(4000)}),installation:arr(record,64),
  session:obj({id,startedAt:{type:'string',maxLength:64}}),
  observations:arr(obj({id,kind:{enum:['visibility','behavior','preview','integration']},result:{enum:['pass','fail','inconclusive']},description:s(2000),evidenceIds:arr(id,32)}),64,1),
  evidence:arr(obj({id,name:s(),sha256:sha,size:i(0,2147483647),uri:s(2048)}),32),notes:s(4000)},['schemaVersion','kind','target','runner','conditions','installation','session','observations','evidence']);
const target={projectId:id,revision:i()},cas={projectId:id,expectedRevision:i()},reference=obj(target);
export const iterationInputSchema=obj({...target,observed:reference,layerId:id,groups:{...arr({enum:['texture','color','alpha','size','count']},5),uniqueItems:true},
  mode:{enum:['compare','white-control','solo','single']},times:arr(n(0,30),8,1),conditions:previewConditionsSchema,
  binary:{type:'boolean'},render:{type:'boolean'},format:{enum:['png','webm']}},['projectId','revision']);
export const WORKFLOW_SCHEMAS:Record<string,{description:string;inputSchema:any;outputSchema:any;mutates:boolean}>={};
const op=(name:string,description:string,inputSchema:any,mutates=false)=>{WORKFLOW_SCHEMAS[name]={description,inputSchema,outputSchema:{},mutates};};
op('workflow.inspect','Compact source and pinned workflow context; no pixels or geometry.',obj({...target},['projectId']));
op('workflow.compare','Authored, effective-export and available compiled readback differences.',obj({...target,baseline:reference,candidateId:id,baselineCandidateId:id},['projectId','revision','baseline']));
op('workflow.analyze','Measured risks; structural errors, warnings, estimates and hypotheses.',obj({...target,candidateId:id},['projectId','revision']));
op('workflow.settings.preview','Preview concept, phase and render-condition metadata changes.',obj({...cas,settings:obj({preview:previewConditionsSchema,concepts:authoringSchema.properties.concepts},[])}));
op('workflow.settings.apply','Apply preview/concept metadata with revision and locks.',WORKFLOW_SCHEMAS['workflow.settings.preview'].inputSchema,true);
op('benchmarks.pin','Pin an exact passing external observation; no automatic artistic approval.',obj({...cas,source:revisionRefSchema,reportId:id,observationId:id}),true);
op('diagnostics.plan','Independent variants from one baseline, compact allowed-field differences.',iterationInputSchema);
op('iteration.prepare','Durable diff, analysis, shared previews and diagnostic.zip.',iterationInputSchema,true);
op('jobs.resume','Resume an interrupted iteration from verified completed stages.',obj({jobId:id}),true);
op('components.publish','Publish immutable selection and dependencies from a revision.',obj({...target,name:s(),layerIds:arr(id,32),audioClipIds:arr(id,8),limitations:arr(s(500),16)},['projectId','revision','name','layerIds','audioClipIds']),true);
op('components.list','Accessible immutable component versions.',obj({projectId:id},[]));
op('components.insert.preview','Preview copying a component with resource and ID mapping.',obj({...cas,componentId:id,prefix:id}));
op('components.insert.apply','Insert component preserving source bytes and restrictions.',WORKFLOW_SCHEMAS['components.insert.preview'].inputSchema,true);
op('timing.preview','Preview period/marker schedule; source audio bytes stay unchanged.',obj({...cas,period:n(.1,30),markers:arr(markerSchema,32),bindings:arr(bindingSchema,40)},['projectId','expectedRevision']));
op('timing.apply','Apply the reviewed schedule with revision and field locks.',WORKFLOW_SCHEMAS['timing.preview'].inputSchema,true);
op('reports.import','Store a hash-bound external declaration, separate from nativeVerified.',obj({projectId:id,report:externalReportSchema}),true);
op('reports.list','External reports for an accessible exact revision.',obj({...target},['projectId']));
export const WORKFLOW_OPERATIONS=Object.keys(WORKFLOW_SCHEMAS);
export const workflowOutputSchema=obj({schemaVersion:{const:1},kind:s(),projectId:id,revision:i(),snapshotSha256:sha,detail:{type:'object'},nativeVerified:{const:false}},['schemaVersion','kind','detail','nativeVerified']);
