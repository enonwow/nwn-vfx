import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {inspectBinaryMeshes,verifyBinaryGeometry} from '../packages/nwn-format/src/binary-geometry.js';
import {verifyCompiledRoundtrip} from '../packages/nwn-format/src/compiled-readback.js';
import {verifyBinaryNormals} from '../packages/nwn-format/src/binary-normals.js';
import {smoothDeformationExample} from './fixtures/smooth-deformation.js';
import {readAsciiMdl} from '../packages/nwn-format/src/mdl-reader.js';

test('direct binary geometry verifies draw buffers and every vertex-major position/UV sample', {skip:!binaryCompilerAvailable()},async()=>{
  const fixture=smoothDeformationExample(),candidate=await buildCompiledCandidate(fixture.document,'direct_geometry');
  const source=candidate.files.find(f=>f.name==='source-model.mdl.txt')!.data,binary=candidate.files.find(f=>f.name==='direct_geometry.mdl')!.data;
  const meshes=inspectBinaryMeshes(binary),proof=verifyBinaryGeometry(source,binary);
  assert.equal(proof.baseRenderableMeshes,1);assert.equal(proof.animationMeshBindings,1);assert.equal(proof.duplicateControllers,0);
  assert.equal(proof.vertexSamples,meshes.find(m=>m.context==='impact')!.positions.length*121);
  const anim=readAsciiMdl(source).animations[0].nodes.find(n=>n.type==='animmesh')!;
  for(const key of ['position','orientation','scale','alpha']){assert(anim.tracks[key]);assert.equal(anim.properties[key],undefined);}
  const mesh=meshes.find(m=>m.context==='impact')!;
  for(const kind of ['draw','vertex','uv','pointer','controller'] as const){
    const corrupted=Uint8Array.from(binary),view=new DataView(corrupted.buffer);
    if(kind==='draw')view.setUint16(mesh.drawOffsets[0],mesh.draws[0][1],true);
    if(kind==='vertex')view.setFloat32(12+mesh.vertexSetOffset+12,.123456,true);
    if(kind==='uv')view.setFloat32(12+mesh.textureSetOffset+8,.123456,true);
    if(kind==='pointer')view.setUint32(12+mesh.offset+0x298,0xfffffff0,true);
    if(kind==='controller'){
      const ptr=view.getUint32(12+mesh.offset+0x54,true);view.setUint32(12+ptr+12,view.getUint32(12+ptr,true),true);
    }
    assert.throws(()=>verifyBinaryGeometry(source,corrupted),{code:'COMPILE_VALIDATION_FAILED'},kind);
    if(kind==='draw'){
      // This corrupts what is drawn, while preserving all face records,
      // samples and normal arrays consumed by the previous checks.
      verifyBinaryNormals(source,corrupted);
      const root=resolve(tmpdir()),dir=await mkdtemp(join(root,'vfx-draw-regression-'));
      try{
        await writeFile(join(dir,'bad.mdl'),corrupted);
        await promisify(execFile)(resolve('bin/native/win32/nwnmdlcomp.exe'),['-d','-e',join(dir,'bad.mdl'),join(dir,'bad.txt')],{windowsHide:true,timeout:60000});
        verifyCompiledRoundtrip(source,await readFile(join(dir,'bad.txt')));
      }finally{
        assert.equal(dirname(dir),root);assert(basename(dir).startsWith('vfx-draw-regression-'));await rm(dir,{recursive:true,force:true});
      }
    }
  }
});

test('legacy static plus keyed controllers compile twice and are rejected even when old roundtrip passes', {skip:!binaryCompilerAvailable()},async()=>{
  const fixture=smoothDeformationExample(),candidate=await buildCompiledCandidate(fixture.document,'legacy_control');
  const source=new TextDecoder().decode(candidate.files.find(f=>f.name==='source-model.mdl.txt')!.data);
  const old=source.replace(/(newanim[\s\S]*?node animmesh [^\n]+\n)/,'$1  alpha 0\n');
  const bytes=new TextEncoder().encode(old),root=resolve(tmpdir()),dir=await mkdtemp(join(root,'vfx-controller-regression-'));
  try{
    await writeFile(join(dir,'source.mdl'),bytes);
    const run=promisify(execFile),compiler=resolve('bin/native/win32/nwnmdlcomp.exe');
    await run(compiler,['-c','-n','-e',join(dir,'source.mdl'),join(dir,'compiled.mdl')],{windowsHide:true,timeout:60000});
    await run(compiler,['-d','-e',join(dir,'compiled.mdl'),join(dir,'roundtrip.txt')],{windowsHide:true,timeout:60000});
    const binary=await readFile(join(dir,'compiled.mdl'));
    verifyCompiledRoundtrip(bytes,await readFile(join(dir,'roundtrip.txt')));verifyBinaryNormals(bytes,binary);
    assert.equal(verifyBinaryGeometry(bytes,binary,{allowDuplicateControllers:true}).duplicateControllers,1);
    assert.throws(()=>verifyBinaryGeometry(bytes,binary),/duplicate controller/);
  }finally{
    assert.equal(dirname(dir),root);assert(basename(dir).startsWith('vfx-controller-regression-'));await rm(dir,{recursive:true,force:true});
  }
});
