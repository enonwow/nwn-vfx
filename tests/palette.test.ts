import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePalette,rgbToOklab,rotatePaletteRgb,type PaletteOptions} from '../packages/core/src/palette.js';
import {makeDocument,makeLayer,makeMeshLayer,makeTrailLayer,type EffectDocument} from '../packages/core/src/model.js';
import {createTextureAsset,decodePngRgba8,pngBytesFromBase64} from '../packages/core/src/textures.js';
import {rgbaPng} from './fixtures/rgba-texture.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {readTga} from '../packages/nwn-format/src/binary.js';
import {paletteOptions,paletteFixture} from './fixtures/palette.js';
test('palette preserves timing, geometry, physics, alpha and source assets; transforms shared texture only for selected layers',()=>{
  const doc=paletteFixture(),before=structuredClone(doc),p=preparePalette(doc,paletteOptions);assert.deepEqual(doc,before);
  assert.deepEqual(p.document.layers[1],doc.layers[1]);assert.deepEqual(p.document.layers[4],doc.layers[4]);
  assert.deepEqual(p.document.assets![0],doc.assets![0]);assert.equal(p.document.assets!.length,2);
  assert.deepEqual(p.document.layers[0],{...doc.layers[0],texture:`asset:${p.document.assets![1].id}`});
  for(const d of p.diff)assert.match(d.path,/^\/assets$|^\/layers\/[^/]+\/(texture|color|midColor|endColor)$/);
  const a=decodePngRgba8(pngBytesFromBase64(doc.assets![0].pngBase64)).rgba,b=decodePngRgba8(pngBytesFromBase64(p.document.assets![1].pngBase64)).rgba;
  let changed=0;for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],b[i+3]);if(!a[i+3])assert.deepEqual(b.slice(i,i+4),a.slice(i,i+4));else {assert(b[i+1]>b[i]);if(b[i]!==a[i])changed++;}}
  assert(changed>500);assert(p.report.textures[0].maxLightnessError<.004);assert.deepEqual(preparePalette(doc,paletteOptions),p);
});
test('explicit mesh materials transform effective channels; black emission and inactive legacy color stay unchanged',()=>{
  const doc=makeDocument('empty');doc.schemaVersion=5;doc.layers=[{...makeMeshLayer('mesh'),color:'#123456',material:{diffuse:'#ff1111',selfIllumination:'#000000'}}];
  const p=preparePalette(doc,paletteOptions),mesh=p.document.layers[0] as any;
  assert.equal(mesh.color,'#123456');assert.equal(mesh.material.selfIllumination,'#000000');assert.notEqual(mesh.material.diffuse,'#ff1111');
});
test('locks, empty/foreign scope, neutral anchors, tinted texture and asset capacity fail without partial edits',()=>{
  for(const change of [d=>d.locks.push({layerId:'blood',field:'texture'}),d=>(d.layers[0] as any).material.diffuse='#ff0000',d=>{while(d.assets!.length<8)d.assets!.push({...d.assets![0],id:String(d.assets!.length).repeat(64)});} ] as Array<(d:EffectDocument)=>void>){
    const d=paletteFixture();change(d);const copy=structuredClone(d);assert.throws(()=>preparePalette(d,paletteOptions),/blokad|mnożnik|limit/);assert.deepEqual(d,copy);
  }
  for(const options of [{...paletteOptions,to:'#ffffff'},{...paletteOptions,scope:{...paletteOptions.scope,layerIds:[]}}, {...paletteOptions,scope:{...paletteOptions.scope,excludeLayerIds:['missing']}}])assert.throws(()=>preparePalette(paletteFixture(),options));
});
test('Oklab rotation preserves neutral bytes and perceptual lightness over deterministic color corpus',()=>{
  for(let n=0;n<256;n++)assert.deepEqual(rotatePaletteRgb([n,n,n],2),[n,n,n]);
  for(let n=0;n<512;n++){const c=[n%256,(n*37)%256,(n*113)%256],p=rotatePaletteRgb(c,1.7);assert(Math.abs(rgbToOklab(c)[0]-rgbToOklab(p)[0])<.004);}
  const lab=rgbToOklab([255,0,0]);assert(Math.abs(lab[0]-.627955)<.00001);
});
test('included disabled references reuse one derivative, while explicit exclusion preserves a locked shared reference',()=>{
 const d=paletteFixture();d.locks=[{layerId:'excluded',field:'*'}];
 const options={...paletteOptions,scope:{...paletteOptions.scope,includeDisabled:true}};
 assert.throws(()=>preparePalette(d,options),/blokad/);
 const excluded=preparePalette(d,{...options,scope:{...options.scope,excludeLayerIds:['excluded']}});assert.deepEqual(excluded.document.layers[1],d.layers[1]);
 d.locks=[];const both=preparePalette(d,options);assert.equal(both.document.layers[0].texture,both.document.layers[1].texture);assert.equal(both.document.assets!.length,2);
});
test('document budget is checked on the complete proposal, preserving the source on rejection',()=>{
 const d=paletteFixture();let seed=991;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>24;};
 d.assets=Array.from({length:4},(_,i)=>createTextureAsset(`noise-${i}.png`,Buffer.from(rgbaPng(512,512,()=>[random(),random(),random(),random()])).toString('base64')));
 (d.layers[0] as any).texture=`asset:${d.assets[0].id}`;(d.layers[1] as any).texture=`asset:${d.assets[0].id}`;
 assertDocument(d);const before=JSON.stringify(d);assert.throws(()=>preparePalette(d,paletteOptions),/6 MiB/);assert.equal(JSON.stringify(d),before);
});
test('export packs the exact transformed pixels and untouched original; geometry/UV/material semantics remain identical',()=>{
 const d=paletteFixture(),p=preparePalette(d,paletteOptions),candidate=buildCandidate(p.document,'palettefixture');
 const expected=decodePngRgba8(pngBytesFromBase64(p.document.assets![1].pngBase64));
 const tgas=candidate.files.filter(f=>f.name.endsWith('.tga')).map(f=>readTga(f.data));
 assert(tgas.some(t=>Buffer.from(t.rgba).equals(Buffer.from(expected.rgba))));
 const original=buildCandidate(d,'palettefixture'),before=original.validation.readback.meshes[0],after=candidate.validation.readback.meshes[0];
 for(const key of ['vertices','faces','uv','uvFaces','position','orientation','scale','diffuse','selfIllumination','positionKeys','orientationKeys','scaleKeys','alphaKeys']){
   assert.notEqual((before as any)[key],undefined,key);assert.deepEqual((after as any)[key],(before as any)[key],key);
 }
});
