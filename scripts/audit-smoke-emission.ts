import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readBinaryEmission,verifyBinaryEmission} from '../packages/nwn-format/src/binary-emission.js';
import {readEmissionTiming} from '../packages/nwn-format/src/emission-readback.js';
import {readHak} from '../packages/nwn-format/src/binary.js';

const base='C:/Projects/the last city/assets/vfx/wampir/skok',out=resolve('output/smoke-emission-audit');
await mkdir(out,{recursive:true});
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const vanilla=[];
for(const name of ['vim_magblue','vim_exp2flame']){
  const path=join(base,'native/smoke-v3/diagnosis/vanilla-base',name+'.mdl'),bytes=await readFile(path);
  vanilla.push({path,sha256:hash(bytes),bytes:bytes.length,readback:readBinaryEmission(bytes)});
}
{
  const path='C:/Projects/nwn/VFX/source-assets/loose-graphics-and-references/rain-tax-cinder-sigil/donors/extracted_stock/vff_explfire.mdl',bytes=await readFile(path);
  assert.equal(hash(bytes),'9a2ecb84b9c48cc47c417cfa9f38fbe63f4a3346b5142fdd125ee6904993ff0b');
  vanilla.push({path,sha256:hash(bytes),bytes:bytes.length,readback:readBinaryEmission(bytes)});
}
const candidates=[];
for(const [part,revision,name] of [['departure',8,'vs_dep08'],['arrival',3,'vs_arr03'],['wake',5,'vs_wake05'],['wake_b',3,'vs_wakeb03'],['wake_c',3,'vs_wakec03']] as const){
  const dir=join(base,'exports',part,'r'+revision),source=await readFile(join(dir,'source-model.mdl.txt')),binary=await readFile(join(dir,name+'.mdl'));
  const doc=await json(join(dir,'effect-document.json')),validation=await json(join(dir,'validation.json')),handoff=await json(join(dir,'handoff.json'));
  const binaryReadback=verifyBinaryEmission(source,binary),timing=readEmissionTiming(source),hak=readHak(await readFile(join(dir,name+'.hak')));
  for(const entry of hak){const b=await readFile(join(dir,entry.name));assert.equal(hash(entry.data),hash(b));}
  for(const r of validation.resources){const b=await readFile(join(dir,r.name));assert.equal(hash(b),r.sha256);assert.equal(b.length,r.bytes);}
  const evidence={directory:dir,revision,model:name,binarySha256:hash(binary),sourceSha256:hash(source),documentFileSha256:hash(await readFile(join(dir,'effect-document.json'))),
    snapshotSha256:handoff.snapshotSha256??handoff.metadata?.validation?.integration?.effect?.snapshotSha256,
    nativeVerified:false,resourceHashesMatch:true,hakResources:hak.map(r=>({name:r.name,sha256:hash(r.data)})),
    authored:doc.layers.filter((l:any)=>l.enabled&&l.type==='emitter').map((l:any)=>({id:l.id,start:l.start,count:l.count,update:l.update,life:l.life,flipbook:l.flipbook})),
    timing,binaryReadback};
  candidates.push(evidence);await writeFile(join(out,part+'.json'),JSON.stringify(evidence,null,2));
}
const videoPath=join(base,'native/smoke-v3/runtime/skok-smoke-v3.mp4'),video=await readFile(videoPath);
assert.equal(hash(video),'80bcb909f2da6c6b56a122e190b9e00c97a7832b710df73a0d337f31e97b6852');assert.equal(video.length,5504625);
const report={nativeVerified:false,consumerNegativeCapture:{path:videoPath,sha256:hash(video),bytes:video.length,interpretation:'Consumer reported not_visible; no native session run by Studio.'},vanilla,candidates};
await writeFile(join(out,'audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({vanilla:vanilla.map(v=>({path:v.path,sha256:v.sha256,emitters:v.readback.baseEmitters.map(e=>({name:e.node,rate:e.birthrate,grid:[e.xgrid,e.ygrid]}))})),
 candidates:candidates.map(c=>({model:c.model,events:c.timing.events,minGap:c.timing.minEventGap,count:c.authored.reduce((sum:number,l:any)=>sum+l.count,0),
   worstMissing:Math.max(...c.timing.experiment.scenarios.map(s=>s.missingOwnBursts)),worstForeign:Math.max(...c.timing.experiment.scenarios.map(s=>s.foreignParticles))}))},null,2));
