import {workflowOperation,WORKFLOW_SCOPES} from './workflow.js';
import {WORKFLOW_OPERATIONS} from '../../../packages/contracts/src/workflow-schema.js';
import {assertAuthoringUnlocked} from '../../../packages/core/src/workflow.js';
import {BEAM_CAPABILITIES} from '../../../packages/core/src/beam.js';
import {LIFECYCLE_CAPABILITIES,previewDuration} from '../../../packages/core/src/lifecycle.js';
import {assertEffectLifecycleUnlocked,documentProfile,DURATION_PROFILE_ID} from '../../../packages/core/src/model.js';
import {isBinaryProfile,binaryProfile} from '../../../packages/core/src/export-profiles.js';
import {COMPOSITION_CAPABILITIES,type CompositionInput} from '../../../packages/core/src/composition.js';
import {freezeComposition} from './composition.js';
import {FLIPBOOK_CAPABILITIES} from '../../../packages/core/src/flipbook.js';
import { TRAIL_CAPABILITIES } from '../../../packages/core/src/trails.js';
import { preparePalette, PALETTE_CAPABILITIES } from '../../../packages/core/src/palette.js';
import { MESH_SHADING_CAPABILITIES } from '../../../packages/core/src/shading.js';
import { MESH_DEFORMATION_CAPABILITIES } from '../../../packages/core/src/deformation.js';
import { EXPORT_PROFILE_IDS, BINARY_PROFILE_ID } from '../../../packages/core/src/export-profiles.js';
import { binaryCompilerAvailable } from '../../../packages/nwn-format/src/compiled-candidate.js';
import { randomBytes } from 'node:crypto';
import { EFFECT_INTEGRATION_CAPABILITIES, assertEffectOrientationUnlocked, CONTRACT_VERSION, STUDIO_VERSION, PROFILE_ID, DomainError, makeDocument, applyChanges, changedFields, promoteDocumentSchema, type EffectDocument, type Command, type Result, type Project, type Change } from '../../../packages/core/src/model.js';
import { validateCommand, validateChanges, validateResult, validateOperationInput, validateOperationOutput, operationSchemas, assertDocument } from '../../../packages/contracts/src/schema.js';
import { canonical, hash, id, now, type Store, type Actor, type Job } from './store.js';
import { createWorker, type Render } from './jobs.js';
import { createTextureAsset, textureAssetMetadata, TEXTURE_CAPABILITIES, PARTICLE_AGE_CAPABILITIES } from '../../../packages/core/src/textures.js';
import { exportProjectBundle, importProjectBundle } from './project-bundle.js';
import { EMITTER_ORIENTATION_CAPABILITIES } from '../../../packages/core/src/simulation.js';
import { NATIVE_WORKFLOW } from '../../../packages/core/src/native-workflow.js';
import { nativeTestStatus } from './native-status.js';
import { prepareObjImport } from '../../../packages/core/src/obj.js';
import { OBJ_IMPORT_CAPABILITIES, MESH_MATERIAL_CAPABILITIES } from '../../../packages/core/src/authoring-capabilities.js';
import {AUDIO_CAPABILITIES,audioMetadata,analyzeAudioLevels,audioLevelDiagnostic,audioGainDiagnostic} from '../../../packages/core/src/audio.js';
import {importAudio,verifyAudioImports} from './audio-import.js';

const scopes = ['read', 'edit', 'create', 'import', 'export', 'build', 'render', 'jobs', 'artifacts', 'cancel', 'review'];
const requiredScope: Record<string, string> = {
  ...WORKFLOW_SCOPES,
  'projects.list': 'read', 'projects.resolve': 'read', 'projects.inspect': 'read', 'projects.create': 'create', 'projects.import': 'import', 'projects.fork': 'edit', 'projects.export': 'export',
  'assets.import': 'edit', 'assets.remove': 'edit', 'assets.list': 'read', 'assets.get': 'read',
  'audio.import':'edit','audio.remove':'edit','audio.list':'read','audio.get':'read',
  'meshes.importObj.preview': 'edit', 'meshes.importObj': 'edit',
  'palette.preview': 'edit', 'palette.apply': 'edit',
  'native.test.status': 'read', 'native.test.request': 'read',
  'changes.preview': 'edit', 'changes.apply': 'edit', 'changes.revert': 'edit', 'revisions.list': 'read', 'revisions.get': 'read', 'revisions.restore': 'edit', 'policy.inspect': 'read',
  'candidate.build': 'build', 'preview.compose':'render', 'preview.request': 'render', 'jobs.get': 'jobs', 'jobs.list': 'jobs', 'jobs.cancel': 'cancel', 'artifacts.get': 'artifacts', 'artifacts.list': 'artifacts', 'reviews.add': 'review', 'reviews.list': 'read', 'events.list': 'read',
};
const ownerOnly = new Set(['policy.set', 'actors.list', 'actors.create', 'actors.revoke', 'revisions.restore']);
const implemented = new Set(['version', 'doctor', 'capabilities', 'workspaces.list', 'operations.list', 'operations.get', 'operations.resolve', 'schema.get', ...Object.keys(requiredScope), ...ownerOnly]);
implemented.delete('native.test.request'); // Dependency reporting is available; native execution is not.
function fail(code: string, message: string, details?: unknown): never { throw new DomainError(code, message, details); }
function paging<T>(values: T[], input: Record<string, any>, key: (value: T) => string = value => String((value as any).id)) {
  const found = input.cursor === undefined ? -1 : values.findIndex(value => key(value) === input.cursor);
  if (input.cursor !== undefined && found < 0) fail('INVALID_CURSOR', 'Kursor nie należy do dostępnej listy.');
  const offset = found + 1, limit = input.limit ?? 25, items = values.slice(offset, offset + limit);
  return { items, nextCursor: offset + limit < values.length && items.length ? key(items[items.length - 1]) : null };
}
export function createDispatcher(store: Store, render?: Render) {
  function authorize(actorId: string, projectId: string | undefined, scope: string | undefined, writing = false) {
    const actor = store.actor(actorId);
    if (actor.revoked) fail('UNAUTHORIZED', 'Poświadczenie zostało cofnięte.');
    if (scope && actor.kind !== 'owner' && !actor.scopes.includes(scope)) fail('FORBIDDEN', 'Brak wymaganego zakresu.', { scope });
    if (projectId && actor.kind !== 'owner' && !actor.projectIds.includes(projectId)) fail('FORBIDDEN', 'Projekt nie należy do przyznanego zakresu.');
    if (writing && projectId && actor.kind === 'agent') {
      const policy = store.db.prepare('SELECT pause_ai FROM policies WHERE project_id=?').get(projectId) as any;
      if (policy?.pause_ai) fail('AI_PAUSED', 'Właściciel wstrzymał zapisy AI dla tego projektu.');
    }
    return actor;
  }
  const worker = createWorker(store, (actorId, projectId, scope, writing) => { authorize(actorId, projectId, scope, writing); }, render);
  function projectAccess(actor: Actor, projectId: string, scope = 'read') { authorize(actor.id, projectId, scope); }
  function item(table: 'jobs' | 'artifacts' | 'operations', objectId: string): any {
    const row = store.db.prepare('SELECT * FROM ' + table + ' WHERE id=?').get(objectId) as any;
    if (!row) fail('NOT_FOUND', 'Nie znaleziono zasobu.'); return row;
  }
  function authorizeJob(actorId:string,jobId:string,scope='jobs',writing=false) {
    const job=JSON.parse(item('jobs',jobId).value) as Job;
    for(const projectId of job.sourceProjectIds??[job.projectId]){
      authorize(actorId,projectId,scope,writing);
      if(job.type==='preview.compose'||job.type==='iteration.prepare')authorize(actorId,projectId,'read');
    }
  }
  function authorizeArtifact(actorId:string,artifactId:string) {
    const row=item('artifacts',artifactId),artifact=JSON.parse(row.value);
    authorize(actorId,row.project_id,'artifacts');if(artifact.jobId)authorizeJob(actorId,artifact.jobId,'artifacts');
  }
  function canReadResource(actor:Actor,table:string,value:any) {
    try{if(table==='jobs')authorizeJob(actor.id,value.id);if(table==='artifacts')authorizeArtifact(actor.id,value.id);return true;}
    catch(error){if(error instanceof DomainError&&['FORBIDDEN','UNAUTHORIZED'].includes(error.code))return false;throw error;}
  }
  function targetProject(command: Command): string | undefined {
    const input = command.input;
    if (['projects.create', 'projects.import'].includes(command.operation)) return undefined;
    if(command.operation==='preview.compose')return (input.instances as CompositionInput['instances'])[0].projectId;
    if (typeof input.projectId === 'string') return input.projectId;
    if (command.operation.startsWith('jobs.') && typeof input.jobId === 'string') return item('jobs', input.jobId).project_id;
    if (command.operation === 'artifacts.get') return item('artifacts', String(input.artifactId)).project_id;
    if (command.operation === 'native.test.status' || command.operation === 'native.test.request') return item('jobs', String(input.candidateId)).project_id;
    if (command.operation === 'operations.get') return item('operations', String(input.operationId)).project_id ?? undefined;
    return undefined;
  }
  function checkCommandAccess(actorId: string, command: Command, writing = false) {
    const projectId = targetProject(command), actor = authorize(actorId, projectId, requiredScope[command.operation], writing);
    if(WORKFLOW_OPERATIONS.includes(command.operation)){
      const input=command.input as any;
      for(const source of [input.baseline,input.observed,input.source])if(source?.projectId)authorize(actorId,source.projectId,'read',writing);
      if(input.componentId){const row=store.db.prepare('SELECT project_id FROM components WHERE id=?').get(input.componentId) as any;if(row)authorize(actorId,row.project_id,'read',writing);}
      for(const candidateId of [input.candidateId,input.baselineCandidateId,input.report?.target?.jobId])if(candidateId)authorizeJob(actorId,candidateId,'artifacts',writing);
      if(input.reportId){const row=store.db.prepare('SELECT value FROM external_reports WHERE id=?').get(input.reportId) as any;if(row)authorizeJob(actorId,JSON.parse(row.value).report.target.jobId,'read',writing);}
    }
    if(command.operation==='preview.compose')for(const i of (command.input as unknown as CompositionInput).instances){authorize(actorId,i.projectId,'read');authorize(actorId,i.projectId,'render',writing);}
    if(command.operation.startsWith('jobs.')&&command.input.jobId)authorizeJob(actorId,String(command.input.jobId),requiredScope[command.operation],writing);
    if(command.operation==='artifacts.get')authorizeArtifact(actorId,String(command.input.artifactId));
    if (ownerOnly.has(command.operation) && actor.kind !== 'owner') fail('FORBIDDEN', 'Operacja dostępna wyłącznie właścicielowi.');
    if (command.operation === 'projects.fork') authorize(actorId, undefined, 'create');
    if (command.operation === 'projects.import') authorize(actorId, undefined, 'create');
    if (command.operation === 'operations.get') {
      const row = item('operations', String(command.input.operationId));
      const originalComposition=JSON.parse(row.value);if(originalComposition.result?.data?.type==='preview.compose')authorizeJob(actorId,originalComposition.result.data.id,requiredScope[originalComposition.name]??'read');if(originalComposition.name==='preview.compose')checkCommandAccess(actorId,{operation:'preview.compose',input:originalComposition.input});
      if(WORKFLOW_OPERATIONS.includes(originalComposition.name))checkCommandAccess(actorId,{operation:originalComposition.name,input:originalComposition.input});
      if (actor.kind !== 'owner' && row.actor_id !== actor.id) {
        if (!row.project_id) fail('FORBIDDEN', 'Brak dostępu do operacji.');
        const original = JSON.parse(row.value);
        authorize(actor.id, row.project_id, requiredScope[original.name] ?? 'read');
      }
    }
    return { actor, projectId };
  }
  const scopeKey = (actorId: string, op: string, projectId: unknown, key: string) => canonical([actorId, store.config.workspaceId, op, projectId ?? '@workspace', key]);
  function current(input: Record<string, any>) {
    const value = store.project(input.projectId);
    if (value.revision !== input.expectedRevision) fail('REVISION_CONFLICT', 'Projekt ma nowszą rewizję.', { expectedRevision: input.expectedRevision, currentRevision: value.revision });
    return value;
  }
  function commit(before: Project, document: EffectDocument, operationId: string) {
    assertDocument(document);
    const project: Project = { ...before, revision: before.revision + 1, document, updatedAt: now() };
    store.saveProject(project, operationId); return project;
  }
  function newProject(document: EffectDocument, projectId: string | undefined, operationId: string, actor: Actor, parentId?: string) {
    assertDocument(document);
    const value: Project = { id: projectId ?? id(), revision: 1, document, createdAt: now(), updatedAt: now(), ...(parentId ? { parentId } : {}) };
    if (store.db.prepare('SELECT id FROM projects WHERE id=?').get(value.id)) fail('PROJECT_EXISTS', 'Projekt o tej tożsamości już istnieje.');
    store.saveProject(value, operationId);
    if (actor.kind !== 'owner' && !actor.projectIds.includes(value.id)) { actor.projectIds.push(value.id); store.db.prepare('UPDATE actors SET value=? WHERE id=?').run(JSON.stringify(actor), actor.id); }
    return value;
  }
  function listFor(table: string, actor: Actor, input: Record<string, any>) {
    const values = store.db.prepare('SELECT value,project_id FROM ' + table + ' ORDER BY rowid DESC').all() as any[];
    return paging(values.filter(row => (!input.projectId || row.project_id === input.projectId) && (actor.kind === 'owner' || actor.projectIds.includes(row.project_id))).map(row => JSON.parse(row.value)).filter(value=>canReadResource(actor,table,value)), input);
  }
  function revert(before: Project, operationId: string, actor: Actor) {
    const row = item('operations', operationId), original = JSON.parse(row.value);
    if (row.project_id !== before.id || !Array.isArray(original.diff) || !original.diff.length) fail('UNDO_UNSUPPORTED', 'Operacja nie zawiera odwracalnej zmiany.');
    if(['workflow.settings.apply','benchmarks.pin','timing.apply','components.insert.apply'].includes(original.name)){
      if(before.revision!==original.result.data.revision)fail('UNDO_CONFLICT','Po tej operacji zapisano dalsze zmiany. Przywróć ją w osobnym wariancie.');
      assertAuthoringUnlocked(before.document);
      const prior=structuredClone(store.project(before.id,before.revision-1).document);
      for(const lock of before.document.locks.filter(l=>l.layerId!=='@effect')){
        const current=before.document.layers.find(l=>l.id===lock.layerId)??before.document.audioClips?.find(c=>c.id===lock.layerId);
        const previous=prior.layers.find(l=>l.id===lock.layerId)??prior.audioClips?.find(c=>c.id===lock.layerId);
        if(current&&!previous||canonical(lock.field==='*'?current:(current as any)?.[lock.field])!==canonical(lock.field==='*'?previous:(previous as any)?.[lock.field]))fail('LOCKED','Cofnięcie narusza bieżącą blokadę.');
      }
      prior.schemaVersion=before.document.schemaVersion;assertDocument(prior);return prior;
    }
    if(original.name==='audio.import'||original.name==='audio.remove'){
      const diff=original.diff.find((e:any)=>e.path==='/audioAssets');if(!diff)fail('UNDO_UNSUPPORTED','Brak zmiany zasobu audio.');
      const document=structuredClone(before.document),prior=diff.before??[],after=diff.after??[];
      if(original.name==='audio.import'){
        const added=after.filter((a:any)=>!prior.some((b:any)=>b.id===a.id));
        for(const a of added)if(canonical(document.audioAssets?.find(b=>b.id===a.id))!==canonical(a)||document.audioClips?.some(c=>c.assetId===a.id))fail('UNDO_CONFLICT','Dźwięk jest używany lub został zmieniony.');
        document.audioAssets=document.audioAssets!.filter(a=>!added.some((b:any)=>b.id===a.id));
      }else{
        const removed=prior.filter((a:any)=>!after.some((b:any)=>b.id===a.id));
        if(removed.some((a:any)=>document.audioAssets?.some(b=>b.id===a.id))||(document.audioAssets?.length??0)+removed.length>8)fail('UNDO_CONFLICT','Przywrócenie audio koliduje z późniejszym importem lub limitem.');
        document.audioAssets=[...(document.audioAssets??[]),...removed];
      }
      assertDocument(document);return document;
    }
    if (original.name === 'assets.remove') {
      const diff = original.diff.find((entry: any) => entry.path === '/assets');
      const remaining = new Set((diff?.after ?? []).map((asset: any) => asset.id));
      const removed = (diff?.before ?? []).filter((asset: any) => !remaining.has(asset.id));
      if (!removed.length) fail('UNDO_UNSUPPORTED','Operacja nie usunęła tekstur.');
      if (removed.some((asset: any) => before.document.assets?.some(item => item.id === asset.id)))
        fail('UNDO_CONFLICT','Usunięty zasób został już ponownie dodany.');
      if ((before.document.assets?.length ?? 0) + removed.length > 8)
        fail('UNDO_CONFLICT','Przywrócenie przekroczyłoby limit 8 tekstur. Zwolnij jawnie nieużywane zasoby.');
      const document = structuredClone(before.document);
      // Revision snapshots retain original bytes; restoring does not read the caller filesystem.
      // Retain original order among these assets and keep independent later imports.
      const currentById = new Map((document.assets ?? []).map(asset => [asset.id,asset]));
      const restoreIds = new Set(removed.map((asset: any) => asset.id));
      document.assets = (diff.before ?? []).filter((asset: any) => restoreIds.has(asset.id) || currentById.has(asset.id))
        .map((asset: any) => currentById.get(asset.id) ?? asset);
      for (const asset of before.document.assets ?? []) if (!document.assets!.some(item => item.id === asset.id)) document.assets!.push(asset);
      assertDocument(document); return document;
    }
    if (original.name === 'assets.import') {
      const diff = original.diff.find((entry: any) => entry.path === '/assets');
      if (!diff) fail('UNDO_UNSUPPORTED', 'Import nie dodał nowego zasobu.');
      const prior = new Set((diff.before ?? []).map((asset: any) => asset.id));
      const added = (diff.after ?? []).filter((asset: any) => !prior.has(asset.id));
      if (added.length !== 1) fail('UNDO_UNSUPPORTED', 'Import nie wskazuje jednej nowej tekstury.');
      const asset = added[0], currentAsset = before.document.assets?.find(item => item.id === asset.id);
      if (!currentAsset || canonical(currentAsset) !== canonical(asset)) fail('UNDO_CONFLICT', 'Importowany zasób został później usunięty lub zmieniony.');
      if (before.document.layers.some(layer => layer.texture === `asset:${asset.id}`))
        fail('UNDO_CONFLICT', 'Tekstura z tej operacji jest używana przez warstwę. Najpierw cofnij jej przypisanie.');
      const document = structuredClone(before.document);
      document.assets = document.assets!.filter(item => item.id !== asset.id);
      if (!document.assets.length && diff.before == null) delete document.assets;
      // Preserve unrelated imports and schema 3 fields added in the meantime.
      assertDocument(document); return document;
    }
    if (original.name === 'meshes.importObj' && original.input.target.newLayer) {
      const layerId = original.input.target.newLayer.id;
      const structural = original.diff.find((entry: any) => entry.path === '/layers');
      const added = structural?.after?.find((layer: any) => layer.id === layerId);
      const currentLayer = before.document.layers.find(layer => layer.id === layerId);
      if (!added || !currentLayer || canonical(added) !== canonical(currentLayer)) fail('UNDO_CONFLICT','Importowana nowa warstwa została usunięta lub zmieniona.');
      const originalRevision = original.result.data.project.revision;
      const later = store.db.prepare('SELECT o.value FROM operations o JOIN revisions r ON r.operation_id=o.id WHERE r.project_id=? AND r.revision>?').all(before.id,originalRevision) as any[];
      for (const record of later) for (const entry of JSON.parse(record.value).diff ?? []) {
        if (entry.path.startsWith(`/layers/${layerId}/`) || (entry.path === '/layers' &&
          canonical(entry.before?.find((layer: any) => layer.id === layerId) ?? null) !== canonical(entry.after?.find((layer: any) => layer.id === layerId) ?? null)))
          fail('UNDO_CONFLICT','Historia zawiera późniejszą zmianę importowanej warstwy.');
      }
      return applyChanges(before.document,[{type:'layer.remove',layerId}],actor.kind === 'owner');
    }
    if (original.diff.some((d: any) => d.path === '/layers' || d.path === '/locks')) fail('UNDO_UNSUPPORTED', 'Selektywne cofanie zmian strukturalnych nie jest jeszcze obsługiwane.');
    const paletteAssets = original.name === 'palette.apply' ? original.diff.find((d:any)=>d.path==='/assets') : undefined;
    const authoredDiff = original.diff.filter((d:any)=>!(paletteAssets && d.path==='/assets'));
    const originalRevision = original.result?.data?.revision ?? original.result?.data?.project?.revision;
    const later = store.db.prepare('SELECT o.value FROM operations o JOIN revisions r ON r.operation_id=o.id WHERE r.project_id=? AND r.revision>? ORDER BY r.revision').all(before.id, originalRevision ?? before.revision) as any[];
    const overlaps = (a: string, b: string) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
    for (const record of later) {
      const diff = JSON.parse(record.value).diff ?? [];
      if (diff.some((laterChange: any) => authoredDiff.some((oldChange: any) => overlaps(laterChange.path, oldChange.path)))) fail('UNDO_CONFLICT', 'Historia zawiera późniejszą zależną zmianę.');
    }
    const after = structuredClone(before.document);
    const changes: Change[] = [];
    for (const diff of authoredDiff) {
      const parts = diff.path.split('/').filter(Boolean);
      if(parts[0]==='audioClips'&&(parts.length===2||parts.length===3)){
        const clip=after.audioClips?.find(c=>c.id===parts[1]);
        if(canonical(parts.length===2?clip??null:(clip as any)?.[parts[2]]??null)!==canonical(diff.after??null))fail('UNDO_CONFLICT','Klip audio został później zmieniony.');
        if(parts.length===3)changes.push({type:'audio.set',clipId:parts[1],values:{[parts[2]]:diff.before}});
        else if(diff.before===null)changes.push({type:'audio.remove',clipId:parts[1]});
        else changes.push({type:'audio.add',clip:diff.before});
      } else if (parts[0] === 'layers' && parts.length === 3) {
        const layer = after.layers.find(l => l.id === parts[1]);
        if (!layer || canonical((layer as any)[parts[2]] ?? null) !== canonical(diff.after ?? null)) fail('UNDO_CONFLICT', 'Późniejsza zmiana zależy od cofanej wartości.', { path: diff.path });
        changes.push({ type: 'layer.set', layerId: parts[1], values: { [parts[2]]: diff.before } });
      } else if(parts.length===1&&parts[0]==='lifecycle'){
        if((after.lifecycle??null)!==diff.after)fail('UNDO_CONFLICT','Tryb efektu został później zmieniony.');
        assertEffectLifecycleUnlocked(after);
        if(diff.before===null){delete after.lifecycle;after.profileId=documentProfile();}
        else changes.push({type:'project.set',values:{lifecycle:diff.before}});
      } else if (parts.length === 1 && parts[0] === 'orientWithObject') {
        if ((after.orientWithObject ?? null) !== diff.after) fail('UNDO_CONFLICT', 'Obracanie efektu zostało później zmienione.');
        assertEffectOrientationUnlocked(after);
        if (diff.before === null) delete after.orientWithObject;
        else changes.push({type:'project.set',values:{orientWithObject:diff.before}});
      } else if (parts.length === 1 && ['name', 'duration', 'seed'].includes(parts[0])) {
        if (canonical((after as any)[parts[0]]) !== canonical(diff.after)) fail('UNDO_CONFLICT', 'Wartość projektu została później zmieniona.', { path: diff.path });
        changes.push({ type: 'project.set', values: { [parts[0]]: diff.before } });
      } else if (parts.length === 1 && parts[0] === 'schemaVersion' && ['changes.apply','meshes.importObj'].includes(original.name)) {
        // A schema promotion is compatibility metadata. Undo the authored fields
        // without downgrading a document that may already use newer features.
        if (after.schemaVersion < diff.after) fail('UNDO_CONFLICT', 'Wersja dokumentu została później zmieniona.');
      } else fail('UNDO_UNSUPPORTED', 'Ten rodzaj zmiany nie ma bezpiecznego cofnięcia.');
    }
    if (changes.length && !validateChanges(changes)) fail('UNDO_UNSUPPORTED', 'Nie można odtworzyć zmiany w aktualnym schemacie.');
    const reverted = changes.length ? applyChanges(after, changes, actor.kind === 'owner') : after;
    if (paletteAssets) {
      const priorIds = new Set((paletteAssets.before ?? []).map((a:any)=>a.id));
      const added = paletteAssets.after.filter((a:any)=>!priorIds.has(a.id));
      for (const asset of added) {
        if (canonical(reverted.assets?.find(a=>a.id===asset.id)) !== canonical(asset)
          || reverted.layers.some(l=>l.texture===`asset:${asset.id}`)) fail('UNDO_CONFLICT','Pochodna tekstura palety została usunięta, zmieniona albo jest używana przez późniejszą warstwę.');
      }
      reverted.assets = reverted.assets!.filter(a=>!added.some((item:any)=>item.id===a.id));
      assertDocument(reverted);
    }
    return reverted;
  }
  function execute(command: Command, actor: Actor, operationId: string): { data: any; projectId?: string; diff?: unknown; diagnostics?: unknown[]; status?: 'ok' | 'accepted' } {
    const input = command.input as Record<string, any>, op = command.operation;
    const workflow=workflowOperation({store,authorize,authorizeJob,commit,newProject,renderAvailable:!!render},command,actor,operationId);if(workflow)return workflow;
    switch (op) {
      case 'version': return { data: { version: STUDIO_VERSION, contractVersion: CONTRACT_VERSION, instanceId: store.config.instanceId, workspaceId: store.config.workspaceId } };
      case 'doctor': return { data: { instanceId: store.config.instanceId, workspaceId: store.config.workspaceId, contractVersion: CONTRACT_VERSION, actor, checks: { database: 'ready', api: 'ready', renderer: render ? 'ready' : 'unavailable', native: 'unavailable' }, nativeTestAvailable: false, nativeWorkflow: NATIVE_WORKFLOW } };
      case 'capabilities': {
        if (input.profileId && !EXPORT_PROFILE_IDS.includes(input.profileId)) fail('CAPABILITY_UNAVAILABLE', 'Nieobsługiwany profil.');
        return { data: { contractVersion: CONTRACT_VERSION, profileId: input.profileId ?? PROFILE_ID,
          exportProfiles: EXPORT_PROFILE_IDS.map(id=>({id,mdlFormat:isBinaryProfile(id)?'binary':'ascii',available:!isBinaryProfile(id)||binaryCompilerAvailable()})),
          operations: [...implemented].filter(name => !['preview.request','preview.compose'].includes(name) || !!render),
          layerTypes: ['emitter','mesh','trail','beam'],beamAuthoring:BEAM_CAPABILITIES, trailAuthoring:TRAIL_CAPABILITIES, meshGeometryKinds:['box','ring','custom'],
          meshShading:MESH_SHADING_CAPABILITIES,meshDeformation:MESH_DEFORMATION_CAPABILITIES,meshAnimationChannels:['position','orientation','scale','alpha','vertices'], documentSchemaVersions:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24],compositionPreview:COMPOSITION_CAPABILITIES,emitterFlipbook:FLIPBOOK_CAPABILITIES,effectLifecycle:LIFECYCLE_CAPABILITIES,effectIntegration:EFFECT_INTEGRATION_CAPABILITIES,audio:AUDIO_CAPABILITIES,
          objImport:OBJ_IMPORT_CAPABILITIES,meshMaterial:MESH_MATERIAL_CAPABILITIES,palette:PALETTE_CAPABILITIES,
          emitterModes: ['Explosion', 'Fountain'], emitterOrientation: EMITTER_ORIENTATION_CAPABILITIES,
          textures: ['spark', 'smoke', 'glow'], customTextures:TEXTURE_CAPABILITIES, particleAgeControls:PARTICLE_AGE_CAPABILITIES,
          exportFormats: ['ascii-mdl', 'binary-mdl', 'tga', 'txi', 'hak'], preview: !!render, nativeVerified: false,
          nativeTestAvailable: false, nativeWorkflow: NATIVE_WORKFLOW, lightAvailable: false, ribbonAvailable: false, mcp: false, webmcp: true } };
      }
      case 'workspaces.list': return { data: { items: [{ id: store.config.workspaceId, workspaceId: store.config.workspaceId, instanceId: store.config.instanceId }], nextCursor: null } };
      case 'operations.list': return { data: { items: [...implemented].filter(name => operationSchemas[name]).map(name => ({ name, description: operationSchemas[name].description, mutates: operationSchemas[name].mutates, available: !['preview.request','preview.compose'].includes(name) || !!render })) } };
      case 'schema.get': if (!operationSchemas[input.operation]) fail('UNKNOWN_OPERATION', 'Nieznana operacja.'); return { data: { name: input.operation, ...operationSchemas[input.operation], available: implemented.has(input.operation) && (!['preview.request','preview.compose'].includes(input.operation) || !!render) } };
      case 'projects.list': {
        const projects = (store.db.prepare('SELECT value FROM projects ORDER BY id').all() as any[]).map(row => JSON.parse(row.value)).filter(p => actor.kind === 'owner' || actor.projectIds.includes(p.id));
        return { data: paging(projects, input) };
      }
      case 'projects.resolve': {
        const matches = (store.db.prepare('SELECT value FROM projects ORDER BY id').all() as any[]).map(row => JSON.parse(row.value)).filter(p => p.document.name === input.name && (actor.kind === 'owner' || actor.projectIds.includes(p.id)));
        if (!matches.length) fail('NOT_FOUND', 'Nie znaleziono projektu.');
        if (matches.length > 1) fail('AMBIGUOUS_PROJECT', 'Nazwa wskazuje kilka projektów.', { candidates: matches.map(p => ({ id: p.id, name: p.document.name })) });
        return { data: matches[0] };
      }
      case 'projects.inspect': case 'revisions.get': {
        const project=store.project(input.projectId,input.revision);
        return {data:project,diagnostics:project.document.audioClips?.length?[audioGainDiagnostic(project.document)]:[]};
      }
      case 'audio.list': return{data:{items:(store.project(input.projectId,input.revision).document.audioAssets??[]).map(audioMetadata),nextCursor:null}};
      case 'audio.get': {
        const asset=store.project(input.projectId,input.revision).document.audioAssets?.find(a=>a.id===input.assetId);
        if(!asset)fail('MISSING_ASSET','Dźwięk nie istnieje w tej rewizji.');return{data:asset};
      }
      case 'audio.import': {
        const before=current(input),asset=importAudio(input.fileName,input.dataBase64);
        if(before.document.audioAssets?.some(a=>a.id===asset.id))return{data:{project:before,assetId:asset.id},projectId:before.id};
        const document=promoteDocumentSchema({...structuredClone(before.document),audioAssets:[...(before.document.audioAssets??[]),asset]});
        const diff=changedFields(before.document,document),project=commit(before,document,operationId);return{data:{project,assetId:asset.id},projectId:project.id,diff};
      }
      case 'audio.remove': {
        const before=current(input),selected=new Set<string>(input.assetIds);
        for(const assetId of selected){
          if(!before.document.audioAssets?.some(a=>a.id===assetId))fail('MISSING_ASSET','Dźwięk nie istnieje w bieżącej rewizji.');
          if(before.document.audioClips?.some(c=>c.assetId===assetId))fail('ASSET_IN_USE','Dźwięk jest używany przez klip, także wyłączony.');
        }
        const document={...structuredClone(before.document),audioAssets:before.document.audioAssets!.filter(a=>!selected.has(a.id))};
        const diff=changedFields(before.document,document),project=commit(before,document,operationId);return{data:{project,removedAssetIds:[...selected]},projectId:project.id,diff};
      }
      case 'assets.list': return { data: { items: (store.project(input.projectId, input.revision).document.assets ?? []).map(textureAssetMetadata), nextCursor: null } };
      case 'assets.get': {
        const asset = store.project(input.projectId, input.revision).document.assets?.find(asset => asset.id === input.assetId);
        if (!asset) fail('MISSING_ASSET', 'Tekstura nie istnieje w tej rewizji projektu.');
        return { data: asset };
      }
      case 'assets.import': {
        const before = current(input), asset = createTextureAsset(input.fileName, input.pngBase64, input.targetSize);
        if (before.document.assets?.some(item => item.id === asset.id)) return { data: { project: before, assetId: asset.id }, projectId: before.id };
        const document: EffectDocument = promoteDocumentSchema({ ...structuredClone(before.document), assets: [...(before.document.assets ?? []), asset] });
        const diff = changedFields(before.document, document), project = commit(before, document, operationId);
        return { data: { project, assetId: asset.id }, projectId: project.id, diff };
      }
      case 'assets.remove': {
        const before = current(input), selected = new Set<string>(input.assetIds);
        for (const assetId of selected) {
          if (!before.document.assets?.some(asset => asset.id === assetId)) fail('MISSING_ASSET','Wskazana tekstura nie istnieje w bieżącej rewizji.',{assetId});
          const references = before.document.layers.filter(layer => layer.texture === `asset:${assetId}`).map(layer => layer.id);
          if (references.length) fail('ASSET_IN_USE','Nie można usunąć tekstury używanej przez warstwę, także wyłączoną lub zablokowaną.',{assetId,layerIds:references});
        }
        const document = structuredClone(before.document);
        document.assets = document.assets!.filter(asset => !selected.has(asset.id));
        const diff = changedFields(before.document,document), project = commit(before,document,operationId);
        return { data:{project,removedAssetIds:[...selected]}, projectId:project.id, diff };
      }
      case 'meshes.importObj.preview': case 'meshes.importObj': {
        const before = current(input), prepared = prepareObjImport(before.document,input as any);
        const document = applyChanges(before.document,prepared.changes,actor.kind === 'owner'); assertDocument(document);
        const diff = changedFields(before.document,document);
        if (op === 'meshes.importObj.preview') return {data:{document,diff,report:prepared.report}};
        const project = commit(before,document,operationId);
        return {data:{project,report:prepared.report},projectId:project.id,diff};
      }
      case 'palette.preview': case 'palette.apply': {
        const before=current(input), prepared=preparePalette(before.document,input.options);
        assertDocument(prepared.document);
        if(op==='palette.preview')return {data:{projectId:before.id,revision:before.revision,...prepared}};
        if(input.proposalHash!==prepared.proposalHash)fail('PALETTE_PROPOSAL_CONFLICT','Paleta nie odpowiada zatwierdzonemu podglądowi. Wykonaj nowy podgląd.');
        const project=commit(before,prepared.document,operationId);
        return {data:{project,report:prepared.report,proposalHash:prepared.proposalHash},projectId:project.id,diff:prepared.diff};
      }
      case 'projects.create': { const project = newProject(makeDocument(input.preset, input.name, input.lifecycle), input.projectId, operationId, actor); return { data: project, projectId: project.id }; }
      case 'projects.fork': { const original = store.project(input.projectId, input.revision), doc = structuredClone(original.document); doc.name = input.name ?? (doc.name + ' — wariant'); const project = newProject(doc, input.newProjectId, operationId, actor, original.id); return { data: project, projectId: project.id }; }
      case 'projects.import': {
        if ((input.document === undefined) === (input.bundleBase64 === undefined)) fail('VALIDATION_ERROR', 'Podaj dokładnie dokument albo paczkę.');
        const document = input.bundleBase64 ? importProjectBundle(input.bundleBase64) : input.document;
        assertDocument(document); if(input.document)verifyAudioImports(document); const project = newProject(document, input.projectId, operationId, actor); return { data: project, projectId: project.id };
      }
      case 'projects.export': {
        const project = store.project(input.projectId, input.revision), bytes = exportProjectBundle(project);
        return { data: { projectId: project.id, revision: project.revision, artifact: store.artifact(project.id, 'studio-project.zip', bytes) }, projectId: project.id };
      }
      case 'changes.preview': case 'changes.apply': {
        const before = current(input), document = applyChanges(before.document, input.changes, actor.kind === 'owner'); assertDocument(document);
        const diff = changedFields(before.document, document);
        const diagnostics = document.audioClips?.length ? [...analyzeAudioLevels(document).map(report=>({...audioLevelDiagnostic(report),audio:report})),audioGainDiagnostic(document)] : [];
        if (op === 'changes.preview') return { data: { projectId: before.id, revision: before.revision, document, diff }, diagnostics };
        const project = commit(before, document, operationId); return { data: { ...project, diff }, projectId: project.id, diff, diagnostics };
      }
      case 'changes.revert': { const before = current(input), document = revert(before, input.operationId, actor), diff = changedFields(before.document, document), project = commit(before, document, operationId); return { data: { ...project, diff }, projectId: project.id, diff }; }
      case 'revisions.restore': { const before = current(input), document = store.project(input.projectId, input.revision).document, diff = changedFields(before.document, document), project = commit(before, document, operationId); return { data: { ...project, diff }, projectId: project.id, diff }; }
      case 'revisions.list': return { data: paging((store.db.prepare(`SELECT r.value, r.operation_id, o.value AS operation_value, a.value AS actor_value
          FROM revisions r LEFT JOIN operations o ON o.id=r.operation_id LEFT JOIN actors a ON a.id=o.actor_id
          WHERE r.project_id=? ORDER BY r.revision DESC`).all(input.projectId) as any[]).map(row => {
          const operation = row.operation_value ? JSON.parse(row.operation_value) : null;
          const author = row.actor_value ? JSON.parse(row.actor_value) : null;
          return { ...JSON.parse(row.value), operationId: row.operation_id,
            actorId: operation?.actorId ?? null, actorName: author?.name ?? null,
            actorKind: author?.kind ?? null, committedAt: operation?.createdAt ?? null };
        }), input, value => String(value.revision)) };
      case 'policy.inspect': return { data: { projectId: input.projectId, paused: !!(store.db.prepare('SELECT pause_ai FROM policies WHERE project_id=?').get(input.projectId) as any)?.pause_ai } };
      case 'policy.set': {
        store.project(input.projectId); store.db.prepare('INSERT INTO policies(project_id,pause_ai) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET pause_ai=excluded.pause_ai').run(input.projectId, input.paused ? 1 : 0);
        store.event(input.projectId, { type: 'policy.changed', paused: input.paused, actorId: actor.id });
        if (!input.paused) for (const row of store.db.prepare('SELECT value FROM jobs WHERE status=?').all('blocked') as any[]) { const job = JSON.parse(row.value) as Job; if ((job.sourceProjectIds??[job.projectId]).includes(input.projectId)&&job.error?.code === 'AI_PAUSED') { job.status = 'queued'; delete job.error; job.updatedAt = now(); store.saveJob(job); } }
        return { data: { projectId: input.projectId, paused: input.paused }, projectId: input.projectId };
      }
      case 'actors.list': return { data: { items: (store.db.prepare('SELECT value FROM actors ORDER BY id').all() as any[]).map(row => JSON.parse(row.value)) } };
      case 'actors.create': {
        if (input.scopes.some((scope: string) => !scopes.includes(scope))) fail('INVALID_SCOPE', 'Nieobsługiwany zakres klienta.');
        for (const projectId of input.projectIds) store.project(projectId);
        const token = randomBytes(32).toString('base64url'), value: Actor = { id: id(), name: input.name, kind: 'agent', scopes: [...new Set<string>(input.scopes)], projectIds: [...new Set<string>(input.projectIds)], revoked: false };
        store.db.prepare('INSERT INTO actors(id,token_hash,value) VALUES(?,?,?)').run(value.id, hash(token), JSON.stringify(value)); return { data: { ...value, token } };
      }
      case 'actors.revoke': {
        const value = store.actor(input.actorId); if (value.kind === 'owner') fail('FORBIDDEN', 'Nie można cofnąć właściciela.'); value.revoked = true; store.db.prepare('UPDATE actors SET value=? WHERE id=?').run(JSON.stringify(value), value.id); store.db.prepare('DELETE FROM sessions WHERE actor_id=?').run(value.id); return { data: value };
      }
      case 'preview.compose': {
        if(!render)fail('CAPABILITY_UNAVAILABLE','Worker renderu nie jest skonfigurowany.');
        const pending=(store.db.prepare('SELECT count(*) AS n FROM jobs WHERE status IN (?,?)').get('queued','running') as any).n;
        if(pending>=32)fail('LIMIT_EXCEEDED','Kolejka osiągnęła limit 32 zadań.');
        const snapshot=freezeComposition(store,input as CompositionInput),first=snapshot.sources[0],jobId=id();
        const job:Job={id:jobId,jobId,actorId:actor.id,projectId:first.projectId,revision:first.revision,sourceProjectIds:[...new Set(snapshot.sources.map(s=>s.projectId))],type:op,status:'queued',createdAt:now(),updatedAt:now(),artifacts:[]};
        store.saveJob(job,canonical(snapshot),JSON.stringify(input));return {data:job,projectId:first.projectId,status:'accepted'};
      }
      case 'candidate.build': case 'preview.request': {
        if (op === 'preview.request' && !render) fail('CAPABILITY_UNAVAILABLE', 'Worker renderu nie jest skonfigurowany.');
        if (input.profileId && !EXPORT_PROFILE_IDS.includes(input.profileId)) fail('CAPABILITY_UNAVAILABLE', 'Nieobsługiwany profil.');
        if (isBinaryProfile(input.profileId) && (op !== 'candidate.build' || !binaryCompilerAvailable())) fail('CAPABILITY_UNAVAILABLE', 'Binarny profil budowy nie jest dostępny dla tej operacji lub hosta.');
        const project = store.project(input.projectId, input.revision), jobId = id();
        if(op==='candidate.build'&&input.profileId&&!([documentProfile(project.document.lifecycle),binaryProfile(project.document.lifecycle)] as string[]).includes(input.profileId))fail('CAPABILITY_UNAVAILABLE','Profil eksportu nie odpowiada trybowi dokumentu.');
        if(op==='preview.request'){const total=previewDuration(project.document,input.cycles);if(project.document.lifecycle==='duration'&&(input.time??0)>total)fail('VALIDATION_ERROR','Czas PNG przekracza liczbę obiegów.');}
        const pending = (store.db.prepare('SELECT count(*) AS n FROM jobs WHERE status IN (?,?)').get('queued', 'running') as any).n;
        if (pending >= 32) fail('LIMIT_EXCEEDED', 'Kolejka osiągnęła limit 32 zadań.');
        const job: Job = { id: jobId, jobId, actorId: actor.id, projectId: project.id, revision: project.revision, type: op, status: 'queued', createdAt: now(), updatedAt: now(), artifacts: [] };
        store.saveJob(job, canonical(project.document), JSON.stringify(input)); return { data: job, projectId: project.id, status: 'accepted' };
      }
      case 'native.test.status': case 'native.test.request': {
        const row = item('jobs', input.candidateId), status = nativeTestStatus(JSON.parse(row.value), row.snapshot);
        if (op === 'native.test.request') fail('CAPABILITY_UNAVAILABLE', 'Test NWN wymaga kwalifikowanego runnera. Nie utworzono zadania ani nie uruchomiono gry.', { operation: op, nativeStatus: status });
        return { data: status };
      }
      case 'jobs.get': return { data: JSON.parse(item('jobs', input.jobId).value) };
      case 'jobs.list': return { data: listFor('jobs', actor, input) };
      case 'jobs.cancel': {
        const job = JSON.parse(item('jobs', input.jobId).value) as Job;
        if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) { job.status = job.status === 'running' || job.status === 'cancelling' ? 'cancelling' : 'cancelled'; job.updatedAt = now(); store.saveJob(job); }
        return { data: job, projectId: job.projectId };
      }
      case 'artifacts.get': return { data: JSON.parse(item('artifacts', input.artifactId).value) };
      case 'artifacts.list': return { data: listFor('artifacts', actor, input) };
      case 'operations.get': return { data: JSON.parse(item('operations', input.operationId).value) };
      case 'operations.resolve': {
        const row = store.db.prepare('SELECT result FROM idempotency WHERE scope=?').get(scopeKey(actor.id, input.operation, input.projectId, input.idempotencyKey)) as any;
        if (!row) fail('NOT_FOUND', 'Nie znaleziono wykonania dla klucza.');
        const result = JSON.parse(row.result); const original = JSON.parse(item('operations', result.operationId).value);
        checkCommandAccess(actor.id, { operation: original.name, input: original.input }, false);
        return { data: result };
      }
      case 'events.list': {
        const rows = store.db.prepare('SELECT cursor,value FROM events WHERE project_id=? AND cursor>? ORDER BY cursor LIMIT ?').all(input.projectId, input.cursor ?? 0, input.limit ?? 100) as any[];
        return { data: { items: rows.map(row => ({ ...JSON.parse(row.value), cursor: row.cursor })).filter(value=>value.type!=='job.changed'||canReadResource(actor,'jobs',{id:value.jobId})), cursor: rows.at(-1)?.cursor ?? (input.cursor ?? 0) } };
      }
      case 'reviews.list': return { data: listFor('reviews', actor, { ...input, limit: 100 }) };
      case 'reviews.add': {
        store.project(input.projectId, input.revision);
        if (actor.kind !== 'owner' && input.verdict && input.verdict !== 'note') fail('FORBIDDEN', 'Ocena artystyczna należy do człowieka.');
        const review = { id: id(), projectId: input.projectId, revision: input.revision, text: input.text, verdict: input.verdict ?? 'note', actorId: actor.id, actorKind: actor.kind, createdAt: now() };
        store.db.prepare('INSERT INTO reviews(id,project_id,value) VALUES(?,?,?)').run(review.id, review.projectId, JSON.stringify(review)); store.event(review.projectId, { type: 'review.added', review }); return { data: review, projectId: review.projectId };
      }
      default: fail('CAPABILITY_UNAVAILABLE', 'Operacja nie została zaimplementowana.', { operation: op });
    }
  }
  function dispatch(actorId: string, command: Command, maxDocumentSchemaVersion=24, supportsComposition=true): Result {
    const requestId = id();
    try {
      if (!validateCommand(command)) fail('VALIDATION_ERROR', 'Niepoprawne polecenie.', validateCommand.errors);
      if (command.contractVersion && command.contractVersion !== CONTRACT_VERSION) fail('CONTRACT_MISMATCH', 'Nieobsługiwana wersja kontraktu.', { supported: CONTRACT_VERSION });
      if (command.workspaceId && command.workspaceId !== store.config.workspaceId) fail('WORKSPACE_MISMATCH', 'Wybrano inną przestrzeń danych.');
      validateOperationInput(command.operation, command.input);
      const mutates = operationSchemas[command.operation].mutates;
      if (mutates && !command.idempotencyKey) fail('IDEMPOTENCY_REQUIRED', 'Mutacja wymaga stabilnego klucza idempotencji.');
      const transaction = () => {
        const access = checkCommandAccess(actorId, command, false);
        const upgradeRequired=(version=10)=>{
          const minimumStudioVersion=version>=24?'0.30.0':version>=23?'0.29.0':version>=22?'0.28.2':version>=21?'0.28.1':version>=20?'0.28.0':version>=19?'0.27.0':version>=18?'0.26.2':version>=17?'0.26.0':version>=16?'0.25.0':version>=15?'0.24.0':version>=14?'0.23.0':version>=13?'0.22.0':version>=12?'0.20.0':version>=11?'0.19.0':'0.18.0';
          fail('CLIENT_UPGRADE_REQUIRED',`Ta operacja wymaga Studio ${minimumStudioVersion}+. Zaktualizuj CLI albo otwórz nową kartę; zachowaj niezapisane zmiany w starej karcie.`,{minimumStudioVersion,documentSchemaVersion:version});
        };
        const compositionUpgrade=()=>fail('CLIENT_UPGRADE_REQUIRED','Podgląd kompozycji wymaga Studio 0.21.0+ i nowej karty; zachowaj starsze szkice.',{minimumStudioVersion:'0.21.0',requiredCapability:'composition-preview-v1'});
        if(command.operation==='preview.compose'&&(!supportsComposition||maxDocumentSchemaVersion<12))compositionUpgrade();
        const compatible=(value:unknown):void=>{
          if(['capabilities','schema.get','operations.list','health'].includes(command.operation))return;
          if(!value||typeof value!=='object')return;
          const v=value as Record<string,unknown>;
          if(!supportsComposition&&(v.type==='preview.compose'||v.compositionVersion===1))compositionUpgrade();
          if(supportsComposition&&maxDocumentSchemaVersion>=24)return;
          const version=Array.isArray(v.layers)?v.schemaVersion:v.documentSchemaVersion;
          if(typeof version==='number'&&version>maxDocumentSchemaVersion)upgradeRequired(version);
          for(const child of Object.values(v))compatible(child);
        };
        if((WORKFLOW_OPERATIONS.includes(command.operation)||(command.operation==='preview.request'&&command.input.conditions!==undefined))&&maxDocumentSchemaVersion<20)upgradeRequired(20);
        compatible(command.input);
        if(maxDocumentSchemaVersion<23&&['changes.preview','changes.apply'].includes(command.operation))
          for(const c of (command.input.changes??[]) as Change[])
            if((c.type==='layer.set'&&Object.hasOwn(c.values,'materialMotion'))||(c.type==='layer.add'&&Object.hasOwn(c.layer,'materialMotion'))||(c.type==='locks.set'&&c.locks.some(l=>l.field==='materialMotion')))upgradeRequired(23);
        if(maxDocumentSchemaVersion<19&&['changes.preview','changes.apply'].includes(command.operation))
          for(const c of (command.input.changes??[]) as Change[])
            if((c.type==='layer.set'&&Object.hasOwn(c.values,'beamBinding'))||(c.type==='layer.add'&&Object.hasOwn(c.layer,'beamBinding'))||(c.type==='locks.set'&&c.locks.some(l=>l.field==='beamBinding')))upgradeRequired(19);
        if(maxDocumentSchemaVersion<18&&['changes.preview','changes.apply'].includes(command.operation))
          for(const c of (command.input.changes??[]) as Change[])
            if((c.type==='layer.set'&&Object.hasOwn(c.values,'textureMapping'))||(c.type==='layer.add'&&Object.hasOwn(c.layer,'textureMapping'))||(c.type==='locks.set'&&c.locks.some(l=>l.field==='textureMapping')))upgradeRequired(18);
        if(maxDocumentSchemaVersion<17&&['changes.preview','changes.apply'].includes(command.operation))
          for(const c of command.input.changes as Change[])
            if((c.type==='layer.set'&&Object.hasOwn(c.values,'nativeMotion'))||(c.type==='layer.add'&&Object.hasOwn(c.layer,'nativeMotion'))||(c.type==='locks.set'&&c.locks.some(l=>l.field==='nativeMotion')))upgradeRequired(17);
        if(maxDocumentSchemaVersion<14&&['changes.preview','changes.apply'].includes(command.operation))
          for(const change of command.input.changes as Change[])
            if((change.type==='layer.set'&&Object.hasOwn(change.values,'deformationInterpolation')) || (change.type==='layer.add'&&Object.hasOwn(change.layer,'deformationInterpolation')) || (change.type==='locks.set'&&change.locks.some(l=>l.field==='deformationInterpolation')))upgradeRequired(14);
        if(command.operation==='preview.compose')for(const instance of (command.input.instances as CompositionInput['instances']))compatible(store.project(instance.projectId,instance.revision).document);
        if(maxDocumentSchemaVersion<13){
          if(command.input.lifecycle!==undefined||command.input.cycles!==undefined||String(command.input.profileId??'').includes('-duration-'))upgradeRequired(13);
          if(['changes.preview','changes.apply'].includes(command.operation))for(const c of command.input.changes as Change[])
            if((c.type==='project.set'&&Object.hasOwn(c.values,'lifecycle'))||(c.type==='locks.set'&&c.locks.some(l=>l.layerId==='@effect'&&l.field==='lifecycle')))upgradeRequired(13);
        }
        // Discovery remains available before a client knows the new declaration.
        if(maxDocumentSchemaVersion<12&&['changes.preview','changes.apply'].includes(command.operation))
          for(const change of command.input.changes as Change[])
            if((change.type==='layer.set'&&Object.hasOwn(change.values,'flipbook')) || (change.type==='layer.add'&&Object.hasOwn(change.layer,'flipbook')) || (change.type==='locks.set'&&change.locks.some(l=>l.field==='flipbook')))upgradeRequired(12);
        if(maxDocumentSchemaVersion<11&&['changes.preview','changes.apply'].includes(command.operation))
          for(const change of command.input.changes as Change[]){
            if((change.type==='project.set'&&Object.hasOwn(change.values,'orientWithObject'))||
              (change.type==='locks.set'&&change.locks.some(l=>l.layerId==='@effect')))upgradeRequired(11);
            const values=change.type==='audio.set'?change.values:change.type==='audio.add'?change.clip:null;
            if(maxDocumentSchemaVersion<10&&values&&(Object.hasOwn(values,'gainDb')||(values.gain??0)>4))upgradeRequired();
          }
        if(maxDocumentSchemaVersion<24&&access.projectId)compatible(store.project(access.projectId,command.input.revision as number|undefined).document);
        const key = scopeKey(actorId, command.operation, command.input.projectId, command.idempotencyKey ?? '');
        const fingerprint = hash(canonical({ input: command.input, contractVersion: CONTRACT_VERSION }));
        if (mutates) {
          const old = store.db.prepare('SELECT fingerprint,result FROM idempotency WHERE scope=?').get(key) as any;
          if (old) { if (old.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Ten klucz ma inne dane wejściowe.'); const cached=JSON.parse(old.result);compatible(cached.data);return { ...cached, requestId } as Result; }
          checkCommandAccess(actorId, command, true);
        }
        const operationId = id(), result = execute(command, access.actor, operationId);
        compatible(result.data);
        validateOperationOutput(command.operation, result.data);
        const envelope: Result = { contractVersion: CONTRACT_VERSION, requestId, ...(mutates ? { operationId } : {}), status: result.status ?? 'ok', data: result.data, diagnostics: result.diagnostics ?? [] };
        if (!validateResult(envelope)) fail('INVALID_RESULT', 'Wynik nie spełnia kontraktu.');
        if (mutates) {
          const record = { id: operationId, operationId, actorId, name: command.operation, input: command.input, projectId: result.projectId ?? access.projectId ?? null, createdAt: now(), diff: result.diff, result: envelope };
          store.db.prepare('INSERT INTO operations(id,actor_id,project_id,name,value) VALUES(?,?,?,?,?)').run(operationId, actorId, record.projectId, command.operation, JSON.stringify(record));
          store.db.prepare('INSERT INTO idempotency(scope,fingerprint,result) VALUES(?,?,?)').run(key, fingerprint, JSON.stringify(envelope));
        }
        return envelope;
      };
      const result = mutates ? store.db.transaction(transaction).immediate() : transaction();
      if (mutates && command.operation === 'jobs.cancel' && result.status !== 'failed') worker.cancel(String(command.input.jobId));
      if (mutates) worker.schedule();
      return result;
    } catch (error) {
      const e = error instanceof DomainError ? error : new DomainError('INTERNAL_ERROR', 'Operacja nie mogła zostać wykonana.');
      return { contractVersion: CONTRACT_VERSION, requestId, status: 'failed', error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}), retryable: false }, diagnostics: [] };
    }
  }
  worker.schedule();
  return { dispatch, authorize, authorizeJob, authorizeArtifact, projectAccess, worker, implemented };
}
