import React, { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { Change, EffectDocument, MeshLayer } from '../../../packages/core/src/model.js';
import { OBJ_IMPORT_LIMITS, prepareObjImport, type ObjImportReport } from '../../../packages/core/src/obj.js';
import { validateToolInput } from './browser-contracts.js';

/** Unapplied source/options are human work, exposed through the normal tab draft context. */
export interface ObjEditorDraft {
  text: string; baseline: string; fileName: string;
  sourceUpAxis: '' | 'y' | 'z'; metersPerUnit: string; normalMode: '' | 'flat';
  textureAssetId: string; transformText: string; reading?: boolean;
}
const baseline = (layer: MeshLayer) => JSON.stringify({ geometry: layer.geometry, texture: layer.texture });
const initial = (layer: MeshLayer): ObjEditorDraft => ({ text: '', baseline: baseline(layer), fileName: 'pasted.obj', sourceUpAxis: '',
  metersPerUnit: '', normalMode: '', textureAssetId: '', transformText: '' });

export function ObjImportInspector({ layer, document, pending, geometryPending, disabled, isLocked, onPendingChange, onApply }: {
  layer: MeshLayer; document: EffectDocument; pending?: ObjEditorDraft; geometryPending: boolean; disabled: boolean;
  isLocked(field: string): boolean;
  /** Completion must match the same project and exact reserved draft object. */
  onPendingChange(value?: ObjEditorDraft, expected?: ObjEditorDraft): boolean; onApply(changes: Change[]): void;
}) {
  const input = useRef<HTMLInputElement>(null), [error, setError] = useState(''), [report, setReport] = useState<ObjImportReport | null>(null);
  const mounted = useRef(true), latest = useRef(pending), reading = !!pending?.reading;
  latest.current = pending;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const value = pending ?? initial(layer), blocked = disabled || isLocked('geometry') || geometryPending;
  function edit(patch: Partial<ObjEditorDraft>) { onPendingChange({ ...value, ...patch }); setError(''); setReport(null); }
  async function read(file: File) {
    const reserved: ObjEditorDraft = { ...(latest.current ?? initial(layer)), fileName: file.name, reading: true };
    // Reserve synchronously: even before arrayBuffer resolves this is human
    // work, so Save and project navigation must see a pending tab draft.
    if (!onPendingChange(reserved)) return;
    latest.current = reserved; setError(''); setReport(null);
    try {
      if (file.size > OBJ_IMPORT_LIMITS.maxTextBytes) throw new Error('OBJ przekracza limit 1 MiB.');
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > OBJ_IMPORT_LIMITS.maxTextBytes) throw new Error('OBJ przekracza limit 1 MiB.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const { reading: _reading, ...complete } = reserved;
      // Parent compare-and-set remains valid across layer selection, and
      // rejects completion after explicit discard or any project change.
      onPendingChange({ ...complete, text }, reserved);
    } catch (cause) {
      const { reading: _reading, ...complete } = reserved;
      const retained = onPendingChange(complete, reserved);
      if (retained && mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function apply() {
    if (!pending) return;
    try {
      if (blocked) throw new Error('Geometria jest zablokowana albo zawiera niezastosowany JSON.');
      if (baseline(layer) !== pending.baseline) throw new Error('Geometria lub tekstura zmieniła się od rozpoczęcia importu. Zachowano źródło OBJ. Odrzuć import i rozpocznij go od aktualnych danych.');
      if (!pending.sourceUpAxis || !pending.normalMode || !pending.metersPerUnit.trim()) throw new Error('Wskaż oś źródła, metry na jednostkę i płaskie normalne.');
      const importInput = {
        objText: pending.text, sourceUpAxis: pending.sourceUpAxis, metersPerUnit: Number(pending.metersPerUnit),
        normalMode: pending.normalMode, target: { layerId: layer.id },
        ...(pending.textureAssetId ? { textureAssetId: pending.textureAssetId } : {}),
        ...(pending.transformText.trim() ? { transform: JSON.parse(pending.transformText) } : {}),
      };
      validateToolInput('studio.meshes.importObj.preview', { viewSessionId: 'local-ui', input: {
        ...importInput, projectId: 'local-ui', expectedRevision: 1, fileName: pending.fileName,
      } });
      const prepared = prepareObjImport(document, importInput);
      onApply(prepared.changes); onPendingChange(undefined); setReport(prepared.report); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <fieldset className="obj-import-inspector" disabled={disabled}><legend>IMPORT OBJ</legend>
    <p className="mesh-help">Triangulowany OBJ v/vt/f, do 1 MiB. Zastępuje geometrię tej warstwy; zachowuje jej ID, czas i animację. Nową bryłę utwórz przyciskiem „Dodaj geometrię”.</p>
    {error && <p className="mesh-error" role="alert">{error}</p>}
    <button className="button" disabled={blocked || reading} onClick={() => input.current?.click()}><Upload size={13}/>{reading ? 'Odczyt OBJ…' : 'Wybierz OBJ'}</button>
    <input ref={input} hidden aria-label="Plik geometrii OBJ" type="file" accept=".obj,text/plain" disabled={blocked || reading}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void read(file); }}/>
    <label className="select-field">Oś źródła<select aria-label="Oś źródła OBJ" value={value.sourceUpAxis} disabled={blocked || reading}
      onChange={event => edit({ sourceUpAxis: event.target.value as ObjEditorDraft['sourceUpAxis'] })}><option value="">Wybierz oś</option><option value="z">Z w górę</option><option value="y">Y w górę → (x, −z, y)</option></select></label>
    <label className="mesh-number"><span>Metry na jednostkę OBJ</span><input aria-label="Metry na jednostkę OBJ" type="number" min="0.000001" step="any" placeholder="np. 1 albo 0.01"
      value={value.metersPerUnit} disabled={blocked || reading} onChange={event => edit({ metersPerUnit: event.target.value })}/></label>
    <label className="select-field">Normalne<select aria-label="Normalne OBJ" value={value.normalMode} disabled={blocked || reading}
      onChange={event => edit({ normalMode: event.target.value as ObjEditorDraft['normalMode'] })}><option value="">Wybierz sposób</option><option value="flat">Płaskie · przelicz z trójkątów</option></select></label>
    <p className="mesh-help">Płaskie normalne zastępują vn i grupy smoothing; importer zgłasza te zmiany. Nie czyta mtllib ani innych plików. Nie centruje i nie dopasowuje skali.</p>
    <label className="select-field">PNG importu<select aria-label="Tekstura importu OBJ" value={value.textureAssetId} disabled={blocked || reading || isLocked('texture')}
      onChange={event => edit({ textureAssetId: event.target.value })}><option value="">Zachowaj teksturę warstwy</option>
      {(document.assets || []).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
    <details className="mesh-json" open={pending ? true : undefined}><summary>Źródło OBJ</summary>
      <textarea aria-label="Źródło OBJ" value={value.text} spellCheck={false} disabled={blocked || reading} onChange={event => edit({ text: event.target.value })}/>
      <p>{value.fileName} · {new TextEncoder().encode(value.text).length} bajtów. Źródło i opcje pozostają w szkicu tej karty.</p>
    </details>
    <details className="mesh-json" open={value.transformText ? true : undefined}><summary>Jawna transformacja importu</summary>
      <textarea aria-label="Transformacja OBJ JSON" value={value.transformText} spellCheck={false} disabled={blocked || reading}
        placeholder={'{"translation":[0,0,0],"orientation":[0,0,1,0],"scale":1}'} onChange={event => edit({ transformText: event.target.value })}/>
      <p>Puste pole: brak dodatkowej transformacji. Kolejność: konwersja osi, metry, skala, obrót, przesunięcie w metrach. Nie zmienia transformacji warstwy.</p>
    </details>
    <div className="mesh-json-actions"><button className="button" disabled={blocked || reading || !pending} onClick={apply}>Zastosuj OBJ do szkicu</button>
      <button className="text-button" disabled={!pending} onClick={() => { onPendingChange(undefined); setError(''); setReport(null); }}>Odrzuć import OBJ</button></div>
    {geometryPending && <p className="mesh-help">Najpierw zastosuj lub odrzuć edycję JSON geometrii. Import jej nie zastąpi.</p>}
    <p className="mesh-help">Po zastosowaniu obejrzyj szkic i zapisz projekt. Teksturowana siatka wymaga UV dla każdego trójkąta.</p>
    {report && <div role="status"><p className="mesh-help">Import w szkicu: {report.source.vertices} wierzchołków · {report.source.triangles} trójkątów · płaskie normalne.</p>
      {report.warnings.map((warning, index) => <p key={index} className="mesh-help">{warning.message}</p>)}</div>}
  </fieldset>;
}
