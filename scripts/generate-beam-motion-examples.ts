import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {beamMotionFixture} from '../tests/fixtures/beam-motion.js';
const out=resolve('docs/agents/examples/beam-native-motion');await mkdir(out,{recursive:true});
const {document,asset}=beamMotionFixture();
await writeFile(join(out,'project.json'),JSON.stringify(document,null,2)+'\n');
await writeFile(join(out,'technical-strip.png'),Buffer.from(asset.pngBase64,'base64'));
for(const phase of ['flow','opening','closing'] as const){
  const {motion}=beamMotionFixture(phase);
  await writeFile(join(out,phase+'.json'),JSON.stringify([{type:'layer.set',layerId:'beam',values:{segments:2,radius:0,lightningScale:0,nativeMotion:motion}}],null,2)+'\n');
}
