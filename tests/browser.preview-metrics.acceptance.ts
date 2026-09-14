import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {chromium,type Page} from 'playwright';
import {createApp} from '../apps/service/src/app.js';
import {makeDocument,makeLayer,makeMeshLayer,type EffectDocument,type EmitterLayer,type MeshLayer} from '../packages/core/src/model.js';
import {createTextureAsset} from '../packages/core/src/textures.js';
import type {PreviewCamera} from '../packages/core/src/camera.js';
import type {CompositionSnapshot} from '../packages/core/src/composition.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {rgbaPng} from './fixtures/rgba-texture.js';

const white=createTextureAsset('metric-white.png',Buffer.from(rgbaPng(8,8,()=>[255,255,255,255])).toString('base64'));
function particle(values:Partial<EmitterLayer>={}):EffectDocument {
  const doc:EffectDocument={...makeDocument('empty','Metric billboard fixture'),schemaVersion:3,assets:[white],layers:[{
    ...makeLayer('metric'),texture:`asset:${white.id}`,blend:'normal',position:[0,0,0],count:1,
    start:0,duration:.1,life:2,speed:0,gravity:0,spread:0,size:1,endSize:1,alpha:1,endAlpha:1,
    color:'#ffffff',endColor:'#ffffff',...values}]};
  assertDocument(doc);return doc;
}
// Independently authored world XZ square, facing -Y. No particle shader,
// point-size calculation or production billboard helper is used by this oracle.
function square(doc:EffectDocument):EffectDocument {
  const l=doc.layers[0] as EmitterLayer,h=l.size*l.scale/2;
  const mesh:MeshLayer={...makeMeshLayer('square'),position:l.position,duration:3,color:'#ffffff',
    geometry:{kind:'custom',vertices:[[-h,0,-h],[h,0,-h],[h,0,h],[-h,0,h]],faces:[[0,1,2],[0,2,3]]}};
  const result:EffectDocument={...doc,layers:[mesh]};
  assertDocument(result);return result;
}
const camera=(fov:number):PreviewCamera=>({position:[0,-5,0],target:[0,0,0],fov});
type Frame={width:number;height:number;rgba:Buffer;png:Buffer};
async function capture(page:Page,doc:EffectDocument,cam:PreviewCamera,time=.25,composition?:CompositionSnapshot):Promise<Frame>{
  const original=canonical(doc);
  // Public composition options remove grid/reference occluders from the metric
  // oracle. The identity path is also checked against single-project PNG/WebM
  // by browser.composition.acceptance.ts.
  composition??={compositionVersion:1,input:{duration:doc.duration,referenceGeometry:false,
    instances:[{id:'identity',projectId:'fixture',revision:1,start:0,position:[0,0,0],yawRadians:0}]},
    sources:[{projectId:'fixture',revision:1,document:doc,snapshotSha256:hash(canonical(doc))}]};
  const result=await page.evaluate(async({doc,cam,time,composition})=>{
    if(composition){window.studioSetComposition!(composition,cam);await window.studioRenderFrame!(time);}
    else await window.studioRender!(doc,time,cam);
    const source=document.querySelector('canvas')!,png=source.toDataURL('image/png');
    const copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;
    const context=copy.getContext('2d')!;context.drawImage(source,0,0);
    const bytes=context.getImageData(0,0,copy.width,copy.height).data,chunks:string[]=[];
    for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
    return {width:copy.width,height:copy.height,png:png.split(',')[1],rgba:btoa(chunks.join(''))};
  },{doc,cam,time,composition});
  assert.equal(canonical(doc),original);
  return {...result,rgba:Buffer.from(result.rgba,'base64'),png:Buffer.from(result.png,'base64')};
}
function bounds(frame:Frame){
  let minX=frame.width,minY=frame.height,maxX=-1,maxY=-1,count=0;
  for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
    const i=(y*frame.width+x)*4;
    if(frame.rgba[i]>245&&frame.rgba[i+1]>245&&frame.rgba[i+2]>245){
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;
    }
  }
  return {minX,minY,maxX,maxY,count,width:Math.max(0,maxX-minX+1),height:Math.max(0,maxY-minY+1)};
}
const pixel=(f:Frame,x=Math.floor(f.width/2),y=Math.floor(f.height/2))=>Array.from(f.rgba.subarray((y*f.width+x)*4,(y*f.width+x)*4+3));
const close=(actual:number,expected:number,tolerance:number,label:string)=>assert(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs ${expected}`);

test('billboards match independent metric geometry; exact life/speed, clipping and composition scale',{timeout:180000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-metric-preview-')),out=resolve('output/playwright/preview-metrics');await mkdir(out,{recursive:true});
  const app=await createApp({dataDir:dir,port:14364,webDir:resolve('dist/web')});
  const origin=await app.listen({host:'127.0.0.1',port:14364});
  const browser=await chromium.launch({headless:true,channel:'chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors:string[]=[],report:any={passed:false,nativeVerified:false,geometry:[],lifecycle:[],speed:[],clipping:[]};
  try{
    for(const dpr of [1,2]){
      const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:dpr});
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(origin+'/render');await page.waitForFunction(()=>!!window.studioRender);
      for(const fov of [10,30,39,60,90,120])for(const depth of [2,8,20]){
        const cam=camera(fov),doc=particle({position:[0,depth-5,0]});
        const p=await capture(page,doc,cam),m=await capture(page,square(doc),cam),pb=bounds(p),mb=bounds(m);
        for(const key of ['minX','minY','maxX','maxY','width','height'] as const)close(pb[key],mb[key],1,`mesh oracle ${key}, FOV${fov}, depth${depth}, DPR${dpr}`);
        const projected=p.height/(2*depth*Math.tan(fov*Math.PI/360));
        close(pb.width,Math.min(projected,p.width),2,'independent pinhole width');close(pb.height,Math.min(projected,p.height),2,'independent pinhole height');
        report.geometry.push({dpr,fov,depth,pinholePixels:projected,particle:pb,reference:mb});
        if(dpr===1&&fov===39&&depth===2)await writeFile(join(out,'metric-452px.png'),p.png);
      }
      if(dpr===2){await page.close();continue;}
      for(const c of [
        {name:'large',position:[0,0,0],size:4},
        {name:'centre-outside-right',position:[4,0,0],size:5},
        {name:'centre-outside-top',position:[0,0,3],size:5},
        {name:'near-visible',position:[0,-4.94,0],size:.1},
        {name:'near-clipped',position:[0,-4.96,0],size:.1},
        {name:'behind-camera',position:[0,-6,0],size:2},
        {name:'far-clipped',position:[0,16,0],size:5,cam:{position:[0,-85,0],target:[0,-84,0],fov:39}},
      ]){
        const doc=particle({position:c.position as [number,number,number],size:c.size,endSize:c.size}),cam=(c.cam??camera(39)) as PreviewCamera;
        const p=await capture(page,doc,cam),m=await capture(page,square(doc),cam),pb=bounds(p),mb=bounds(m);
        assert.deepEqual(pb,mb,c.name+': clipped geometry oracle');
        if(c.name.endsWith('clipped')||c.name==='behind-camera')assert.equal(pb.count,0,c.name);
        else assert(pb.count>0,c.name+': partially visible quad must survive');
        if(c.name==='large'){assert(pb.width>700,'no 300px/hardware point-size clamp');await writeFile(join(out,'large-723px.png'),p.png);}
        if(c.name.startsWith('centre-outside'))await writeFile(join(out,c.name+'.png'),p.png);
        report.clipping.push({name:c.name,bounds:pb});
      }
      const cam=camera(39),base=await capture(page,particle({enabled:false}),cam);
      for(const seed of [0,1,2,99]){
        const doc=particle({seed,start:.25,life:1});
        for(const [time,visible] of [[.249999,false],[.25,true],[1.249999,true],[1.25,false],[1.3,false]] as const){
          const p=await capture(page,doc,cam,time);assert.equal(bounds(p).count>0,visible,`life seed${seed} time${time}`);
        }
        const curve=particle({seed,start:.25,life:1,alpha:.2,midAlpha:1,endAlpha:0,midPercent:.25});
        for(const [age,alpha] of [[0,.2],[.125,.6],[.25,1],[.75,1/3]] as const){
          const p=await capture(page,curve,cam,.25+age),rgb=pixel(p),bg=pixel(base);
          rgb.forEach((v,i)=>close(v,255*alpha+bg[i]*(1-alpha),2,`alpha at exact age ${age}, seed${seed}`));
          report.lifecycle.push({seed,age,expectedAlpha:alpha,rgb});
        }
        const moving=particle({seed,position:[0,3,0],start:.25,life:2,speed:1.5,size:.1,endSize:.1});
        for(const age of [.2,.4,.8]){
          const p=await capture(page,moving,cam,.25+age),b=bounds(p),expectedY=320-1.5*age*640/(2*8*Math.tan(39*Math.PI/360));
          assert(b.count>0);close((b.minY+b.maxY)/2,expectedY,1,'source velocity without jitter');
          report.speed.push({seed,age,expectedY,measuredY:(b.minY+b.maxY)/2});
          assert.equal(hash((await capture(page,moving,cam,.25+age)).rgba),hash(p.rgba),'repeated frame deterministic');
        }
      }
      // Instance transforms scale the source position once; billboard width
      // multiplies layer and instance scale exactly once, despite group yaw.
      const doc=particle({position:[.5,0,0],scale:.5}),snapshot:CompositionSnapshot={compositionVersion:1,
        input:{duration:3,referenceGeometry:false,instances:[{id:'scaled',projectId:'fixture',revision:1,start:.4,position:[1,0,0],yawRadians:Math.PI,scale:2}]},
        sources:[{projectId:'fixture',revision:1,document:doc,snapshotSha256:hash(canonical(doc))}]};
      const composed=await capture(page,doc,cam,.65,snapshot),reference=await capture(page,square(particle()),cam);
      assert.deepEqual(bounds(composed),bounds(reference),'source .5 x instance 2, translated/yawed centre equals independent 1m square');
      report.compositionScale={layer:.5,instance:2,bounds:bounds(composed)};
      const full=particle({count:2000});
      const stressed=await capture(page,full,cam);assert.deepEqual(bounds(stressed),bounds(reference),'maximum layer count uses instanced quads');
      report.maxLayerParticles=2000;
      await page.close();
    }
    assert.deepEqual(errors,[]);report.passed=true;
  }catch(e){report.failure=String(e);throw e;}finally{
    report.consoleErrors=errors;await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await app.close();
    assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});
  }
});
