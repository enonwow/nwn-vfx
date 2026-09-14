import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { chromium } from 'playwright';
import { writeHak, readHak, readTga } from '../../packages/nwn-format/src/binary.js';
import { makeTexture, textureInfo, readTxi } from '../../packages/nwn-format/src/textures.js';
import { encodePngRgba8 } from '../../packages/core/src/textures.js';
import { compileProbe, interpolateFrames, pointAt, profilePixels, type ProbeTrail } from './geometry.js';
import { readProbeMdl, writeProbeMdl } from './format.js';

const output=resolve('output/trail-feasibility'),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
await mkdir(join(output,'frames'),{recursive:true});
// Explicitly authored smooth test paths. This is fixture generation, not an
// automatic smoothing rule in a public operation or a reading of concept art.
let trails:ProbeTrail[]=Array.from({length:6},(_,index)=>{
  const k=index%3,dissolve=index>=3,start=dissolve?1.94+k*.12:.12+k*.12,journey=dissolve?1.03-k*.025:.95;
  return {name:`thread_${index}`,start,width:.018,tailLifetime:dissolve?.72-k*.04:.48,maxSegmentLength:.05,color:'#ffca73',
    path:Array.from({length:48},(_,i)=>{const f=i/47;return {time:f*journey,position:[-.3+k*.28+.12*Math.sin(f*Math.PI*(2.1+k*.3)+k),-.12+k*.1+.07*Math.sin(f*Math.PI*2+k),.06+f*(2.49-k*.15)]};})};
});
let inputSource='six independently authored paths, 48 explicit anchors each';
if(process.argv[2]) {
  const input=await readFile(resolve(process.argv[2])),prepared=JSON.parse(input.toString());
  assert.equal(prepared.kind,'tlc-trail-preparation');assert.equal(prepared.trails.length,3);
  const dissolve=prepared.trails.map((trail:any,index:number)=>({name:`dissolve_${index}`,start:trail.start,path:trail.path,width:.018,tailLifetime:trail.tailLifetime,maxSegmentLength:.05,color:'#ffca73'}));
  const invocation=dissolve.map((trail:ProbeTrail,index:number)=>({...trail,name:`invoke_${index}`,start:.12+index*.12,tailLifetime:.48}));
  trails=[...invocation,...dissolve];inputSource=`isolated copy of consumer paths SHA256 ${sha(input)}; three shifted copies used ONLY for six-layer cost stress, not approved artwork`;
}
const report:any={status:'running',kind:'isolated-format-feasibility-not-a-studio-release',studioVersion:'0.8.0',nativeVerified:false,
  externalCompiler:{status:'not_run'},publicOperationsVerified:false,artisticAcceptance:'pending',input:inputSource,length:4,hz:60};
try {
  const t=performance.now(),compiled=trails.map(trail=>compileProbe(trail)),mdl=writeProbeMdl(compiled),builtAt=performance.now();
  const reconstructed=readProbeMdl(mdl),readAt=performance.now();
  for(let i=0;i<compiled.length;i++) {
    assert.deepEqual(reconstructed[i].frames,compiled[i].frames);assert.deepEqual(reconstructed[i].base,compiled[i].base);assert.deepEqual(reconstructed[i].faces,compiled[i].faces);
  }
  report.cost={logicalLayers:6,nodes:7,animationNodes:7,segments:compiled.map(m=>m.sections.length-1),vertices:compiled.map(m=>m.base.vertices.length),
    vertexSamples:compiled.reduce((n,m)=>n+m.frames.length*m.base.vertices.length,0),uvSamples:compiled.reduce((n,m)=>n+m.frames.length*m.base.uv.length,0),
    frameSets:compiled.map(m=>m.frames.length),buildMs:builtAt-t,readbackMs:readAt-builtAt};
  const texture=profilePixels(),tga=makeTexture(texture),txi=new TextEncoder().encode(textureInfo('additive'));
  assert.deepEqual(readTga(tga).rgba,texture.rgba);assert.equal(readTxi(txi).blending,'additive');
  const resources=[{name:'trail_probe.mdl',data:mdl},{name:'trail_profile.tga',data:tga},{name:'trail_profile.txi',data:txi}];
  const hak=writeHak(resources),unzipped=readHak(hak);for(const resource of resources)assert.deepEqual(unzipped.find(f=>f.name===resource.name)!.data,resource.data);
  const zip=zipSync(Object.fromEntries([...resources,{name:'trail_probe.hak',data:hak}].map(f=>[f.name,f.data])));
  report.cost.mdlBytes=mdl.length;report.cost.hakBytes=hak.length;report.cost.zipBytes=zip.length;
  for(const resource of [...resources,{name:'trail_probe.hak',data:hak},{name:'probe.zip',data:zip},{name:'profile.png',data:encodePngRgba8(texture)}])await writeFile(join(output,resource.name),resource.data);
  await writeFile(join(output,'input.json'),JSON.stringify({status:'probe-fixture-not-public-schema',trails},null,2));
  report.resources=[...resources,{name:'trail_probe.hak',data:hak},{name:'probe.zip',data:zip}].map(r=>({name:r.name,bytes:r.data.length,sha256:sha(r.data)}));

  let maxHeadChordError=0,maxFrontOvershootZ=0,maxAuthoredFrontDeviationZ=0;
  for(let i=0;i<trails.length;i++) {
    const source=trails[i],mesh=reconstructed[i];
    for(let tick=0;tick<=4*240;tick++) {
      const time=tick/240,frame=interpolateFrames(mesh,time),head=pointAt(source.path,time-source.start);
      const a=Math.floor(time*60)/60,b=Math.min(4,a+1/60),p=pointAt(source.path,a-source.start),q=pointAt(source.path,b-source.start),fraction=(time-a)*60;
      const chord=p.map((v,k)=>v+(q[k]-v)*fraction);maxHeadChordError=Math.max(maxHeadChordError,Math.hypot(...chord.map((v,k)=>v-head[k])));
      for(let section=0;section<frame.vertices.length/4;section++) {
        const [left,right]=frame.vertices.slice(section*4,section*4+2),width=Math.hypot(...left.map((v,k)=>v-right[k]));
        if(width>1e-6) {
          // Compare with the SAME sampled/interpolated head used by animmesh,
          // while separately reporting deviation from the authored polyline.
          maxFrontOvershootZ=Math.max(maxFrontOvershootZ,(left[2]+right[2])/2-chord[2]);
          maxAuthoredFrontDeviationZ=Math.max(maxAuthoredFrontDeviationZ,(left[2]+right[2])/2-head[2]);
          assert(time>=source.start,'Layer visible before authored start');
        }
        if(time===0||time===4)assert(width<1e-12,'Boundary frame must have no trail area');
      }
    }
  }
  assert(maxFrontOvershootZ<.00001,`Visible front ahead of head by ${maxFrontOvershootZ}m`);
  report.temporal={checksHz:240,maxHeadChordErrorMetres:maxHeadChordError,maxFrontOvershootZMetres:maxFrontOvershootZ,
    maxAuthoredFrontDeviationZMetres:maxAuthoredFrontDeviationZ,edgeContinuity:'shared indexed cross sections; no independent segment endpoints',emptyBoundaryGeometry:true};

  const bundle=await build({entryPoints:[resolve('scripts/trail-feasibility/browser.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  const data=JSON.stringify({meshes:reconstructed,texture:{...texture,rgba:Array.from(texture.rgba)}});
  const server=createServer((request,response)=>{
    if(request.url==='/app.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].contents);}
    else if(request.url==='/data'){response.setHeader('Content-Type','application/json');response.end(data);}
    else if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Isolated MDL readback probe</title><style>body{margin:0}canvas{display:block}</style><canvas></canvas><script type="module" src="/app.js"></script>');}
    else{response.statusCode=404;response.end();}
  });
  await new Promise<void>(res=>server.listen(0,'127.0.0.1',res));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{})});
    const page=await browser.newPage({viewport:{width:960,height:640}}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as any).port}/`);await page.waitForFunction(()=>(window as any).probeReady,{},{timeout:30000});
    const pngs=new Map<number,Buffer>();
    for(let frame=0;frame<120;frame++) {
      const url=await page.evaluate((time:number)=>(window as any).renderProbe(time),frame/30),bytes=Buffer.from(url.split(',')[1],'base64');
      await writeFile(join(output,'frames',`${String(frame).padStart(4,'0')}.png`),bytes);
      if([0,15,30,45,60,71,80,86,92,102,117,119].includes(frame))pngs.set(frame,bytes);
    }
    assert.deepEqual(errors,[]);assert.equal(sha(pngs.get(0)!),sha(pngs.get(119)!),'Final raster must be completely empty');
    assert.notEqual(sha(pngs.get(71)!),sha(pngs.get(0)!));
    const selected=[0,15,30,45,60,71,80,86,92,102,117,119];
    const execute=promisify(execFile);
    await execute('ffmpeg',['-v','error','-y','-framerate','30','-i',join(output,'frames','%04d.png'),'-c:v','libvpx-vp9','-crf','24','-b:v','0','-pix_fmt','yuv420p',join(output,'preview.webm')],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
    await execute('ffmpeg',['-v','error','-y','-i',join(output,'preview.webm'),'-vf',"select='eq(n,0)+eq(n,15)+eq(n,30)+eq(n,45)+eq(n,60)+eq(n,71)+eq(n,80)+eq(n,86)+eq(n,92)+eq(n,102)+eq(n,117)+eq(n,119)',scale=480:320,tile=3x4",'-frames:v','1',join(output,'contact.png')],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
    report.render={source:'reconstructed serialized animverts/animtverts and decoded TGA',frames:120,width:960,height:640,firstAndLastPngIdentical:true,
      helperGeometry:false,headSpriteImplemented:false,selectedFrames:selected};
  } finally {await browser?.close();await new Promise<void>((res,rej)=>server.close(error=>error?rej(error):res()));}
  report.status='local-format-and-render-probe-passed';
} catch(error) {report.status='failed';report.error=error instanceof Error?error.stack:String(error);throw error;}
finally {await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
