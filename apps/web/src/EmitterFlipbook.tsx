import React, {useState} from 'react';
import type {EmitterLayer,LayerValues} from '../../../packages/core/src/model.js';
import type {EmitterFlipbook as Settings} from '../../../packages/core/src/flipbook.js';
import type {MeshJsonDraft} from './MeshInspector.js';

const fields = ['columns','rows','frameStart','frameEnd','fps'] as const;
const labels = ['Kolumny atlasu','Wiersze atlasu','Pierwsza klatka','Ostatnia klatka','Klatki na sekundę'];
const defaults:Settings={columns:2,rows:2,frameStart:0,frameEnd:3,fps:8};
export function EmitterFlipbook({layer,disabled,pending,onPendingChange,onChange}:{
  layer:EmitterLayer;disabled:boolean;pending?:MeshJsonDraft;
  onPendingChange(value?:MeshJsonDraft):void;onChange(values:LayerValues):void;
}) {
  const [error,setError]=useState('');
  const baseline=JSON.stringify({flipbook:layer.flipbook??null,texture:layer.texture});
  const values:string[]=pending?JSON.parse(pending.text):fields.map(k=>String((layer.flipbook??defaults)[k]));
  const available=layer.texture.startsWith('asset:');
  const edit=(index:number,value:string)=>{const next=[...values];next[index]=value;setError('');onPendingChange({text:JSON.stringify(next),baseline:pending?.baseline??baseline});};
  function apply(remove=false){
    try{
      if(disabled)throw new Error('Atlas jest zablokowany.');
      if(pending&&pending.baseline!==baseline)throw new Error('Tekstura lub atlas zmieniły się podczas edycji. Odrzuć pola i odczytaj aktualne dane.');
      if(!remove&&values.some(v=>!v.trim()||!Number.isInteger(Number(v))))throw new Error('Podaj liczby całkowite we wszystkich polach.');
      onChange({flipbook:remove?null:Object.fromEntries(fields.map((key,i)=>[key,Number(values[i])])) as unknown as Settings});
      onPendingChange(undefined);setError('');
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  }
  return <fieldset><legend>ANIMOWANA TEKSTURA CZĄSTKI</legend>
    <p className="mesh-help">Klatki od lewego górnego rogu, wierszami. Każda cząstka rozpoczyna własną animację w chwili narodzin i powtarza wybrany zakres.</p>
    {!available&&<p className="mesh-help">Najpierw wybierz własny atlas PNG w sekcji tekstury.</p>}
    <div className="mesh-vector">{fields.map((key,i)=><label className="mesh-number" key={key}><span>{labels[i]}</span><input type="text" inputMode="numeric" aria-label={labels[i]} value={values[i]} disabled={disabled||!available} onChange={e=>edit(i,e.target.value)}/></label>)}</div>
    <p className="mesh-help">Siatka: 1, 2, 4, 8 lub 16. Minimum 8 × 8 pikseli na klatkę. Zakres od zera, z ostatnią klatką włącznie; 1–60 kl./s.</p>
    <button disabled={disabled||!available} onClick={()=>apply()}>Zastosuj atlas</button>
    {layer.flipbook&&<button disabled={disabled||!!pending} onClick={()=>apply(true)}>Wyłącz animację tekstury</button>}
    {pending&&<button onClick={()=>{onPendingChange(undefined);setError('');}}>Odrzuć pola atlasu</button>}
    {error&&<p role="alert" className="mesh-error">{error}</p>}
  </fieldset>;
}
