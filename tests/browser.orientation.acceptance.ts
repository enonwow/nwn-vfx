import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import { PerspectiveCamera, Vector3 } from 'three';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { makeDocument, makeLayer, type AxisAngle, type EffectDocument, type Vec3 } from '../packages/core/src/model.js';
import { assertDocument } from '../packages/contracts/src/schema.js';
import { orientationTexture } from './fixtures/rgba-texture.js';

const run = promisify(execFile), ffmpeg = process.env.NWN_VFX_FFMPEG || 'ffmpeg', previewTime = .4;
const originPosition: Vec3 = [0, 0, .9], scale = 1.3, speed = 1.2;
const orientations: Array<{ id: string; orientation?: AxisAngle; direction: Vec3 }> = [
  { id: 'z+', direction: [0,0,1] }, { id: 'x+', orientation: [0,1,0,Math.PI/2], direction: [1,0,0] },
  { id: 'x-', orientation: [0,1,0,-Math.PI/2], direction: [-1,0,0] },
  { id: 'y+', orientation: [1,0,0,-Math.PI/2], direction: [0,1,0] },
  { id: 'y-', orientation: [1,0,0,Math.PI/2], direction: [0,-1,0] },
  { id: 'z-', orientation: [1,0,0,Math.PI], direction: [0,0,-1] },
];
function documentFor(orientation?: AxisAngle, gravity = 0): EffectDocument {
  return { ...makeDocument('empty', 'Portable emitter orientation'), schemaVersion: orientation ? 4 : 1, duration: .8,
    layers: [{ ...makeLayer('moving-particle'), start: 0, count: 1, life: 3, speed, scale, spread: 0, gravity,
      position: originPosition, size: .18, endSize: .18, alpha: 1, endAlpha: 1, color: '#ff00ff', endColor: '#ff00ff',
      ...(orientation ? { orientation } : {}) }] };
}
async function pixels(path: string, frame?: number) {
  return (await run(ffmpeg, ['-v','error','-i',path,...(frame === undefined ? [] : ['-vf',`select=eq(n\\,${frame})`]),
    '-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'], { windowsHide: true, encoding: 'buffer', maxBuffer: 8*1024*1024 })).stdout;
}
function marker(rgb: Buffer) {
  let count = 0, x = 0, y = 0;
  for (let offset = 0; offset < rgb.length; offset += 3) {
    const [r,g,b] = [rgb[offset],rgb[offset+1],rgb[offset+2]];
    if (r > 70 && b > 70 && g < Math.min(r,b) * .4) { count++; x += offset/3%960; y += Math.floor(offset/3/960); }
  }
  assert.ok(count > 20, 'A real magenta particle must be visible'); return { x:x/count, y:y/count, count };
}
const camera = new PerspectiveCamera(39,960/640,.05,100);
camera.up.set(0,0,1); camera.position.set(3.4,-5.4,2.75); camera.lookAt(0,0,.7); camera.updateMatrixWorld();
function project(position: Vec3) { const point = new Vector3(...position).project(camera); return { x:(point.x+1)*480, y:(1-point.y)*320 }; }
function followsAxis(actual: {x:number;y:number}, direction: Vec3, time: number, gravity: number, tolerance = 1.6) {
  // Independent geometric oracle: RNG changes speed along this projected line,
  // while gravity shifts its origin only in world Z (including legacy scale).
  const shifted: Vec3 = [originPosition[0],originPosition[1],originPosition[2]-.5*gravity*time*time*scale];
  const start = project(shifted), end = project(shifted.map((v,index)=>v+direction[index]*speed*time*scale) as Vec3);
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy),ax=actual.x-start.x,ay=actual.y-start.y;
  const perpendicular = Math.abs(ax*dy-ay*dx)/length, along=(ax*dx+ay*dy)/(length*length);
  assert.ok(perpendicular<tolerance, `Particle is ${perpendicular}px away from the expected world-space direction`);
  assert.ok(along>.5&&along<1.6, `Particle must move forward along the chosen axis, got ${along}`);
  return { perpendicular, along, start, end };
}
async function invoke(page: Page, name: string, input: unknown = {}): Promise<any> {
  return page.evaluate(async ({name,input}) => (window as any).__orientationRegistry.get(name).execute(input), {name,input});
}

test('emitter axes, world gravity and legacy neutral pixels agree across PNG/WebM; human drafts and WebMCP stay coordinated', { timeout: 180_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(),'nwn-vfx-orientation-')), output=resolve('output/playwright/orientation-acceptance');
  await mkdir(output,{recursive:true});
  const app=await createApp({dataDir,port:14349,webDir:resolve('dist/web')}), origin=await app.listen({host:'127.0.0.1',port:14349});
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors: string[]=[], report: Record<string,unknown>={passed:false,nativeVerified:false,nativeWebMCP:false,errors};
  let releaseSave=()=>{}, releaseUpload=()=>{}, releaseNavigation=()=>{};
  const call=async(operation:string,input:Record<string,unknown>)=>{
    const response=await fetch(origin+'/api/commands',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+app.studio.config.ownerToken},
      body:JSON.stringify({operation,input,idempotencyKey:randomUUID()})});
    const result:any=await response.json();assert.notEqual(result.status,'failed',JSON.stringify(result.error));return result.data;
  };
  const watch=(page:Page)=>{page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});};
  try {
    const renderPage=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1});watch(renderPage);
    await renderPage.goto(origin+'/render');await renderPage.waitForFunction(()=>typeof window.studioRender==='function');
    const capture=async(name:string,document:EffectDocument,time=previewTime)=>{
      assertDocument(document);await renderPage.evaluate(async({document,time})=>window.studioRender!(document,time),{document,time});
      const path=join(output,name+'.png');await renderPage.locator('canvas').screenshot({path,type:'png'});return {path,rgb:await pixels(path)};
    };
    const directions: unknown[]=[], captures=new Map<string,Awaited<ReturnType<typeof capture>>>();
    for(const item of orientations){const frame=await capture('axis-'+item.id.replace('+','plus').replace('-','minus'),documentFor(item.orientation));captures.set(item.id,frame);
      const point=marker(frame.rgb);directions.push({id:item.id,point,...followsAxis(point,item.direction,previewTime,0)});}
    const neutral=await capture('explicit-neutral',documentFor([1,0,0,0]));
    assert.deepEqual(neutral.rgb,captures.get('z+')!.rgb,'Omitted orientation and any unit zero-angle orientation must retain identical legacy pixels');
    report.directions=directions;report.neutralPixelIdentical=true;
    const horizontal=documentFor([0,1,0,Math.PI/2],2), falling=await capture('x-plus-world-gravity',horizontal);
    report.gravity=followsAxis(marker(falling.rgb),[1,0,0],previewTime,2);
    assert.ok(Math.abs(marker(falling.rgb).y-marker(captures.get('x+')!.rgb).y)>10,'World gravity must visibly lower the rotated particle');
    const factory=createRenderer(origin), png=await factory(horizontal,{format:'png',time:previewTime,signal:new AbortController().signal});
    const pngPath=join(output,'factory-x-gravity.png');await writeFile(pngPath,png.files[0].data);
    assert.deepEqual(await pixels(pngPath),falling.rgb,'A PNG artifact must use the same oriented renderer as the browser');
    const video=await factory(horizontal,{format:'webm',time:previewTime,signal:new AbortController().signal});
    const videoPath=join(output,'x-plus-world-gravity.webm');await writeFile(videoPath,video.files[0].data);
    const timeline=JSON.parse((await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time:format=duration','-of','json',videoPath],{windowsHide:true})).stdout);
    assert.equal(timeline.frames.length,24);assert.equal(Number(timeline.format.duration),.8);
    timeline.frames.forEach((frame:any,index:number)=>assert.ok(Math.abs(Number(frame.best_effort_timestamp_time)-index/30)<=.00051));
    const videoPhases:unknown[]=[];
    for(const index of [6,12,21]){const time=index/30,frame=await capture('video-reference-'+index,horizontal,time),actual=marker(await pixels(videoPath,index)),expected=marker(frame.rgb);
      assert.ok(Math.abs(actual.x-expected.x)<1.5&&Math.abs(actual.y-expected.y)<1.5,'WebM must retain the PNG particle direction and phase');
      videoPhases.push({index,time,actual,expected,...followsAxis(actual,[1,0,0],time,2,2)});}
    report.video={frames:24,duration:.8,sha256:createHash('sha256').update(video.files[0].data).digest('hex'),phases:videoPhases};

    const project=await call('projects.create',{preset:'coil',name:'Human orientation acceptance'});
    const context=await browser.newContext({viewport:{width:1468,height:1100},deviceScaleFactor:1});
    // Only registration is mocked; callbacks, view state, grants and writes use
    // production code. This is not evidence of a browser-native WebMCP host.
    await context.addInitScript(()=>{
      const registry=new Map<string,unknown>();(window as any).__orientationRegistry=registry;
      Object.defineProperty(document,'modelContext',{value:undefined,configurable:true});
      Object.defineProperty(navigator,'modelContext',{configurable:true,value:{registerTool(tool:any,options?:{signal?:AbortSignal}){
        if(registry.has(tool.name))throw new Error('Duplicate registration');registry.set(tool.name,tool);options?.signal?.addEventListener('abort',()=>registry.delete(tool.name),{once:true});
      },unregisterTool(name:string){registry.delete(name);}}});
    });
    const ui=await context.newPage();watch(ui);await ui.goto(origin);await ui.getByText('rewizja 1',{exact:true}).waitFor();
    await ui.getByRole('button',{name:'Zatrzymaj',exact:true}).click();
    await ui.getByRole('button',{name:'Połącz agenta',exact:true}).click();await ui.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();
    await ui.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await ui.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).click();
    const connection=await invoke(ui,'studio.connection.inspect'),viewSessionId=connection.data.viewSessionId;
    const inspect=async()=>{const result=await invoke(ui,'studio.view.inspect',{viewSessionId});assert.equal(result.status,'ok',JSON.stringify(result.error));return result.data;};
    const selection=ui.getByRole('combobox',{name:'Orientacja emitera',exact:true});assert.equal(await selection.inputValue(),'z+');
    assert.equal(project.document.layers[0].orientation,undefined);
    for(const item of [...orientations.slice(1),orientations[1]]){
      await selection.selectOption(item.id);assert.deepEqual((await inspect()).draft.layers[0].orientation,item.orientation);
    }
    await ui.getByRole('button',{name:'Zapisz',exact:true}).click();await ui.getByText('rewizja 2',{exact:true}).waitFor();
    assert.equal((await call('projects.inspect',{projectId:project.id})).document.schemaVersion,4);
    const before=await inspect();await ui.getByText('Własna oś i kąt emitera',{exact:true}).click();
    const axis=(axis:string)=>ui.getByRole('textbox',{name:`Oś obrotu emitera ${axis}`,exact:true}),angle=ui.getByRole('textbox',{name:'Kąt obrotu emitera (rad)',exact:true});
    const openCustom=async()=>{const details=ui.locator('details').filter({has:ui.getByText('Własna oś i kąt emitera',{exact:true})});
      if(!await details.evaluate((node:HTMLDetailsElement)=>node.open))await details.locator('summary').click();};
    for(const name of ['X','Y','Z'])await axis(name).fill('0');await angle.fill('.7');
    await ui.getByRole('button',{name:'Normalizuj oś i zastosuj',exact:true}).click();await ui.getByRole('alert').filter({hasText:'Oś obrotu emitera nie może być zerowa'}).waitFor();
    let view=await inspect();assert.equal(view.draftDirty,true);assert.ok(view.viewRevision>before.viewRevision);assert.deepEqual(JSON.parse(view.meshEditorDrafts.sparks.orientation.text),['0','0','0','.7']);
    assert.deepEqual(view.draft.layers[0].orientation,orientations[1].orientation,'Invalid custom input must not replace the valid document draft');
    assert.equal(await ui.getByRole('button',{name:'Zapisz',exact:true}).isDisabled(),true);assert.equal(await ui.getByRole('button',{name:'Importuj PNG',exact:true}).isDisabled(),true);
    assert.equal((await invoke(ui,'studio.view.open',{viewSessionId,projectId:project.id,expectedViewRevision:view.viewRevision})).error.code,'DRAFT_CONFLICT');
    await ui.getByRole('button',{name:'Zaznacz na osi czasu: Dym',exact:true}).click();await ui.getByRole('button',{name:'Zaznacz na osi czasu: Iskry',exact:true}).click();
    assert.equal(await angle.inputValue(),'.7');assert.equal(await axis('Y').inputValue(),'0');
    // A local human lock must not trap unfinished input behind a disabled fieldset.
    await ui.getByRole('button',{name:'Zablokuj warstwę',exact:true}).click();assert.equal(await angle.isDisabled(),true);
    assert.equal(await ui.getByRole('button',{name:'Odrzuć orientację',exact:true}).isEnabled(),true);
    await ui.getByRole('button',{name:'Odrzuć orientację',exact:true}).click();assert.deepEqual((await inspect()).meshEditorDrafts,{});
    await ui.getByRole('button',{name:'Odblokuj',exact:true}).click();
    await openCustom();
    await axis('X').fill('1');await axis('Y').fill('1');await axis('Z').fill('0');await angle.fill('.7');
    await ui.getByRole('button',{name:'Normalizuj oś i zastosuj',exact:true}).click();view=await inspect();
    assert.deepEqual(view.meshEditorDrafts,{});assert.deepEqual(view.draft.layers[0].orientation,[1/Math.sqrt(2),1/Math.sqrt(2),0,.7]);
    let held=false,committed!:(result:any)=>void;const savedResponse=new Promise<any>(resolve=>{committed=resolve;}),gate=new Promise<void>(resolve=>{releaseSave=resolve;});
    await ui.route('**/api/commands',async route=>{
      if(held||route.request().postDataJSON()?.operation!=='changes.apply'){await route.continue();return;}
      held=true;const response=await route.fetch();committed(await response.json());await gate;await route.fulfill({response});
    });
    await ui.getByRole('button',{name:'Zapisz',exact:true}).click();assert.equal((await savedResponse).status,'ok');
    await openCustom();await angle.fill('.91');releaseSave();await ui.getByRole('status').filter({hasText:'Zapisano rewizję 3'}).waitFor();
    view=await inspect();assert.equal(view.revision,3);assert.equal(JSON.parse(view.meshEditorDrafts.sparks.orientation.text)[3],'.91');
    assert.equal((await call('projects.inspect',{projectId:project.id})).document.layers[0].orientation[3],.7,'An edit made during save must remain an unapplied human draft');
    await ui.getByRole('button',{name:'Normalizuj oś i zastosuj',exact:true}).click();await ui.getByRole('button',{name:'Zapisz',exact:true}).click();await ui.getByText('rewizja 4',{exact:true}).waitFor();
    await openCustom();await ui.screenshot({path:join(output,'editor-orientation.png'),fullPage:true});
    await selection.selectOption('z+');await ui.getByRole('button',{name:'Zapisz',exact:true}).click();await ui.getByText('rewizja 5',{exact:true}).waitFor();
    const reset=await call('projects.inspect',{projectId:project.id});assert.equal(reset.document.layers[0].orientation,undefined);assert.equal(reset.document.schemaVersion,4);
    await ui.getByRole('button',{name:'Zablokuj warstwę',exact:true}).click();await ui.getByRole('button',{name:'Zapisz',exact:true}).click();await ui.getByText('rewizja 6',{exact:true}).waitFor();
    assert.equal(await selection.isDisabled(),true);
    const mutation=(layerId:string,orientation:AxisAngle)=>invoke(ui,'studio.changes.apply',{viewSessionId,input:{projectId:project.id,expectedRevision:6,changes:[{type:'layer.set',layerId,values:{orientation}}]},idempotencyKey:randomUUID()});
    assert.equal((await mutation('sparks',[0,1,0,Math.PI/2])).error.code,'LOCKED');
    assert.equal((await mutation('smoke',[1,1,0,.5])).status,'failed','The API must reject a non-unit axis rather than silently normalizing it');
    const agentChange=await mutation('smoke',[0,1,0,Math.PI/2]);assert.equal(agentChange.status,'ok',JSON.stringify(agentChange.error));
    await ui.getByText('rewizja 7',{exact:true}).waitFor();await ui.getByRole('button',{name:'Zaznacz na osi czasu: Dym',exact:true}).click();assert.equal(await selection.inputValue(),'x+');
    report.ui={projectId:project.id,presets:true,pendingAcrossSelection:true,pendingViewRevision:true,dirtyOpenBlocked:true,
      discardWhileLocked:true,normalizeExplicit:true,saveRacePreserved:true,resetRemovesField:true,agentWrite:true,agentLock:true};

    // The upload commits schema 3 while a new orientation promotes the human
    // draft to schema 4. Its delayed response must preserve that promotion.
    const destination=await call('projects.create',{preset:'empty',name:'Navigation destination'});
    const uploadProject=await call('projects.create',{preset:'empty',name:'Upload and navigation race source'});
    const uploadUi=await context.newPage();watch(uploadUi);await uploadUi.goto(origin);
    await uploadUi.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(uploadProject.id);await uploadUi.getByText('rewizja 1',{exact:true}).waitFor();
    await uploadUi.getByRole('button',{name:'Zatrzymaj',exact:true}).click();
    await uploadUi.getByRole('button',{name:'Połącz agenta',exact:true}).click();await uploadUi.getByRole('button',{name:'Udostępnij projekt AI',exact:true}).click();
    await uploadUi.getByRole('button',{name:'Odłącz WebMCP',exact:true}).waitFor();await uploadUi.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).click();
    const uploadSessionId=(await invoke(uploadUi,'studio.connection.inspect')).data.viewSessionId;
    const uploadInspect=async()=>{const result=await invoke(uploadUi,'studio.view.inspect',{viewSessionId:uploadSessionId});assert.equal(result.status,'ok',JSON.stringify(result.error));return result.data;};
    let uploadHeld=false,commitUpload!:(value:any)=>void;const uploadCommitted=new Promise<any>(resolve=>{commitUpload=resolve;}),uploadGate=new Promise<void>(resolve=>{releaseUpload=resolve;});
    await uploadUi.route('**/api/commands',async route=>{
      if(uploadHeld||route.request().postDataJSON()?.operation!=='assets.import'){await route.continue();return;}
      uploadHeld=true;const response=await route.fetch();commitUpload(await response.json());await uploadGate;await route.fulfill({response});
    });
    await uploadUi.getByLabel('Plik tekstury PNG',{exact:true}).setInputFiles({name:'own-orientation.png',mimeType:'image/png',buffer:Buffer.from(orientationTexture(8))});
    const assetImport=await uploadCommitted;assert.equal(assetImport.status,'ok');assert.equal(assetImport.data.project.document.schemaVersion,3);
    await uploadUi.getByRole('combobox',{name:'Orientacja emitera',exact:true}).selectOption('x+');
    assert.equal((await uploadInspect()).draft.schemaVersion,4);
    releaseUpload();await uploadUi.getByRole('status').filter({hasText:'Tekstura zaimportowana'}).waitFor();
    let uploadView=await uploadInspect();assert.equal(uploadView.revision,2);assert.equal(uploadView.draft.schemaVersion,4);assertDocument(uploadView.draft);
    assert.deepEqual(uploadView.draft.layers[0].orientation,[0,1,0,Math.PI/2]);assert.equal(uploadView.draft.assets[0].id,assetImport.data.assetId);
    await uploadUi.getByRole('button',{name:'Zapisz',exact:true}).click();await uploadUi.getByText('rewizja 3',{exact:true}).waitFor();
    const uploaded=await call('projects.inspect',{projectId:uploadProject.id});assert.equal(uploaded.document.schemaVersion,4);assert.deepEqual(uploaded.document.layers[0].orientation,[0,1,0,Math.PI/2]);

    // A real navigation read has finished on the server. New, incomplete
    // orientation fields entered before delivery must keep project A open.
    let navigationHeld=false,commitNavigation!:()=>void;const navigationRead=new Promise<void>(resolve=>{commitNavigation=resolve;}),navigationGate=new Promise<void>(resolve=>{releaseNavigation=resolve;});
    await uploadUi.route('**/api/commands',async route=>{
      const input=route.request().postDataJSON();
      if(navigationHeld||input?.operation!=='projects.inspect'||input?.input?.projectId!==destination.id){await route.continue();return;}
      navigationHeld=true;const response=await route.fetch();assert.equal((await response.json()).data.id,destination.id);commitNavigation();await navigationGate;await route.fulfill({response});
    });
    const beforeNavigation=await uploadInspect();
    await uploadUi.getByRole('combobox',{name:'Projekt',exact:true}).selectOption(destination.id);await navigationRead;
    await uploadUi.getByText('Własna oś i kąt emitera',{exact:true}).click();
    await uploadUi.getByRole('textbox',{name:'Kąt obrotu emitera (rad)',exact:true}).fill('.333');
    releaseNavigation();await uploadUi.getByRole('alert').filter({hasText:'Nawigacja została wstrzymana'}).waitFor();
    assert.equal(await uploadUi.getByRole('combobox',{name:'Projekt',exact:true}).inputValue(),uploadProject.id);
    uploadView=await uploadInspect();assert.equal(uploadView.projectId,uploadProject.id);assert.equal(uploadView.revision,3);assert.ok(uploadView.viewRevision>beforeNavigation.viewRevision);
    assert.equal(JSON.parse(uploadView.meshEditorDrafts.sparks.orientation.text)[3],'.333');assert.equal(uploadView.draft.layers[0].orientation[3],Math.PI/2);
    assert.equal(await uploadUi.getByRole('textbox',{name:'Kąt obrotu emitera (rad)',exact:true}).inputValue(),'.333');
    await uploadUi.getByRole('button',{name:'Odrzuć orientację',exact:true}).click();
    report.races={uploadProjectId:uploadProject.id,uploadPreservesSchema4:true,uploadPreservesOrientation:true,navigationPreservesSourceProject:true,navigationPreservesPendingOrientation:true};
    assert.deepEqual(errors,[]);report.passed=true;
  }catch(error){report.failure=error instanceof Error?error.message:String(error);throw error;}
  finally{releaseSave();releaseUpload();releaseNavigation();await writeFile(join(output,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await app.close();
    const safe=resolve(dataDir);assert.equal(dirname(safe),resolve(tmpdir()));assert.ok(basename(safe).startsWith('nwn-vfx-orientation-'));await rm(safe,{recursive:true,force:true});}
});
