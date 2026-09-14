import {isBeamFlow} from './beam-flow.js';
import {DomainError, type EffectDocument} from './model.js';
import {axisAngleToQuaternion, sampleMeshLayer, buildMeshGeometry} from './mesh.js';
import {authoredMeshVertices} from './deformation.js';

export const LIFECYCLE_CAPABILITIES = {version:4, minimumStudioVersion:'0.22.0', documentSchemaVersion:13,
  modes:['impact','duration','beam'], default:'impact', durationLayerTypes:['mesh'], loopSeconds:'document.duration (duration only)',
  beam:{minimumStudioVersion:'0.25.0',documentSchemaVersion:16,previewWindow:'document.duration',layerTypes:['beam','emitter'],finiteParticleMinimumStudioVersion:'0.27.0',mixedProfiles:false},
  consumerEffectLifetime:'external', maxPreviewCycles:10, seamTolerance:0.000001,
  deformationPeriod:'integer-multiple-of-1/60-second', phaseIntrospection:false, nativeVerified:false} as const;
export function effectTime(document:EffectDocument,time:number):number {
  return document.lifecycle==='duration' && time>=0 ? time % document.duration : time;
}
export function previewDuration(document:EffectDocument,cycles=1):number {
  if(!Number.isInteger(cycles)||cycles<1||cycles>10||(cycles!==1&&!['duration','beam'].includes(document.lifecycle??''))||document.duration*cycles>30)
    throw new DomainError('VALIDATION_ERROR','Mnożnik podglądu wymaga DUR lub beam, zakresu 1–10 i łącznego czasu do 30 s.');
  if(isBeamFlow(document)&&cycles!==1)throw new DomainError('VALIDATION_ERROR','Skończony strumień ma jeden przebieg; wydłuż czas projektu, aby oglądać pusty ogon.');
  return document.duration*cycles;
}
/** Checks C0 continuity; never changes authored keys or promises matching speed. */
export function durationSeams(document:EffectDocument) {
  if(document.lifecycle!=='duration')return [];
  const fail=(message:string,details?:unknown):never=>{throw new DomainError('DURATION_INCOMPATIBLE',message,details);};
  return document.layers.filter(l=>l.enabled).map(layer=>{
    if(layer.type!=='mesh')return fail('DUR obsługuje obecnie siatki; wyłącz emitery/smugi albo użyj osobnego efektu FnF.',{layerId:layer.id});
    if(layer.start!==0||Math.abs(layer.duration-document.duration)>1e-9)fail('Siatka DUR musi obejmować cały obieg od czasu 0.',{layerId:layer.id});
    if(layer.animation.vertices!==undefined&&Math.abs(document.duration*60-Math.round(document.duration*60))>1e-8)
      fail('Długość deformowanej pętli DUR musi być wielokrotnością 1/60 s; źródło nie zostanie zaokrąglone.',{layerId:layer.id});
    const a=sampleMeshLayer(layer,0),b=sampleMeshLayer(layer,document.duration);
    const qa=axisAngleToQuaternion(a.orientation),qb=axisAngleToQuaternion(b.orientation);
    const verticesA=layer.animation.vertices?authoredMeshVertices(layer,0):buildMeshGeometry(layer.geometry).vertices,verticesB=layer.animation.vertices?authoredMeshVertices(layer,document.duration):verticesA;
    const errors={position:Math.hypot(...a.position.map((v,i)=>v-b.position[i])),
      orientation:Math.min(Math.hypot(...qa.map((v,i)=>v-qb[i])),Math.hypot(...qa.map((v,i)=>v+qb[i]))),
      scale:Math.abs(a.scale-b.scale),alpha:Math.abs(a.alpha-b.alpha),
      vertices:Math.max(0,...verticesA.map((v,i)=>Math.hypot(...v.map((n,j)=>n-verticesB[i][j]))))};
    if(Object.values(errors).some(v=>v>1e-6))fail('Koniec pętli DUR nie zgadza się z początkiem. Popraw jawnie wskazane klucze.',{layerId:layer.id,errors,tolerance:1e-6});
    return {layerId:layer.id,errors,tolerance:1e-6,continuity:'C0',implicitAlphaFade:false};
  });
}
