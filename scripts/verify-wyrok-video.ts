import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {canonical} from '../apps/service/src/store.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {STUDIO_VERSION} from '../packages/core/src/model.js';

// Consumer acceptance only. The application has no Wyrok-specific behavior.
const snapshotPath=resolve(process.argv[2]||'output/particles-tlc-wyrok-r3.json');
const project=JSON.parse(await readFile(snapshotPath,'utf8')).data;
assertDocument(project.document);
const base=resolve('output/video-wyrok-acceptance');await mkdir(base,{recursive:true});
const output=await mkdtemp(join(base,'run-')),port=14339,origin=`http://127.0.0.1:${port}`;
const render=createRenderer(origin),app=await createApp({dataDir:join(output,'instance'),port,webDir:resolve('dist/web'),render});
await app.listen({host:'127.0.0.1',port});
const run=promisify(execFile),ffmpeg=process.env.NWN_VFX_FFMPEG||'ffmpeg';
const hash=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const options={signal:new AbortController().signal,time:0};
try {
  const started=performance.now();
  const rendered=await render(project.document,{...options,format:'webm'});
  const video=join(output,'wyrok-r3.webm');await writeFile(video,rendered.files[0].data);
  const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_streams','-show_format','-of','json',video],{windowsHide:true,maxBuffer:4*1024*1024});
  const probe=JSON.parse(stdout),pts=probe.frames.map((f:any)=>Number(f.best_effort_timestamp_time));
  const expectedFrames=Math.ceil(project.document.duration*30);
  assert.equal(pts.length,expectedFrames);assert.equal(pts[0],0);
  const gaps=pts.slice(1).map((time:number,i:number)=>time-pts[i]);
  assert.ok(gaps.every((gap:number)=>gap>0&&gap<=.035));
  assert.ok(pts.every((time:number,index:number)=>Math.abs(time-index/30)<.001));
  assert.ok(Math.abs(Number(probe.format.duration)-expectedFrames/30)<.002);
  await writeFile(join(output,'ffprobe.json'),JSON.stringify(probe,null,2));
  const frames=[];
  async function raw(path:string){const {stdout}=await run(ffmpeg,['-v','error','-i',path,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:4*1024*1024});return stdout;}
  for(const time of [.60,.84,.86,.94,1.42]){
    const index=Math.round(time*30),frameTime=index/30,label=time.toFixed(2).replace('.','-');
    const png=await render(project.document,{...options,time:frameTime,format:'png'});
    const reference=join(output,`${label}-reference.png`),decoded=join(output,`${label}-video.png`);
    await writeFile(reference,png.files[0].data);
    await run(ffmpeg,['-v','error','-i',video,'-vf',`select=eq(n\\,${index})`,'-frames:v','1',decoded],{windowsHide:true});
    const a=await raw(reference),b=await raw(decoded);assert.equal(a.length,b.length);assert.equal(a.length,960*640*3);
    let total=0,roiTotal=0,roiChannels=0;
    for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);total+=delta;const pixel=Math.floor(i/3),x=pixel%960,y=Math.floor(pixel/960);if(x>=240&&x<720&&y>=30&&y<560){roiTotal+=delta;roiChannels++;}}
    const meanAbsoluteError=total/a.length,regionMeanAbsoluteError=roiTotal/roiChannels;
    assert.ok(meanAbsoluteError<2&&regionMeanAbsoluteError<3,`Encoded frame ${index} differs from its PNG: ${meanAbsoluteError}/${regionMeanAbsoluteError}`);
    assert.ok(Math.abs(pts[index]-time)<=1/30+.001);
    frames.push({nominalTime:time,index,documentTime:frameTime,pts:pts[index],reference,decoded,meanAbsoluteError,regionMeanAbsoluteError,decodedPixelSha256:hash(b)});
    process.stdout.write(`Frame ${index}, PTS ${pts[index]}: MAE ${meanAbsoluteError.toFixed(3)}, ROI ${regionMeanAbsoluteError.toFixed(3)}\n`);
  }
  assert.equal(new Set(frames.map(frame=>frame.decodedPixelSha256)).size,frames.length,'Sampled phases must change');
  const report={passed:true,orderIds:['TLC-WYROK-STUDIO-02','TLC-WYROK-STUDIO-03'],version:STUDIO_VERSION,recordedAt:new Date().toISOString(),sourcePath:snapshotPath,projectId:project.id,revision:project.revision,
    snapshotSha256:hash(canonical(project.document)),layers:project.document.layers.length,video,videoSha256:hash(rendered.files[0].data),metadata:rendered.metadata,
    frameCount:pts.length,maximumGapSeconds:Math.max(...gaps),duration:Number(probe.format.duration),frames,wallSeconds:(performance.now()-started)/1000,nativeVerified:false};
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await writeFile(join(base,'latest.json'),JSON.stringify({output,report:join(output,'report.json')},null,2));
  process.stdout.write(`REPORT ${join(output,'report.json')}\n`);
}finally{await app.close();}
