import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Browser, Page } from 'playwright';
import { createRenderer, type RendererDependencies } from '../apps/service/src/render.js';
import { rendererFailure, safeRenderMessage } from '../apps/service/src/render-errors.js';
import { createApp } from '../apps/service/src/app.js';
import { DomainError, makeDocument } from '../packages/core/src/model.js';
import { validateOperationOutput } from '../packages/contracts/src/schema.js';

const document=makeDocument('empty');
test('an existing encoder failure retains late page errors without replacing its primary cause',()=>{
  const original=rendererFailure(new Error('Encoder failed'),{stage:'encoder'});
  const pageError={stage:'frame' as const,name:'Error',message:'WebGL context lost',frameIndex:12,frameTime:.4};
  const wrapped=rendererFailure(original,{stage:'encoder',frameIndex:12,frameTime:.4},[pageError]);
  const repeated=rendererFailure(wrapped,{stage:'encoder'},[pageError]);
  assert.equal((repeated.details as any).cause.message,'Encoder failed');
  assert.equal((repeated.details as any).frameIndex,12);
  assert.deepEqual((repeated.details as any).pageErrors,[pageError]);
});
type Stage='page'|'navigation'|'ready'|'document'|'render'|'frame'|'screenshot'|'cleanup';
function fixture(failures:Partial<Record<Stage,Error>>={},hooks:{evaluate?:(argument:any,events:EventEmitter)=>Promise<void>;screenshot?:()=>Promise<Buffer>;close?:()=>Promise<void>}={}) {
  const events=new EventEmitter();let closeCalls=0,launchCalls=0;
  const reject=(stage:Stage)=>{if(failures[stage])throw failures[stage];};
  const page={on:events.on.bind(events),goto:async()=>{reject('navigation');return null;},waitForFunction:async()=>{reject('ready');return {} as any;},
    evaluate:async(_function:unknown,argument:any)=>{reject(typeof argument==='number'?'frame':argument?.doc?'render':'document');await hooks.evaluate?.(argument,events);},
    locator:()=>({screenshot:async()=>{reject('screenshot');return hooks.screenshot?hooks.screenshot():Buffer.from([137,80,78,71]);}})} as unknown as Page;
  const browser:Pick<Browser,'newPage'|'close'>={newPage:async()=>{reject('page');return page;},close:async()=>{closeCalls++;reject('cleanup');await hooks.close?.();}};
  const dependencies:RendererDependencies={launch:async()=>{launchCalls++;return browser;},encodeWebmFrames:async({frame,frameCount})=>{
    for(let i=0;i<frameCount;i++)await frame(i);return Uint8Array.of(1,2,3);
  }};
  return {dependencies,browser,events,closeCalls:()=>closeCalls,launchCalls:()=>launchCalls};
}
const options=(signal=new AbortController().signal,format:'png'|'webm'='png')=>({time:.5,format,signal});
async function failure(work:Promise<unknown>):Promise<DomainError> {try{await work;assert.fail('Expected renderer failure');}catch(error){assert.ok(error instanceof DomainError);return error;}}

test('launch diagnostics distinguish executable missing, timeout, spawn permissions and unrelated ENOENT without changing launch timeout',async()=>{
  const timeout=Object.assign(new Error('browserType.launch: Timeout 30000ms exceeded.'),{name:'TimeoutError'});
  const cases:[Error,string][]=[
    [new Error("browserType.launch: Executable doesn't exist at C:\\Users\\private-user\\secret-dir\\chrome.exe"),'RENDERER_EXECUTABLE_MISSING'],
    [timeout,'RENDERER_LAUNCH_TIMEOUT'],
    [Object.assign(new Error('spawn chrome EPERM'),{code:'EPERM',syscall:'spawn chrome'}),'RENDERER_LAUNCH_FAILED'],
    [Object.assign(new Error('open profile ENOENT'),{code:'ENOENT',syscall:'open'}),'RENDERER_LAUNCH_FAILED'],
    [Object.assign(new Error('spawn chrome ENOENT'),{code:'ENOENT',syscall:'spawn chrome'}),'RENDERER_EXECUTABLE_MISSING'],
  ];
  for(const [cause,code]of cases) {
    const result=await failure(createRenderer('http://127.0.0.1:4317',{launch:async(config)=>{
      assert.equal(config.timeout,undefined);assert.equal(config.headless,true);
      assert.equal(config.channel,process.platform==='win32'?'chromium':undefined);
      assert.deepEqual(config.args,['--use-angle=swiftshader','--enable-unsafe-swiftshader']);throw cause;
    }})(document,options()));
    assert.equal(result.code,code);assert.equal((result.details as any).stage,'launch');assert.equal((result.details as any).cause.name,cause.name);
    assert.ok(!JSON.stringify(result.details).includes('private-user'));assert.ok(!JSON.stringify(result.details).includes('secret-dir'));
    if(code!=='RENDERER_EXECUTABLE_MISSING')assert.ok(!result.message.includes('Zainstaluj'));
  }
});

test('navigation, page readiness, document preparation, PNG evaluation and screenshot failures keep truthful stage and raw reason',async()=>{
  for(const stage of ['page','navigation','ready','document','render','screenshot'] as const) {
    const f=fixture({[stage]:new Error(`${stage} exploded`)});
    const result=await failure(createRenderer('http://127.0.0.1:4317',f.dependencies)(document,options(undefined,stage==='document'?'webm':'png')));
    assert.equal(result.code,'RENDER_FAILED');assert.equal((result.details as any).stage,stage);assert.match((result.details as any).cause.message,/exploded/);assert.equal(f.closeCalls(),1);
  }
  const f=fixture({ready:Object.assign(new Error('Timeout 15000ms exceeded'),{name:'TimeoutError'})});
  const result=await failure(createRenderer('http://127.0.0.1:4317',f.dependencies)(document,options()));assert.equal(result.code,'RENDER_TIMEOUT');assert.equal((result.details as any).stage,'ready');
});

test('a failed video frame keeps its index/time and relevant pageerror through the outer encoder wrapper',async()=>{
  const f=fixture({}, {evaluate:async(argument,events)=>{if(argument===2/30){events.emit('pageerror',new Error('Shader compilation failed at C:\\private\\renderer.ts'));throw new Error('page.evaluate: draw failed');}}});
  const result=await failure(createRenderer('http://127.0.0.1:4317',f.dependencies)(document,options(undefined,'webm')));
  const details=result.details as any;assert.equal(result.code,'RENDER_FAILED');assert.equal(details.stage,'frame');assert.equal(details.frameIndex,2);assert.equal(details.frameTime,2/30);
  assert.match(details.cause.message,/draw failed/);assert.match(details.pageErrors[0].message,/Shader compilation failed/);assert.equal(details.pageErrors[0].frameIndex,2);
  assert.equal(f.closeCalls(),1);assert.ok(!JSON.stringify(details).includes('private'));
});

test('uncaught page errors cannot silently produce a successful image',async()=>{
  const f=fixture({}, {evaluate:async(_argument,events)=>{for(let i=0;i<8;i++)events.emit('pageerror',new Error('Uncaught texture failure '+i));}});
  const result=await failure(createRenderer('http://127.0.0.1:4317',f.dependencies)(document,options()));
  assert.equal(result.code,'RENDER_PAGE_ERROR');assert.equal((result.details as any).pageErrors.length,5);assert.equal((result.details as any).pageErrors[0].message,'Uncaught texture failure 3');
});

test('encoder errors retain their code and inherit the last available frame without overwriting inner frame failures',async()=>{
  const f=fixture();f.dependencies.encodeWebmFrames=async({frame})=>{await frame(3);throw rendererFailure(new DomainError('RENDERER_UNAVAILABLE','FFmpeg is unavailable'),{stage:'encoder'});};
  const result=await failure(createRenderer('http://127.0.0.1:4317',f.dependencies)(document,options(undefined,'webm')));
  assert.equal(result.code,'RENDERER_UNAVAILABLE');assert.equal((result.details as any).stage,'encoder');assert.equal((result.details as any).frameIndex,3);assert.equal((result.details as any).frameTime,.1);assert.match((result.details as any).cause.message,/FFmpeg/);
});

test('cleanup cannot replace a render failure and cleanup-only failure is reported honestly',async()=>{
  const cleanup=Object.assign(new Error('close C:\\private\\profile.json failed with EPERM'),{code:'EPERM'});
  const broken=fixture({render:new Error('primary shader failure'),cleanup});
  const primary=await failure(createRenderer('http://127.0.0.1:4317',broken.dependencies)(document,options()));
  assert.equal(primary.code,'RENDER_FAILED');assert.equal((primary.details as any).stage,'render');assert.match((primary.details as any).cause.message,/primary shader/);assert.equal((primary.details as any).cleanupError.code,'EPERM');
  const cleanupOnly=fixture({cleanup});const result=await failure(createRenderer('http://127.0.0.1:4317',cleanupOnly.dependencies)(document,options()));
  assert.equal(result.code,'RENDERER_CLEANUP_FAILED');assert.equal((result.details as any).stage,'cleanup');assert.equal(cleanupOnly.closeCalls(),1);
});

test('cancellation before launch, during launch and during screenshot remains cancellation and closes a late browser once',async()=>{
  const early=fixture(),earlyController=new AbortController();earlyController.abort();
  assert.equal((await failure(createRenderer('http://127.0.0.1:4317',early.dependencies)(document,options(earlyController.signal)))).code,'CANCELLED');assert.equal(early.launchCalls(),0);
  const delayed=fixture(),launchController=new AbortController();let release!:()=>void;
  const wait=new Promise<void>(resolve=>{release=resolve;});delayed.dependencies.launch=async()=>{await wait;return delayed.browser;};
  const pending=createRenderer('http://127.0.0.1:4317',delayed.dependencies)(document,options(launchController.signal));launchController.abort();release();
  assert.equal((await failure(pending)).code,'CANCELLED');assert.equal(delayed.closeCalls(),1);
  let entered!:()=>void,rejectScreenshot!:(reason:unknown)=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
  const screenshot=fixture({}, {screenshot:async()=>{entered();return new Promise<Buffer>((_resolve,reject)=>{rejectScreenshot=reject;});},close:async()=>{rejectScreenshot(new Error('Target page closed'));throw new Error('Cleanup transport disconnected');}});
  const controller=new AbortController(),active=createRenderer('http://127.0.0.1:4317',screenshot.dependencies)(document,options(controller.signal));await started;controller.abort();
  const result=await failure(active);assert.equal(result.code,'CANCELLED');assert.equal((result.details as any).stage,'screenshot');assert.match((result.details as any).cleanupError.message,/transport disconnected/);assert.equal(screenshot.closeCalls(),1);
});

test('diagnostics redact credentials, paths, payloads and code while preserving useful timeout/crash reasons',()=>{
  const input="Timeout 30000ms exceeded. Executable C:\\Users\\private-user\\profile\\chrome.exe crashed\nAuthorization: Bearer privateBearer123\nownerToken=privateOwner456\n/path/private/chrome crashed\npngBase64='"+'A'.repeat(5000)+"'\n at secretFunction(secretCode.ts:7)";
  const sanitized=safeRenderMessage(input);assert.match(sanitized,/Timeout 30000ms exceeded/);assert.match(sanitized,/chrome.exe crashed/);
  for(const secret of ['private-user','profile','privateBearer123','privateOwner456','/path/private','secretFunction','AAAA'])assert.ok(!sanitized.includes(secret),secret);
  assert.ok(sanitized.length<=2000);assert.ok(!safeRenderMessage('data:image/png;base64,'+'A'.repeat(4000)).includes('AAAA'));
});

test('failed renderer details survive SQLite, jobs.get/list JSON schemas and restart; cancellation remains a cancelled job',async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'nwn-vfx-render-errors-')),f=fixture({screenshot:new Error('Screenshot rasterizer crashed at C:\\private\\gpu.dll')});
  let app=await createApp({dataDir,render:createRenderer('http://127.0.0.1:4317',f.dependencies)});
  const call=async(operation:string,input:object)=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:`Bearer ${app.studio.config.ownerToken}`},payload:{operation,input,idempotencyKey:randomUUID()}})).json();
  try {
    const project=(await call('projects.create',{preset:'empty'})).data;
    const request=await call('preview.request',{projectId:project.id,revision:1,format:'webm'});await app.studio.drainJobs();
    const response=await call('jobs.get',{jobId:request.data.id});assert.equal(response.status,'ok',JSON.stringify(response.error));
    const job=response.data;assert.equal(job.status,'failed');assert.equal(job.error.code,'RENDER_FAILED');assert.equal(job.error.details.stage,'screenshot');assert.equal(job.error.details.frameIndex,0);assert.match(job.error.details.cause.message,/rasterizer crashed/);assert.equal(job.artifacts.length,0);
    assert.deepEqual((await call('jobs.list',{projectId:project.id})).data.items[0].error,job.error);
    for(const invalid of [{...job.error.details,stage:'invented'},{...job.error.details,privateToken:'secret'},{...job.error.details,frameIndex:-1},
      {...job.error.details,cause:{name:'Error',message:'x'.repeat(2001)}}])assert.throws(()=>validateOperationOutput('jobs.get',{...job,error:{...job.error,details:invalid}}));
    await app.close();app=await createApp({dataDir,render:async()=>{throw rendererFailure(new Error('User cancelled'),{stage:'frame',frameIndex:7,frameTime:7/30},[],true);}});
    assert.deepEqual((await call('jobs.get',{jobId:job.id})).data.error,job.error);
    const cancelled=await call('preview.request',{projectId:project.id,revision:1});await app.studio.drainJobs();const cancelledResult=(await call('jobs.get',{jobId:cancelled.data.id})).data;
    assert.equal(cancelledResult.status,'cancelled');assert.equal(cancelledResult.error.code,'CANCELLED');assert.equal(cancelledResult.error.details.frameIndex,7);assert.equal(cancelledResult.artifacts.length,0);
  } finally {await app.close();assert.equal(resolve(dataDir,'..'),resolve(tmpdir()));rmSync(dataDir,{recursive:true,force:true});}
});
