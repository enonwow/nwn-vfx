import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { makeDocument, makeMeshLayer, type EffectDocument, type MeshGeometry, type MeshLayer } from '../packages/core/src/model.js';
import { createTextureAsset, decodePngRgba8, encodePngRgba8 } from '../packages/core/src/textures.js';

// An isolated source-bundled harness exercises the shared renderer without a
// service, an installed application, or any persistent authoring project.
const harness = `import {EffectRenderer} from './packages/renderer/src/index.ts';
import {Vector3} from 'three';
const renderer = new EffectRenderer(document.querySelector('canvas'), false);
renderer.resize(512,512); renderer.setGrid(false);
renderer.camera.position.set(0,-5,1); renderer.controls.target.set(0,0,.7); renderer.controls.update();
window.materialHarness = {
  setDocument: doc => renderer.setDocument(doc),
  frame(time, id, points) {
    renderer.render(time);
    const mesh = renderer.scene.getObjectByName(id), position = mesh.geometry.getAttribute('position');
    const samples = points.map(({face,weights}) => {
      const point = new Vector3();
      weights.forEach((weight,index) => point.addScaledVector(new Vector3().fromBufferAttribute(position,face*3+index),weight));
      mesh.localToWorld(point); point.project(renderer.camera);
      return {x:Math.round((point.x+1)*256),y:Math.round((1-point.y)*256)};
    });
    return {png:renderer.canvas.toDataURL('image/png'),samples,
      opacity:mesh.material.opacity,transparent:mesh.material.transparent,depthWrite:mesh.material.depthWrite,
      material:mesh.material.type,flatShading:mesh.material.flatShading??false};
  },
  dispose: () => renderer.dispose()
};`;

function asset(alpha = false) {
  const rgba = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const rgb = y < 8 ? (x < 8 ? [230,40,20] : [30,220,60]) : (x < 8 ? [20,70,240] : [230,200,20]);
    rgba.set([...rgb, alpha && y < 8 ? (x < 8 ? 0 : 128) : 255], (y * 16 + x) * 4);
  }
  return createTextureAsset(alpha ? 'asymmetric-alpha.png' : 'asymmetric.png', Buffer.from(encodePngRgba8({ width:16,height:16,rgba })).toString('base64'));
}
const panel: MeshGeometry = { kind:'custom', vertices:[[-.9,0,0],[.8,0,0],[.5,0,1.6],[-.7,0,1.2]],
  faces:[[0,1,2],[0,2,3]], uv:[[1,0],[0,1],[0,0],[1,1]], uvFaces:[[2,0,3],[2,3,1]] };
const points = [
  {face:0,weights:[.75,.05,.2]}, // UV (.25,.2): bottom-left blue
  {face:0,weights:[.2,.6,.2]}, // UV (.8,.2): bottom-right yellow
  {face:1,weights:[.2,.2,.6]}, // UV (.2,.8): top-left red
  {face:0,weights:[.15,.1,.75]}, // UV (.85,.75): top-right green
];
function documentFor(layers: MeshLayer[], assets: EffectDocument['assets'] = []): EffectDocument {
  return {...makeDocument('empty'),schemaVersion:5,duration:3,layers,assets};
}
function meanPixel(png: Buffer, point: {x:number;y:number}) {
  const image = decodePngRgba8(png), rgb = [0,0,0];
  assert.ok(point.x > 4 && point.x < 508 && point.y > 4 && point.y < 508, 'The sample must be inside the rendered fixture');
  for(let y=point.y-2;y<=point.y+2;y++) for(let x=point.x-2;x<=point.x+2;x++)
    for(let channel=0;channel<3;channel++) rgb[channel] += image.rgba[(y*image.width+x)*4+channel]/25;
  return rgb;
}
const maxDelta = (a:number[],b:number[]) => Math.max(...a.map((value,index)=>Math.abs(value-b[index])));

test('shared renderer shades rotating flat stone, preserves asymmetric UV, and samples animated/material alpha', {timeout:90_000}, async () => {
  const output = resolve('output/playwright/material-acceptance'); await mkdir(output,{recursive:true});
  const bundle = await build({stdin:{contents:harness,resolveDir:resolve('.')},bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'});
  const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const reports: unknown[] = [], errors: string[] = [];
  try {
    const page = await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
    page.on('pageerror', error=>errors.push(error.message));
    await page.setContent('<style>body{margin:0}canvas{width:512px;height:512px;display:block}</style><canvas></canvas>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const setDocument = async (doc:EffectDocument) => page.evaluate(value=>(window as any).materialHarness.setDocument(value),doc);
    const frame = async (name:string,time:number,id:string,samples=points) => {
      const result = await page.evaluate(({time,id,samples})=>(window as any).materialHarness.frame(time,id,samples),{time,id,samples});
      const png = Buffer.from(result.png.split(',')[1],'base64'); await writeFile(join(output,name+'.png'),png);
      const rgb = result.samples.map((point:{x:number;y:number})=>meanPixel(png,point));
      const {png:_,...metadata} = result; reports.push({name,time,...metadata,rgb}); return {...metadata,rgb};
    };

    const stone:MeshLayer = {...makeMeshLayer('stone'),position:[0,0,.7],color:'#808080',
      material:{diffuse:'#808080',selfIllumination:'#000000'},
      geometry:{kind:'custom',vertices:[[-.6,-.4,-.55],[.55,-.4,-.5],[.65,.35,-.4],[-.5,.4,-.45],
        [-.4,-.35,.45],[.4,-.35,.7],[.45,.25,.4],[-.3,.3,.6]],
        faces:[[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7],[4,5,6],[4,6,7],[0,3,2],[0,2,1]]},
      animation:{orientation:[{time:0,value:[0,0,1,-Math.PI/4]},{time:2,value:[0,0,1,Math.PI/4]}]}};
    await setDocument(documentFor([stone]));
    const face = [{face:0,weights:[1/3,1/3,1/3]}];
    const litA = await frame('stone-lit-0',0,'stone',face), litB = await frame('stone-lit-2',2,'stone',face);
    assert.equal(litA.material,'MeshLambertMaterial'); assert.equal(litA.flatShading,true);
    assert.ok(litA.rgb[0][0]-litB.rgb[0][0]>25,'The same stone face must darken visibly as it rotates away from the fixed key light');
    assert.equal(litA.depthWrite,true); assert.equal(litB.depthWrite,true);
    // Give the legacy control explicit UV so its geometry has the same expanded
    // triangle indexing while retaining the released MeshBasicMaterial behavior.
    const legacy = structuredClone(stone); delete legacy.material;
    if(legacy.geometry.kind==='custom') {legacy.geometry.uv=[[0,0],[1,0],[0,1]];legacy.geometry.uvFaces=legacy.geometry.faces.map(()=>[0,1,2]);}
    await setDocument(documentFor([legacy]));
    const oldA=await frame('stone-legacy-0',0,'stone',face),oldB=await frame('stone-legacy-2',2,'stone',face);
    assert.equal(oldA.material,'MeshBasicMaterial'); assert.ok(maxDelta(oldA.rgb[0],oldB.rgb[0])<=1,'Legacy color must remain independent of the new lights');

    const texture=asset(), textured:MeshLayer={...makeMeshLayer('panel'),geometry:panel,texture:`asset:${texture.id}`,
      material:{diffuse:'#000000',selfIllumination:'#ffffff'}};
    await setDocument(documentFor([textured],[texture]));
    const uv = await frame('asymmetric-emissive',.5,'panel');
    for(const [index,rgb] of [[20,70,240],[230,200,20],[230,40,20],[30,220,60]].entries())
      assert.ok(maxDelta(uv.rgb[index],rgb)<3,`Separate UV indices and top-down PNG orientation must retain quadrant ${index}`);
    assert.equal(uv.transparent,false); assert.equal(uv.depthWrite,true);

    const back:MeshLayer={...makeMeshLayer('back'),geometry:panel,position:[0,.15,0],color:'#ff8000'};
    const fading:MeshLayer={...textured,texture:null,animation:{alpha:[{time:0,value:0},{time:1,value:.5},{time:2,value:1}]}};
    await setDocument(documentFor([back,fading]));
    const a0=await frame('alpha-0',0,'panel'),a5=await frame('alpha-half',1,'panel'),a1=await frame('alpha-1',2,'panel');
    assert.ok(maxDelta(a0.rgb[0],[255,128,0])<3,'Zero opacity must reveal the background mesh');
    assert.ok(maxDelta(a1.rgb[0],[255,255,255])<3,'Full opacity must reach the independently authored self illumination');
    assert.ok(a5.rgb[0][1]>a0.rgb[0][1]+30&&a5.rgb[0][1]<a1.rgb[0][1]-15,'The intermediate frame must show actual partial alpha');
    for(const [sample,transparent] of [[a0,true],[a5,true],[a1,false]] as const) {
      assert.equal(sample.transparent,transparent); assert.equal(sample.depthWrite,!transparent);
    }
    const soft=asset(true);
    await setDocument(documentFor([back,{...textured,texture:`asset:${soft.id}`}],[soft]));
    const cutout=await frame('texture-soft-alpha',.5,'panel');
    assert.equal(cutout.transparent,true);assert.equal(cutout.depthWrite,false);
    assert.ok(maxDelta(cutout.rgb[2],[255,128,0])<3,'A transparent texel must reveal the background mesh without a depth occluder');
    assert.ok(cutout.rgb[3][0]>30&&cutout.rgb[3][0]<255&&cutout.rgb[3][1]>128&&cutout.rgb[3][1]<220,'Soft texture alpha must blend both surfaces');
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>(window as any).materialHarness.dispose());
  } finally {
    await writeFile(join(output,'report.json'),JSON.stringify({nativeVerified:false,previewModel:'fixed-world Lambert approximation',reports,errors},null,2));
    await browser.close();
  }
});
