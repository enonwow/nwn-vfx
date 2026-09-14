import { DomainError } from '../../core/src/model.js';

export interface ResourceFile { name: string; data: Uint8Array }
export const RESOURCE_TYPES: Record<string, number> = { tga: 3, wav:4, mdl: 2002, txi: 2022 };
const EXTENSIONS = Object.fromEntries(Object.entries(RESOURCE_TYPES).map(([ext, type]) => [type, ext]));
const encoder = new TextEncoder();
const decoder = new TextDecoder('ascii');
const bad = (message: string): never => { throw new DomainError('INVALID_FORMAT', message); };
export function assertResref(value: string): void {
  if (!/^[a-z][a-z0-9_]{0,15}$/.test(value))
    throw new DomainError('INVALID_INPUT', 'Resref musi mieć 1–16 znaków ASCII: małe litery, cyfry, podkreślenie; zaczynać się literą.');
}

/** ERF V1.0: 160-byte header, 24-byte keys, 8-byte resource offsets, little endian.
 * This is a resource-only HAK; no stock 2DA, script, MOD or installation is implied.
 * Layout reference: https://github.com/niv/neverwinter.nim/blob/master/neverwinter/erf.nim
 */
export function writeHak(files: ResourceFile[]): Uint8Array {
  if (!files.length || files.length > 65535) bad('Nieprawidłowa liczba zasobów HAK.');
  const seen = new Set<string>();
  const entries = files.map(file => {
    const match = /^([a-z][a-z0-9_]{0,15})\.(tga|mdl|txi|wav)$/.exec(file.name);
    if (!match || seen.has(file.name)) bad(`Niedozwolony lub powtórzony zasób HAK: ${file.name}`);
    seen.add(file.name);
    return { ...file, resref: match![1], type: RESOURCE_TYPES[match![2]] };
  });
  const resourceOffset = 160 + entries.length * 24;
  let offset = resourceOffset + entries.length * 8;
  const length = offset + entries.reduce((sum, file) => sum + file.data.length, 0);
  if (length > 0xffffffff) bad('HAK przekracza zakres 32-bitowych offsetów.');
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  bytes.set(encoder.encode('HAK V1.0'));
  view.setUint32(16, entries.length, true);
  view.setUint32(20, 160, true);
  view.setUint32(24, 160, true);
  view.setUint32(28, resourceOffset, true);
  // Reproducible package date: 2000-01-01 (year since 1900, zero-based day).
  view.setUint32(32, 100, true);
  view.setUint32(40, 0xffffffff, true);
  entries.forEach((entry, index) => {
    const key = 160 + index * 24;
    bytes.set(encoder.encode(entry.resref), key);
    view.setUint32(key + 16, index, true);
    view.setUint16(key + 20, entry.type, true);
    view.setUint32(resourceOffset + index * 8, offset, true);
    view.setUint32(resourceOffset + index * 8 + 4, entry.data.length, true);
    bytes.set(entry.data, offset);
    offset += entry.data.length;
  });
  return bytes;
}

/** Independent bounds-checked reader, including resource IDs that differ from key order. */
export function readHak(bytes: Uint8Array): ResourceFile[] {
  if (bytes.length < 160 || decoder.decode(bytes.subarray(0, 8)) !== 'HAK V1.0') bad('Nieprawidłowy nagłówek HAK V1.0.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(16, true), keys = view.getUint32(24, true), table = view.getUint32(28, true);
  const stringsCount = view.getUint32(8, true), stringsSize = view.getUint32(12, true), stringsOffset = view.getUint32(20, true);
  if (stringsCount !== 0 || stringsSize !== 0) bad('Ten czytnik HAK obsługuje archiwa zasobów bez opisów lokalizowanych.');
  if (stringsOffset < 160 || stringsOffset > bytes.length || count > 65535 || keys < 160 || table < keys + count * 24 || table + count * 8 > bytes.length)
    bad('Uszkodzone zakresy tabel HAK.');
  const dataStart = table + count * 8;
  const seenNames = new Set<string>(), seenIds = new Set<number>();
  const ranges: Array<[number, number]> = [];
  const files: ResourceFile[] = [];
  for (let i = 0; i < count; i++) {
    const key = keys + i * 24;
    const rawName = bytes.subarray(key, key + 16);
    const nul = rawName.indexOf(0);
    if (nul >= 0 && rawName.subarray(nul).some(b => b !== 0)) bad('Nieprawidłowe dopełnienie resref HAK.');
    const resref = decoder.decode(nul < 0 ? rawName : rawName.subarray(0, nul));
    if (!/^[a-z][a-z0-9_]{0,15}$/.test(resref)) bad('Nieprawidłowy resref w HAK.');
    const id = view.getUint32(key + 16, true), type = view.getUint16(key + 20, true);
    const ext = EXTENSIONS[type];
    if (!ext || id >= count || seenIds.has(id) || view.getUint16(key + 22, true) !== 0) bad('Nieprawidłowy typ/ID zasobu HAK.');
    const name = `${resref}.${ext}`;
    if (seenNames.has(name)) bad(`Powtórzony zasób HAK: ${name}`);
    seenNames.add(name); seenIds.add(id);
    const offset = view.getUint32(table + id * 8, true), size = view.getUint32(table + id * 8 + 4, true);
    if (offset < dataStart || size === 0 || size > bytes.length - offset || offset > bytes.length) bad('Zasób poza plikiem HAK.');
    if (ranges.some(([start, end]) => offset < end && offset + size > start)) bad('Nakładające się zasoby HAK.');
    ranges.push([offset, offset + size]);
    files.push({ name, data: bytes.slice(offset, offset + size) });
  }
  return files;
}

export interface TgaReadback { width: number; height: number; rgba: Uint8Array; origin: 'top-left' | 'bottom-left' }
/** Uncompressed 32-bit BGRA, 8-bit alpha, no colour map, top or bottom origin. */
export function readTga(bytes: Uint8Array): TgaReadback {
  if (bytes.length < 18) bad('Ucięty nagłówek TGA.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(12, true), height = view.getUint16(14, true);
  const offset = 18 + bytes[0], descriptor = bytes[17];
  if (bytes[1] !== 0 || bytes[2] !== 2 || bytes[16] !== 32 || (descriptor & 0xcf) !== 8 || (descriptor & 0x10) !== 0)
    bad('Obsługiwane TGA: truecolour BGRA32 bez kompresji i mapy kolorów, 8 bitów alpha.');
  if (!width || !height || width > 4096 || height > 4096 || offset + width * height * 4 !== bytes.length) bad('Nieprawidłowy rozmiar danych TGA.');
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = offset + ((descriptor & 0x20 ? y : height - y - 1) * width + x) * 4;
    const target = (y * width + x) * 4;
    rgba[target] = bytes[source + 2]; rgba[target + 1] = bytes[source + 1];
    rgba[target + 2] = bytes[source]; rgba[target + 3] = bytes[source + 3];
  }
  return { width, height, rgba, origin: descriptor & 0x20 ? 'top-left' : 'bottom-left' };
}

/** NWN assumes bottom-first rows even when the TGA descriptor says top-first.
 * Return top-down RGBA as it will map to Studio's bottom-left UV convention.
 * This decoder models texture row addressing, not a native rendering test. */
export function readNwnTga(bytes:Uint8Array):TgaReadback {
  const image=readTga(bytes);
  if(image.origin==='bottom-left')return image;
  const rgba=new Uint8Array(image.rgba.length),stride=image.width*4;
  for(let y=0;y<image.height;y++)rgba.set(image.rgba.subarray((image.height-1-y)*stride,(image.height-y)*stride),y*stride);
  return {...image,origin:'bottom-left',rgba};
}
