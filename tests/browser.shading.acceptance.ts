import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import {smoothDeformationExample} from './fixtures/smooth-deformation.js';
import {canonical} from '../apps/service/src/store.js';
import { shadingExample } from './fixtures/mesh-shading.js';
import { operationSchemas } from '../packages/contracts/src/schema.js';
import { BINARY_PROFILE_ID } from '../packages/core/src/export-profiles.js';
import type { MeshLayer } from '../packages/core/src/model.js';

const execute=promisify(execFile),port=14352,origin=`http://127.0.0.1:${port}`,sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
for(const deform of [false,true])test(`${deform?'deformed':'rigid'} smooth shading through CLI, WebMCP, human selector, PNG/WebM and ASCII/binary normals`,{timeout:240000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'nwn-shading-browser-')),out=resolve(deform?'output/playwright/smooth-deformation':'output/playwright/shading');await mkdir(out,{recursive:true});
  const app=await createApp({dataDir:dir,port,webDir:resolve('dist/web'),render:createRenderer(origin)});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{})});
  const owner=async(operation:string,input:object)=>{const r=(await app.inject({method:'POST',url:'/api/commands',headers:{host:`127.0.0.1:${port}`,authorization:`Bearer ${app.studio.config.ownerToken}`},payload:{operation,input,idempotencyKey:randomUUID()}})).json();assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  const report:any={passed:false,registration:'controlled test registry; live Codex host discovery not claimed',nativeVerified:false};
  try {
    const fixture=deform?smoothDeformationExample():shadingExample(),initial=structuredClone(fixture.document);delete initial.layers[0].shading;(initial as any).schemaVersion=deform?7:5;
    const project=await owner('projects.import',{document:initial});await app.listen({host:'127.0.0.1',port});
    const context=await browser.newContext({viewport:{width:1440,height:1050}});
    await context.addInitScript(()=>{const registry=new Map();(window as any).__shadingTools=registry;
      Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(t:any){registry.set(t.name,t);},unregisterTool(n:string){registry.delete(n);}}});});
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    await page.getByRole('button',{name:'Połącz agenta',exact:true}).click();await page.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();
    await page.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).click();
    const invoke=(name:string,input:unknown={})=>page.evaluate(async({name,input})=>{const tool=(window as any).__shadingTools.get(`studio.${name}`);if(!tool)throw new Error(`Missing ${name}`);return tool.execute(input);},{name,input});
    const connection=await invoke('connection.inspect');assert.equal(connection.status,'ok');const viewSessionId=connection.data.viewSessionId;
    const tool=(name:string,input:object,key=randomUUID())=>invoke(name,{viewSessionId,input,...(operationSchemas[name].mutates?{idempotencyKey:key}:{})});
    const caps=await tool('capabilities',{});assert.equal(caps.data.meshShading.field,'shading');assert.equal(caps.data.meshShading.vertexDeformation,true);assert.equal(caps.data.meshShading.exportedAnimatedNormals,false);
    const args={projectId:project.id,expectedRevision:1,changes:[{type:'layer.set',layerId:fixture.layer.id,values:{shading:fixture.layer.shading}}]},key=randomUUID();
    assert.equal((await tool('changes.preview',args)).status,'ok');
    const changed=await tool('changes.apply',args,key);assert.equal(changed.status,'ok',JSON.stringify(changed.error));assert.deepEqual((await tool('changes.apply',args,key)).data,changed.data);
    await page.getByText('rewizja 2',{exact:true}).waitFor();
    let view=(await invoke('view.inspect',{viewSessionId})).data;
    assert.equal((await invoke('view.set',{viewSessionId,projectId:project.id,expectedRevision:2,expectedViewRevision:view.viewRevision,selectedLayerId:fixture.layer.id,playing:false,time:.6})).status,'ok');
    await page.getByRole('combobox',{name:'Cieniowanie geometrii',exact:true}).selectOption('flat');
    await page.getByRole('combobox',{name:'Cieniowanie geometrii',exact:true}).selectOption('smooth');
    await page.getByRole('combobox',{name:'Cieniowanie geometrii',exact:true}).selectOption('flat');
    view=(await invoke('view.inspect',{viewSessionId})).data;assert(view.draftDirty);assert.equal(view.draft.layers[0].shading,'flat');assert.equal(view.savedDocument.layers[0].shading,'smooth');
    const fork=await tool('projects.fork',{projectId:project.id,revision:2,name:'Shading draft conflict control'});assert.equal(fork.status,'ok');
    assert.equal((await invoke('view.open',{viewSessionId,projectId:fork.data.id,expectedViewRevision:view.viewRevision})).error.code,'DRAFT_CONFLICT');
    await page.getByRole('button',{name:'Zapisz',exact:true}).click();await page.getByText('rewizja 3',{exact:true}).waitFor();
    const actor=await owner('actors.create',{name:'Shading CLI agent',projectIds:[project.id],scopes:['read','edit']});
    const config=join(dir,'client.json'),patch=join(dir,'changes.json');
    await writeFile(config,JSON.stringify({endpoint:origin,workspaceId:app.studio.config.workspaceId,instanceId:app.studio.config.instanceId}));
    await writeFile(patch,JSON.stringify([{type:'layer.set',layerId:fixture.layer.id,values:{shading:'smooth'}}]));
    const cli=JSON.parse((await execute(process.execPath,[resolve('dist/node/cli.js'),'--json','changes','apply','--project',project.id,'--expected-revision','3','--input-file',patch,'--idempotency-key',randomUUID()],
      {cwd:dir,windowsHide:true,timeout:30000,maxBuffer:1024*1024,env:{...process.env,NWN_VFX_CONFIG:config,NWN_VFX_TOKEN:actor.token,NWN_VFX_ENDPOINT:origin,NWN_VFX_WORKSPACE:app.studio.config.workspaceId}})).stdout);
    assert.equal(cli.status,'ok',JSON.stringify(cli.error));const revision=cli.data.revision;
    const camera=fixture.camera;
    await page.getByText('rewizja 4',{exact:true}).waitFor();
    await page.screenshot({path:join(out,'shading-ui.png'),fullPage:true});
    const submissions:any[]=[];
    for(const [name,operation,input] of [
      ['png','preview.request',{projectId:project.id,revision,time:.5,format:'png',camera}],
      ['flat','preview.request',{projectId:project.id,revision:3,time:.5,format:'png',camera}],
      ['webm','preview.request',{projectId:project.id,revision,format:'webm',camera}],
      ['ascii','candidate.build',{projectId:project.id,revision}],
      ['binary','candidate.build',{projectId:project.id,revision,profileId:BINARY_PROFILE_ID}],
    ] as const){const r=await tool(operation,input);assert.equal(r.status,'accepted',JSON.stringify(r.error));submissions.push({name,id:r.data.id});}
    await app.studio.drainJobs();report.jobs=[];
    for(const {name,id} of submissions){const response=await tool('jobs.get',{jobId:id});assert.equal(response.status,'ok',JSON.stringify(response.error));const job=response.data;assert.equal(job.status,'succeeded',JSON.stringify(job.error));report.jobs.push({name,id,revision:job.revision,metadata:job.metadata});
      for(const artifact of job.artifacts.filter((a:any)=>['preview.png','preview.webm','validation.json','handoff.json'].includes(a.name)||a.name.endsWith('.zip'))){
        const chunks:Buffer[]=[];let offset=0;
        for(;;){const r=await invoke('artifacts.read',{viewSessionId,artifactId:artifact.id,offset,length:262144});assert.equal(r.status,'ok');const chunk=Buffer.from(r.data.base64,'base64');assert.equal(sha(chunk),r.data.chunkSha256);chunks.push(chunk);if(r.data.nextOffset===null)break;offset=r.data.nextOffset;}
        const data=Buffer.concat(chunks);assert.equal(data.length,artifact.size);assert.equal(sha(data),artifact.sha256);await writeFile(join(out,`${name}-${artifact.name}`),data);
        if(artifact.name==='handoff.json'&&name!=='flat')assert.equal(JSON.parse(data.toString()).snapshotSha256,sha(Buffer.from(canonical(cli.data.document))));
      }
    }
    const metadata=(name:string)=>report.jobs.find((j:any)=>j.name===name).metadata;
    const shading=metadata('ascii').validation.readback.meshes[0].shading;
    assert.equal(shading.mode,'smooth');assert.equal(shading.smoothingMask,1);
    for(const name of ['png','webm']){const r=metadata(name).meshShading[0];assert.equal(r.cornerNormalsSha256,shading.cornerNormalsSha256);assert.equal(r.mode,'smooth');}
    if(!deform)assert.equal(metadata('flat').meshShading[0].mode,'flat');
    else{
      assert.equal(shading.exportedAnimatedNormals,false);
      for(const name of ['png','webm']){assert.deepEqual(metadata(name).meshShading[0].deformationNormals,shading.deformationNormals);assert.equal(metadata(name).deformations[0].animvertsSha256,metadata('ascii').validation.readback.meshes[0].deformation.animvertsSha256);}
      assert.equal(metadata('binary').validation.compilation.normalReadback.animmeshNodes,2);
      assert.equal(metadata('binary').validation.compilation.normalReadback.animatedNormalSamples,0);
      assert.deepEqual(cli.data.document.layers[0].animation,fixture.layer.animation);
      assert.deepEqual(cli.data.document.layers[0].geometry,fixture.layer.geometry);
    }
    assert.deepEqual(metadata('binary').validation.readback.meshes[0].shading,shading);
    const proof=metadata('binary').validation.compilation;assert(proof.roundtripVerified);assert(proof.normalReadback.allCornersRead);assert(proof.normalReadback.maxComponentError<.00001);
    const rgb=async(path:string,frame?:number)=>(await execute('ffmpeg',['-v','error','-i',path,...(frame===undefined?[]:['-vf',`select=eq(n\\,${frame})`]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',timeout:30000,maxBuffer:3*1024*1024})).stdout;
    const still=await rgb(join(out,'png-preview.png')),video=await rgb(join(out,'webm-preview.webm'),15),baseline=await rgb(join(out,'flat-preview.png'));
    let changedPixels=0,error=0;for(let i=0;i<still.length;i+=3){if(Math.abs(still[i]-baseline[i])>20)changedPixels++;for(let j=0;j<3;j++)error+=Math.abs(still[i+j]-video[i+j]);}
    assert(changedPixels>100);assert(error/still.length<2);assert.equal(errors.length,0,errors.join('\n'));
    report.preview={pixelsWithShadingDifferenceOver20:changedPixels,pngVideoMeanAbsoluteError:error/still.length,frame:15};report.passed=true;
  }finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await app.close();assert.equal(dirname(dir),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
