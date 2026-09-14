from pathlib import Path
def edit(path,old,new):
 p=Path(path);s=p.read_text(encoding='utf-8');assert old in s,(path,old[:90]);p.write_text(s.replace(old,new),encoding='utf-8')
p='packages/contracts/src/schema.ts'
edit(p,'allOf:[{if:{properties:{schemaVersion:{maximum:17}}}',"allOf:[{if:{properties:{schemaVersion:{maximum:18}}},then:{properties:{layers:{items:{not:{required:['beamBinding']}}},locks:{items:{not:{properties:{field:{const:'beamBinding'}}}}}}}},{if:{properties:{schemaVersion:{maximum:17}}}")
p='packages/nwn-format/src/mdl-writer.ts'
edit(p,'import { assertDocumentInvariants',"import {beamFlowEnvelope,isBeamFlow} from '../../core/src/beam-flow.js';\nimport { assertDocumentInvariants")
edit(p,"const version=document.lifecycle==='beam'?", "const version=isBeamFlow(document)?'0.27.0':document.lifecycle==='beam'?")
edit(p,'15, 16, 17, 18].includes','15, 16, 17, 18, 19].includes')
edit(p,'  const ramp = Math.min(.001, layer.duration / 4)', '  if(layer.beamBinding)return beamFlowEnvelope(layer,length);\n  const ramp = Math.min(.001, layer.duration / 4)')
edit(p,'      p2p: 0, p2p_sel: 1', "      p2p: layer.beamBinding?.role==='flow'?1:0, p2p_sel: 1")
edit(p,"    animation.push(`node dummy ${parent}","    if(layer.beamBinding?.role==='flow')geometry.push(`node reference target_${index}\\n  parent ${node}\\n  position 0 1 0\\n  orientation 0 0 1 0\\n  refModel fx_ref\\n  reattachable 1\\nendnode\\n`);\n    animation.push(`node dummy ${parent}")
edit(p,"${document.lifecycle??'impact'}", "${document.lifecycle==='beam'?'cast01':document.lifecycle??'impact'}")
p='packages/nwn-format/src/index.ts'
edit(p,"import {buildBeamCandidate}","import {isBeamFlow} from '../../core/src/beam-flow.js';\nimport {buildFiniteBeamCandidate} from './beam-flow-candidate.js';\nimport {buildBeamCandidate}")
edit(p,"  if(document.lifecycle==='beam')return buildBeamCandidate(document,modelName);", "  if(isBeamFlow(document))return buildFiniteBeamCandidate(document,modelName,buildTimelineCandidate);\n  if(document.lifecycle==='beam')return buildBeamCandidate(document,modelName);\n  return buildTimelineCandidate(document,modelName);\n}\nfunction buildTimelineCandidate(document:EffectDocument,modelName:string):CandidateResult {")
edit(p,"anim.name === (document.lifecycle??'impact')", "anim.name === (document.lifecycle==='beam'?'cast01':document.lifecycle??'impact')")
edit(p,'entries.length * 2+trails.length', "entries.length * 2+trails.length+emitterEntries.filter(e=>e.layer.beamBinding?.role==='flow').length")
edit(p,"'inherit_part', 'p2p', 'grav'", "'inherit_part', 'grav'")
edit(p,"    checked(sameVector(sampleTrack(animatedParent.tracks.position, 0)", "    checked(numeric(emitter,'p2p')===(layer.beamBinding?.role==='flow'?1:0),'Utracona flaga P2P.');\n    checked(sameVector(sampleTrack(animatedParent.tracks.position, 0)")
