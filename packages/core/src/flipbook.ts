import { DomainError, type EffectDocument, type Layer } from './model.js';

/** Equal-sized PNG cells, numbered left to right, top row first. */
export interface EmitterFlipbook {
  columns: number; rows: number; frameStart: number; frameEnd: number; fps: number;
}
export const FLIPBOOK_CAPABILITIES = {
  version: 1, documentSchemaVersion: 12, layerType: 'emitter', texture: 'imported-png',
  gridSizes: [1,2,4,8,16], maxFrames: 256, minCellPixels: 8, fps: {min:1,max:60,integer:true},
  frameOrder: 'left-to-right-top-to-bottom', frameEnd: 'inclusive', clock: 'particle-age-seconds',
  playback: 'repeat', randomStart: false, nativeVerified: false,
} as const;

export function validateEmitterFlipbook(layer: Layer, document: EffectDocument): void {
  const value = (layer as {flipbook?:EmitterFlipbook}).flipbook;
  if (value === undefined) return;
  const fail = (message: string): never => {throw new DomainError('VALIDATION_ERROR',message,{layerId:layer.id,field:'flipbook'});};
  if (layer.type !== 'emitter') fail('Atlas animacji jest dostępny tylko dla emitera.');
  if (!value || Object.keys(value).sort().join(',') !== 'columns,fps,frameEnd,frameStart,rows') fail('Atlas wymaga columns, rows, frameStart, frameEnd i fps.');
  if (![value.columns,value.rows].every(n=>[1,2,4,8,16].includes(n))) fail('Siatka atlasu: 1, 2, 4, 8 albo 16 kolumn i wierszy.');
  if (![value.frameStart,value.frameEnd,value.fps].every(Number.isInteger) || value.fps<1 || value.fps>60) fail('Klatki i prędkość muszą być całkowite; fps: 1–60.');
  if (value.frameStart<0 || value.frameEnd<=value.frameStart || value.frameEnd>=value.columns*value.rows) fail('Wybierz co najmniej dwie klatki w granicach atlasu; ostatnia klatka jest włączona.');
  const asset = layer.texture?.startsWith('asset:') ? document.assets?.find(a=>a.id===layer.texture!.slice(6)) : undefined;
  if (!asset) return fail('Atlas wymaga istniejącej własnej tekstury PNG.');
  if (asset.width/value.columns<8 || asset.height/value.rows<8) fail('Każda klatka atlasu musi mieć co najmniej 8 × 8 pikseli.');
}

export function sampleFlipbookFrame(value: EmitterFlipbook, particleAge: number): number {
  const count = value.frameEnd-value.frameStart+1;
  return value.frameStart + Math.floor(Math.max(0,particleAge)*value.fps)%count;
}

/** UV origin is bottom-left; source PNG row zero is at the top. No tile resampling. */
export function flipbookFrameUv(value: EmitterFlipbook, frame: number): [number,number,number,number] {
  const column=frame%value.columns, row=Math.floor(frame/value.columns);
  return [column/value.columns,1-(row+1)/value.rows,(column+1)/value.columns,1-row/value.rows];
}
