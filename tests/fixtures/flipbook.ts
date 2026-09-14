import {makeDocument,makeLayer,type EffectDocument} from '../../packages/core/src/model.js';
import {createTextureAsset} from '../../packages/core/src/textures.js';
import {rgbaPng} from './rgba-texture.js';
import type {EmitterFlipbook} from '../../packages/core/src/flipbook.js';
export const atlasSettings:EmitterFlipbook={columns:2,rows:2,frameStart:0,frameEnd:3,fps:4};
export const atlasColors:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[240,40,30],[30,230,50],[40,70,240],[235,190,30]];
export function atlasPng(){return rgbaPng(64,64,(x,y)=>{
  const frame=Math.floor(x/32)+2*Math.floor(y/32),localX=x%32,localY=y%32;
  // White top-left marker, dark lower-right marker, unique color per cell.
  return [...(localX<10&&localY<10?[250,250,250]:localX>21&&localY>21?[20,20,20]:atlasColors[frame]),255] as [number,number,number,number];
});}
export function flipbookFixture(animated=true):EffectDocument {
  const asset=createTextureAsset('asymmetric-atlas.png',Buffer.from(atlasPng()).toString('base64'));
  return {...makeDocument('empty','Asymetryczny atlas'),schemaVersion:animated?12:3,duration:2.5,assets:[asset],layers:[{
    ...makeLayer('atlas'),texture:`asset:${asset.id}`,start:.25,duration:.1,life:2,count:1,speed:0,gravity:0,
    position:[0,0,.7],size:1.4,endSize:1.4,color:'#ffffff',endColor:'#ffffff',alpha:1,endAlpha:1,
    ...(animated?{flipbook:{...atlasSettings}}:{})
  }]};
}
