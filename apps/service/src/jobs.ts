import {runIteration,type IterationSnapshot} from './iteration.js';
import type {PreviewConditions} from '../../../packages/core/src/workflow.js';
import {compositionManifest,type CompositionSnapshot} from '../../../packages/core/src/composition.js';
import {verifyComposition} from './composition.js';
import { zipSync, strToU8 } from 'fflate';
import type { EffectDocument } from '../../../packages/core/src/model.js';
import type { PreviewCamera } from '../../../packages/core/src/camera.js';
import { DomainError, CONTRACT_VERSION } from '../../../packages/core/src/model.js';
import { textureAssetMetadata } from '../../../packages/core/src/textures.js';
import { buildCandidate } from '../../../packages/nwn-format/src/index.js';
import {bindEffectIntegration} from '../../../packages/nwn-format/src/effect-integration.js';
import { buildCompiledCandidate } from '../../../packages/nwn-format/src/compiled-candidate.js';
import { BINARY_PROFILE_ID,isBinaryProfile,binaryProfile } from '../../../packages/core/src/export-profiles.js';
import { canonical, hash, now, type Store, type Job } from './store.js';
import { jobFailure, rendererFailure } from './render-errors.js';

export type Render = (document: EffectDocument, options: { conditions?:PreviewConditions;composition?:CompositionSnapshot; cycles?:number; time: number; format?: 'png' | 'webm'; camera?: PreviewCamera; signal: AbortSignal }) => Promise<{ files: Array<{ name: string; data: Uint8Array }>; metadata?: unknown }>;
export function createWorker(store: Store, authorize: (actorId: string, projectId: string, scope: string, writing: boolean) => void, render?: Render) {
  let active: Promise<void> | undefined, closed = false;
  const controllers = new Map<string, AbortController>();
  // These two job types have local outputs only. No NWN/Toolset process
  // is launched here; a future native job must reconcile rather than replay.
  store.db.transaction(() => {
    for (const row of store.db.prepare('SELECT value FROM jobs WHERE status IN (?,?)').all('running', 'cancelling') as any[]) {
      const job = JSON.parse(row.value) as Job;
      job.status = job.status === 'cancelling' ? 'cancelled' : 'queued'; job.updatedAt = now(); store.saveJob(job);
    }
  })();
  async function work() {
    while (!closed) {
      const row = store.db.prepare('SELECT * FROM jobs WHERE status=? ORDER BY rowid LIMIT 1').get('queued') as any;
      if (!row) return;
      const job = JSON.parse(row.value) as Job;
      const scope = job.type === 'candidate.build'||job.type==='iteration.prepare' ? 'build' : 'render';
      const controller = new AbortController(); controllers.set(job.id, controller);
      try {
        store.db.transaction(() => { for(const projectId of job.sourceProjectIds??[job.projectId]){authorize(job.actorId,projectId,scope,true);if(job.type==='preview.compose')authorize(job.actorId,projectId,'read',false);if(job.type==='iteration.prepare')for(const required of ['read','export',...(JSON.parse(row.snapshot).render?['render']:[])])authorize(job.actorId,projectId,required,true);} job.status = 'running'; job.updatedAt = now(); store.saveJob(job); })();
        const snapshot = JSON.parse(row.snapshot), composition=job.type==='preview.compose'?snapshot as CompositionSnapshot:undefined;
        if(composition)verifyComposition(composition);
        const doc = job.type==='iteration.prepare'?(snapshot as IterationSnapshot).baselineDocument:composition?composition.sources[0].document:snapshot as EffectDocument, options = composition?.input??JSON.parse(row.options);
        let files: Array<{ name: string; data: Uint8Array }>, metadata: unknown;
        if(job.type==='iteration.prepare'){
          const result=await runIteration(store,job,snapshot,authorize,render,controller.signal);files=result.files;metadata=result.metadata;
        }else if (job.type === 'candidate.build') {
          const binary = isBinaryProfile(options.profileId);
          const modelName = options.modelName ?? ('vfx' + hash(job.projectId + ':' + job.revision + (binary ? ':' + binaryProfile(doc.lifecycle) : '')).slice(0, 12));
          const result = binary ? await buildCompiledCandidate(doc, modelName, controller.signal) : buildCandidate(doc, modelName);
          bindEffectIntegration(result,doc,{projectId:job.projectId,revision:job.revision});
          files = result.files; metadata = { modelName, validation: result.validation, nativeVerified: false };
        } else {
          if (!render) throw new DomainError('CAPABILITY_UNAVAILABLE', 'Worker renderu nie jest skonfigurowany.');
          const result = await render(doc, { ...(composition?{composition}:{}),...(options.cycles===undefined?{}:{cycles:options.cycles}), conditions:options.conditions,time: options.time ?? Math.min(.5, composition?.input.duration??doc.duration), format: options.format ?? 'png', ...(options.camera === undefined ? {} : { camera: options.camera }), signal: controller.signal });
          files = result.files; metadata = result.metadata;
          if(composition)files.push({name:'composition.json',data:strToU8(JSON.stringify({...compositionManifest(composition),snapshotSha256:hash(canonical(composition)),render:metadata},null,2))});
          if (!files.length) throw new DomainError('RENDER_EMPTY', 'Renderer nie zwrócił artefaktu.');
        }
        if (closed) return;
        store.db.transaction(() => {
          const current = JSON.parse((store.db.prepare('SELECT value FROM jobs WHERE id=?').get(job.id) as any).value) as Job;
          if (current.status === 'cancelled') return;
          if (current.status === 'cancelling' || controller.signal.aborted) { current.status = 'cancelled'; current.updatedAt = now(); store.saveJob(current); return; }
          for(const projectId of job.sourceProjectIds??[job.projectId]){authorize(job.actorId,projectId,scope,true);if(job.type==='preview.compose')authorize(job.actorId,projectId,'read',false);if(job.type==='iteration.prepare')for(const required of ['read','export',...(JSON.parse(row.snapshot).render?['render']:[])])authorize(job.actorId,projectId,required,true);}
          const total = files.reduce((n, f) => n + f.data.length, 0);
          if (total > 256 * 1024 * 1024) throw new DomainError('LIMIT_EXCEEDED', 'Wynik zadania przekroczył limit 256 MiB.');
          job.artifacts = files.map(file => store.artifact(job.projectId, file.name, file.data, job.id));
          // The manifest describes content artifacts only. Its own artifact and
          // enclosing ZIP are published separately; neither can have a valid
          // self-reference hash. Serialize once before extending job.artifacts.
          const manifest = { contractVersion: CONTRACT_VERSION, schemaVersion: 1, instanceId: store.config.instanceId, workspaceId: store.config.workspaceId, projectId: job.projectId, revision: job.revision, jobId: job.id, snapshotSha256: hash(canonical(job.type==='iteration.prepare'?snapshot:composition??doc)), profileId: job.type==='iteration.prepare'?'studio-iteration-v1':composition?'studio-composition-preview-v1':options.profileId ?? doc.profileId, assets: composition?[]:(doc.assets ?? []).map(textureAssetMetadata), artifacts: structuredClone(job.artifacts), metadata, nativeVerified: false };
          const handoffBytes = strToU8(JSON.stringify(manifest, null, 2));
          job.artifacts.push(store.artifact(job.projectId, 'handoff.json', handoffBytes, job.id));
          if (job.type === 'candidate.build') {
            const zipFiles = Object.fromEntries(files.map(file => [file.name, file.data]));
            zipFiles['handoff.json'] = handoffBytes;
            const zip = zipSync(zipFiles, { level: 6 });
            job.artifacts.push(store.artifact(job.projectId, 'candidate.zip', zip, job.id));
          }
          job.status = 'succeeded'; job.updatedAt = now(); job.metadata = metadata; store.saveJob(job);
        })();
      } catch (error) {
        if (closed) return;
        const current = JSON.parse((store.db.prepare('SELECT value FROM jobs WHERE id=?').get(job.id) as any).value) as Job;
        if (current.status === 'cancelling' || controller.signal.aborted || (error instanceof DomainError && error.code === 'CANCELLED')) {
          current.status = 'cancelled'; current.error = jobFailure(rendererFailure(error,{stage:'worker'},[],true)); current.updatedAt = now(); store.saveJob(current);
        } else if (current.status !== 'cancelled') {
          const e = jobFailure(error);
          job.status = ['AI_PAUSED', 'FORBIDDEN', 'UNAUTHORIZED'].includes(e.code) ? 'blocked' : 'failed';
          job.error = e; job.updatedAt = now(); store.saveJob(job);
        }
      } finally { controllers.delete(job.id); }
    }
  }
  function schedule() {
    if (active || closed) return;
    active = new Promise<void>(resolve => setImmediate(resolve)).then(work).finally(() => { active = undefined; });
  }
  async function drain() { schedule(); await active; }
  function cancel(jobId: string) { controllers.get(jobId)?.abort(); }
  async function close() { closed = true; for (const c of controllers.values()) c.abort(); await active; }
  return { schedule, drain, cancel, close, available: !!render };
}
