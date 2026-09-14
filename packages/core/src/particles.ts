import type { EmitterLayer, Vec3 } from './model.js';

/** Same sRGB transfer used by Three.Color; interpolation takes place in linear RGB. */
export function colorToLinear(color: string): Vec3 {
  return [1,3,5].map(offset=>{const value=parseInt(color.slice(offset,offset+2),16)/255;return value<.04045?value*.0773993808:Math.pow(value*.9478672986+.0521327014,2.4);}) as Vec3;
}
export function emitterAppearancePoints(layer: EmitterLayer): {colorStart:Vec3;colorMid:Vec3;colorEnd:Vec3;alphaMid:number;sizeMid:number;midPercent:number} {
  const midPercent=layer.midPercent??.5,colorStart=colorToLinear(layer.color),colorEnd=colorToLinear(layer.endColor);
  return {colorStart,colorEnd,midPercent,colorMid:layer.midColor?colorToLinear(layer.midColor):colorStart.map((v,i)=>v+(colorEnd[i]-v)*midPercent) as Vec3,
    alphaMid:layer.midAlpha??layer.alpha+(layer.endAlpha-layer.alpha)*midPercent,sizeMid:layer.midSize??layer.size+(layer.endSize-layer.size)*midPercent};
}
export function sampleEmitterAppearance(layer: EmitterLayer,progress: number,p=emitterAppearancePoints(layer)): {color:Vec3;alpha:number;size:number} {
  const t=Math.max(0,Math.min(1,progress));
  const sample=(a:number,m:number,b:number)=>t<=p.midPercent?a+(m-a)*t/p.midPercent:m+(b-m)*(t-p.midPercent)/(1-p.midPercent);
  return {color:p.colorStart.map((v,i)=>sample(v,p.colorMid[i],p.colorEnd[i])) as Vec3,
    alpha:sample(layer.alpha,p.alphaMid,layer.endAlpha),size:sample(layer.size,p.sizeMid,layer.endSize)};
}
