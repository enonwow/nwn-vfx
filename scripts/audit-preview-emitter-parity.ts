import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {PerspectiveCamera,Vector3} from 'three';
import {decodeTextureAsset} from '../packages/core/src/textures.js';
import {sampleEmitterAppearance} from '../packages/core/src/particles.js';
import {readAsciiMdl,numeric} from '../packages/nwn-format/src/mdl-reader.js';
import type {EffectDocument,EmitterLayer} from '../packages/core/src/model.js';

const dir=resolve('output/releases/0.21.1/after/smoke'),out=resolve('output/smoke-preview-native-audit');await mkdir(out,{recursive:true});
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const bytes=await readFile(join(dir,'effect-document.json')),doc=JSON.parse(bytes.toString('utf8')) as EffectDocument;
const source=await readFile(join(dir,'source-model.mdl.txt')),model=readAsciiMdl(source),binary=await readFile(join(dir,'smnew_smoke.mdl'));
const u=(o:number)=>binary.readUInt32LE(12+o),f=(o:number)=>binary.readFloatLE(12+o),s=(o:number)=>binary.readInt16LE(12+o);
const pending=[u(0x48)],emitterNodes=new Map<string,Map<number,number>>();
while(pending.length){const o=pending.pop()!,children=u(o+0x48);for(let i=0;i<u(o+0x4c);i++)pending.push(u(children+i*4));
  if(!(u(o+0x6c)&4))continue;const name=binary.subarray(12+o+0x20,12+o+0x40).toString('ascii').split('\0')[0],keys=u(o+0x54),data=u(o+0x60),controllers=new Map<number,number>();
  for(let i=0;i<u(o+0x58);i++){const k=keys+i*12;if(s(k+4)===1&&binary.readInt8(12+k+10)===1)controllers.set(u(k),f(data+s(k+8)*4));}emitterNodes.set(name,controllers);
}
const mapping={alphaStart:84,alphaMid:464,alphaEnd:80,sizeStart:168,sizeMid:484,sizeEnd:172,percentStart:480,percentMid:481,percentEnd:482,lifeExp:144,velocity:192,randvel:164};
const layers=doc.layers.filter((l):l is EmitterLayer=>l.enabled&&l.type==='emitter');
const evidence=layers.map((layer,i)=>{
  const node=model.nodes.find(n=>n.name==='em_'+i)!,controllers=emitterNodes.get(node.name)!;
  const fields=Object.fromEntries(Object.entries(mapping).map(([name,type])=>{const expected=numeric(node,name),actual=controllers.get(type);assert.equal(actual,Math.fround(expected));return[name,{ascii:expected,binary:actual}];}));
  return {id:layer.id,count:layer.count,scale:layer.scale,fields,lifetime:{authored:layer.life,previewMin:.85*layer.life,previewMax:1.15*layer.life},
    midpointSeconds:{nominal:layer.life*(layer.midPercent??.5),previewMin:.85*layer.life*(layer.midPercent??.5),previewMax:1.15*layer.life*(layer.midPercent??.5)},
    samples:[0,.1,.2244,.35,.5,.75,1,1.02].map(age=>({age,nominal:age>layer.life?null:sampleEmitterAppearance(layer,age/layer.life),
      previewLifeMin:age>.85*layer.life?null:sampleEmitterAppearance(layer,age/(.85*layer.life)),previewLifeMax:age>1.15*layer.life?null:sampleEmitterAppearance(layer,age/(1.15*layer.life))}))};
});
const asset=doc.assets!.find(a=>'asset:'+a.id===layers[0].texture)!,pixels=decodeTextureAsset(asset),sheet=layers[0].flipbook!;
const cw=pixels.width/sheet.columns,ch=pixels.height/sheet.rows,atlas=[];
for(let frame=0;frame<sheet.columns*sheet.rows;frame++){
  const histogram=new Array<number>(256).fill(0);let sum=0,aboveHalf=0,aboveTenth=0;
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const py=Math.floor(frame/sheet.columns)*ch+y,px=(frame%sheet.columns)*cw+x,a=pixels.rgba[(py*pixels.width+px)*4+3];histogram[a]++;sum+=a;if(a>127)aboveHalf++;if(a>25)aboveTenth++;}
  const n=cw*ch;let c=0,q95=0;for(let a=0;a<256;a++){c+=histogram[a];if(c>=n*.95){q95=a/255;break;}}
  atlas.push({frame,meanAlpha:sum/n/255,maxAlpha:histogram.findLastIndex(n=>n>0)/255,q95Alpha:q95,coverageAboveHalf:aboveHalf/n,coverageAboveTenth:aboveTenth/n});
}
const projection=[30,39,60,90].map(fov=>{const h=640,depth=8,size=1,camera=new PerspectiveCamera(fov,960/h,.05,100),upper=new Vector3(0,size/2,-depth).project(camera),lower=new Vector3(0,-size/2,-depth).project(camera);
  const meshPixels=(upper.y-lower.y)*h/2,previewPixels=Math.min(300,size*h/depth);return{fov,height:h,depth,size,meshPixels,previewPixels,ratio:previewPixels/meshPixels};});
const capture='C:/Projects/the last city/assets/vfx/wampir/skok/native/smoke-v5/runtime/skok-smoke-v5.mp4',captureBytes=await readFile(capture);
assert.equal(hash(captureBytes),'b0e83538012132080ee5a7f8f3378bc8c6cf106dfccbeec070315c1b6dd0bcc3');
const manifestPath='C:/Projects/the last city/assets/vfx/wampir/skok/native/smoke-v5/package-manifest.json',manifestBytes=await readFile(manifestPath);
function findModel(v:any):any{if(!v||typeof v!=='object')return;if(v.resref==='smnew_smoke'&&v.file==='smnew_smoke.mdl')return v;for(const value of Object.values(v)){const found=findModel(value);if(found)return found;}}
const binding=findModel(JSON.parse(manifestBytes.toString('utf8')));assert.equal(binding?.sha256,hash(binary));
const code=[];for(const path of ['packages/renderer/src/index.ts','packages/core/src/particles.ts','packages/nwn-format/src/mdl-writer.ts'])code.push({path,sha256:hash(await readFile(path))});
const proof={nativeVerified:false,scope:'Static code and immutable resource analysis; consumer reported exact-case visibility, not full renderer parity.',
  capture:{path:capture,sha256:hash(captureBytes),bytes:captureBytes.length},source:{path:dir,documentSha256:hash(bytes),modelSha256:hash(binary),sourceMdlSha256:hash(source)},
  consumerModelBinding:{path:manifestPath,manifestSha256:hash(manifestBytes),model:binding},code,
  scalarControllerReadbackPassed:true,projection,atlas,emitters:evidence};
await writeFile(join(out,'evidence.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({scalarControllerReadbackPassed:true,emitters:evidence.length,scales:[...new Set(layers.map(l=>l.scale))],projection,atlas,
 main:evidence[0],edge:evidence[18]},null,2));
