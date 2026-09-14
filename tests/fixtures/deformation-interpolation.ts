import {durationExample} from './duration.js';
import {applyChanges,type MeshLayer} from '../../packages/core/src/model.js';

/** Own technical fixture: unequal knot spacing, fixed roots and a moving seam. */
export function interpolationFixture(){
  const d=durationExample().loop,l=d.layers[0] as MeshLayer;
  if(l.geometry.kind!=='custom')throw new Error('Expected custom mesh');
  const vertices=l.geometry.vertices;
  l.animation.vertices=[0,.13,.41,.76,1].map((time,i)=>({time,value:vertices.map((p,v)=>[p[0],p[1]+(v%3===0?0:[0,.12,0,-.1,0][i]),p[2]] as [number,number,number])}));
  return applyChanges(d,[{type:'layer.set',layerId:l.id,values:{deformationInterpolation:'monotone-cubic-loop'}}],true);
}
