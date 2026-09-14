import {createHash} from 'node:crypto';
import {assertDocumentInvariants,DomainError,BEAM_PROFILE_ID,type EffectDocument,type BeamLayer} from '../../core/src/model.js';
import {resolveTexture,textureAssetMetadata} from '../../core/src/textures.js';
import {assertResref,writeHak,readHak,readNwnTga,type ResourceFile} from './binary.js';
import {makeTexture,textureInfo,readTxi} from './textures.js';
import {readAsciiMdl,numeric,textProperty,vector} from './mdl-reader.js';
import {bindEffectIntegration} from './effect-integration.js';
import type {CandidateResult} from './index.js';
import {buildMaterialMotionAtlas,BEAM_MATERIAL_MOTION} from '../../core/src/beam-material-motion.js';
import {periodicTextureInfo} from './textures.js';
import {buildBeamMotionAtlas} from '../../core/src/beam-motion.js';
import {exporterVersion} from './mdl-writer.js';
import {verifyBeamMotionResources} from './beam-motion-readback.js';
import {verifyBeamPointCounts} from './beam-point-count.js';
import {buildBeamTexture} from '../../core/src/beam-texture.js';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const bytes=(s:string)=>new TextEncoder().encode(s);
const json=(s:unknown)=>bytes(JSON.stringify(s,null,2)+'\n');
const check=(v:boolean,s:string)=>{if(!v)throw new DomainError('EXPORT_VALIDATION_FAILED',s);};
const rgb=(s:string)=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255);

/** Separate native static Lightning/Linked carrier. No fake impact/duration
 * animation and no timed birth-rate gate is placed on a continuous beam. */
export function buildBeamCandidate(document:EffectDocument,modelName:string,nodeNames={emitter:'beam_',reference:'target_'}):CandidateResult {
  assertResref(modelName);assertDocumentInvariants(document);
  check(document.lifecycle==='beam'&&document.profileId===BEAM_PROFILE_ID,'Nieprawidłowy profil beam.');
  const layers=document.layers.filter((l):l is BeamLayer=>l.type==='beam'&&l.enabled),hasMotion=layers.some(l=>l.nativeMotion),hasMaterialMotion=layers.some(l=>l.materialMotion);
  check(layers.length>0,'Eksport wymaga aktywnego beama.');
  if(hasMotion)throw new DomainError('BEAM_MOTION_EXPORT_BLOCKED','Eksport atlasu beama jest wstrzymany: profil 0.26 używał niebezpiecznych 2 punktów Lightning. Podgląd i szkic są dostępne. Utwórz statyczny fork z nativeMotion:null; poprawny ruch po całym beamie wymaga nowego profilu.',{minimumFixVersion:'0.26.1',nativeVerified:false});
  const resources:ResourceFile[]=[],textures:Record<string,unknown>[]=[],nodes:string[]=[],bindings:Array<{layer:BeamLayer,node:string,reference:string,texture:string,motion?:ReturnType<typeof buildBeamMotionAtlas>['metadata']}>=[];
  const textureNames=new Set<string>();
  for(const [i,l] of layers.entries()){
    const atlas=l.nativeMotion?buildBeamMotionAtlas(document,l):undefined;
    const periodic=l.materialMotion?buildMaterialMotionAtlas(document,l):undefined;
    const pixels=periodic?.pixels??atlas?.pixels??buildBeamTexture(document,l).pixels,tga=makeTexture(pixels),txi=bytes(periodic?periodicTextureInfo(l.blend):textureInfo(l.blend)),size=l.nativeMotion?l.width/2:l.width;
    const digest=createHash('sha256').update(tga).update(txi).digest('hex'),texture=`vfx_${digest.slice(0,12)}`;
    if(!textureNames.has(texture)){
      textureNames.add(texture);resources.push({name:texture+'.tga',data:tga},{name:texture+'.txi',data:txi});
      const read=readNwnTga(tga);check(sha(read.rgba)===sha(pixels.rgba),'Odczyt tekstury beama zmienił piksele.');
      check(readTxi(txi,periodic?BEAM_MATERIAL_MOTION.profile:undefined).blending===(l.blend==='additive'?'additive':'default'),'Utracony blend beama.');
      let minAlpha=255,maxAlpha=0;for(let j=3;j<read.rgba.length;j+=4){minAlpha=Math.min(minAlpha,read.rgba[j]);maxAlpha=Math.max(maxAlpha,read.rgba[j]);}
      textures.push({name:texture+'.tga',bitsPerPixel:32,minAlpha,maxAlpha,sourceRefs:[l.texture],txi:{name:texture+'.txi',...readTxi(txi,periodic?BEAM_MATERIAL_MOTION.profile:undefined),...(periodic?{profile:BEAM_MATERIAL_MOTION.profile}:{})},width:pixels.width,height:pixels.height,origin:'bottom-left',rgbaSha256:sha(pixels.rgba),nwnBottomFirstRgbaSha256:sha(read.rgba),generator:'shared-rgba-tga-bottom-first-2',blend:l.blend});
    }
    const node=`${nodeNames.emitter}${i}`,reference=`${nodeNames.reference}${i}`;
    const properties:Record<string,unknown>={parent:modelName,position:[0,0,0],orientation:[0,0,1,0],update:'Lightning',render:'Linked',blend:l.blend==='additive'?'Lighten':'Normal',texture,
      xgrid:l.materialMotion?16:l.nativeMotion?4:1,ygrid:l.nativeMotion?4:1,xsize:0,ysize:0,spawntype:0,twosidedtex:1,loop:0,renderorder:i,p2p:0,p2p_sel:1,affectedByWind:0,m_isTinted:0,bounce:0,random:0,
      inherit:0,inheritvel:0,inherit_local:1,inherit_part:0,splat:0,alphaStart:l.alpha,alphaMid:l.alpha,alphaEnd:l.alpha,colorStart:rgb(l.color),colorMid:rgb(l.color),colorEnd:rgb(l.color),
      sizeStart:size,sizeMid:size,sizeEnd:size,sizeStart_y:0,sizeMid_y:0,sizeEnd_y:0,birthrate:l.segments+1,lifeExp:1,mass:0,spread:0,velocity:0,randvel:0,particleRot:0,
      percentStart:0,percentMid:.5,percentEnd:1,bounce_co:0,blurlength:0,fps:l.materialMotion?.fps??l.nativeMotion?.fps??0,frameStart:0,frameEnd:l.materialMotion||l.nativeMotion?15:0,grav:0,drag:0,threshold:0,combinetime:0,deadspace:0,blastRadius:0,blastLength:0,
      lightningDelay:l.delay,lightningRadius:l.radius,lightningScale:l.lightningScale,p2p_bezier2:0,p2p_bezier3:0};
    nodes.push(`node emitter ${node}\n${Object.entries(properties).map(([k,v])=>`  ${k} ${Array.isArray(v)?v.join(' '):v}`).join('\n')}\nendnode\nnode reference ${reference}\n  parent ${node}\n  position 0 1 0\n  orientation 0 0 1 0\n  refModel fx_ref\n  reattachable 1\nendnode\n`);
    bindings.push({layer:l,node,reference,texture,...(atlas?{motion:atlas.metadata}:{})});
  }
  const mdl=bytes(`#MAXMODEL ASCII\nnewmodel ${modelName}\nsetsupermodel ${modelName} NULL\nclassification EFFECT\nsetanimationscale 1\nbeginmodelgeom ${modelName}\nnode dummy ${modelName}\n  parent NULL\nendnode\n${nodes.join('')}endmodelgeom ${modelName}\ndonemodel ${modelName}\n`);
  const read=readAsciiMdl(mdl);check(read.animations.length===0&&read.nodes.length===1+layers.length*2,'Beam musi mieć statyczne emitery i referencje.');
  const pointCounts=verifyBeamPointCounts(mdl);
  const readback=bindings.map(({layer:l,node,reference,texture,motion})=>{
    const size=l.nativeMotion?l.width/2:l.width;
    const emitter=read.nodes.find(n=>n.name===node)!,ref=read.nodes.find(n=>n.name===reference)!;
    for(const [field,value] of Object.entries({p2p:0,p2p_sel:1,inherit:0,inherit_local:1,birthrate:l.segments+1,sizeStart:size,sizeMid:size,sizeEnd:size,
      fps:l.materialMotion?.fps??l.nativeMotion?.fps??0,frameStart:0,frameEnd:l.materialMotion||l.nativeMotion?15:0,xgrid:l.materialMotion?16:l.nativeMotion?4:1,ygrid:l.nativeMotion?4:1,loop:0,
      alphaStart:l.alpha,alphaMid:l.alpha,alphaEnd:l.alpha,lightningDelay:l.delay,lightningRadius:l.radius,lightningScale:l.lightningScale,velocity:0}))
      check(numeric(emitter,field)===value,'Utracone pole beama: '+field);
    for(const [field,value] of Object.entries({update:'Lightning',render:'Linked',texture,parent:modelName}))check(textProperty(emitter,field)===value,'Utracone pole beama: '+field);
    check(ref.type==='reference'&&textProperty(ref,'parent')===node&&textProperty(ref,'refmodel')==='fx_ref'&&numeric(ref,'reattachable')===1,'Utracona referencja celu.');
    check(JSON.stringify(vector(ref,'position'))==='[0,1,0]','Utracona pozycja spoczynkowa celu.');
    for(const f of ['colorstart','colormid','colorend'])check(JSON.stringify(vector(emitter,f))===JSON.stringify(rgb(l.color)),'Utracony kolor.');
    return {...(l.materialMotion?{materialMotion:buildMaterialMotionAtlas(document,l).metadata}:{}),layerId:l.id,node,reference,texture,properties:emitter.properties,target:ref.properties,preview:{source:l.source,target:l.target,flow:l.flow},nativeFlowControl:!!motion,...(motion?{nativeMotion:motion,nativeSizeHalfWidth:size}:{}),...(l.textureMapping?{textureMapping:buildBeamTexture(document,l).metadata}:{})};
  });
  resources.unshift({name:modelName+'.mdl',data:mdl});
  if(hasMotion)verifyBeamMotionResources(document,mdl,resources);
  const hak=writeHak(resources),extracted=readHak(hak);check(extracted.length===resources.length&&extracted.every(r=>sha(r.data)===sha(resources.find(s=>s.name===r.name)!.data)),'HAK zmienił zasoby.');
  const source=json(document),limitations=hasMotion?[
    'Animated Lightning/Linked texture atlas on exactly one straight segment. FrameStart/End/FPS and grid are exported; native UV direction, width and cadence require consumer verification.',
    'nativeMotion is baked texture motion, not particle velocity. source/target coordinates and seed remain preview-only; native endpoints come from EffectBeam. Legacy flow is ignored on nativeMotion layers.',
    'All phases repeat. Consumer must switch/remove opening and closing during the reported final-frame window; scheduling values assume ideal FPS and are not a guaranteed native safe time. No automatic cessation, draining particles, phase chaining or endpoint glow.',
    'Source PNG is preserved. Explicit crop/fit resamples a 256x256 cell, maps source X to native V and creates a 1024x1024 derivative atlas. Native size is half the authored full width only for nativeMotion layers.',
    'The stock fx_ref is an external game dependency. Consumer allocates visualeffects/progfx rows and controls lifetime. No game or Toolset was started.'
  ]:[
    'Experimental Lightning/Linked static beam; native width, texture mapping, segmentation and attachment must be tested by the consumer.',
    'source/target coordinates, seed and flow direction/speed are preview intent only. Native endpoints come from EffectBeam and progfx type 7; reverse native flow is not implemented.',
    'document.duration is a preview window, not an animation loop or external effect lifetime. No startup/cessation animation or controlled draining tail is exported.',
    'The stock fx_ref model is an external game dependency; the consumer must verify it and allocate visualeffects/progfx rows. No game or Toolset was started.'
  ];
  limitations.push('Studio 0.26.1 corrects Lightning birthrate to segments + 1 points (3/5/9/17/33/65). Older beam candidates used even point counts and must be regenerated; ASCII and binary were affected. This prevents the identified midpoint out-of-bounds read, not every possible native failure.');
  if(layers.some(l=>l.textureMapping))limitations.push('Explicit textureMapping creates a derivative only. Native Linked repeats the full image on EACH segment, with V along the edge and full width = 2 * authored width. Padding/crop and orientation do not create continuous whole-beam UVs, native flow, endpoint anchoring proof or artistic acceptance. Mapped preview shows per-segment texture repetition without the old synthetic flow pulse.');
  if(hasMaterialMotion)limitations.push('Periodic RGBA atlas:16 discrete frames, two intentional per-segment repeats, three safe points, no random start, no mipmaps. Nominal frame timing only; native seams, cadence and appearance unqualified. No geometry helix or whole-span opening/closing.');
  const beam={version:hasMaterialMotion?3:hasMotion?2:1,profile:hasMaterialMotion?'linked-periodic-pan-v1':'lightning-linked-v1',...(hasMaterialMotion?{materialMotion:BEAM_MATERIAL_MOTION}:{}),sourceModelSha256:sha(mdl),pointCountContract:{version:1,encoding:'segments-plus-one',minimumExporterVersion:'0.26.1',layers:pointCounts},layers:readback,continuous:true,nativeFlowControl:hasMotion,nativeVerified:false,limitations};
  const files=[...resources,{name:modelName+'.hak',data:hak},{name:'effect-document.json',data:source},{name:'beam.json',data:json(beam)},
    {name:'emitter-emission.json',data:json({version:1,sourceMdlSha256:sha(mdl),mode:'continuous-beam',events:[],nativeVerified:false})},
    {name:'README.txt',data:bytes('EffectBeam resource candidate. Read beam.json and vfx-integration.json. Native verification is required.\n')}];
  const result:CandidateResult={files,validation:{formatVersion:1,exporterVersion:exporterVersion(document),profileId:BEAM_PROFILE_ID,modelName,nativeVerified:false,structuralValidation:'passed',documentSha256:sha(source),coordinateSystem:'NWN Z-up',
    checks:{asciiParsed:true,beamEmittersRead:true,beamReferencesRead:true,beamPointCountsSafe:true,beamContinuous:true,noDetonateEvents:true,burstEventTimeValuesRead:true,burstEventsIsolated:true,nativeBurstTimingVerified:false,rgbaPixelsExact:true,hakExactResourceReadback:true},
    resources:files.map(f=>({name:f.name,bytes:f.data.length,sha256:sha(f.data)})),assets:(document.assets??[]).map(a=>({...textureAssetMetadata(a),referenced:layers.some(l=>l.texture==='asset:'+a.id),resources:bindings.filter(b=>b.layer.texture==='asset:'+a.id).map(b=>b.texture+'.tga')})),
    readback:{animation:'none',duration:0,detonateEvents:[],hakResourceCount:resources.length,layers:[],meshes:[],trails:[],textures},
    diagnostics:[{code:'BEAM_EXPERIMENTAL',severity:'warning',message:limitations.join(' ')}],limitations,integration:{moduleIncluded:false,visualeffects2daIncluded:false,installed:false},references:['https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NwnLib/NwnMdlNodes.h']}};
  return bindEffectIntegration(result,document);
}

