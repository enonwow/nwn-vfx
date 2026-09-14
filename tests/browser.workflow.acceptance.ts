import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {unzipSync} from 'fflate';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {flowFixture} from './fixtures/beam-flow.js';
import {orientationTexture} from './fixtures/rgba-texture.js';
import {createTextureAsset} from '../packages/core/src/textures.js';

test('browser workflow preserves drafts, switches bounded WebMCP profiles, and retrieves same-phase concepts/renders', {timeout:90000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-browser-workflow-')),port=14388,origin=`http://127.0.0.1:${port}`;
  const app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});await app.listen({host:'127.0.0.1',port});
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const call=(operation:string,input:any={})=>{const r=app.studio.dispatch('owner',{operation,input,idempotencyKey:randomUUID()},20);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data as any;};
  const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
  try{
    const document=flowFixture();document.assets=[createTextureAsset('technical-phase-reference.png',Buffer.from(orientationTexture(8)).toString('base64'))];
    const project=call('projects.import',{document});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    // Production callbacks and HTTP service; only host registration is mocked.
    await context.addInitScript(()=>{
      const registry=new Map();(window as any).__workflowRegistry=registry;
      Object.defineProperty(document,'modelContext',{configurable:true,value:undefined});
      Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any,o:any){if(registry.has(t.name))throw Error('Duplicate tool');registry.set(t.name,t);o?.signal?.addEventListener('abort',()=>registry.delete(t.name),{once:true});},unregisterTool(n:string){registry.delete(n);}}});
    });
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    await page.getByText('rewizja 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).click();
    const invoke=(name:string,input:any={})=>page.evaluate(async({name,input})=>{const t=(window as any).__workflowRegistry.get(name);if(!t)throw Error('Missing '+name);return t.execute(input);},{name,input});
    const tool=(op:string,input:any,mutates=false)=>invoke('studio.'+op,{input,...(mutates?{idempotencyKey:randomUUID()}:{})});
    const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
    const before=ok(await invoke('studio.view.inspect'));
    const selection=ok(await invoke('studio.tools.select',{profile:'workflow'}));assert.equal(selection.toolProfile,'workflow');assert(selection.toolCount<=100);
    const after=ok(await invoke('studio.view.inspect'));assert.equal(after.projectId,before.projectId);assert.equal(after.viewRevision,before.viewRevision);
    assert.equal(ok(await tool('workflow.inspect',{projectId:project.id})).detail.source.schemaVersion,19);
    await page.getByRole('button',{name:'Praca nad iteracją',exact:true}).click();await page.getByRole('button',{name:'Warunki i koncept',exact:true}).click();
    await page.getByLabel('Natężenie oświetlenia podglądu',{exact:true}).fill('0.75');
    const draft=ok(await invoke('studio.view.inspect'));assert.equal(draft.workflowDrafts.lightIntensity,'0.75');assert.equal(draft.draftDirty,true);
    const blocked=await tool('timing.apply',{projectId:project.id,expectedRevision:1,markers:[]},true);assert.equal(blocked.error.code,'DRAFT_CONFLICT');
    await page.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).click();await page.getByRole('button',{name:'Otwórz iterację',exact:true}).click();await page.getByRole('button',{name:'Warunki i koncept',exact:true}).click();assert.equal(await page.getByLabel('Natężenie oświetlenia podglądu',{exact:true}).inputValue(),'0.75');
    await page.getByRole('button',{name:'Wyczyść formularz',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).click();
    const timed=ok(await tool('timing.apply',{projectId:project.id,expectedRevision:1,markers:[{id:'phase',name:'Phase reference',time:.5}]},true));assert.equal(timed.revision,2);
    const conditions={filtering:'export-mipmaps',background:'gray',rig:{id:'schematic-human-v1',height:1.8,position:[0,0,0],yaw:.5,velocity:[.1,0,0],anchor:'impact',attachEffect:false}};
    const settings=ok(await tool('workflow.settings.apply',{projectId:project.id,expectedRevision:2,settings:{preview:conditions,concepts:[{assetId:project.document.assets[0].id,name:'Technical concept fixture',markerId:'phase'}]}},true));assert.equal(settings.revision,3);
    assert.equal((await tool('timing.apply',{projectId:project.id,expectedRevision:1},true)).error.code,'REVISION_CONFLICT');
    call('policy.set',{projectId:project.id,paused:true});assert.equal((await tool('iteration.prepare',{projectId:project.id,revision:3,binary:false},true)).error.code,'AI_PAUSED');call('policy.set',{projectId:project.id,paused:false});
    const args={input:{projectId:project.id,revision:3,binary:false},idempotencyKey:randomUUID()},job=ok(await invoke('studio.iteration.prepare',args));assert.equal(ok(await invoke('studio.iteration.prepare',args)).id,job.id);
    await app.studio.drainJobs();const done=ok(await tool('jobs.get',{jobId:job.id}));assert.equal(done.status,'succeeded',JSON.stringify(done.error));
    const a=done.artifacts.find((a:any)=>a.name==='diagnostic.zip'),chunks:Buffer[]=[];let offset=0;
    do{const chunk=ok(await invoke('studio.artifacts.read',{artifactId:a.id,offset,length:262144}));chunks.push(Buffer.from(chunk.base64,'base64'));if(chunk.nextOffset===null)break;offset=chunk.nextOffset;}while(true);
    const bytes=Buffer.concat(chunks);assert.equal(bytes.length,a.size);assert.equal(sha(bytes),a.sha256);const files=unzipSync(bytes),manifest=JSON.parse(Buffer.from(files['diagnostic-manifest.json']).toString());
    assert.equal(manifest.concepts[0].time,.5);assert.equal(manifest.conditions.times[0],.5);assert.equal(manifest.concepts[0].comparisons[0].previews[0],manifest.variants[0].previews[0].path);assert.equal(sha(files[manifest.concepts[0].path]),manifest.concepts[0].sha256);
    const preview=manifest.variants[0].previews[0];assert.equal(sha(files[preview.path]),preview.sha256);
    // Two uncached renderer calls are byte-identical for fixed seed/time/camera.
    const saved=call('projects.inspect',{projectId:project.id});
    const render=createRenderer(origin),opts={time:.5,conditions:manifest.conditions,signal:new AbortController().signal};
    const {times,...onlyConditions}=manifest.conditions;
    const repeated=await render(saved.document,{...opts,conditions:onlyConditions,camera:manifest.conditions.camera});assert.equal(sha(repeated.files.find(f=>f.name==='preview.png')!.data),preview.sha256);
    const light=await render(saved.document,{...opts,conditions:{...onlyConditions,background:'light'},camera:manifest.conditions.camera});assert.notEqual(sha(light.files.find(f=>f.name==='preview.png')!.data),preview.sha256);
    await page.getByText('rewizja 3',{exact:true}).waitFor();await page.getByRole('button',{name:'Praca nad iteracją',exact:true}).click();await page.getByRole('button',{name:'Zadanie',exact:true}).click();await page.getByLabel('Identyfikator zadania',{exact:true}).fill(job.id);await page.getByRole('button',{name:'Odczytaj zadanie',exact:true}).click();await page.getByText('succeeded',{exact:true}).first().waitFor();
    await mkdir(resolve('output/playwright/workflow'),{recursive:true});await page.screenshot({path:resolve('output/playwright/workflow/iteration.png'),fullPage:true});
    await writeFile(resolve('output/playwright/workflow/acceptance.json'),JSON.stringify({adapterRegistration:'mock',realServer:true,realRenderer:true,sha256:a.sha256,conceptPhase:.5,deterministicPreview:true,errors,nativeVerified:false},null,2));
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
