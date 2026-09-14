import {makeDocument,makeLayer,makeMeshLayer,makeTrailLayer,type EffectDocument} from '../../packages/core/src/model.js';
import type {PaletteOptions} from '../../packages/core/src/palette.js';
import {createTextureAsset} from '../../packages/core/src/textures.js';
import {rgbaPng} from './rgba-texture.js';
export const paletteOptions:PaletteOptions={from:'#ff0000',to:'#00ff00',scope:{layerIds:'all',excludeLayerIds:[],includeDisabled:false},textureMode:'transform'};
export function paletteFixture():EffectDocument{
  const asset=createTextureAsset('red-detail.png',Buffer.from(rgbaPng(32,32,(x,y)=>[80+x*5,12+y,8,Math.round(x/31*255)])).toString('base64'));
  const mesh={...makeMeshLayer('blood'),position:[-.5,0,.6] as [number,number,number],geometry:{kind:'box' as const,dimensions:[.6,.12,1] as [number,number,number]},color:'#ffffff',material:{diffuse:'#ffffff',selfIllumination:'#000000'},texture:`asset:${asset.id}` as const};
  return { ...makeDocument(),schemaVersion:6,assets:[asset],layers:[mesh,{...mesh,id:'excluded',enabled:false},
    {...makeTrailLayer('trail'),color:'#ff6633'}, {...makeLayer('sparks'),color:'#f04422',midColor:'#ffaa55',endColor:'#662233'},
    {...makeMeshLayer('bones'),position:[.5,0,.6] as [number,number,number],color:'#ffffff',material:{diffuse:'#eeeeee',selfIllumination:'#000000'}}]};
}
