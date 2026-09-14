import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {isAbsolute,basename} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),get=(n,f)=>args.includes(n)?args[args.indexOf(n)+1]:f;
const cli=get('--cli'),config=get('--config'),projectId=get('--source-project'),revision=Number(get('--source-revision'));
const wavPath=get('--wav'),key=get('--key','beam-audio-'+randomUUID()),modelName=get('--model-name','vbeam0300');
if(![cli,config,wavPath].every(v=>v&&isAbsolute(v))||!projectId||!Number.isInteger(revision)||revision<1)throw Error('Absolute --cli --config --wav, --source-project --source-revision and stable --key required.');
function call(operation,input,idempotencyKey){return new Promise((resolve,reject)=>{
  const child=execFile(process.execPath,[cli,'--config',config,'--json','operations','call',operation,'--input','-',...(idempotencyKey?['--idempotency-key',idempotencyKey]:[])],{windowsHide:true,maxBuffer:16*1024*1024},(error,stdout)=>{
    try{const r=JSON.parse(stdout);if(error||r.status==='failed')throw Error(JSON.stringify(r.error));resolve(r.data);}catch(e){reject(e);}});
  child.stdin.end(JSON.stringify(input));
});}
const source=await call('projects.inspect',{projectId,revision}),wav=await readFile(wavPath),sourceSha256=createHash('sha256').update(wav).digest('hex');
assert.equal(source.document.lifecycle,'beam');assert(!source.document.audioClips?.some(c=>c.enabled),'Use a source without active audio to avoid unintended overlap.');
let p=await call('projects.fork',{projectId,revision,name:get('--name','Finite beam with audio')},key+'-fork');
const imported=await call('audio.import',{projectId:p.id,expectedRevision:p.revision,fileName:basename(wavPath),dataBase64:wav.toString('base64')},key+'-import');p=imported.project;
const clip={id:'activation-audio',type:'audio',name:basename(wavPath),assetId:imported.assetId,enabled:true,start:0,duration:source.document.duration,offset:0,gainDb:0,fadeIn:0,fadeOut:0};
const input={projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.add',clip}]};
if((await call('projects.inspect',{projectId:p.id})).revision===p.revision)await call('changes.preview',input);
p=await call('changes.apply',input,key+'-add');
assert(isDeepStrictEqual(p.document.layers,source.document.layers),'Visual layers changed');assert(isDeepStrictEqual(p.document.assets,source.document.assets),'PNG assets changed');
async function job(operation,input,idempotencyKey){let j=await call(operation,input,idempotencyKey);const id=j.id;
  for(let i=0;i<600&&['queued','running'].includes(j.status);i++){await new Promise(r=>setTimeout(r,500));j=await call('jobs.get',{jobId:id});}
  if(j.status!=='succeeded')throw Error(JSON.stringify({jobId:id,status:j.status,error:j.error}));
  return{id,status:j.status,metadata:j.metadata,artifacts:j.artifacts.map(a=>({id:a.id,fileName:a.fileName,sha256:a.sha256,size:a.size}))};}
const candidate=await job('candidate.build',{projectId:p.id,revision:p.revision,modelName,profileId:'nwn-ee-beam-binary-experimental-v1'},key+'-binary');
const preview=await job('preview.request',{projectId:p.id,revision:p.revision,format:'webm',time:0,cycles:1},key+'-webm');
assert(isDeepStrictEqual(await call('projects.inspect',{projectId,revision}),source),'Source changed');
console.log(JSON.stringify({source:{projectId,revision},sourceSha256,assetId:imported.assetId,projectId:p.id,revision:p.revision,modelName,clip,
  visualsUnchanged:true,candidate,preview,nativeVerified:false},null,2));
