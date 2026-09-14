import {DomainError,type BeamLayer,type EffectDocument,type Vec3} from './model.js';
import {BEAM_FLOW_CAPABILITIES} from './beam-flow-types.js';
import {isBeamFlow,validateBeamFlow} from './beam-flow.js';
import {BEAM_TEXTURE_MAPPING} from './beam-texture-types.js';
import {validateBeamTextureMapping} from './beam-texture.js';
import {BEAM_MATERIAL_MOTION,usesMaterialMotion,validateMaterialMotion,validatePeriodicPixels} from './beam-material-motion.js';
import {resolveTexture} from './textures.js';
import {BEAM_MOTION,validateBeamMotion} from './beam-motion.js';
import {BEAM_SOFT_TEXTURE,usesExtendedBeam} from './beam-multistrand.js';
import {assertAudioDocument} from './audio.js';
import {BEAM_AUDIO_CAPABILITIES} from './beam-audio-types.js';

export const BEAM_CAPABILITIES={version:9,audio:BEAM_AUDIO_CAPABILITIES,materialMotion:BEAM_MATERIAL_MOTION,particleFlow:BEAM_FLOW_CAPABILITIES,softTexture:BEAM_SOFT_TEXTURE,textureMapping:BEAM_TEXTURE_MAPPING,minimumStudioVersion:'0.25.0',minimumSafeExporterVersion:'0.26.1',nativePointCount:'segments+1',documentSchemaVersion:16,nativeMotion:BEAM_MOTION,
  profile:'lightning-linked-v1',maxLayers:8,maxDistance:30,widthUnits:'metres',
  nativeUpdate:'Lightning',nativeRender:'Linked',referenceModel:'fx_ref',referenceReattachable:true,
  lifetime:'external',nativeFlowControl:false,flowPreviewOnly:true,previewNativeParity:false,nativeVerified:false} as const;
export function makeBeamLayer(id:string,name='Własny beam'):BeamLayer {
  return {id,name,type:'beam',enabled:true,color:'#9b152b',alpha:.8,width:.045,texture:'glow',blend:'additive',
    source:[0,0,1.2],target:[0,3,1.2],radius:.08,delay:.05,lightningScale:.15,
    segments:16,seed:42,flow:{direction:'target-to-source',speed:1.2}};
}
export function validateBeam(layer:BeamLayer) {
  validateMaterialMotion(layer);validateBeamMotion(layer);validateBeamTextureMapping(layer);
  const fail=(message:string):never=>{throw new DomainError('BEAM_INVALID',message,{layerId:layer.id});};
  for(const v of [layer.source,layer.target])if(!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>20))fail('Punkty beama wymagają trzech współrzędnych ±20 m.');
  const distance=Math.hypot(...layer.target.map((n,i)=>n-layer.source[i]));
  if(distance<.05||distance>30)fail('Odległość punktów beama musi wynosić 0,05–30 m.');
  for(const [value,min,max] of [[layer.width,.001,.5],[layer.alpha,0,1],[layer.radius,0,1],[layer.delay,0,1],[layer.lightningScale,0,1],[layer.flow?.speed,0,10]])
    if(!Number.isFinite(value)||value<min||value>max)fail('Parametr beama poza zakresem.');
  if(![2,4,8,16,32,64].includes(layer.segments)||!Number.isInteger(layer.seed)||layer.seed<0||layer.seed>2147483647)fail('Nieprawidłowa liczba segmentów lub seed.');
  if(!/^#[0-9a-f]{6}$/i.test(layer.color)||!['normal','additive'].includes(layer.blend)||!['source-to-target','target-to-source'].includes(layer.flow.direction))fail('Nieprawidłowy kolor, materiał lub kierunek podglądu.');
}
export function validateBeamDocument(document:EffectDocument) {
  validateBeamFlow(document);
  if(usesMaterialMotion(document)&&document.schemaVersion<23)throw new DomainError('BEAM_MATERIAL_MOTION_INVALID','materialMotion wymaga dokumentu 23.');
  for(const l of document.layers)if(Object.hasOwn(l,'materialMotion')){
    if(l.type!=='beam')throw new DomainError('BEAM_MATERIAL_MOTION_INVALID','materialMotion wymaga warstwy beam.');
    validateMaterialMotion(l);validatePeriodicPixels(resolveTexture(document,l.texture));
    if(l.enabled&&document.layers.filter(n=>n.enabled&&n.type==='beam').length!==1)throw new DomainError('BEAM_MATERIAL_MOTION_INVALID','Profil okresowy wymaga jednej aktywnej warstwy beam.');
  }
  if(usesExtendedBeam(document)&&document.schemaVersion<22)throw new DomainError('BEAM_INVALID','Wiele nitek lub beam-soft wymaga dokumentu 22.');
  for(const l of document.layers)if(l.texture==='beam-soft'){
    if(l.type!=='beam'||l.nativeMotion||(l.textureMapping&&(l.textureMapping.axis!=='v'||l.textureMapping.fit!=='source')))
      throw new DomainError('BEAM_INVALID','beam-soft wymaga statycznej warstwy beam z mapowaniem V / pełna tekstura (lub bez jawnego mapowania).');
  }
  if(document.layers.some(l=>Object.hasOwn(l,'textureMapping')&&l.type!=='beam'))throw new DomainError('BEAM_TEXTURE_MAPPING_INVALID','textureMapping wymaga warstwy beam.');
  if(document.schemaVersion<18&&(document.layers.some(l=>Object.hasOwn(l,'textureMapping'))||document.locks.some(l=>l.field==='textureMapping')))throw new DomainError('BEAM_TEXTURE_MAPPING_INVALID','textureMapping wymaga dokumentu 18.');
  if(document.schemaVersion<17&&(document.layers.some(l=>Object.hasOwn(l,'nativeMotion'))||document.locks.some(l=>l.field==='nativeMotion')))throw new DomainError('BEAM_MOTION_INVALID','nativeMotion wymaga dokumentu 17.');
  for(const l of document.layers)if(l.type==='beam')validateBeam(l);
  if(document.lifecycle==='beam') {
    if(document.schemaVersion<16||(!isBeamFlow(document)&&document.layers.filter(l=>l.enabled).some(l=>l.type!=='beam')))throw new DomainError('BEAM_INVALID','Profil beam wymaga dokumentu 16 i wyłącznie aktywnych warstw beam.');
    if(document.layers.filter(l=>l.type==='beam').length>8)throw new DomainError('LIMIT_EXCEEDED','Maksymalnie 8 warstw beam.');
    assertAudioDocument(document);
  }else if(document.layers.some(l=>l.type==='beam'&&l.enabled))throw new DomainError('BEAM_INVALID','Aktywny beam wymaga trybu beam.');
}
/** Metric ribbon centreline. Endpoints are exact; lateral noise never scales
 * with length. This is a deterministic authoring preview, not engine Lightning. */
export function sampleBeam(layer:BeamLayer,time:number) {
  validateBeam(layer);
  const delta=layer.target.map((v,i)=>v-layer.source[i]),length=Math.hypot(...delta),axis=delta.map(v=>v/length);
  const up=Math.abs(axis[2])<.95?[0,0,1]:[1,0,0];
  const side=[axis[1]*up[2]-axis[2]*up[1],axis[2]*up[0]-axis[0]*up[2],axis[0]*up[1]-axis[1]*up[0]];
  const n=Math.hypot(...side);for(let i=0;i<3;i++)side[i]/=n;
  const tick=layer.delay>0?Math.floor(Math.max(time,0)/layer.delay):0;
  const points=Array.from({length:layer.nativeMotion?2:layer.segments+1},(_,i)=>{
    if(i===0)return [...layer.source] as Vec3;if(layer.nativeMotion||i===layer.segments)return [...layer.target] as Vec3;
    const u=i/layer.segments,noise=Math.sin(i*(6+layer.lightningScale*12)+layer.seed*78.233+tick*4.13)*layer.radius;
    return layer.source.map((v,j)=>v+delta[j]*u+side[j]*noise) as Vec3;
  });
  return {points,length,width:layer.width,flowOffset:(layer.flow.direction==='source-to-target'?1:-1)*time*layer.flow.speed,
    nativeFlowControl:false as const};
}
