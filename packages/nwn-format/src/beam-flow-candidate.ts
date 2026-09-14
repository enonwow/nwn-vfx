import {compositeBeamProfile} from '../../core/src/beam-multistrand.js';
import {createHash} from 'node:crypto';
import {assertDocumentInvariants,PROFILE_ID,type EffectDocument,type EmitterLayer} from '../../core/src/model.js';
import {boundEmitters,beamFlowEnvelope} from '../../core/src/beam-flow.js';
import {readHak,writeHak,type ResourceFile} from './binary.js';
import {readAsciiMdl,numeric,textProperty} from './mdl-reader.js';
import {DomainError} from '../../core/src/model.js';
import {bindEffectIntegration} from './effect-integration.js';
import {buildBeamCandidate} from './beam-candidate.js';
import {verifyBeamPointCounts} from './beam-point-count.js';
import {exporterVersion} from './mdl-writer.js';
import {readEmissionTiming} from './emission-readback.js';
import type {CandidateResult} from './index.js';
import {exportAudio} from './audio-export.js';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const json=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v,null,2)+'\n');
const check=(v:boolean,s:string)=>{if(!v)throw new DomainError('EXPORT_VALIDATION_FAILED',s);};
export function verifyFiniteBeamSource(source:Uint8Array,document:EffectDocument) {
  const parsed=readAsciiMdl(source),layers=boundEmitters(document).filter(l=>l.beamBinding!.role==='flow'),anim=parsed.animations[0];
  check(parsed.animations.length===1&&anim.name==='cast01'&&anim.length===document.duration&&!anim.events.length,'P2P wymaga jednej skończonej animacji cast01 bez detonate.');
  return layers.map((l,i)=>{
    const n=parsed.nodes.find(n=>n.name===`em_${i}`)!,ref=parsed.nodes.find(n=>n.name===`target_${i}`)!;
    check(!!n&&textProperty(n,'update')==='Fountain'&&textProperty(n,'render')==='Normal','Utracony tryb Fountain.');
    for(const [field,value] of Object.entries({p2p:1,p2p_sel:1,inherit:0,inheritvel:0,inherit_local:0,inherit_part:0,combinetime:0,p2p_bezier2:0,p2p_bezier3:0,velocity:0,mass:0,grav:0,birthrate:0,lifeExp:l.life}))check(numeric(n,field)===value,'Utracony kontroler P2P: '+field);
    check(!!ref&&ref.type==='reference'&&textProperty(ref,'parent')===n.name&&textProperty(ref,'refmodel')==='fx_ref'&&numeric(ref,'reattachable')===1,'Utracona referencja P2P.');
    const rows=anim.nodes.find(a=>a.name===n.name)?.tracks.birthrate;
    check(JSON.stringify(rows)===JSON.stringify(beamFlowEnvelope(l,document.duration).rows),'Utracony skończony harmonogram birthrate.');
    return {layerId:l.id,node:n.name,reference:ref.name,binding:l.beamBinding,emissionStart:l.start,emissionEnd:l.start+l.duration,
      travelSeconds:l.life,lastDeath:l.start+l.duration+l.life,authoredCount:l.count,birthrateKeys:rows};
  });
}

/** One persistent moving pool; endpoints are separate finite FnF resources, never phase swaps. */
export function buildFiniteBeamCandidate(document:EffectDocument,modelName:string,buildTimeline:(d:EffectDocument,n:string)=>CandidateResult):CandidateResult {
  assertDocumentInvariants(document);
  // Geometry subexports have no audio. One full activation mix belongs to the
  // composed candidate, never to an individual flow, strand or endpoint model.
  const visualDocument={...document};delete visualDocument.audioAssets;delete visualDocument.audioClips;
  const layers=boundEmitters(document),flows=layers.filter(l=>l.beamBinding!.role==='flow');
  const mainDocument={...visualDocument,layers:flows,locks:[]};
  const result=buildTimeline(mainDocument,modelName);let source=result.files.find(f=>f.name===modelName+'.mdl')!.data;
  const resources=new Map<string,ResourceFile>(readHak(result.files.find(f=>f.name===modelName+'.hak')!.data).map(f=>[f.name,f]));
  const strands=document.layers.filter(l=>l.enabled&&l.type==='beam');let staticBeam:any;
  if(strands.length){
    // Reuse the established static exporter, then merge its geometry into the
    // finite model. The standalone paths and their resource bytes stay intact.
    const staticResult=buildBeamCandidate({...visualDocument,layers:strands,locks:[]},modelName,{emitter:'strand_',reference:'strand_target_'});
    const staticSource=staticResult.files.find(f=>f.name===modelName+'.mdl')!.data,staticText=new TextDecoder().decode(staticSource);
    const parsed=readAsciiMdl(staticSource),blocks=[...staticText.matchAll(/^node [^\n]+\n[\s\S]*?^endnode\n/gm)].map(m=>m[0]).filter(b=>!b.startsWith(`node dummy ${modelName}\n`));
    check(parsed.animations.length===0&&blocks.length===strands.length*2,'Nieprawidłowa geometria statycznej nitki.');
    source=new TextEncoder().encode(new TextDecoder().decode(source).replace(`endmodelgeom ${modelName}\n`,blocks.join('')+`endmodelgeom ${modelName}\n`));
    const merged=readAsciiMdl(source);check(new Set(merged.nodes.map(n=>n.name)).size===merged.nodes.length,'Kolizja węzłów nitki i strumienia.');verifyBeamPointCounts(source);
    for(const file of readHak(staticResult.files.find(f=>f.name===modelName+'.hak')!.data)){
      if(file.name===modelName+'.mdl')continue;const old=resources.get(file.name);check(!old||sha(old.data)===sha(file.data),'Kolizja zasobów nitki.');resources.set(file.name,file);
    }
    resources.set(modelName+'.mdl',{name:modelName+'.mdl',data:source});
    for(const asset of staticResult.validation.assets){const main=result.validation.assets.find(a=>a.id===asset.id)!;main.referenced ||= asset.referenced;main.resources=[...new Set([...main.resources,...asset.resources])];}
    for(const texture of staticResult.validation.readback.textures)if(!result.validation.readback.textures.some(t=>t.name===texture.name))result.validation.readback.textures.push(texture);
    staticBeam={...JSON.parse(new TextDecoder().decode(staticResult.files.find(f=>f.name==='beam.json')!.data)),sourceModelSha256:sha(source),composite:{profile:compositeBeamProfile(document),mainModel:true,flowArtifact:'beam-flow.json',lifetime:'until-consumer-removal'}};
    staticBeam.limitations=staticBeam.limitations.filter((s:string)=>!s.startsWith('document.duration is'));
    staticBeam.limitations.push('This artifact describes only the static strand in the mixed main model. cast01 and finite particle lifetimes are specified in beam-flow.json; the strand is not gated by that animation.');
    const emission=result.files.find(f=>f.name==='emitter-emission.json')!;emission.data=json({...readEmissionTiming(source),sourceMdlSha256:sha(source)});
    result.validation.checks={...result.validation.checks,beamEmittersRead:true,beamReferencesRead:true,beamPointCountsSafe:true};
  }
  const readback=verifyFiniteBeamSource(source,mainDocument);
  const endpoints=[];
  for(const [i,l] of layers.filter(l=>l.beamBinding!.role!=='flow').entries()){
    const binding=l.beamBinding!,name=`ve_${sha(json([modelName,l.id])).slice(0,12)}`;
    const layer:EmitterLayer=structuredClone(l);delete layer.beamBinding;
    const endpointDocument:EffectDocument={...visualDocument,lifecycle:'impact',profileId:PROFILE_ID,layers:[layer],locks:[]};
    const endpoint=buildTimeline(endpointDocument,name);
    for(const f of readHak(endpoint.files.find(f=>f.name===name+'.hak')!.data)){
      const old=resources.get(f.name);check(!old||sha(old.data)===sha(f.data),'Kolizja zasobów końcówki.');resources.set(f.name,f);
    }
    for(const a of endpoint.validation.assets){const main=result.validation.assets.find(m=>m.id===a.id)!;main.referenced ||= a.referenced;main.resources=[...new Set([...main.resources,...a.resources])];}
    for(const t of endpoint.validation.readback.textures)if(!result.validation.readback.textures.some(m=>m.name===t.name))result.validation.readback.textures.push(t);
    endpoints.push({layerId:l.id,role:binding.role,node:binding.node,model:{resref:name,file:name+'.mdl',sha256:sha(resources.get(name+'.mdl')!.data)},
      dispatchAt:0,animation:'impact',emissionStart:l.start,emissionEnd:l.start+l.duration,lastDeath:l.start+l.duration+l.life,
      integration:{visualeffects2da:{rowId:null,columns:{Type_FD:'F',ProgFX_Impact:null}},progfx2da:{rowId:null,columns:{Type:12,Param1:binding.node,Param2:name}},
        consumerBinding:'visualeffects.ProgFX_Impact = allocated progfx row; ApplyEffectToObject(DURATION_TYPE_INSTANT, EffectVisualEffect(allocated visualeffects row), logical endpoint object)',
        prerequisite:'Param1 must exist on the actual creature model. ApplyEffectToObject alone does not select an arbitrary node. Verify attachment and animation in NWN.',nativeVerified:false},
      sourceReadback:endpoint.validation.readback});
  }
  const limitations=[
    'Finite Fountain/P2PBezier with p2p=1 and p2p_sel=1, zero handles and combineTime=0. Progress follows particle age/life using smoothstep, not constant metres per second. Native appearance, timing and moving body attachments require consumer testing.',
    'One cast01 animation gates births. Keep the SAME beam instance alive until all particles finish. Do not replace it at feed end. Consumer removes it after the reported lastDeath; emergency removal may discard particles immediately. Arbitrary graceful interruption is unsupported.',
    'Native emission origin is the EffectBeam effector; the applied-to object supplies the opposite endpoint. Reverse object binding for target-to-source. Coordinates and seeds are preview inputs, not runtime world offsets or native RNG controls.',
    'Endpoint FnF models are separate instances dispatched once alongside the stream. Their clocks may differ by native/action-queue frame delay. ProgFX type 12 selects the authored creature node; its presence and finite impact playback must be verified on the actual rig.',
    'Birthrate integral equals count; actual births and pulse edges depend on engine frames. The preview inverts that integral with seeded births and uses authored lifetime. It is not native particle-count parity.',
    'Stock fx_ref remains an external game resource. No Toolset or NWN process was launched. All nativeVerified fields remain false.'
  ];
  const binding=flows[0].beamBinding!,end=Math.max(...layers.map(l=>l.start+l.duration+l.life));
  if(staticBeam)limitations.push('Static Lightning/Linked strands share the main model, native root and target objects with finite Fountain/P2P emitters. Each has separate geometry, reference and authored parameters. Constant point counts and alpha remain active until the consumer removes this SAME instance after all particle lastDeath times. cast01 gates only Fountain. Native phase, smooth weaving, seed independence, combined rendering and attachment are unqualified; hand-return remains unsupported.');
  const flow={version:1,profile:'fountain-p2p-bezier-finite-v1',sourceModelSha256:sha(source),direction:binding.direction,
    preview:{source:binding.source,target:binding.target},nativeObjects:{effector:binding.direction==='source-to-target'?'source':'target',appliedTo:binding.direction==='source-to-target'?'target':'source',sourceBodyNode:'consumer selects supported BODY_NODE enum; do not substitute feet offsets',targetAttachment:'consumer verifies engine-selected target body node'},
    animation:'cast01',duration:document.duration,removeNoEarlierThan:end,pool:'one-instance-through-feed-and-drain',nativeVerified:false,layers:readback,endpoints,limitations,
    ...(staticBeam?{staticStrands:{profile:compositeBeamProfile(document),artifact:'beam.json',lifetime:'until-consumer-removal',layers:staticBeam.layers.map((l:any)=>({layerId:l.layerId,node:l.node,reference:l.reference}))}}:{})};
  const audio=exportAudio(document,modelName);
  for(const file of audio.resources){const old=resources.get(file.name);check(!old||sha(old.data)===sha(file.data),'Kolizja zasobów audio.');resources.set(file.name,file);}
  if(audio.files.length)limitations.push('Audio uses one full timeline WAV dispatched explicitly once at beam activation. See audio-events.json. No automatic Type B SoundImpact or feed-end repeat; queued audio may outlive visual removal. Native sync is unqualified.');
  const hak=writeHak([...resources.values()]),extracted=readHak(hak);
  check(extracted.length===resources.size&&extracted.every(f=>sha(f.data)===sha(resources.get(f.name)!.data)),'HAK zmienił zasoby P2P.');
  result.files=result.files.filter(f=>!resources.has(f.name)&&!['validation.json','effect-document.json','vfx-integration.json',modelName+'.hak'].includes(f.name));
  result.files.push(...resources.values(),...audio.files,{name:modelName+'.hak',data:hak},{name:'effect-document.json',data:json(document)},{name:'beam-flow.json',data:json(flow)});
  if(staticBeam)result.files.push({name:'beam.json',data:json(staticBeam)});
  result.validation.exporterVersion=exporterVersion(document);result.validation.documentSha256=sha(json(document));result.validation.readback.hakResourceCount=resources.size;
  result.validation.limitations=limitations;result.validation.diagnostics.push({code:'FINITE_P2P_EXPERIMENTAL',severity:'warning',message:limitations.join(' ')});
  result.validation.diagnostics.push(...audio.diagnostics);
  result.validation.checks.finiteBeamSourceRead=true;result.validation.resources=result.files.map(f=>({name:f.name,bytes:f.data.length,sha256:sha(f.data)}));
  return bindEffectIntegration(result,document);
}
