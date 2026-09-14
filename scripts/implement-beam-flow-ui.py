from pathlib import Path
def edit(path,old,new):
 p=Path(path);s=p.read_text(encoding='utf-8');assert old in s,(path,old[:85]);p.write_text(s.replace(old,new),encoding='utf-8')
p='packages/core/src/beam-flow.ts'
edit(p,"import {DomainError,type", "import {makeLayer,DomainError,type")
edit(p,'export function isBeamFlow',"export function makeFlowLayer(id:string,length=3.6):EmitterLayer {const life=Math.min(.6,length/3);return {...makeLayer(id,'Strumień cząstek'),update:'Fountain',position:[0,0,0],speed:0,spread:0,gravity:0,start:0,duration:length-life,life,count:120,alpha:0,midAlpha:.4,endAlpha:0,size:.08,midSize:.12,endSize:.04,texture:'glow',beamBinding:{role:'flow',source:[0,0,1.2],target:[0,3,1.2],direction:'source-to-target',pulse:{period:.5,duty:.6}}};}\nexport function isBeamFlow")
p='apps/web/src/MeshInspector.tsx';edit(p,'export interface MeshEditorDraft {','export interface MeshEditorDraft { beamBinding?:MeshJsonDraft;')
p='apps/web/src/main.tsx'
edit(p,"import {makeBeamLayer}","import {isBeamFlow,boundEmitters,makeFlowLayer} from '../../../packages/core/src/beam-flow.js';\nimport {EmitterBeamBinding} from './EmitterBeamBinding.js';\nimport {makeBeamLayer}")
edit(p,"  async function create(preset: string) {", """  function patchBeamBinding(values:LayerValues) {
    const binding=values.beamBinding!;
    applyObjToDraft(boundEmitters(draft).map(l=>({type:'layer.set',layerId:l.id,values:{beamBinding:l.id===layer.id?binding:{...l.beamBinding!,source:binding.source,target:binding.target,direction:binding.direction}}})));
  }
  function addFlow(role:'flow'|'source'|'target') {
    const l=makeFlowLayer(crypto.randomUUID(),draft.duration),first=boundEmitters(draft)[0];
    l.beamBinding={...l.beamBinding!,...first?.beamBinding,role};
    if(role!=='flow'){l.name=role==='source'?'Końcówka źródła':'Końcówka celu';delete l.beamBinding.pulse;l.beamBinding.node=role==='source'?'impact':'handconjure';l.life=Math.min(.35,draft.duration/3);l.duration=draft.duration-l.life;l.count=24;l.beamBinding.role=role;}
    applyObjToDraft([{type:'layer.add',layer:l}]);setSelected(l.id);setPanel('parameters');
  }
  async function create(preset: string) {
    if(preset==='flow'){
      let p=projectOf(await write('projects.create',{preset:'empty',lifecycle:'beam',name:'Nowy strumień cząstek'}));
      p=projectOf(await write('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'project.set',values:{duration:3.6}},{type:'layer.remove',layerId:'beam'},{type:'layer.add',layer:makeFlowLayer('flow')}]}));
      setProject(p);setDraft(clone(p.document));setSelected('flow');setShowNew(false);setTab('layers');await refreshProjects();return;
    }""")
edit(p,"'orientation', 'flipbook'].includes(field)","'orientation', 'flipbook', 'beamBinding'].includes(field)")
edit(p,"disabled={disablePersist||draft.lifecycle!=='beam'||draft.layers.filter", "disabled={disablePersist||draft.lifecycle!=='beam'||isBeamFlow(draft)||draft.layers.filter")
edit(p,'/>Dodaj beam</button></div>', '/>Dodaj beam</button>{isBeamFlow(draft)&&<><button disabled={disablePersist||boundEmitters(draft).length>=8} onClick={()=>addFlow(\'flow\')}>Dodaj strumień cząstek</button><button disabled={disablePersist||boundEmitters(draft).length>=8} onClick={()=>addFlow(\'source\')}>Dodaj końcówkę źródła</button><button disabled={disablePersist||boundEmitters(draft).length>=8} onClick={()=>addFlow(\'target\')}>Dodaj końcówkę celu</button></>}</div>')
edit(p,'          <EmitterOrientation key=',"          {layer.beamBinding&&<><button aria-label={isLocked('beamBinding')?'Odblokuj powiązanie cząstek':'Zablokuj powiązanie cząstek'} disabled={disablePersist} onClick={()=>setDraft(d=>({...d,locks:isLocked('beamBinding')?d.locks.filter(l=>!(l.layerId===layer.id&&l.field==='beamBinding')):[...d.locks,{layerId:layer.id,field:'beamBinding'}]}))}><LockKeyhole size={14}/>Blokada powiązania</button><EmitterBeamBinding layer={layer} disabled={!project||isLocked('beamBinding')} pending={meshEditorDrafts[layer.id]?.beamBinding} onPendingChange={beamBinding=>{const entry={...meshEditorDraftsRef.current[layer.id]};if(beamBinding)entry.beamBinding=beamBinding;else delete entry.beamBinding;updateMeshEditorDraft(layer.id,entry);}} onChange={patchBeamBinding}/></>}\n          <EmitterOrientation key=")
edit(p,"{['duration','beam'].includes(draft.lifecycle??'')&&<label>","{!isBeamFlow(draft)&&['duration','beam'].includes(draft.lifecycle??'')&&<label>")
edit(p,"['beam','Nowy beam'", "['flow','Nowy strumień cząstek','Emisja, pulsowanie i dolot między punktami'], ['beam','Nowy beam'")
edit(p,'Beam — ciągłe połączenie','Beam — połączenie punktów')
p='apps/service/src/commands.ts';edit(p,"minimumStudioVersion=version>=18?", "minimumStudioVersion=version>=19?'0.27.0':version>=18?")
p='tests/beam-flow.test.ts'
edit(p,"assert.throws(()=>applyChanges(d,[{type:'layer.set',layerId:'flow',values}],false));", "assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:'flow',values}],false)));")
edit(p,"assert.throws(()=>applyChanges(d,[{type:'layer.set',layerId:'flow',values:{beamBinding:null}}],false));", "assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:'flow',values:{beamBinding:null}}],false)));")
