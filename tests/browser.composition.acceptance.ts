import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PerspectiveCamera,Vector3} from 'three';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {atlasColors,flipbookFixture} from './fixtures/flipbook.js';
import {type CompositionSnapshot} from '../packages/core/src/composition.js';
import {validateOperationOutput} from '../packages/contracts/src/schema.js';

const run=promisify(execFile);
async function decode(path:string,index?:number){return(await run('ffmpeg',['-v','error','-i',path,...(index===undefined?[]:['-vf',`select=eq(n\\,${index})`]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:8*1024*1024})).stdout;}
test('production composition PNG/WebM proves translation, yaw, scale, delayed atlas clocks and legacy identity',{timeout:240000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'composition-render-')),out=resolve('output/playwright/composition');await mkdir(out,{recursive:true});
  const app=await createApp({dataDir:dir,port:14363,webDir:resolve('dist/web')}),origin=await app.listen({host:'127.0.0.1',port:14363});
  const render=createRenderer(origin),signal=new AbortController().signal,doc=flipbookFixture(),second=structuredClone(doc);
  (doc.layers[0] as any).position=[.7,0,.7];(second.layers[0] as any).position=[.7,0,.7];(second.layers[0] as any).flipbook.fps=6;
  const camera={position:[0,-7,.7] as [number,number,number],target:[0,0,.7] as [number,number,number],fov:39};
  const snapshot:CompositionSnapshot={compositionVersion:1,input:{duration:1.5,camera,referenceGeometry:false,instances:[
    {id:'left',projectId:'one',revision:1,start:0,position:[-1.4,0,0],yawRadians:0,scale:.4},
    {id:'right',projectId:'one',revision:2,start:.5,position:[1.4,0,0],yawRadians:Math.PI,scale:.6}]},
    sources:[{projectId:'one',revision:1,document:doc,snapshotSha256:hash(canonical(doc))},{projectId:'one',revision:2,document:second,snapshotSha256:hash(canonical(second))}]};
  const original=canonical(snapshot),cam=new PerspectiveCamera(39,960/640,.05,100);cam.up.set(0,0,1);cam.position.set(...camera.position);cam.lookAt(...camera.target);cam.updateMatrixWorld();
  const project=(p:number[])=>{const v=new Vector3(...p).project(cam);return [Math.round((v.x+1)*480),Math.round((1-v.y)*320)];};
  const left=project([-1.12,0,.28]),right=project([.98,0,.42]);
  const pixel=(b:Buffer,p:number[])=>Array.from(b.subarray((p[1]*960+p[0])*3,(p[1]*960+p[0])*3+3));
  const near=(a:number[],b:number[],tol=4)=>assert(a.every((v,i)=>Math.abs(v-b[i])<=tol),`${a} != ${b}`);
  const report:any={passed:false,nativeVerified:false,sourceHashes:snapshot.sources.map(s=>s.snapshotSha256)};
  try{
    for(const time of [.4,1]){
      const result=await render(doc,{composition:snapshot,time,camera,signal}),path=join(out,`t-${time}.png`);await writeFile(path,result.files[0].data);const pixels=await decode(path);
      near(pixel(pixels,left),atlasColors[time===1?3:0]);near(pixel(pixels,right),time===1?atlasColors[1]:[16,24,33]);
      if(time===1){report.metadata=result.metadata;validateOperationOutput('jobs.get',{id:'fixture',jobId:'fixture',projectId:'one',revision:1,sourceProjectIds:['one'],actorId:'owner',type:'preview.compose',status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),artifacts:[],metadata:result.metadata});}
    }
    const video=await render(doc,{composition:snapshot,format:'webm',time:1,camera,signal}),path=join(out,'preview.webm');await writeFile(path,video.files[0].data);
    const pixels=await decode(path,30);near(pixel(pixels,left),atlasColors[3],12);near(pixel(pixels,right),atlasColors[1],12);
    const info=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,r_frame_rate','-of','json',path],{windowsHide:true})).stdout);assert.equal(info.streams[0].nb_read_frames,'45');assert.equal(info.streams[0].r_frame_rate,'30/1');
    const legacy=flipbookFixture(false),identity:CompositionSnapshot={compositionVersion:1,input:{duration:legacy.duration,instances:[{id:'identity',projectId:'legacy',revision:1,start:0,position:[0,0,0],yawRadians:0}]},sources:[{projectId:'legacy',revision:1,document:legacy,snapshotSha256:hash(canonical(legacy))}]};
    const a=await render(legacy,{time:.75,signal}),b=await render(legacy,{time:.75,composition:identity,signal});assert.deepEqual(a.files[0].data,b.files[0].data);report.identitySha256=hash(a.files[0].data);
    assert.equal(canonical(snapshot),original);report.passed=true;
  }catch(error){report.error=String(error);throw error;}finally{await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
