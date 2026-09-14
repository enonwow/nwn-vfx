from pathlib import Path
def edit(path,old,new):
 p=Path(path);s=p.read_text(encoding='utf-8');assert old in s,(path,old[:75]);p.write_text(s.replace(old,new),encoding='utf-8')
p='apps/service/src/render.ts'
edit(p,'import ',"import {isBeamFlow,boundEmitters} from '../../../packages/core/src/beam-flow.js';\nimport ") if False else None
s=Path(p).read_text(encoding='utf-8');Path(p).write_text("import {isBeamFlow,boundEmitters} from '../../../packages/core/src/beam-flow.js';\n"+s,encoding='utf-8')
edit(p,'format:options.format??\'png\',time:options.time,duration,seed:document.seed,',"format:options.format??'png',time:options.time,duration,seed:document.seed,...(isBeamFlow(document)?{beamParticleFlow:boundEmitters(document).map(l=>({layerId:l.id,binding:l.beamBinding,start:l.start,feedSeconds:l.duration,life:l.life,count:l.count}))}:{}),")
edit(p,"...(document.lifecycle==='beam'?[beamMotionSummaries", "...(isBeamFlow(document)?['Finite Fountain birthrate and zero-handle P2P Bezier share the preview clock. Existing particles drain after feed ends; separate endpoint FnF animations share the preview start, while native dispatch may have frame delay. Native appearance and rig attachment remain unverified.']:document.lifecycle==='beam'?[beamMotionSummaries")
p='packages/contracts/src/schema.ts';edit(p,'  beamTextureMapping:array(', "  beamParticleFlow:array(obj({layerId:id,binding:beamBindingSchema,start:number(0,30),feedSeconds:number(.01,10),life:number(.01,10),count:integer(1,2000)}),8),\n  beamTextureMapping:array(")
p='packages/nwn-format/src/beam-flow-candidate.ts'
edit(p,"name=`${modelName.slice(0,12)}_e${i}`", "name=`ve_${sha(json([modelName,l.id])).slice(0,12)}`")
edit(p,"    endpoints.push({", "    for(const a of endpoint.validation.assets){const main=result.validation.assets.find(m=>m.id===a.id)!;main.referenced ||= a.referenced;main.resources=[...new Set([...main.resources,...a.resources])];}\n    for(const t of endpoint.validation.readback.textures)if(!result.validation.readback.textures.some(m=>m.name===t.name))result.validation.readback.textures.push(t);\n    endpoints.push({")
