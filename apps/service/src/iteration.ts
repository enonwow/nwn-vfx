import {zipSync,strToU8,type Zippable} from 'fflate';
import {DomainError,STUDIO_VERSION,type EffectDocument} from '../../../packages/core/src/model.js';
import {type DiagnosticSpec,type RevisionRef,type PreviewConditions,compareDocuments,compactDiff,digestValue} from '../../../packages/core/src/workflow.js';
import {buildCandidate} from '../../../packages/nwn-format/src/index.js';
import {buildCompiledCandidate} from '../../../packages/nwn-format/src/compiled-candidate.js';
import {bindEffectIntegration} from '../../../packages/nwn-format/src/effect-integration.js';
import {binaryProfile} from '../../../packages/core/src/export-profiles.js';
import {documentProfile} from '../../../packages/core/src/model.js';
import {exporterVersion} from '../../../packages/nwn-format/src/mdl-writer.js';
import {hash,canonical,now,type Job,type Store,type Artifact} from './store.js';
import {analyzeDocument,artifactBytes,exportSummary} from './workflow-analysis.js';
import type {Render} from './jobs.js';

export interface IterationSnapshot {
  version:1;baseline:RevisionRef;observed?:RevisionRef;baselineDocument:EffectDocument;observedDocument?:EffectDocument;
  variants:Array<{id:string;project:RevisionRef;document:EffectDocument;hypothesis:string;allowedFields:string[];verifiedDifferences:any[]}>;
  conditions:PreviewConditions&{times:number[]};binary:boolean;render:boolean;format:'png'|'webm';studioVersion:string;
}
const zip=(files:Record<string,Uint8Array>)=>zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,[v,{mtime:new Date('2000-01-01T00:00:00Z')}]])) as Zippable,{level:6});
function normalizedModel(summary:any,modelName:string){
  const models=summary.models.filter((m:any)=>m.file!=='compiled-roundtrip.mdl.txt'&&!m.file.endsWith('.roundtrip.txt'));
  const aliases=new Map(models.map((m:any,index:number)=>[m.modelName,`@model${index}`]));
  const normalize=(value:any):any=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):typeof value==='string'?(aliases.get(value)??value):value;
  return normalize(models.map((m:any)=>({...m,file:undefined,modelName:undefined})));
}
const permittedExport:Record<string,string[]>={texture:['texture','xgrid','ygrid','fps','framestart','frameend'],color:['colorstart','colormid','colorend','diffuse','selfillumcolor'],alpha:['alphastart','alphamid','alphaend','alpha'],size:['sizestart','sizemid','sizeend'],count:['birthrate']};
function verifySoloExport(control:any[],variant:any[]){
  const keyed=(models:any[])=>Object.fromEntries(models.map((m,i)=>[i,{...m,nodes:Object.fromEntries(m.nodes.map((n:any)=>[n.name,n])),animations:Object.fromEntries(m.animations.map((a:any)=>[a.name,{...a,nodes:Object.fromEntries(a.nodes.map((n:any)=>[n.name,n]))}]))}]));
  const rows=compactDiff(keyed(control),keyed(variant));
  if(rows.some(r=>r.after!==null))throw new DomainError('DIAGNOSTIC_EXPORT_MISMATCH','Solo export changed retained data; use a dedicated diagnostic baseline.');
  return rows;
}
export function verifyDiagnosticExport(control:any,variant:any,group:string){
  const differences=compactDiff(control,variant),permitted=permittedExport[group]??[];
  // A root array contains models. Recurse arrays for property-level verification.
  const walk=(a:any,b:any,path=''):any[]=>{
    if(canonical(a)===canonical(b))return [];
    if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>walk(a[k],b[k],path+'/'+k));
    return[{path,before:a??null,after:b??null}];
  };
  const rows=walk(control,variant);
  const invalid=rows.filter(d=>!d.path.split('/').some((p:string)=>permitted.includes(p)));
  if(invalid.length)throw new DomainError('DIAGNOSTIC_EXPORT_MISMATCH',`Eksport zmienił dane spoza grupy ${group}: ${invalid.slice(0,6).map(d=>d.path).join(', ')}`,{group,paths:invalid.slice(0,16).map(d=>d.path)});
  return rows;
}
export async function runIteration(store:Store,job:Job,snapshot:IterationSnapshot,authorize:(actorId:string,projectId:string,scope:string,writing:boolean)=>void,render:Render|undefined,signal:AbortSignal){
  if(snapshot.studioVersion!==STUDIO_VERSION)throw new DomainError('ITERATION_VERSION_MISMATCH','Wznów zadanie w tej samej wersji Studio albo utwórz nową iterację.');
  for(const v of snapshot.variants)if(hash(canonical(v.document))!==v.project.snapshotSha256)throw new DomainError('SNAPSHOT_HASH_MISMATCH','Wariant nie odpowiada przypiętym danym.');
  const access=()=>{
    if(signal.aborted)throw new DomainError('CANCELLED','Iteracja została anulowana.');
    for(const projectId of job.sourceProjectIds??[job.projectId])for(const scope of ['read','build','export',...(snapshot.render?['render']:[])])authorize(job.actorId,projectId,scope,true);
  };
  const stages:any[]=[];
  const update=()=>{job.metadata={iterationVersion:1,stageCount:snapshot.variants.length*(snapshot.render?snapshot.conditions.times.length+2:2)+1,stages:[...stages],nativeVerified:false};job.updatedAt=now();store.saveJob(job);};
  async function step(key:string,projectId:string,fingerprintInput:any,work:()=>Promise<{files:Record<string,Uint8Array>;detail?:any}>){
    access();const fingerprint=hash(canonical({version:STUDIO_VERSION,key,input:fingerprintInput}));
    const previous=store.db.prepare('SELECT fingerprint,value FROM iteration_steps WHERE job_id=? AND step_key=?').get(job.id,key) as any;
    const start=performance.now();
    if(previous){
      if(previous.fingerprint!==fingerprint)throw new DomainError('ITERATION_CHECKPOINT_MISMATCH','Dane etapu zmieniły się; utwórz nową iterację.');
      const record=JSON.parse(previous.value),files:Record<string,Uint8Array>={};for(const a of record.artifacts)files[a.logicalName]=artifactBytes(store,a.id);
      stages.push({key,status:'succeeded',milliseconds:performance.now()-start,reused:true});update();return{files,detail:record.detail};
    }
    // Only immutable render bytes are shared across jobs. Candidate names and
    // handoffs belong to each new iteration and are rebuilt for that identity.
    if(key.includes('-render-')){
      const cached=store.db.prepare('SELECT s.value,j.value AS job FROM iteration_steps s JOIN jobs j ON j.id=s.job_id WHERE s.fingerprint=? AND j.actor_id=? AND s.job_id<>? ORDER BY j.rowid DESC LIMIT 16').all(fingerprint,job.actorId,job.id) as any[];
      for(const item of cached){
        const old=JSON.parse(item.job) as Job;
        try{for(const sourceId of old.sourceProjectIds??[old.projectId])for(const scope of ['read','render'])authorize(job.actorId,sourceId,scope,false);}catch{continue;}
        const record=JSON.parse(item.value),files:Record<string,Uint8Array>={};
        try{for(const a of record.artifacts)files[a.logicalName]=artifactBytes(store,a.id);}catch{continue;}
        store.db.transaction(()=>{
          const artifacts=Object.entries(files).map(([name,data])=>({...store.artifact(projectId,`${key}.${name}`.slice(0,101),data,job.id),logicalName:name}));
          store.db.prepare('INSERT INTO iteration_steps(job_id,step_key,fingerprint,value) VALUES(?,?,?,?)').run(job.id,key,fingerprint,JSON.stringify({artifacts,detail:record.detail}));
        })();
        stages.push({key,status:'succeeded',milliseconds:performance.now()-start,reused:true,sourceJobId:old.id});update();return{files,detail:record.detail};
      }
    }
    stages.push({key,status:'running',milliseconds:0,reused:false});update();
    const result=await work();access();
    const bytes=Object.values(result.files).reduce((n,b)=>n+b.length,0);if(bytes>256*1024*1024)throw new DomainError('LIMIT_EXCEEDED','Etap przekracza256MiB.');
    store.db.transaction(()=>{
      const artifacts=Object.entries(result.files).map(([name,data])=>({...store.artifact(projectId,`${key}.${name}`.slice(0,101),data,job.id),logicalName:name}));
      store.db.prepare('INSERT INTO iteration_steps(job_id,step_key,fingerprint,value) VALUES(?,?,?,?)').run(job.id,key,fingerprint,JSON.stringify({artifacts,detail:result.detail??null}));
      stages[stages.length-1]={key,status:'succeeded',milliseconds:performance.now()-start,reused:false};update();
    })();return result;
  }
  const archive:Record<string,Uint8Array>={},variants:any[]=[],resources=new Map<string,string>(),previewArtifacts:Array<{name:string;data:Uint8Array}>=[];let controlModel:any;
  const comparison=compareDocuments(snapshot.baselineDocument,snapshot.observedDocument??snapshot.baselineDocument);
  archive['comparison.json']=strToU8(JSON.stringify(comparison,null,2));
  for(const v of snapshot.variants){
    const modelName='vfx'+hash(job.id+':'+v.id).slice(0,12),profileId=snapshot.binary?binaryProfile(v.document.lifecycle):documentProfile(v.document.lifecycle);
    const built=await step(`${v.id}-build`,v.project.projectId,{source:v.project,exporter:exporterVersion(v.document,snapshot.binary),modelName,profileId},async()=>{
      const candidate=snapshot.binary?await buildCompiledCandidate(v.document,modelName,signal):buildCandidate(v.document,modelName);bindEffectIntegration(candidate,v.document,{projectId:v.project.projectId,revision:v.project.revision});
      const handoff={contractVersion:'0.1.0',schemaVersion:1,instanceId:store.config.instanceId,workspaceId:store.config.workspaceId,projectId:v.project.projectId,revision:v.project.revision,jobId:job.id,variantId:v.id,snapshotSha256:v.project.snapshotSha256,profileId,
        artifacts:candidate.files.map(f=>({name:f.name,fileName:f.name,size:f.data.length,sha256:hash(f.data)})),metadata:{modelName,validation:candidate.validation},nativeVerified:false};
      const files=Object.fromEntries(candidate.files.map(f=>[f.name,f.data]));files['handoff.json']=strToU8(JSON.stringify(handoff,null,2));
      return{files:{'candidate.zip':zip(files)},detail:{summary:exportSummary(candidate.files),analysis:analyzeDocument(v.document,candidate.files)}};
    });
    const summary=built.detail.summary,normalized=normalizedModel(summary,modelName);
    const exportDifferences=v.id==='control'||v.id==='single'?[]:v.id==='solo'?verifySoloExport(controlModel,normalized):verifyDiagnosticExport(controlModel,normalized,v.id==='white'?'texture':v.id);
    if(v.id==='control')controlModel=normalized;
    for(const resource of summary.resources){if(resources.has(resource.name)&&resources.get(resource.name)!==resource.sha256)throw new DomainError('RESOURCE_COLLISION','Zasoby wariantów mają tę samą nazwę i różne bajty.',{name:resource.name});resources.set(resource.name,resource.sha256);}
    const path=`variants/${v.id}`,candidate=built.files['candidate.zip'];archive[`${path}/candidate.zip`]=candidate;
    const analyzed=await step(`${v.id}-analysis`,v.project.projectId,{source:v.project,candidateSha256:hash(candidate),version:1},async()=>({files:{'analysis.json':strToU8(JSON.stringify({...built.detail.analysis,exportDifferences},null,2))}}));
    archive[`${path}/analysis.json`]=analyzed.files['analysis.json'];
    const previews:any[]=[];
    if(snapshot.render){
      if(!render)throw new DomainError('CAPABILITY_UNAVAILABLE','Renderer nie jest dostępny.');
      for(const [i,time] of snapshot.conditions.times.entries()){
        const rendered=await step(`${v.id}-render-${i}`,v.project.projectId,{sourceSnapshotSha256:v.project.snapshotSha256,conditions:snapshot.conditions,time,rendererVersion:STUDIO_VERSION,format:snapshot.format},async()=>{
          const {times,...conditions}=snapshot.conditions;const result=await render(v.document,{time,format:snapshot.format,camera:snapshot.conditions.camera,conditions,signal});return{files:Object.fromEntries(result.files.map(f=>[f.name,f.data])),detail:result.metadata};
        });
        const name=`preview.${snapshot.format}`,bytes=rendered.files[name],dest=`${path}/preview-${String(i).padStart(3,'0')}.${snapshot.format}`;
        archive[dest]=bytes;previewArtifacts.push({name:`${v.id}-preview-${String(i).padStart(3,'0')}.${snapshot.format}`,data:bytes});previews.push({path:dest,time,sha256:hash(bytes),size:bytes.length});
        if(snapshot.format==='webm')break;
      }
    }
    variants.push({id:v.id,hypothesis:v.hypothesis,source:snapshot.baseline,project:v.project,allowedFields:v.allowedFields,verifiedDifferences:v.verifiedDifferences,exportDifferences,
      candidate:{path:`${path}/candidate.zip`,sha256:hash(candidate),size:candidate.length,profileId,modelName},resources:summary.resources,analysisPath:`${path}/analysis.json`,previews});
  }
  access();
  const concepts=(snapshot.baselineDocument.authoring?.concepts??[]).map(c=>{
    const asset=snapshot.baselineDocument.assets!.find(a=>a.id===c.assetId)!,bytes=Buffer.from(asset.pngBase64,'base64'),path=`concepts/${c.assetId}.png`,time=snapshot.baselineDocument.authoring?.markers?.find(m=>m.id===c.markerId)?.time;
    archive[path]=bytes;previewArtifacts.push({name:`concept-${c.assetId.slice(0,16)}.png`,data:bytes});
    return{...c,path,source:snapshot.baseline,sha256:hash(bytes),size:bytes.length,...(time===undefined?{}:{time}),comparisons:variants.map(v=>({variantId:v.id,previews:v.previews.filter((p:any)=>time===undefined||Math.abs(p.time-time)<1e-8).map((p:any)=>p.path)}))};
  });
  const manifest={schemaVersion:1,kind:'nwn-vfx-diagnostic-bundle',instanceId:store.config.instanceId,workspaceId:store.config.workspaceId,jobId:job.id,baseline:snapshot.baseline,conditions:snapshot.conditions,variants,concepts,nativeVerified:false};
  const manifestBytes=strToU8(JSON.stringify(manifest,null,2));archive['diagnostic-manifest.json']=manifestBytes;
  const packed=await step('bundle',job.projectId,{manifestSha256:hash(manifestBytes),files:Object.entries(archive).map(([name,b])=>({name,sha256:hash(b)}))},async()=>({files:{'diagnostic.zip':zip(archive)}}));
  return{files:[{name:'diagnostic-manifest.json',data:manifestBytes},{name:'comparison.json',data:archive['comparison.json']},{name:'diagnostic.zip',data:packed.files['diagnostic.zip']},...previewArtifacts],metadata:{iterationVersion:1,stages,variantCount:variants.length,conditions:snapshot.conditions,nativeVerified:false}};
}
