import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {audioFixture} from './fixtures/audio.js';
import {readPcmWav} from '../packages/core/src/audio.js';

test('audio UI, waveform, numeric/drag edits, drafts, scoped WebMCP and decoded movie follow one timeline',{timeout:180000},async()=>{
  const port=14358,origin=`http://127.0.0.1:${port}`,dir=await mkdtemp(join(tmpdir(),'studio-audio-browser-')),out=resolve('output/audio-acceptance');await mkdir(out,{recursive:true});
  const app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const owner=async(operation:string,input:object)=>{const r=(await app.inject({method:'POST',url:'/api/commands',headers:{host:`127.0.0.1:${port}`,authorization:'Bearer '+app.studio.config.ownerToken},payload:{operation,input,idempotencyKey:randomUUID()}})).json();assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  const report:any={passed:false,nativeVerified:false,webmcp:'controlled registry; separate real host acceptance required'};
  try{
    // Opus removes DC; a real tone is required to measure the decoded movie.
    const f=audioFixture(true);let p=await owner('projects.create',{preset:'empty',name:'Audio browser acceptance'});
    p=await owner('changes.apply',{projectId:p.id,expectedRevision:1,changes:[{type:'project.set',values:{duration:1}}]});
    await app.listen({host:'127.0.0.1',port});const context=await browser.newContext({viewport:{width:1500,height:1100}});
    await context.addInitScript(()=>{const registry=new Map();(window as any).__audioTools=registry;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){registry.set(t.name,t);},unregisterTool(name:string){registry.delete(name);}}});});
    await context.addInitScript(()=>{
      // Observe real browser audio nodes without changing playback or clocks.
      const probe={contexts:[] as AudioContext[],sources:[] as {active:boolean;offset:number;stopped:boolean}[],gains:[] as GainNode[],maxActive:0};(window as any).__audioProbe=probe;
      const NativeContext=window.AudioContext;
      window.AudioContext=class extends NativeContext{
        constructor(options?:AudioContextOptions){super(options);probe.contexts.push(this);}
        createGain(){const gain=super.createGain();probe.gains.push(gain);return gain;}
        createBufferSource(){const source=super.createBufferSource(),item={active:false,offset:0,stopped:false};probe.sources.push(item);
          const start=source.start.bind(source),stop=source.stop.bind(source);
          source.start=(when=0,offset=0,duration?:number)=>{start(when,offset,duration);item.active=true;item.offset=offset;probe.maxActive=Math.max(probe.maxActive,probe.sources.filter(s=>s.active).length);};
          source.stop=(when=0)=>{stop(when);item.active=false;item.stopped=true;};source.addEventListener('ended',()=>{item.active=false;});return source;
        }
      };
    });
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(p.id);await page.getByRole('button',{name:'Stop',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Włącz odsłuch audio',exact:true}).count(),1);
    assert.equal(await page.getByRole('slider',{name:'Głośność odsłuchu',exact:true}).inputValue(),'0.15');
    await page.getByLabel('Plik audio',{exact:true}).setInputFiles({name:f.asset.name,mimeType:'audio/wav',buffer:Buffer.from(f.wav)});
    await page.getByRole('button',{name:'Dodaj klip',exact:true}).click();
    await page.getByRole('spinbutton',{name:'Start klipu',exact:true}).fill('0.4');await page.getByRole('button',{name:'Zastosuj klip',exact:true}).click();
    await page.getByRole('button',{name:'Zapisz',exact:true}).click();await page.waitForFunction(()=>!document.body.innerText.includes('Niezapisane zmiany'));
    p=await owner('projects.inspect',{projectId:p.id});assert.equal(p.document.audioClips[0].start,.4);assert.equal(p.document.audioClips[0].duration,.6);
    const row=await page.locator('.audio-row').boundingBox(),segment=await page.locator('.audio-segment').boundingBox();assert(row&&segment);
    await page.mouse.move(segment.x+segment.width/2,segment.y+segment.height/2);await page.mouse.down();await page.mouse.move(segment.x+segment.width/2-row.width*.2,segment.y+segment.height/2,{steps:6});await page.mouse.up();
    assert.ok(Math.abs(Number(await page.getByRole('spinbutton',{name:'Start klipu',exact:true}).inputValue())-.2)<.003);
    await page.getByRole('spinbutton',{name:'Start klipu',exact:true}).fill('0.4');await page.getByRole('button',{name:'Zastosuj klip',exact:true}).click();
    assert.equal(await page.locator('.audio-row svg').count(),1);await page.screenshot({path:join(out,'audio-timeline.png'),fullPage:true});
    // A second clip reuses the asset; then undo its add through the shared API.
    await page.getByRole('button',{name:'Dodaj klip',exact:true}).click();await page.getByRole('button',{name:'Zapisz',exact:true}).click();
    await page.waitForFunction(()=>!document.body.innerText.includes('Niezapisane zmiany'));p=await owner('projects.inspect',{projectId:p.id});assert.equal(p.document.audioAssets.length,1);assert.equal(p.document.audioClips.length,2);
    const second=p.document.audioClips[1].id;p=await owner('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.remove',clipId:second}]});
    await page.waitForFunction(()=>document.querySelectorAll('.audio-row').length===1);
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const invoke=async(name:string,args:any)=>page.evaluate(async({name,args})=>(window as any).__audioTools.get(name).execute(args),{name,args});
    const connection=await invoke('studio.connection.inspect',{});assert.equal(connection.status,'ok');const viewSessionId=connection.data.viewSessionId;
    const view=async()=>{const r=await invoke('studio.view.inspect',{viewSessionId});assert.equal(r.status,'ok',JSON.stringify(r.error));return r.data;};
    let v=await view();assert.equal(v.audioMonitor.muted,true);assert.equal(v.audioMonitor.unlocked,false);report.toolCount=await page.evaluate(()=>(window as any).__audioTools.size);
    const transport=async(playing:boolean,activeSources:number)=>{
      const deadline=Date.now()+5000;let s=await view();
      while(s.playing!==playing||s.audioMonitor.activeSources!==activeSources){assert.ok(Date.now()<deadline,JSON.stringify({expected:{playing,activeSources},actual:{playing:s.playing,...s.audioMonitor}}));await page.waitForTimeout(25);s=await view();}
      assert.equal(s.audioMonitor.muted,true);return s;
    };
    await page.getByRole('button',{name:'Stop',exact:true}).click();await transport(false,0);
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();await transport(true,1);await page.waitForTimeout(140);
    await page.getByRole('button',{name:'Zatrzymaj',exact:true}).click();const paused=await transport(false,0);await page.waitForTimeout(160);assert.equal((await view()).time,paused.time);
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();await transport(true,1);await page.waitForTimeout(80);
    const beforeSeek=await page.evaluate(()=>(window as any).__audioProbe.sources.length);
    await page.getByRole('slider',{name:'Czas podglądu',exact:true}).press('Home');await transport(true,1);
    assert.ok(await page.evaluate(n=>(window as any).__audioProbe.sources.length>n,beforeSeek));
    assert.ok((await view()).time<.3);
    await page.getByRole('button',{name:'Początek efektu',exact:true}).click();assert.ok((await transport(true,1)).time<.3);
    const loopTimes:number[]=[];for(let i=0;i<70;i++){await page.waitForTimeout(45);const state=await transport(true,1);loopTimes.push(state.time);}
    const wraps=loopTimes.slice(1).filter((t,i)=>t<loopTimes[i]-.5).length;assert.ok(wraps>=3,JSON.stringify(loopTimes));
    // A genuine AudioContext suspension freezes the same clock used by the UI.
    const clockBefore=await page.evaluate(async()=>{const c=(window as any).__audioProbe.contexts[0];await c.suspend();return c.currentTime;});
    await page.waitForTimeout(80);const frozen=(await view()).time;await page.waitForTimeout(160);assert.equal((await view()).time,frozen);
    assert.equal(await page.evaluate(()=>(window as any).__audioProbe.contexts[0].currentTime),clockBefore);
    await page.evaluate(async()=>{await (window as any).__audioProbe.contexts[0].resume();});await page.waitForTimeout(110);assert.notEqual((await view()).time,frozen);await transport(true,1);
    await page.getByRole('button',{name:'Stop',exact:true}).click();assert.equal((await transport(false,0)).time,0);
    await page.getByRole('checkbox',{name:'Zapętl podgląd',exact:true}).uncheck();
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();await transport(true,1);await transport(false,0);const ended=await view();assert.equal(ended.time,1);
    await page.getByRole('button',{name:'Początek efektu',exact:true}).click();assert.equal((await transport(false,0)).time,0);
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();await transport(true,1);await transport(false,0);
    // Play at the natural end starts a fresh cycle without a separate restart.
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();assert.ok((await transport(true,1)).time<.3);await transport(false,0);
    await page.getByRole('button',{name:'Stop',exact:true}).click();await transport(false,0);await page.getByRole('checkbox',{name:'Zapętl podgląd',exact:true}).check();
    const probe=await page.evaluate(()=>{const p=(window as any).__audioProbe;return{maxActive:p.maxActive,active:p.sources.filter((s:any)=>s.active).length,starts:p.sources.length,masterGains:p.gains.map((g:GainNode)=>g.gain.value)};});
    assert.equal(probe.maxActive,1);assert.equal(probe.active,0);assert.deepEqual(probe.masterGains,[0]);report.transport={...probe,wraps,playPauseStopRestartSeek:true,realContextSuspendResume:true};
    const list=await invoke('studio.audio.list',{viewSessionId,input:{projectId:p.id}});assert.equal(list.data.items[0].id,f.asset.id);
    v=await view();
    let r=await invoke('studio.view.set',{viewSessionId,projectId:p.id,expectedRevision:v.revision,expectedViewRevision:v.viewRevision,selectedLayerId:p.document.audioClips[0].id,time:.5,playing:false});assert.equal(r.status,'ok');
    await page.getByRole('spinbutton',{name:'Offset źródła',exact:true}).fill('0.2');v=await view();assert.equal(v.draftDirty,true);assert(v.meshEditorDrafts[p.document.audioClips[0].id].audio);
    const fork=await invoke('studio.projects.fork',{viewSessionId,input:{projectId:p.id,name:'Audio browser fork'},idempotencyKey:randomUUID()});assert.equal(fork.status,'ok');
    r=await invoke('studio.view.open',{viewSessionId,projectId:fork.data.id,expectedViewRevision:v.viewRevision});assert.equal(r.error.code,'DRAFT_CONFLICT');
    await page.getByRole('button',{name:'Odrzuć edycję klipu',exact:true}).click();
    await page.getByRole('button',{name:'Odtwórz',exact:true}).click();await transport(true,1);
    v=await view();r=await invoke('studio.view.open',{viewSessionId,projectId:fork.data.id,expectedViewRevision:v.viewRevision});assert.equal(r.status,'ok');await transport(false,0);assert.equal((await view()).projectId,fork.data.id);
    await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(p.id);await transport(false,0);assert.equal((await view()).projectId,p.id);
    const clipId=p.document.audioClips[0].id;
    p=await owner('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:clipId,field:'gain'}]}]});
    r=await invoke('studio.changes.apply',{viewSessionId,input:{projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.set',clipId,values:{gain:.5}}]},idempotencyKey:randomUUID()});assert.equal(r.error.code,'LOCKED');
    await owner('policy.set',{projectId:p.id,paused:true});r=await invoke('studio.audio.import',{viewSessionId,input:{projectId:p.id,expectedRevision:p.revision,fileName:f.asset.name,dataBase64:f.asset.dataBase64},idempotencyKey:randomUUID()});assert.equal(r.error.code,'AI_PAUSED');
    await owner('policy.set',{projectId:p.id,paused:false});p=await owner('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]});
    r=await invoke('studio.changes.apply',{viewSessionId,input:{projectId:p.id,expectedRevision:1,changes:[{type:'audio.set',clipId,values:{gain:.5}}]},idempotencyKey:randomUUID()});assert.equal(r.error.code,'REVISION_CONFLICT');
    const accepted=await invoke('studio.preview.request',{viewSessionId,input:{projectId:p.id,revision:p.revision,format:'webm'},idempotencyKey:randomUUID()});assert.equal(accepted.status,'accepted');await app.studio.drainJobs();
    const job=await invoke('studio.jobs.get',{viewSessionId,input:{jobId:accepted.data.id}});assert.equal(job.data.status,'succeeded',JSON.stringify(job.data.error));
    for(const a of job.data.artifacts){const bytes=await(app.inject({method:'GET',url:a.downloadUrl,headers:{host:`127.0.0.1:${port}`,authorization:'Bearer '+app.studio.config.ownerToken}})).then(r=>r.rawPayload);await writeFile(join(out,a.name),bytes);}
    const artifact=job.data.artifacts.find((a:any)=>a.name==='audio-mix.wav');const chunk=await invoke('studio.artifacts.read',{viewSessionId,artifactId:artifact.id,offset:0,length:262144});assert.equal(chunk.status,'ok');assert.equal(chunk.data.artifact.sha256,artifact.sha256);
    const pcmPath=join(out,'decoded-video.pcm');await promisify(execFile)('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',join(out,'preview.webm'),'-map','0:a:0','-ar','48000','-ac','2','-f','s16le',pcmPath],{windowsHide:true});
    const decoded=await readFile(pcmPath),dv=new DataView(decoded.buffer,decoded.byteOffset,decoded.byteLength);
    const rms=(from:number,to:number)=>{let sum=0,n=0;for(let i=Math.round(from*48000);i<Math.round(to*48000);i++){sum+=(dv.getInt16(i*4,true)/32768)**2;n++;}return Math.sqrt(sum/n);};
    assert(rms(0,.37)<.0001);assert(rms(.43,.9)>.05);const exact=readPcmWav(await readFile(join(out,'audio-mix.wav')));assert.equal(exact.frames,48000);
    report.movie={frames:decoded.length/4,preClipRms:rms(0,.37),activeRms:rms(.43,.9),codec:'opus',lossy:true};
    // Signal tests run in OfflineAudioContext, so no system audio is emitted.
    const harness=await build({stdin:{contents:`export {audioTimelineBuffer,AudioTimelinePlayer} from './apps/web/src/audio-player.ts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',globalName:'AudioTest',platform:'browser'});
    await page.route(origin+'/audio-test-harness.js',route=>route.fulfill({contentType:'text/javascript',body:harness.outputFiles[0].text}));
    await page.addScriptTag({url:origin+'/audio-test-harness.js'});
    const signal=await page.evaluate(async doc=>{
      const ctx=new OfflineAudioContext(2,144000,48000),buffer=(window as any).AudioTest.audioTimelineBuffer(ctx,doc),source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(ctx.destination);source.start();const rendered=await ctx.startRendering(),ch=rendered.getChannelData(0);let cycles=true,silence=true;
      for(let i=0;i<48000;i++){if(ch[i]!==ch[i+48000]||ch[i]!==ch[i+96000])cycles=false;if(i<19200&&ch[i]!==0)silence=false;}
      return{cycles,silence};
    },f.document);assert.equal(signal.cycles,true);assert.equal(signal.silence,true);report.signal=signal;
    assert.deepEqual(errors,[]);report.passed=true;report.projectId=p.id;report.revision=p.revision;report.jobId=job.data.id;
    await writeFile(join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  }finally{await browser.close();await app.close();assert.equal(dirname(dir),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
