import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {durationAudioFixture} from './fixtures/duration-audio.js';
import {mixAudio,readPcmWav} from '../packages/core/src/audio.js';

const run=promisify(execFile),ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
test('DUR audio UI/WebMCP loops one source for three periods, stops mid-period and exports repeated PCM/Opus',{timeout:180000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-duration-audio-browser-')),out=resolve('output/playwright/duration-audio');await mkdir(out,{recursive:true});
  const port=14376,origin=`http://127.0.0.1:${port}`,app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});await app.listen({host:'127.0.0.1',port});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors:string[]=[],report:any={adapterFixture:true,realHostDiscovery:false};page.on('pageerror',e=>errors.push(e.message));
  const owner=(operation:string,input:Record<string,unknown>={})=>ok(app.studio.dispatch('owner',{operation,input,idempotencyKey:randomUUID()}));
  const invoke=(name:string,args:object={})=>page.evaluate(async({name,args})=>(window as any).__durationAudioTools.get(`studio.${name}`).execute(args),{name,args});
  try{
    const {document:source,wav}=durationAudioFixture(),initial=structuredClone(source);delete initial.audioAssets;delete initial.audioClips;initial.schemaVersion=13;
    let p=owner('projects.import',{document:initial});const other=owner('projects.create',{name:'Audio stop target',preset:'empty'});
    await page.addInitScript(()=>{
      const registry=new Map();(window as any).__durationAudioTools=registry;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){registry.set(t.name,t);},unregisterTool(n:string){registry.delete(n);}}});
      const probe={context:null as AudioContext|null,sources:[] as {active:boolean;startedAt:number;duration:number;loop:boolean}[],maxActive:0};(window as any).__durationAudioProbe=probe;
      const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(o?:AudioContextOptions){super(o);probe.context=this;}createBufferSource(){const s=super.createBufferSource(),item={active:false,startedAt:0,duration:0,loop:false};probe.sources.push(item);const start=s.start.bind(s),stop=s.stop.bind(s);s.start=(when=0,offset=0,duration?:number)=>{start(when,offset,duration);item.active=true;item.startedAt=this.currentTime;item.duration=s.buffer!.duration;item.loop=s.loop;probe.maxActive=Math.max(probe.maxActive,probe.sources.filter(x=>x.active).length);};s.stop=(when=0)=>{stop(when);item.active=false;};s.addEventListener('ended',()=>item.active=false);return s;}};
    });
    await page.goto(origin);await page.getByText('rewizja 1',{exact:true}).waitFor();await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(p.id);await page.getByRole('heading',{name:source.name,exact:true}).waitFor();await page.getByRole('button',{name:'Stop',exact:true}).click();
    await page.getByLabel('Plik audio',{exact:true}).setInputFiles({name:'technical-tone.wav',mimeType:'audio/wav',buffer:Buffer.from(wav)});await page.getByRole('button',{name:'Dodaj klip',exact:true}).click();
    await page.getByRole('button',{name:'Zapisz',exact:true}).click();await page.waitForFunction(()=>!document.body.innerText.includes('Niezapisane zmiany'));p=owner('projects.inspect',{projectId:p.id});assert.equal(p.document.schemaVersion,15);assert.equal(p.document.audioClips.length,1);
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const {viewSessionId}=ok(await invoke('connection.inspect'));const tool=(name:string,input:object,key=randomUUID())=>invoke(name,{viewSessionId,input,...(['jobs.get','projects.inspect'].includes(name)?{}:{idempotencyKey:key})});
    p=ok(await tool('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.remove',clipId:p.document.audioClips[0].id},...source.audioClips!.map(clip=>({type:'audio.add',clip}))]}));
    // Asset content identity is preserved despite the UI import's new filename.
    assert.deepEqual(p.document.layers,source.layers);const view=ok(await invoke('view.inspect',{viewSessionId}));ok(await invoke('view.open',{viewSessionId,projectId:p.id,expectedViewRevision:view.viewRevision}));
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();
    await page.waitForFunction(()=>{const p=(window as any).__durationAudioProbe,s=p.sources.find((s:any)=>s.active);return s&&p.context.currentTime-s.startedAt>=4.85;});
    const playback=await page.evaluate(()=>{const p=(window as any).__durationAudioProbe;return{maxActive:p.maxActive,active:p.sources.filter((s:any)=>s.active).length,period:p.sources.find((s:any)=>s.active)?.duration,loop:p.sources.find((s:any)=>s.active)?.loop};});assert.deepEqual(playback,{maxActive:1,active:1,period:1.6,loop:true});report.playback=playback;
    const playing=ok(await invoke('view.inspect',{viewSessionId}));ok(await invoke('view.set',{viewSessionId,projectId:p.id,expectedRevision:p.revision,expectedViewRevision:playing.viewRevision,time:.8,playing:true}));await page.getByRole('button',{name:'Zatrzymaj',exact:true}).click();
    await page.waitForFunction(()=>(window as any).__durationAudioProbe.sources.every((s:any)=>!s.active));
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForFunction(()=>(window as any).__durationAudioProbe.sources.every((s:any)=>!s.active));
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(other.id);await page.getByRole('heading',{name:other.document.name,exact:true}).waitFor();await page.waitForFunction(()=>(window as any).__durationAudioProbe.sources.every((s:any)=>!s.active));report.pauseStopAndProjectSwitch=true;
    const queued=ok(await tool('preview.request',{projectId:p.id,revision:p.revision,format:'webm',cycles:3}));await app.studio.drainJobs();const job=ok(await tool('jobs.get',{jobId:queued.id}));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
    for(const artifact of job.artifacts){const chunks:Buffer[]=[];let offset=0;for(;;){const part=ok(await invoke('artifacts.read',{viewSessionId,artifactId:artifact.id,offset,length:65536}));const bytes=Buffer.from(part.base64,'base64');assert.equal(hash(bytes),part.chunkSha256);chunks.push(bytes);if(part.nextOffset===null)break;offset=part.nextOffset;}const bytes=Buffer.concat(chunks);assert.equal(hash(bytes),artifact.sha256);await writeFile(join(out,artifact.fileName),bytes);}
    const repeated=readPcmWav(await readFile(join(out,'audio-mix.wav'))),one=mixAudio(p.document);assert.equal(repeated.frames,230400);for(let i=0;i<3;i++)assert.equal(hash(repeated.pcm.slice(i*one.pcm.length,(i+1)*one.pcm.length)),hash(one.pcm));
    await run('ffmpeg',['-v','error','-y','-i',join(out,'preview.webm'),'-map','0:a:0','-acodec','pcm_s16le','-ar','48000',join(out,'decoded.wav')],{windowsHide:true});const decoded=readPcmWav(await readFile(join(out,'decoded.wav'))),dv=new DataView(decoded.pcm.buffer,decoded.pcm.byteOffset,decoded.pcm.byteLength);
    const energy=(start:number,length:number)=>{let sum=0,count=0;for(let i=Math.round(start*48000);i<Math.round((start+length)*48000);i++){sum+=(dv.getInt16(i*4,true)/32768)**2;count++;}return Math.sqrt(sum/count);};
    report.opusPeriods=[0,1,2].map(i=>({active:energy(i*1.6+.25,.1),silence:energy(i*1.6+.7,.1)}));for(const e of report.opusPeriods){assert(e.active>.01);assert(e.silence<.002);}assert.equal(decoded.frames,230400);report.sourceGeometryUnchanged=canonical(p.document.layers)===canonical(initial.layers);
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).waitFor();assert.equal((await invoke('connection.inspect')).error.code,'WEBMCP_NOT_CONNECTED');assert.deepEqual(errors,[]);report.passed=true;
  }catch(e){report.failure=String(e);await writeFile(join(out,'failure.html'),await page.content());throw e;}
  finally{report.errors=errors;await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
