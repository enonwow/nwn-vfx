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
import {durationAudioFixture} from './fixtures/duration-audio.js';

const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
test('UI creates beam; numeric draft, material, WebMCP edits and ASCII/binary/PNG/WebM follow shared contracts',{timeout:180000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-beam-browser-')),out=resolve('output/playwright/beam');await mkdir(out,{recursive:true});
  const port=14378,origin=`http://127.0.0.1:${port}`,app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});await app.listen({host:'127.0.0.1',port});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors:string[]=[],report:any={adapterFixture:true,realHostDiscovery:false,jobs:[]};page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|GLSL|WebGL/i.test(m.text()))errors.push(m.text());});
  const owner=(operation:string,input:Record<string,unknown>={})=>ok(app.studio.dispatch('owner',{operation,input,idempotencyKey:randomUUID()}));
  const invoke=(name:string,args:object={})=>page.evaluate(async({name,args})=>(window as any).__beamTools.get(`studio.${name}`).execute(args),{name,args});
  try{
    const seed=owner('projects.create',{name:'Technical start',preset:'empty'});
    await page.addInitScript(()=>{const registry=new Map();(window as any).__beamTools=registry;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){registry.set(t.name,t);},unregisterTool(n:string){registry.delete(n);}}});});
    await page.goto(origin);await page.getByText('rewizja 1',{exact:true}).waitFor();await page.getByRole('button',{name:'Nowy',exact:true}).click();await page.getByRole('button',{name:/Nowy beam/}).click();await page.getByRole('heading',{name:'Nowy beam',exact:true}).waitFor();await page.getByRole('button',{name:'Stop',exact:true}).click();
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const {viewSessionId,projectId}=ok(await invoke('connection.inspect'));
    const tool=(name:string,input:object,key=randomUUID())=>invoke(name,{viewSessionId,input,...(['jobs.get','projects.inspect','changes.preview'].includes(name)?{}:{idempotencyKey:key})});
    const width=page.getByRole('textbox',{name:'Szerokość beama (m)',exact:true});await width.fill('-');
    let view=ok(await invoke('view.inspect',{viewSessionId}));assert.equal(view.draftDirty,true);assert(JSON.parse(view.meshEditorDrafts.beam.beam.text).width==='-');
    assert.equal((await invoke('view.open',{viewSessionId,projectId:seed.id,expectedViewRevision:view.viewRevision})).error.code,'DRAFT_CONFLICT');
    await page.getByRole('button',{name:'Zastosuj parametry beama',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Zapisz',exact:true}).isDisabled(),true);
    await width.fill('0.07');await page.getByRole('textbox',{name:'Cel beama Y',exact:true}).fill('5');await page.getByRole('combobox',{name:'Kierunek przepływu beama',exact:true}).selectOption('source-to-target');await page.getByRole('button',{name:'Zastosuj parametry beama',exact:true}).click();await page.getByRole('button',{name:'Zapisz',exact:true}).click();await page.getByText('rewizja 2',{exact:true}).waitFor();
    let p=owner('projects.inspect',{projectId});assert.equal(p.document.layers[0].width,.07);assert.equal(p.document.layers[0].target[1],5);assert.equal(p.document.layers[0].flow.direction,'source-to-target');
    const texture=durationAudioFixture().document.assets![0];const imported=ok(await tool('assets.import',{projectId,expectedRevision:p.revision,fileName:'beam-test.png',pngBase64:texture.pngBase64}));p=imported.project;
    const patch={projectId,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'beam',values:{texture:'asset:'+imported.assetId,flow:{direction:'target-to-source',speed:2},color:'#e53045',alpha:1}}]};
    ok(await tool('changes.preview',patch));p=ok(await tool('changes.apply',patch));view=ok(await invoke('view.inspect',{viewSessionId}));ok(await invoke('view.open',{viewSessionId,projectId,expectedViewRevision:view.viewRevision}));
    await page.getByRole('spinbutton',{name:'Okno podglądu beama',exact:true}).waitFor();
    await page.screenshot({path:join(out,'editor.png')});
    for(const entry of [{operation:'preview.request',input:{format:'png',time:.3}},{operation:'preview.request',input:{format:'webm',cycles:2}},{operation:'candidate.build',input:{modelName:'beam_browser',profileId:'nwn-ee-beam-ascii-experimental-v1'}},{operation:'candidate.build',input:{modelName:'beam_browser',profileId:'nwn-ee-beam-binary-experimental-v1'}}]){
      const queued=ok(await tool(entry.operation,{projectId,revision:p.revision,...entry.input}));await app.studio.drainJobs();const job=ok(await tool('jobs.get',{jobId:queued.id}));assert.equal(job.status,'succeeded',JSON.stringify(job.error));
      if(entry.operation==='preview.request'){assert.equal(job.metadata.previewWindowSeconds,3);assert.equal(job.metadata.loopSeconds,undefined);}
      const folder=join(out,job.id);await mkdir(folder,{recursive:true});
      for(const a of job.artifacts){const chunks:Buffer[]=[];let offset=0;for(;;){const part=ok(await invoke('artifacts.read',{viewSessionId,artifactId:a.id,offset,length:65536}));const b=Buffer.from(part.base64,'base64');assert.equal(hash(b),part.chunkSha256);chunks.push(b);if(part.nextOffset===null)break;offset=part.nextOffset;}const bytes=Buffer.concat(chunks);assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.size);await writeFile(join(folder,a.fileName),bytes);}
      report.jobs.push({id:job.id,type:entry.operation,input:entry.input,metadata:job.metadata,artifacts:job.artifacts.map((a:any)=>({name:a.fileName,sha256:a.sha256,size:a.size}))});
    }
    assert.deepEqual(errors,[]);report.project={id:projectId,revision:p.revision,schemaVersion:p.document.schemaVersion};report.passed=true;
  }catch(e){report.failure=String(e);await writeFile(join(out,'failure.html'),await page.content());await page.screenshot({path:join(out,'failure.png')});throw e;}
  finally{report.errors=errors;await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
