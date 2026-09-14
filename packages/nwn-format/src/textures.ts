import { DomainError, type BlendMode } from '../../core/src/model.js';
export { effectiveBlend } from '../../core/src/textures.js';

export const TEXTURE_VERSION = 'shared-rgba-tga-bottom-first-2';
export interface TexturePixels { width: number; height: number; rgba: Uint8Array }
export interface TxiReadback { blending: 'default' | 'additive'; mipmap: 0 | 1; filter: 1 }

/** Lossless RGBA8 top-to-bottom -> uncompressed BGRA32 bottom-origin TGA.
 * NWN reads the first row as the bottom even for a top-origin descriptor.
 * Serialize bottom-first physically; a standards-compliant readback alone
 * would hide the incompatibility of the old top-first/0x28 output.
 * RGB is never premultiplied, gamma-adjusted or discarded under zero alpha. */
export function makeTexture({ width, height, rgba }: TexturePixels): Uint8Array {
  if (![width, height].every(n => Number.isInteger(n) && n >= 8 && n <= 1024 && (n & (n - 1)) === 0) || rgba.length !== width * height * 4)
    throw new DomainError('INVALID_INPUT', 'Tekstura wymaga RGBA8 i wymiarów POT 8–1024.');
  const data = new Uint8Array(18 + rgba.length), view = new DataView(data.buffer);
  data[2] = 2; view.setUint16(12, width, true); view.setUint16(14, height, true);
  data[16] = 32; data[17] = 0x08;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i=((height-1-y)*width+x)*4, target=18+(y*width+x)*4;
    data[target] = rgba[i + 2]; data[target + 1] = rgba[i + 1];
    data[target + 2] = rgba[i]; data[target + 3] = rgba[i + 3];
  }
  return data;
}

export function textureInfo(blend: BlendMode): string {
  if (!['normal', 'additive'].includes(blend)) throw new DomainError('UNSUPPORTED_EXPORT', 'Nieobsługiwany tryb materiału.');
  // BioWare TXI spells ordinary alpha blending "default", not "normal".
  return `blending ${blend === 'additive' ? 'additive' : 'default'}\nmipmap 1\nfilter 1\n`;
}

/** Independent strict reader for the deliberately small exported TXI subset. */
export function readTxi(data: Uint8Array | string, profile?:'linked-periodic-pan-v1'): TxiReadback {
  const fail = (message: string): never => { throw new DomainError('INVALID_FORMAT', `TXI: ${message}`); };
  const source = typeof data === 'string' ? data : new TextDecoder().decode(data);
  if (source.length > 1024 || /[^\x09\x0a\x0d\x20-\x7e]/.test(source)) fail('Nieprawidłowy tekst.');
  const fields = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tokens = line.trim().split(/\s+/);
    if (tokens.length !== 2 || !['blending', 'mipmap', 'filter'].includes(tokens[0]) || fields.has(tokens[0])) fail('Nieobsługiwane, powtórzone lub nieprawidłowe pole.');
    fields.set(tokens[0], tokens[1]);
  }
  const blending = fields.get('blending');
  const mipmap=profile==='linked-periodic-pan-v1'?'0':'1';
  if ((blending !== 'default' && blending !== 'additive') || fields.get('mipmap') !== mipmap || fields.get('filter') !== '1') fail('Materiał wykracza poza jawny podzbiór Studio.');
  return { blending: blending as TxiReadback['blending'], mipmap: Number(mipmap) as 0|1, filter: 1 };
}

export function periodicTextureInfo(blend:BlendMode){return textureInfo(blend).replace('mipmap 1','mipmap 0');}
