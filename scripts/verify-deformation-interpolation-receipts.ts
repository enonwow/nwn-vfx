import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {hash} from '../apps/service/src/store.js';

const root='output/releases/0.23.0',r=JSON.parse(await readFile(`${root}/installed-acceptance.json`,'utf8')),pairs:any[]=[];
for(const p of r.projects){
  const jobs=r.jobs.filter((j:any)=>j.projectId===p.id),builds=jobs.filter((j:any)=>j.metadata.validation),renders=jobs.filter((j:any)=>j.metadata.deformations);
  for(const build of builds)for(const render of renders){
    const expected=build.metadata.validation.readback.meshes.map((m:any)=>({layerId:m.id??m.layerId,...m.deformation}));
    for(let i=0;i<expected.length;i++){
      const a=expected[i],b=render.metadata.deformations[i];
      for(const field of ['frameSets','samplePeriod','animvertsSha256','animtvertsSha256','maxDeviationMetres','interpolation'])assert.deepEqual(a[field],b[field],`${p.id}/${i}/${field}`);
    }
    pairs.push({projectId:p.id,build:build.id,render:render.id,meshes:expected.length,identicalPositionAndUvSamples:true});
  }
}
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,r_frame_rate','-of','json',`${root}/r6/video/preview.webm`],{encoding:'utf8',windowsHide:true}));assert.equal(probe.streams[0].nb_read_frames,'84');assert.equal(probe.streams[0].r_frame_rate,'30/1');
const report={passed:true,pairs,video:{frames:84,fps:30,cycles:2,duration:2.8,sha256:hash(await readFile(`${root}/r6/video/preview.webm`))},nativeVerified:false};
await writeFile(`${root}/sample-parity.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,pairs:pairs.length,video:report.video}));
