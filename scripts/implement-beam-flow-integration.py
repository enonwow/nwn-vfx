from pathlib import Path
def edit(path,old,new):
 p=Path(path);s=p.read_text(encoding='utf-8');assert old in s,(path,old[:90]);p.write_text(s.replace(old,new),encoding='utf-8')
p='packages/nwn-format/src/effect-integration.ts'
edit(p,"import {durationSeams}","import {isBeamFlow,boundEmitters} from '../../core/src/beam-flow.js';\nimport {durationSeams}")
edit(p,'schemaVersion: 1 | 2 | 3 | 4;', 'schemaVersion: 1 | 2 | 3 | 4 | 5;')
edit(p,"profile:'lightning-linked-v1';", "profile:'lightning-linked-v1'|'fountain-p2p-bezier-finite-v1';")
edit(p,"start:'continuous-on-application';stop:'consumer-removes-effect';", "finite?:{artifact:'beam-flow.json';duration:number;removeNoEarlierThan:number;direction:'source-to-target'|'target-to-source'};\n    start:'continuous-on-application'|'cast01-on-application';stop:'consumer-removes-effect'|'finite-gate-then-consumer-removes-effect';")
edit(p,"    const motion=beamMotionSummaries(document);", "    if(isBeamFlow(document)){\n      effect.schemaVersion=5;effect.beam.profile='fountain-p2p-bezier-finite-v1';effect.beam.nativeFlowControl=true;effect.beam.start='cast01-on-application';effect.beam.stop='finite-gate-then-consumer-removes-effect';\n      const layers=boundEmitters(document);effect.beam.finite={artifact:'beam-flow.json',duration:document.duration,removeNoEarlierThan:Math.max(...layers.map(l=>l.start+l.duration+l.life)),direction:layers[0].beamBinding!.direction};\n    }\n    const motion=beamMotionSummaries(document);")
p='packages/contracts/src/schema.ts'
edit(p,'schemaVersion:{enum:[1,2,3,4]},projectId:', 'schemaVersion:{enum:[1,2,3,4,5]},projectId:')
edit(p,"profile:{const:'lightning-linked-v1'},progfx2da:","profile:{enum:['lightning-linked-v1','fountain-p2p-bezier-finite-v1']},finite:obj({artifact:{const:'beam-flow.json'},duration:number(.1,30),removeNoEarlierThan:number(.01,30),direction:{enum:['source-to-target','target-to-source']}}),progfx2da:")
edit(p,"start:{const:'continuous-on-application'},stop:{const:'consumer-removes-effect'}", "start:{enum:['continuous-on-application','cast01-on-application']},stop:{enum:['consumer-removes-effect','finite-gate-then-consumer-removes-effect']}")
edit(p,"'nwn-ascii-vfx-0.26.2'", "'nwn-ascii-vfx-0.26.2','nwn-ascii-vfx-0.27.0'")
edit(p,"'nwn-binary-vfx-0.26.2'", "'nwn-binary-vfx-0.26.2','nwn-binary-vfx-0.27.0'")
p='packages/nwn-format/src/binary-beam.ts'
edit(p,'  verifyBeamPointCounts(source);',"  const finite=readAsciiMdl(source).nodes.some(n=>n.type==='emitter'&&numeric(n,'p2p')===1);\n  if(!finite)verifyBeamPointCounts(source);")
edit(p,"if(parsed.animations.length||u(0x7c)!==0)fail('unexpected animation');", "if(parsed.animations.length!==(finite?1:0)||u(0x7c)!==parsed.animations.length)fail('unexpected animation');")
edit(p,"str(o+0x88,32)!=='Lightning'||str(o+0xa8,32)!=='Linked'||u(o+0x144)!==258", "str(o+0x88,32)!==(finite?'Fountain':'Lightning')||str(o+0xa8,32)!==(finite?'Normal':'Linked')||u(o+0x144)!==(finite?3:258)")
edit(p,"      assertBeamPointCount(values.get(88)?.[0]??NaN);", "      if(!finite)assertBeamPointCount(values.get(88)?.[0]??NaN);")
edit(p,"[208,'lightningdelay'],[212,'lightningradius'],[216,'lightningscale'],", "...(finite?[[140,'lifeexp'],[104,'combinetime'],[152,'p2p_bezier2'],[156,'p2p_bezier3']] as const:[[208,'lightningdelay'],[212,'lightningradius'],[216,'lightningscale']] as const),")
edit(p,"update:'Lightning',render:'Linked',flags:258", "update:finite?'Fountain':'Lightning',render:finite?'Normal':'Linked',flags:finite?3:258")
