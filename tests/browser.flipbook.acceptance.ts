import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {atlasColors,flipbookFixture} from './fixtures/flipbook.js';

const run=promisify(execFile);
async function decode(path:string,index?:number){return (await run('ffmpeg',['-v','error','-i',path,...(index===undefined?[]:['-vf',`select=eq(n\\,${index})`]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:8*1024*1024})).stdout;}
const pixel=(b:Buffer,x:number,y:number)=>Array.from(b.subarray((y*960+x)*3,(y*960+x)*3+3));
function near(actual:number[],expected:number[],tolerance:number,label:string){assert(actual.every((v,i)=>Math.abs(v-expected[i])<=tolerance),`${label}: ${actual} != ${expected}`);}

test('production PNG/WebM render correct asymmetric cells, orientation, boundaries and independent particle births',{timeout:240000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-atlas-render-')),out=resolve('output/playwright/flipbook-acceptance');await mkdir(out,{recursive:true});
  const app=await createApp({dataDir:dir,port:14362,webDir:resolve('dist/web')}),origin=await app.listen({host:'127.0.0.1',port:14362});
  const render=createRenderer(origin),doc=flipbookFixture(),signal=new AbortController().signal;
  const camera={position:[0,-5,.7] as [number,number,number],target:[0,0,.7] as [number,number,number],fov:39};
  const report:any={passed:false,nativeVerified:false,frames:[]};
  try{
    for(const [time,frame] of [[.25,0],[.499999,0],[.5,1],[.75,2],[1,3],[1.25,0]]){
      const result=await render(doc,{format:'png',time,camera,signal}),path=join(out,`atlas-${time}.png`);await writeFile(path,result.files[0].data);
      const rgb=await decode(path);near(pixel(rgb,480,320),atlasColors[frame],3,`frame at ${time}`);
      near(pixel(rgb,420,260),[250,250,250],3,'top-left marker');near(pixel(rgb,540,380),[20,20,20],3,'bottom-right marker');
      assert.equal((result.metadata as any).emitterFlipbooks[0].clock,'particle-age-seconds');report.frames.push({time,frame,path});
    }
    const video=await render(doc,{format:'webm',time:0,camera,signal}),path=join(out,'atlas.webm');await writeFile(path,video.files[0].data);
    for(const [index,frame] of [[8,0],[15,1],[23,2],[30,3],[38,0]]){const rgb=await decode(path,index);near(pixel(rgb,480,320),atlasColors[frame],12,`WebM ${index}`);near(pixel(rgb,420,260),[250,250,250],12,'WebM orientation');}
    // One continuous emitter particle born later than layer.start. At its exact
    // seeded birth it must still show cell zero; using layer/global age fails.
    const fountain=flipbookFixture();const l=fountain.layers[0] as any;l.update='Fountain';l.duration=1;l.life=1;l.start=0;
    let seed=(l.seed^fountain.seed)>>>0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;
    const birth=Math.fround(((t^t>>>14)>>>0)/4294967296);assert(birth>.25,'fixture must distinguish layer time');
    const image=await render(fountain,{format:'png',time:birth+.01,camera,signal}),birthPath=join(out,'birth.png');await writeFile(birthPath,image.files[0].data);near(pixel(await decode(birthPath),480,320),atlasColors[0],3,'newborn particle');
    report.birth=birth;report.passed=true;
  }catch(e){report.failure=String(e);throw e;}finally{
    await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});
  }
});
