import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {makeStaticFlowStrand} from '../packages/core/src/beam-flow.js';
const root=resolve('output/beam-composite-0281/lab'),cli=join(root,'runtime-2/bin/nwn-vfx.mjs'),owner=join(root,'data/config.json'),agentConfig=join(root,'tlc-agent.config.json');
const exec=promisify(execFile),sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const call=async(args:string[],config=owner)=>{try{const {stdout}=await exec(process.execPath,[cli,'--config',config,'--json',...args],{windowsHide:true,maxBuffer:16*1024*1024});const r=JSON.parse(stdout);if(r.status==='failed')throw Error(JSON.stringify(r.error));return r.data;}catch(e:any){throw Error(e.stdout?JSON.stringify(JSON.parse(e.stdout).error):e.message);}};
await mkdir(join(root,'inputs'),{recursive:true});await mkdir(join(root,'artifacts'),{recursive:true});
const op=async(name:string,input:object,key?:string,config=owner)=>{const path=join(root,'inputs',name.replaceAll('.','-')+'-'+(key??'read')+'.json');await writeFile(path,JSON.stringify(input,null,2));return call(['operations','call',name,'--input-file',path,...(key?['--idempotency-key',key]:[])],config);};
const sourcePath=resolve('output/beam-high-visibility-v10/binary/effect-document.json'),sourceBytes=await readFile(sourcePath);
let source=await call(['projects','import','--file',sourcePath,'--project','studio-0281-flow','--idempotency-key','composite0281-source']);
const floatPath=resolve('output/beam-composite-0281/float-document-r2.json'),floatBytes=await readFile(floatPath),float=await call(['projects','import','--file',floatPath,'--project','studio-0281-decimal','--idempotency-key','composite0281-decimal']);
const actor=await op('actors.create',{name:'TLC composite 0.28.1',projectIds:[source.id,float.id],scopes:['read','edit','create','import','export','build','render','jobs','artifacts','review','cancel']},'composite0281-agent');
const ownerConfig=JSON.parse(await readFile(owner,'utf8'));await writeFile(agentConfig,JSON.stringify({...ownerConfig,ownerToken:actor.token},null,2),{mode:0o600});
const inspected=await call(['projects','inspect','--project',source.id,'--revision','1'],agentConfig);
const changes=[{type:'layer.add',layer:makeStaticFlowStrand(inspected.document,'strand')}];
const input={projectId:source.id,expectedRevision:1,changes};
const head=await call(['projects','inspect','--project',source.id],agentConfig);
if(head.revision===1)await op('changes.preview',input,undefined,agentConfig);source=await op('changes.apply',input,'composite0281-add',agentConfig);
const repeat=await op('changes.apply',input,'composite0281-add',agentConfig);if(repeat.revision!==source.revision)throw Error('Retry duplicated revision');
const jobs=[];
for(const [label,operation,input] of [
  ['mixed-binary','candidate.build',{projectId:source.id,revision:source.revision,profileId:'nwn-ee-beam-binary-experimental-v1',modelName:'vstrand281'}],
  ['mixed-preview','preview.request',{projectId:source.id,revision:source.revision,format:'png',time:1.4}],
  ['decimal-binary','candidate.build',{projectId:float.id,revision:float.revision,profileId:'nwn-ee-beam-binary-experimental-v1',modelName:'vdecimal281'}]
] as const){
  const q=await op(operation,input,'composite0281-'+label,agentConfig);let j=q;
  for(let i=0;i<90&&['queued','running'].includes(j.status);i++){await new Promise(r=>setTimeout(r,500));j=await call(['jobs','get',q.id],agentConfig);}
  if(j.status!=='succeeded')throw Error(JSON.stringify({id:j.id,status:j.status,error:j.error}));
  const zip=j.artifacts.find((a:any)=>a.fileName.endsWith(operation==='preview.request'?'.png':'.zip'));if(!zip)throw Error('Missing primary artifact');
  const out=join(root,'artifacts',label+(operation==='preview.request'?'.png':'.zip'));await call(['artifacts','get',zip.id,'--out',out,'--overwrite'],agentConfig);
  const bytes=await readFile(out);if(sha(bytes)!==zip.sha256||bytes.length!==zip.size)throw Error('Artifact mismatch');
  jobs.push({label,id:j.id,projectId:j.projectId,revision:j.revision,artifactId:zip.id,sha256:zip.sha256,size:zip.size,path:out});
}
const finalOriginal=await call(['projects','inspect','--project',source.id,'--revision','1'],agentConfig);if(JSON.stringify(finalOriginal.document)!==JSON.stringify(inspected.document))throw Error('Source changed');
if(sha(await readFile(sourcePath))!==sha(sourceBytes)||sha(await readFile(floatPath))!==sha(floatBytes))throw Error('Input file changed');
const version=await call(['version'],agentConfig),report={version,cli,configPath:agentConfig,actorId:actor.id,workspaceId:ownerConfig.workspaceId,instanceId:ownerConfig.instanceId,
  source:{id:source.id,revision:1,path:sourcePath,sha256:sha(sourceBytes)},mixed:{id:source.id,revision:source.revision},decimal:{id:float.id,revision:float.revision,path:floatPath,sha256:sha(floatBytes)},jobs,
  unchangedPorts:[4317,14384,14385,14386],nativeVerified:false};
await writeFile(join(root,'handoff.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
