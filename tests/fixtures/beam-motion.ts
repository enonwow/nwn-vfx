import {makeDocument,applyChanges,type BeamLayer} from '../../packages/core/src/model.js';
import {createTextureAsset,encodePngRgba8} from '../../packages/core/src/textures.js';
import type {BeamNativeMotion} from '../../packages/core/src/beam-motion.js';

export function beamMotionFixture(phase:BeamNativeMotion['phase']='flow') {
  const pixels={width:16,height:16,rgba:new Uint8Array(16*16*4)};
  // Deliberate transparent padding, horizontal red -> blue gradient, a thin
  // bright centre. Authored independently of the atlas generator.
  for(let y=6;y<10;y++)for(let x=0;x<16;x++)pixels.rgba.set([255-x*17,24,x*17,255],(y*16+x)*4);
  const png=encodePngRgba8(pixels),asset=createTextureAsset('beam-fixture.png',Buffer.from(png).toString('base64'));
  const before=makeDocument('empty','Technical beam motion','beam');before.assets=[asset];
  const motion:BeamNativeMotion={phase,direction:'target-to-source',fps:16,pulseWidth:.25,fit:'alpha-bounds'};
  const document=applyChanges(before,[{type:'layer.set',layerId:'beam',values:{segments:2,radius:0,lightningScale:0,texture:`asset:${asset.id}`,color:'#ffffff',alpha:1,width:.08,nativeMotion:motion}}],false);
  return {document,layer:document.layers[0] as BeamLayer,motion,source:before,asset};
}
