import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRenderer} from '../apps/service/src/render.js';
import {makeDocument,makeLayer,type EffectDocument} from '../packages/core/src/model.js';

const [origin,folder]=process.argv.slice(2);
if(!origin||!folder)throw new Error('Usage: capture-particle-controls.ts <origin> <output-directory>');
const output=resolve(folder),render=createRenderer(origin);
await mkdir(output,{recursive:true});
const health=await (await fetch(`${origin}/api/health`)).json();
const cases:Array<{name:string;document:EffectDocument;time:number}>=[{name:'default-coil',document:makeDocument('coil'),time:.35}];
for(const texture of ['smoke','glow','spark'] as const){
  const document=makeDocument('empty',`Single ${texture}`);
  document.layers=[{...makeLayer('single'),texture,count:1,start:0,life:3,speed:0,gravity:0,size:2,endSize:2,position:[0,0,.7],color:'#ff8040',endColor:'#ff8040',alpha:1,endAlpha:1}];
  cases.push({name:`single-${texture}`,document,time:.2});
}
const white=structuredClone(cases[3]);white.name='white-spark';white.document.layers[0].color='#ffffff';
if(white.document.layers[0].type!=='mesh')white.document.layers[0].endColor='#ffffff';
cases.push(white);
const results=[];
for(const frame of cases){
  const result=await render(frame.document,{time:frame.time,format:'png',signal:new AbortController().signal});
  const data=result.files[0].data,path=resolve(output,`${frame.name}.png`);
  await writeFile(path,data);
  results.push({name:frame.name,path,time:frame.time,document:frame.document,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});
  process.stdout.write(`${frame.name}: ${data.length} bytes\n`);
}
await writeFile(resolve(output,'capture.json'),JSON.stringify({recordedAt:new Date().toISOString(),health,backend:'Chromium headless / ANGLE SwiftShader',nativeVerified:false,results},null,2));
