import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {readAsciiMdl} from '../packages/nwn-format/src/mdl-reader.js';
import {verifyBinaryNormals} from '../packages/nwn-format/src/binary-normals.js';
const out=resolve('output/ugryzienie-02/r17-regression');mkdirSync(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/dist/node/cli.js');
const call=(args:string[])=>{const r=JSON.parse(execFileSync(process.execPath,[cli,'--json',...args],{windowsHide:true,encoding:'utf8',maxBuffer:64*1024*1024}));assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
const save=(name:string,x:unknown)=>writeFileSync(join(out,name),JSON.stringify(x,null,2));
const source=call(['projects','inspect','--project','tlc-wampir-ugryzienie','--revision','17']);save('source-project.json',source);
const fork=existsSync(join(out,'fork.json'))?JSON.parse(readFileSync(join(out,'fork.json'),'utf8')):
  call(['projects','fork','--project',source.id,'--revision','17','--name','Studio 02 — r17 export diagnosis','--idempotency-key','studio-ugryzienie02-r17-fork-001']);
save('fork.json',fork);assert.deepEqual({...fork.document,name:source.document.name},source.document);
const candidate=buildCandidate(fork.document,'ugryz17_diag');
const mdl=candidate.files.find(f=>f.name==='ugryz17_diag.mdl')!.data;writeFileSync(join(out,'source.mdl'),mdl);
const compiler=resolve('bin/native/win32/nwnmdlcomp.exe'),binary=join(out,'compiled.mdl'),roundtrip=join(out,'roundtrip.mdl');
for(const args of [['-c','-n','-e',join(out,'source.mdl'),binary],['-d','-e',binary,roundtrip]])
  execFileSync(compiler,args,{windowsHide:true,cwd:out,timeout:60000});
const before=readAsciiMdl(mdl),after=readAsciiMdl(readFileSync(roundtrip),{requireAnimationOrder:false});
const near=(a:number,b:number)=>Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-6),same=(a:number[],b:number[])=>a.length===b.length&&a.every((n,i)=>near(n,b[i]));
const findings:any[]=[];
for(const [section,nodes,targets] of [['base',before.nodes,after.nodes],...before.animations.map((a,i)=>[a.name,a.nodes,after.animations[i].nodes])] as any[])
 for(const n of nodes){if(!n.tables.verts)continue;const m=targets.find((x:any)=>x.name===n.name);
  for(const table of ['verts','tverts']){const src=n.tables[table],dst=m.tables[table],samples=n.tables[table==='verts'?'animverts':'animtverts']??[],actual=m.tables[table==='verts'?'animverts':'animtverts']??[],frames=samples.length/src.length;
   const signatures=src.map((v:number[],i:number)=>JSON.stringify([v,...Array.from({length:frames},(_,f)=>samples[f*src.length+i])]));
   const canonical=signatures.map((s:string)=>signatures.indexOf(s));
   const mapped=dst.map((v:number[],j:number)=>src.findIndex((p:number[],i:number)=>same(v,p)&&Array.from({length:frames},(_,f)=>f).every(f=>same(actual[f*dst.length+j],samples[f*src.length+i]))));
   const reached=new Set(mapped.map((i:number)=>canonical[i])),missing=[...new Set<number>(canonical)].filter((i:number)=>!reached.has(i));
   if(missing.length||mapped.includes(-1))findings.push({section,node:n.name,layerId:candidate.validation.readback.meshes.find(l=>l.node===n.name)?.layerId,table,srcCount:src.length,dstCount:dst.length,frames,exactClasses:new Set(canonical).size,reachedClasses:reached.size,
     missingCount:missing.length,missing:missing.slice(0,12).map((i:number)=>({index:i,value:src[i],usedByFaces:n.tables.faces.filter((f:number[])=>f.slice(table==='verts'?0:4,table==='verts'?3:7).includes(i)).length,
       nearSource:src.map((v:number[],j:number)=>same(v,src[i])?{index:j,value:v}:null).filter(Boolean).slice(0,6)}))});
  }
 }
let normals;try{normals=verifyBinaryNormals(mdl,readFileSync(binary));}catch(e:any){normals={error:e.message,code:e.code,details:e.details};}
save('diagnosis.json',{projectId:fork.id,revision:fork.revision,sourceRevision:17,findings,normals,
  sourceMdlSha256:createHash('sha256').update(mdl).digest('hex'),binaryMdlSha256:createHash('sha256').update(readFileSync(binary)).digest('hex')});
console.log(JSON.stringify({projectId:fork.id,findings,normals},null,2));
