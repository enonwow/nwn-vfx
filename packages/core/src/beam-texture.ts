import {DomainError,type BeamLayer,type EffectDocument} from './model.js';
import {resizeTextureRegion,resolveTexture,sha256Bytes,type TexturePixels} from './textures.js';

import {BEAM_TEXTURE_MAPPING} from './beam-texture-types.js';
export {BEAM_TEXTURE_MAPPING,type BeamTextureMapping} from './beam-texture-types.js';
export function validateBeamTextureMapping(layer:BeamLayer) {
  const m=layer.textureMapping;if(m===undefined)return;
  if(!m||Object.keys(m).length!==2||!['u','v'].includes(m.axis)||!['source','alpha-bounds'].includes(m.fit)||layer.nativeMotion)
    throw new DomainError('BEAM_TEXTURE_MAPPING_INVALID','Mapowanie statycznego beama wymaga axis u/v i fit source/alpha-bounds; nie można łączyć go z nativeMotion.',{layerId:layer.id});
}
export function beamTextureKey(layer:BeamLayer) {return layer.texture+':beam-map:'+JSON.stringify(layer.textureMapping);}
export function beamTextureSummaries(document:EffectDocument) {
  return document.layers.flatMap(l=>l.type==='beam'&&l.enabled&&l.textureMapping&&!l.materialMotion?[{layerId:l.id,settings:l.textureMapping,repetitions:l.segments,nativeAlongAxis:'V' as const,nativeFullWidth:2*l.width,syntheticFlow:false as const}]:[]);
}

/** Native Linked repeats a full image on every edge, with V along the edge.
 * Explicit source U maps left->right to native V0->1; source V is unchanged.
 * Source RGBA uses top-first rows. Never rewrite the immutable source PNG. */
export function buildBeamTexture(document:EffectDocument,layer:BeamLayer) {
  validateBeamTextureMapping(layer);
  const source=resolveTexture(document,layer.texture),m=layer.textureMapping;
  if(!m)return {pixels:source};
  let x=0,y=0,width=source.width,height=source.height;
  if(m.fit==='alpha-bounds'){
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let sy=0;sy<height;sy++)for(let sx=0;sx<width;sx++)if(source.rgba[(sy*width+sx)*4+3]>0){minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);}
    if(maxX<0)throw new DomainError('BEAM_TEXTURE_MAPPING_INVALID','Nie można przyciąć całkowicie przezroczystej tekstury.',{layerId:layer.id});
    x=minX;y=minY;width=maxX-minX+1;height=maxY-minY+1;
  }
  const crop={x,y,width,height},cropped=x===0&&y===0&&width===source.width&&height===source.height?source:resizeTextureRegion(source,crop,source.width,source.height);
  let pixels:TexturePixels=cropped;
  if(m.axis==='u'){
    pixels={width:cropped.height,height:cropped.width,rgba:new Uint8Array(cropped.rgba.length)};
    for(let sy=0;sy<cropped.height;sy++)for(let sx=0;sx<cropped.width;sx++){
      const from=(sy*cropped.width+sx)*4,to=((cropped.width-1-sx)*pixels.width+sy)*4;
      pixels.rgba.set(cropped.rgba.subarray(from,from+4),to);
    }
  }
  return {pixels,metadata:{...BEAM_TEXTURE_MAPPING,settings:m,sourceTexture:layer.texture,sourceWidth:source.width,sourceHeight:source.height,
    sourceRgbaSha256:sha256Bytes(source.rgba),crop,outputWidth:pixels.width,outputHeight:pixels.height,outputRgbaSha256:sha256Bytes(pixels.rgba),
    filter:'area-down-bilinear-up-linear-srgb-premultiplied',rotation:m.axis==='u'?'counterclockwise-90':'none',
    fitMapping:'crop-then-stretch-per-segment',repetitions:layer.segments,nativeFullWidth:2*layer.width}};
}
