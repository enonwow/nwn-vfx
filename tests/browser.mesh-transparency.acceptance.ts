import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {decodePngRgba8} from '../packages/core/src/textures.js';
import {transparencyFixture,permuteTriangles} from './fixtures/mesh-transparency.js';
import type {MeshLayer} from '../packages/core/src/model.js';

test('real WebGL normal-alpha composite is correct and invariant under triangle permutations at multiple poses',{timeout:60000},async()=>{
  const out=resolve('output/playwright/mesh-alpha-regression');await mkdir(out,{recursive:true});
  const harness=`import {EffectRenderer} from './packages/renderer/src/index.ts';
  const r=new EffectRenderer(document.querySelector('canvas'),false);r.resize(512,512);r.setGrid(false);
  window.alphaTest=(doc,time,camera)=>{r.setDocument(doc);r.setRenderCamera(camera);r.render(time);return r.canvas.toDataURL('image/png');};`;
  const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd()},bundle:true,format:'iife',write:false,platform:'browser'});
  const browser=await chromium.launch({headless:true,channel:'chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>body{margin:0}</style><canvas></canvas>');await page.addScriptTag({content:bundle.outputFiles[0].text});
    const report=[];
    for(const mode of ['normal','additive','opaque','deformed'] as const){
      const f=transparencyFixture(),l=f.document.layers[0] as MeshLayer;
      if(mode==='additive')l.blend='additive';if(mode==='opaque')l.alpha=1;
      if(mode==='deformed'){f.document.schemaVersion=7;l.animation.vertices=[{time:0,value:(l.geometry as any).vertices},{time:2,value:(l.geometry as any).vertices.map((v:number[])=>[v[0],-v[1],v[2]])}];}
      for(const time of [0,1.5]){let baseline:Uint8Array|undefined;
        for(const order of ['original','reverse','shuffle'] as const){const doc=order==='original'?f.document:permuteTriangles(f.document,order);
          const pngUrl=await page.evaluate(({doc,time,camera})=>(window as any).alphaTest(doc,time,camera),{doc,time,camera:f.camera});
          const png=Buffer.from(pngUrl.split(',')[1],'base64'),rgba=decodePngRgba8(png).rgba;await writeFile(out+`/${mode}-${time}-${order}.png`,png);
          if(!baseline)baseline=rgba;assert.equal(Buffer.compare(Buffer.from(baseline),Buffer.from(rgba)),0,`${mode},t${time},${order}`);
          if(mode==='normal'){const i=(256*512+256)*4;assert(rgba[i]>rgba[i+2]+50,'Near red must composite over far blue');}
        }
        report.push({mode,time,permutations:3,identical:true});
      }
    }
    assert.equal(errors.length,0,errors.join('\n'));await writeFile(out+'/report.json',JSON.stringify({passed:true,cases:report},null,2));
  }finally{await browser.close();}
});
