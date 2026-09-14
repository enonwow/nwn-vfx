import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const repo=resolve('.'),root=join(repo,'output/playwright/mesh-alpha-0301'),lab=join(root,'lab'),runtime=join(lab,'runtime-0301'),data=join(lab,'data');
await mkdir(runtime,{recursive:true});
for(const path of ['bin','dist','docs/agents','skills','package.json','package-lock.json','README.md'])await cp(join(repo,path),join(runtime,path),{recursive:true,errorOnExist:true,force:false});
const cli=join(runtime,'bin/nwn-vfx.mjs'),ownerConfig=join(data,'config.json'),env={...process.env,NWN_VFX_DATA_DIR:data};delete env.NWN_VFX_TOKEN;delete env.NWN_VFX_WEB_DIR;
const start=JSON.parse(execFileSync(process.execPath,[cli,'--config',ownerConfig,'--endpoint','http://127.0.0.1:14389','--json','service','start'],{env,windowsHide:true,encoding:'utf8'}));if(start.status==='failed')throw Error(JSON.stringify(start.error));
function call(operation,input,key){let stdout;try{stdout=execFileSync(process.execPath,[cli,'--config',ownerConfig,'--json','operations','call',operation,'--input','-',...(key?['--idempotency-key',key]:[])],{input:JSON.stringify(input),windowsHide:true,maxBuffer:16*1024*1024,encoding:'utf8'});}catch(e){stdout=e.stdout;}
 const r=JSON.parse(stdout);if(r.status==='failed')throw Error(JSON.stringify(r.error));return r.data;}
const projects=[];
for(const r of [4,5,6]){const source=JSON.parse((await readFile(root+`/boar-r${r}.json`,'utf8')).replace(/^\uFEFF/,''));
 const p=call('projects.import',{document:{...source,name:`Boar r${r} — ${r===5?'additive':r===6?'opaque':'normal alpha 0.6'} — preview0.30.1`}},'mesh-alpha0301-import-r'+r);
 projects.push({sourceRevision:r,projectId:p.id,revision:p.revision,documentDiff:['name only, isolated fixture'],sourceSha256:createHash('sha256').update(JSON.stringify(source)).digest('hex')});}
const a=call('actors.create',{name:'TLC mesh preview audit',projectIds:projects.map(p=>p.projectId),scopes:['read','create','edit','import','render','build','export','jobs','artifacts','cancel']},'mesh-alpha0301-consumer');
const config=JSON.parse(await readFile(ownerConfig,'utf8')),agentConfig=join(lab,'tlc-agent.config.json');await writeFile(agentConfig,JSON.stringify({endpoint:config.endpoint,instanceId:config.instanceId,workspaceId:config.workspaceId,ownerToken:a.token},null,2));
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else{const b=await readFile(p);files.push({path:p.slice(runtime.length+1),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}}}await walk(runtime);
await writeFile(join(lab,'runtime-manifest.json'),JSON.stringify({version:'0.30.1',files},null,2));
const result={version:'0.30.1',endpoint:config.endpoint,instanceId:config.instanceId,workspaceId:config.workspaceId,actorId:a.id,cli,config:agentConfig,projects,runtimeFiles:files.length};await writeFile(root+'/lab.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
