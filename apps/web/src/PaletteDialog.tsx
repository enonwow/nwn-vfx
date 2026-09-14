import React, {useState,useEffect,useRef} from 'react';
import type {EffectDocument,Project} from '../../../packages/core/src/model.js';
import type {PaletteOptions,PaletteReport} from '../../../packages/core/src/palette.js';
import {command} from './api.js';
import {validateToolInput} from './browser-contracts.js';
interface Proposal {document:EffectDocument;diff:Array<{path:string;before:unknown;after:unknown}>;report:PaletteReport;proposalHash:string}
export function PaletteDialog({project,selectedLayerId,onClose,onPending,onCommit,renderPreview}:{project:Project;selectedLayerId:string;
  onClose():void;onPending(value:unknown):void;onCommit(input:Record<string,unknown>,key:string):Promise<void>;
  renderPreview(before:EffectDocument,after:EffectDocument):React.ReactNode}){
  const [base]=useState(()=>structuredClone(project));
  const [options,setOptions]=useState<PaletteOptions>({from:'#ff0000',to:'#00ff00',scope:{layerIds:'all',excludeLayerIds:[],includeDisabled:false},textureMode:'preserve'});
  const [proposal,setProposal]=useState<Proposal|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const key=useRef('');
  useEffect(()=>{onPending({projectId:base.id,expectedRevision:base.revision,options,proposalHash:proposal?.proposalHash??null});},[options,proposal]);
  const edit=(next:PaletteOptions)=>{setOptions(next);setProposal(null);setError('');};
  async function preview(){setBusy(true);setError('');try{
    const input={projectId:base.id,expectedRevision:base.revision,options};
    validateToolInput('studio.palette.preview',{viewSessionId:'local-ui',input});
    const result=await command<Proposal>('palette.preview',input);setProposal(result);key.current=crypto.randomUUID();
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function commit(){if(!proposal)return;setBusy(true);setError('');try{
    await onCommit({projectId:base.id,expectedRevision:base.revision,options,proposalHash:proposal.proposalHash},key.current);onClose();
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  return <div className="modal-backdrop"><section className="modal palette-modal" role="dialog" aria-modal="true" aria-label="Paleta efektu">
    <h2>Zmień paletę efektu</h2><p>Przesuń odcienie razem. Jasność i różnice barw są zachowane w granicach sRGB; nasycenie może się zmniejszyć. Biel, szarość i czerń pozostają bez zmian.</p>
    <fieldset disabled={busy}><div className="palette-colors"><label>Kolor źródłowy<input type="color" aria-label="Kolor źródłowy palety" value={options.from} onChange={e=>edit({...options,from:e.target.value})}/></label>
      <span>→</span><label>Nowy odcień<input type="color" aria-label="Nowy odcień palety" value={options.to} onChange={e=>edit({...options,to:e.target.value})}/></label>
      <select aria-label="Gotowy odcień palety" defaultValue="" onChange={e=>{if(e.target.value)edit({...options,to:e.target.value});}}><option value="">Wybierz odcień</option><option value="#00ff00">Zieleń</option><option value="#3484ff">Błękit</option><option value="#a548ff">Fiolet</option><option value="#ffb52e">Złoto</option></select></div>
      <label>Zakres <select aria-label="Zakres palety" value={options.scope.layerIds==='all'?'all':'selected'} onChange={e=>edit({...options,scope:{...options.scope,layerIds:e.target.value==='all'?'all':[selectedLayerId],excludeLayerIds:[]}})}><option value="all">Cały efekt</option><option value="selected">Wybrane warstwy</option></select></label>
      <div className="palette-layers">{base.document.layers.map(layer=>{const checked=(options.scope.layerIds==='all'||options.scope.layerIds.includes(layer.id))&&!options.scope.excludeLayerIds.includes(layer.id);return <label key={layer.id}><input type="checkbox" aria-label={`Paleta: ${layer.name}`} checked={checked} onChange={e=>{
        const scope=structuredClone(options.scope);if(scope.layerIds==='all')scope.excludeLayerIds=e.target.checked?scope.excludeLayerIds.filter(id=>id!==layer.id):[...scope.excludeLayerIds,layer.id];
        else scope.layerIds=e.target.checked?[...scope.layerIds,layer.id]:scope.layerIds.filter(id=>id!==layer.id);edit({...options,scope});
      }}/>{layer.name}{!layer.enabled?' · wyłączona':''}{base.document.locks.some(l=>l.layerId===layer.id)?' · ma blokady':''}</label>;})}</div>
      <label><input type="checkbox" checked={options.scope.includeDisabled} onChange={e=>edit({...options,scope:{...options.scope,includeDisabled:e.target.checked}})}/> Uwzględnij wyłączone warstwy</label>
      <label><input type="checkbox" aria-label="Przekształć kolory PNG" checked={options.textureMode==='transform'} onChange={e=>edit({...options,textureMode:e.target.checked?'transform':'preserve'})}/> Przekształć kolory PNG</label>
      <p>PNG: nowa kopia bez zmiany alpha i UV. Wymaga neutralnego mnożnika warstwy. Wyłącz np. kości z zakresu; narzędzie nie rozpoznaje krwi ani innych części obrazu.</p>
    </fieldset>
    {error&&<p role="alert" className="mesh-error">{error}</p>}
    {proposal&&<><div className="palette-previews">{renderPreview(base.document,proposal.document)}</div>
      <p role="status">Podgląd bez zapisu · {proposal.report.colors.length} zmian parametrów · {proposal.report.textures.length} tekstur · {proposal.report.skippedLayerIds.length} pominiętych warstw</p>
      <details><summary>Różnice i tekstury</summary><ul>{proposal.diff.map(d=><li key={d.path}>{d.path}{d.path==='/assets'?' — dodano pochodne PNG; oryginały zachowane':` · ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`}</li>)}</ul>
        {proposal.report.textures.map(t=><p key={t.sourceAssetId}>{t.layerIds.join(', ')}: {t.changedPixels} pikseli · maks. zmiana jasności OKLab {t.maxLightnessError.toFixed(4)}</p>)}</details>
      {proposal.report.warnings.map(w=><p key={w}>{w}</p>)}</>}
    <div className="palette-actions"><button className="button" disabled={busy} onClick={()=>void preview()}>Podgląd palety</button>
      <button className="button primary" disabled={busy||!proposal} onClick={()=>void commit()}>Zatwierdź paletę</button><button className="button" disabled={busy} onClick={onClose}>Anuluj paletę</button></div>
  </section></div>;
}
