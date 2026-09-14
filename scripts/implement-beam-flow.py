from pathlib import Path
def edit(path,old,new):
 p=Path(path);s=p.read_text(encoding='utf-8');assert old in s,(path,old[:90]);p.write_text(s.replace(old,new),encoding='utf-8')
p='packages/core/src/model.ts'
edit(p,"'0.26.2'","'0.27.0'")
edit(p,"  flipbook?: import('./flipbook.js').EmitterFlipbook;","  flipbook?: import('./flipbook.js').EmitterFlipbook;\n  beamBinding?: import('./beam-flow.js').BeamBinding;")
edit(p,"| 'deformationInterpolation'>>", "| 'deformationInterpolation' | 'beamBinding'>>")
edit(p,"  textureMapping?: BeamLayer['textureMapping'] | null;","  textureMapping?: BeamLayer['textureMapping'] | null;\n  beamBinding?: EmitterLayer['beamBinding'] | null;")
edit(p,'| 17 | 18;','| 17 | 18 | 19;')
edit(p,"'nativeMotion', 'textureMapping'] as const", "'nativeMotion', 'textureMapping', 'beamBinding'] as const")
edit(p,"  if(document.schemaVersion<18", "  if(document.schemaVersion<19&&(document.layers.some(l=>Object.hasOwn(l,'beamBinding'))||document.locks.some(l=>l.field==='beamBinding')))document.schemaVersion=19;\n  else if(document.schemaVersion<18")
edit(p,'flipbook|flow|textureMapping)$','flipbook|flow|textureMapping|beamBinding)$')
p='packages/core/src/beam.ts'
edit(p,"import {BEAM_TEXTURE_MAPPING}","import {BEAM_FLOW_CAPABILITIES,isBeamFlow,validateBeamFlow} from './beam-flow.js';\nimport {BEAM_TEXTURE_MAPPING}")
edit(p,'version:4,textureMapping:','version:5,particleFlow:BEAM_FLOW_CAPABILITIES,textureMapping:')
edit(p,'export function validateBeamDocument(document:EffectDocument) {','export function validateBeamDocument(document:EffectDocument) {\n  validateBeamFlow(document);')
edit(p,"document.layers.filter(l=>l.enabled).some(l=>l.type!=='beam')", "(!isBeamFlow(document)&&document.layers.filter(l=>l.enabled).some(l=>l.type!=='beam'))")
p='packages/core/src/simulation.ts'
edit(p,"import type", "import {sampleBeamFlow} from './beam-flow.js';\nimport type")
edit(p,'  const vx =',"  if(layer.beamBinding?.role==='flow')return sampleBeamFlow(layer.beamBinding,age,layer.life);\n  const vx =")
edit(p,'  return [layer.position[0] + x * layer.scale, layer.position[1] + y * layer.scale, layer.position[2] + z * layer.scale];',"  const origin=layer.beamBinding?layer.beamBinding[layer.beamBinding.role as 'source'|'target']:layer.position;\n  return [origin[0] + x * layer.scale, origin[1] + y * layer.scale, origin[2] + z * layer.scale];")
p='packages/renderer/src/index.ts'
edit(p,"import {createBeamPreview", "import {beamFlowEnvelope,birthAtQuantile} from '../../core/src/beam-flow.js';\nimport {createBeamPreview")
edit(p,'seeds: Float32Array; appearance:', 'seeds: Float32Array; births?:number[]; appearance:')
edit(p,'material, seeds, appearance:',"material, seeds, ...(layer.beamBinding?{births:Array.from({length:layer.count},(_,i)=>birthAtQuantile(beamFlowEnvelope(layer,document.duration).rows,seeds[i*6]))}:{}), appearance:")
edit(p,"birth = l.start + (l.update === 'Fountain' ? p.seeds[offset] * l.duration : 0)", "birth = p.births?.[i] ?? (l.start + (l.update === 'Fountain' ? p.seeds[offset] * l.duration : 0))")
p='packages/core/src/lifecycle.ts'
edit(p,"import {DomainError", "import {isBeamFlow} from './beam-flow.js';\nimport {DomainError")
edit(p,"  return document.duration*cycles;", "  if(isBeamFlow(document)&&cycles!==1)throw new DomainError('VALIDATION_ERROR','Skończony strumień ma jeden przebieg; wydłuż czas projektu, aby oglądać pusty ogon.');\n  return document.duration*cycles;")
p='packages/contracts/src/schema.ts'
edit(p,'const orientedEmitterProperties={flipbook:', "export const beamBindingSchema=obj({role:{enum:['flow','source','target']},source:boundedVec3(-20,20),target:boundedVec3(-20,20),direction:{enum:['source-to-target','target-to-source']},pulse:obj({period:number(.05,3),duty:number(.05,.95)}),node:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,31}$'}},['role','source','target','direction']);\nconst orientedEmitterProperties={beamBinding:beamBindingSchema,flipbook:")
edit(p,'[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]', '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]')
edit(p,"'nativeMotion','textureMapping'].includes(key)","'nativeMotion','textureMapping','beamBinding'].includes(key)")
edit(p,"allOf: [{if:{properties:{schemaVersion:{maximum:17}}}","allOf: [{if:{properties:{schemaVersion:{maximum:18}}},then:{properties:{layers:{items:{not:{required:['beamBinding']}}},locks:{items:{not:{properties:{field:{const:'beamBinding'}}}}}}}}, {if:{properties:{schemaVersion:{maximum:17}}}")
