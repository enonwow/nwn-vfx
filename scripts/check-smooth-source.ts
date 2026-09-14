import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execute} from '../apps/cli/src/client.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {assertMeshDeformationBudget} from '../packages/core/src/deformation.js';
import {canonical,hash} from '../apps/service/src/store.js';
const projectId=process.argv[2];assert(projectId,'Specify the read-only source project ID');
const get=async()=>{const r=await execute('projects.inspect',{projectId},{});assert.equal(r.status,'ok',JSON.stringify(r.error));return r.data as any;};
const project=await get(),document=structuredClone(project.document),beforeSha256=hash(canonical(project.document));
const layers=document.layers.filter((l:any)=>l.type==='mesh'&&l.geometry.kind==='custom'&&l.animation.vertices);
assert(layers.length);for(const l of layers)l.shading='smooth';document.schemaVersion=8;
const start=performance.now();assertDocument(document);const validationMs=performance.now()-start,budget=assertMeshDeformationBudget(document);
const after=await get();assert.equal(after.revision,project.revision);assert.equal(hash(canonical(after.document)),beforeSha256);
const result={passed:true,kind:'read-only in-process compatibility check; no public commit/export',projectId,revision:project.revision,beforeSha256,
  validationMs,layers:layers.map((l:any)=>({layerId:l.id,positions:l.geometry.vertices.length,triangles:l.geometry.faces.length,uv:l.geometry.uv?.length,keys:l.animation.vertices.length})),budget,sourceUnchanged:true,nativeVerified:false};
const out=resolve('output/releases/0.14.0');await mkdir(out,{recursive:true});await writeFile(join(out,'source-compatibility.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
