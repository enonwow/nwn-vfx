import {DomainError,type BeamLayer,type EffectDocument} from './model.js';
import {resolveTexture,sha256Bytes,type TexturePixels} from './textures.js';

export interface BeamMaterialMotion {mode:'periodic-pan';direction:'source-to-target'|'target-to-source';fps:number}
export const BEAM_MATERIAL_MOTION={profile:'linked-periodic-pan-v1',version:1,documentSchemaVersion:23,minimumStudioVersion:'0.29.0',
  exportAvailable:true,frameCount:16,columns:16,rows:1,cellWidth:64,cellHeight:256,frameStart:0,frameEnd:15,
  mapping:'per-segment',wholeSpanRepeats:2,pointCount:3,randomStart:false,mipmap:0,filter:1,
  geometryHelix:false,nativeVerified:false,nativeCadenceVerified:false} as const;
export function usesMaterialMotion(d:EffectDocument){return d.layers.some(l=>Object.hasOwn(l,'materialMotion'))||d.locks.some(l=>l.field==='materialMotion');}
export function validateMaterialMotion(l:BeamLayer){
  const m=l.materialMotion;if(m===undefined)return;
  if(!m||Object.keys(m).length!==3||m.mode!=='periodic-pan'||!['source-to-target','target-to-source'].includes(m.direction)||
    !Number.isInteger(m.fps)||m.fps<1||m.fps>30||l.nativeMotion||l.segments!==2||l.radius!==0||l.lightningScale!==0||l.flow.speed!==0||
    !l.texture.startsWith('asset:')||l.textureMapping?.axis!=='v'||l.textureMapping?.fit!=='source')
    throw new DomainError('BEAM_MATERIAL_MOTION_INVALID','Okresowy atlas wymaga PNG, V/source, 2 segmentów, radius/scale/speed 0, fps 1–30 i braku nativeMotion.',{layerId:l.id});
}
export function validatePeriodicPixels(p:TexturePixels){
  const {width:w,height:h,rgba}=p;
  for(let x=0;x<w*4;x++)if(rgba[x]!==rgba[(h-1)*w*4+x])throw new DomainError('BEAM_MATERIAL_MOTION_INVALID','PNG musi mieć identyczny pierwszy i ostatni wiersz RGBA.');
  for(let y=0;y<h;y++)if(rgba[y*w*4+3]!==0||rgba[(y*w+w-1)*4+3]!==0)throw new DomainError('BEAM_MATERIAL_MOTION_INVALID','Boczne brzegi U tekstury muszą być przezroczyste.');
}
export function materialMotionFrame(m:BeamMaterialMotion,time:number){return Math.floor(Math.max(0,time)*m.fps)%16;}
export function materialMotionKey(l:BeamLayer){return l.texture+':periodic-pan-v1:'+JSON.stringify(l.materialMotion);}
export function materialMotionSummaries(d:EffectDocument){return d.layers.flatMap(l=>l.type==='beam'&&l.enabled&&l.materialMotion?[{
  layerId:l.id,...BEAM_MATERIAL_MOTION,settings:l.materialMotion,cycleSeconds:16/l.materialMotion.fps,nativeFullWidth:2*l.width}]:[]);}

/** Shared top-first RGBA atlas. Source V goes bottom->top; each frame pans
 * exactly one period/16. Premultiplied-alpha bilinear sampling, no source edit.
 * A single row keeps temporal neighbours away from the periodic V boundary. */
export function buildMaterialMotionAtlas(d:EffectDocument,l:BeamLayer){
  validateMaterialMotion(l);const m=l.materialMotion!;if(!m)throw new DomainError('BEAM_MATERIAL_MOTION_INVALID','Brak materialMotion.');
  const source=resolveTexture(d,l.texture);validatePeriodicPixels(source);
  const pixels:TexturePixels={width:1024,height:256,rgba:new Uint8Array(1024*256*4)};
  for(let frame=0;frame<16;frame++)for(let y=0;y<256;y++)for(let x=0;x<64;x++){
    // Integer phase lattice gives bit-identical reverse frames and frame zero;
    // avoid floating modulo changing a half-alpha rounding tie by one byte.
    const phase=m.direction==='source-to-target'?frame:(16-frame)%16;
    const numerator=((255-y)*16-phase*255+4080)%4080;
    const sx=x*(source.width-1)/63,sy=(4080-numerator)*(source.height-1)/4080;
    const x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0;
    const samples=[[x0,y0,(1-dx)*(1-dy)],[Math.min(x0+1,source.width-1),y0,dx*(1-dy)],
      [x0,Math.min(y0+1,source.height-1),(1-dx)*dy],[Math.min(x0+1,source.width-1),Math.min(y0+1,source.height-1),dx*dy]];
    let alpha=0;const rgb=[0,0,0],hidden=[0,0,0];
    for(const [xx,yy,weight] of samples){const i=(yy*source.width+xx)*4,a=source.rgba[i+3];alpha+=a*weight;
      for(let c=0;c<3;c++){rgb[c]+=source.rgba[i+c]*a*weight;hidden[c]+=source.rgba[i+c]*weight;}}
    const dest=(y*1024+frame*64+x)*4;for(let c=0;c<3;c++)pixels.rgba[dest+c]=Math.round(alpha?rgb[c]/alpha:hidden[c]);pixels.rgba[dest+3]=Math.round(alpha);
  }
  // The inclusive endpoints must remain byte-identical after sampling/rounding.
  for(let x=0;x<1024*4;x++)if(pixels.rgba[x]!==pixels.rgba[255*1024*4+x])throw new DomainError('BEAM_MATERIAL_MOTION_INVALID','Niezgodne końce atlasu.');
  return {pixels,metadata:{...BEAM_MATERIAL_MOTION,settings:m,cycleSeconds:16/m.fps,sourceTexture:l.texture,
    sourceRgbaSha256:sha256Bytes(source.rgba),atlasRgbaSha256:sha256Bytes(pixels.rgba),sourceUnchanged:true,nativeAlongAxis:'V',nativeFullWidth:2*l.width}};
}
