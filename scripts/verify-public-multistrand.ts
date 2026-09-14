import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {readAsciiMdl,numeric,textProperty} from '../packages/nwn-format/src/mdl-reader.js';
import {verifyBinaryBeam} from '../packages/nwn-format/src/binary-beam.js';

// Publicly retrieved immutable candidates; never touch service storage.
const root='output/beam-multistrand-0282/';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
function load(name:string,expected:string){
  const bytes=readFileSync(root+name+'.zip');assert.equal(sha(bytes),expected);
  const files=unzipSync(bytes),source=files['source-model.mdl.txt'],parsed=readAsciiMdl(source);
  return {sha256:sha(bytes),files,parsed,document:JSON.parse(strFromU8(files['effect-document.json'])),
    proof:verifyBinaryBeam(source,files[parsed.model+'.mdl'])};
}
const old=load('v17','1c7da21a48ead1e6644f6ad29e172c96967fa2931e20fca3553b4f6a93d12fe0');
const normalize=(value:unknown,model:string):unknown=>typeof value==='string'?value===model?'$MODEL':value:
  Array.isArray(value)?value.map(v=>normalize(v,model)):value&&typeof value==='object'?
    Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,model)])):value;
const keptNodes=(p:typeof old)=>normalize(p.parsed.nodes.filter(n=>!n.name.startsWith('strand_')),p.parsed.model);
const keptBinary=(p:typeof old)=>normalize(p.proof.nodes.filter(n=>!n.node.startsWith('strand_')),p.parsed.model);
const oldEmitter=old.parsed.nodes.find(n=>n.type==='emitter'&&textProperty(n,'update')==='Fountain')!;
const texture=textProperty(oldEmitter,'texture');
const results=[];
for(const [name,count,hash] of [
  ['three',3,'8981a370b5f33bc45b0b7a6749bbc81c4695708e237c986fb11615da1295dd61'],
  ['four',4,'9ec68bf7f2fd992376960d2f8980aa95e066d7c120c829b0c46c80bcb5248cc9']
] as const){
  const current=load(name,hash);
  assert.deepEqual(current.document.layers.find((l:any)=>l.id==='essence'),old.document.layers.find((l:any)=>l.id==='essence'));
  assert.deepEqual(current.document.assets,old.document.assets);assert.equal(current.document.duration,old.document.duration);
  assert.deepEqual(keptNodes(current),keptNodes(old));assert.deepEqual(keptBinary(current),keptBinary(old));
  assert.deepEqual(normalize(current.parsed.animations,current.parsed.model),normalize(old.parsed.animations,old.parsed.model));
  for(const ext of ['tga','txi'])assert.deepEqual(current.files[texture+'.'+ext],old.files[texture+'.'+ext]);
  const strands=current.parsed.nodes.filter(n=>n.type==='emitter'&&textProperty(n,'render')==='Linked');
  assert.equal(strands.length,count);for(const strand of strands)assert.equal(numeric(strand,'birthrate'),9);
  assert.equal(current.proof.nodes.filter(n=>n.type==='emitter'&&n.flags===258).length,count);
  results.push({name,strands:count,sha256:hash,documentSchema:current.document.schemaVersion,
    exactEssenceAndAssets:true,exactNonStrandSourceNodes:true,exactNonStrandBinaryControllers:true,
    exactCast01Animation:true,exactEssenceTextureBytes:true,pointCounts:strands.map(n=>numeric(n,'birthrate')),
    nativeVerified:false});
}
const report={sourceSha256:old.sha256,normalization:'Only exact main model name values; no numerical or controller normalization.',results};
writeFileSync(root+'public-readback.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
