import {applyChanges,DomainError,promoteDocumentSchema,type EffectDocument,type Change,type Layer} from './model.js';
import {sha256Bytes,createTextureAsset,encodePngRgba8,textureAssetMetadata} from './textures.js';
import {audioMetadata} from './audio.js';
import type {PreviewCamera} from './camera.js';

export const WORKFLOW_VERSION='1';
export interface RevisionRef {projectId:string;revision:number;snapshotSha256:string}
export interface PreviewConditions {
  filtering:'legacy-linear'|'export-mipmaps';background:'dark'|'light'|'gray';
  camera?:PreviewCamera;lightIntensity?:number;
  rig?:{id:'schematic-human-v1';height:number;position:[number,number,number];yaw:number;velocity:[number,number,number];anchor:'origin'|'impact'|'left-hand'|'right-hand';attachEffect:boolean};
}
export interface Marker {id:string;name:string;time:number}
export interface EventBinding {targetType:'layer'|'audio';targetId:string;markerId:string;offset:number}
export interface AuthoringState {
  version:1;benchmark?:{source:RevisionRef;reportId:string;observationId:string};
  preview?:PreviewConditions;concepts?:Array<{assetId:string;name:string;markerId?:string}>;
  markers?:Marker[];bindings?:EventBinding[];
  components?:Array<{componentId:string;source:RevisionRef;mapping:Record<string,string>}>;
}
export const DEFAULT_CONDITIONS:PreviewConditions={filtering:'export-mipmaps',background:'dark'};
export const WORKFLOW_LIMITATIONS=[
  'Native appearance, fog, depth soft particles and complete color pipeline are not qualified.',
  'The schematic-human-v1 rig is a measuring aid, not an imported NWN skeleton. Hand markers are preview only; an EffectBeam target hand is not promised.',
  'External evidence is a runner declaration bound to an exact candidate, not automatic artistic approval.',
];
export const canonicalValue=(v:any):string=>Array.isArray(v)?'['+v.map(canonicalValue).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonicalValue(v[k])).join(',')+'}':JSON.stringify(v)??'null';
export const digestValue=(v:any)=>sha256Bytes(new TextEncoder().encode(canonicalValue(v)));
function fail(code:string,message:string):never{throw new DomainError(code,message);}
export function assertAuthoringUnlocked(doc:EffectDocument){if(doc.locks.some(l=>l.layerId==='@effect'&&['*','authoring'].includes(l.field)))fail('LOCKED','Ustawienia iteracji są zablokowane.');}
export function validateAuthoring(doc:EffectDocument){
  const a=doc.authoring;if(!a)return;
  if(doc.schemaVersion<20)fail('VALIDATION_ERROR','Ustawienia iteracji wymagają dokumentu20.');
  const ids=new Set<string>();
  for(const m of a.markers??[]){if(ids.has(m.id)||!Number.isFinite(m.time)||m.time<0||m.time>doc.duration)fail('TIMING_INVALID','Powtórzony znacznik lub czas poza efektem.');ids.add(m.id);}
  const targets=new Set<string>();
  for(const b of a.bindings??[]){
    const key=b.targetType+':'+b.targetId;if(targets.has(key))fail('TIMING_INVALID','Cel ma więcej niż jedno wiązanie początku.');targets.add(key);
    const m=a.markers?.find(m=>m.id===b.markerId),target=b.targetType==='audio'?doc.audioClips?.find(c=>c.id===b.targetId):doc.layers.find(l=>l.id===b.targetId);
    if(!m||!target||!('start' in target)||Math.abs(target.start-(m.time+b.offset))>1e-8)fail('TIMING_BINDING_CONFLICT','Początek warstwy/klipu musi odpowiadać znacznikowi; zmień harmonogram albo usuń wiązanie.');
  }
  for(const c of a.concepts??[])if(!doc.assets?.some(x=>x.id===c.assetId)||(c.markerId&&!ids.has(c.markerId)))fail('CONCEPT_INVALID','Koncept wymaga istniejącej tekstury i wskazanego znacznika.');
}
function smallLayer(l:Layer):any{
  const result:any=structuredClone(l);
  if(l.type==='mesh'){
    const g=l.geometry;result.geometry={kind:g.kind,sha256:digestValue(g),...(g.kind==='custom'?{vertices:g.vertices.length,faces:g.faces.length,uv:g.uv?.length??0}:g)};
    result.animation=Object.fromEntries(Object.entries(l.animation).map(([key,rows])=>[key,{keys:rows!.length,sha256:digestValue(rows),times:rows!.map((r:any)=>r.time)}]));
  }
  if(l.type==='trail')result.path={points:l.path.length,sha256:digestValue(l.path),first:l.path[0],last:l.path.at(-1)};
  return result;
}
export function compactDocument(doc:EffectDocument){
  return {schemaVersion:doc.schemaVersion,name:doc.name,duration:doc.duration,seed:doc.seed,profileId:doc.profileId,lifecycle:doc.lifecycle??'legacy-impact',orientWithObject:doc.orientWithObject??false,
    layers:doc.layers.map(smallLayer),assets:(doc.assets??[]).map(textureAssetMetadata),audioAssets:(doc.audioAssets??[]).map(audioMetadata),audioClips:doc.audioClips??[],locks:doc.locks,authoring:doc.authoring??null};
}
export function compactDiff(before:any,after:any,path=''):Array<{path:string;before:any;after:any}>{
  if(canonicalValue(before)===canonicalValue(after))return [];
  if(before&&after&&!Array.isArray(before)&&!Array.isArray(after)&&typeof before==='object'&&typeof after==='object')return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(k=>compactDiff(before[k],after[k],path+'/'+k));
  return [{path,before:before??null,after:after??null}];
}
export function compareDocuments(before:EffectDocument,after:EffectDocument){
  const a=compactDocument(before),b=compactDocument(after),layers:any[]=[];
  for(const id of new Set([...a.layers,...b.layers].map(l=>l.id))){
    const x=a.layers.find(l=>l.id===id),y=b.layers.find(l=>l.id===id);
    if(!x||!y)layers.push({id,status:x?'removed':'added',value:x??y});
    else{const diffs=compactDiff(x,y);if(diffs.length)layers.push({id,status:'changed',behavior:diffs.filter(d=>d.path!=='/name'),metadata:diffs.filter(d=>d.path==='/name')});}
  }
  const resources=(key:'assets'|'audioAssets')=>({added:b[key].filter(x=>!a[key].some(y=>y.id===x.id)),removed:a[key].filter(x=>!b[key].some(y=>y.id===x.id))});
  return{layers,textures:resources('assets'),audio:resources('audioAssets'),effect:compactDiff({...a,layers:undefined,assets:undefined,audioAssets:undefined},{...b,layers:undefined,assets:undefined,audioAssets:undefined}),
    conclusion:'Differences identify changed inputs; they do not establish a single cause of native visibility.',nativeVerified:false};
}
export const DIAGNOSTIC_FIELDS={texture:['texture','flipbook'],color:['color','midColor','endColor'],alpha:['alpha','midAlpha','endAlpha'],size:['size','midSize','endSize'],count:['count']} as const;
export interface DiagnosticSpec {id:string;hypothesis:string;allowedFields:string[];changes:Change[];document:EffectDocument;verifiedDifferences:any[]}
export function diagnosticVariants(base:EffectDocument,observed:EffectDocument|undefined,layerId:string,groups:string[],mode:'compare'|'white-control'|'solo'='compare'):DiagnosticSpec[]{
  const l=base.layers.find(l=>l.id===layerId);if(!l)fail('NOT_FOUND','Brak warstwy wzorca.');
  const add=(id:string,hypothesis:string,changes:Change[],allowedFields:string[],assets=base.assets)=>{
    const withAssets={...structuredClone(base),assets},document=applyChanges(withAssets,changes,false);
    const diffs=compactDiff(smallLayer(l),smallLayer(document.layers.find(x=>x.id===layerId)!));
    if(mode!=='solo'&&diffs.some(d=>!allowedFields.includes(d.path.slice(1))))fail('DIAGNOSTIC_ISOLATION_FAILED','Wariant zmienił pole spoza hipotezy.');
    return{id,hypothesis,allowedFields,changes,document,verifiedDifferences:diffs};
  };
  const result=[add('control','Unchanged baseline control',[],[])];
  if(mode==='solo'){
    const changes:Change[]=base.layers.filter(x=>x.id!==layerId&&x.enabled).map(x=>({type:'layer.set',layerId:x.id,values:{enabled:false}}));
    for(const c of base.audioClips??[])if(c.enabled)changes.push({type:'audio.set',clipId:c.id,values:{enabled:false}});
    result.push(add('solo','Only the selected layer enabled',changes,['enabled']));return result;
  }
  if(mode==='white-control'){
    if(!('texture' in l))fail('DIAGNOSTIC_UNSUPPORTED','Biała kontrola wymaga teksturowanej warstwy.');
    const asset=createTextureAsset('opaque-white-control.png',BufferLikeBase64(encodePngRgba8({width:8,height:8,rgba:new Uint8Array(8*8*4).fill(255)})));
    const assets=[...(base.assets??[])];if(!assets.some(a=>a.id===asset.id))assets.push(asset);
    result.push(add('white','Only replace the texture with an opaque white control',[{type:'layer.set',layerId,values:{texture:`asset:${asset.id}`,...(l.type==='emitter'&&l.flipbook?{flipbook:null}:{})}}],['texture','flipbook'],assets));return result;
  }
  const target=observed?.layers.find(x=>x.id===layerId);if(!target||target.type!==l.type)fail('DIAGNOSTIC_UNSUPPORTED','Porównanie wymaga tej samej warstwy i typu w obu rewizjach.');
  for(const group of groups){
    const fields=DIAGNOSTIC_FIELDS[group as keyof typeof DIAGNOSTIC_FIELDS];if(!fields)fail('DIAGNOSTIC_UNSUPPORTED','Nieznana grupa porównania.');
    const values:any={};for(const f of fields){if(Object.hasOwn(target,f))values[f]=(target as any)[f];else if(Object.hasOwn(l,f))values[f]=null;}
    if(!Object.keys(values).length)continue;
    let assets=base.assets;
    if(group==='texture'&&typeof values.texture==='string'&&values.texture.startsWith('asset:')){
      const asset=observed!.assets?.find(a=>`asset:${a.id}`===values.texture);if(!asset)fail('ASSET_NOT_FOUND','Brak zależności tekstury.');
      assets=[...(base.assets??[])];if(!assets.some(a=>a.id===asset.id))assets.push(asset);
    }
    const changes:Change[]=[{type:'layer.set',layerId,values}];
    const variant=add(group,`Only ${group} from observed revision; not a proven cause`,changes,[...fields],assets);
    if(variant.verifiedDifferences.length)result.push(variant);
  }
  return result;
}
function BufferLikeBase64(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}

export function retimeDocument(source:EffectDocument,input:{period?:number;markers?:Marker[];bindings?:EventBinding[]}){
  assertAuthoringUnlocked(source);
  const next=structuredClone(source),changes:Change[]=[],ratio=input.period===undefined?1:input.period/source.duration;
  const authoring:AuthoringState=structuredClone(source.authoring??{version:1});
  authoring.markers=input.markers??(authoring.markers??[]).map(m=>({...m,time:m.time*ratio}));
  authoring.bindings=input.bindings??(authoring.bindings??[]).map(b=>({...b,offset:b.offset*ratio}));
  if(ratio!==1){
    changes.push({type:'project.set',values:{duration:input.period!}});
    for(const l of source.layers){
      if(l.type==='beam')continue;
      const values:any={start:l.start*ratio,duration:l.duration*ratio};
      if(l.type==='mesh')values.animation=Object.fromEntries(Object.entries(l.animation).map(([k,rows])=>[k,rows!.map((r:any)=>({...r,time:r.time*ratio}))]));
      else if(l.type==='trail'){values.path=l.path.map(p=>({...p,time:p.time*ratio}));values.tailLifetime=l.tailLifetime*ratio;}
      else{values.life=l.life*ratio;values.speed=l.speed/ratio;values.gravity=l.gravity/(ratio*ratio);if(l.beamBinding?.pulse)values.beamBinding={...l.beamBinding,pulse:{...l.beamBinding.pulse,period:l.beamBinding.pulse.period*ratio}};}
      changes.push({type:'layer.set',layerId:l.id,values});
    }
    for(const c of source.audioClips??[])changes.push({type:'audio.set',clipId:c.id,values:{start:c.start*ratio}});
  }
  for(const binding of authoring.bindings??[]){
    const m=authoring.markers?.find(m=>m.id===binding.markerId);if(!m)fail('TIMING_INVALID','Wiązanie wskazuje nieistniejący znacznik.');
    const start=m.time+binding.offset;
    changes.push(binding.targetType==='audio'?{type:'audio.set',clipId:binding.targetId,values:{start}}:{type:'layer.set',layerId:binding.targetId,values:{start}});
  }
  const document=applyChanges(next,changes,false);document.authoring=authoring;promoteDocumentSchema(document);
  for(const c of document.audioClips??[])if(c.enabled&&c.start+c.duration>document.duration+1e-8)fail('RETIME_AUDIO_TRIM_REQUIRED','Klip nie mieści się po zmianie okresu. Wybierz krótszy klip lub jawnie zmień trim; nagranie nie zostało rozciągnięte.');
  validateAuthoring(document);
  return{document,changes,ratio,audioProcessing:'none',audioBytesUnchanged:digestValue(source.audioAssets)===digestValue(document.audioAssets),
    schedule:(authoring.bindings??[]).map(b=>({...b,time:authoring.markers!.find(m=>m.id===b.markerId)!.time+b.offset,repeatPeriod:document.lifecycle==='duration'?document.duration:null,stopRule:'Do not dispatch repetitions at or after external stop; an issued clip may finish.'}))};
}

export function insertComponent(target:EffectDocument,source:EffectDocument,selection:{layerIds:string[];audioClipIds:string[]},prefix:string){
  assertAuthoringUnlocked(target);
  if((target.lifecycle??'legacy-impact')!==(source.lifecycle??'legacy-impact'))fail('COMPONENT_LIFECYCLE_MISMATCH','Komponent wymaga tego samego lifecycle.');
  const layers=selection.layerIds.map(id=>source.layers.find(l=>l.id===id)??fail('NOT_FOUND','Brak warstwy komponentu.'));
  const clips=selection.audioClipIds.map(id=>source.audioClips?.find(c=>c.id===id)??fail('NOT_FOUND','Brak klipu komponentu.'));
  const mapping=Object.fromEntries([...layers,...clips].map(x=>[x.id,`${prefix}-${x.id}`]));
  if(Object.values(mapping).some(id=>id.length>100))fail('LIMIT_EXCEEDED','Identyfikator po mapowaniu jest za długi.');
  const document=structuredClone(target),textureIds=new Set(layers.flatMap(l=>('texture'in l&&l.texture?.startsWith('asset:'))?[l.texture.slice(6)]:[])),audioIds=new Set(clips.map(c=>c.assetId));
  const copiedAssets=source.assets?.filter(a=>textureIds.has(a.id))??[],copiedAudio=source.audioAssets?.filter(a=>audioIds.has(a.id))??[];
  for(const a of copiedAssets)if(!document.assets?.some(x=>x.id===a.id))(document.assets??=[]).push(structuredClone(a));
  for(const a of copiedAudio)if(!document.audioAssets?.some(x=>x.id===a.id))(document.audioAssets??=[]).push(structuredClone(a));
  const changes:Change[]=[...layers.map(l=>({type:'layer.add' as const,layer:{...structuredClone(l),id:mapping[l.id]}})),...clips.map(c=>({type:'audio.add' as const,clip:{...structuredClone(c),id:mapping[c.id]}}))];
  const result=applyChanges(document,changes,false);
  // Copy restrictions, never strip source locks when reusing a component.
  result.locks.push(...source.locks.filter(l=>Object.hasOwn(mapping,l.layerId)).map(l=>({...l,layerId:mapping[l.layerId]})));
  const bindings=(source.authoring?.bindings??[]).filter(b=>Object.hasOwn(mapping,b.targetId)),markerIds=new Set(bindings.map(b=>b.markerId));
  const markers=(source.authoring?.markers??[]).filter(m=>markerIds.has(m.id)),markerMapping=Object.fromEntries(markers.map(m=>[m.id,`${prefix}-phase-${m.id}`]));
  if(markers.length){
    result.authoring??={version:1};
    result.authoring.markers=[...(result.authoring.markers??[]),...markers.map(m=>({...m,id:markerMapping[m.id]}))];
    result.authoring.bindings=[...(result.authoring.bindings??[]),...bindings.map(b=>({...b,targetId:mapping[b.targetId],markerId:markerMapping[b.markerId]}))];
  }
  return{document:result,mapping,dependencies:{textures:copiedAssets.map(a=>a.id),audio:copiedAudio.map(a=>a.id),markers:markerMapping},changes};
}
