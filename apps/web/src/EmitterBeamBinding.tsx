import React,{useState} from 'react';
import type {EmitterLayer,LayerValues} from '../../../packages/core/src/model.js';
import type {MeshJsonDraft} from './MeshInspector.js';

export function EmitterBeamBinding({layer,disabled,pending,onPendingChange,onChange}:{layer:EmitterLayer;disabled:boolean;pending?:MeshJsonDraft;onPendingChange(p?:MeshJsonDraft):void;onChange(v:LayerValues):void}) {
  const [error,setError]=useState(''),b=layer.beamBinding!;
  const base={role:b.role,source:b.source.map(String),target:b.target.map(String),direction:b.direction,node:b.node??'',pulse:!!b.pulse,period:String(b.pulse?.period??.5),duty:String(b.pulse?.duty??.6)};
  const baseline=JSON.stringify(base),v=pending?JSON.parse(pending.text):base;
  const edit=(key:string,value:unknown)=>{const text=JSON.stringify({...v,[key]:value});onPendingChange(text===baseline?undefined:{text,baseline:pending?.baseline??baseline});};
  const num=(s:string)=>{if(!s.trim()||!Number.isFinite(Number(s)))throw new Error('Wpisz skończone liczby.');return Number(s);};
  return <fieldset disabled={disabled}><legend>CZĄSTKI MIĘDZY PUNKTAMI</legend>
    <p className="mesh-help">Emisja kończy się po czasie warstwy. Istniejące cząstki żyją dalej; czas życia strumienia określa dolot. Punkty i kierunek są wspólne dla połączenia.</p>
    <label className="mesh-number">Rola warstwy<select aria-label="Rola cząstek połączenia" value={v.role} onChange={e=>edit('role',e.target.value)}><option value="flow">Ruchomy strumień</option><option value="source">Miękka końcówka źródła</option><option value="target">Miękka końcówka celu</option></select></label>
    <label className="mesh-number">Kierunek<select aria-label="Kierunek cząstek" value={v.direction} onChange={e=>edit('direction',e.target.value)}><option value="source-to-target">Źródło → cel</option><option value="target-to-source">Cel → źródło</option></select></label>
    {(['source','target'] as const).map(key=><div key={key}>{[0,1,2].map(i=><label key={i} className="mesh-number"><span>{key==='source'?'Źródło':'Cel'} {'XYZ'[i]}</span><input aria-label={`${key==='source'?'Źródło':'Cel'} strumienia ${'XYZ'[i]}`} value={v[key][i]} onChange={e=>edit(key,v[key].map((x:string,j:number)=>i===j?e.target.value:x))}/></label>)}</div>)}
    {v.role==='flow'?<><label><input aria-label="Pulsowanie emisji" type="checkbox" checked={v.pulse} onChange={e=>edit('pulse',e.target.checked)}/> Pulsowanie emisji</label>{v.pulse&&<><label className="mesh-number">Okres impulsu (s)<input aria-label="Okres impulsu (s)" value={v.period} onChange={e=>edit('period',e.target.value)}/></label><label className="mesh-number">Udział emisji w okresie<input aria-label="Udział emisji w okresie" value={v.duty} onChange={e=>edit('duty',e.target.value)}/></label></>}</>:<label className="mesh-number">Węzeł modelu postaci<input aria-label="Węzeł końcówki" type="text" value={v.node} onChange={e=>edit('node',e.target.value)}/></label>}
    <p className="mesh-help">W NWN punkty pochodzą z postaci. Końcówki są osobnymi animacjami FnF. Wybrany węzeł musi istnieć na modelu postaci; podgląd nie potwierdza mocowania.</p>
    <button disabled={!pending} onClick={()=>{try{
      if(pending?.baseline!==baseline)throw new Error('Powiązanie zmieniło się podczas edycji. Zachowaj szkic i rozwiąż konflikt.');
      onChange({beamBinding:{role:v.role,source:v.source.map(num),target:v.target.map(num),direction:v.direction,...(v.role==='flow'?(v.pulse?{pulse:{period:num(v.period),duty:num(v.duty)}}:{}):{node:v.node})}});
      onPendingChange();setError('');
    }catch(e){setError((e as Error).message);}}}>Zastosuj powiązanie cząstek</button>
    {pending&&<button onClick={()=>{onPendingChange();setError('');}}>Odrzuć pola powiązania</button>}{error&&<p role="alert">{error}</p>}
  </fieldset>;
}
