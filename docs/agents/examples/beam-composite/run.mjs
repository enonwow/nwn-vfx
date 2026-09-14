import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
if(!args.includes('--cli')||!args.includes('--config'))throw Error('Pass --cli ABSOLUTE_PATH and --config ABSOLUTE_PATH');
const cli=arg('--cli'),config=arg('--config');
async function call(operation,input,key){
  const argv=[cli,'--config',config,'--json','operations','call',operation,'--input','-',...(key?['--idempotency-key',key]:[])];
  return new Promise((resolve,reject)=>{
    const child=execFile(process.execPath,argv,{windowsHide:true,maxBuffer:8*1024*1024},(error,stdout)=>{
      try{const r=JSON.parse(stdout);if(error||r.status==='failed')throw Error(JSON.stringify(r.error));resolve(r.data);}catch(e){reject(e);}
    });child.stdin.end(JSON.stringify(input));
  });
}
const key='composite-example-'+randomUUID(),document=JSON.parse(await readFile(new URL('./source.json',import.meta.url),'utf8'));
let p=await call('projects.import',{document},key+'-import');
const changes=JSON.parse(await readFile(new URL('./add-strand.json',import.meta.url),'utf8'));
const input={projectId:p.id,expectedRevision:p.revision,changes};
await call('changes.preview',input);p=await call('changes.apply',input,key+'-strand');
const q=await call('candidate.build',{projectId:p.id,revision:p.revision,profileId:'nwn-ee-beam-binary-experimental-v1',modelName:'vstrand_example'},key+'-build');
let j=q;for(let i=0;i<120&&['queued','running'].includes(j.status);i++){await new Promise(r=>setTimeout(r,500));j=await call('jobs.get',{jobId:q.id});}
if(j.status!=='succeeded')throw Error(JSON.stringify({jobId:j.id,status:j.status,error:j.error}));
console.log(JSON.stringify({projectId:p.id,revision:p.revision,jobId:j.id,artifacts:j.artifacts.map(a=>({id:a.id,fileName:a.fileName,sha256:a.sha256,size:a.size})),nativeVerified:false},null,2));
