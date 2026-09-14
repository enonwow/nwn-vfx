import { CONTRACT_VERSION, DomainError, type EffectDocument, type Project, type Result } from '../../../packages/core/src/model.js';
import { operationSchemas, inputSchemas, validateToolInput, validateOperationOutput, validateResult } from './browser-contracts.js';
import { WEBMCP_OPERATIONS,toolsForProfile,type WebMCPToolProfile } from './webmcp-schemas.js';
import { toolDescriptions } from './webmcp-descriptions.js';
export { WEBMCP_OPERATIONS } from './webmcp-schemas.js';

export interface WebMCPSessionGrant {
  token: string; actorId: string; expiresAt: string; viewSessionId: string; projectId: string;
  projectIds?: string[]; scopes?: string[];
}
export interface StudioViewContext {
  viewSessionId: string; projectId: string; revision: number; viewRevision: number;
  draftDirty: boolean; draft: EffectDocument | null; selectedLayerId: string | null; time: number; playing: boolean;
  [key: string]: unknown;
}
export interface StudioViewSetInput {
  viewSessionId: string; projectId: string; expectedRevision: number; expectedViewRevision: number;
  selectedLayerId?: string | null; time?: number; playing?: boolean;loop?:boolean;
}
export interface StudioViewOpenInput { viewSessionId: string; projectId: string; expectedViewRevision: number; }
export interface StudioWebMCPStatus {
  available: boolean; api: 'document.modelContext' | 'navigator.modelContext' | null;
  toolCount: number; generation: number; connected: boolean; error?: string;
  toolProfile?:WebMCPToolProfile;
}
export interface WebMCPTool {
  name: string; description: string; inputSchema: object;
  annotations: { readOnlyHint?: boolean; untrustedContentHint?: boolean; consequentialHint?: boolean };
  execute(input: unknown, options?: { signal?: AbortSignal }): Promise<Result>;
}
export interface ModelContextRegistrationAPI {
  registerTool(tool: WebMCPTool, options?: { signal: AbortSignal }): unknown;
  unregisterTool?(name: string): unknown;
}
type ModelContextSurface = { modelContext?: ModelContextRegistrationAPI };
export interface StudioWebMCPOptions {
  selectTools?(profile:WebMCPToolProfile):Promise<StudioWebMCPStatus>;
  getGrant(): WebMCPSessionGrant | null;
  view: {
    inspect(): StudioViewContext;
    set(input: StudioViewSetInput): StudioViewContext | Promise<StudioViewContext>;
    open?(project: Project, input: StudioViewOpenInput): StudioViewContext | Promise<StudioViewContext>;
  };
  onStatus?(status: StudioWebMCPStatus): void;
  fetch?: typeof fetch;
  document?: ModelContextSurface;
  navigator?: ModelContextSurface;
}
export interface StudioWebMCPCleanup {
  (): void;
  ready: Promise<void>;
  refreshStatus(): StudioWebMCPStatus;
  selectTools(profile:WebMCPToolProfile):Promise<StudioWebMCPStatus>;
}

const registrationOwners = new WeakMap<object, StudioWebMCPCleanup>();
let generation = 0;

/** Feature detection only: no polyfill, injected bridge, or claim about host discovery. */
export function detectWebMCP(documentSurface?: ModelContextSurface, navigatorSurface?: ModelContextSurface) {
  if (typeof documentSurface?.modelContext?.registerTool === 'function')
    return { api: 'document.modelContext' as const, context: documentSurface.modelContext };
  // Early Chrome implementations used navigator.modelContext plus unregisterTool.
  if (typeof navigatorSurface?.modelContext?.registerTool === 'function' && typeof navigatorSurface.modelContext.unregisterTool === 'function')
    return { api: 'navigator.modelContext' as const, context: navigatorSurface.modelContext };
  return null;
}

function failure(code: string, message: string, details?: unknown, retryable = false): Result {
  return { contractVersion: CONTRACT_VERSION, requestId: crypto.randomUUID(), status: 'failed', diagnostics: [],
    error: { code, message, retryable, ...(details === undefined ? {} : { details }) } };
}
function callbackFailure(error: unknown): Result {
  if (error instanceof DomainError || (error instanceof Error && 'code' in error)) {
    const e = error as DomainError;
    return failure(e.code, e.message, e.details, ['CONFLICT', 'VIEW_CONFLICT'].includes(e.code));
  }
  return failure('WEBMCP_ERROR', error instanceof Error ? error.message : 'WebMCP operation failed.');
}
function aborted(details?: unknown): Result {
  return failure('TOOL_WAIT_CANCELLED', 'Tool waiting stopped. A dispatched operation or job may still complete; cancellation does not roll back a commit. Use the same idempotency key to recover, or jobs.cancel to cancel a job explicitly.', details, true);
}
function waitWithoutCancellingOperation(promise: Promise<Result>, signal?: AbortSignal, details?: unknown): Promise<Result> {
  if (!signal) return promise;
  if (signal.aborted) { void promise.catch(() => {}); return Promise.resolve(aborted(details)); }
  return new Promise(resolve => {
    const stop = () => { signal.removeEventListener('abort', stop); resolve(aborted(details)); };
    signal.addEventListener('abort', stop, { once: true });
    promise.then(value => { signal.removeEventListener('abort', stop); resolve(value); }, error => {
      signal.removeEventListener('abort', stop); resolve(callbackFailure(error));
    });
  });
}
function grantHeaders(grant: WebMCPSessionGrant) {
  return { 'Content-Type': 'application/json', 'X-NWN-VFX-Document-Schema':'24', 'X-NWN-VFX-Composition-Preview':'1', 'X-NWN-WebMCP-Session': grant.token, 'X-NWN-View-Session': grant.viewSessionId };
}

export function createStudioWebMCPTools(options: StudioWebMCPOptions, active: () => boolean = () => true): WebMCPTool[] {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  function requireGrant(viewSessionId?: string) {
    if (!active()) throw new DomainError('WEBMCP_DISPOSED', 'This page registration is no longer active. Rediscover tools.');
    const grant = options.getGrant();
    if (!grant || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= Date.now())
      throw new DomainError('WEBMCP_NOT_CONNECTED', 'The human must connect WebMCP in this Studio tab.');
    if (viewSessionId !== undefined && viewSessionId !== grant.viewSessionId)
      throw new DomainError('VIEW_SESSION_MISMATCH', 'The requested view session differs from this tab grant.');
    return grant;
  }
  async function request(path: string, grant: WebMCPSessionGrant, body?: unknown): Promise<Result> {
    const response = await fetcher(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: grantHeaders(grant), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!validateResult(result)) throw new DomainError('INVALID_SERVICE_RESULT', 'Service returned an invalid result envelope.');
    if (!response.ok && result.status !== 'failed') throw new DomainError('INVALID_SERVICE_RESULT', 'Service HTTP status disagrees with its result.');
    return result as Result;
  }
  function tool(name: string, description: string, inputSchema: object, mutates: boolean,
    run: (input: any, signal?: AbortSignal) => Promise<Result>): WebMCPTool {
    // WebMCP ToolAnnotations defaults are false. Omit only defaults; retain
    // untrusted=true for every result that can contain project/user content.
    // https://webmachinelearning.github.io/webmcp/#dictdef-toolannotations
    return { name, description, inputSchema, annotations: { ...(!mutates?{readOnlyHint:true}:{}), ...(['studio.version','studio.capabilities','studio.workspaces.list','studio.operations.list','studio.schema.get'].includes(name)?{}:{untrustedContentHint:true}) },
      execute: async (input, execution = {}) => {
        try {
          validateToolInput(name, input);
          if (execution.signal?.aborted) return aborted();
          // Omitted session means this tab's current grant; explicit stale sessions still fail.
          if(name!=='studio.connection.inspect'&&(input as Record<string,unknown>).viewSessionId===undefined)input={...(input as Record<string,unknown>),viewSessionId:requireGrant().viewSessionId};
          return await run(input, execution.signal);
        } catch (error) { return callbackFailure(error); }
      } };
  }
  const tools = WEBMCP_OPERATIONS.map(operation => {
    const definition = operationSchemas[operation];
    const inputSchema = inputSchemas[`studio.${operation}`];
    return tool(`studio.${operation}`, toolDescriptions[operation]??definition.description,
    inputSchema, definition.mutates, async (args, signal) => {
      const grant = requireGrant(args.viewSessionId);
      if(['workflow.settings.apply','benchmarks.pin','timing.apply','components.insert.apply'].includes(operation)){
        const view=options.view.inspect();
        if(view.projectId===args.input.projectId&&view.draftDirty)throw new DomainError('DRAFT_CONFLICT','The human has an unsaved editor or workflow draft. Preserve it before changing this saved project.');
      }
      const recovery = { operation, ...(definition.mutates ? { idempotencyKey: args.idempotencyKey } : {}) };
      const pending = request('/api/webmcp/commands', grant, { operation, input: args.input,
        contractVersion: CONTRACT_VERSION, ...(definition.mutates ? { idempotencyKey: args.idempotencyKey } : {}) })
        .then(result => { if (result.status !== 'failed') validateOperationOutput(operation, result.data); return result; })
        .catch(error => failure(definition.mutates ? 'OUTCOME_UNKNOWN' : 'TRANSPORT_ERROR',
          definition.mutates ? 'The operation may have completed. Recover using the same idempotency key.' : 'Could not retrieve the service result.',
          { ...recovery, reason: error instanceof Error ? error.message : 'Request failed.' }, true));
      return waitWithoutCancellingOperation(pending, signal, recovery);
    });
  });
  tools.unshift(tool('studio.connection.inspect', 'Tab grant; omitted viewSessionId uses it. Retry writes with the same key.', inputSchemas['studio.connection.inspect'], false,
    async (_args, signal) => waitWithoutCancellingOperation(request('/api/webmcp/session', requireGrant()), signal)));
  async function validatedView(viewSessionId: string, signal?: AbortSignal, mode: 'read' | 'edit' = 'read') {
    const grant = requireGrant(viewSessionId);
    const validation = await request('/api/webmcp/session', grant);
    if (validation.status === 'failed') return { result: validation };
    if (signal?.aborted) return { result: aborted() };
    const stillConnected = requireGrant(viewSessionId);
    if (stillConnected.token !== grant.token) throw new DomainError('WEBMCP_CONNECTION_CHANGED', 'The connection changed while validating this request. Retry.');
    const session = validation.data as { viewSessionId: string; projectIds: string[]; scopes: string[] };
    const context = options.view.inspect();
    if (session.viewSessionId !== viewSessionId || context.viewSessionId !== viewSessionId)
      throw new DomainError('VIEW_SESSION_MISMATCH', 'The view session changed. Read the connection again.');
    if (!Array.isArray(session.projectIds) || !session.projectIds.includes(context.projectId))
      throw new DomainError('FORBIDDEN', 'The current view project is outside this connection grant.');
    if (!Array.isArray(session.scopes) || !session.scopes.includes('read') || (mode === 'edit' && !session.scopes.includes('edit')))
      throw new DomainError('FORBIDDEN', 'The connection lacks the scope required to inspect or control this view.');
    // View state is local, but the same live server policy must authorize it.
    // In particular a revoked/reduced grant or AI pause cannot be bypassed by
    // avoiding a durable projects/changes operation.
    const access = await request('/api/webmcp/view-access', grant, { projectId: context.projectId, mode });
    if (access.status === 'failed') return { result: access };
    if (signal?.aborted) return { result: aborted() };
    if (requireGrant(viewSessionId).token !== grant.token)
      throw new DomainError('WEBMCP_CONNECTION_CHANGED', 'The connection changed while authorizing the view.');
    const latest = options.view.inspect();
    if (latest.viewSessionId !== viewSessionId || latest.projectId !== context.projectId)
      throw new DomainError('VIEW_CONFLICT', 'The current project changed while authorizing the view.');
    return { validation: access, context: latest };
  }
  tools.push(tool('studio.view.inspect', 'Revisions, selection, playback, drafts.',
    inputSchemas['studio.view.inspect'], false, async (args, signal) => {
      const value = await validatedView(args.viewSessionId, signal);
      if (value.result) return value.result;
      return { ...value.validation!, data: value.context };
    }));
  tools.push(tool('studio.tools.select','Switch tools: authoring=changes; workflow=iteration, reports, timing, components, OBJ. Rediscover after switching; drafts and grants stay.',inputSchemas['studio.tools.select'],true,async(args,signal)=>{
    const value=await validatedView(args.viewSessionId,signal,'edit');if(value.result)return value.result;
    if(!options.selectTools)throw new DomainError('CAPABILITY_UNAVAILABLE','Host tool switching is unavailable.');
    return{...value.validation!,data:await options.selectTools(args.profile)};
  }));
  tools.push(tool('studio.view.set', 'Set view using both revisions; preserve drafts.',
    inputSchemas['studio.view.set'], true, async (args: StudioViewSetInput, signal) => {
      const value = await validatedView(args.viewSessionId, signal, 'edit');
      if (value.result) return value.result;
      const context = value.context!;
      if (args.projectId !== context.projectId) throw new DomainError('VIEW_PROJECT_MISMATCH', 'The tool does not silently switch the current project.');
      if (args.expectedRevision !== context.revision) throw new DomainError('CONFLICT', 'The durable revision has changed.', { revision: context.revision });
      if (args.expectedViewRevision !== context.viewRevision) throw new DomainError('VIEW_CONFLICT', 'The view changed. Read it again before setting it.', { viewRevision: context.viewRevision });
      if (signal?.aborted) return aborted();
      return { ...value.validation!, data: await options.view.set(args) };
    }));
  tools.push(tool('studio.view.open', 'Open; reject conflicts.',
    inputSchemas['studio.view.open'], true,
    async (args: StudioViewOpenInput, signal) => {
      if (!options.view.open) throw new DomainError('UNSUPPORTED_OPERATION', 'This view does not implement project navigation.');
      const value = await validatedView(args.viewSessionId, signal, 'edit');
      if (value.result) return value.result;
      const checkView = () => {
        const context = options.view.inspect();
        if (context.viewSessionId !== args.viewSessionId || context.viewRevision !== args.expectedViewRevision)
          throw new DomainError('VIEW_CONFLICT', 'The view changed. Read it again before opening another project.');
        if (context.draftDirty) throw new DomainError('DRAFT_CONFLICT', 'The human has an unsaved draft. Opening another project would discard it.');
      };
      checkView();
      const grant = requireGrant(args.viewSessionId);
      const result = await request('/api/webmcp/commands', grant, { operation: 'projects.inspect', input: { projectId: args.projectId }, contractVersion: CONTRACT_VERSION });
      if (result.status === 'failed') return result;
      validateOperationOutput('projects.inspect', result.data);
      const targetAccess = await request('/api/webmcp/view-access', grant, { projectId: args.projectId, mode: 'edit' });
      if (targetAccess.status === 'failed') return targetAccess;
      if (signal?.aborted) return aborted();
      if (requireGrant(args.viewSessionId).token !== grant.token)
        throw new DomainError('WEBMCP_CONNECTION_CHANGED', 'The connection changed while opening the project.');
      checkView();
      return { ...result, data: await options.view.open(result.data as Project, args) };
    }));
  tools.push(tool('studio.artifacts.read', 'Read to nextOffset=null; verify size/SHA256.',
    inputSchemas['studio.artifacts.read'], false,
    async (args, signal) => {
      const grant = requireGrant(args.viewSessionId), offset = args.offset ?? 0, length = args.length ?? 65536;
      return waitWithoutCancellingOperation(request(`/api/webmcp/artifacts/${encodeURIComponent(args.artifactId)}?offset=${offset}&length=${length}`, grant)
        .then(async result => {
          if (result.status === 'failed') return result;
          const chunk = result.data as ArtifactChunk;
          await verifyArtifactChunk(chunk, args.artifactId, offset, length);
          return result;
        }), signal);
    }));
  return tools;
}

export interface ArtifactChunk {
  artifact: { id: string; size: number; sha256: string; [key: string]: unknown };
  offset: number; length: number; nextOffset: number | null; base64: string; chunkSha256: string;
}
export async function verifyArtifactChunk(chunk: ArtifactChunk, artifactId: string, offset: number, maximumLength: number) {
  validateOperationOutput('artifacts.get', chunk?.artifact);
  if (chunk.artifact.id !== artifactId || chunk.offset !== offset || !Number.isInteger(chunk.length) || chunk.length < 0 ||
    chunk.length > maximumLength || offset + chunk.length > chunk.artifact.size ||
    chunk.nextOffset !== (offset + chunk.length < chunk.artifact.size ? offset + chunk.length : null) ||
    (chunk.length === 0 && chunk.nextOffset !== null) || typeof chunk.base64 !== 'string' ||
    chunk.base64.length > Math.ceil(maximumLength / 3) * 4 || !/^[a-f0-9]{64}$/.test(chunk.chunkSha256))
    throw new DomainError('INVALID_ARTIFACT_CHUNK', 'The artifact chunk metadata is inconsistent.');
  const bytes = Uint8Array.from(atob(chunk.base64), character => character.charCodeAt(0));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (bytes.length !== chunk.length || hash !== chunk.chunkSha256)
    throw new DomainError('ARTIFACT_HASH_MISMATCH', 'The downloaded artifact chunk failed SHA-256 or size validation.');
}

/** Call once for a mounted editor and read state through ref-backed callbacks. */
export function setupStudioWebMCP(options: StudioWebMCPOptions): StudioWebMCPCleanup {
  const detected = detectWebMCP(options.document ?? (typeof document === 'undefined' ? undefined : document as unknown as ModelContextSurface),
    options.navigator ?? (typeof navigator === 'undefined' ? undefined : navigator as unknown as ModelContextSurface));
  let disposed = false, toolCount = 0, error: string | undefined,toolProfile:WebMCPToolProfile='authoring';
  const instanceGeneration = ++generation;
  let controller = new AbortController();
  const registered: string[] = [];
  const previous = detected ? registrationOwners.get(detected.context) : undefined;
  previous?.();
  function status(): StudioWebMCPStatus {
    const grant = options.getGrant();
    const value: StudioWebMCPStatus = { available: !!detected, api: detected?.api ?? null, toolCount,
      generation: instanceGeneration,toolProfile, connected: !!detected && !disposed && !!grant && Date.parse(grant.expiresAt) > Date.now(), ...(error ? { error } : {}) };
    if (!disposed) options.onStatus?.(value);
    return value;
  }
  const cleanup = (() => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    if (detected?.context.unregisterTool) for (const name of registered) {
      try { void Promise.resolve(detected.context.unregisterTool(name)).catch(() => {}); } catch { /* Already removed by the host. */ }
    }
    registered.length = 0; toolCount = 0;
    if (detected && registrationOwners.get(detected.context) === cleanup) registrationOwners.delete(detected.context);
  }) as StudioWebMCPCleanup;
  cleanup.refreshStatus = status;
  async function registerProfile(profile:WebMCPToolProfile){
    if (!detected || disposed) { status(); return; }
    try {
      controller.abort();
      for(const name of registered)if(detected.context.unregisterTool)await detected.context.unregisterTool(name);
      registered.length=0;toolCount=0;controller=new AbortController();toolProfile=profile;error=undefined;
      for (const tool of toolsForProfile(createStudioWebMCPTools({...options,selectTools:p=>cleanup.selectTools(p)}, () => !disposed),profile)) {
        if (disposed) break;
        const registration = detected.context.registerTool(tool, { signal: controller.signal });
        await registration;
        // Track only successful registrations: a duplicate rejection must not
        // unregister a tool belonging to another component.
        registered.push(tool.name);
        if (disposed) {
          if (detected.context.unregisterTool) await detected.context.unregisterTool(tool.name);
          break;
        }
        toolCount = registered.length;
      }
    } catch (registrationError) {
      if (!disposed) {
        error = registrationError instanceof Error ? registrationError.message : 'WebMCP registration failed.';
        controller.abort();
        if (detected.context.unregisterTool) for (const name of registered) {
          try { await detected.context.unregisterTool(name); } catch { /* Best effort after registration failure. */ }
        }
        toolCount = 0;
      }
    }
    status();
  }
  // Serialize profile changes and remounts. Abort signals unregister tools on
  // hosts without an explicit unregisterTool method.
  let registrationQueue=Promise.resolve(previous?.ready).then(()=>registerProfile('authoring'));
  cleanup.ready=registrationQueue;
  cleanup.selectTools=profile=>{
    if(!['authoring','workflow'].includes(profile))return Promise.reject(new DomainError('VALIDATION_ERROR','Unknown tool profile.'));
    registrationQueue=registrationQueue.then(()=>registerProfile(profile));cleanup.ready=registrationQueue;
    return registrationQueue.then(status);
  };
  if (detected) registrationOwners.set(detected.context, cleanup);
  status();
  return cleanup;
}
