import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,basename,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {unzipSync} from 'fflate';
import {chromium,type Page} from 'playwright';
import {createApp} from '../apps/service/src/app.js';
import {createRenderer} from '../apps/service/src/render.js';
import {makeTrailLayer,type TrailLayer} from '../packages/core/src/model.js';
import {readAsciiMdl} from '../packages/nwn-format/src/index.js';
import {operationSchemas} from '../packages/contracts/src/schema.js';
import {BINARY_PROFILE_ID} from '../packages/core/src/export-profiles.js';

const execute=promisify(execFile),port=14350,origin=`http://127.0.0.1:${port}`,sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
async function invoke(page:Page,name:string,input:unknown={}) {return page.evaluate(async({name,input})=>{const t=(window as any).__trailTools.get(`studio.${name}`);if(!t)throw new Error(`Missing tool ${name}`);return t.execute(input);},{name,input});}
test('six custom trails through CLI, real adapter/UI, permissions, portable ZIP and matching PNG/WebM/candidate', {timeout:240000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'nwn-vfx-trail-browser-')),output=resolve('output/playwright/trails');await mkdir(output,{recursive:true});
  const app=await createApp({dataDir:directory,port,webDir:resolve('dist/web'),render:createRenderer(origin)});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{})});
  const report:any={passed:false,registration:'explicit test mock; live Codex host proof is separate',nativeVerified:false};
  const owner=async(operation:string,input:object)=>{const r=(await app.inject({method:'POST',url:'/api/commands',headers:{host:`127.0.0.1:${port}`,authorization:`Bearer ${app.studio.config.ownerToken}`},payload:{operation,input,idempotencyKey:randomUUID()}})).json();assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try {
    await app.listen({host:'127.0.0.1',port});const project=await owner('projects.create',{preset:'empty',name:'Six generic custom trails'});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addInitScript(()=>{const registry=new Map();(window as any).__trailTools=registry;
      Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){registry.set(t.name,t);},unregisterTool(n:string){registry.delete(n);}}});});
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();
    await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).click();
    const connection=await invoke(page,'connection.inspect');assert.equal(connection.status,'ok');const viewSessionId=connection.data.viewSessionId;
    const tool=async(name:string,input:object,key=randomUUID())=>invoke(page,name,{viewSessionId,input,...(operationSchemas[name].mutates?{idempotencyKey:key}:{})});
    const trails:TrailLayer[]=Array.from({length:6},(_,i)=>{const k=i%3,start=i<3?.12+k*.1:1.94+k*.12,journey=i<3?1.0:1.03-k*.025,tail=i<3?.5:.7-k*.03;
      return {...makeTrailLayer(`t${i}`,`Thread ${i}`,journey+tail),start,duration:journey+tail,tailLifetime:tail,
        path:Array.from({length:64},(_,j)=>{const f=j/63;return {time:f*journey,position:[-.3+k*.3+.13*Math.sin(f*Math.PI*2+k),.09*Math.sin(f*Math.PI*1.6+k),.06+f*2.3]};})};});
    const changes=[{type:'project.set',values:{duration:4}},{type:'layer.remove',layerId:'sparks'},...trails.map(layer=>({type:'layer.add',layer}))];
    const preview=await tool('changes.preview',{projectId:project.id,expectedRevision:1,changes});assert.equal(preview.status,'ok',JSON.stringify(preview.error));
    const key=randomUUID(),args={projectId:project.id,expectedRevision:1,changes},saved=await tool('changes.apply',args,key);assert.equal(saved.status,'ok',JSON.stringify(saved.error));
    assert.equal(saved.data.document.schemaVersion,6);const replay=await tool('changes.apply',args,key);assert.deepEqual(replay.data,saved.data);assert.equal(replay.operationId,saved.operationId);let revision=saved.data.revision;
    assert.equal((await tool('changes.apply',{...args,changes:[{type:'layer.set',layerId:'t0',values:{width:.02}}]})).error.code,'REVISION_CONFLICT');
    await page.getByText(`rewizja ${revision}`,{exact:true}).waitFor();
    let view=(await invoke(page,'view.inspect',{viewSessionId})).data;
    assert.equal((await invoke(page,'view.set',{viewSessionId,projectId:project.id,expectedRevision:revision,expectedViewRevision:view.viewRevision,selectedLayerId:'t0',playing:false,time:.4})).status,'ok');
    const pathEditor=page.getByRole('textbox',{name:'Ścieżka smugi JSON',exact:true});await pathEditor.fill('[{"time":');
    view=(await invoke(page,'view.inspect',{viewSessionId})).data;assert(view.draftDirty);assert.equal(view.meshEditorDrafts.t0.path.text,'[{"time":');assert.deepEqual(view.draft.layers[0].path,trails[0].path);
    const fork=await tool('projects.fork',{projectId:project.id,revision,name:'Portable target'});assert.equal(fork.status,'ok');
    assert.equal((await invoke(page,'view.open',{viewSessionId,projectId:fork.data.id,expectedViewRevision:view.viewRevision})).error.code,'DRAFT_CONFLICT');
    await page.getByRole('button',{name:'Odrzuć tekst ścieżki',exact:true}).click();
    const locked=await owner('changes.apply',{projectId:project.id,expectedRevision:revision,changes:[{type:'locks.set',locks:[{layerId:'t0',field:'path'}]}]});revision=locked.revision;
    assert.equal((await tool('changes.apply',{projectId:project.id,expectedRevision:revision,changes:[{type:'layer.set',layerId:'t0',values:{path:trails[0].path}}]})).error.code,'LOCKED');
    await owner('policy.set',{projectId:project.id,paused:true});assert.equal((await tool('changes.apply',{projectId:project.id,expectedRevision:revision,changes:[{type:'layer.set',layerId:'t1',values:{width:.02}}]})).error.code,'AI_PAUSED');await owner('policy.set',{projectId:project.id,paused:false});
    const updated=await tool('changes.apply',{projectId:project.id,expectedRevision:revision,changes:[{type:'layer.set',layerId:'t1',values:{width:.02}}]});assert.equal(updated.status,'ok');revision=updated.data.revision;
    const history=await tool('revisions.list',{projectId:project.id});assert.equal(history.data.items[0].actorKind,'agent');assert(history.data.items[0].committedAt);

    // Atomic path undo preserves an independent later head edit.
    const pathEdit=await tool('changes.apply',{projectId:project.id,expectedRevision:revision,changes:[{type:'layer.set',layerId:'t3',values:{path:trails[3].path.map(p=>({...p,position:[p.position[0]+.02,p.position[1],p.position[2]]}))}}]});assert.equal(pathEdit.status,'ok');revision=pathEdit.data.revision;
    const headEdit=await tool('changes.apply',{projectId:project.id,expectedRevision:revision,changes:[{type:'layer.set',layerId:'t3',values:{head:{enabled:true,size:.03}}}]});assert.equal(headEdit.status,'ok');revision=headEdit.data.revision;
    const undone=await tool('changes.revert',{projectId:project.id,expectedRevision:revision,operationId:pathEdit.operationId});assert.equal(undone.status,'ok',JSON.stringify(undone.error));revision=undone.data.revision;
    assert.deepEqual(undone.data.document.layers[3].path,trails[3].path);assert.equal(undone.data.document.layers[3].head.size,.03);report.selectiveUndo=true;

    // Exercise the packaged command from a foreign working directory, using a
    // scoped actor provisioned for this isolated test. Do not print its token.
    const actor=await owner('actors.create',{name:'Trail CLI agent',projectIds:[project.id],scopes:['read','edit']}),config=join(directory,'client.json');
    await writeFile(config,JSON.stringify({endpoint:origin,workspaceId:app.studio.config.workspaceId,instanceId:app.studio.config.instanceId}));
    const patch=join(directory,'change.json');await writeFile(patch,JSON.stringify([{type:'layer.set',layerId:'t2',values:{glowStrength:.14}}]));
    const cli=await execute(process.execPath,[resolve('dist/node/cli.js'),'--json','changes','apply','--project',project.id,'--expected-revision',String(revision),'--input-file',patch,'--idempotency-key',randomUUID()],
      {cwd:directory,env:{...process.env,NWN_VFX_CONFIG:config,NWN_VFX_TOKEN:actor.token,NWN_VFX_ENDPOINT:origin,NWN_VFX_WORKSPACE:app.studio.config.workspaceId},windowsHide:true,timeout:30000,maxBuffer:1024*1024});
    const cliResult=JSON.parse(cli.stdout);assert.equal(cliResult.status,'ok',JSON.stringify(cliResult.error));revision=cliResult.data.revision;report.cli=true;
    const jobs:Array<{operation:string;id?:string;immediate?:any;prefix?:string}>=[];
    for(const [operation,input] of [['preview.request',{projectId:project.id,revision,time:2.6,format:'png'}],['preview.request',{projectId:project.id,revision,time:0,format:'webm'}],['candidate.build',{projectId:project.id,revision}],['projects.export',{projectId:project.id,revision}],['preview.request',{projectId:project.id,revision,time:0,format:'png'}],['preview.request',{projectId:project.id,revision,time:4,format:'png'}]] as const) {
      const result=await tool(operation,input);
      if(operation==='projects.export'){assert.equal(result.status,'ok',JSON.stringify(result.error));jobs.push({operation,immediate:{type:operation,status:'succeeded',revision,artifacts:[result.data.artifact]}});}
      else{assert.equal(result.status,'accepted',JSON.stringify(result.error));jobs.push({operation,id:result.data.id,prefix:operation==='preview.request'&&input.format==='png'&&input.time!==2.6?`${operation}-${input.time}`:operation});}
    }
    await app.studio.drainJobs();const files=new Map<string,Buffer>();report.jobs=[];
    for(const expected of jobs) {
      const response=expected.immediate?{status:'ok',data:expected.immediate}:await tool('jobs.get',{jobId:expected.id});assert.equal(response.status,'ok',JSON.stringify(response.error));const job=response.data;assert.equal(job.status,'succeeded',JSON.stringify(job.error));
      report.jobs.push({id:job.id,type:job.type,revision:job.revision,metadata:job.metadata});
      for(const artifact of job.artifacts.filter((a:any)=>['preview.png','preview.webm','handoff.json'].includes(a.name)||a.name.endsWith('.zip'))) {
        let offset=0;const chunks:Buffer[]=[];
        for(;;) {const r=await invoke(page,'artifacts.read',{viewSessionId,artifactId:artifact.id,offset,length:262144});assert.equal(r.status,'ok');const chunk=Buffer.from(r.data.base64,'base64');assert.equal(sha(chunk),r.data.chunkSha256);chunks.push(chunk);if(r.data.nextOffset===null)break;offset=r.data.nextOffset;}
        const bytes=Buffer.concat(chunks);assert.equal(bytes.length,artifact.size);assert.equal(sha(bytes),artifact.sha256);const name=`${expected.prefix??expected.operation}-${artifact.name}`;files.set(name,bytes);await writeFile(join(output,name),bytes);
        if(expected.operation==='projects.export'&&artifact.name.endsWith('.zip')) {const imported=await owner('projects.import',{bundleBase64:bytes.toString('base64')});assert.deepEqual(imported.document,cliResult.data.document);report.portable=true;}
        if(expected.operation==='candidate.build'&&artifact.name.endsWith('.zip')) {const zipped=unzipSync(bytes),mdlName=Object.keys(zipped).find(n=>n.endsWith('.mdl'))!;assert.equal(readAsciiMdl(zipped[mdlName]).nodes.filter(n=>n.type==='animmesh').length,12);
          const validation=JSON.parse(Buffer.from(zipped['validation.json']).toString());assert.equal(validation.readback.trails.length,12);assert.equal(validation.nativeVerified,false);report.candidate=validation.readback.trails;}
      }
    }
    if ((await tool('capabilities',{})).data.exportProfiles.some((p:any)=>p.id===BINARY_PROFILE_ID&&p.available)) {
      const binary=await tool('candidate.build',{projectId:project.id,revision,profileId:BINARY_PROFILE_ID});
      assert.equal(binary.status,'accepted',JSON.stringify(binary.error));await app.studio.drainJobs();
      const binaryJob=(await tool('jobs.get',{jobId:binary.data.id})).data;
      assert.equal(binaryJob.status,'succeeded',JSON.stringify(binaryJob.error));
      assert.equal(binaryJob.metadata.validation.profileId,BINARY_PROFILE_ID);assert(binaryJob.metadata.validation.compilation.roundtripVerified);
      const artifact=binaryJob.artifacts.find((a:any)=>a.name==='validation.json'),chunks:Buffer[]=[];let offset=0;
      for(;;){const r=await invoke(page,'artifacts.read',{viewSessionId,artifactId:artifact.id,offset,length:262144});assert.equal(r.status,'ok');chunks.push(Buffer.from(r.data.base64,'base64'));if(r.data.nextOffset===null)break;offset=r.data.nextOffset;}
      assert.equal(sha(Buffer.concat(chunks)),artifact.sha256);
      await page.getByText(`rewizja ${revision}`,{exact:true}).waitFor();
      await page.getByRole('checkbox',{name:'Binarny eksport NWN',exact:true}).check();
      const response=page.waitForResponse(r=>r.url().endsWith('/api/commands')&&r.request().postDataJSON()?.operation==='candidate.build');
      await page.getByRole('button',{name:'Eksport NWN',exact:true}).click();
      const uiResponse=await response;assert.equal(uiResponse.request().postDataJSON().input.profileId,BINARY_PROFILE_ID);
      const uiAccepted=await uiResponse.json();assert.equal(uiAccepted.status,'accepted');await app.studio.drainJobs();
      const uiJob=await owner('jobs.get',{jobId:uiAccepted.data.id});assert.equal(uiJob.status,'succeeded',JSON.stringify(uiJob.error));
      await page.screenshot({path:join(output,'binary-profile-ui.png'),fullPage:true});
      report.binary={webmcpJob:binaryJob.id,uiJob:uiJob.id,profileId:BINARY_PROFILE_ID,compilation:binaryJob.metadata.validation.compilation,artifactSha256:artifact.sha256};
    }
    const video=join(output,'preview.request-preview.webm'),png=join(output,'preview.request-preview.png');
    const rgb=async(path:string,frame?:number)=>(await execute('ffmpeg',['-v','error','-i',path,...(frame===undefined?[]:['-vf',`select=eq(n\\,${frame})`]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',timeout:30000,maxBuffer:3*1024*1024})).stdout;
    const still=await rgb(png),same=await rgb(video,78),first=await rgb(video,0),last=await rgb(video,119);
    const baseline=await rgb(join(output,'preview.request-0-preview.png')),end=await rgb(join(output,'preview.request-4-preview.png'));
    assert.equal(sha(baseline),sha(end));assert(new Set(baseline).size>50,'Default grid/reference scene remains visible');
    const meanError=(a:Buffer,b:Buffer)=>{let error=0;for(let i=0;i<a.length;i++)error+=Math.abs(a[i]-b[i]);return error/a.length;};
    const mae=meanError(still,same),firstLastError=meanError(first,last);assert(mae<4);assert(firstLastError<2);assert.notEqual(sha(first),sha(same));report.render={frames:120,pngWebmMeanAbsoluteError:mae,baselinePngIdentical:true,defaultHelpersPreserved:true,firstLastVideoMeanAbsoluteError:firstLastError};
    await execute('ffmpeg',['-v','error','-y','-i',video,'-vf',"select='eq(n,0)+eq(n,15)+eq(n,30)+eq(n,45)+eq(n,60)+eq(n,71)+eq(n,78)+eq(n,86)+eq(n,92)+eq(n,102)+eq(n,117)+eq(n,119)',scale=480:320,tile=3x4",'-frames:v','1',join(output,'contact.png')],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
    assert.deepEqual(errors,[]);report.passed=true;report.projectId=project.id;report.revision=revision;
  } finally {await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(resolve(dirname(directory)),resolve(tmpdir()));assert(basename(directory).startsWith('nwn-vfx-trail-browser-'));await rm(directory,{recursive:true,force:true});}
});
