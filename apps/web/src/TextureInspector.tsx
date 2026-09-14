import React, { useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { Layer, LayerValues, TextureAsset } from '../../../packages/core/src/model.js';
import { decodeTextureAsset } from '../../../packages/core/src/textures.js';

function TexturePreview({ asset, alt = '' }: { asset: TextureAsset; alt?: string }) {
  const source = useMemo(() => {
    const { width, height, rgba } = decodeTextureAsset(asset);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    return canvas.toDataURL('image/png');
  }, [asset.id]);
  return <img alt={alt} src={source}/>;
}

function TextureProvenance({ asset }: { asset: TextureAsset }) {
  const normalized = asset.source.normalization;
  return <details className="texture-provenance"><summary>Źródło i przekształcenie</summary>
    <dl><dt>Plik źródłowy</dt><dd>{asset.source.fileName}</dd>
      <dt>SHA-256 zasobu</dt><dd><code>{asset.id}</code></dd>
      <dt>SHA-256 oryginału</dt><dd><code>{normalized?.originalSha256 || asset.source.sha256}</code></dd>
      {normalized ? <><dt>Format źródła</dt><dd>{normalized.originalColorType === 2 ? 'RGB8; dodano pełną alpha (255).' : 'RGBA8; zachowano kanał alpha.'}</dd>
        <dt>Wymiary i dopasowanie</dt><dd>{normalized.originalWidth}×{normalized.originalHeight} → {asset.width}×{asset.height}; obraz {normalized.contentWidth}×{normalized.contentHeight}, margines od lewej {normalized.offsetX} px i od góry {normalized.offsetY} px.</dd>
        <dt>Przekształcenie</dt><dd>{normalized.method}, linear-sRGB, alpha premultiplied · wersja {normalized.version}. Oryginalny plik nie jest przechowywany.</dd></>
        : <><dt>Przekształcenie</dt><dd>Bez zmian; zachowano oryginalne bajty PNG.</dd></>}
    </dl>
  </details>;
}

export function TextureInspector({ layer, assets, disabled, isLocked, importBlockedReason, onImport, onChange }: {
  layer: Layer; assets: TextureAsset[]; disabled: boolean; isLocked(field: string): boolean;
  importBlockedReason: string; onImport(file: File, targetSize?: 512 | 1024): Promise<void>; onChange(values: LayerValues): void;
}) {
  const input = useRef<HTMLInputElement>(null), [error, setError] = useState('');
  const [targetSize, setTargetSize] = useState<512 | 1024 | undefined>();
  const reference = layer.texture || '', selected = assets.find(asset => `asset:${asset.id}` === reference);
  const inferredBlend = layer.type === 'mesh' || reference === 'smoke' || reference.startsWith('asset:') ? 'normal' : 'additive';
  function change(values: LayerValues) {
    try { onChange(values); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <fieldset className="texture-inspector" disabled={disabled}><legend>TEKSTURA I MIESZANIE</legend>
    {error && <p className="mesh-error" role="alert">{error}</p>}
    <label className="select-field">Tekstura<select aria-label="Tekstura" value={reference} disabled={disabled || isLocked('texture')}
      onChange={event => change({ texture: event.target.value || null,...(event.target.value==='beam-soft'?{textureMapping:{axis:'v',fit:'source'}}:{}) } as LayerValues)}>
      {layer.type === 'mesh' && <option value="">Bez tekstury</option>}
      <option value="spark">Iskra</option><option value="smoke">Dym</option><option value="glow">Błysk</option>
      {layer.type==='beam'&&<option value="beam-soft">Miękka ciągła nitka</option>}
      {assets.map(asset => <option key={asset.id} value={`asset:${asset.id}`}>{asset.name} · {asset.width}×{asset.height}</option>)}
    </select></label>
    {reference==='beam-soft'&&<p className="mesh-help">Jedna miękka nitka: stała wzdłuż, przezroczyste boki. Szerokość i kolor ustawiasz dla każdej warstwy.</p>}
    <label className="select-field">Mieszanie<select aria-label="Mieszanie" value={layer.blend || ''} disabled={disabled || isLocked('blend')}
      onChange={event => change({ blend: event.target.value ? event.target.value as 'normal' | 'additive' : null })}>
      <option value="">Domyślne ({inferredBlend === 'normal' ? 'normalne' : 'addytywne'})</option>
      <option value="normal">Normalne</option><option value="additive">Addytywne</option>
    </select></label>
    {selected && <div className="texture-selected"><TexturePreview asset={selected} alt={`Tekstura ${selected.name}`}/>
      <span>{selected.name}<small>{selected.width}×{selected.height} · PNG RGBA</small></span></div>}
    {selected && <TextureProvenance asset={selected}/>}
    {layer.type === 'mesh' && <p className="mesh-help">UV (0,0) to lewy dolny róg. Prostopadłościan i pierścień mają gotowe UV; własną siatkę edytuj przez JSON geometrii.</p>}
    <label className="select-field">Rozmiar importu<select aria-label="Rozmiar importu" value={targetSize || ''} disabled={!!importBlockedReason}
      onChange={event => setTargetSize(event.target.value ? Number(event.target.value) as 512 | 1024 : undefined)}>
      <option value="">Bez zmian · wymagane boki POT</option><option value="512">Dopasuj do 512×512</option><option value="1024">Dopasuj do 1024×1024</option>
    </select></label>
    {targetSize && <p className="mesh-help">Zachowamy proporcje i wyśrodkujemy obraz na przezroczystym tle {targetSize}×{targetSize}. Obraz może zostać powiększony lub pomniejszony.</p>}
    <button className="button" disabled={!!importBlockedReason} onClick={() => input.current?.click()}><Upload size={13}/>Importuj PNG</button>
    <input ref={input} hidden aria-label="Plik tekstury PNG" type="file" accept=".png,image/png" disabled={!!importBlockedReason}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void onImport(file, targetSize); }}/>
    <p className="mesh-help texture-import-note">{importBlockedReason || 'Import zapisuje zasób w nowej rewizji. Potem wybierz go dla warstwy.'}</p>
    <p className="mesh-help">PNG 8 bitów na kanał, bez przeplotu. {targetSize
      ? 'Wejście: RGB lub RGBA, boki 1–4096 px, do 8 MiB. RGB otrzyma pełną alpha (255). Wynik: PNG RGBA, do 2 MiB.'
      : 'Bez zmian: RGBA, boki 8–1024 px będące potęgami 2 (POT), do 2 MiB.'} Do 8 zasobów; cały dokument do 6 MiB.</p>
    {!!assets.length && <details className="texture-library"><summary>Zasoby projektu ({assets.length}/8)</summary><ul>{assets.map(asset => <li key={asset.id}>
      <TexturePreview asset={asset}/><span>{asset.name}<small>{asset.width}×{asset.height} · {asset.id.slice(0, 12)}</small><TextureProvenance asset={asset}/></span>
    </li>)}</ul></details>}
  </fieldset>;
}
