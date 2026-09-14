import {DomainError,type BeamLayer,type EffectDocument} from './model.js';
import {resizeTextureRegion,resolveTexture,sha256Bytes,type TexturePixels} from './textures.js';

export interface BeamNativeMotion {
  phase:'flow'|'opening'|'closing';
  /** Only the pulse travels this way. Opening always reveals source -> target;
   * closing always erases target -> source. */
  direction:'source-to-target'|'target-to-source';
  fps:number;
  pulseWidth:number;
  fit:'source'|'alpha-bounds';
}
export const BEAM_MOTION={version:2,encoding:'linked-rgba-atlas-v1',documentSchemaVersion:17,minimumStudioVersion:'0.26.0',
  exportAvailable:false,exportBlockedSince:'0.26.1',exportBlockReason:'BEAM_MOTION_EXPORT_BLOCKED',
  frameCount:16,columns:4,rows:4,cellPixels:256,frameStart:0,frameEnd:15,
  previewPointCount:2,radius:0,lightningScale:0,repeat:true,automaticCessation:false,nativeVerified:false} as const;
export function validateBeamMotion(layer:BeamLayer) {
  const m=layer.nativeMotion;if(m===undefined)return;
  const fail=():never=>{throw new DomainError('BEAM_MOTION_INVALID','Atlas beama wymaga pełnego nativeMotion, fps 1–60, pulseWidth 0,02–1 i jednego prostego odcinka (segments=2, radius=0, lightningScale=0).',{layerId:layer.id});};
  if(!m||Object.keys(m).length!==5||!['flow','opening','closing'].includes(m.phase)||!['source-to-target','target-to-source'].includes(m.direction)||!['source','alpha-bounds'].includes(m.fit)||!Number.isInteger(m.fps)||m.fps<1||m.fps>60||!Number.isFinite(m.pulseWidth)||m.pulseWidth<.02||m.pulseWidth>1||layer.segments!==2||layer.radius!==0||layer.lightningScale!==0)fail();
}
export function beamMotionTiming(m:BeamNativeMotion) {
  return {frameCount:16,fps:m.fps,cycleSeconds:16/m.fps,finalFrameStartSeconds:15/m.fps,
    transitionWindowSeconds:[15/m.fps,16/m.fps],repeat:true,automaticStop:false,
    scheduling:'consumer-switches-during-final-frame',nativeCadenceVerified:false} as const;
}
export function beamMotionFrame(m:BeamNativeMotion,time:number) {return Math.floor(Math.max(0,time)*m.fps)%16;}
export function beamMotionTextureKey(layer:BeamLayer) {return layer.texture+':beam:'+JSON.stringify(layer.nativeMotion);}
export function beamMotionSummaries(document:EffectDocument) {
  return document.layers.flatMap(l=>l.type==='beam'&&l.enabled&&l.nativeMotion?[{layerId:l.id,encoding:BEAM_MOTION.encoding,settings:l.nativeMotion,...beamMotionTiming(l.nativeMotion)}]:[]);
}

/** One image, not repeated per bolt subdivision. Source X runs source -> target.
 * Native Linked V runs source -> target. Source Y becomes the transverse U.
 * Frame zero is top-left in the generated PNG/TGA source pixel convention. */
export function buildBeamMotionAtlas(document:EffectDocument,layer:BeamLayer) {
  validateBeamMotion(layer);const m=layer.nativeMotion;
  if(!m)throw new DomainError('BEAM_MOTION_INVALID','Brak nativeMotion.');
  const source=resolveTexture(document,layer.texture);
  let x=0,y=0,width=source.width,height=source.height;
  if(m.fit==='alpha-bounds') {
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let sy=0;sy<height;sy++)for(let sx=0;sx<width;sx++)if(source.rgba[(sy*width+sx)*4+3]>0){minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);}
    if(maxX<0)throw new DomainError('BEAM_MOTION_INVALID','Nie można przyciąć całkowicie przezroczystej tekstury.');
    x=minX;y=minY;width=maxX-minX+1;height=maxY-minY+1;
  }
  const crop={x,y,width,height},cell=resizeTextureRegion(source,crop,256,256);
  const pixels:TexturePixels={width:1024,height:1024,rgba:new Uint8Array(1024*1024*4)};
  for(let frame=0;frame<16;frame++)for(let cy=0;cy<256;cy++)for(let cx=0;cx<256;cx++) {
    const u=(255-cy)/255,progress=frame/15,center=m.direction==='source-to-target'?frame/16:1-frame/16;
    const distance=Math.abs(u-center),wrapped=Math.min(distance,1-distance);
    const pulse=.25+.75*(1+Math.cos(Math.PI*Math.min(1,wrapped/(m.pulseWidth/2))))/2;
    // Opening/closing are separate phase assets, without a second pulse clock.
    const mask=m.phase==='flow'?pulse:m.phase==='opening'?(frame===0?0:frame===15?1:u<=progress?1:0):(frame===0?1:frame===15?0:u<1-progress?1:0);
    const from=(cx*256+255-cy)*4,to=(((frame>>2)*256+cy)*1024+(frame%4)*256+cx)*4;
    pixels.rgba.set(cell.rgba.subarray(from,from+3),to);pixels.rgba[to+3]=Math.round(cell.rgba[from+3]*mask);
  }
  return {pixels,metadata:{...BEAM_MOTION,...m,timing:beamMotionTiming(m),sourceTexture:layer.texture,
    sourceWidth:source.width,sourceHeight:source.height,sourceRgbaSha256:sha256Bytes(source.rgba),crop,
    fitMapping:'crop-then-stretch-to-span-and-width',filter:'area-down-bilinear-up-linear-srgb-premultiplied',
    sourceXAxis:'source-to-target',nativeAlongAxis:'V',opening:'reveal-source-to-target',closing:'erase-target-to-source',
    sourceUnchanged:true,atlasRgbaSha256:sha256Bytes(pixels.rgba)}};
}
