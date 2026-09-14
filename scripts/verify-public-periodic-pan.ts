import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {readAsciiMdl,textProperty} from '../packages/nwn-format/src/mdl-reader.js';
import {verifyBinaryBeam} from '../packages/nwn-format/src/binary-beam.js';
import {readNwnTga} from '../packages/nwn-format/src/binary.js';
import {readTxi} from '../packages/nwn-format/src/textures.js';
import {buildMaterialMotionAtlas} from '../packages/core/src/beam-material-motion.js';
import {resolveTexture} from '../packages/core/src/textures.js';
const root='output/beam-periodic-pan-0290/',sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const report=JSON.parse(readFileSync(root+'public.json','utf8'));
function load(path:string,hash:string){
  const bytes=readFileSync(path);assert.equal(sha(bytes),hash);const files=unzipSync(bytes),parsed=readAsciiMdl(files['source-model.mdl.txt']);
  return {sha256:hash,files,parsed,document:JSON.parse(strFromU8(files['effect-document.json'])),proof:verifyBinaryBeam(files['source-model.mdl.txt'],files[parsed.model+'.mdl'])};
}
const old=load('output/beam-multistrand-0282/v17.zip','1c7da21a48ead1e6644f6ad29e172c96967fa2931e20fca3553b4f6a93d12fe0');
const normalize=(v:any,m:string):any=>typeof v==='string'?(v===m?'$MODEL':v):Array.isArray(v)?v.map(x=>normalize(x,m)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x,m)])):v;
const candidates=report.candidates.map((c:any)=>({...c,...load(root+c.label+'.zip',c.binary.artifacts.find((a:any)=>a.fileName==='candidate.zip').sha256)}));
for(const c of candidates){
  for(const format of ['png','webm'])assert.equal(sha(readFileSync(root+c.label+'.'+format)),c.preview[format].artifacts.find((a:any)=>a.fileName==='preview.'+format).sha256);
  assert.deepEqual(c.document.layers.find((l:any)=>l.id==='essence'),old.document.layers.find((l:any)=>l.id==='essence'));
  for(const asset of old.document.assets)assert.deepEqual(c.document.assets.find((a:any)=>a.id===asset.id),asset);
  assert.equal(c.document.duration,old.document.duration);
  assert.deepEqual(normalize(c.parsed.nodes.filter((n:any)=>!n.name.startsWith('strand_')),c.parsed.model),normalize(old.parsed.nodes.filter(n=>!n.name.startsWith('strand_')),old.parsed.model));
  assert.deepEqual(normalize(c.parsed.animations,c.parsed.model),normalize(old.parsed.animations,old.parsed.model));
  assert.deepEqual(normalize(c.proof.nodes.filter((n:any)=>!n.node.startsWith('strand_')),c.parsed.model),normalize(old.proof.nodes.filter(n=>!n.node.startsWith('strand_')),old.parsed.model));
  const essenceTexture=textProperty(old.parsed.nodes.find(n=>n.name==='em_0')!,'texture');
  for(const ext of ['tga','txi'])assert.deepEqual(c.files[essenceTexture+'.'+ext],old.files[essenceTexture+'.'+ext]);
}
const [animated,fixed]=candidates,expected=structuredClone(animated.document);delete expected.layers.find((l:any)=>l.id==='periodic-ribbon').materialMotion;expected.name=fixed.document.name;assert.deepEqual(fixed.document,expected);
const l=animated.document.layers.find((l:any)=>l.id==='periodic-ribbon'),atlas=buildMaterialMotionAtlas(animated.document,l),source=resolveTexture(animated.document,l.texture);
const nodes=candidates.map((c:any)=>c.parsed.nodes.find((n:any)=>n.name==='strand_0'));
const allowed=new Set(['texture','xgrid','fps','frameend']),diff=[];
for(const key of Object.keys(nodes[0].properties))if(JSON.stringify(normalize(nodes[0].properties[key],animated.parsed.model))!==JSON.stringify(normalize(nodes[1].properties[key],fixed.parsed.model))){assert(allowed.has(key),key);diff.push({property:key,animated:nodes[0].properties[key],static:nodes[1].properties[key]});}
const material=[];
for(const [i,c] of candidates.entries()){
  const texture=textProperty(nodes[i],'texture'),tga=readNwnTga(c.files[texture+'.tga']);
  assert.deepEqual(tga.rgba,i===0?atlas.pixels.rgba:source.rgba);
  const txi=readTxi(c.files[texture+'.txi'],i===0?'linked-periodic-pan-v1':undefined);
  material.push({label:c.label,width:tga.width,height:tga.height,rgbaSha256:sha(tga.rgba),txi,documentSchema:c.document.schemaVersion,
    exporter:JSON.parse(strFromU8(c.files['validation.json'])).exporterVersion});
}
for(let y=0;y<256;y++)assert.deepEqual(atlas.pixels.rgba.slice(y*4096,y*4096+256),source.rgba.slice(y*256,(y+1)*256));
const evidence={sourceV17:{projectId:report.source.projectId,revision:2,zipSha256:old.sha256},
  checks:{exactEssence:true,allOriginalAssetsExact:true,exactNonStrandSourceNodes:true,exactNonStrandBinaryControllers:true,exactCast01:true,essenceTextureBytesExact:true,
    staticFrameZeroExact:true,allPublicDownloadHashes:true,staticVisualDocumentDiffOnlyMaterialMotion:true},
  nonvisualDocumentDiff:['name (fork label)'],carrierSourceDiff:diff,materials:material,
  resourceDiff:['model names and their direct references','atlas/source pixels and dimensions','texture content-derived resrefs','TXI mipmap 0 versus 1','grid/FPS/frame range','exporter version','manifests, snapshots and resource hashes'],
  v17DocumentDiff:['name (fork label)','schema21→23','one new procedural PNG asset; original3 retained','old painted Linked replaced by one periodic-ribbon; essence untouched'],
  nativeVerified:false,artApproved:false};
writeFileSync(root+'public-readback.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
