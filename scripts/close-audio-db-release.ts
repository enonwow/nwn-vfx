import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execute,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
const out=resolve('output/releases/0.18.0'),baseline=JSON.parse(await readFile(join(out,'legacy-baseline.json'),'utf8'));
const call=async(operation:string,input:Record<string,unknown>,key?:string)=>{const r=await execute(operation,input,{},key);assert.equal(r.status,'ok',JSON.stringify(r.error));return r.data as any;};
const host=JSON.parse(await readFile(join(out,'real-host-webmcp.json'),'utf8'));assert.equal(host.passed,true);assert.equal(host.toolCount,48);assert.equal(host.checks.revoked,'WEBMCP_NOT_CONNECTED');
const current=await call('projects.inspect',{projectId:host.final.projectId});assert.equal(current.revision,10);assert.equal(current.document.audioClips[0].gain,6);
const imported=await call('projects.import',{projectId:'studio-db-0180-portable',bundleBase64:(await readFile(join(out,'real-host-project-v5.zip'))).toString('base64')},'studio-db-0180-portable-import-v1');
assert.deepEqual(imported.document,current.document);
const consumer=[];
for(const before of baseline.consumer){
  const p=await call('projects.inspect',{projectId:before.projectId});assert.equal(p.revision,before.revision);assert.equal(hash(canonical(p.document)),before.sha256);assert.equal(hash(canonical(p.document.audioAssets)),before.audioAssetsSha256);
  const revisions:any[]=[],artifacts:any[]=[];
  for(const [operation,target] of [['revisions.list',revisions],['artifacts.list',artifacts]] as const){let cursor:string|undefined;do{
    const page=await call(operation,{projectId:p.id,limit:100,...(cursor?{cursor}:{})});target.push(...page.items);cursor=page.nextCursor??undefined;
  }while(cursor);}
  assert.equal(hash(canonical(revisions)),before.revisionsSha256);
  assert.deepEqual(artifacts.map(a=>({id:a.id,sha256:a.sha256,size:a.size})).sort((a,b)=>a.id.localeCompare(b.id)),before.artifacts);
  consumer.push({projectId:p.id,revision:p.revision,sha256:before.sha256,revisions:revisions.length,artifacts:artifacts.length,allPreserved:true});
}
const installed='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio';
for(const file of ['package.json','skills/nwn-vfx/SKILL.md','docs/agents/audio.md'])assert.equal(hash(await readFile(file)),hash(await readFile(join(installed,file))));
assert.equal(hash(await readFile('skills/nwn-vfx/SKILL.md')),hash(await readFile('C:/Users/enonw/.codex/skills/nwn-vfx/SKILL.md')));
const proof={passed:true,service:await health(await connection({})),consumer,portable:{projectId:imported.id,revision:imported.revision,schemaVersion:imported.document.schemaVersion,exactDocumentSha256:hash(canonical(imported.document))},installedDocsAndSkillMatch:true,realHostWebMCPPassed:true,nativeVerified:false};
await writeFile(join(out,'closure.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
