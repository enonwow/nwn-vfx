import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../apps/service/src/app.js';

test('checkbox saves/reloads/undoes the whole-effect flag and locks without changing a historical document on open',{timeout:60000},async()=>{
  const port=14361,dir=await mkdtemp(join(tmpdir(),'studio-effect-browser-'));
  const app=await createApp({dataDir:dir,port,webDir:resolve('dist/web')});
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chromium'}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const call=async(operation:string,input:object)=>{
    const r=(await app.inject({method:'POST',url:'/api/commands',headers:{host:`127.0.0.1:${port}`,authorization:'Bearer '+app.studio.config.ownerToken,'x-nwn-vfx-document-schema':'11'},payload:{operation,input,idempotencyKey:randomUUID()}})).json();assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;
  };
  try{
    const p=await call('projects.create',{projectId:'orientation-ui-fixture',preset:'empty',name:'Orientation UI fixture'});
    await app.listen({host:'127.0.0.1',port});const page=await browser.newPage({viewport:{width:1500,height:1100}});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const loaded=async()=>{await page.getByRole('heading',{name:p.document.name,exact:true}).waitFor();await page.locator('.empty-overlay').waitFor({state:'hidden'});};
    await page.goto(`http://127.0.0.1:${port}/`);await loaded();
    const box=page.getByRole('checkbox',{name:'Obracaj z postacią',exact:true}),save=page.getByRole('button',{name:'Zapisz',exact:true});
    assert.equal(await box.isChecked(),false);assert.deepEqual(await call('projects.inspect',{projectId:p.id}),p);
    await box.check();await box.uncheck();assert.equal(await save.isEnabled(),false,'returning to implicit false does not create a draft');
    await box.check();await save.click();await page.getByText('rewizja 2',{exact:true}).waitFor();
    const saved=await call('projects.inspect',{projectId:p.id});assert.equal(saved.document.orientWithObject,true);assert.equal(saved.document.schemaVersion,11);assert.deepEqual(saved.document.layers,p.document.layers);
    await page.reload();await loaded();assert.equal(await box.isChecked(),true);
    await page.getByRole('button',{name:'Historia',exact:true}).click();await page.getByRole('button',{name:'Cofnij zmianę',exact:true}).click();
    await page.getByText('rewizja 3',{exact:true}).waitFor();assert.equal(await box.isChecked(),false);
    assert(!Object.hasOwn((await call('projects.inspect',{projectId:p.id})).document,'orientWithObject'));
    await page.getByRole('button',{name:'Zablokuj obracanie z postacią',exact:true}).click();await save.click();await page.getByText('rewizja 4',{exact:true}).waitFor();
    assert.equal(await box.isDisabled(),true);await page.reload();await loaded();assert.equal(await box.isDisabled(),true);
    await page.getByRole('button',{name:'Odblokuj obracanie z postacią',exact:true}).click();await save.click();await page.getByText('rewizja 5',{exact:true}).waitFor();
    await box.check();await save.click();await page.getByText('rewizja 6',{exact:true}).waitFor();
    await box.uncheck();await save.click();await page.getByText('rewizja 7',{exact:true}).waitFor();
    assert.equal((await call('projects.inspect',{projectId:p.id})).document.orientWithObject,false);await page.reload();await loaded();assert.equal(await box.isChecked(),false);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
