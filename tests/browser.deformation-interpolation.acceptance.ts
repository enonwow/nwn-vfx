import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {hash,canonical} from '../apps/service/src/store.js';
import {importProjectBundle} from '../apps/service/src/project-bundle.js';
import {interpolationFixture} from './fixtures/deformation-interpolation.js';

const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
test('UI and registered WebMCP select smooth deformation, preserve human work and retrieve sampled exports',{timeout:180000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-interpolation-browser-')),out=resolve('output/playwright/deformation-interpolation');await mkdir(out,{recursive:true});
  const port=14375,origin=`http://127.0.0.1:${port}`,app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});
  await app.listen({host:'127.0.0.1',port});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage(),errors:string[]=[],report:any={adapterFixture:true,realHostDiscovery:false,files:[]};page.on('pageerror',e=>errors.push(e.message));
  const owner=(operation:string,input:Record<string,unknown>={})=>ok(app.studio.dispatch('owner',{operation,input,idempotencyKey:randomUUID()}));
  const invoke=(name:string,args:object={})=>page.evaluate(async({name,args})=>(window as any).__interpolationTools.get(`studio.${name}`).execute(args),{name,args});
  try{
    const source=interpolationFixture();let p=owner('projects.import',{document:source});
    await page.addInitScript(()=>{const registry=new Map();(window as any).__interpolationTools=registry;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any,o:any){registry.set(t.name,t);o?.signal?.addEventListener('abort',()=>registry.delete(t.name));},unregisterTool(n:string){registry.delete(n);}}});});
    await page.goto(origin);await page.getByText('rewizja 1',{exact:true}).waitFor();
    const choice=page.getByRole('combobox',{name:'Interpolacja deformacji',exact:true}),save=page.getByRole('button',{name:'Zapisz',exact:true});
    assert.equal(await choice.inputValue(),'monotone-cubic-loop');await choice.selectOption('monotone-cubic');await save.click();await page.getByText('rewizja 2',{exact:true}).waitFor();
    assert.equal(owner('projects.inspect',{projectId:p.id}).document.layers[0].deformationInterpolation,'monotone-cubic');
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const {viewSessionId}=ok(await invoke('connection.inspect'));
    const tool=(name:string,input:object,key=randomUUID())=>invoke(name,{viewSessionId,input,...(['jobs.get','changes.preview'].includes(name)?{}:{idempotencyKey:key})});
    p=owner('projects.inspect',{projectId:p.id});
    const patch=[{type:'layer.set',layerId:'panels',values:{deformationInterpolation:'monotone-cubic-loop'}}];
    for(const field of ['animation','deformationInterpolation']){
      p=owner('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'panels',field}]}]});
      assert.equal((await tool('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:patch})).error.code,'LOCKED');
      p=owner('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]});
    }
    owner('policy.set',{projectId:p.id,paused:true});assert.equal((await tool('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:patch})).error.code,'AI_PAUSED');owner('policy.set',{projectId:p.id,paused:false});
    const input={projectId:p.id,expectedRevision:p.revision,changes:patch},key=randomUUID();ok(await tool('changes.preview',input));p=ok(await tool('changes.apply',input,key));assert.deepEqual(ok(await tool('changes.apply',input,key)),p);assert.equal((await tool('changes.apply',input)).error.code,'REVISION_CONFLICT');
    // Selective undo returns the prior clamped choice without reverting UI edits.
    const undo=await tool('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'panels',values:{deformationInterpolation:'linear'}}]});p=ok(undo);
    p=ok(await tool('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:undo.operationId}));assert.equal(p.document.layers[0].deformationInterpolation,'monotone-cubic-loop');
    const draftName=page.locator('.inspector-title input');await draftName.fill('Human pending interpolation review');const view=ok(await invoke('view.inspect',{viewSessionId}));assert(view.draftDirty);
    assert.equal((await invoke('view.open',{viewSessionId,projectId:p.id,expectedViewRevision:view.viewRevision})).error.code,'DRAFT_CONFLICT');
    async function collect(name:string,input:object,wanted:string){
      const queued=ok(await tool(name,input));await app.studio.drainJobs();const result=queued.artifact?{status:'succeeded',artifacts:[queued.artifact]}:ok(await tool('jobs.get',{jobId:queued.id}));assert.equal(result.status,'succeeded',JSON.stringify(result.error));
      const artifact=result.artifacts.find((a:any)=>a.fileName===wanted);assert(artifact,wanted);const chunks:Buffer[]=[];let offset=0;
      for(;;){const part=ok(await invoke('artifacts.read',{viewSessionId,artifactId:artifact.id,offset,length:4096}));const bytes=Buffer.from(part.base64,'base64');assert.equal(hash(bytes),part.chunkSha256);chunks.push(bytes);if(part.nextOffset===null)break;offset=part.nextOffset;}
      const bytes=Buffer.concat(chunks);assert.equal(hash(bytes),artifact.sha256);assert.equal(bytes.length,artifact.size);await writeFile(join(out,wanted),bytes);report.files.push({name:wanted,sha256:hash(bytes),metadata:result.metadata});return {bytes,metadata:result.metadata};
    }
    const base={projectId:p.id,revision:p.revision};
    const png=await collect('preview.request',{...base,time:.25},'preview.png');assert.equal(png.metadata.deformations[0].interpolation.mode,'monotone-cubic-loop');
    const candidate=await collect('candidate.build',{...base,modelName:'interp_browser'},'validation.json');const validation=JSON.parse(candidate.bytes.toString());assert.deepEqual(validation.readback.meshes[0].deformation.interpolation,png.metadata.deformations[0].interpolation);
    const zip=await collect('projects.export',base,'studio-project.zip');assert.equal(canonical(importProjectBundle(zip.bytes.toString('base64'))),canonical(p.document));
    assert(ok(await invoke('view.inspect',{viewSessionId})).draftDirty);assert.equal(await draftName.inputValue(),'Human pending interpolation review');
    await page.screenshot({path:join(out,'interpolation.png')});
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).waitFor();assert.equal((await invoke('connection.inspect')).error.code,'WEBMCP_NOT_CONNECTED');assert.deepEqual(errors,[]);report.passed=true;
  }catch(e){report.failure=String(e);await writeFile(join(out,'failure.html'),await page.content());throw e;}
  finally{report.consoleErrors=errors;await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
