import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {hash,canonical} from '../apps/service/src/store.js';
import {importProjectBundle} from '../apps/service/src/project-bundle.js';
import {durationExample} from './fixtures/duration.js';

const run=promisify(execFile),ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
test('UI and registered WebMCP adapter author a custom DUR, preserve drafts/locks, and retrieve three-cycle renders and resources',{timeout:180000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-duration-browser-')),out=resolve('output/playwright/duration');await mkdir(out,{recursive:true});
  const port=14374,origin=`http://127.0.0.1:${port}`,app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});
  await app.listen({host:'127.0.0.1',port});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const owner=(operation:string,input:Record<string,unknown>={})=>ok(app.studio.dispatch('owner',{operation,input,idempotencyKey:randomUUID()}));
  const invoke=(name:string,input:unknown={})=>page.evaluate(async({name,input})=>(window as any).__durationTools.get(name).execute(input),{name:'studio.'+name,input});
  const report:any={passed:false,nativeVerified:false,registration:'mock; production adapter and service',files:[]};
  try{
    // Registration mock only. Actual host discovery is a separate installed check.
    await page.addInitScript(()=>{const registry=new Map();(window as any).__durationTools=registry;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any,o:any){registry.set(t.name,t);o?.signal?.addEventListener('abort',()=>registry.delete(t.name));},unregisterTool(n:string){registry.delete(n);}}});});
    owner('projects.create',{name:'UI start',preset:'empty'});await page.goto(origin);await page.getByText('rewizja 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Nowy',exact:true}).click();await page.getByRole('button',{name:/Nowy efekt DUR/}).click();
    await page.getByRole('heading',{name:'Nowy efekt DUR',exact:true}).waitFor();
    const uiId=await page.getByRole('combobox',{name:'Projekt',exact:true}).inputValue();
    const save=page.getByRole('button',{name:'Zapisz',exact:true}),mode=page.getByRole('combobox',{name:'Tryb efektu',exact:true});
    assert.equal(await mode.inputValue(),'duration');await mode.selectOption('impact');await save.click();await page.getByText('rewizja 2',{exact:true}).waitFor();
    await mode.selectOption('duration');await save.click();await page.getByText('rewizja 3',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Zablokuj tryb efektu',exact:true}).click();await page.getByRole('button',{name:'Zablokuj obracanie z postacią',exact:true}).click();await save.click();await page.getByText('rewizja 4',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Odblokuj obracanie z postacią',exact:true}).click();await save.click();await page.getByText('rewizja 5',{exact:true}).waitFor();assert(await mode.isDisabled());assert.deepEqual(owner('projects.inspect',{projectId:uiId}).document.locks,[{layerId:'@effect',field:'lifecycle'}]);
    await page.getByRole('button',{name:'Odblokuj tryb efektu',exact:true}).click();await save.click();await page.getByText('rewizja 6',{exact:true}).waitFor();
    await page.getByRole('spinbutton',{name:'Długość pętli — rozciąga klucze',exact:true}).fill('2');await save.click();await page.getByText('rewizja 7',{exact:true}).waitFor();assert.equal(owner('projects.inspect',{projectId:uiId}).document.layers[0].duration,2);
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
    const {viewSessionId}=ok(await invoke('connection.inspect'));
    const tool=async(name:string,input:object,key=randomUUID())=>invoke(name,{viewSessionId,input,...(name==='jobs.get'?{}:{idempotencyKey:key})});
    const custom=durationExample().loop;let project=ok(await tool('projects.create',{name:'Agent custom DUR',preset:'empty',lifecycle:'duration'}));
    const imported=ok(await tool('assets.import',{projectId:project.id,expectedRevision:1,fileName:custom.assets![0].name,pngBase64:custom.assets![0].pngBase64}));project=imported.project;
    project=ok(await tool('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:[{type:'layer.remove',layerId:'mesh'},{type:'layer.add',layer:custom.layers[0]},{type:'project.set',values:{duration:1,orientWithObject:true}}]}));
    assert.deepEqual(project.document.layers,custom.layers);assert.equal(project.document.lifecycle,'duration');
    project=owner('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:[{type:'locks.set',locks:[{layerId:'@effect',field:'lifecycle'}]}]});
    assert.equal((await tool('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:[{type:'project.set',values:{lifecycle:'impact'}}]})).error.code,'LOCKED');
    owner('policy.set',{projectId:project.id,paused:true});assert.equal((await tool('changes.apply',{projectId:project.id,expectedRevision:project.revision,changes:[{type:'project.set',values:{name:'Paused'}}]})).error.code,'AI_PAUSED');owner('policy.set',{projectId:project.id,paused:false});
    const input={projectId:project.id,expectedRevision:project.revision,changes:[{type:'project.set',values:{name:'Custom DUR verified'}}]},key=randomUUID();project=ok(await tool('changes.apply',input,key));assert.deepEqual(ok(await tool('changes.apply',input,key)),project);assert.equal((await tool('changes.apply',input)).error.code,'REVISION_CONFLICT');
    const source=canonical(project.document);const draftName=page.locator('.inspector-title input');await draftName.fill('Pending human draft');
    const view=ok(await invoke('view.inspect',{viewSessionId}));assert(view.draftDirty);assert.equal(view.draft.layers[0].name,'Pending human draft');
    assert.equal((await invoke('view.open',{viewSessionId,projectId:project.id,expectedViewRevision:view.viewRevision})).error.code,'DRAFT_CONFLICT');
    async function collect(name:string,input:object,fileName:string){
      const job=ok(await tool(name,input));await app.studio.drainJobs();const result=job.artifact?{status:'succeeded',artifacts:[job.artifact]}:ok(await tool('jobs.get',{jobId:job.id}));assert.equal(result.status,'succeeded',JSON.stringify(result.error));
      const artifact=result.artifacts.find((a:any)=>a.fileName===fileName);assert(artifact,fileName);let offset=0;const chunks:Buffer[]=[];
      for(;;){const part=ok(await invoke('artifacts.read',{viewSessionId,artifactId:artifact.id,offset,length:4096}));const bytes=Buffer.from(part.base64,'base64');assert.equal(hash(bytes),part.chunkSha256);chunks.push(bytes);if(part.nextOffset===null)break;offset=part.nextOffset;}
      const bytes=Buffer.concat(chunks);assert.equal(bytes.length,artifact.size);assert.equal(hash(bytes),artifact.sha256);report.files.push({jobId:job.id,name:fileName,sha256:hash(bytes),bytes:bytes.length,metadata:result.metadata});return bytes;
    }
    const camera={position:[0,-6,1.2],target:[0,0,1.2],fov:39},base={projectId:project.id,revision:project.revision};
    const first=await collect('preview.request',{...base,time:0,cycles:3,camera},'preview.png');
    const third=await collect('preview.request',{...base,time:2,cycles:3,camera},'preview.png');assert.deepEqual(first,third);await writeFile(join(out,'cycle-boundary.png'),third);
    const video=await collect('preview.request',{...base,format:'webm',cycles:3,camera},'preview.webm');const videoPath=join(out,'three-cycles.webm');await writeFile(videoPath,video);
    const info=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,r_frame_rate','-of','json',videoPath],{windowsHide:true})).stdout);assert.equal(info.streams[0].nb_read_frames,'90');assert.equal(info.streams[0].r_frame_rate,'30/1');
    const integration=JSON.parse((await collect('candidate.build',{...base,modelName:'webmcp_dur'},'vfx-integration.json')).toString());assert.equal(integration.lifecycle.mode,'duration');assert.equal(integration.visualeffects2da.columns.Type_FD,'D');assert.equal(integration.nativeVerified,false);
    const zip=await collect('projects.export',base,'studio-project.zip');assert.equal(canonical(importProjectBundle(zip.toString('base64'))),source);
    assert.equal(canonical(owner('projects.inspect',{projectId:project.id}).document),source);assert(ok(await invoke('view.inspect',{viewSessionId})).draftDirty);assert.equal(await draftName.inputValue(),'Pending human draft');
    await draftName.fill('Geometria');await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).waitFor();assert.equal((await invoke('connection.inspect')).error.code,'WEBMCP_NOT_CONNECTED');
    assert.deepEqual(errors,[]);report.passed=true;
  }catch(e){report.failure=String(e);await writeFile(join(out,'failure.html'),await page.content());throw e;}
  finally{report.consoleErrors=errors;await writeFile(join(out,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
