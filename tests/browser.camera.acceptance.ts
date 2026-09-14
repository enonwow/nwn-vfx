import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { canonical } from '../apps/service/src/store.js';
import { DEFAULT_PREVIEW_CAMERA } from '../packages/core/src/camera.js';
import { makeMeshLayer, type MeshLayer } from '../packages/core/src/model.js';

const run=promisify(execFile),port=14348,origin=`http://127.0.0.1:${port}`;
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const camera={position:[7,-11,6],target:[0,0,2.6],fov:45};
const marker=(id:string,z:number,color:string):MeshLayer=>({...makeMeshLayer(id,id),duration:1.2,position:[0,0,z],color,
  geometry:{kind:'box',dimensions:[.35,.35,.18]}});
async function rgb(path:string,frame?:number):Promise<Buffer> {
  return (await run('ffmpeg',['-v','error','-i',path,...(frame===undefined?[]:['-vf',`select=eq(n\\,${frame})`]),
    '-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:3*1024*1024,timeout:30_000})).stdout;
}
function magenta(bytes:Buffer) {
  const pixels:number[][]=[];
  for(let i=0;i<bytes.length;i+=3)if(bytes[i]>180 && bytes[i+2]>180 && bytes[i+1]<80)pixels.push([(i/3)%960,Math.floor(i/3/960)]);
  return {count:pixels.length,minY:Math.min(...pixels.map(p=>p[1])),maxY:Math.max(...pixels.map(p=>p[1]))};
}

test('explicit camera frames 5.2m mesh and 3m wave in real PNG/full WebM, preserves defaults and UI opt-in', {timeout:180_000},async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'nwn-vfx-camera-browser-')),output=resolve('output/playwright/camera');
  await mkdir(output,{recursive:true});
  const browsers=new Set<Browser>(),pageErrors:string[]=[],report:Record<string,any>={passed:false,nativeVerified:false,camera};
  const launch=async(options:Parameters<typeof chromium.launch>[0])=>{
    assert(options?.headless); if(process.platform==='win32')assert.equal(options?.channel,'chromium');
    const browser=await chromium.launch(options);browsers.add(browser);browser.on('disconnected',()=>browsers.delete(browser));return browser;
  };
  const app=await createApp({dataDir,port,webDir:resolve('dist/web'),render:createRenderer(origin,{launch})});
  const headers={host:`127.0.0.1:${port}`,authorization:`Bearer ${app.studio.config.ownerToken}`};
  const call=async(operation:string,input:object)=>{
    const response=(await app.inject({method:'POST',url:'/api/commands',headers,payload:{operation,input,idempotencyKey:randomUUID()}})).json();
    assert.notEqual(response.status,'failed',JSON.stringify(response.error));return response.data;
  };
  try {
    await app.listen({host:'127.0.0.1',port});
    let project=await call('projects.create',{preset:'empty',name:'Camera high VFX acceptance'});
    const blade:MeshLayer={...makeMeshLayer('blade','High blade'),duration:1.2,color:'#33ff66',position:[0,0,3.75],
      geometry:{kind:'box',dimensions:[.2,.16,2.9]},animation:{alpha:[{time:0,value:0},{time:.2,value:1},{time:1,value:1},{time:1.2,value:0}]}};
    const wave:MeshLayer={...makeMeshLayer('wave','3m wave'),duration:1.2,color:'#ffcc22',position:[0,0,.04],
      geometry:{kind:'ring',innerRadius:2.85,outerRadius:3,segments:64}};
    project=await call('changes.apply',{projectId:project.id,expectedRevision:1,changes:[{type:'layer.remove',layerId:'sparks'},
      {type:'project.set',values:{duration:1.2}},...[blade,marker('tip',2.3,'#00ffff'),marker('pommel',5.2,'#ff00ff'),wave].map(layer=>({type:'layer.add',layer}))]});
    const snapshot=sha(canonical(project.document)); report.projectId=project.id;report.revision=project.revision;report.snapshotSha256=snapshot;
    const requested=[];
    for(const [kind,format,options] of [['png','png',{camera}],['webm','webm',{camera}],['default','png',{}]] as const)
      requested.push({kind,...await call('preview.request',{projectId:project.id,revision:project.revision,time:.4,format,...options})});
    await app.studio.drainJobs(); report.jobs=[];
    for(const expected of requested) {
      const job=await call('jobs.get',{jobId:expected.id}); assert.equal(job.status,'succeeded',JSON.stringify(job.error));
      assert.deepEqual(job.metadata.camera,expected.kind==='default'?DEFAULT_PREVIEW_CAMERA:camera);
      for(const artifact of job.artifacts) {
        const bytes=(await app.inject({url:artifact.downloadUrl,headers})).rawPayload;
        assert.equal(bytes.length,artifact.size);assert.equal(sha(bytes),artifact.sha256);
        await writeFile(join(output,`${expected.kind}-${artifact.name}`),bytes);
        if(artifact.name==='handoff.json') {
          const handoff=JSON.parse(bytes.toString());assert.equal(handoff.snapshotSha256,snapshot);assert.equal(handoff.revision,project.revision);
          assert.deepEqual(handoff.metadata.camera,job.metadata.camera);
        }
      }
      report.jobs.push({kind:expected.kind,id:job.id,revision:job.revision,metadata:job.metadata});
    }
    const png=await rgb(join(output,'png-preview.png')),def=await rgb(join(output,'default-preview.png'));
    const webmPath=join(output,'webm-preview.webm'),video=await rgb(webmPath,12),first=await rgb(webmPath,0);
    const timeline=JSON.parse((await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries',
      'frame=best_effort_timestamp_time:stream=width,height,r_frame_rate:format=duration','-of','json',webmPath],
    {windowsHide:true,maxBuffer:1024*1024,timeout:30_000})).stdout);
    const pts=timeline.frames.map((frame:any)=>Number(frame.best_effort_timestamp_time));
    assert.equal(pts.length,36);assert.equal(Number(timeline.format.duration),1.2);assert.equal(timeline.streams[0].r_frame_rate,'30/1');
    pts.forEach((t:number,i:number)=>assert(Math.abs(t-i/30)<.00051));
    let error=0;for(let i=0;i<png.length;i++)error+=Math.abs(png[i]-video[i]);error/=png.length;assert(error<4);
    const visible=magenta(png),videoVisible=magenta(video),defaultVisible=magenta(def);
    assert(visible.count>30 && visible.minY>20 && visible.maxY<620,'The full high pommel must fit with margin');
    assert(videoVisible.count>30);assert.equal(defaultVisible.count,0,'The legacy camera misses the high pommel');
    assert.notEqual(sha(first),sha(video),'The full video contains authored animation');
    report.video={frameCount:pts.length,pts,duration:1.2,meanAbsoluteError:error};report.pommel={png:visible,webm:videoVisible,default:defaultVisible};

    // Exercise the shipped editor: explicit checkbox captures the orbit camera
    // without creating a document edit. The default path still omits camera.
    const browser=await launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(origin);await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(project.id);
    const toggle=page.getByRole('checkbox',{name:'Kadr z podglądu',exact:true});assert.equal(await toggle.isChecked(),false);
    const view=page.locator('canvas').first(),box=await view.boundingBox();assert(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+110,box.y+box.height/2+30,{steps:10});await page.mouse.up();
    await toggle.check();
    const requestPromise=page.waitForRequest(r=>r.url().endsWith('/api/commands') && r.postDataJSON()?.operation==='preview.request');
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/commands') && r.request().postDataJSON()?.operation==='preview.request');
    await page.getByRole('button',{name:'Zapisz kadr',exact:true}).click();
    const uiRequest=(await requestPromise).postDataJSON();assert(uiRequest.input.camera);assert.notDeepEqual(uiRequest.input.camera.position,DEFAULT_PREVIEW_CAMERA.position);
    const uiAccepted=await (await responsePromise).json();assert.equal(uiAccepted.status,'accepted');
    await app.studio.drainJobs();const uiJob=await call('jobs.get',{jobId:uiAccepted.data.id});
    assert.equal(uiJob.status,'succeeded');assert.deepEqual(uiJob.metadata.camera,uiRequest.input.camera);
    assert.deepEqual((await call('projects.inspect',{projectId:project.id})).document,project.document);
    report.ui={optIn:true,camera:uiRequest.input.camera,documentUnchanged:true};
    await page.screenshot({path:join(output,'editor-camera.png'),fullPage:true});await browser.close();
    assert.deepEqual(pageErrors,[]);assert.equal(browsers.size,0);report.passed=true;
  } catch(error) {report.failure=error instanceof Error?error.stack:String(error);throw error;}
  finally {
    await app.close();await Promise.all([...browsers].map(b=>b.close()));await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
    assert.equal(resolve(dirname(dataDir)),resolve(tmpdir()));assert(basename(dataDir).startsWith('nwn-vfx-camera-browser-'));await rm(dataDir,{recursive:true,force:true});
  }
});
