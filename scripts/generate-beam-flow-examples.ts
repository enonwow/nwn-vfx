import {mkdir,writeFile} from 'node:fs/promises';
import {makeFlowLayer} from '../packages/core/src/beam-flow.js';
const dir='docs/agents/examples/beam-flow';await mkdir(dir,{recursive:true});
const flow=makeFlowLayer('flow');
await writeFile(dir+'/from-empty.json',JSON.stringify([{type:'project.set',values:{duration:3.6}},{type:'layer.remove',layerId:'beam'},{type:'layer.add',layer:flow}],null,2)+'\n');
const endpoints=['source','target'].map((role,i)=>({type:'layer.add',layer:{...makeFlowLayer('endpoint_'+role),name:'Endpoint '+role,count:24,life:.3,duration:3,start:i*.3,size:.16,midSize:.2,endSize:.24,beamBinding:{...flow.beamBinding,pulse:undefined,role,node:i?'handconjure':'impact'}}}));
await writeFile(dir+'/add-endpoints.json',JSON.stringify(endpoints,null,2)+'\n');
console.log('Wrote finite flow examples');
