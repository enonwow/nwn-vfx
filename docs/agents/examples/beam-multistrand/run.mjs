import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {isAbsolute} from 'node:path';
const args=process.argv.slice(2),get=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const cli=get('--cli'),config=get('--config'),projectId=get('--source-project'),revision=Number(get('--source-revision'));
const count=Number(get('--count','4')),key=get('--key','multi-strand-'+randomUUID());
if(!cli||!config||!isAbsolute(cli)||!isAbsolute(config)||!projectId||!Number.isInteger(revision)||revision<1||![3,4].includes(count))
  throw Error('Use absolute --cli and --config, --source-project ID, --source-revision N, optional --count 3|4 and stable --key.');
function call(operation,input,idempotencyKey){return new Promise((resolve,reject)=>{
  const child=execFile(process.execPath,[cli,'--config',config,'--json','operations','call',operation,'--input','-',...(idempotencyKey?['--idempotency-key',idempotencyKey]:[])],
    {windowsHide:true,maxBuffer:16*1024*1024},(error,stdout)=>{try{const r=JSON.parse(stdout);if(error||r.status==='failed')throw Error(JSON.stringify(r.error));resolve(r.data);}catch(e){reject(e);}});
  child.stdin.end(JSON.stringify(input));
});}
const source=await call('projects.inspect',{projectId,revision});
const flows=source.document.layers.filter(l=>l.enabled&&l.type==='emitter'&&l.beamBinding?.role==='flow');
if(flows.length!==1||source.document.layers.some(l=>l.enabled&&l.type!=='beam'&&l.id!==flows[0].id))throw Error('Example expects one active Fountain flow and beam layers only.');
const b=flows[0].beamBinding;
const settings=[
  {width:.006,alpha:.30,color:'#c72b40',radius:.020,delay:.22,lightningScale:.020},
  {width:.007,alpha:.28,color:'#ba2037',radius:.025,delay:.27,lightningScale:.025},
  {width:.008,alpha:.26,color:'#d03548',radius:.030,delay:.31,lightningScale:.018},
  {width:.0065,alpha:.24,color:'#ad2038',radius:.018,delay:.37,lightningScale:.030}
];
const strands=settings.slice(0,count).map((s,i)=>({id:'independent-strand-'+(i+1),name:'Osobna nitka '+(i+1),type:'beam',enabled:true,
  ...s,texture:'beam-soft',blend:'additive',source:b.source,target:b.target,segments:8,seed:42,
  flow:{direction:b.direction,speed:0},textureMapping:{axis:'v',fit:'source'}}));
// Only the explicit new fork loses the painted beam. Fountain/assets are copied intact.
let p=await call('projects.fork',{projectId,revision,name:'Independent strands — '+count},key+'-fork');
const changes=[...p.document.layers.filter(l=>l.type==='beam').map(l=>({type:'layer.remove',layerId:l.id})),...strands.map(layer=>({type:'layer.add',layer}))];
const input={projectId:p.id,expectedRevision:p.revision,changes};
const head=await call('projects.inspect',{projectId:p.id});if(head.revision===p.revision)await call('changes.preview',input);
p=await call('changes.apply',input,key+'-strands');
if(JSON.stringify(p.document.layers.find(l=>l.id===flows[0].id))!==JSON.stringify(flows[0]))throw Error('Fountain changed');
if(JSON.stringify(p.document.assets)!==JSON.stringify(source.document.assets))throw Error('Assets changed');
const q=await call('candidate.build',{projectId:p.id,revision:p.revision,profileId:'nwn-ee-beam-binary-experimental-v1',modelName:'vstrands282'},key+'-binary');
let j=q;for(let i=0;i<120&&['queued','running'].includes(j.status);i++){await new Promise(r=>setTimeout(r,500));j=await call('jobs.get',{jobId:q.id});}
if(j.status!=='succeeded')throw Error(JSON.stringify({jobId:j.id,status:j.status,error:j.error}));
const checkedSource=await call('projects.inspect',{projectId,revision});if(JSON.stringify(checkedSource)!==JSON.stringify(source))throw Error('Original revision changed');
console.log(JSON.stringify({source:{projectId,revision},projectId:p.id,revision:p.revision,strands:count,jobId:j.id,
  artifacts:j.artifacts.map(a=>({id:a.id,fileName:a.fileName,sha256:a.sha256,size:a.size})),fountainUnchanged:true,sourceUnchanged:true,
  nativeVerified:false,phasedWeavingSupported:false},null,2));
