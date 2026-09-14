import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { unzipSync } from 'fflate';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { canonical } from '../apps/service/src/store.js';
import { VIDEO_FPS } from '../apps/service/src/video-encoder.js';
import { makeMeshLayer, STUDIO_VERSION, type MeshLayer } from '../packages/core/src/model.js';
import { readAsciiMdl, vector } from '../packages/nwn-format/src/mdl-reader.js';
import { readbackMesh } from '../packages/nwn-format/src/mesh-readback.js';
import { readHak } from '../packages/nwn-format/src/binary.js';
import { orientationTexture } from './fixtures/rgba-texture.js';

const run=promisify(execFile),port=14344,origin=`http://127.0.0.1:${port}`;
const sha256=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const obj=`# asymmetric textured OBJ, meters, Z up
o artifact_fixture
v -0.65 0 0.2
v 0.7 0 0.2
v 0.15 0 1.65
v -0.45 0.3 0.7
vt 0 0
vt 1 0
vt 0.5 1
vt 0.1 0.8
vt 0.7 0.15
f 1/1 2/2 3/3
f 1/4 3/3 4/5
`;
async function decode(path:string,frame?:number):Promise<Buffer> {
  return (await run(process.env.NWN_VFX_FFMPEG||'ffmpeg',['-v','error','-i',path,
    ...(frame===undefined?[]:['-vf',`select=eq(n\\,${frame})`]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],
  {windowsHide:true,encoding:'buffer',maxBuffer:8*1024*1024,timeout:30_000})).stdout;
}
function coloredPixels(bytes:Buffer) {
  assert.equal(bytes.length,960*640*3);let count=0;
  for(let i=0;i<bytes.length;i+=3) {
    const channels=[bytes[i],bytes[i+1],bytes[i+2]];
    if(Math.max(...channels)>70 && Math.max(...channels)-Math.min(...channels)>30)count++;
  }
  assert.ok(count>100,'The imported textured mesh must be visible, not a blank preview');return count;
}

test('one saved schema-5 OBJ revision produces real PNG, timed WebM and matching MDL/HAK artifacts', {timeout:180_000},async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'nwn-vfx-obj-artifacts-'));
  const output=resolve('output/playwright/obj-artifacts');await mkdir(output,{recursive:true});
  const browsers=new Set<Browser>(),pageErrors:string[]=[],report:Record<string,unknown>={passed:false,nativeVerified:false,port,pageErrors};
  const render=createRenderer(origin,{launch:async options=>{
    assert.equal(options.headless,true);
    if(process.platform==='win32')assert.equal(options.channel,'chromium','Use the qualified console-free Windows Chromium launch');
    const browser=await chromium.launch(options);browsers.add(browser);browser.on('disconnected',()=>browsers.delete(browser));
    const newPage=browser.newPage.bind(browser);
    browser.newPage=async options=>{const page=await newPage(options);page.on('pageerror',error=>pageErrors.push(error.message));return page;};
    return browser;
  }});
  const app=await createApp({dataDir,port,webDir:resolve('dist/web'),render});
  const headers={host:`127.0.0.1:${port}`,authorization:`Bearer ${app.studio.config.ownerToken}`};
  const call=async(operation:string,input:object)=>{
    const response=(await app.inject({method:'POST',url:'/api/commands',headers,payload:{operation,input,idempotencyKey:randomUUID()}})).json();
    assert.notEqual(response.status,'failed',JSON.stringify(response.error));return response;
  };
  try {
    assert.equal(await app.listen({host:'127.0.0.1',port}),origin);
    let project=(await call('projects.create',{preset:'empty',name:'OBJ artifact acceptance'})).data;
    const imported=(await call('assets.import',{projectId:project.id,expectedRevision:project.revision,fileName:'asymmetric-quadrants.png',
      pngBase64:Buffer.from(orientationTexture(32)).toString('base64')})).data;project=imported.project;
    const {geometry:unused,...newLayer}=makeMeshLayer('obj-surface','OBJ surface');
    const authored:Omit<MeshLayer,'geometry'>={...newLayer,duration:1.2,alpha:0,blend:'normal',
      material:{diffuse:'#b8d5ef',selfIllumination:'#000000'},
      animation:{orientation:[{time:0,value:[0,0,1,0]},{time:.4,value:[0,0,1,.6]},{time:1.1,value:[0,0,1,-.8]}],
        alpha:[{time:0,value:0},{time:.2,value:1},{time:.8,value:.6},{time:1.2,value:0}]}};
    const meshImport=(await call('meshes.importObj',{projectId:project.id,expectedRevision:project.revision,fileName:'asymmetric.obj',objText:obj,
      sourceUpAxis:'z',metersPerUnit:1,normalMode:'flat',target:{newLayer:authored},textureAssetId:imported.assetId})).data;project=meshImport.project;
    project=(await call('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:[
      {type:'project.set',values:{duration:1.2}},{type:'layer.remove',layerId:'sparks'},
    ]})).data;
    const saved=(await call('projects.inspect',{projectId:project.id})).data;
    assert.equal(saved.document.schemaVersion,5);assert.equal(saved.document.layers.length,1);
    const layer=saved.document.layers[0] as MeshLayer;assert.equal(layer.geometry.kind,'custom');
    if(layer.geometry.kind!=='custom')assert.fail('Expected saved OBJ custom geometry');
    assert.deepEqual(layer.geometry.vertices,[[-.65,0,.2],[.7,0,.2],[.15,0,1.65],[-.45,.3,.7]]);
    assert.deepEqual(layer.geometry.uvFaces,[[0,1,2],[3,2,4]]);
    const revision=saved.revision,frameIndex=12,time=frameIndex/VIDEO_FPS,modelName='objartifact';
    report.projectId=saved.id;report.revision=revision;report.documentSchemaVersion=5;report.objImport=meshImport.report;
    report.snapshotSha256=sha256(canonical(saved.document));report.textureAssetId=imported.assetId;
    const requests=[
      {kind:'png',operation:'preview.request',input:{projectId:saved.id,revision,format:'png',time}},
      {kind:'webm',operation:'preview.request',input:{projectId:saved.id,revision,format:'webm',time}},
      {kind:'candidate',operation:'candidate.build',input:{projectId:saved.id,revision,modelName}},
    ];
    const jobs=[];
    for(const request of requests) {const result=await call(request.operation,request.input);assert.equal(result.status,'accepted');jobs.push({...request,id:result.data.id});}
    await app.studio.drainJobs();
    const artifacts:Record<string,Map<string,Buffer>>={},artifactReport:unknown[]=[],jobReport:unknown[]=[];
    for(const expected of jobs) {
      const job=(await call('jobs.get',{jobId:expected.id})).data;
      assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.equal(job.revision,revision);assert.equal(job.projectId,saved.id);
      artifacts[expected.kind]=new Map();
      for(const artifact of job.artifacts) {
        const response=await app.inject({url:artifact.downloadUrl,headers});assert.equal(response.statusCode,200);
        const bytes=response.rawPayload;assert.equal(bytes.length,artifact.size);assert.equal(sha256(bytes),artifact.sha256);assert.equal(artifact.hash.value,artifact.sha256);
        assert.equal(basename(artifact.fileName),artifact.fileName);
        const path=join(output,`${expected.kind}-${artifact.fileName}`);await writeFile(path,bytes);
        artifacts[expected.kind].set(artifact.fileName,bytes);artifactReport.push({kind:expected.kind,id:artifact.id,name:artifact.fileName,path,sha256:artifact.sha256,size:artifact.size});
      }
      const handoff=JSON.parse(artifacts[expected.kind].get('handoff.json')!.toString('utf8'));
      assert.equal(handoff.revision,revision);assert.equal(handoff.projectId,saved.id);assert.equal(handoff.snapshotSha256,report.snapshotSha256);
      assert.equal(handoff.nativeVerified,false);assert.equal(handoff.assets[0].id,imported.assetId);
      if(expected.kind!=='candidate') {assert.equal(job.metadata.documentSchemaVersion,5);assert.equal(job.metadata.rendererVersion,STUDIO_VERSION);}
      jobReport.push({kind:expected.kind,id:job.id,status:job.status,revision:job.revision,metadata:job.metadata});
    }
    report.jobs=jobReport;report.artifacts=artifactReport;
    const mdl=artifacts.candidate.get(`${modelName}.mdl`)!,hak=readHak(artifacts.candidate.get(`${modelName}.hak`)!);
    const parsed=readAsciiMdl(mdl),mesh=parsed.nodes.find(node=>node.type==='trimesh')!;
    const readback=readbackMesh(parsed,parsed.animations[0],layer,mesh.name,mesh.properties.parent[0],mesh.properties.bitmap[0],'normal');
    assert.deepEqual(readback.vertices,layer.geometry.vertices);assert.deepEqual(readback.faces,layer.geometry.faces);
    assert.deepEqual(readback.uv,layer.geometry.uv);assert.deepEqual(readback.uvFaces,layer.geometry.uvFaces);
    assert.deepEqual(vector(mesh,'diffuse'),[184/255,213/255,239/255]);assert.deepEqual(vector(mesh,'selfillumcolor'),[0,0,0]);
    assert.deepEqual(Buffer.from(hak.find(file=>file.name===`${modelName}.mdl`)!.data),mdl);
    for(const file of hak)if(artifacts.candidate.has(file.name))assert.deepEqual(Buffer.from(file.data),artifacts.candidate.get(file.name)!);
    const zip=unzipSync(artifacts.candidate.get('candidate.zip')!);
    assert.deepEqual(Buffer.from(zip[`${modelName}.mdl`]),mdl);
    assert.deepEqual(JSON.parse(artifacts.candidate.get('effect-document.json')!.toString()),saved.document);
    report.mdlReadback={vertices:readback.vertices.length,triangles:readback.faces.length,uv:readback.uv.length,uvFaces:readback.uvFaces,
      diffuse:readback.diffuse,selfIllumination:readback.selfIllumination,orientationKeys:readback.orientationKeys,alphaKeys:readback.alphaKeys};
    const pngPath=join(output,'png-preview.png'),webmPath=join(output,'webm-preview.webm');
    const timeline=JSON.parse((await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries',
      'frame=best_effort_timestamp_time:stream=codec_name,r_frame_rate,width,height:format=duration','-of','json',webmPath],
    {windowsHide:true,maxBuffer:8*1024*1024,timeout:30_000})).stdout);
    const times=timeline.frames.map((frame:any)=>Number(frame.best_effort_timestamp_time));
    assert.equal(times.length,36);assert.equal(Number(timeline.format.duration),1.2);assert.equal(timeline.streams[0].codec_name,'vp9');
    assert.equal(timeline.streams[0].r_frame_rate,'30/1');assert.deepEqual([timeline.streams[0].width,timeline.streams[0].height],[960,640]);
    times.forEach((pts:number,index:number)=>assert.ok(Math.abs(pts-index/VIDEO_FPS)<=.00051));
    const reference=await decode(pngPath),video=await decode(webmPath,frameIndex),late=await decode(webmPath,30);
    const colored={png:coloredPixels(reference),webm:coloredPixels(video),late:coloredPixels(late)};
    let error=0;for(let index=0;index<video.length;index++)error+=Math.abs(video[index]-reference[index]);
    const meanAbsoluteError=error/video.length;assert.ok(meanAbsoluteError<4,'Same-phase WebM must agree with PNG within codec loss');
    assert.notEqual(sha256(video),sha256(late),'The video must contain different authored orientation/alpha phases');
    report.video={frameCount:times.length,times,duration:1.2,frameIndex,meanAbsoluteError,colored};
    assert.equal(browsers.size,0,'Completed render jobs must close their real Chromium processes');assert.deepEqual(pageErrors,[]);
    report.passed=true;
  } catch(error) {report.failure=error instanceof Error?error.message:String(error);throw error;}
  finally {
    await app.close();await Promise.all([...browsers].map(browser=>browser.close()));
    report.completedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
    const safe=resolve(dataDir);assert.equal(dirname(safe),resolve(tmpdir()));assert.ok(basename(safe).startsWith('nwn-vfx-obj-artifacts-'));
    await rm(safe,{recursive:true,force:true});
  }
});
