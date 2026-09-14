import {execFile} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {isAbsolute} from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
const same=(a,b)=>assert(isDeepStrictEqual(a,b),'Unexpected source/control difference; stop without printing embedded assets.');
const args=process.argv.slice(2),get=(n,f)=>args.includes(n)?args[args.indexOf(n)+1]:f;
const cli=get('--cli'),config=get('--config'),projectId=get('--source-project'),revision=Number(get('--source-revision')),key=get('--key','periodic-'+randomUUID());
if(!cli||!config||!isAbsolute(cli)||!isAbsolute(config)||!projectId||!Number.isInteger(revision)||revision<1)throw Error('Absolute --cli, --config, --source-project, --source-revision and stable --key required.');
function call(operation,input,idempotencyKey){return new Promise((resolve,reject)=>{
  const child=execFile(process.execPath,[cli,'--config',config,'--json','operations','call',operation,'--input','-',...(idempotencyKey?['--idempotency-key',idempotencyKey]:[])],
    {windowsHide:true,maxBuffer:16*1024*1024},(error,stdout)=>{try{const r=JSON.parse(stdout);if(error||r.status==='failed')throw Error(JSON.stringify(r.error));resolve(r.data);}catch(e){reject(e);}});
  child.stdin.end(JSON.stringify(input));
});}
function fixturePng(){
  const width=64,height=256,rgba=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/63*2-1,t=2*Math.PI*y/255,c=.48*Math.sin(t),w=.08+.11*(.5+.5*Math.cos(t));
    const a=Math.exp(-(((u-c)/w)**2))*(.65+.35*Math.sin(t)**2),b=.5*Math.exp(-(((u+c)/(.19-w/2))**2));
    rgba.set([255,255,255,x===0||x===63?0:Math.round(255*Math.min(1,a+b)*(1-u*u))],(y*64+x)*4);
  }
  rgba.copy(rgba,255*64*4,0,64*4);
  const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  const chunk=(name,b)=>{const type=Buffer.from(name),out=Buffer.alloc(b.length+12);out.writeUInt32BE(b.length);type.copy(out,4);b.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([type,b])),b.length+8);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc(height*(1+width*4));for(let y=0;y<height;y++)rgba.copy(raw,y*(1+width*4)+1,y*width*4,(y+1)*width*4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const source=await call('projects.inspect',{projectId,revision}),flows=source.document.layers.filter(l=>l.enabled&&l.type==='emitter'&&l.beamBinding?.role==='flow');
assert.equal(flows.length,1);const essence=flows[0],b=essence.beamBinding;
assert(source.document.layers.every(l=>!l.enabled||l.type==='beam'||l.id===essence.id));
let p=await call('projects.fork',{projectId,revision,name:'Periodic ribbon — ANIMATED fixture'},key+'-fork');
const imported=await call('assets.import',{projectId:p.id,expectedRevision:p.revision,fileName:'periodic-ribbon-fixture.png',pngBase64:fixturePng().toString('base64')},key+'-texture');p=imported.project;
const layer={id:'periodic-ribbon',name:'Okresowa wstęga — fixture',type:'beam',enabled:true,texture:'asset:'+imported.assetId,textureMapping:{axis:'v',fit:'source'},
  color:'#c72b40',alpha:.55,width:.08,blend:'additive',source:b.source,target:b.target,flow:{direction:b.direction,speed:0},segments:2,radius:0,delay:.2,lightningScale:0,seed:42,
  materialMotion:{mode:'periodic-pan',direction:'source-to-target',fps:15}};
const input={projectId:p.id,expectedRevision:p.revision,changes:[...p.document.layers.filter(l=>l.type==='beam').map(l=>({type:'layer.remove',layerId:l.id})),{type:'layer.add',layer}]};
if((await call('projects.inspect',{projectId:p.id})).revision===p.revision)await call('changes.preview',input);
p=await call('changes.apply',input,key+'-animated');
let fixed=await call('projects.fork',{projectId:p.id,revision:p.revision,name:'Periodic ribbon — STATIC control'},key+'-static-fork');
fixed=await call('changes.apply',{projectId:fixed.id,expectedRevision:fixed.revision,changes:[{type:'layer.set',layerId:layer.id,values:{materialMotion:null}}]},key+'-static-reset');
for(const project of [p,fixed]){
  same(project.document.layers.find(l=>l.id===essence.id),essence);
  for(const asset of source.document.assets??[])same(project.document.assets.find(a=>a.id===asset.id),asset);
}
const expectedStatic=structuredClone(p.document);delete expectedStatic.layers.find(l=>l.id===layer.id).materialMotion;
// Fork labels are saved in document.name as well. No visual field changes.
expectedStatic.name=fixed.document.name;same(fixed.document,expectedStatic);
async function job(operation,input,key){const q=await call(operation,input,key);let j=q;
  for(let i=0;i<600&&['queued','running'].includes(j.status);i++){await new Promise(r=>setTimeout(r,500));j=await call('jobs.get',{jobId:q.id});}
  if(j.status!=='succeeded')throw Error(JSON.stringify({jobId:j.id,status:j.status,error:j.error}));
  return {id:j.id,status:j.status,artifacts:j.artifacts.map(a=>({id:a.id,fileName:a.fileName,sha256:a.sha256,size:a.size}))};}
const candidates=[];
for(const [label,project,modelName] of [['animated',p,'vpan0290'],['static',fixed,'vpanstat0290']]){
  const binary=await job('candidate.build',{projectId:project.id,revision:project.revision,profileId:'nwn-ee-beam-binary-experimental-v1',modelName},key+'-'+label+'-binary');
  const preview={};for(const format of ['png','webm'])preview[format]=await job('preview.request',{projectId:project.id,revision:project.revision,format,time:.8,camera:{position:[4,-5,3],target:[0,1.5,1.2],fov:45}},key+'-'+label+'-'+format);
  candidates.push({label,projectId:project.id,revision:project.revision,modelName,binary,preview});
}
same(await call('projects.inspect',{projectId,revision}),source);
console.log(JSON.stringify({source:{projectId,revision},textureAssetId:imported.assetId,candidates,
  essenceUnchanged:true,originalAssetsUnchanged:true,sourceUnchanged:true,staticDocumentDiff:['name (nonvisual fork label)','layers[periodic-ribbon].materialMotion removed'],
  nativeVerified:false,artApproved:false},null,2));
