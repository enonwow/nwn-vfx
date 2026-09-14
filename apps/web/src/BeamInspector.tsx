import React,{useState} from 'react';
import type {BeamLayer,LayerValues} from '../../../packages/core/src/model.js';
import type {MeshJsonDraft} from './MeshInspector.js';

export function BeamInspector({layer,disabled,sharedFlow=false,isLocked,pending,onPending,onChange}:{layer:BeamLayer;disabled:boolean;sharedFlow?:boolean;isLocked(field:string):boolean;pending?:MeshJsonDraft;onPending(p?:MeshJsonDraft):void;onChange(v:LayerValues):void}) {
  const [error,setError]=useState('');
  const base={width:String(layer.width),alpha:String(layer.alpha),radius:String(layer.radius),delay:String(layer.delay),lightningScale:String(layer.lightningScale),segments:String(layer.segments),
    source:layer.source.map(String),target:layer.target.map(String),color:layer.color,direction:layer.flow.direction,speed:String(layer.flow.speed),
    mappingAxis:layer.textureMapping?.axis??'off',mappingFit:layer.textureMapping?.fit??'source',
    materialMode:layer.materialMotion?.mode??'off',materialDirection:layer.materialMotion?.direction??'source-to-target',materialFps:String(layer.materialMotion?.fps??15),
    motion:layer.nativeMotion?.phase??'off',nativeDirection:layer.nativeMotion?.direction??'target-to-source',fps:String(layer.nativeMotion?.fps??16),pulseWidth:String(layer.nativeMotion?.pulseWidth??.25),fit:layer.nativeMotion?.fit??'alpha-bounds'};
  const baseline=JSON.stringify(base),values=pending?JSON.parse(pending.text):base;
  function change(key:string,value:unknown){const text=JSON.stringify({...values,[key]:value});onPending(text===baseline?undefined:{text,baseline:pending?.baseline??baseline});}
  function motion(phase:string){const text=JSON.stringify({...values,motion:phase,...(phase==='off'?{}:{segments:'2',radius:'0',lightningScale:'0'})});onPending(text===baseline?undefined:{text,baseline:pending?.baseline??baseline});}
  function material(mode:string){const text=JSON.stringify({...values,materialMode:mode,...(mode==='off'?{}:{segments:'2',radius:'0',lightningScale:'0',speed:'0',mappingAxis:'v',mappingFit:'source',motion:'off'})});onPending(text===baseline?undefined:{text,baseline:pending?.baseline??baseline});}
  const numeric=(key:string,label:string,field=key)=><label className="mesh-number"><span>{label}</span><input aria-label={label} value={values[key]} inputMode="decimal" disabled={disabled||isLocked(field)} onChange={e=>change(key,e.target.value)}/></label>;
  return <div className="mesh-inspector"><fieldset disabled={disabled}><legend>BEAM MIĘDZY PUNKTAMI</legend>
    <p className="mesh-help">Stała szerokość w metrach. W grze punkty wyznacza EffectBeam. Te współrzędne służą podglądowi.</p>
    {sharedFlow&&<p className="mesh-help" role="note">Nitka i cząstki tworzą jeden model. Wspólne końce i kierunek zmienisz w warstwie strumienia. Nitka pozostaje widoczna do usunięcia całego efektu przez konsumenta po zakończeniu życia ostatnich cząstek. Wygląd wymaga testu w NWN.</p>}
    {(['source','target'] as const).map(key=><div key={key}>{[0,1,2].map(i=><label className="mesh-number" key={i}><span>{key==='source'?'Źródło':'Cel'} {'XYZ'[i]}</span><input aria-label={`${key==='source'?'Źródło':'Cel'} beama ${'XYZ'[i]}`} value={values[key][i]} inputMode="decimal" disabled={sharedFlow||isLocked(key)} onChange={e=>change(key,values[key].map((v:string,j:number)=>j===i?e.target.value:v))}/></label>)}</div>)}
    {numeric('width',values.mappingAxis==='off'?'Szerokość beama (m)':'Półszerokość odcinka NWN (m)')}{numeric('alpha','Alpha beama')}
    <label className="mesh-number"><span>Kolor beama</span><input aria-label="Kolor beama" type="color" value={values.color} disabled={isLocked('color')} onChange={e=>change('color',e.target.value)}/></label>
    {numeric('radius','Nieregularność beama (m)')}{numeric('delay','Odstęp zmian beama (s)')}{numeric('lightningScale','Skala nieregularności Lightning')}
    <label className="mesh-number"><span>Podziały beama</span><select aria-label="Podziały beama" value={values.segments} disabled={isLocked('segments')} onChange={e=>change('segments',e.target.value)}>{[2,4,8,16,32,64].map(n=><option key={n}>{n}</option>)}</select></label>
    <p className="mesh-help">Dla 32 odcinków eksport zawiera 33 punkty. Rzeczywisty wygląd i szerokość w NWN wymagają testu.</p>
  </fieldset><fieldset disabled={disabled}><legend>OKRESOWY RUCH MATERIAŁU</legend>
    <label>Animacja tekstury<select aria-label="Okresowy ruch materiału" value={values.materialMode} disabled={isLocked('materialMotion')||['segments','radius','lightningScale','flow','textureMapping','nativeMotion'].some(isLocked)} onChange={e=>material(e.target.value)}><option value="off">Wyłączony — kontrola statyczna</option><option value="periodic-pan">Przesuwanie okresowej wstęgi</option></select></label>
    {values.materialMode!=='off'&&<><label>Kierunek materiału<select aria-label="Kierunek okresowego materiału" value={values.materialDirection} disabled={isLocked('materialMotion')} onChange={e=>change('materialDirection',e.target.value)}><option value="source-to-target">Źródło → cel</option><option value="target-to-source">Cel → źródło</option></select></label>{numeric('materialFps','Klatki okresowego materiału na sekundę','materialMotion')}</>}
    <p className="mesh-help">Wymaga własnego PNG: identyczne górny i dolny wiersz, przezroczyste boki. 16 klatek, 2 powtórzenia na 3 punktach. Podgląd i eksport używają tego samego atlasu. Pozorny skręt tekstury; bez helisy. Płynność i łączenie wymagają testu w NWN.</p>
  </fieldset><fieldset disabled={disabled||values.motion!=='off'||values.materialMode!=='off'}><legend>TEKSTURA NA ODCINKACH NWN</legend>
    <label>Oś obrazu wzdłuż odcinka<select aria-label="Oś tekstury statycznego beama" value={values.mappingAxis} disabled={isLocked('textureMapping')} onChange={e=>change('mappingAxis',e.target.value)}><option value="off">Historyczne mapowanie i podgląd</option><option value="u">Od lewej do prawej (U)</option><option value="v">Od dołu do góry (V)</option></select></label>
    {values.mappingAxis!=='off'&&<><label>Dopasowanie obrazu<select aria-label="Dopasowanie tekstury statycznego beama" value={values.mappingFit} disabled={isLocked('textureMapping')} onChange={e=>change('mappingFit',e.target.value)}><option value="source">Cały obraz z marginesami</option><option value="alpha-bounds">Przytnij przezroczyste marginesy</option></select></label><p className="mesh-help">Cały obraz powtarza się na każdym z {values.segments} odcinków. Podgląd pokazuje te powtórzenia bez symulowanego przepływu. Pełna szerokość to dwukrotność parametru. Eksport tworzy pochodną tekstury; źródłowy PNG pozostaje zachowany.</p></>}
    <p className="mesh-help">Przycięty obraz wypełnia odcinek. To nie daje jednej ciągłej tekstury przez całe połączenie. Mocowanie i wygląd w NWN wymagają testu.</p>
  </fieldset><fieldset disabled={disabled||values.mappingAxis!=='off'||values.materialMode!=='off'}><legend>ATLAS BEAMA — PODGLĄD</legend>
    <p className="mesh-help" role="note">Eksport animowanego beama jest wstrzymany od wersji 0.26.1 z powodu błędu powodującego awarię NWN. Możesz zachować szkic i oglądać podgląd. Do eksportu statycznego wariantu wybierz „Bez atlasu”.</p>
    <label>Faza atlasu<select aria-label="Faza atlasu beama" value={values.motion} disabled={isLocked('nativeMotion')||['segments','radius','lightningScale'].some(isLocked)} onChange={e=>motion(e.target.value)}><option value="off">Bez atlasu</option><option value="flow">Przepływ</option><option value="opening">Otwieranie: źródło → cel</option><option value="closing">Zamykanie: znika od celu</option></select></label>
    <p className="mesh-help">Podgląd pokazuje ruch po całym prostym połączeniu. Oryginalny PNG pozostaje zachowany. Ten wygląd wymaga nowego profilu eksportu.</p>
    {values.motion!=='off'&&<>
      <label>Kierunek impulsu<select aria-label="Kierunek impulsu atlasu" value={values.nativeDirection} disabled={isLocked('nativeMotion')} onChange={e=>change('nativeDirection',e.target.value)}><option value="target-to-source">Cel → źródło</option><option value="source-to-target">Źródło → cel</option></select></label>
      {numeric('fps','Klatki atlasu na sekundę','nativeMotion')}{numeric('pulseWidth','Długość impulsu / długość pasma','nativeMotion')}
      <label>Dopasowanie PNG<select aria-label="Dopasowanie PNG atlasu" value={values.fit} disabled={isLocked('nativeMotion')} onChange={e=>change('fit',e.target.value)}><option value="alpha-bounds">Przytnij przezroczyste marginesy</option><option value="source">Zachowaj pełny obraz</option></select></label>
      <p className="mesh-help">PNG od lewej do prawej = źródło → cel. Wybrany obszar wypełnia długość i szerokość pasma. Kierunek i długość impulsu dotyczą fazy Przepływ. Otwieranie odsłania pasmo; zamykanie usuwa je od celu.</p>
      <p className="mesh-help">16 klatek podglądu{Number(values.fps)>0?`: obieg ${(16/Number(values.fps)).toFixed(3)} s`:''}. Wszystkie fazy powtarzają się. Podgląd nie potwierdza czasu ani wyglądu w NWN.</p>
    </>}
  </fieldset><fieldset disabled={disabled||sharedFlow||values.motion!=='off'||values.mappingAxis!=='off'}><legend>KIERUNEK — TYLKO PODGLĄD</legend>
    <label>Kierunek przepływu<select aria-label="Kierunek przepływu beama" value={values.direction} disabled={isLocked('flow')} onChange={e=>change('direction',e.target.value)}><option value="target-to-source">Cel → źródło (zasysanie)</option><option value="source-to-target">Źródło → cel</option></select></label>
    {numeric('speed','Prędkość przepływu podglądu (m/s)','flow')}
    <p className="mesh-help">Ten ruch przedstawia zamiar autora. Pierwszy eksport beama nie steruje natywnym kierunkiem przepływu. Efekt działa do zakończenia przez konsumenta; animacja odpływu przy Stop nie jest eksportowana.</p>
    {sharedFlow&&<p className="mesh-help">Osobne nitki mogą mieć własne odchylenia. Zaplanowane oplatanie strumienia i przesunięcie fazy nie są obsługiwane. Podgląd ruchu jest przybliżeniem; w grze Linked okresowo zmienia kształt.</p>}
  </fieldset><div className="mesh-actions"><button disabled={!pending||disabled} onClick={()=>{
    try{if(pending?.baseline!==baseline)throw new Error('Parametry bazowe zmieniły się. Zachowaj szkic i rozwiąż konflikt.');
      const number=(v:string)=>{if(!v.trim()||!Number.isFinite(Number(v)))throw new Error('Wpisz skończoną liczbę w każdym polu.');return Number(v);};
      const next={width:number(values.width),alpha:number(values.alpha),radius:number(values.radius),delay:number(values.delay),lightningScale:number(values.lightningScale),segments:number(values.segments),
        source:values.source.map(number),target:values.target.map(number),color:values.color,flow:{direction:values.direction,speed:number(values.speed)},
        ...(values.mappingAxis==='off'?(layer.textureMapping?{textureMapping:null}:{}):{textureMapping:{axis:values.mappingAxis,fit:values.mappingFit}}),
        ...(values.materialMode==='off'?(layer.materialMotion?{materialMotion:null}:{}):{materialMotion:{mode:values.materialMode,direction:values.materialDirection,fps:number(values.materialFps)}}),
        ...(values.motion==='off'?(layer.nativeMotion?{nativeMotion:null}:{}):{nativeMotion:{phase:values.motion,direction:values.nativeDirection,fps:number(values.fps),pulseWidth:number(values.pulseWidth),fit:values.fit}})};
      const patch=Object.fromEntries(Object.entries(next).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(layer[k as keyof BeamLayer])));
      if(Object.keys(patch).length)onChange(patch);onPending();setError('');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }}>Zastosuj parametry beama</button><button disabled={!pending} onClick={()=>{onPending();setError('');}}>Odrzuć parametry beama</button></div>{error&&<p role="alert">{error}</p>}</div>;
}
