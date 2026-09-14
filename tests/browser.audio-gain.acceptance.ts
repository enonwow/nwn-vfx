import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {audioFixture} from './fixtures/audio.js';
import {readPcmWav} from '../packages/core/src/audio.js';

test('clip dB controls preserve drafts, enforce bounds/locks, save/undo gain and render amplified PCM and clipping warnings',{timeout:90000},async()=>{
  const port=14360,origin=`http://127.0.0.1:${port}`,dir=await mkdtemp(join(tmpdir(),'studio-gain-browser-')),out=resolve('output/audio-db-acceptance');await mkdir(out,{recursive:true});
  const app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const owner=async(operation:string,input:object)=>{const r=(await app.inject({method:'POST',url:'/api/commands',headers:{host:`127.0.0.1:${port}`,authorization:'Bearer '+app.studio.config.ownerToken},payload:{operation,input,idempotencyKey:randomUUID()}})).json();assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r;};
  try{
    const f=audioFixture(true);let p=(await owner('projects.import',{document:f.document})).data;
    await app.listen({host:'127.0.0.1',port});const context=await browser.newContext({viewport:{width:1500,height:1100}});
    await context.addInitScript(()=>{const registry=new Map();(window as any).__gainTools=registry;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){registry.set(t.name,t);},unregisterTool(name:string){registry.delete(name);}}});});
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    for(const gain of [0,1.5,3,1.234567890123456,1e-8]){
      const legacy=(await owner('projects.import',{document:{...f.document,name:'Legacy gain '+gain,audioClips:[{...f.clip,gain}]}})).data;await page.reload();await page.locator('.empty-overlay').waitFor({state:'hidden'});
      await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(legacy.id);await page.getByRole('heading',{name:'Legacy gain '+gain,exact:true}).waitFor();
      await page.getByRole('button',{name:'Zaznacz audio: Bite fixture',exact:true}).click();
      const field=page.getByRole('spinbutton',{name:'Wzmocnienie (dB)',exact:true});
      assert.equal(await field.inputValue(),(gain===0?0:20*Math.log10(gain)).toFixed(2));
      assert.equal(await page.getByRole('checkbox',{name:'Wycisz klip',exact:true}).isChecked(),gain===0);
      await page.getByRole('spinbutton',{name:'Fade-in',exact:true}).fill('0.01');
      await page.getByRole('button',{name:'Zastosuj klip',exact:true}).click();await page.getByRole('button',{name:'Zapisz',exact:true}).click();
      await page.getByRole('combobox',{name:'Projekt',exact:true}).waitFor({state:'visible'});
      await page.waitForFunction(()=>document.querySelector('.revision')?.textContent==='rewizja 2');
      const saved=(await owner('projects.inspect',{projectId:legacy.id})).data;
      assert.equal(saved.document.audioClips[0].gain,gain);assert.equal(saved.document.schemaVersion,9);
      assert.deepEqual(saved.document.audioAssets,f.document.audioAssets);
    }
    await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(p.id);
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const call=async(name:string,args:any)=>page.evaluate(async({name,args})=>(window as any).__gainTools.get(name).execute(args),{name,args});
    const connection=await call('studio.connection.inspect',{}),viewSessionId=connection.data.viewSessionId;
    const view=async()=>{const r=await call('studio.view.inspect',{viewSessionId});assert.equal(r.status,'ok');return r.data;};
    const wait=async(predicate:(s:any)=>boolean)=>{const deadline=Date.now()+5000;let s=await view();while(!predicate(s)){assert.ok(Date.now()<deadline,JSON.stringify({revision:s.revision,dirty:s.draftDirty}));await page.waitForTimeout(25);s=await view();}return s;};
    const select=()=>page.getByRole('button',{name:'Zaznacz audio: Bite fixture',exact:true}).click();await select();
    const slider=page.getByRole('slider',{name:'Wzmocnienie klipu',exact:true}),field=page.getByRole('spinbutton',{name:'Wzmocnienie (dB)',exact:true}),apply=page.getByRole('button',{name:'Zastosuj klip',exact:true});
    assert.equal(await field.inputValue(),'0.00');assert.equal(await slider.inputValue(),'0');
    assert.equal((await view()).audioClipGains.saved[0].gainDb,0);
    await page.getByRole('checkbox',{name:'Wycisz klip',exact:true}).check();assert.equal(await field.isEnabled(),false);await apply.click();assert.equal((await view()).draft.audioClips[0].gain,0);assert.equal((await view()).audioClipGains.draft[0].gainDb,null);
    await page.getByRole('checkbox',{name:'Wycisz klip',exact:true}).uncheck();await apply.click();assert.equal((await view()).draft.audioClips[0].gain,1);
    await field.fill('3.5');assert.equal(await slider.inputValue(),'3.5');await slider.press('Home');assert.equal(await field.inputValue(),'-60');await slider.press('End');assert.equal(await field.inputValue(),'24');
    for(const invalid of ['24.01','-60.01','']){
      await field.fill(invalid);if(invalid==='')await field.press('-');await apply.click();
      assert.match(await page.getByRole('alert').innerText(),/od -60 do \+24 dB/);const state=await view();assert.equal(state.draftDirty,true);assert.equal(state.draft.audioClips[0].gain,1);assert.equal(state.savedDocument.audioClips[0].gain,1);assert(state.meshEditorDrafts.bite.audio.text.includes('gainDb'));
    }
    await page.getByRole('button',{name:'Odrzuć edycję klipu',exact:true}).click();assert.equal(await field.inputValue(),'0.00');
    await field.fill('-20');await apply.click();assert.equal((await view()).draft.audioClips[0].gain,.1);assert.equal((await view()).savedDocument.audioClips[0].gain,1);
    await page.screenshot({path:join(out,'clip-gain-minus20.png'),fullPage:true});
    await page.getByRole('button',{name:'Zapisz',exact:true}).click();await wait(s=>s.revision===2&&!s.draftDirty);p=(await owner('projects.inspect',{projectId:p.id})).data;assert.equal(p.document.audioClips[0].gain,.1);
    const history=(await owner('revisions.list',{projectId:p.id,limit:5})).data.items,operationId=history.find((r:any)=>r.revision===2).operationId;
    let r=await call('studio.changes.revert',{viewSessionId,input:{projectId:p.id,expectedRevision:2,operationId},idempotencyKey:randomUUID()});assert.equal(r.status,'ok');await wait(s=>s.revision===3);assert.equal(await field.inputValue(),'0.00');
    p=(await owner('changes.apply',{projectId:p.id,expectedRevision:3,changes:[{type:'locks.set',locks:[{layerId:'bite',field:'gain'}]}]})).data;
    await wait(s=>s.revision===4);assert.equal(await slider.isEnabled(),false);assert.equal(await field.isEnabled(),false);
    r=await call('studio.changes.apply',{viewSessionId,input:{projectId:p.id,expectedRevision:4,changes:[{type:'audio.set',clipId:'bite',values:{gainDb:20*Math.log10(3)}}]},idempotencyKey:randomUUID()});assert.equal(r.error.code,'LOCKED');
    p=(await owner('changes.apply',{projectId:p.id,expectedRevision:4,changes:[{type:'locks.set',locks:[]}]})).data;await wait(s=>s.revision===5);
    await owner('policy.set',{projectId:p.id,paused:true});r=await call('studio.changes.apply',{viewSessionId,input:{projectId:p.id,expectedRevision:5,changes:[{type:'audio.set',clipId:'bite',values:{gainDb:20*Math.log10(3)}}]},idempotencyKey:randomUUID()});assert.equal(r.error.code,'AI_PAUSED');
    // Human editing remains available while AI writes are paused.
    await field.fill('-40');await apply.click();await page.getByRole('button',{name:'Zapisz',exact:true}).click();await wait(s=>s.revision===6&&!s.draftDirty);await owner('policy.set',{projectId:p.id,paused:false});
    r=await call('studio.changes.apply',{viewSessionId,input:{projectId:p.id,expectedRevision:6,changes:[{type:'audio.set',clipId:'bite',values:{gainDb:20*Math.log10(3)}}]},idempotencyKey:randomUUID()});assert.equal(r.status,'ok');p=r.data;await wait(s=>s.revision===7);assert.equal(await field.inputValue(),'9.54');assert.equal(await slider.inputValue(),'9.5');
    await page.getByRole('slider',{name:'Głośność odsłuchu',exact:true}).press('Home');assert.equal((await view()).draft.audioClips[0].gain,3);
    await page.screenshot({path:join(out,'clip-gain-954.png'),fullPage:true});
    const accepted=await call('studio.preview.request',{viewSessionId,input:{projectId:p.id,revision:7,format:'webm'},idempotencyKey:randomUUID()});assert.equal(accepted.status,'accepted');await app.studio.drainJobs();
    const job=(await call('studio.jobs.get',{viewSessionId,input:{jobId:accepted.data.id}})).data;assert.equal(job.status,'succeeded',JSON.stringify(job.error));
    const artifact=job.artifacts.find((a:any)=>a.name==='audio-mix.wav'),response=await app.inject({method:'GET',url:artifact.downloadUrl,headers:{host:`127.0.0.1:${port}`,authorization:'Bearer '+app.studio.config.ownerToken}});await writeFile(join(out,'gain-300-mix.wav'),response.rawPayload);
    const decoded=readPcmWav(response.rawPayload),v=new DataView(decoded.pcm.buffer,decoded.pcm.byteOffset,decoded.pcm.byteLength),source=readPcmWav(f.wav),sv=new DataView(source.pcm.buffer,source.pcm.byteOffset,source.pcm.byteLength);let maxError=0;
    for(let i=0;i<48000;i++)for(let c=0;c<2;c++){
      let expected=0;if(i>=19200){const pos=(i-19200)/2,a=Math.floor(pos),b=Math.min(source.frames-1,a+1),t=pos-a;expected=(sv.getInt16((a*2+c)*2,true)*(1-t)+sv.getInt16((b*2+c)*2,true)*t  )*3;}
      maxError=Math.max(maxError,Math.abs(v.getInt16((i*2+c)*2,true)-expected));
    }assert.ok(maxError<=.500001,`PCM16 quantization: ${maxError}`);
    const harness=await build({stdin:{contents:`export {audioTimelineBuffer} from './apps/web/src/audio-player.ts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',globalName:'GainTest',platform:'browser'});
    await page.route(origin+'/gain-test-harness.js',route=>route.fulfill({contentType:'text/javascript',body:harness.outputFiles[0].text}));await page.addScriptTag({url:origin+'/gain-test-harness.js'});
    const previewGains=await page.evaluate(doc=>{
      const bytes=Uint8Array.from(atob(doc.audioAssets![0].decoded.pcmBase64),c=>c.charCodeAt(0)),raw=new DataView(bytes.buffer),results=[];
      for(const gain of [0,.5,1,1.5,2,3,4]){const ctx=new OfflineAudioContext(2,48000,48000),document={...doc,audioClips:[{...doc.audioClips![0],gain}]},buffer=(window as any).GainTest.audioTimelineBuffer(ctx,document);let maxError=0;
        for(let i=0;i<48000;i++)for(let c=0;c<2;c++){let expected=0;if(i>=19200){const pos=(i-19200)/2,a=Math.floor(pos),b=Math.min(14399,a+1),t=pos-a;expected=(raw.getInt16((a*2+c)*2,true)*(1-t)+raw.getInt16((b*2+c)*2,true)*t)*gain;}maxError=Math.max(maxError,Math.abs(buffer.getChannelData(c)[i]*32768-expected));}results.push({gain,maxPcmUnitError:maxError});}
      return results;
    },f.document);assert(previewGains.every((r:any)=>r.maxPcmUnitError<=.500001));
    const final=await view();assert.equal(final.audioMonitor.muted,true);assert.equal(final.audioMonitor.unlocked,false);assert.deepEqual(p.document.audioAssets,f.document.audioAssets);assert.deepEqual(errors,[]);
    const overloaded=(await owner('changes.apply',{projectId:p.id,expectedRevision:7,changes:Array.from({length:7},(_,i)=>({type:'audio.add',clip:{...f.clip,id:'overlap_'+i,gain:3}}))}));
    assert.equal(overloaded.diagnostics[0].code,'AUDIO_CLIPPING');await wait(s=>s.revision===8);
    assert.match((await page.getByRole('alert').allTextContents()).join(' '),/może zniekształcić dźwięk/);
    await page.screenshot({path:join(out,'clipping-warning.png'),fullPage:true});
    const invalidDb=await call('studio.changes.preview',{viewSessionId,input:{projectId:p.id,expectedRevision:8,changes:[{type:'audio.set',clipId:'bite',values:{gain:1,gainDb:0}}]}});assert.equal(invalidDb.status,'failed');
    const conflict=await call('studio.changes.apply',{viewSessionId,input:{projectId:p.id,expectedRevision:7,changes:[{type:'audio.set',clipId:'bite',values:{gainDb:24}}]},idempotencyKey:randomUUID()});assert.equal(conflict.error.code,'REVISION_CONFLICT');
    const expanded=await call('studio.changes.apply',{viewSessionId,input:{projectId:p.id,expectedRevision:8,changes:[{type:'audio.set',clipId:'bite',values:{gainDb:24}}]},idempotencyKey:randomUUID()});assert.equal(expanded.status,'ok');assert.equal(expanded.data.document.schemaVersion,10);assert.equal(expanded.data.document.audioClips[0].gain,10**1.2);await wait(s=>s.revision===9);assert.equal(await field.inputValue(),'24.00');
    assert(expanded.diagnostics[0].audio.peakDbFS>0);
    await writeFile(join(out,'report.json'),JSON.stringify({passed:true,projectId:p.id,revision:7,savedGain:3,sourceUnchanged:true,masterMonitorNotExported:true,maxExportPcmUnitError:maxError,previewGains,clippingDiagnostics:overloaded.diagnostics,webmcp:'controlled registry; separate host check required',nativeVerified:false},null,2)+'\n');
  }finally{await browser.close();await app.close();assert.equal(dirname(dir),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
