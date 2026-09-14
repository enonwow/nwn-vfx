import React, { useState } from 'react';
import type { AxisAngle, EmitterLayer, LayerValues } from '../../../packages/core/src/model.js';
import type { MeshJsonDraft } from './MeshInspector.js';

const neutral: AxisAngle = [0, 0, 1, 0];
const presets: Array<{ id: string; label: string; value: AxisAngle | null }> = [
  { id: 'z+', label: '+Z · w górę (domyślnie)', value: null },
  { id: 'x+', label: '+X', value: [0, 1, 0, Math.PI / 2] },
  { id: 'x-', label: '−X', value: [0, 1, 0, -Math.PI / 2] },
  { id: 'y+', label: '+Y', value: [1, 0, 0, -Math.PI / 2] },
  { id: 'y-', label: '−Y', value: [1, 0, 0, Math.PI / 2] },
  { id: 'z-', label: '−Z · w dół', value: [1, 0, 0, Math.PI] },
];

export function EmitterOrientation({ layer, disabled, pending, onPendingChange, onChange }: {
  layer: EmitterLayer; disabled: boolean; pending?: MeshJsonDraft;
  onPendingChange(value?: MeshJsonDraft): void; onChange(values: LayerValues): void;
}) {
  const [error, setError] = useState('');
  const orientation = layer.orientation ?? neutral;
  const preset = presets.find(item => (item.value ?? neutral).every((value, index) => Math.abs(value - orientation[index]) < 1e-9));
  const values: string[] = pending ? JSON.parse(pending.text) : orientation.map(String);
  function change(value: AxisAngle | null) {
    try { onChange({ orientation: value }); setError(''); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false; }
  }
  function edit(index: number, value: string) {
    const next = [...values]; next[index] = value; setError('');
    onPendingChange({ text: JSON.stringify(next), baseline: pending?.baseline ?? JSON.stringify(layer.orientation ?? null) });
  }
  function apply() {
    try {
      if (disabled) throw new Error('Orientacja emitera jest zablokowana.');
      if (!pending) return;
      if (pending.baseline !== JSON.stringify(layer.orientation ?? null)) throw new Error('Orientacja zmieniła się od rozpoczęcia edycji. Odrzuć pola i rozpocznij od aktualnych danych.');
      if (values.some(value => !value.trim() || !Number.isFinite(Number(value)))) throw new Error('Podaj cztery skończone liczby: oś X, Y, Z oraz kąt w radianach.');
      const [x, y, z, angle] = values.map(Number), length = Math.hypot(x, y, z);
      if (length < 1e-9) throw new Error('Oś obrotu emitera nie może być zerowa.');
      if (Math.abs(angle) > Math.PI * 8) throw new Error('Kąt musi mieścić się między −8π i 8π radianów.');
      if (change([x / length, y / length, z / length, angle])) onPendingChange(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <fieldset><legend>ORIENTACJA EMITERA</legend>
    <label className="select-field">Oś emisji<select aria-label="Orientacja emitera" value={preset?.id ?? 'custom'} disabled={disabled || !!pending}
      onChange={event => change(presets.find(item => item.id === event.target.value)!.value)}>
      {presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}<option value="custom" disabled>Własna orientacja</option>
    </select></label>
    <p className="mesh-help">Lokalny kierunek +Z obraca prędkość początkową cząstek. Grawitacja pozostaje w osi Z świata.</p>
    {error && <p className="mesh-error" role="alert">{error}</p>}
    <details className="mesh-json" open={pending ? true : undefined}><summary>Własna oś i kąt emitera</summary>
      <p>Podaj oś obrotu, a nie kierunek emisji. Niezerowa oś zostanie znormalizowana. Kąt w radianach; π/2 ≈ 1,5708 rad.</p>
      <div className="mesh-vector">{values.slice(0, 3).map((value, index) => <label className="mesh-number" key={index}>
        <span>Oś obrotu {'XYZ'[index]}</span><input type="text" inputMode="decimal" aria-label={`Oś obrotu emitera ${'XYZ'[index]}`} value={value} disabled={disabled}
          onChange={event => edit(index, event.target.value)}/></label>)}</div>
      <label className="mesh-number"><span>Kąt obrotu (rad)</span><input type="text" inputMode="decimal" aria-label="Kąt obrotu emitera (rad)" value={values[3]} disabled={disabled}
        onChange={event => edit(3, event.target.value)}/></label>
      <div className="mesh-json-actions"><button className="button" disabled={disabled || !pending} onClick={apply}>Normalizuj oś i zastosuj</button>
        <button className="text-button" disabled={!pending} onClick={() => { onPendingChange(undefined); setError(''); }}>Odrzuć orientację</button></div>
      <p>Pola pozostają w tej karcie podczas przełączania warstw. Zastosuj je przed zapisaniem projektu.</p>
    </details>
  </fieldset>;
}
