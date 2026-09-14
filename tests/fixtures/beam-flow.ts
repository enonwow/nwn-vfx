import {applyChanges,makeDocument,makeLayer,type EffectDocument,type EmitterLayer} from '../../packages/core/src/model.js';
export function flowFixture(endpoints=true):EffectDocument {
  const base=makeDocument('empty','Finite flow','beam');
  const flow:EmitterLayer={...makeLayer('flow'),update:'Fountain',position:[0,0,0],speed:0,spread:0,gravity:0,start:0,duration:3,life:.6,count:120,
    alpha:0,midAlpha:.4,endAlpha:0,size:.08,midSize:.12,endSize:.05,texture:'glow',
    beamBinding:{role:'flow',source:[0,0,1.2],target:[0,3,1.2],direction:'source-to-target',pulse:{period:.5,duty:.6}}};
  const layers:EmitterLayer[]=[flow];
  if(endpoints)for(const role of ['source','target'] as const)layers.push({...flow,id:role,count:25,life:.3,start:role==='target'?.3:0,duration:3,beamBinding:{...flow.beamBinding!,pulse:undefined,role,node:role==='source'?'impact':'handconjure'}});
  return applyChanges(base,[{type:'project.set',values:{duration:4}},{type:'layer.remove',layerId:'beam'},...layers.map(layer=>({type:'layer.add' as const,layer}))],false);
}
