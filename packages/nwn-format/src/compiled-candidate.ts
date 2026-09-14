import {isBeamFlow} from '../../core/src/beam-flow.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DomainError, type EffectDocument } from '../../core/src/model.js';
import { BINARY_COMPILER, BINARY_PROFILE_ID, binaryProfile } from '../../core/src/export-profiles.js';
import { buildCandidate, type CandidateResult } from './index.js';
import {bindEffectIntegration} from './effect-integration.js';
import { readHak, writeHak } from './binary.js';
import { verifyBinaryNormals, type BinaryNormalReadback } from './binary-normals.js';
import { verifyCompiledRoundtrip } from './compiled-readback.js';
import { verifyBinaryGeometry } from './binary-geometry.js';
import {verifyBinaryFlipbooks} from './binary-flipbook.js';
import {verifyBinaryEmission} from './binary-emission.js';
import {verifyBinaryBeam} from './binary-beam.js';
import {exporterVersion} from './mdl-writer.js';

const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const run=promisify(execFile),encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
export interface CompilationValidation {
  emitterFlipbookReadback: ReturnType<typeof verifyBinaryFlipbooks>;
  geometryReadback: ReturnType<typeof verifyBinaryGeometry>;
  normalReadback: BinaryNormalReadback;
  compiler: typeof BINARY_COMPILER; sourceProfileId: string;
  sourceMdlSha256: string; binaryMdlSha256: string; roundtripMdlSha256: string;
  sourceMdlBytes:number; binaryMdlBytes:number; roundtripVerified:true;
  nodes:number; triangles:number; vertexSamples:number; uvSamples:number; controllers:number; maxSampleError:number;
}
function compilerPath() {
  if(process.platform!==BINARY_COMPILER.platform)return undefined;
  return ['../../bin/native/win32/nwnmdlcomp.exe','../../../bin/native/win32/nwnmdlcomp.exe']
    .map(path=>fileURLToPath(new URL(path,import.meta.url))).find(existsSync);
}
export function binaryCompilerAvailable() {
  const path=compilerPath();return !!path&&hash(readFileSync(path))===BINARY_COMPILER.sha256;
}
/** This compiler has game/resource discovery removed and receives only a
 * Studio-generated, validated MDL. Paths and compiler arguments are never API
 * input. The explicit profile is diagnostic until the exact native retest.
 */
export async function buildCompiledCandidate(document:EffectDocument,modelName:string,signal?:AbortSignal):Promise<CandidateResult> {
  const compiler=compilerPath();
  if(!compiler||!binaryCompilerAvailable())throw new DomainError('CAPABILITY_UNAVAILABLE','Brak przypiętego kompilatora binarnego dla tego hosta.');
  signal?.throwIfAborted();
  const result=buildCandidate(document,modelName),source=result.files.find(f=>f.name===`${modelName}.mdl`)!.data;
  const root=resolve(tmpdir()),directory=await mkdtemp(join(root,'nwn-vfx-compile-'));
  try {
    const input=join(directory,'source.mdl'),output=join(directory,'compiled.mdl'),decompiled=join(directory,'roundtrip.mdl');
    await writeFile(input,source);
    const logs:Record<string,unknown>={compiler:BINARY_COMPILER};
    for(const [stage,args] of [['compile',['-c','-n','-e',input,output]],['decompile',['-d','-e',output,decompiled]]] as const) {
      signal?.throwIfAborted();
      const response=await run(compiler,[...args],{cwd:directory,windowsHide:true,timeout:60000,maxBuffer:1024*1024,signal});
      logs[stage]={stdout:response.stdout,stderr:response.stderr};
      if(/\b(error|warning)\b/i.test(response.stderr)||/^\s*(error|warning)\b/im.test(response.stdout))throw new DomainError('MODEL_COMPILE_FAILED',`Kompilator zgłosił diagnostykę: ${stage}.`,logs[stage]);
      const file=stage==='compile'?output:decompiled;
      if((await stat(file)).size>128*1024*1024)throw new DomainError('LIMIT_EXCEEDED','Wynik kompilacji przekracza 128 MiB.');
    }
    const binary=await readFile(output),roundtrip=await readFile(decompiled);
    if(binary.length<12||binary.readUInt32LE(0)!==0||12+binary.readUInt32LE(4)+binary.readUInt32LE(8)!==binary.length)throw new DomainError('COMPILE_VALIDATION_FAILED','Nieprawidłowy nagłówek binarnego MDL.');
    const proof=verifyCompiledRoundtrip(source,roundtrip);
    if(document.lifecycle==='beam'){
      const beam=result.files.find(f=>f.name===(isBeamFlow(document)?'beam-flow.json':'beam.json'))!;
      beam.data=encode({...JSON.parse(new TextDecoder().decode(beam.data)),binaryModelSha256:hash(binary),binaryReadback:verifyBinaryBeam(source,binary)});
      const strand=result.files.find(f=>f.name==='beam.json');if(isBeamFlow(document)&&strand)strand.data=encode({...JSON.parse(new TextDecoder().decode(strand.data)),binaryModelSha256:hash(binary),binaryReadback:verifyBinaryBeam(source,binary)});
    }
    const emission=verifyBinaryEmission(source,binary);
    const compilation:CompilationValidation={compiler:BINARY_COMPILER,sourceProfileId:document.profileId,emitterFlipbookReadback:verifyBinaryFlipbooks(source,binary),geometryReadback:verifyBinaryGeometry(source,binary),
      sourceMdlSha256:hash(source),binaryMdlSha256:hash(binary),roundtripMdlSha256:hash(roundtrip),
      sourceMdlBytes:source.length,binaryMdlBytes:binary.length,roundtripVerified:true,...proof,normalReadback:verifyBinaryNormals(source,binary)};
    const compiledModels=new Map<string,Uint8Array>([[modelName+'.mdl',binary]]),additionalProofs=[];
    for(const resource of result.files.filter(f=>f.name.endsWith('.mdl')&&f.name!==modelName+'.mdl')){
      signal?.throwIfAborted();await writeFile(input,resource.data);
      const modelLogs:Record<string,unknown>={};
      for(const [stage,args] of [['compile',['-c','-n','-e',input,output]],['decompile',['-d','-e',output,decompiled]]] as const){
        const response=await run(compiler,[...args],{cwd:directory,windowsHide:true,timeout:60000,maxBuffer:1024*1024,signal});modelLogs[stage]=response;
        if(/\b(error|warning)\b/i.test(response.stderr)||/^\s*(error|warning)\b/im.test(response.stdout))throw new DomainError('MODEL_COMPILE_FAILED','Diagnostyka kompilacji końcówki.',{model:resource.name,stage,stderr:response.stderr});
        if((await stat(stage==='compile'?output:decompiled)).size>128*1024*1024)throw new DomainError('LIMIT_EXCEEDED','Model końcówki przekracza limit.');
      }
      const compiled=await readFile(output),round=await readFile(decompiled);
      const proof={file:resource.name,sourceMdlSha256:hash(resource.data),binaryMdlSha256:hash(compiled),roundtripMdlSha256:hash(round),
        roundtrip:verifyCompiledRoundtrip(resource.data,round),emission:verifyBinaryEmission(resource.data,compiled),
        flipbook:verifyBinaryFlipbooks(resource.data,compiled),geometry:verifyBinaryGeometry(resource.data,compiled),normals:verifyBinaryNormals(resource.data,compiled)};
      compiledModels.set(resource.name,compiled);additionalProofs.push(proof);logs[resource.name]=modelLogs;
      result.files.push({name:resource.name+'.source.txt',data:resource.data},{name:resource.name+'.roundtrip.txt',data:round});
    }
    if(isBeamFlow(document)){
      const file=result.files.find(f=>f.name==='beam-flow.json')!,flow=JSON.parse(new TextDecoder().decode(file.data));flow.compiledEndpointModels=additionalProofs;
      for(const endpoint of flow.endpoints){endpoint.model.sourceSha256=endpoint.model.sha256;endpoint.model.sha256=hash(compiledModels.get(endpoint.model.file)!);}
      file.data=encode(flow);
    }
    const resources=readHak(result.files.find(f=>f.name===`${modelName}.hak`)!.data).map(f=>compiledModels.has(f.name)?{...f,data:compiledModels.get(f.name)!}:f);
    const hak=writeHak(resources),unpacked=readHak(hak);
    if(unpacked.length!==resources.length||unpacked.some(f=>hash(f.data)!==hash(resources.find(r=>r.name===f.name)!.data)))throw new DomainError('COMPILE_VALIDATION_FAILED','HAK nie zachował skompilowanych zasobów.');
    result.files=result.files.filter(f=>!['validation.json','README.txt'].includes(f.name)).map(f=>compiledModels.has(f.name)?{...f,data:compiledModels.get(f.name)!}:f.name===`${modelName}.hak`?{...f,data:hak}:f);
    result.files.push({name:'source-model.mdl.txt',data:source},{name:'compiled-roundtrip.mdl.txt',data:roundtrip},{name:'compiler-log.json',data:encode(logs)});
    const emissionFile=result.files.find(f=>f.name==='emitter-emission.json')!;
    emissionFile.data=encode({...JSON.parse(new TextDecoder().decode(emissionFile.data)),binaryMdlSha256:hash(binary),binaryReadback:emission});
    result.validation={...result.validation,exporterVersion:exporterVersion(document,true),profileId:binaryProfile(document.lifecycle),compilation,
      checks:{...result.validation.checks,compiledMdlHeaderRead:true,compiledRoundtripVerified:true,compiledStaticNormalsRead:true,
        compiledDetonateEventsRead:true,compiledBirthrateRead:true,compiledEmitterFlagsRead:true},
      resources:result.files.map(f=>({name:f.name,bytes:f.data.length,sha256:hash(f.data)})),
      diagnostics:[...result.validation.diagnostics,{code:'BINARY_MODEL_EXPERIMENTAL',severity:'warning',message:'Jawna kompilacja binarna: porównano geometrię, kontrolery i każdą próbkę animacji po odczycie. Zachowanie NWN wymaga osobnego testu.'}],
      limitations:[...result.validation.limitations.filter(s=>!s.includes('binary MDL compilation')),
        'Binary profile uses the pinned Windows resource-free nwnmdlcomp. ASCII readback fields describe the source; compilation records independent decompiler comparison with float32 tolerance. Rigid base trimesh normals are read directly from binary and checked at every oriented position/UV corner. Native lighting, animated normals, retail loading, visibility and appearance remain unqualified.',
        ...(isBeamFlow(document)?['Finite P2P and all endpoint models compiled and independently read back. Native flow, finite animation and endpoint node attachment remain unverified.']:document.lifecycle==='beam'?[document.layers.some(l=>l.type==='beam'&&l.nativeMotion)?'Lightning/Linked atlas grid, FPS, frame range and reference are read from binary. Native direction, cadence, width and consumer phase switching require testing. No automatic cessation.':'Lightning/Linked and fx_ref attachment structure is read from binary; dynamic attachment, width, direction and stopping in NWN still require consumer testing. Native flow/cessation controls are not exported.']:['No collision/bounce, moving attachment, P2P, random atlas playback or arbitrary curves.']),
        'Compiler bytes are retained exactly; byte determinism between independent jobs is not asserted.'],
    };
    result.files.push({name:'validation.json',data:encode(result.validation)},
      {name:'README.txt',data:new TextEncoder().encode(`NWN VFX Studio — experimental binary candidate\nProfile: ${binaryProfile(document.lifecycle)}\nModel: ${modelName}.mdl (binary)\nResource HAK: ${modelName}.hak\nSource: source-model.mdl.txt\nRoundtrip: compiled-roundtrip.mdl.txt\n\nSee validation.json for compiler identity, complete artifact hashes and readback.\nNo native test or visual qualification is implied. Register the returned model resref in the consumer's qualified workflow.\n`)});
    signal?.throwIfAborted();return bindEffectIntegration(result,document);
  } finally {
    if(dirname(directory)!==root||!basename(directory).startsWith('nwn-vfx-compile-'))throw new Error('Unexpected compiler temporary directory.');
    await rm(directory,{recursive:true,force:true});
  }
}
