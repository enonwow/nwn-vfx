/** Resource-free compiler probe; never invokes a game or reads Studio storage. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readProbeMdl } from './format.js';
const root=resolve('output/trail-feasibility'),run=promisify(execFile),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const compiler=join(root,'compiler-source/nwnmdlcomp/Release/nwnmdlcomp.exe'),input=join(root,'trail_probe.mdl');
const inputBytes=await readFile(input),id=sha(inputBytes).slice(0,12),binary=join(root,`native-${id}.mdl`),roundtrip=join(root,`roundtrip-${id}.mdl`);
const report:any={status:'running',nativeVerified:false,sourceMdlSha256:sha(inputBytes),compilerSha256:sha(await readFile(compiler)),
  upstreamSource:'C:/Projects/Claude/nwnexplorer',sourceCopy:'output/trail-feasibility/compiler-source',
  launcherPatch:'Replaced game-loader initialization condition with extraction rejection; parser, geometry compiler, serialization and decompiler unchanged.',
  gameDiscovery:false,gameProcesses:false};
try {
  const before=performance.now();
  const compiled=await run(compiler,['-c','-n','-e',input,binary],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  report.compileMs=performance.now()-before;report.compileStdout=compiled.stdout;report.compileStderr=compiled.stderr;
  const native=await readFile(binary);assert.equal(native.readUInt32LE(0),0);assert(native.length>12);report.binaryBytes=native.length;report.binarySha256=sha(native);
  const decompileStart=performance.now();
  const decomposed=await run(compiler,['-d','-e',binary,roundtrip],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  report.decompileMs=performance.now()-decompileStart;report.decompileStdout=decomposed.stdout;report.decompileStderr=decomposed.stderr;
  const source=readProbeMdl(inputBytes),actual=readProbeMdl(await readFile(roundtrip));
  assert.equal(actual.length,source.length);let maxPositionError=0,maxUvError=0,verticesChecked=0,uvChecked=0;
  report.nodes=[];
  for(const expected of source) {
    const result=actual.find(m=>m.name===expected.name);assert(result);assert.equal(result.frames.length,expected.frames.length);assert(Math.abs(result.period-expected.period)<1e-8);
    assert.equal(result.faces.length,expected.faces.length);assert.equal(result.base.vertices.length,expected.base.vertices.length);
    const lookup=result.base.vertices.map(v=>{
      let best=Infinity,index=-1;expected.base.vertices.forEach((p,i)=>{const d=Math.hypot(...v.map((x,k)=>x-p[k]));if(d<best){best=d;index=i;}});
      assert(best<1e-6,`Base vertex has no source match (${best}m)`);return index;
    });
    assert.equal(new Set(lookup).size,expected.base.vertices.length);
    for(let f=0;f<result.frames.length;f++) for(let v=0;v<lookup.length;v++) {
      const e=expected.frames[f],r=result.frames[f];
      for(let k=0;k<3;k++) {maxPositionError=Math.max(maxPositionError,Math.abs(e.vertices[lookup[v]][k]-r.vertices[v][k]));maxUvError=Math.max(maxUvError,Math.abs(e.uv[lookup[v]][k]-r.uv[v][k]));}
      verticesChecked++;uvChecked++;
    }
    report.nodes.push({name:result.name,vertices:result.base.vertices.length,faces:result.faces.length,frames:result.frames.length,period:result.period});
  }
  assert(maxPositionError<1e-6,`Position loss: ${maxPositionError}`);assert(maxUvError<1e-6,`Local age UV loss: ${maxUvError}`);
  report.validation={verticesChecked,uvChecked,maxPositionErrorMetres:maxPositionError,maxUvError,allNodesAndFrames:true};
  report.roundtripBytes=(await stat(roundtrip)).size;report.roundtripSha256=sha(await readFile(roundtrip));report.status='independent-compiler-roundtrip-passed';
} catch(error) {report.status='failed';report.error=error instanceof Error?error.stack:String(error);throw error;}
finally {await writeFile(join(root,'external-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
