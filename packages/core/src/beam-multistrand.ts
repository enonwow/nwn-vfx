import type {EffectDocument} from './model.js';

export const BEAM_SOFT_TEXTURE={id:'beam-soft',version:1,documentSchemaVersion:22,minimumStudioVersion:'0.28.2',
  alongAxis:'v',acrossAxis:'u',constantAlongLength:true,straightAlpha:true,whiteRgb:true,transparentSideEdges:true,
  repeatedEndpointRowsEqual:true,nativeGeometrySeamsVerified:false} as const;
export function usesExtendedBeam(document:EffectDocument):boolean {
  return document.layers.some(l=>l.texture==='beam-soft') || (document.lifecycle==='beam'
    &&document.layers.some(l=>l.enabled&&l.type==='emitter'&&l.beamBinding)
    &&document.layers.filter(l=>l.enabled&&l.type==='beam').length>1);
}
export function compositeBeamProfile(document:EffectDocument) {
  if(document.layers.some(l=>l.enabled&&l.type==='beam'&&l.materialMotion))return 'finite-flow-periodic-pan-v1';
  return document.layers.filter(l=>l.enabled&&l.type==='beam').length>1?'finite-flow-static-strands-v2':'finite-flow-static-strand-v1';
}
