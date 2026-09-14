import { zlibSync } from 'fflate';

// Test-only encoder, deliberately independent of the production PNG reader.
const u32 = (n: number) => Uint8Array.of(n >>> 24, n >>> 16, n >>> 8, n);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0)); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; } return out;
};
function chunk(name: string, data: Uint8Array) {
  const bytes = concat(new TextEncoder().encode(name), data); let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return concat(u32(data.length), bytes, u32((crc ^ 0xffffffff) >>> 0));
}
export function rgbaPng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const raw = new Uint8Array((1 + width * 4) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (1 + width * 4) + 1 + x * 4);
  return concat(Uint8Array.of(137,80,78,71,13,10,26,10), chunk('IHDR', concat(u32(width), u32(height), Uint8Array.of(8,6,0,0,0))), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array()));
}
/** Independent RGB8 encoder; selectable PNG filters exercise the three-byte pixel stride. */
export function rgbPng(width: number,height: number,pixel:(x:number,y:number)=>[number,number,number],filter=0) {
  if(!Number.isInteger(filter)||filter<0||filter>4)throw new Error('Test RGB filter must be 0–4.');
  const stride=width*3,decoded=new Uint8Array(stride*height),raw=new Uint8Array((stride+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)decoded.set(pixel(x,y),(y*width+x)*3);
  for(let y=0;y<height;y++) {
    raw[y*(stride+1)]=filter;
    for(let x=0;x<stride;x++) {
      const index=y*stride+x,left=x>=3?decoded[index-3]:0,up=y?decoded[index-stride]:0,upperLeft=y&&x>=3?decoded[index-stride-3]:0;
      const distances=[Math.abs(up-upperLeft),Math.abs(left-upperLeft),Math.abs(left+up-2*upperLeft)];
      const prediction=filter===0?0:filter===1?left:filter===2?up:filter===3?(left+up)>>>1:[left,up,upperLeft][distances.indexOf(Math.min(...distances))];
      raw[y*(stride+1)+x+1]=(decoded[index]-prediction)&255;
    }
  }
  return concat(Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',concat(u32(width),u32(height),Uint8Array.of(8,2,0,0,0))),chunk('IDAT',zlibSync(raw)),chunk('IEND',new Uint8Array()));
}
/** Asymmetric RGB quadrants, top-left origin, soft alpha at the perimeter. */
export function orientationTexture(size = 32) {
  return rgbaPng(size, size, (x, y) => {
    const color = y < size / 2 ? (x < size / 2 ? [255,32,16] : [32,255,16]) : (x < size / 2 ? [16,32,255] : [255,210,24]);
    const alpha = Math.round(255 * Math.min(1, (Math.min(x, y, size - 1 - x, size - 1 - y)) / Math.max(1, size / 8)));
    return [...color, alpha] as [number, number, number, number];
  });
}
