import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {paletteFixture,paletteOptions} from './fixtures/palette.js';
import {operationSchemas} from '../packages/contracts/src/schema.js';
import {canonical} from '../apps/service/src/store.js';
const execute=promisify(execFile),port=14353,origin=`http://127.0.0.1:${port}`,sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('palette UI preview/commit, CLI, registered WebMCP, PNG/WebM and export use identical revisions',{timeout:240000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-palette-browser-')),out=resolve('output/playwright/palette');await mkdir(out,{recursive:true});
 const app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{})});
 const owner=async(operation:string,input:object)=>{const r=(await app.inject({method:'POST',url:'/api/commands',headers:{host:`127.0.0.1:${port}`,authorization:`Bearer ${app.studio.config.ownerToken}`},payload:{operation,input,idempotencyKey:randomUUID()}})).json();assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
 const report:any={passed:false,registration:'controlled WebMCP host registry; live Codex discovery not claimed',nativeVerified:false};
 try{
  const project=await owner('projects.import',{document:paletteFixture()});await app.listen({host:'127.0.0.1',port});
  const context=await browser.newContext({viewport:{width:1500,height:1100}});await context.addInitScript(()=>{
   const registry=new Map();(window as any).__paletteTools=registry;Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});
   Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){registry.set(t.name,t);},unregisterTool(n:string){registry.delete(n);}}});
  });
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();
  await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).click();
  const invoke=(name:string,input:unknown={})=>page.evaluate(async({name,input})=>(window as any).__paletteTools.get(`studio.${name}`).execute(input),{name,input});
  const viewSessionId=(await invoke('connection.inspect')).data.viewSessionId;
  const tool=(name:string,input:object,key=randomUUID())=>invoke(name,{viewSessionId,input,...(operationSchemas[name].mutates?{idempotencyKey:key}:{})});
  const caps=await tool('capabilities',{});assert.equal(caps.data.palette.version,'oklch-hue-rotation-v1');
  const preview=await tool('palette.preview',{projectId:project.id,expectedRevision:1,options:paletteOptions});assert.equal(preview.status,'ok',JSON.stringify(preview.error));
  assert.equal((await tool('projects.inspect',{projectId:project.id})).data.revision,1);
  await page.getByRole('button',{name:'Paleta efektu',exact:true}).click();
  await page.getByRole('checkbox',{name:'Przekształć kolory PNG',exact:true}).check();
  await page.getByRole('button',{name:'Podgląd palety',exact:true}).click();await page.getByText('Podgląd bez zapisu',{exact:false}).waitFor();
  const view=(await invoke('view.inspect',{viewSessionId})).data;assert(view.draftDirty);assert.equal(view.paletteDraft.proposalHash,preview.data.proposalHash);
  assert.equal((await tool('projects.inspect',{projectId:project.id})).data.revision,1);
  await page.screenshot({path:join(out,'palette-ui-preview.png'),fullPage:true});
  await page.getByRole('button',{name:'Zatwierdź paletę',exact:true}).click();await page.getByText('rewizja 2',{exact:true}).waitFor();
  const saved=(await tool('projects.inspect',{projectId:project.id})).data;assert.deepEqual(saved.document,preview.data.document);
  const actor=await owner('actors.create',{name:'Palette CLI test',projectIds:[project.id],scopes:['read','edit']});
  const config=join(dir,'client.json'),optionsFile=join(dir,'palette.json');await writeFile(config,JSON.stringify({endpoint:origin,workspaceId:app.studio.config.workspaceId,instanceId:app.studio.config.instanceId}));
  const options={...paletteOptions,from:'#00ff00',to:'#3484ff'};await writeFile(optionsFile,JSON.stringify(options));
  const cli=async(args:string[])=>JSON.parse((await execute(process.execPath,[resolve('dist/node/cli.js'),'--json','palette',...args,'--project',project.id,'--expected-revision','2','--input-file',optionsFile],
   {cwd:dir,windowsHide:true,timeout:30000,maxBuffer:12*1024*1024,env:{...process.env,NWN_VFX_CONFIG:config,NWN_VFX_TOKEN:actor.token,NWN_VFX_ENDPOINT:origin,NWN_VFX_WORKSPACE:app.studio.config.workspaceId}})).stdout);
  const cliPreview=await cli(['preview']);assert.equal(cliPreview.status,'ok',JSON.stringify(cliPreview.error));
  const webPreview=await tool('palette.preview',{projectId:project.id,expectedRevision:2,options});assert.deepEqual(cliPreview.data,webPreview.data);
  const key=randomUUID(),applied=await cli(['apply','--proposal-hash',cliPreview.data.proposalHash,'--idempotency-key',key]);assert.equal(applied.status,'ok',JSON.stringify(applied.error));assert.deepEqual(applied.data.project.document,cliPreview.data.document);
  const repeat=await cli(['apply','--proposal-hash',cliPreview.data.proposalHash,'--idempotency-key',key]);assert.deepEqual(repeat.data,applied.data);
  // Apply via the registered WebMCP tool on its own variant, never the accepted user project.
  const fork=await tool('projects.fork',{projectId:project.id,revision:1,name:'Palette WebMCP fork'}),forkInput={projectId:fork.data.id,expectedRevision:1,options:paletteOptions};
  const forkPreview=await tool('palette.preview',forkInput),forkApply=await tool('palette.apply',{...forkInput,proposalHash:forkPreview.data.proposalHash});assert.equal(forkApply.status,'ok',JSON.stringify(forkApply.error));
  assert.deepEqual(forkApply.data.project.document.layers,saved.document.layers);
  report.jobs=[];
  for(const [name,operation,input] of [
   ['before','preview.request',{projectId:project.id,revision:1,time:.5,format:'png'}],
   ['after','preview.request',{projectId:project.id,revision:2,time:.5,format:'png'}],
   ['video','preview.request',{projectId:project.id,revision:2,format:'webm'}],
   ['export','candidate.build',{projectId:project.id,revision:2}],
  ] as const){const submitted=await tool(operation,input);assert.equal(submitted.status,'accepted',JSON.stringify(submitted.error));await app.studio.drainJobs();const job=(await tool('jobs.get',{jobId:submitted.data.id})).data;assert.equal(job.status,'succeeded',JSON.stringify(job.error));report.jobs.push({name,revision:job.revision,snapshotHash:job.snapshotHash,metadata:job.metadata});
   for(const a of job.artifacts.filter((a:any)=>['preview.png','preview.webm','validation.json','handoff.json'].includes(a.name))){const chunks:Buffer[]=[];let offset=0;for(;;){const r=await invoke('artifacts.read',{viewSessionId,artifactId:a.id,offset,length:262144});assert.equal(r.status,'ok');const b=Buffer.from(r.data.base64,'base64');assert.equal(sha(b),r.data.chunkSha256);chunks.push(b);if(r.data.nextOffset===null)break;offset=r.data.nextOffset;}const bytes=Buffer.concat(chunks);assert.equal(sha(bytes),a.sha256);await writeFile(join(out,`${name}-${a.name}`),bytes);}
  }
  report.savedSnapshotSha256=sha(Buffer.from(canonical(saved.document)));
  for(const name of ['after','video','export']){
    const handoff=JSON.parse(await readFile(join(out,`${name}-handoff.json`),'utf8'));
    assert.equal(handoff.snapshotSha256,report.savedSnapshotSha256);assert.equal(handoff.revision,2);
    assert.deepEqual(handoff.assets.map((a:any)=>a.id),saved.document.assets.map((a:any)=>a.id));
  }
  const rgb=async(file:string,frame?:number)=>(await execute('ffmpeg',['-v','error','-i',join(out,file),...(frame===undefined?[]:['-vf',`select=eq(n\\,${frame})`]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',timeout:30000,maxBuffer:3*1024*1024})).stdout;
  const before=await rgb('before-preview.png'),after=await rgb('after-preview.png'),video=await rgb('video-preview.webm',15);
  let changed=0,mae=0;for(let i=0;i<after.length;i+=3){if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>25)changed++;for(let j=0;j<3;j++)mae+=Math.abs(after[i+j]-video[i+j]);}
  assert(changed>100);assert(mae/after.length<2);assert.equal(errors.length,0,errors.join('\n'));
  report.preview={changedPixels:changed,pngVideoMeanAbsoluteError:mae/after.length};report.proposal=preview.data.report;report.passed=true;
 }finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(dirname(dir),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
