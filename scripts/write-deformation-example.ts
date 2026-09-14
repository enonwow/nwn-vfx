import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { deformationExample } from '../tests/fixtures/mesh-deformation.js';
const {document,layer,png}=deformationExample(),dir=resolve('docs/agents/examples/deformation');mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'red-surface.png'),png);
writeFileSync(join(dir,'changes.json'),JSON.stringify([{type:'project.set',values:{duration:2}},{type:'layer.remove',layerId:'sparks'},{type:'layer.add',layer}],null,2)+'\n');
writeFileSync(join(dir,'camera.json'),JSON.stringify({position:[.05,-1.3,.68],target:[0,0,.35],fov:39},null,2)+'\n');
writeFileSync(join(dir,'effect-document.json'),JSON.stringify(document,null,2)+'\n');
console.log(JSON.stringify({directory:dir,textureAssetId:document.assets![0].id,layerId:layer.id}));
