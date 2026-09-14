/** Read-only comparison of immutable, downloaded V10/V11 candidates. No service calls. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngRgba8} from '../packages/core/src/textures.js';
import {sampleEmitterAppearance} from '../packages/core/src/particles.js';
import {readAsciiMdl} from '../packages/nwn-format/src/mdl-reader.js';
import {readHak} from '../packages/nwn-format/src/binary.js';
import {verifyCompiledRoundtrip} from '../packages/nwn-format/src/compiled-readback.js';
const out=resolve('output/beam-appearance-audit-2026-09-10');
mkdirSync(out,{recursive:true});
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const roots={V10:resolve('output/beam-high-visibility-v10/binary'),V11:'C:/Projects/the last city/assets/vfx/wampir/drain-life/studio/carmine-v11-r3-candidate'};
const reports:any[]=[];
for(const [label,root] of Object.entries(roots)){
  const read=(name:string)=>readFileSync(resolve(root,name));
  const handoff=JSON.parse(read('handoff.json').toString()),document=JSON.parse(read('effect-document.json').toString());
  const artifacts=handoff.artifacts.map((a:any)=>{
    const bytes=read(a.fileName);assert.equal(bytes.length,a.size);assert.equal(sha(bytes),a.sha256);
    return {name:a.fileName,size:bytes.length,sha256:sha(bytes)};
  });
  const mdl=readAsciiMdl(read('source-model.mdl.txt'));
  const roundtrip=verifyCompiledRoundtrip(read('source-model.mdl.txt'),read('compiled-roundtrip.mdl.txt'));
  const hak=readHak(read(`${mdl.model}.hak`)).map(f=>{
    assert.deepEqual(Buffer.from(f.data),read(f.name));return{name:f.name,sha256:sha(f.data),size:f.data.length};
  });
  const nodes=mdl.nodes.filter(n=>n.type==='emitter');
  const layers=document.layers.filter((l:any)=>l.type==='emitter'&&l.enabled).map((layer:any,index:number)=>{
    const asset=document.assets.find((a:any)=>`asset:${a.id}`===layer.texture);assert(asset);
    const png=Buffer.from(asset.pngBase64,'base64');assert.equal(sha(png),asset.id);
    const {width,height,rgba}=decodePngRgba8(png),node=nodes[index],resref=node.properties.texture[0],tga=read(`${resref}.tga`);
    // Independent explicit TGA byte comparison, including every hidden RGB byte.
    assert.equal(tga[2],2);assert.equal(tga[16],32);assert.equal(tga[17],8);
    assert.equal(tga.readUInt16LE(12),width);assert.equal(tga.readUInt16LE(14),height);assert.equal(tga.length,18+width*height*4);
    const decoded=Buffer.alloc(rgba.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const s=18+((height-1-y)*width+x)*4,d=(y*width+x)*4;
      decoded[d]=tga[s+2];decoded[d+1]=tga[s+1];decoded[d+2]=tga[s];decoded[d+3]=tga[s+3];
    }
    assert.deepEqual(decoded,Buffer.from(rgba));
    const histogram=Array(256).fill(0),rgb=[0,0,0],rgbTimesAlpha=[0,0,0];let alphaSum=0;
    for(let p=0;p<width*height;p++){
      const a=rgba[p*4+3]/255;histogram[rgba[p*4+3]]++;alphaSum+=a;
      for(let c=0;c<3;c++){rgb[c]+=rgba[p*4+c]/255;rgbTimesAlpha[c]+=rgba[p*4+c]/255*a;}
    }
    const pixelCount=width*height,meanAlpha=alphaSum/pixelCount;
    let lifeAreaAlpha=0;const samples=10000;
    for(let i=0;i<samples;i++){
      const appearance=sampleEmitterAppearance(layer,(i+.5)/samples);
      lifeAreaAlpha+=(appearance.size*layer.scale)**2*appearance.alpha/samples;
    }
    const atPoints=[0,layer.midPercent??.5,1].map(age=>{
      const a=sampleEmitterAppearance(layer,age);
      return{age,size:a.size,alpha:a.alpha,meanPixelAlpha:a.alpha*meanAlpha,linearPreviewColor:a.color};
    });
    return{id:layer.id,source:{...layer},node:node.name,properties:node.properties,
      animation:mdl.animations.map(a=>({name:a.name,length:a.length,events:a.events,node:a.nodes.find(n=>n.name===node.name)})),
      texture:{assetSha256:asset.id,tgaSha256:sha(tga),rgbaSha256:sha(rgba),width,height,allRgbaBytesMatch:true,txi:read(`${resref}.txi`).toString(),
        meanAlpha,maxAlpha:histogram.findLastIndex(n=>n>0)/255,meanRgb:rgb.map(x=>x/pixelCount),meanRgbTimesAlpha:rgbTimesAlpha.map(x=>x/pixelCount),
        alphaWeightedMeanRgb:rgbTimesAlpha.map(x=>alphaSum?x/alphaSum:0),alphaHistogram:histogram,
        alphaCoverage:Object.fromEntries([0,.1,.5,.9].map(t=>[String(t),histogram.reduce((sum,n,i)=>sum+(i/255>t?n:0),0)/pixelCount]))},
      atPoints,analyticProxy:{description:'Lifetime-average size^2 * authored alpha * mean texture alpha, per particle. No overlap, filtering, perspective, RGB, scene, or game-render measurement.',
        lifeAreaAlpha,withTexture:lifeAreaAlpha*meanAlpha}};
  });
  reports.push({label,root,projectId:handoff.projectId,revision:handoff.revision,jobId:handoff.jobId,snapshotSha256:handoff.snapshotSha256,
    artifacts,hak,roundtrip,model:mdl.model,layers});
}
const a=reports[0].layers[0],b=reports[1].layers[0];
const differences=Object.fromEntries([...new Set([...Object.keys(a.properties),...Object.keys(b.properties)])]
  .filter(k=>JSON.stringify(a.properties[k])!==JSON.stringify(b.properties[k])).map(k=>[k,{V10:a.properties[k],V11:b.properties[k]}]));
const result={scope:'Read-only candidate files; no service, project, global install or native application changes.',nativeVerified:false,reports,
  mainEmitterPropertyDifferences:differences,
  ratios:{V11mainToV10MeanTextureAlpha:b.texture.meanAlpha/a.texture.meanAlpha,V11mainToV10Count:b.source.count/a.source.count,
    V11mainToV10MaximumQuadArea:Math.max(...b.atPoints.map((x:any)=>x.size))**2/Math.max(...a.atPoints.map((x:any)=>x.size))**2,
    V11mainToV10PerParticleLifetimeAreaAlpha:b.analyticProxy.withTexture/a.analyticProxy.withTexture}};
writeFileSync(resolve(out,'candidate-comparison.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({path:resolve(out,'candidate-comparison.json'),candidates:reports.map(r=>({label:r.label,artifacts:r.artifacts.length,hakResources:r.hak.length,roundtrip:r.roundtrip,
  layers:r.layers.map((l:any)=>({id:l.id,meanAlpha:l.texture.meanAlpha,maxAlpha:l.texture.maxAlpha,meanRgb:l.texture.meanRgb,meanRgbTimesAlpha:l.texture.meanRgbTimesAlpha,coverage:l.texture.alphaCoverage,allRgbaBytesMatch:l.texture.allRgbaBytesMatch,proxy:l.analyticProxy.withTexture}))})),ratios:result.ratios},null,2));
