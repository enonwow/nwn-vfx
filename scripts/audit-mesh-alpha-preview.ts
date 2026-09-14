import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {transparencyFixture,permuteTriangles} from '../tests/fixtures/mesh-transparency.js';
const out=resolve('output/playwright/mesh-alpha-0301');await mkdir(out,{recursive:true});
const label=process.argv[2]??'before';
const harness=`import {EffectRenderer} from './packages/renderer/src/index.ts';
const r=new EffectRenderer(document.querySelector('canvas'),false);r.resize(960,640);r.setGrid(false);
window.alphaFrame=(doc,camera,time)=>{r.setDocument(doc);r.setGrid(false);r.setRenderCamera(camera);r.render(time);return r.canvas.toDataURL('image/png');};`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd()},bundle:true,format:'iife',write:false,platform:'browser',target:'es2022'});
await writeFile(out+'/'+label+'-harness.js',bundle.outputFiles[0].text);
const browser=await chromium.launch({headless:true,channel:'chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1});
await page.setContent('<style>body{margin:0}</style><canvas></canvas>');await page.addScriptTag({content:bundle.outputFiles[0].text});
const sets:any[]=[{name:'two-surfaces',...transparencyFixture()}];
for(const revision of [4,5,6]){try{sets.push({name:'boar-r'+revision,document:JSON.parse(await readFile(out+`/boar-r${revision}.json`,'utf8')),camera:{position:[.88,-1.4,1.07],target:[0,0,.76],fov:35}});}catch(e){if((e as any).code!=='ENOENT')throw e;}}
const report=[];
try{for(const f of sets){let baseline:Uint8Array|undefined;
  for(const mode of ['original','reverse','shuffle'] as const){const doc=mode==='original'?f.document:permuteTriangles(f.document,mode);
    const url=await page.evaluate(({doc,camera})=>(window as any).alphaFrame(doc,camera,1),{doc,camera:f.camera}),png=Buffer.from(url.split(',')[1],'base64');
    const rgba=execFileSync('ffmpeg',['-v','error','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:png,windowsHide:true,maxBuffer:4*1024*1024});if(!baseline)baseline=rgba;let pixels=0,maxDelta=0,total=0;
    for(let i=0;i<rgba.length;i+=4){let changed=false;for(let c=0;c<3;c++){const delta=Math.abs(rgba[i+c]-baseline[i+c]);maxDelta=Math.max(maxDelta,delta);total+=delta;if(delta>0)changed=true;}if(changed)pixels++;}
    await writeFile(out+`/${label}-${f.name}-${mode}.png`,png);report.push({fixture:f.name,order:mode,changedPixels:pixels,maxDelta,meanAbsoluteError:total/(960*640*3),rgbaSha256:createHash('sha256').update(rgba).digest('hex')});
  }
}}finally{await browser.close();}
await writeFile(out+'/'+label+'-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
