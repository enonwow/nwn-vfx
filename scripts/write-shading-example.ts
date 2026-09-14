import { mkdir, writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { shadingExample } from '../tests/fixtures/mesh-shading.js';
const out=resolve('docs/agents/examples/shading'),fixture=shadingExample();await mkdir(out,{recursive:true});
for(const [name,value] of Object.entries({'effect-document.json':fixture.document,'camera.json':fixture.camera,
  'changes.json':[{type:'project.set',values:{duration:1}},{type:'layer.remove',layerId:'sparks'},{type:'layer.add',layer:fixture.layer}]}))
  await writeFile(join(out,name),JSON.stringify(value,null,2)+'\n');
await writeFile(join(out,'ivory.png'),fixture.png);
