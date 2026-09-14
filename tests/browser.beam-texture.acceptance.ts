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
import {beamMotionFixture} from './fixtures/beam-motion.js';

test('UI saves explicit static texture mapping, preserves drafts, and WebMCP returns preview and native artifacts',{timeout:180000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-beam-map-browser-')),out=resolve('output/playwright/beam-texture');await mkdir(out,{recursive:true});
  const port=14382,origin=`http://127.0.0.1:${port}`,app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});await app.listen({host:'127.0.0.1',port});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1500,height:1200}}),errors:string[]=[],report:any={adapterFixture:true,realHostDiscovery:false,jobs:[]};
  page.on('pageerror',e=>errors.push(e.message));
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  const owner=(operation:string,input:object={})=>ok(app.studio.dispatch('owner',{operation,input:input as any,idempotencyKey:randomUUID()}));
  const invoke=(name:string,args:object={})=>page.evaluate(async({name,args})=>(window as any).__mappingTools.get('studio.'+name).execute(args),{name,args});
  try{
    const p=owner('projects.create',{name:'Own mapping fixture',preset:'empty',lifecycle:'beam'}),other=owner('projects.create',{name:'Own draft target',preset:'empty'});
    await page.addInitScript(()=>{const tools=new Map();(window as any).__mappingTools=tools;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){tools.set(t.name,t);},unregisterTool(n:string){tools.delete(n);}}});});
    await page.goto(origin);await page.getByRole('heading',{name:other.document.name,exact:true}).waitFor();await page.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(p.id);await page.getByRole('heading',{name:p.document.name,exact:true}).waitFor();
    await page.getByRole('button',{name:'Stop',exact:true}).click();await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const {viewSessionId}=ok(await invoke('connection.inspect')),projectId=p.id;
    const tool=(name:string,input:object)=>invoke(name,{viewSessionId,input,...(['projects.inspect','jobs.get'].includes(name)?{}:{idempotencyKey:randomUUID()})});
    await page.getByRole('combobox',{name:'Oś tekstury statycznego beama'}).selectOption('u');await page.getByRole('combobox',{name:'Dopasowanie tekstury statycznego beama'}).selectOption('alpha-bounds');
    const width=page.getByRole('textbox',{name:'Półszerokość odcinka NWN (m)',exact:true});await width.fill('-');
    let view=ok(await invoke('view.inspect',{viewSessionId}));assert.equal(JSON.parse(view.meshEditorDrafts.beam.beam.text).mappingFit,'alpha-bounds');assert.equal(view.draftDirty,true);
    assert.equal((await invoke('view.open',{viewSessionId,projectId:other.id,expectedViewRevision:view.viewRevision})).error.code,'DRAFT_CONFLICT');
    await page.getByRole('button',{name:'Zastosuj parametry beama',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Zapisz',exact:true}).isDisabled(),true);
    await width.fill('0.12');await page.getByRole('combobox',{name:'Podziały beama'}).selectOption('2');await page.getByRole('button',{name:'Zastosuj parametry beama',exact:true}).click();await page.getByRole('button',{name:'Zapisz',exact:true}).click();await page.getByText('rewizja 2',{exact:true}).waitFor();
    let saved=ok(await tool('projects.inspect',{projectId}));assert.equal(saved.document.schemaVersion,18);assert.deepEqual(saved.document.layers[0].textureMapping,{axis:'u',fit:'alpha-bounds'});
    const asset=beamMotionFixture().asset,imported=ok(await tool('assets.import',{projectId,expectedRevision:saved.revision,fileName:asset.name,pngBase64:asset.pngBase64}));
    saved=ok(await tool('changes.apply',{projectId,expectedRevision:imported.project.revision,changes:[{type:'layer.set',layerId:'beam',values:{texture:'asset:'+imported.assetId,color:'#ffffff',alpha:1,radius:0,lightningScale:0}}]}));
    view=ok(await invoke('view.inspect',{viewSessionId}));ok(await invoke('view.open',{viewSessionId,projectId,expectedViewRevision:view.viewRevision}));await page.getByText(`rewizja ${saved.revision}`,{exact:true}).waitFor();await page.screenshot({path:join(out,'editor.png')});
    for(const [operation,input] of [['preview.request',{format:'png',time:.5}],['preview.request',{format:'webm'}],['candidate.build',{modelName:'map_browser',profileId:'nwn-ee-beam-binary-experimental-v1'}]] as const){
      const q=ok(await tool(operation,{projectId,revision:saved.revision,...input}));await app.studio.drainJobs();const j=ok(await tool('jobs.get',{jobId:q.id}));assert.equal(j.status,'succeeded',JSON.stringify(j.error));
      if(operation==='preview.request'){assert.equal(j.metadata.beamTextureMapping[0].repetitions,2);assert.equal(j.metadata.beamTextureMapping[0].nativeFullWidth,.24);}
      const folder=join(out,j.id);await mkdir(folder,{recursive:true});
      for(const a of j.artifacts){const chunks:Buffer[]=[];let offset=0;for(;;){const part=ok(await invoke('artifacts.read',{viewSessionId,artifactId:a.id,offset,length:65536})),bytes=Buffer.from(part.base64,'base64');assert.equal(hash(bytes),part.chunkSha256);chunks.push(bytes);if(part.nextOffset===null)break;offset=part.nextOffset;}const bytes=Buffer.concat(chunks);assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.size);await writeFile(join(folder,a.fileName),bytes);}
      report.jobs.push({id:j.id,metadata:j.metadata,artifacts:j.artifacts.map((a:any)=>({id:a.id,name:a.fileName,sha256:a.sha256,size:a.size}))});
    }
    assert.deepEqual(errors,[]);report.passed=true;report.project={id:projectId,revision:saved.revision};
  }catch(e){report.failure=String(e);await page.screenshot({path:join(out,'failure.png')});throw e;}
  finally{await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
