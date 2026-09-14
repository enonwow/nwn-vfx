import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {hash} from '../apps/service/src/store.js';

test('human creates finite flow; WebMCP preserves raw drafts, binds only this tab and returns all three models',{timeout:180000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-flow-browser-')),out=resolve('output/playwright/beam-flow');await mkdir(out,{recursive:true});
  const port=14385,origin=`http://127.0.0.1:${port}`,app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});await app.listen({host:'127.0.0.1',port});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1500,height:1200}}),errors:string[]=[],report:any={adapterFixture:true,realHostDiscovery:false,jobs:[]};
  page.on('pageerror',e=>errors.push(e.message));const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  const owner=(operation:string,input:object={})=>ok(app.studio.dispatch('owner',{operation,input:input as any,idempotencyKey:randomUUID()}));
  const invoke=(name:string,args:object={})=>page.evaluate(async({name,args})=>(window as any).__flowTools.get('studio.'+name).execute(args),{name,args});
  try{
    owner('projects.create',{name:'Own initial fixture',preset:'empty'});
    await page.addInitScript(()=>{const tools=new Map();(window as any).__flowTools=tools;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){tools.set(t.name,t);},unregisterTool(n:string){tools.delete(n);}}});});
    await page.goto(origin);await page.getByRole('heading',{name:'Own initial fixture',exact:true}).waitFor();await page.getByRole('button',{name:'Nowy',exact:true}).click();await page.getByRole('button',{name:/Nowy strumień cząstek/}).click();await page.getByRole('heading',{name:'Nowy strumień cząstek',exact:true}).waitFor();await page.getByText('rewizja 2',{exact:true}).waitFor();
    const project=owner('projects.list',{limit:100}).items.find((p:any)=>p.document.name==='Nowy strumień cząstek'),projectId=project.id;
    await page.getByRole('button',{name:'Stop',exact:true}).click();await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const connection=ok(await invoke('connection.inspect')),viewSessionId=connection.viewSessionId;
    let view=ok(await invoke('view.inspect'));assert.equal(view.viewSessionId,viewSessionId);
    assert.equal((await invoke('view.inspect',{viewSessionId:'stale-other-tab'})).error.code,'VIEW_SESSION_MISMATCH');
    const period=page.getByRole('textbox',{name:'Okres impulsu (s)',exact:true});await period.fill('-');
    view=ok(await invoke('view.inspect'));assert.equal(JSON.parse(view.meshEditorDrafts.flow.beamBinding.text).period,'-');assert.equal(view.draftDirty,true);
    assert.equal((await invoke('view.open',{projectId,expectedViewRevision:view.viewRevision})).error.code,'DRAFT_CONFLICT');
    await page.getByRole('button',{name:'Zastosuj powiązanie cząstek'}).click();assert.equal(await page.getByRole('button',{name:'Zapisz',exact:true}).isDisabled(),true);
    await period.fill('.6');await page.getByRole('button',{name:'Zastosuj powiązanie cząstek'}).click();await page.getByRole('button',{name:'Zapisz',exact:true}).click();await page.getByText('rewizja 3',{exact:true}).waitFor();
    for(const [role,revision] of [['źródła',4],['celu',5]] as const){await page.getByRole('button',{name:'Dodaj końcówkę '+role,exact:true}).click();await page.getByRole('button',{name:'Zapisz',exact:true}).click();await page.getByText('rewizja '+revision,{exact:true}).waitFor();}
    const saved=ok(await invoke('projects.inspect',{input:{projectId}}));assert.equal(saved.document.layers.length,3);assert.equal(saved.document.schemaVersion,19);
    owner('policy.set',{projectId,paused:true});view=ok(await invoke('view.inspect'));
    assert.equal((await invoke('view.set',{projectId,expectedRevision:saved.revision,expectedViewRevision:view.viewRevision,time:1.4})).error.code,'AI_PAUSED');owner('policy.set',{projectId,paused:false});
    view=ok(await invoke('view.inspect'));ok(await invoke('view.set',{projectId,expectedRevision:saved.revision,expectedViewRevision:view.viewRevision,time:1.4,playing:false}));await page.screenshot({path:join(out,'editor.png')});
    for(const [operation,input] of [['preview.request',{format:'png',time:1.4}],['preview.request',{format:'webm'}],['candidate.build',{modelName:'flow_browser',profileId:'nwn-ee-beam-binary-experimental-v1'}]] as const){
      const q=ok(await invoke(operation,{input:{projectId,revision:saved.revision,...input},idempotencyKey:randomUUID()}));await app.studio.drainJobs();const j=ok(await invoke('jobs.get',{input:{jobId:q.id}}));assert.equal(j.status,'succeeded',JSON.stringify(j.error));
      if(operation==='preview.request')assert.equal(j.metadata.beamParticleFlow.length,3);
      const folder=join(out,j.id);await mkdir(folder,{recursive:true});
      for(const a of j.artifacts){const chunks:Buffer[]=[];let offset=0;for(;;){const part=ok(await invoke('artifacts.read',{artifactId:a.id,offset,length:65536})),bytes=Buffer.from(part.base64,'base64');assert.equal(hash(bytes),part.chunkSha256);chunks.push(bytes);if(part.nextOffset===null)break;offset=part.nextOffset;}const bytes=Buffer.concat(chunks);assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.size);await writeFile(join(folder,a.fileName),bytes);}
      report.jobs.push({id:j.id,metadata:j.metadata,artifacts:j.artifacts.map((a:any)=>({id:a.id,name:a.fileName,sha256:a.sha256,size:a.size}))});
    }
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).waitFor();assert.equal((await invoke('projects.inspect',{input:{projectId}})).error.code,'WEBMCP_NOT_CONNECTED');
    assert.deepEqual(errors,[]);report.passed=true;report.project={id:projectId,revision:saved.revision};
  }catch(e){report.failure=String(e);await page.screenshot({path:join(out,'failure.png')});throw e;}
  finally{await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
