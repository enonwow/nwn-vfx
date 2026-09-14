import React,{useState,useRef,useEffect,useMemo} from 'react';
import type {EffectDocument} from '../../../packages/core/src/model.js';
import type {AudioAsset,AudioClip,AudioValues} from '../../../packages/core/src/audio.js';
import {MIN_AUDIO_GAIN_DB,MAX_AUDIO_GAIN_DB,gainFromDb,gainToDb,analyzeAudioLevels} from '../../../packages/core/src/audio.js';

export function AudioWaveform({asset,clip}:{asset:AudioAsset;clip?:AudioClip}){
  const points=Array.from({length:128},(_,i)=>{
    const t=clip?(clip.offset+i/127*clip.duration)/asset.duration:i/127;
    const value=asset.waveform[Math.min(127,Math.max(0,Math.floor(t*128)))]??0;return `${i},${16-value*15}`;
  });
  return <svg className="audio-waveform" viewBox="0 0 127 32" preserveAspectRatio="none" aria-label="Przebieg fali audio"><polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="1"/><polyline points={points.map(p=>{const[x,y]=p.split(',').map(Number);return`${x},${32-y}`;}).join(' ')} fill="none" stroke="currentColor" strokeWidth="1"/></svg>;
}
export function AudioLibrary({document,disabled,onImport,onAdd,onRemove}:{document:EffectDocument;disabled:boolean;onImport:(file:File)=>void;onAdd:(asset:AudioAsset)=>void;onRemove:(asset:AudioAsset)=>void}){
  const input=useRef<HTMLInputElement>(null);
  return <section className="audio-library"><div className="panel-heading"><span>DŹWIĘKI</span><button className="button" disabled={disabled} onClick={()=>input.current?.click()}>Importuj audio</button></div>
    <input ref={input} type="file" hidden accept=".wav,.mp3,audio/wav,audio/mpeg" aria-label="Plik audio" onChange={e=>{const file=e.target.files?.[0];if(file)onImport(file);e.target.value='';}}/>
    <small>WAV PCM16 / MP3 · Odsłuch początkowo wyciszony</small>
    <AudioLevels document={document}/>
    {(document.audioAssets??[]).map(a=><div className="audio-asset" key={a.id}><strong>{a.name}</strong><AudioWaveform asset={a}/><small>{a.duration.toFixed(3)} s · {a.decoded.sampleRate} Hz · {a.decoded.channels===2?'stereo':'mono'}</small><div><button disabled={disabled} onClick={()=>onAdd(a)}>Dodaj klip</button><button disabled={disabled||document.audioClips?.some(c=>c.assetId===a.id)} onClick={()=>onRemove(a)}>Usuń dźwięk</button></div></div>)}
  </section>;
}
function AudioLevels({document}:{document:EffectDocument}){
  const reports=useMemo(()=>{try{return document.audioClips?.length?analyzeAudioLevels(document):[];}catch{return null;}},[document.audioClips,document.audioAssets,document.duration]);
  if(reports?.length===0)return null;
  return <section aria-label="Poziomy audio" className="audio-levels"><strong>Poziomy audio · zastosowany szkic</strong>
    {reports?reports.map(report=><small key={report.sampleRate} role={report.clippedSamples?'alert':undefined}>{report.channels===2?'Podgląd':'Eksport NWN'}: szczyt {report.peakDbFS===null?'−∞ dBFS (cisza)':`${report.peakDbFS>0?'+':''}${report.peakDbFS.toFixed(2)} dBFS`}. {report.clippedSamples?'Przekroczenie maksymalnego poziomu może zniekształcić dźwięk — zmniejsz wzmocnienie.':'Poziom w zakresie.'}</small>):<small>Uzupełnij poprawny zakres klipów, aby obliczyć poziomy audio.</small>}
  </section>;
}
export interface AudioEditorDraft {text:string;baseline:string}
const numeric=['start','duration','offset','fadeIn','fadeOut'] as const;
const labels={start:'Start klipu',duration:'Długość klipu',offset:'Offset źródła',fadeIn:'Fade-in',fadeOut:'Fade-out'};
const percentText=(gain:number)=>String(Number((gain*100).toPrecision(15)));
const dbText=(gain:number)=>(gainToDb(gain)??0).toFixed(2);
// Read old percentage drafts without rounding their saved linear baseline.
function draftGain(values:Record<string,any>){
  const raw=Number(values.gain);
  return !validLegacyPercent(values.gainPercent)||values.gainPercent===undefined||Number(values.gainPercent)===Number(percentText(raw))?raw:Number(values.gainPercent)/100;
}
const validLegacyPercent=(text:unknown)=>text===undefined||(typeof text==='string'&&text.trim()!==''&&Number.isFinite(Number(text))&&Number(text)>=0&&Number(text)<=400);
export function AudioInspector({clip,asset,pending,onPending,onApply,onRemove,onLock,isLocked,disabled}:{clip:AudioClip;asset:AudioAsset;pending?:AudioEditorDraft;
  onPending:(draft:AudioEditorDraft|undefined)=>void;onApply:(values:AudioValues)=>void;onRemove:()=>void;onLock:()=>void;isLocked:(field:string)=>boolean;disabled:boolean}){
  const serialize=()=>JSON.stringify({name:clip.name,enabled:clip.enabled,...Object.fromEntries(numeric.map(k=>[k,String(clip[k])])),gain:String(clip.gain),gainDb:dbText(clip.gain),muted:clip.gain===0});
  const [text,setText]=useState(pending?.text??serialize()),[error,setError]=useState('');const baseline=useRef(pending?.baseline??serialize());
  useEffect(()=>{if(!pending){const fresh=serialize();baseline.current=fresh;setText(fresh);}},[clip,pending]);
  const values=JSON.parse(text),edit=(field:string,value:unknown)=>{const next=JSON.stringify({...values,[field]:value});setText(next);setError('');onPending(next===baseline.current?undefined:{text:next,baseline:baseline.current});};
  const rawGain=draftGain(values),unmutedGain=rawGain===0?1:rawGain,muted=values.muted??rawGain===0;
  const legacyValid=values.gainDb!==undefined||validLegacyPercent(values.gainPercent);
  const gainText=values.gainDb??(legacyValid?dbText(rawGain):''),db=Number(gainText),unchangedDb=db===Number(dbText(unmutedGain));
  // Even historical gains below -60 dB survive edits to other clip fields.
  const gainValid=legacyValid&&gainText.trim()!==''&&Number.isFinite(db)&&(unchangedDb||(db>=MIN_AUDIO_GAIN_DB&&db<=MAX_AUDIO_GAIN_DB));
  return <section className="audio-inspector"><div className="panel-heading">KLIP AUDIO</div><strong>{asset.name}</strong><AudioWaveform asset={asset} clip={clip}/>
    <label>Nazwa klipu<input aria-label="Nazwa klipu audio" value={values.name} disabled={disabled||isLocked('name')} onChange={e=>edit('name',e.target.value)}/></label>
    <label><input type="checkbox" checked={values.enabled} disabled={disabled||isLocked('enabled')} onChange={e=>edit('enabled',e.target.checked)}/>Klip włączony</label>
    <div className="audio-clip-volume" role="group" aria-label="Wzmocnienie zapisywane w klipie">
      <strong>Wzmocnienie (dB)</strong>
      <label><input aria-label="Wycisz klip" type="checkbox" checked={muted} disabled={disabled||isLocked('gain')} onChange={e=>edit('muted',e.target.checked)}/>Wycisz</label>
      <div className="audio-volume-inputs">
        <input aria-label="Wzmocnienie klipu" aria-describedby="audio-clip-volume-help" aria-valuetext={muted?'Wyciszony':gainValid?`${db>0?'+':''}${db} dB`:'Wpisz wartość od -60 do +24 dB'} type="range" min={MIN_AUDIO_GAIN_DB} max={MAX_AUDIO_GAIN_DB} step={.5} value={Math.max(MIN_AUDIO_GAIN_DB,Math.min(MAX_AUDIO_GAIN_DB,gainValid?db:0))} disabled={disabled||isLocked('gain')||muted} onChange={e=>edit('gainDb',e.target.value)}/>
        <label><span aria-hidden="true">{gainValid&&db>0?'+':''}</span><input aria-label="Wzmocnienie (dB)" aria-describedby="audio-clip-volume-help" aria-invalid={!muted&&!gainValid} type="number" min={MIN_AUDIO_GAIN_DB} max={MAX_AUDIO_GAIN_DB} step="any" value={gainText} disabled={disabled||isLocked('gain')||muted} onChange={e=>edit('gainDb',e.target.value)}/><span>dB</span></label>
      </div><small id="audio-clip-volume-help">0 dB — poziom źródła · ujemne wartości ściszają, dodatnie wzmacniają. Zakres −60 do +24 dB. Wyciszenie zapisuje ciszę; ponowne otwarcie wyciszonego klipu pozwala włączyć go na 0 dB. Zastosuj klip, potem zapisz projekt.</small>
      {!muted&&gainValid&&(db<MIN_AUDIO_GAIN_DB||db>MAX_AUDIO_GAIN_DB)&&<small>Historyczna wartość poza zakresem suwaka jest zachowana do czasu zmiany wzmocnienia.</small>}
      {!legacyValid&&<small>Stara edycja procentowa jest niekompletna. Wpisz wzmocnienie w dB lub odrzuć edycję klipu.</small>}
      <small>Przekroczenie maksymalnego poziomu może zniekształcić dźwięk — zmniejsz wzmocnienie. Po zastosowaniu sprawdź Poziomy audio.</small>
      <small>Głośność odsłuchu steruje tylko lokalnym odsłuchem.</small>
    </div>
    {numeric.map(key=><label key={key}>{labels[key]}<input aria-label={labels[key]} type="number" step={.01} min={0} max={30} value={values[key]} disabled={disabled||isLocked(key)} onChange={e=>edit(key,e.target.value)}/></label>)}
    {error&&<p role="alert">{error}</p>}<div className="audio-editor-actions"><button className="button primary" disabled={disabled||!pending} onClick={()=>{try{
      if((!muted||!legacyValid)&&!gainValid)throw new Error('Wpisz kompletne wzmocnienie od -60 do +24 dB.');
      // Display rounding must never feed back into an untouched stored gain.
      const gain=muted?0:unchangedDb?unmutedGain:gainFromDb(db);
      const patch={name:values.name,enabled:values.enabled,gain,...Object.fromEntries(numeric.map(k=>{if(!values[k].trim()||!Number.isFinite(Number(values[k])))throw new Error('Wpisz kompletne liczby.');return[k,Number(values[k])];}))};
      const changed=Object.fromEntries(Object.entries(patch).filter(([k,v])=>v!==(clip as any)[k]));if(Object.keys(changed).length)onApply(changed);setError('');onPending(undefined);
    }catch(e){setError((e as Error).message);}}}>Zastosuj klip</button><button disabled={!pending} onClick={()=>{setText(baseline.current);setError('');onPending(undefined);}}>Odrzuć edycję klipu</button></div>
    <div className="audio-editor-actions"><button disabled={disabled} onClick={onLock}>{isLocked('*')?'Odblokuj klip':'Zablokuj klip'}</button><button disabled={disabled||['*','name','enabled','assetId','gain',...numeric].some(isLocked)||pending!==undefined} onClick={onRemove}>Usuń klip</button></div>
  </section>;
}
export function AudioTimelineRows({document,selected,onSelect,onMove,disabled}:{document:EffectDocument;selected:string;onSelect:(id:string)=>void;onMove:(id:string,start:number)=>void;disabled:boolean}){
  const drag=useRef<{id:string;x:number;start:number;width:number;value:number}|null>(null);
  return <>{(document.audioClips??[]).map(clip=>{const asset=document.audioAssets!.find(a=>a.id===clip.assetId)!;
    return <div className={`timeline-row audio-row ${selected===clip.id?'selected':''}`} key={clip.id} role="group" aria-label={`Klip audio: ${clip.name}`}>
      <button className="timeline-segment audio-segment" aria-label={`Zaznacz audio: ${clip.name}`} style={{left:`${clip.start/document.duration*100}%`,width:`${clip.duration/document.duration*100}%`,opacity:clip.enabled?1:.3}}
        onClick={()=>onSelect(clip.id)} onPointerDown={e=>{if(disabled||document.locks.some(l=>l.layerId===clip.id&&(l.field==='*'||l.field==='start')))return;onSelect(clip.id);e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:clip.id,x:e.clientX,start:clip.start,value:clip.start,width:e.currentTarget.parentElement!.getBoundingClientRect().width};}}
        onPointerMove={e=>{const d=drag.current;if(!d||d.id!==clip.id)return;d.value=Math.round(Math.max(0,Math.min(document.duration-clip.duration,d.start+(e.clientX-d.x)/d.width*document.duration))*1000)/1000;e.currentTarget.style.left=`${d.value/document.duration*100}%`;}}
        onPointerUp={()=>{const d=drag.current;drag.current=null;if(d&&d.value!==clip.start)onMove(clip.id,d.value);}} onPointerCancel={e=>{drag.current=null;e.currentTarget.style.left=`${clip.start/document.duration*100}%`;}}>
        <AudioWaveform asset={asset} clip={clip}/><span>{clip.name} · {clip.start.toFixed(2)}–{(clip.start+clip.duration).toFixed(2)} s</span>
      </button></div>;
  })}</>;
}
