import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('output/playwright/mesh-alpha-0301');await mkdir(out,{recursive:true});
const base=resolve('output/iteration-lab/2026-09-10/first-public'),cli=base+'/runtime-final/bin/nwn-vfx.mjs',config=base+'/tlc-agent.config.json';
function call(operation,input){const r=JSON.parse(execFileSync(process.execPath,[cli,'--config',config,'--json','operations','call',operation,'--input','-'],{input:JSON.stringify(input),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}));if(r.status==='failed')throw Error(JSON.stringify(r.error));return r.data;}
const jobs={4:'134f6719-7c8a-4705-a40c-e91577572450',5:'3bc13ca2-212b-447e-9456-98409c33a54f',6:'fc20e652-62db-4f9f-b529-2fc6f9545e2c'};
const report=[];
for(const revision of [4,5,6]){
 const p=call('projects.inspect',{projectId:'tlc-berserker-boar-spectral-v1',revision}),j=call('jobs.get',{jobId:jobs[revision]});
 await writeFile(out+`/boar-r${revision}.json`,JSON.stringify(p.document));
 const a=j.artifacts.find(a=>a.fileName==='preview.png');
 if(a)execFileSync(process.execPath,[cli,'--config',config,'--json','artifacts','get',a.id,'--out',out+`/boar-r${revision}-old.png`],{windowsHide:true,encoding:'utf8'});
 report.push({projectId:p.id,revision,jobId:j.id,metadata:j.metadata,artifact:a,layers:p.document.layers.map(l=>({id:l.id,type:l.type,alpha:l.alpha,blend:l.blend,shading:l.shading,material:l.material,triangles:l.geometry?.faces?.length,vertices:l.geometry?.vertices?.length,animationKeys:Object.keys(l.animation??{})}))});
}
await writeFile(out+'/inputs.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(r=>({revision:r.revision,layers:r.layers,artifactId:r.artifact?.id}))));
