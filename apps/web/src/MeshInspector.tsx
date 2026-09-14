import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { makeMeshLayer, type LayerValues, type MeshLayer } from '../../../packages/core/src/model.js';
import { sampleMeshLayer } from '../../../packages/core/src/mesh.js';
import type { ObjEditorDraft } from './ObjImportInspector.js';

export interface MeshJsonDraft { text: string; baseline: string }
export interface MeshEditorDraft { beamBinding?:MeshJsonDraft; beam?:MeshJsonDraft; flipbook?:MeshJsonDraft; audio?:MeshJsonDraft; geometry?: MeshJsonDraft; animation?: MeshJsonDraft; orientation?: MeshJsonDraft; obj?: ObjEditorDraft;path?:MeshJsonDraft }
type JsonField = 'geometry' | 'animation' | 'orientation';
type Track = 'position' | 'orientation' | 'scale' | 'alpha';
const labels: Record<Track, string> = { position: 'Pozycja', orientation: 'Obrót', scale: 'Skala', alpha: 'Przezroczystość' };
const json = (value: unknown) => JSON.stringify(value, null, 2);

function NumberField({ label, value, min, max, step = .01, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onChange(value: number): void;
}) {
  return <label className="mesh-number"><span>{label}</span><input aria-label={label} type="number" value={value} min={min} max={max} step={Number.isInteger(step) ? step : 'any'}
    disabled={disabled} onChange={event => { const number = event.target.valueAsNumber; if (Number.isFinite(number)) onChange(number); }}/></label>;
}
function normalizeAxis(value: number[]) {
  const magnitude = Math.hypot(value[0], value[1], value[2]);
  if (magnitude < 1e-9) throw new Error('Oś obrotu nie może być zerowa.');
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude, value[3]] as MeshLayer['orientation'];
}

export function MeshInspector({ layer, documentDuration, previewTime, disabled, isLocked, pending, onPendingChange, onChange }: {
  layer: MeshLayer; documentDuration: number; previewTime: number; disabled: boolean;
  isLocked(field: string): boolean; pending: MeshEditorDraft; onPendingChange(value: MeshEditorDraft): void;
  /** The parent validates the complete proposed document before updating its draft. */
  onChange(values: LayerValues): void;
}) {
  const [error, setError] = useState('');
  const locked = (field: string) => disabled || isLocked(field);
  function change(values: LayerValues) {
    try { onChange(values); setError(''); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false; }
  }
  function geometry(next: MeshLayer['geometry']) { change({ geometry: next }); }
  function editJson(field: JsonField, text: string) {
    const next = { ...pending };
    if (text === json(layer[field])) delete next[field];
    else next[field] = { text, baseline: pending[field]?.baseline ?? JSON.stringify(layer[field]) };
    onPendingChange(next);
  }
  function discard(field: JsonField) { const next = { ...pending }; delete next[field]; onPendingChange(next); setError(''); }
  function applyJson(field: JsonField) {
    const edit = pending[field]; if (!edit) return;
    try {
      if (isLocked(field)) throw new Error('To pole jest zablokowane.');
      if (JSON.stringify(layer[field]) !== edit.baseline) throw new Error('Dane zmieniły się od rozpoczęcia edycji JSON. Odrzuć edycję i skopiuj aktualne dane przed ponownym zastosowaniem.');
      const value = JSON.parse(edit.text);
      if (change({ [field]: value })) discard(field);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function jsonEditor(field: JsonField, label: string) {
    return <details className="mesh-json" open={pending[field] ? true : undefined}><summary>{label}</summary>
      <textarea aria-label={label} spellCheck={false} value={pending[field]?.text ?? json(layer[field])} disabled={locked(field)} onChange={event => editJson(field, event.target.value)}/>
      <div className="mesh-json-actions"><button className="button" disabled={locked(field) || !pending[field]} onClick={() => applyJson(field)}>Zastosuj {field === 'geometry' ? 'geometrię' : 'klucze'}</button>
        <button className="text-button" disabled={!pending[field]} onClick={() => discard(field)}>Odrzuć edycję {field === 'geometry' ? 'geometrii' : 'kluczy'}</button></div>
      <p>JSON zostaje w tej karcie podczas przełączania warstw. Zastosuj go przed zapisaniem projektu.</p>
    </details>;
  }
  function updateKey(track: Track, index: number, patch: { time?: number; value?: number | number[] }) {
    const keys = [...(layer.animation[track] || [])].map((key, i) => i === index ? { ...key, ...patch } : key);
    change({ animation: { ...layer.animation, [track]: keys } });
  }
  function addKey(track: Track) {
    const time = Math.round(Math.max(0, Math.min(layer.duration, previewTime - layer.start)) * 1000) / 1000;
    const keys = [...(layer.animation[track] || [])];
    if (keys.some(key => Math.abs(key.time - time) < 1e-8)) { setError('W tym czasie istnieje już klucz tego parametru. Przesuń czas podglądu albo edytuj istniejący klucz.'); return; }
    keys.push({ time, value: structuredClone(sampleMeshLayer(layer, layer.start + time)[track]) } as never);
    change({ animation: { ...layer.animation, [track]: keys.sort((a, b) => a.time - b.time) } });
  }
  function removeKey(track: Track, index: number) {
    const animation = { ...layer.animation }, remaining = (animation[track] || []).filter((_key, i) => i !== index);
    if (remaining.length) Object.assign(animation, { [track]: remaining }); else delete animation[track];
    change({ animation });
  }
  return <>
    <p className="mesh-help mesh-intro">Geometria w metrach · Z w górę. Obrót: oś jednostkowa i kąt w radianach. Materiał i alpha współpracują z przypisaną teksturą.</p>
    {error && <p className="mesh-error" role="alert">{error}</p>}
    <fieldset disabled={disabled}><legend>GEOMETRIA</legend>
      <label className="select-field">Kształt<select aria-label="Kształt geometrii" value={layer.geometry.kind} disabled={locked('geometry') || !!pending.geometry}
        onChange={event => geometry(makeMeshLayer(layer.id, layer.name, event.target.value as MeshLayer['geometry']['kind']).geometry)}>
        <option value="box">Prostopadłościan</option><option value="ring">Pierścień</option><option value="custom">Własna geometria</option></select></label>
      {layer.geometry.kind === 'box' && <div className="mesh-vector">{layer.geometry.dimensions.map((value, index) => <NumberField key={index} label={`Wymiar ${'XYZ'[index]} (m)`} value={value} min={.001} max={20} step={.01} disabled={locked('geometry') || !!pending.geometry}
        onChange={number => { if (layer.geometry.kind !== 'box') return; const dimensions = [...layer.geometry.dimensions] as [number, number, number]; dimensions[index] = number; geometry({ ...layer.geometry, dimensions }); }}/>)}</div>}
      {layer.geometry.kind === 'ring' && <><div className="mesh-vector two"><NumberField label="Promień wewnętrzny (m)" value={layer.geometry.innerRadius} min={0} max={layer.geometry.outerRadius - .001} disabled={locked('geometry') || !!pending.geometry}
        onChange={innerRadius => { if (layer.geometry.kind === 'ring') geometry({ ...layer.geometry, innerRadius }); }}/>
        <NumberField label="Promień zewnętrzny (m)" value={layer.geometry.outerRadius} min={layer.geometry.innerRadius + .001} max={10} disabled={locked('geometry') || !!pending.geometry}
          onChange={outerRadius => { if (layer.geometry.kind === 'ring') geometry({ ...layer.geometry, outerRadius }); }}/></div>
        <NumberField label="Segmenty pierścienia" value={layer.geometry.segments} min={8} max={128} step={1} disabled={locked('geometry') || !!pending.geometry}
          onChange={segments => { if (layer.geometry.kind === 'ring') geometry({ ...layer.geometry, segments }); }}/><p className="mesh-help">Płaski pierścień leży w płaszczyźnie XY.</p></>}
      {layer.geometry.kind === 'custom' && <p className="mesh-help">{layer.geometry.vertices.length} wierzchołków · {layer.geometry.faces.length} trójkątów. Indeksy ścian zaczynają się od 0; maksymalnie 2048 wierzchołków i 4096 ścian.</p>}
      {layer.geometry.kind === 'custom' && <p className="mesh-help">Teksturowana siatka wymaga <code>uv: [[u,v],…]</code> oraz <code>uvFaces: [[i,j,k],…]</code>. Indeksy UV są osobne od indeksów wierzchołków; jeden trójkąt UV odpowiada jednemu elementowi faces. UV (0,0) jest na dole po lewej.</p>}
      {jsonEditor('geometry', 'Geometria JSON')}
    </fieldset>
    <fieldset disabled={disabled}><legend>TRANSFORMACJA</legend>
      <div className="mesh-vector">{layer.position.map((value, index) => <NumberField key={index} label={`Pozycja ${'XYZ'[index]} (m)`} value={value} min={-20} max={20} disabled={locked('position')}
        onChange={number => { const position = [...layer.position] as MeshLayer['position']; position[index] = number; change({ position }); }}/>)}</div>
      <div className="mesh-vector">{layer.orientation.slice(0, 3).map((value, index) => <NumberField key={index} label={`Oś obrotu ${'XYZ'[index]}`} value={value} min={-1} max={1} disabled={locked('orientation')}
        onChange={number => { try { const orientation = [...layer.orientation]; orientation[index] = number; change({ orientation: normalizeAxis(orientation) }); } catch (cause) { setError((cause as Error).message); } }}/>)}</div>
      <p className="mesh-help">Współrzędne osi są automatycznie normalizowane.</p>
      <div className="mesh-vector two"><NumberField label="Kąt obrotu (rad)" value={layer.orientation[3]} min={-8 * Math.PI} max={8 * Math.PI} disabled={locked('orientation')}
        onChange={angle => change({ orientation: [layer.orientation[0], layer.orientation[1], layer.orientation[2], angle] })}/>
        <NumberField label="Skala geometrii" value={layer.scale} min={.01} max={10} disabled={locked('scale')} onChange={scale => change({ scale })}/></div>
    </fieldset>
    <fieldset disabled={disabled}><legend>MATERIAŁ I CZAS</legend>
      <label className="select-field">Cieniowanie<select aria-label="Cieniowanie geometrii" value={layer.shading ?? 'flat'} disabled={locked('shading')}
        onChange={event => change({shading:event.target.value as 'flat'|'smooth'})}>
        <option value="flat">Płaskie</option><option value="smooth" disabled={layer.geometry.kind !== 'custom'}>Gładkie — własna siatka</option>
      </select></label>
      <p className="mesh-help">Gładkie cieniowanie łączy normalne tylko przez wspólne indeksy wierzchołków. Szwy UV pozostają niezależne. Wymaga materiału diffuse, aby było widoczne w podglądzie.</p>
      {layer.shading==='smooth'&&layer.animation.vertices!==undefined&&<p className="mesh-help">Podgląd przelicza cieniowanie podczas deformacji. Eksport zachowuje deformację i gładką bazową powierzchnię, ale kompilator nie zapisuje animowanych normalnych. Oświetlenie w NWN wymaga osobnego sprawdzenia.</p>}
      <label className="select-field">Materiał<select aria-label="Tryb materiału geometrii" value={layer.material ? 'lit' : 'legacy'} disabled={locked('material')}
        onChange={event => change({ material: event.target.value === 'legacy' ? null : { diffuse: layer.color, selfIllumination: '#000000' } })}>
        <option value="legacy">Dotychczasowy kolor</option><option value="lit">Diffuse i samoświecenie</option></select></label>
      {layer.material && <><div className="color-fields"><label><input type="color" aria-label="Diffuse geometrii" value={layer.material.diffuse} disabled={locked('material')}
        onChange={event => change({ material: { ...layer.material!, diffuse: event.target.value } })}/><span>Diffuse<small>{layer.material.diffuse.toUpperCase()}</small></span></label>
        <label><input type="color" aria-label="Samoświecenie geometrii" value={layer.material.selfIllumination} disabled={locked('material')}
          onChange={event => change({ material: { ...layer.material!, selfIllumination: event.target.value } })}/><span>Samoświecenie<small>{layer.material.selfIllumination.toUpperCase()}</small></span></label></div>
        <p className="mesh-help">Czarne samoświecenie daje nieświecącą bryłę. Stałe światło podglądu pokazuje wybrane cieniowanie; to przybliżenie NWN. Materiał nie obsługuje PBR ani metaliczności.</p></>}
      <div className="color-fields"><label><input type="color" aria-label="Kolor geometrii" value={layer.color} disabled={locked('color') || !!layer.material} onChange={event => change({ color: event.target.value })}/><span>{layer.material ? 'Kolor zapasowy' : 'Kolor'}<small>{layer.color.toUpperCase()}</small></span></label>
        <NumberField label="Przezroczystość geometrii" value={layer.alpha} min={0} max={1} disabled={locked('alpha')} onChange={alpha => change({ alpha })}/></div>
      <div className="mesh-vector two"><NumberField label="Początek geometrii (s)" value={layer.start} min={0} max={Math.max(0, documentDuration - layer.duration)} disabled={locked('start')} onChange={start => change({ start })}/>
        <NumberField label="Długość geometrii (s)" value={layer.duration} min={.01} max={documentDuration - layer.start} disabled={locked('duration')} onChange={duration => change({ duration })}/></div>
      <p className="mesh-help">Warstwa jest ukryta poza swoim przedziałem. Czas kluczy liczony jest od początku warstwy.</p>
    </fieldset>
    <fieldset className="mesh-animation" disabled={disabled}><legend>KLUCZE ANIMACJI</legend>
      <p className="mesh-help">Pozycja, skala i przezroczystość interpolują liniowo; obrót — po najkrótszym łuku. Przed pierwszym kluczem używana jest wartość bazowa w czasie 0, po ostatnim — jego wartość.</p>
      {(['position', 'orientation', 'scale', 'alpha'] as Track[]).map(track => <section key={track} className="mesh-track" aria-label={`Klucze: ${labels[track]}`}>
        <div className="mesh-track-heading"><strong>{labels[track]}</strong><button className="text-button" disabled={locked('animation') || !!pending.animation || (layer.animation[track]?.length || 0) >= 64} onClick={() => addKey(track)}
          aria-label={`Dodaj klucz: ${labels[track]}`} title="Dodaj wartość z bieżącego czasu podglądu"><Plus size={13}/>Klucz</button></div>
        {(layer.animation[track] || []).map((key, index) => <div className={`mesh-key ${Array.isArray(key.value) ? 'vector' : ''}`} key={index}>
          <NumberField label={`${labels[track]} klucz ${index + 1}: czas (s)`} value={key.time} min={0} max={layer.duration} disabled={locked('animation') || !!pending.animation} onChange={time => updateKey(track, index, { time })}/>
          {Array.isArray(key.value) ? key.value.map((value, component) => <NumberField key={component} label={`${labels[track]} klucz ${index + 1}: ${component === 3 ? 'kąt (rad)' : 'XYZ'[component]}`} value={value}
            min={track === 'position' ? -20 : component === 3 ? -8 * Math.PI : -1} max={track === 'position' ? 20 : component === 3 ? 8 * Math.PI : 1} disabled={locked('animation') || !!pending.animation}
            onChange={number => { try { const value = [...key.value as number[]]; value[component] = number; updateKey(track, index, { value: track === 'orientation' ? normalizeAxis(value) : value }); } catch (cause) { setError((cause as Error).message); } }}/>)
            : <NumberField label={`${labels[track]} klucz ${index + 1}: wartość`} value={key.value} min={track === 'alpha' ? 0 : .01} max={track === 'alpha' ? 1 : 10} disabled={locked('animation') || !!pending.animation} onChange={value => updateKey(track, index, { value })}/>}
          <button className="icon-button danger" aria-label={`Usuń klucz ${index + 1}: ${labels[track]}`} disabled={locked('animation') || !!pending.animation} onClick={() => removeKey(track, index)}><Trash2 size={13}/></button>
        </div>)}
        {!layer.animation[track]?.length && <p className="mesh-help">Stała wartość bazowa.</p>}
      </section>)}
      {jsonEditor('animation', 'Klucze animacji JSON')}
      <label className="select-field">Interpolacja deformacji<select aria-label="Interpolacja deformacji" value={layer.deformationInterpolation??''}
        disabled={locked('deformationInterpolation')||locked('animation')||!!pending.animation||!!pending.geometry}
        onChange={event=>change({deformationInterpolation:(event.target.value||null) as LayerValues['deformationInterpolation']})}>
        <option value="">Liniowa — domyślna</option><option value="linear">Liniowa — jawna</option>
        <option value="monotone-cubic" disabled={!layer.animation.vertices}>Gładka — zatrzymane końce</option>
        <option value="monotone-cubic-loop" disabled={!layer.animation.vertices}>Gładka — pętla</option>
      </select></label>
      <p className="mesh-help">Gładka krzywa zachowuje stałe punkty i zakres współrzędnych między kluczami. Pętla wymaga identycznych pozycji początku i końca. Podgląd i eksport przybliżają ją tymi samymi próbkami 60 Hz.</p>
      {layer.geometry.kind==='custom' && <p className="mesh-help">Deformacja: dodaj w JSON kanał <code>vertices: [&#123;time, value: [[x,y,z],…]&#125;]</code>.
        Pozycje lokalne w metrach, ten sam porządek wierzchołków; ściany i UV pozostają stałe. Podgląd i eksport używają tych samych próbek 60 Hz.
        {layer.animation.vertices && ` Klatki deformacji: ${layer.animation.vertices.length}.`} Zmiana kanału podlega blokadzie całej animacji.</p>}
    </fieldset>
  </>;
}
