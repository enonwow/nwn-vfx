import {createTextureAsset,encodePngRgba8} from '../../packages/core/src/textures.js';
import {applyChanges,type BeamLayer} from '../../packages/core/src/model.js';
import {makeStaticFlowStrand} from '../../packages/core/src/beam-flow.js';
import {flowFixture} from './beam-flow.js';
export function periodicPixels(){
  const width=64,height=256,rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/(width-1)*2-1,v=y/(height-1),theta=2*Math.PI*v;
    const center=.48*Math.sin(theta),width1=.08+.11*(.5+.5*Math.cos(theta));
    const a=Math.exp(-(((u-center)/width1)**2))*(.65+.35*Math.sin(theta)**2);
    const b=Math.exp(-(((u+center)/(.19-width1/2))**2))*.5;
    rgba.set([255,255,255,x===0||x===width-1?0:Math.round(255*Math.min(1,a+b)*(1-u*u))],(y*width+x)*4);
  }
  rgba.set(rgba.subarray(0,width*4),(height-1)*width*4);return {width,height,rgba};
}
export function periodicFixture(){
  const d=flowFixture(false),pixels=periodicPixels(),asset=createTextureAsset('periodic-test.png',Buffer.from(encodePngRgba8(pixels)).toString('base64'));
  d.assets=[asset];const layer:BeamLayer={...makeStaticFlowStrand(d,'ribbon'),texture:`asset:${asset.id}`,textureMapping:{axis:'v',fit:'source'},
    segments:2,radius:0,lightningScale:0,width:.08,alpha:.55,materialMotion:{mode:'periodic-pan',direction:'source-to-target',fps:15}};
  return {document:applyChanges(d,[{type:'layer.add',layer}],false),layer,asset,pixels};
}
