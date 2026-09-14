import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeMeshLayer, PROFILE_ID } from '../packages/core/src/model.js';
import { operationSchemas, validateOperationInput, validateOperationOutput, assertDocument } from '../packages/contracts/src/schema.js';
import { buildCandidate } from '../packages/nwn-format/src/index.js';
const date = '2026-09-05T15:00:00.000Z';
const project = { id: 'project-test', revision: 1, document: makeDocument(), createdAt: date, updatedAt: date };
test('published result schemas reject malformed documents and response types', () => {
  validateOperationOutput('projects.inspect', project);
  assert.throws(() => validateOperationOutput('projects.inspect', { ...project, revision: '1' }), /niepoprawny wynik/);
  assert.throws(() => validateOperationOutput('projects.inspect', { ...project, privateToken: 'unexpected' }), /niepoprawny wynik/);
  assert.throws(() => validateOperationOutput('projects.list', { items: [project] }), /niepoprawny wynik/);
  validateOperationOutput('projects.list', { items: [project], nextCursor: null });
  for (const schema of Object.values(operationSchemas)) assert.ok(Object.keys(schema.outputSchema).length >= 2);
});
test('job results require real artifact metadata and do not claim native support', () => {
  const job = { id: 'job-id', jobId: 'job-id', projectId: project.id, actorId: 'owner', revision: 1, type: 'candidate.build', status: 'queued', createdAt: date, updatedAt: date, artifacts: [] };
  validateOperationOutput('jobs.get', job);
  validateOperationOutput('jobs.get', { ...job, status: 'cancelling' });
  assert.throws(() => validateOperationOutput('jobs.get', { ...job, status: 'succeeded' }), /niepoprawny wynik/);
  assert.throws(() => validateOperationOutput('jobs.get', { ...job, status: 'failed' }), /niepoprawny wynik/);
  assert.throws(() => validateOperationOutput('artifacts.get', { id: 'artifact-id', sha256: 'fake' }), /niepoprawny wynik/);
  assert.throws(() => validateOperationOutput('native.test.request', { status: 'passed' }), /niepoprawny wynik/);
});
test('document invariants and operation input cannot be bypassed with unknown fields', () => {
  assertDocument(project.document);
  const duplicate = structuredClone(project.document); duplicate.layers.push(duplicate.layers[0]);
  assert.throws(() => assertDocument(duplicate), /unikalne/);
  const locked = structuredClone(project.document); locked.locks.push({ layerId: 'not-there', field: 'size' });
  assert.throws(() => assertDocument(locked), /nieistniejącą/);
  assert.throws(() => validateOperationInput('changes.apply', { projectId: project.id, expectedRevision: 1, actorId: 'owner', changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .2 } }] }), /Niepoprawne dane/);
  assert.throws(() => assertDocument({ ...project.document, schemaVersion: 99 }), /Niepoprawny dokument/);
});

test('current candidate results require texture and age readback while persisted legacy job metadata remains readable',()=>{
  const validation=buildCandidate(makeDocument('empty'),'contractcheck').validation;
  const job={id:'job-id',jobId:'job-id',projectId:project.id,actorId:'owner',revision:1,type:'candidate.build',status:'running',createdAt:date,updatedAt:date,artifacts:[],
    metadata:{modelName:'contractcheck',validation,nativeVerified:false}};
  validateOperationOutput('jobs.get',job);
  for(const remove of [
    (v:any)=>delete v.assets,
    (v:any)=>delete v.readback.meshes,
    (v:any)=>delete v.readback.trails,
    (v:any)=>delete v.readback.layers[0].percentMid,
    (v:any)=>delete v.readback.layers[0].colorMid,
    (v:any)=>delete v.readback.layers[0].orientation,
    (v:any)=>delete v.readback.layers[0].parentOrientation,
    (v:any)=>delete v.readback.textures[0].rgbaSha256,
    (v:any)=>delete v.readback.textures[0].txi,
  ]) {const clone=structuredClone(job);remove(clone.metadata.validation);assert.throws(()=>validateOperationOutput('jobs.get',clone),/niepoprawny wynik/);}
  const legacy=structuredClone(job) as any;legacy.metadata.validation.exporterVersion='nwn-ascii-vfx-0.3.1';delete legacy.metadata.validation.assets;delete legacy.metadata.validation.readback.meshes;
  for(const layer of legacy.metadata.validation.readback.layers)for(const key of ['percentStart','percentMid','percentEnd','colorMid','orientation','parentOrientation'])delete layer[key];
  for(const texture of legacy.metadata.validation.readback.textures)for(const key of ['origin','rgbaSha256','sourceRefs','blend','txi'])delete texture[key];
  validateOperationOutput('jobs.get',legacy);
});

test('current mesh jobs require both independent material values while archived pre-material reports stay readable',()=>{
  const validation=buildCandidate({...makeDocument('empty'),schemaVersion:5,layers:[{...makeMeshLayer('stone'),material:{diffuse:'#998877',selfIllumination:'#001122'}}]},'materialschema').validation;
  const job={id:'material-job',jobId:'material-job',projectId:project.id,actorId:'owner',revision:1,type:'candidate.build',status:'running',createdAt:date,updatedAt:date,artifacts:[],metadata:{modelName:'materialschema',validation,nativeVerified:false}};
  validateOperationOutput('jobs.get',job);
  for(const field of ['diffuse','selfIllumination']) {
    const clone=structuredClone(job) as any;delete clone.metadata.validation.readback.meshes[0][field];
    assert.throws(()=>validateOperationOutput('jobs.get',clone),/niepoprawny wynik/);
  }
  const legacy=structuredClone(job) as any;legacy.metadata.validation.exporterVersion='nwn-ascii-vfx-0.5.0';
  delete legacy.metadata.validation.readback.meshes[0].diffuse;delete legacy.metadata.validation.readback.meshes[0].selfIllumination;
  validateOperationOutput('jobs.get',legacy);
});
