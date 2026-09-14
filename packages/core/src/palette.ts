import { DomainError, applyChanges, changedFields, assertDocumentInvariants, type EffectDocument, type Change, type Layer } from './model.js';
import { createTextureAsset, decodePngRgba8, encodePngRgba8, pngBytesFromBase64, sha256Bytes, MAX_TEXTURE_ASSETS } from './textures.js';

export const PALETTE_VERSION = 'oklch-hue-rotation-v1';
export const PALETTE_CAPABILITIES = { version: PALETTE_VERSION, preservesLightness: true, preservesAlpha: true,
  neutralChromaThreshold: .0001, gamutMapping: 'reduce-chroma-20-steps', semanticMasks: false,
  textureModes: ['preserve','transform'], sharedAssets: 'copy-on-write', previewRequired: true } as const;
export interface PaletteOptions { from: string; to: string; scope: { layerIds: 'all' | string[]; excludeLayerIds: string[]; includeDisabled: boolean }; textureMode: 'preserve' | 'transform' }
export interface PaletteReport { version: typeof PALETTE_VERSION; hueShiftDegrees: number; selectedLayerIds: string[]; skippedLayerIds: string[];
  colors: Array<{layerId:string;field:string;before:string;after:string}>;
  textures: Array<{sourceAssetId:string;assetId:string;layerIds:string[];changedPixels:number;maxLightnessError:number}>;
  warnings: string[] }
const fail=(code:string,message:string,details?:unknown):never=>{throw new DomainError(code,message,details);};
const linear=(x:number)=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
const srgb=(x:number)=>Math.round(255*Math.max(0,Math.min(1,x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055)));
// Oklab matrices published by Björn Ottosson (2021-01-25, public domain).
// https://bottosson.github.io/posts/oklab/ ; sRGB transfer: CSS Color 4.
export function rgbToOklab(rgb: number[]): number[] {
  const [r,g,b]=rgb.map(linear),l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),
    m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
function labToLinear([L,a,b]:number[]):number[]{
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
}
const hex=(rgb:number[])=>'#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join('');
const rgb=(color:string)=>{if(!/^#[a-f0-9]{6}$/i.test(color))fail('VALIDATION_ERROR','Paleta wymaga kolorów #RRGGBB.');return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));};
const chroma=(color:string)=>{const [,a,b]=rgbToOklab(rgb(color));return Math.hypot(a,b);};
function hue(color:string):number{const [,a,b]=rgbToOklab(rgb(color));if(Math.hypot(a,b)<.0001)fail('PALETTE_NEUTRAL_ANCHOR','Wybierz dwa kolory o określonym odcieniu, zamiast bieli, szarości lub czerni.');return Math.atan2(b,a);}
export function rotatePaletteRgb(input:number[],angle:number):number[]{
  const [L,a,b]=rgbToOklab(input),C=Math.hypot(a,b);
  if(C<.0001||Math.abs(angle)<1e-12)return [...input];
  const h=Math.atan2(b,a)+angle,cos=Math.cos(h),sin=Math.sin(h),convert=(c:number)=>labToLinear([L,c*cos,c*sin]);
  let result=convert(C);
  const fits=(v:number[])=>v.every(n=>n>=-1e-9&&n<=1+1e-9);
  if(!fits(result)){let low=0,high=C;for(let i=0;i<20;i++){const mid=(low+high)/2;if(fits(convert(mid)))low=mid;else high=mid;}result=convert(low);}
  return result.map(srgb);
}
const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const paletteHash=(value:unknown)=>sha256Bytes(new TextEncoder().encode(JSON.stringify(canonical(value))));
function activeColors(layer:Layer):Array<[string,string]>{
  if(layer.type==='mesh')return layer.material?[['material.diffuse',layer.material.diffuse],['material.selfIllumination',layer.material.selfIllumination]]:[['color',layer.color]];
  if(layer.type==='trail'||layer.type==='beam')return [['color',layer.color]];
  return [['color',layer.color],...(layer.midColor===undefined?[]:[['midColor',layer.midColor] as [string,string]]),['endColor',layer.endColor]];
}

/** Pure proposal. Adds derived PNGs; no existing byte, file, or revision is mutated. */
export function preparePalette(document:EffectDocument, options:PaletteOptions){
  const angle=((hue(options.to)-hue(options.from)+3*Math.PI)%(2*Math.PI))-Math.PI;
  const ids=options.scope.layerIds==='all'?document.layers.map(l=>l.id):options.scope.layerIds;
  for(const id of [...ids,...options.scope.excludeLayerIds])if(!document.layers.some(l=>l.id===id))fail('NOT_FOUND','Zakres palety wskazuje nieistniejącą warstwę.',{layerId:id});
  const selected=document.layers.filter(l=>ids.includes(l.id)&&!options.scope.excludeLayerIds.includes(l.id)&&(l.enabled||options.scope.includeDisabled));
  if(!selected.length)fail('PALETTE_EMPTY_SCOPE','Zakres nie zawiera warstw.');
  const report:PaletteReport={version:PALETTE_VERSION,hueShiftDegrees:angle*180/Math.PI,selectedLayerIds:selected.map(l=>l.id),
    skippedLayerIds:document.layers.filter(l=>!selected.includes(l)).map(l=>l.id),colors:[],textures:[],warnings:[]};
  let result=structuredClone(document);const changes:Change[]=[],derived=new Map<string,string>();
  for(const layer of selected){
    const colors=activeColors(layer),values:Record<string,any>={};
    if(options.textureMode==='transform'&&layer.texture?.startsWith('asset:')){
      if(colors.some(([,value])=>chroma(value)>=.0001))fail('PALETTE_TEXTURE_TINT_CONFLICT','PNG ma także kolorowy mnożnik. Wybierz zmianę parametrów bez PNG albo świadomie ustaw neutralny mnożnik przed zmianą tekstury.',{layerId:layer.id});
      const sourceAssetId=layer.texture.slice(6),asset=document.assets?.find(a=>a.id===sourceAssetId);
      if(!asset)fail('MISSING_ASSET','Brak PNG warstwy.',{layerId:layer.id});
      let assetId=derived.get(sourceAssetId);
      if(!assetId){
        const pixels=decodePngRgba8(pngBytesFromBase64(asset!.pngBase64)),output=pixels.rgba.slice();let changedPixels=0,maxLightnessError=0;
        // Pixel-local transform: no resampling, alpha or RGB under alpha zero edits.
        for(let offset=0;offset<output.length;offset+=4){if(!output[offset+3])continue;
          const before=Array.from(output.subarray(offset,offset+3)),after=rotatePaletteRgb(before,angle);
          if(after.some((value,i)=>value!==before[i]))changedPixels++;
          output.set(after,offset);maxLightnessError=Math.max(maxLightnessError,Math.abs(rgbToOklab(before)[0]-rgbToOklab(after)[0]));
        }
        assetId=sourceAssetId;
        if(changedPixels){
          const bytes=encodePngRgba8({...pixels,rgba:output});let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
          const next=createTextureAsset(`palette-${sourceAssetId.slice(0,12)}.png`,btoa(binary));assetId=next.id;
          if(!result.assets!.some(a=>a.id===assetId)){
            if(result.assets!.length>=MAX_TEXTURE_ASSETS)fail('LIMIT_EXCEEDED','Paleta wymaga nowej tekstury i przekroczyłaby limit 8 zasobów. Oryginały nie są automatycznie usuwane.');
            result.assets!.push(next);
          }
        }
        derived.set(sourceAssetId,assetId);report.textures.push({sourceAssetId,assetId,layerIds:[],changedPixels,maxLightnessError});
      }
      report.textures.find(t=>t.sourceAssetId===sourceAssetId)!.layerIds.push(layer.id);
      if(assetId!==sourceAssetId)values.texture=`asset:${assetId}`;
    }else{
      if(layer.texture?.startsWith('asset:'))report.warnings.push(`${layer.id}: PNG pozostaje bez zmian; barwa tekstury może ograniczać wynik mnożenia.`);
      for(const [field,before] of colors){const after=hex(rotatePaletteRgb(rgb(before),angle));if(after.toLowerCase()===before.toLowerCase())continue;
        report.colors.push({layerId:layer.id,field,before,after});
        if(field.startsWith('material.')){values.material??=structuredClone((layer as any).material);values.material[field.split('.')[1]]=after;}else values[field]=after;
      }
    }
    if(Object.keys(values).length)changes.push({type:'layer.set',layerId:layer.id,values});
  }
  result=applyChanges(result,changes,false);assertDocumentInvariants(result);
  const diff=changedFields(document,result);
  if(!diff.length)fail('PALETTE_NO_CHANGES','Wybrana paleta nie zmienia barw w tym zakresie.');
  return {document:result,diff,report,proposalHash:paletteHash({version:PALETTE_VERSION,before:document,options,after:result})};
}
