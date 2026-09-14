import React,{useState} from 'react';
import type {TrailLayer,LayerValues} from '../../../packages/core/src/model.js';
import {sectionsFor,TRAIL_HZ} from '../../../packages/core/src/trails.js';
import type {MeshJsonDraft} from './MeshInspector.js';

export function TrailInspector({layer,disabled,isLocked,pending,onPendingChange,onChange}:{layer:TrailLayer;disabled:boolean;
  isLocked(field:string):boolean;pending?:MeshJsonDraft;onPendingChange(value?:MeshJsonDraft):void;onChange(values:LayerValues):void}) {
  const [error,setError]=useState(''),baseline=JSON.stringify(layer.path,null,2);
  const apply=(values:LayerValues)=>{try{onChange(values);setError('');return true;}catch(e){setError(e instanceof Error?e.message:String(e));return false;}};
  const number=(field:'start'|'duration'|'width'|'tailLifetime'|'glowStrength'|'maxSegmentLength'|'alpha',label:string,min:number,max:number)=>
    <label className="mesh-number"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step="any" value={layer[field]} disabled={disabled||isLocked(field)}
      onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))apply({[field]:e.target.valueAsNumber});}}/></label>;
  return <div className="mesh-inspector">
    <fieldset disabled={disabled}><legend>ŚWIETLNY ŚLAD</legend>
      <p className="mesh-help">Ruch po jawnej ścieżce w metrach, Z w górę. Każdy fragment ogona zwęża się i gaśnie osobno.</p>
      {number('start','Start smugi (s)',0,30)}{number('duration','Czas smugi (s)',.05,30)}
      {number('width','Szerokość rdzenia FWHM (m)',.001,.2)}{number('tailLifetime','Czas życia ogona (s)',.05,10)}
      <label className="mesh-number"><span>Kolor smugi</span><input aria-label="Kolor smugi" type="color" value={layer.color} disabled={isLocked('color')} onChange={e=>apply({color:e.target.value})}/></label>
      {number('alpha','Alpha smugi',0,1)}{number('glowStrength','Siła poświaty',0,.3)}
      <p className="mesh-help">Poświata ma FWHM 2,8 × rdzeń. Łączenie additive; miękki profil.</p>
      <label><input type="checkbox" checked={layer.head.enabled} disabled={isLocked('head')} onChange={e=>apply({head:{...layer.head,enabled:e.target.checked}})}/> Punkt prowadzący</label>
      <label className="mesh-number"><span>Średnica punktu FWHM (m)</span><input aria-label="Średnica punktu FWHM (m)" type="number" min={.001} max={.2} step="any" value={layer.head.size} disabled={isLocked('head')}
        onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))apply({head:{...layer.head,size:e.target.valueAsNumber}});}}/></label>
    </fieldset>
    <fieldset disabled={disabled}><legend>ŚCIEŻKA 3D</legend><p className="mesh-help">2–64 punkty {`{time, position:[x,y,z]}`}. Czas lokalny od 0, interpolacja liniowa. Bez automatycznego wygładzania.</p>
      <textarea aria-label="Ścieżka smugi JSON" className="mesh-json" rows={12} value={pending?.text??baseline} disabled={isLocked('path')}
        onChange={e=>onPendingChange(e.target.value===baseline?undefined:{text:e.target.value,baseline:pending?.baseline??baseline})}/>
      <div className="mesh-actions"><button className="button" disabled={!pending||isLocked('path')} onClick={()=>{
        if(pending?.baseline!==baseline){setError('Ścieżka bazowa zmieniła się. Zachowaj tekst i rozwiąż konflikt przed zastosowaniem.');return;}
        try{if(apply({path:JSON.parse(pending.text)}))onPendingChange(undefined);}catch(e){setError(e instanceof Error?e.message:String(e));}
      }}>Zastosuj ścieżkę</button><button className="button" disabled={!pending} onClick={()=>{onPendingChange(undefined);setError('');}}>Odrzuć tekst ścieżki</button></div>
      {number('maxSegmentLength','Maksymalny odcinek (m)',.005,1)}
      <p className="mesh-help">{sectionsFor(layer).length-1}/128 odcinków · {TRAIL_HZ} próbek/s. Animowane wierzchołki i UV trafiają do eksportu. Podgląd przybliżony; brak weryfikacji w NWN.</p>
    </fieldset>{error&&<p role="alert" className="error-message">{error}</p>}
  </div>;
}
