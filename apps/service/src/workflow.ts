import {DomainError,STUDIO_VERSION,promoteDocumentSchema,changedFields,applyChanges,type Project,type EffectDocument,type Command} from '../../../packages/core/src/model.js';
import {assertDocument} from '../../../packages/contracts/src/schema.js';
import {WORKFLOW_OPERATIONS} from '../../../packages/contracts/src/workflow-schema.js';
import {compactDocument,compareDocuments,assertAuthoringUnlocked,DEFAULT_CONDITIONS,WORKFLOW_LIMITATIONS,diagnosticVariants,retimeDocument,insertComponent,type RevisionRef,type AuthoringState} from '../../../packages/core/src/workflow.js';
import {assertPreviewCamera,DEFAULT_PREVIEW_CAMERA} from '../../../packages/core/src/camera.js';
import {hash,canonical,id,now,type Actor,type Store,type Job} from './store.js';
import {analyzeDocument,compareWithExport,candidateFiles,artifactBytes} from './workflow-analysis.js';
import type {IterationSnapshot} from './iteration.js';

export const WORKFLOW_SCOPES:Record<string,string>={
  'workflow.inspect':'read','workflow.compare':'read','workflow.analyze':'read','workflow.settings.preview':'edit','workflow.settings.apply':'edit','benchmarks.pin':'edit',
  'diagnostics.plan':'read','iteration.prepare':'build','jobs.resume':'build','components.publish':'edit','components.list':'read','components.insert.preview':'edit','components.insert.apply':'edit',
  'timing.preview':'edit','timing.apply':'edit','reports.import':'review','reports.list':'read',
};
export interface WorkflowContext {
  store:Store;authorize:(actorId:string,projectId:string|undefined,scope:string|undefined,writing?:boolean)=>Actor;
  authorizeJob:(actorId:string,jobId:string,scope?:string,writing?:boolean)=>void;
  commit:(before:Project,document:EffectDocument,operationId:string)=>Project;
  newProject:(document:EffectDocument,projectId:string|undefined,operationId:string,actor:Actor,parentId?:string)=>Project;
  renderAvailable:boolean;
}
function fail(code:string,message:string):never{throw new DomainError(code,message);}
export function workflowOperation(context:WorkflowContext,command:Command,actor:Actor,operationId:string):{data:any;projectId?:string;diff?:unknown;status?:'accepted'}|undefined{
  if(!WORKFLOW_OPERATIONS.includes(command.operation))return undefined;
  const {store,authorize,authorizeJob}=context,op=command.operation,input=command.input as any;
  const read=(projectId:string,revision?:number,writing=false)=>{authorize(actor.id,projectId,'read',writing);return store.project(projectId,revision);};
  const ref=(p:Project):RevisionRef=>({projectId:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document))});
  const result=(detail:any,p?:Project)=>({data:{schemaVersion:1,kind:op,...(p?ref(p):{}),detail,nativeVerified:false},...(p?{projectId:p.id}:{})});
  const current=()=>{const p=read(input.projectId,undefined,true);if(p.revision!==input.expectedRevision)fail('REVISION_CONFLICT','Projekt ma nowszą rewizję.');return p;};
  const row=(table:'components'|'external_reports',valueId:string)=>{const r=store.db.prepare(`SELECT value FROM ${table} WHERE id=?`).get(valueId) as any;if(!r)fail('NOT_FOUND','Nie znaleziono wpisu.');return JSON.parse(r.value);};
  const save=(before:Project,document:EffectDocument,detail:any)=>{
    promoteDocumentSchema(document);assertDocument(document);const diff=changedFields(before.document,document);
    if(op.endsWith('.preview'))return result({...detail,diff:compareDocuments(before.document,document)},before);
    const project=diff.length?context.commit(before,document,operationId):before;
    return{...result({...detail,diff:compareDocuments(before.document,document)},project),diff};
  };
  if(op==='workflow.inspect'){
    const p=read(input.projectId,input.revision);return result({source:compactDocument(p.document),capabilities:{version:STUDIO_VERSION,workflowVersion:1,operations:WORKFLOW_OPERATIONS,limits:{variants:6,previewTimes:8},limitations:WORKFLOW_LIMITATIONS},externalReportCount:(store.db.prepare('SELECT COUNT(*) AS n FROM external_reports WHERE project_id=?').get(p.id) as any).n},p);
  }
  if(op==='workflow.compare'){
    const p=read(input.projectId,input.revision),base=read(input.baseline.projectId,input.baseline.revision);
    if(input.candidateId)authorizeJob(actor.id,input.candidateId,'artifacts');if(input.baselineCandidateId)authorizeJob(actor.id,input.baselineCandidateId,'artifacts');
    const baselineCandidate=input.baselineCandidateId?candidateFiles(store,input.baselineCandidateId,base.id,base.revision):undefined,subjectCandidate=input.candidateId?candidateFiles(store,input.candidateId,p.id,p.revision):undefined;
    return result({...compareWithExport(base.document,p.document,baselineCandidate?.files,subjectCandidate?.files),baseline:ref(base),subject:ref(p),baselineCandidate:baselineCandidate?.identity??null,subjectCandidate:subjectCandidate?.identity??null},p);
  }
  if(op==='workflow.analyze'){
    const p=read(input.projectId,input.revision);if(input.candidateId)authorizeJob(actor.id,input.candidateId,'artifacts');
    const candidate=input.candidateId?candidateFiles(store,input.candidateId,p.id,p.revision):undefined;
    return result({...analyzeDocument(p.document,candidate?.files),candidate:candidate?.identity??null},p);
  }
  if(op.startsWith('workflow.settings.')){
    const p=current();assertAuthoringUnlocked(p.document);const doc=structuredClone(p.document);
    if(input.settings.preview?.camera)assertPreviewCamera(input.settings.preview.camera);
    doc.authoring={...(doc.authoring??{version:1}),...input.settings};return save(p,doc,{settings:doc.authoring});
  }
  if(op==='benchmarks.pin'){
    const p=current();assertAuthoringUnlocked(p.document);const source=read(input.source.projectId,input.source.revision),r=row('external_reports',input.reportId);
    authorizeJob(actor.id,r.report.target.jobId,'read');
    if(canonical(ref(source))!==canonical(input.source)||canonical(input.source)!==canonical({projectId:r.report.target.projectId,revision:r.report.target.revision,snapshotSha256:r.report.target.snapshotSha256}))fail('BENCHMARK_EVIDENCE_MISMATCH','Dowód nie odpowiada rewizji wzorca.');
    const observation=r.report.observations.find((o:any)=>o.id===input.observationId);if(!observation||observation.result!=='pass'||!observation.evidenceIds.length)fail('BENCHMARK_EVIDENCE_REQUIRED','Wzorzec wymaga wskazanej pozytywnej obserwacji z dowodem.');
    const document=structuredClone(p.document);document.authoring={...(document.authoring??{version:1}),benchmark:{source:input.source,reportId:input.reportId,observationId:input.observationId}};
    return save(p,document,{benchmark:document.authoring.benchmark,observationKind:observation.kind,evidenceVerification:r.evidenceVerification});
  }
  if(op==='diagnostics.plan'||op==='iteration.prepare'){
    const writing=op==='iteration.prepare',base=read(input.projectId,input.revision,writing),observed=input.observed?read(input.observed.projectId,input.observed.revision,writing):undefined;
    const conceptTimes=[...new Set((base.document.authoring?.concepts??[]).flatMap(c=>c.markerId?base.document.authoring?.markers?.filter(m=>m.id===c.markerId).map(m=>m.time)??[]:[]))];
    const conditions={...DEFAULT_CONDITIONS,...(base.document.authoring?.preview??{}),...(input.conditions??{}),camera:input.conditions?.camera??base.document.authoring?.preview?.camera??DEFAULT_PREVIEW_CAMERA,times:input.times??(conceptTimes.length?conceptTimes:[Math.min(.5,base.document.duration)])};
    assertPreviewCamera(conditions.camera);
    if(conditions.times.some((t:number)=>t>base.document.duration))fail('TIMING_INVALID','Czas renderu wykracza poza okno wzorca.');
    const specs=input.mode==='single'||!input.layerId?[{id:'control',hypothesis:'Unchanged source',allowedFields:[],verifiedDifferences:[],changes:[],document:structuredClone(base.document)}]:diagnosticVariants(base.document,observed?.document,input.layerId,input.groups??['texture','color','alpha','size'],input.mode??'compare');
    specs.forEach(s=>{assertDocument(s.document);applyChanges({...base.document,locks:[...base.document.locks,...store.project(base.id).document.locks]},s.changes,false);});
    if(!writing)return result({baseline:ref(base),observed:observed?ref(observed):null,conditions,variants:specs.map(s=>({id:s.id,hypothesis:s.hypothesis,allowedFields:s.allowedFields,verifiedDifferences:s.verifiedDifferences,snapshotSha256:hash(canonical(s.document))})),limitations:WORKFLOW_LIMITATIONS},base);
    authorize(actor.id,undefined,'create');for(const p of [base,...(observed?[observed]:[])])for(const scope of ['edit','build','export',...(input.render===false?[]:['render'])])authorize(actor.id,p.id,scope,true);
    if(input.render!==false&&!context.renderAvailable)fail('CAPABILITY_UNAVAILABLE','Renderer nie jest dostępny.');
    if((store.db.prepare("SELECT count(*) n FROM jobs WHERE status IN ('queued','running')").get() as any).n>=32)fail('LIMIT_EXCEEDED','Kolejka osiągnęła limit32.');
    const jobId=id(),variants=specs.map(s=>{
      const p=context.newProject(s.document,undefined,operationId,actor,base.id);return{id:s.id,project:ref(p),document:p.document,hypothesis:s.hypothesis,allowedFields:s.allowedFields,verifiedDifferences:s.verifiedDifferences};
    });
    const snapshot:IterationSnapshot={version:1,baseline:ref(base),...(observed?{observed:ref(observed),observedDocument:observed.document}:{}),baselineDocument:base.document,variants,conditions,binary:input.binary??true,render:input.render!==false,format:input.format??'png',studioVersion:STUDIO_VERSION};
    const job:Job={id:jobId,jobId,projectId:base.id,revision:base.revision,actorId:actor.id,sourceProjectIds:[...new Set([base.id,...(observed?[observed.id]:[]),...variants.map(v=>v.project.projectId)])],type:'iteration.prepare',status:'queued',createdAt:now(),updatedAt:now(),artifacts:[]};
    store.saveJob(job,canonical(snapshot),JSON.stringify(input));return{data:job,projectId:base.id,status:'accepted'};
  }
  if(op==='jobs.resume'){
    authorizeJob(actor.id,input.jobId,'build',true);const r=store.db.prepare('SELECT value,snapshot FROM jobs WHERE id=?').get(input.jobId) as any,job=JSON.parse(r.value) as Job,s=JSON.parse(r.snapshot) as IterationSnapshot;
    if(job.type!=='iteration.prepare')fail('RESUME_UNSUPPORTED','Wznawianie dotyczy iteracji.');
    for(const projectId of job.sourceProjectIds??[])for(const scope of ['read','build','export',...(s.render?['render']:[])])authorize(actor.id,projectId,scope,true);
    if(!['failed','blocked','cancelled'].includes(job.status))return{data:job,projectId:job.projectId};
    if(job.actorId!==actor.id)fail('FORBIDDEN','Iterację wznawia ten sam wykonawca; właściciel może utworzyć własną iterację.');
    if(s.studioVersion!==STUDIO_VERSION)fail('ITERATION_VERSION_MISMATCH','Wersja zadania różni się od bieżącej usługi.');
    job.status='queued';delete job.error;job.updatedAt=now();store.saveJob(job);return{data:job,projectId:job.projectId,status:'accepted'};
  }
  if(op==='components.publish'){
    const p=read(input.projectId,input.revision,true);if(!input.layerIds.length&&!input.audioClipIds.length)fail('COMPONENT_EMPTY','Wybierz warstwę lub klip.');
    if(new Set(input.layerIds).size!==input.layerIds.length||new Set(input.audioClipIds).size!==input.audioClipIds.length)fail('VALIDATION_ERROR','Wybór komponentu zawiera duplikaty.');
    for(const layerId of input.layerIds)if(!p.document.layers.some(l=>l.id===layerId))fail('NOT_FOUND','Brak wybranej warstwy.');
    for(const clipId of input.audioClipIds)if(!p.document.audioClips?.some(c=>c.id===clipId))fail('NOT_FOUND','Brak wybranego klipu.');
    const component={id:id(),name:input.name,source:ref(p),selection:{layerIds:input.layerIds,audioClipIds:input.audioClipIds},limitations:input.limitations??[],createdAt:now(),actorId:actor.id,lifecycle:p.document.lifecycle??'legacy-impact'};
    store.db.prepare('INSERT INTO components(id,project_id,value) VALUES(?,?,?)').run(component.id,p.id,JSON.stringify(component));return result({component},p);
  }
  if(op==='components.list'){
    const items=(store.db.prepare('SELECT value FROM components ORDER BY rowid DESC').all() as any[]).map(r=>JSON.parse(r.value)).filter(c=>{try{if(input.projectId&&c.source.projectId!==input.projectId)return false;authorize(actor.id,c.source.projectId,'read');return true;}catch{return false;}});
    return result({items:items.slice(0,100),truncated:items.length>100});
  }
  if(op.startsWith('components.insert.')){
    const p=current(),component=row('components',input.componentId),source=read(component.source.projectId,component.source.revision);
    if(ref(source).snapshotSha256!==component.source.snapshotSha256)fail('SNAPSHOT_HASH_MISMATCH','Źródło komponentu nie odpowiada hashom.');
    const inserted=insertComponent(p.document,source.document,component.selection,input.prefix);
    inserted.document.authoring={...(inserted.document.authoring??{version:1}),components:[...(inserted.document.authoring?.components??[]),{componentId:component.id,source:component.source,mapping:inserted.mapping}]};
    return save(p,inserted.document,{componentId:component.id,mapping:inserted.mapping,dependencies:inserted.dependencies,source:component.source,limitations:component.limitations});
  }
  if(op==='timing.preview'||op==='timing.apply'){
    const p=current(),timing=retimeDocument(p.document,input);return save(p,timing.document,{ratio:timing.ratio,audioProcessing:timing.audioProcessing,audioBytesUnchanged:timing.audioBytesUnchanged,schedule:timing.schedule});
  }
  if(op==='reports.import'){
    const r=input.report,t=r.target,p=read(input.projectId,t.revision,true);authorizeJob(actor.id,t.jobId,'artifacts');
    if(t.projectId!==input.projectId||t.instanceId!==store.config.instanceId||t.workspaceId!==store.config.workspaceId||t.snapshotSha256!==ref(p).snapshotSha256)fail('REPORT_TARGET_MISMATCH','Raport ma inne tożsamości źródła.');
    const jr=store.db.prepare('SELECT value FROM jobs WHERE id=?').get(t.jobId) as any,job=JSON.parse(jr.value) as Job;
    if(job.status!=='succeeded')fail('REPORT_TARGET_MISMATCH','Kandydat nie jest ukończony.');
    if(job.type==='iteration.prepare'){
      const ma=job.artifacts.find(a=>a.name==='diagnostic-manifest.json');if(!ma)fail('REPORT_TARGET_MISMATCH','Brak manifestu iteracji.');
      const manifest=JSON.parse(artifactBytes(store,ma.id).toString()),variant=manifest.variants.find((v:any)=>v.id===t.variantId);
      if(!variant||canonical(variant.project)!==canonical(ref(p))||variant.candidate.sha256!==t.candidateSha256)fail('REPORT_TARGET_MISMATCH','Raport ma inny wariant lub hash kandydata.');
    }else{
      const candidate=job.artifacts.find(a=>a.name==='candidate.zip');if(job.type!=='candidate.build'||t.variantId!==undefined||job.projectId!==p.id||job.revision!==p.revision||!candidate||candidate.sha256!==t.candidateSha256)fail('REPORT_TARGET_MISMATCH','Raport nie odpowiada kandydatowi.');artifactBytes(store,candidate.id);
    }
    const evidenceIds=new Set(r.evidence.map((e:any)=>e.id));if(evidenceIds.size!==r.evidence.length||new Set(r.observations.map((o:any)=>o.id)).size!==r.observations.length||r.observations.some((o:any)=>o.evidenceIds.some((id:string)=>!evidenceIds.has(id))))fail('REPORT_EVIDENCE_INVALID','Niejednoznaczne obserwacje lub brak wskazanego dowodu.');
    if(!Number.isFinite(Date.parse(r.session.startedAt)))fail('REPORT_EVIDENCE_INVALID','Nieprawidłowy czas sesji.');
    const report={id:id(),report:structuredClone(r),receivedAt:now(),actorId:actor.id,targetVerified:true,evidenceVerification:'external-declaration',nativeVerified:false};
    store.db.prepare('INSERT INTO external_reports(id,project_id,value) VALUES(?,?,?)').run(report.id,p.id,JSON.stringify(report));store.event(p.id,{type:'external-report.added',reportId:report.id,revision:p.revision});return result({report},p);
  }
  if(op==='reports.list'){
    const p=read(input.projectId,input.revision),items=(store.db.prepare('SELECT value FROM external_reports WHERE project_id=? ORDER BY rowid DESC').all(p.id) as any[]).map(r=>JSON.parse(r.value)).filter(r=>{
      if(input.revision&&r.report.target.revision!==input.revision)return false;try{authorizeJob(actor.id,r.report.target.jobId,'read');return true;}catch{return false;}
    });return result({items:items.slice(0,100),truncated:items.length>100},p);
  }
  fail('CAPABILITY_UNAVAILABLE','Niezaimplementowana operacja iteracji.');
}
