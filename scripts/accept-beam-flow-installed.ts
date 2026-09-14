import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,hash} from '../apps/service/src/store.js';
import type {BeamLayer,EmitterLayer} from '../packages/core/src/model.js';
const root=resolve(import.meta.dirname,'..'),out=join(root,'output/releases/0.27.0');await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs'),run=promisify(execFile),consumer='C:/Projects/the last city';
async function call(args:string[]){const r=await run(process.execPath,[cli,'--json',...args],{cwd:consumer,windowsHide:true,maxBuffer:32*1024*1024});const v=JSON.parse(r.stdout);assert.notEqual(v.status,'failed',JSON.stringify(v.error));return v.data;}
const report:any={version:'0.27.0',consumerCwd:consumer,nativeVerified:false,jobs:[]};
async function job(args:string[],label:string){const q=await call(args),j=await call(['jobs','wait',q.id,'--timeout','60s']);assert.equal(j.status,'succeeded',JSON.stringify(j.error));
  const folder=join(out,label);await mkdir(folder,{recursive:true});const files=[];
  for(const a of j.artifacts){const path=join(folder,a.fileName);await call(['artifacts','get',a.id,'--out',path,'--overwrite']);const b=await readFile(path);assert.equal(hash(b),a.sha256);assert.equal(b.length,a.size);files.push({name:a.fileName,sha256:a.sha256,bytes:b.length,artifactId:a.id,path});}
  const row={id:j.id,projectId:j.projectId,revision:j.revision,metadata:j.metadata,files};report.jobs.push(row);await writeFile(join(out,'installed-progress.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,job:j.id,files:files.length}));return row;
}
report.doctor=await call(['doctor']);assert.equal(report.doctor.client.version,'0.27.0');report.capabilities=await call(['capabilities']);assert.equal(report.capabilities.beamAuthoring.particleFlow.documentSchemaVersion,19);
const original=await call(['projects','inspect','--project','be431ef5-8e59-4552-81b1-bf71c25840ab','--revision','3']);
const reference=await call(['projects','inspect','--project','tlc-wampir-drain-wisp','--revision','3']);
report.sources=[original,reference].map(p=>({projectId:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document))}));
const fork=await call(['projects','fork','--project',original.id,'--revision','3','--name','Studio diagnostic - Drain Life finite P2P from V7','--idempotency-key','beam-027-v7-p2p-fork']);assert.notEqual(fork.id,original.id);
const sprite=reference.document.assets.find((a:any)=>a.id==='e9a330183b8c616db2b86c44555af1e26daaf0408691bd3a5e12c2ca2dd7a6ad');assert(sprite);
const spritePath=join(out,'endpoint-wisp-source.png');await writeFile(spritePath,Buffer.from(sprite.pngBase64,'base64'));
const imported=await call(['assets','import','--project',fork.id,'--expected-revision',String(fork.revision),'--file',spritePath,'--idempotency-key','beam-027-v7-p2p-sprite']);
const originalBeam=original.document.layers.find((l:any)=>l.type==='beam') as BeamLayer,base=reference.document.layers[0] as EmitterLayer;
const binding={source:originalBeam.source,target:originalBeam.target,direction:'target-to-source' as const};
const flow:EmitterLayer={...base,id:'essence_flow',name:'Esencja - cząstki od ofiary do dłoni',position:[0,0,0],speed:0,spread:0,gravity:0,scale:1,start:0,duration:3,life:.6,count:144,
  alpha:0,midAlpha:.55,endAlpha:0,size:.12,midSize:.16,endSize:.04,midPercent:.5,texture:'asset:'+imported.assetId,
  beamBinding:{...binding,role:'flow',pulse:{period:.55,duty:.65}}};
const victim:EmitterLayer={...base,id:'victim_wisp',name:'Miękka końcówka przy ofierze',texture:flow.texture,start:0,duration:3,count:36,beamBinding:{...binding,role:'target',node:'impact'}};
const hand:EmitterLayer={...base,id:'hand_wisp',name:'Miękka końcówka przy dłoni',texture:flow.texture,start:.6,duration:2.65,count:32,beamBinding:{...binding,role:'source',node:'handconjure'}};
const changes=[{type:'project.set',values:{duration:4}},...fork.document.layers.filter((l:any)=>l.enabled).map((l:any)=>({type:'layer.set',layerId:l.id,values:{enabled:false}})),...[flow,victim,hand].map(layer=>({type:'layer.add',layer}))];
const path=join(out,'author-flow-changes.json');await writeFile(path,JSON.stringify(changes,null,2));
await call(['changes','preview','--project',fork.id,'--expected-revision',String(imported.project.revision),'--input-file',path]);
const authored=await call(['changes','apply','--project',fork.id,'--expected-revision',String(imported.project.revision),'--input-file',path,'--idempotency-key','beam-027-v7-p2p-author']);
assert.equal(authored.document.schemaVersion,19);for(const l of original.document.layers)assert.deepEqual({...authored.document.layers.find((a:any)=>a.id===l.id),enabled:l.enabled},l);
report.fork={projectId:authored.id,revision:authored.revision,snapshotSha256:hash(canonical(authored.document))};await writeFile(join(out,'diagnostic-project.json'),JSON.stringify(authored,null,2));
for(const format of ['ascii','binary']){const row=await job(['candidate','build','--project',authored.id,'--revision',String(authored.revision),'--model-name','vd_p2p_v7','--profile',`nwn-ee-beam-${format}-experimental-v1`,'--idempotency-key','beam-027-v7-p2p-'+format],format);assert.equal(row.metadata.validation.exporterVersion,`nwn-${format}-vfx-0.27.0`);const flow=JSON.parse(await readFile(join(out,format,'beam-flow.json'),'utf8'));assert.equal(flow.endpoints.length,2);if(format==='binary')assert.equal(flow.compiledEndpointModels.length,2);}
for(const format of ['png','webm']){const row=await job(['preview','request','--project',authored.id,'--revision',String(authored.revision),'--format',format,'--time','1.4','--idempotency-key','beam-027-v7-p2p-'+format],format);assert.equal(row.metadata.beamParticleFlow.length,3);}
await job(['projects','export','--project',authored.id,'--revision',String(authored.revision),'--idempotency-key','beam-027-v7-p2p-zip'],'project');
for(const p of [original,reference])assert.deepEqual((await call(['projects','inspect','--project',p.id,'--revision',String(p.revision)])).document,p.document);
report.sourcesPreserved=true;report.passed=true;await writeFile(join(out,'installed-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,fork:report.fork,jobs:report.jobs.map((j:any)=>j.id)}));
