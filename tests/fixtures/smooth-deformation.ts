import {type Vec3} from '../../packages/core/src/model.js';
import {shadingExample} from './mesh-shading.js';

/** Own two-lobed surface with two nonuniform contractions and independent UV
 * corners. It contains no user heart geometry or source artwork. */
export function smoothDeformationExample(){
  const fixture=shadingExample(),layer=fixture.layer;
  if(layer.geometry.kind!=='custom')throw new Error('Custom fixture required');
  const rest=layer.geometry.vertices;
  layer.name='Two organic contractions';layer.duration=2;
  layer.animation={alpha:[{time:0,value:0},{time:.1,value:1},{time:1.9,value:1},{time:2,value:0}],
    vertices:[[0,0],[.23,.25],[.5,1],[.76,0],[1,0],[1.23,.25],[1.5,1],[1.76,0],[2,0]].map(([time,amount])=>({time,
      value:rest.map(([x,y,z])=>{const center=x<0?-.22:.22,weight=.5+.5*Math.cos(z*4);
        return [center+(x-center)*(1-.38*amount*weight),y*(1-.27*amount*weight),z*(1+.14*amount*weight)+.055*amount*(x-center)] as Vec3;})}))};
  fixture.document.duration=2;fixture.document.name='Smooth deformation technical example';
  return fixture;
}
