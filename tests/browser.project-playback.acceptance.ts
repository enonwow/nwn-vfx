import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../apps/service/src/app.js';
import {audioFixture} from './fixtures/audio.js';

test('switching a playing 3s project after 2s to a 1s audio project resets time before Play',{timeout:60000},async()=>{
  const port=14359,origin=`http://127.0.0.1:${port}`,dir=await mkdtemp(join(tmpdir(),'studio-project-clock-'));
  const out=resolve('output/project-playback-acceptance');await mkdir(out,{recursive:true});
  const webDir=resolve(process.env.STUDIO_PLAYBACK_WEB_DIR||'dist/web');
  const app=await createApp({dataDir:dir,port,webDir});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const owner=async(operation:string,input:object)=>{
    const r=(await app.inject({method:'POST',url:'/api/commands',headers:{host:`127.0.0.1:${port}`,authorization:'Bearer '+app.studio.config.ownerToken},payload:{operation,input,idempotencyKey:randomUUID()}})).json();
    assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;
  };
  try{
    const short=await owner('projects.import',{document:audioFixture(true).document});
    await app.listen({host:'127.0.0.1',port});const context=await browser.newContext({viewport:{width:1500,height:1000}});
    await context.addInitScript(()=>{
      const registry=new Map();(window as any).__clockTools=registry;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){registry.set(t.name,t);},unregisterTool(name:string){registry.delete(name);}}});
      // Record scheduled callbacks to exercise a frame already belonging to the
      // outgoing project, including delivery after the new React state commits.
      const nativeRaf=requestAnimationFrame.bind(window),callbacks=new Map<number,FrameRequestCallback>();
      (window as any).__clockFrames=callbacks;
      window.requestAnimationFrame=cb=>{const id=nativeRaf(t=>{callbacks.delete(id);cb(t);});callbacks.set(id,cb);return id;};
      const nativeCancel=cancelAnimationFrame.bind(window);window.cancelAnimationFrame=id=>{callbacks.delete(id);nativeCancel(id);};
    });
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(short.id);
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const call=async(name:string,args:any)=>page.evaluate(async({name,args})=>(window as any).__clockTools.get(name).execute(args),{name,args});
    const connection=await call('studio.connection.inspect',{});assert.equal(connection.status,'ok');const viewSessionId=connection.data.viewSessionId;
    const view=async()=>{const r=await call('studio.view.inspect',{viewSessionId});assert.equal(r.status,'ok');return r.data;};
    const wait=async(predicate:(s:any)=>boolean)=>{const deadline=Date.now()+5000;let s=await view();while(!predicate(s)){assert.ok(Date.now()<deadline,JSON.stringify({project:s.projectId,time:s.time,playing:s.playing,monitor:s.audioMonitor}));await page.waitForTimeout(20);s=await view();}return s;};
    const created=await call('studio.projects.create',{viewSessionId,input:{preset:'vial',name:'Clock source 3s'},idempotencyKey:randomUUID()});assert.equal(created.status,'ok');const long=created.data;
    const initial=await view();assert.equal((await call('studio.view.open',{viewSessionId,projectId:long.id,expectedViewRevision:initial.viewRevision})).status,'ok');
    await page.getByRole('combobox',{name:'Projekt',exact:true}).locator(`option[value="${long.id}"]`).waitFor({state:'attached'});
    const observations=[];
    for(const unlocked of [false,true]){
      await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(long.id);
      await wait(s=>s.projectId===long.id&&s.playing);
      if(unlocked){await page.getByRole('button',{name:'Zatrzymaj',exact:true}).click();await page.getByRole('button',{name:'Odtwórz',exact:true}).click();}
      const before=await wait(s=>s.projectId===long.id&&s.playing&&s.time>2&&s.time<2.7);
      await page.evaluate(shortId=>{
        const outgoing=[...(window as any).__clockFrames.values()];(window as any).__clockRace={delivered:false,count:outgoing.length};
        // DOM commit precedes the passive effect that configures the new audio
        // clock. Deliver an outgoing frame at precisely that browser boundary.
        const observer=new MutationObserver(()=>{
          const selected=(document.querySelector('select[aria-label="Projekt"]') as HTMLSelectElement)?.value;
          const duration=(document.querySelector('input[aria-label="Czas efektu"]') as HTMLInputElement)?.value;
          if(selected===shortId&&duration==='1'){
            observer.disconnect();(window as any).__clockRace.delivered=true;
            for(const callback of outgoing)callback(performance.now());
          }
        });observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
      },short.id);
      await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(short.id);
      const switched=await wait(s=>s.projectId===short.id&&!s.playing);
      await page.waitForTimeout(80);const stable=await view();
      const race=await page.evaluate(()=>(window as any).__clockRace);assert.equal(race.delivered,true);assert.ok(race.count>0);
      assert.equal(switched.time,0);assert.equal(stable.time,0);assert.equal(stable.playing,false);assert.equal(stable.audioMonitor.muted,true);assert.equal(stable.audioMonitor.activeSources,0);assert.equal(stable.audioMonitor.unlocked,unlocked);
      assert.equal(await page.getByRole('slider',{name:'Czas podglądu',exact:true}).inputValue(),'0');assert.equal(await page.locator('.transport output').innerText(),'0.00 s');
      await page.getByRole('button',{name:'Odtwórz',exact:true}).click();const started=await wait(s=>s.playing&&s.audioMonitor.activeSources===1);
      assert.ok(started.time>=0&&started.time<.3,`Play did not start from zero: ${started.time}`);assert.equal(started.audioMonitor.muted,true);
      await page.getByRole('button',{name:'Stop',exact:true}).click();await wait(s=>!s.playing&&s.time===0&&s.audioMonitor.activeSources===0);
      observations.push({unlocked,before:before.time,switched:switched.time,stable:stable.time,playFrom:started.time,race});
    }
    assert.deepEqual(errors,[]);await writeFile(join(out,'report.json'),JSON.stringify({passed:true,webDir,observations,ownFixturesOnly:true,nativeVerified:false},null,2)+'\n');
  }finally{await browser.close();await app.close();assert.equal(dirname(dir),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
