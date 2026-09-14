import {isBeamFlow,boundEmitters} from '../../core/src/beam-flow.js';
import {durationSeams} from '../../core/src/lifecycle.js';
import {createHash} from 'node:crypto';
import {DomainError, type EffectDocument} from '../../core/src/model.js';
import type {CandidateResult} from './index.js';
import {beamMotionSummaries} from '../../core/src/beam-motion.js';

export interface EffectIntegration {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6;
  projectId: string | null;
  revision: number | null;
  snapshotSha256: string;
  documentSha256: string;
  model: {resref: string; file: string; sha256: string};
  orientWithObject: boolean;
  visualeffects2da: {rowId: null; columns: {OrientWithObject: 0 | 1; Type_FD?:'F'|'D'|'B'; ProgFX_Duration?:null; SoundDuration?:'****'}};
  beam?: {profile:'lightning-linked-v1'|'fountain-p2p-bezier-finite-v1';progfx2da:{rowId:null;columns:{Type:7;Param1:string}&({Param6:'cast01';Param2?:never}|{Param2:'cast01';Param6?:never})};
    consumerBinding:'visualeffects.ProgFX_Duration = allocated progfx row';externalLifetime:true;nativeFlowControl:boolean;
    nativeMotion?:ReturnType<typeof beamMotionSummaries>;
    finite?:{artifact:'beam-flow.json';duration:number;removeNoEarlierThan:number;direction:'source-to-target'|'target-to-source'};
    start:'continuous-on-application'|'cast01-on-application';stop:'consumer-removes-effect'|'finite-gate-then-consumer-removes-effect';cessationAnimation:false;sourceNode:'consumer';targetBodyPart:'consumer';referenceModel:'fx_ref'};
  lifecycle?: {mode:'impact'|'duration';animation:'impact'|'duration';loopSeconds:number|null;consumerLifetime:'external';phaseOnRemoval:'unknown';seams:ReturnType<typeof durationSeams>};
  resourceBinding?: {modelResref:string;allowedColumns:string[];selection:'consumer'};
  nativeVerified: false;
}
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
// Same sorted-key snapshot representation as the service; no service dependency.
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>(value as any)[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical((value as any)[k])).join(',')+'}';
  return JSON.stringify(value);
}
/** Bind to the final model bytes, after optional compilation. The row fragment
 * stays outside the resource HAK. Only a service job supplies revision identity. */
export function bindEffectIntegration(result:CandidateResult,document:EffectDocument,context?:{projectId:string;revision:number}):CandidateResult {
  const modelName=result.validation.modelName,file=`${modelName}.mdl`;
  const model=result.files.find(f=>f.name===file),source=result.files.find(f=>f.name==='effect-document.json');
  if(!model||!source)throw new DomainError('EXPORT_VALIDATION_FAILED','Brak modelu lub dokumentu instrukcji integracji.');
  const orientWithObject=document.orientWithObject??false;
  const effect:EffectIntegration={schemaVersion:1,projectId:context?.projectId??null,revision:context?.revision??null,
    snapshotSha256:sha(canonical(document)),documentSha256:sha(source.data),model:{resref:modelName,file,sha256:sha(model.data)},
    orientWithObject,visualeffects2da:{rowId:null,columns:{OrientWithObject:orientWithObject?1:0}},nativeVerified:false};
  if(document.lifecycle==='beam'){
    // Retail ApplyBeam 0x815b60 reads param6. Schema 6 corrects the earlier
    // Param2 instruction; persisted schema 3–5 artifacts remain readable.
    effect.schemaVersion=6;effect.visualeffects2da.columns={OrientWithObject:orientWithObject?1:0,Type_FD:'B',ProgFX_Duration:null,SoundDuration:'****'};
    effect.beam={profile:'lightning-linked-v1',progfx2da:{rowId:null,columns:{Type:7,Param1:modelName,Param6:'cast01'}},
      consumerBinding:'visualeffects.ProgFX_Duration = allocated progfx row',externalLifetime:true,nativeFlowControl:false,start:'continuous-on-application',stop:'consumer-removes-effect',cessationAnimation:false,sourceNode:'consumer',targetBodyPart:'consumer',referenceModel:'fx_ref'};
    if(isBeamFlow(document)){
      effect.beam.profile='fountain-p2p-bezier-finite-v1';effect.beam.nativeFlowControl=true;effect.beam.start='cast01-on-application';effect.beam.stop='finite-gate-then-consumer-removes-effect';
      const layers=boundEmitters(document);effect.beam.finite={artifact:'beam-flow.json',duration:document.duration,removeNoEarlierThan:Math.max(...layers.map(l=>l.start+l.duration+l.life)),direction:layers[0].beamBinding!.direction};
    }
    const motion=beamMotionSummaries(document);if(motion.length){effect.beam.nativeFlowControl=true;effect.beam.nativeMotion=motion;}
  }else if(document.lifecycle!==undefined){
    effect.schemaVersion=2;effect.visualeffects2da.columns.Type_FD=document.lifecycle==='duration'?'D':'F';
    effect.lifecycle={mode:document.lifecycle,animation:document.lifecycle,loopSeconds:document.lifecycle==='duration'?document.duration:null,consumerLifetime:'external',phaseOnRemoval:'unknown',seams:durationSeams(document)};
    effect.resourceBinding={modelResref:modelName,allowedColumns:['Imp_HeadCon_Node','Imp_Impact_Node','Imp_Root_M_Node','Imp_Root_L_Node','Imp_Root_H_Node'],selection:'consumer'};
  }
  result.validation.integration.effect=effect;
  const name='vfx-integration.json',data=encode(effect);
  result.files=result.files.filter(f=>f.name!==name&&f.name!=='validation.json');
  result.files.push({name,data});
  result.validation.resources=result.validation.resources.filter(r=>r.name!==name);
  result.validation.resources.push({name,bytes:data.length,sha256:sha(data)});
  const limitation='Whole-effect OrientWithObject is a visualeffects.2da integration instruction in vfx-integration.json. The consumer chooses the row and object attachment. It does not attach ApplyEffectAtLocation, rotate authored geometry or simulate a rotating character. No native proof is provided.';
  if(!result.validation.limitations.includes(limitation))result.validation.limitations.push(limitation);
  result.files.push({name:'validation.json',data:encode(result.validation)});
  return result;
}
