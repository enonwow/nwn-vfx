import {DomainError, type EffectDocument, type Vec3} from './model.js';
import {assertPreviewCamera, type PreviewCamera} from './camera.js';
import {assertMeshDeformationBudget} from './deformation.js';
import {assertTrailBudget} from './trails.js';
import {beamMotionTextureKey} from './beam-motion.js';
import {beamTextureKey} from './beam-texture.js';

export const COMPOSITION_CAPABILITIES = {version:1, minimumStudioVersion:'0.21.0', operation:'preview.compose',
  maxInstances:24, maxLayers:256, maxParticles:32000, maxDuration:30, maxVertexSamples:2000000, maxUvSamples:2000000,
  maxSourceBytes:25165824, maxTextureBytes:67108864, clock:'instance-local-seconds', yawAxis:'+Z',
  audio:'omitted', sourceRevisions:'immutable', nativeVerified:false} as const;
export interface CompositionInstance {id:string; projectId:string; revision:number; start:number; position:Vec3; yawRadians:number; scale?:number; duration?:number; snapshotSha256?:string}
export interface CompositionInput {instances:CompositionInstance[]; duration:number; time?:number; format?:'png'|'webm'; camera?:PreviewCamera; referenceGeometry?:boolean}
export interface CompositionSource {projectId:string; revision:number; snapshotSha256:string; document:EffectDocument}
export interface CompositionSnapshot {compositionVersion:1; input:CompositionInput; sources:CompositionSource[]}
export function validateCompositionInput(input:CompositionInput) {
  const fail=(message:string):never=>{throw new DomainError('VALIDATION_ERROR',message);};
  if(!Number.isFinite(input.duration)||input.duration<.1||input.duration>30)fail('Kompozycja wymaga czasu 0.1–30 s.');
  if(input.time!==undefined&&(!Number.isFinite(input.time)||input.time<0||input.time>input.duration))fail('Czas PNG musi mieścić się w kompozycji.');
  if(!Array.isArray(input.instances)||input.instances.length<1||input.instances.length>24)fail('Kompozycja wymaga 1–24 instancji.');
  const ids=new Set<string>();
  for(const i of input.instances){
    if(ids.has(i.id))fail('ID instancji muszą być unikalne.');ids.add(i.id);
    if(!Number.isFinite(i.start)||i.start<0||i.start>=input.duration)fail('Start instancji musi poprzedzać koniec kompozycji.');
    if(!Array.isArray(i.position)||i.position.length!==3||i.position.some(v=>!Number.isFinite(v)||Math.abs(v)>50))fail('Pozycja wymaga trzech liczb w zakresie ±50 m.');
    if(!Number.isFinite(i.yawRadians)||Math.abs(i.yawRadians)>8*Math.PI)fail('Obrót wymaga radianów w zakresie ±8π.');
    if(i.duration!==undefined&&(!Number.isFinite(i.duration)||i.duration<.1||i.duration>30))fail('Czas instancji wymaga 0.1–30 s.');
    if(i.scale!==undefined&&(!Number.isFinite(i.scale)||i.scale<.01||i.scale>10))fail('Skala musi mieścić się w zakresie 0.01–10.');
  }
  if(input.camera!==undefined)assertPreviewCamera(input.camera);
}
export function compositionSource(snapshot:CompositionSnapshot, instance:CompositionInstance):CompositionSource {
  const source=snapshot.sources.find(s=>s.projectId===instance.projectId&&s.revision===instance.revision);
  if(!source)throw new DomainError('COMPOSITION_SOURCE_MISSING','Brak zamrożonej rewizji instancji.');
  return source;
}
export function assertCompositionBudget(snapshot:CompositionSnapshot) {
  validateCompositionInput(snapshot.input);
  let layers=0,particles=0,vertexSamples=0,uvSamples=0,sourceBytes=0,textureBytes=0;
  const textures=new Set<string>(),sources=new Set<string>();
  for(const i of snapshot.input.instances){
    const s=compositionSource(snapshot,i),d=s.document;
    if(i.duration!==undefined&&!['duration','beam'].includes(d.lifecycle??''))throw new DomainError('DURATION_INCOMPATIBLE','Czas instancji jest dostępny tylko dla DUR.');
    assertTrailBudget(d);const cost=assertMeshDeformationBudget(d);
    layers+=d.layers.length;particles+=d.layers.reduce((n,l)=>n+(l.type==='emitter'?l.count:0),0);
    vertexSamples+=cost.vertexSamples;uvSamples+=cost.uvSamples;
    const key=JSON.stringify([s.projectId,s.revision]);
    if(!sources.has(key)){
      sources.add(key);sourceBytes+=new TextEncoder().encode(JSON.stringify(d)).length;
      for(const a of d.assets??[])if(!textures.has(a.id)){textures.add(a.id);textureBytes+=a.width*a.height*4;}
      for(const l of d.layers)if(l.type==='beam'&&l.enabled&&l.nativeMotion){const atlas=beamMotionTextureKey(l);if(!textures.has(atlas)){textures.add(atlas);textureBytes+=1024*1024*4;}}
      for(const l of d.layers)if(l.type==='beam'&&l.enabled&&l.textureMapping){const key=beamTextureKey(l);if(!textures.has(key)){textures.add(key);const asset=d.assets?.find(a=>'asset:'+a.id===l.texture);textureBytes+=(asset?asset.width*asset.height:128*128)*4;}}
    }
  }
  const usage={instances:snapshot.input.instances.length,layers,particles,vertexSamples,uvSamples,sourceBytes,textureBytes};
  if(layers>256||particles>32000||vertexSamples>2000000||uvSamples>2000000||sourceBytes>25165824||textureBytes>67108864)
    throw new DomainError('LIMIT_EXCEEDED','Przekroczono budżet podglądu kompozycji.',usage);
  return usage;
}
/** Source timelines are clipped explicitly to the common output interval. */
export function compositionManifest(snapshot:CompositionSnapshot) {
  return {compositionVersion:1, duration:snapshot.input.duration, referenceGeometry:snapshot.input.referenceGeometry??true,
    audio:'omitted', nativeVerified:false, budget:assertCompositionBudget(snapshot),
    instances:snapshot.input.instances.map(i=>{const s=compositionSource(snapshot,i);return {...i,scale:i.scale??1,
      snapshotSha256:s.snapshotSha256,documentSchemaVersion:s.document.schemaVersion,sourceDuration:s.document.duration,
      visibleUntil:Math.min(snapshot.input.duration,i.start+(i.duration??s.document.duration)),clipped:i.start+(i.duration??s.document.duration)>snapshot.input.duration};})};
}
