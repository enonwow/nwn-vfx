import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { CONTRACT_VERSION, STUDIO_VERSION, DomainError, type Command } from '../../../packages/core/src/model.js';
import { openStore, hash, id, canonical, now, type Actor, type Artifact } from './store.js';
import { createDispatcher } from './commands.js';
import type { Render } from './jobs.js';
import { createWebMcpSessions, WEBMCP_OPERATIONS, type BrowserSession } from './webmcp-sessions.js';

export interface AppOptions { dataDir: string; port?: number; webDir?: string; render?: Render }
export type StudioApp = FastifyInstance & { studio: ReturnType<typeof openStore> & ReturnType<typeof createDispatcher> & { drainJobs: () => Promise<void> } };
const loopbacks = new Set(['127.0.0.1', 'localhost', '[::1]']);
export async function createApp(options: AppOptions): Promise<StudioApp> {
  const port = options.port ?? 4317;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DomainError('INVALID_PORT', 'Nieprawidłowy port.');
  const store = openStore(resolve(options.dataDir), port);
  const dispatcher = createDispatcher(store, options.render);
  const webmcp = createWebMcpSessions(store);
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024, trustProxy: false }) as unknown as StudioApp;
  app.decorate('studio', { ...store, ...dispatcher, drainJobs: dispatcher.worker.drain });
  function deny(code: string, message: string): never { throw new DomainError(code, message); }
  function requestOrigin(request: FastifyRequest) {
    const raw = request.headers.host;
    if (!raw || raw.includes(',') || raw.includes('@')) deny('INVALID_HOST', 'Nieprawidłowy Host.');
    let url: URL;
    try { url = new URL('http://' + raw); } catch { deny('INVALID_HOST', 'Nieprawidłowy Host.'); }
    if (!loopbacks.has(url!.hostname) || url!.username || url!.password || url!.pathname !== '/' || Number(url!.port || 80) !== port) deny('INVALID_HOST', 'Usługa obsługuje wyłącznie swój lokalny adres.');
    return url!.origin;
  }
  function authenticate(request: FastifyRequest): Actor {
    if (hasWebMcpHeaders(request)) return authenticateWebMcp(request).actor;
    const bearer = request.headers.authorization;
    if (bearer) {
      const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(bearer);
      if (!match) deny('UNAUTHORIZED', 'Nieprawidłowe poświadczenie.');
      const row = store.db.prepare('SELECT value FROM actors WHERE token_hash=?').get(hash(match![1])) as any;
      if (!row) deny('UNAUTHORIZED', 'Nieprawidłowe poświadczenie.');
      const actor = JSON.parse(row.value) as Actor;
      if (actor.revoked) deny('UNAUTHORIZED', 'Poświadczenie zostało cofnięte.'); return actor;
    }
    return browserSession(request).actor;
  }
  function browserSession(request: FastifyRequest): BrowserSession {
    // These credentials authorize a browser grant, so even a valid owner
    // bearer must never substitute for the cookie to which that grant binds.
    if (request.headers.authorization) deny('UNAUTHORIZED', 'Sesja WebMCP wymaga własnej sesji przeglądarki.');
    const cookies = request.headers.cookie ?? '';
    const token = cookies.split(';').map(c => c.trim()).find(c => c.startsWith('nwn_vfx_session='))?.slice('nwn_vfx_session='.length);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) deny('UNAUTHORIZED', 'Brak aktywnej sesji Studio.');
    const row = store.db.prepare('SELECT actor_id,expires FROM sessions WHERE token_hash=? AND expires>?').get(hash(token!), Date.now()) as any;
    if (!row) deny('UNAUTHORIZED', 'Sesja wygasła.');
    const actor = store.actor(row.actor_id);
    if (actor.revoked) deny('UNAUTHORIZED', 'Poświadczenie zostało cofnięte.');
    // Cookie authentication is browser-only. Bearer clients do not rely on
    // Origin, but cookies cannot authorize a forged cross-origin write.
    if (request.method !== 'GET' && request.headers.origin !== requestOrigin(request)) deny('INVALID_ORIGIN', 'Zapis wymaga originu otwartej aplikacji.');
    return { actor, tokenHash: hash(token!), expires: row.expires };
  }
  function hasWebMcpHeaders(request: FastifyRequest) {
    return request.headers['x-nwn-webmcp-session'] !== undefined || request.headers['x-nwn-view-session'] !== undefined;
  }
  function authenticateWebMcp(request: FastifyRequest) {
    return webmcp.resolve(browserSession(request), request.headers['x-nwn-webmcp-session'], request.headers['x-nwn-view-session']);
  }
  function grantOwner(request: FastifyRequest) {
    if (hasWebMcpHeaders(request)) deny('FORBIDDEN', 'Agent nie może przyznawać ani cofać własnych sesji.');
    return browserSession(request);
  }
  app.addHook('onRequest', async request => {
    const origin = requestOrigin(request);
    const provided = request.headers.origin;
    if (provided && provided !== origin) deny('INVALID_ORIGIN', 'Obcy origin nie ma dostępu do Studio.');
    const site = request.headers['sec-fetch-site'];
    if (site === 'cross-site' || site === 'same-site') deny('INVALID_ORIGIN', 'Żądanie pochodzi z innej witryny.');
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) deny('METHOD_NOT_ALLOWED', 'Nieobsługiwana metoda.');
    if (request.headers['x-forwarded-host'] || request.headers['x-forwarded-for']) deny('INVALID_HOST', 'Usługa lokalna nie pracuje za proxy.');
  });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff'); reply.header('Referrer-Policy', 'same-origin'); reply.header('Cache-Control', 'no-store');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    return payload;
  });
  app.setErrorHandler((error, _request, reply) => {
    const domain = error instanceof DomainError ? error : new DomainError('INVALID_REQUEST', 'Niepoprawne żądanie.');
    const status = domain.code === 'UNAUTHORIZED' ? 401 : ['FORBIDDEN', 'INVALID_HOST', 'INVALID_ORIGIN'].includes(domain.code) ? 403 : domain.code === 'METHOD_NOT_ALLOWED' ? 405 : 400;
    reply.code(status).send({ contractVersion: CONTRACT_VERSION, requestId: id(), status: 'failed', error: { code: domain.code, message: domain.message, retryable: false }, diagnostics: [] });
  });
  app.get('/api/health', async () => ({ status: 'ready', version: STUDIO_VERSION, contractVersion: CONTRACT_VERSION, instanceId: store.config.instanceId, workspaceId: store.config.workspaceId }));
  app.get('/api/session', async (request, reply) => {
    let actor: Actor;
    try { actor = authenticate(request); }
    catch (error) {
      if (request.headers.authorization || hasWebMcpHeaders(request) || !(error instanceof DomainError) || error.code !== 'UNAUTHORIZED') throw error;
      const origin = requestOrigin(request);
      let refererOrigin: string | undefined;
      try { refererOrigin = request.headers.referer ? new URL(request.headers.referer).origin : undefined; } catch { /* reject below */ }
      if (request.headers['sec-fetch-site'] !== 'same-origin' || (request.headers.origin !== origin && refererOrigin !== origin)) deny('UNAUTHORIZED', 'Otwórz aplikację pod lokalnym adresem lub użyj poświadczenia CLI.');
      const token = randomBytes(32).toString('base64url');
      store.db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
      store.db.prepare('INSERT INTO sessions(token_hash,actor_id,expires) VALUES(?,?,?)').run(hash(token), 'owner', Date.now() + 8 * 60 * 60 * 1000);
      reply.header('Set-Cookie', 'nwn_vfx_session=' + token + '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=28800');
      actor = store.actor('owner');
    }
    return { actor, instanceId: store.config.instanceId, workspaceId: store.config.workspaceId, contractVersion: CONTRACT_VERSION };
  });
  app.post('/api/commands', async request => {
    if (hasWebMcpHeaders(request)) deny('FORBIDDEN', 'Polecenia WebMCP wymagają dedykowanego adaptera.');
    const actor = authenticate(request);
    return dispatcher.dispatch(actor.id, request.body as Command, request.headers['x-nwn-vfx-document-schema']==='24'?24:request.headers['x-nwn-vfx-document-schema']==='23'?23:request.headers['x-nwn-vfx-document-schema']==='22'?22:request.headers['x-nwn-vfx-document-schema']==='21'?21:request.headers['x-nwn-vfx-document-schema']==='20'?20:request.headers['x-nwn-vfx-document-schema']==='19'?19:request.headers['x-nwn-vfx-document-schema']==='18'?18:request.headers['x-nwn-vfx-document-schema']==='17'?17:request.headers['x-nwn-vfx-document-schema']==='16'?16:request.headers['x-nwn-vfx-document-schema']==='15'?15:request.headers['x-nwn-vfx-document-schema']==='14'?14:request.headers['x-nwn-vfx-document-schema']==='13'?13:request.headers['x-nwn-vfx-document-schema']==='12'?12:request.headers['x-nwn-vfx-document-schema']==='11'?11:request.headers['x-nwn-vfx-document-schema']==='10'?10:9,request.headers['x-nwn-vfx-composition-preview']==='1');
  });
  app.post('/api/webmcp/sessions', async request => webmcp.create(grantOwner(request), request.body));
  app.get('/api/webmcp/session', async request => ({ contractVersion: CONTRACT_VERSION, requestId: id(), status: 'ok', data: authenticateWebMcp(request).metadata, diagnostics: [] }));
  app.post('/api/webmcp/revoke', async request => webmcp.revoke(grantOwner(request), request.body));
  app.post('/api/webmcp/view-access', async request => {
    const { actor } = authenticateWebMcp(request);
    const input = request.body as { projectId?: unknown; mode?: unknown } | undefined;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 ||
      Object.keys(input).some(key => !['projectId', 'mode'].includes(key)) || typeof input.projectId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(input.projectId) || typeof input.mode !== 'string' || !['read', 'edit'].includes(input.mode)) deny('VALIDATION_ERROR', 'Nieprawidłowy zakres operacji widoku.');
    dispatcher.authorize(actor.id, input!.projectId as string, 'read');
    dispatcher.authorize(actor.id, input!.projectId as string, input!.mode as string, input!.mode === 'edit');
    store.project(input!.projectId as string);
    return { contractVersion: CONTRACT_VERSION, requestId: id(), status: 'ok', data: { projectId: input!.projectId, mode: input!.mode }, diagnostics: [] };
  });
  app.post('/api/webmcp/commands', async request => {
    const { actor } = authenticateWebMcp(request), command = request.body as Command | undefined;
    if (!command || typeof command.operation !== 'string' || !WEBMCP_OPERATIONS.has(command.operation)) deny('FORBIDDEN', 'Operacja nie jest udostępniona przez WebMCP.');
    return dispatcher.dispatch(actor.id, command, request.headers['x-nwn-vfx-document-schema']==='24'?24:request.headers['x-nwn-vfx-document-schema']==='23'?23:request.headers['x-nwn-vfx-document-schema']==='22'?22:request.headers['x-nwn-vfx-document-schema']==='21'?21:request.headers['x-nwn-vfx-document-schema']==='20'?20:request.headers['x-nwn-vfx-document-schema']==='19'?19:request.headers['x-nwn-vfx-document-schema']==='18'?18:request.headers['x-nwn-vfx-document-schema']==='17'?17:request.headers['x-nwn-vfx-document-schema']==='16'?16:request.headers['x-nwn-vfx-document-schema']==='15'?15:request.headers['x-nwn-vfx-document-schema']==='14'?14:request.headers['x-nwn-vfx-document-schema']==='13'?13:request.headers['x-nwn-vfx-document-schema']==='12'?12:request.headers['x-nwn-vfx-document-schema']==='11'?11:request.headers['x-nwn-vfx-document-schema']==='10'?10:9,request.headers['x-nwn-vfx-composition-preview']==='1');
  });
  app.post('/api/service/stop', async (request, reply) => {
    const actor = authenticate(request);
    if (actor.kind !== 'owner') deny('FORBIDDEN', 'Usługę może zatrzymać wyłącznie właściciel.');
    const input = request.body as Record<string, unknown> | undefined;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'idempotencyKey') || typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 160) deny('VALIDATION_ERROR', 'Zatrzymanie wymaga stabilnego klucza idempotencji.');
    let newExecution = false;
    const result = store.db.transaction(() => {
      const scope = canonical([actor.id, store.config.workspaceId, 'service.stop', '@workspace', input!.idempotencyKey]);
      const old = store.db.prepare('SELECT result FROM idempotency WHERE scope=?').get(scope) as any;
      if (old) return { ...JSON.parse(old.result), requestId: id() };
      const operationId = id(), value = { contractVersion: CONTRACT_VERSION, requestId: id(), operationId, status: 'ok', data: { stopping: true, instanceId: store.config.instanceId }, diagnostics: [] };
      const record = { id: operationId, operationId, actorId: actor.id, name: 'service.stop', input: {}, projectId: null, createdAt: now(), result: value };
      store.db.prepare('INSERT INTO operations(id,actor_id,project_id,name,value) VALUES(?,?,?,?,?)').run(operationId, actor.id, null, 'service.stop', JSON.stringify(record));
      store.db.prepare('INSERT INTO idempotency(scope,fingerprint,result) VALUES(?,?,?)').run(scope, hash('{}'), JSON.stringify(value));
      newExecution = true; return value;
    }).immediate();
    if (newExecution) reply.raw.once('finish', () => { setImmediate(() => { void app.close(); }); });
    return result;
  });
  function artifactBytes(actor: Actor, artifactId: string) {
    const row = store.db.prepare('SELECT * FROM artifacts WHERE id=?').get(artifactId) as any;
    if (!row) return undefined;
    dispatcher.authorizeArtifact(actor.id,artifactId);
    const artifact = JSON.parse(row.value) as Artifact, bytes = readFileSync(row.file_path);
    if (hash(bytes) !== artifact.sha256 || bytes.length !== artifact.size) deny('ARTIFACT_HASH_MISMATCH', 'Zapisany artefakt ma inny hash lub rozmiar.');
    return { artifact, bytes };
  }
  app.get<{ Params: { id: string } }>('/api/artifacts/:id', async (request, reply) => {
    const item = artifactBytes(authenticate(request), request.params.id);
    if (!item) { reply.code(404); return { error: 'NOT_FOUND' }; }
    const { artifact, bytes } = item;
    reply.header('Content-Type', artifact.mime); reply.header('Content-Length', bytes.length);
    reply.header('Content-Disposition', 'attachment; filename="' + artifact.name + '"');
    reply.header('X-Content-SHA256', artifact.sha256); return bytes;
  });
  app.get<{ Params: { id: string }; Querystring: { offset?: string; length?: string } }>('/api/webmcp/artifacts/:id', async (request, reply) => {
    const { actor } = authenticateWebMcp(request), query = request.query;
    if (Object.keys(query).some(key => !['offset', 'length'].includes(key)) || [query.offset, query.length].some(value => value !== undefined && (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)))) deny('VALIDATION_ERROR', 'Niepoprawny zakres artefaktu.');
    const offset = Number(query.offset ?? 0), requested = Number(query.length ?? 65536);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(requested) || requested < 1 || requested > 262144) deny('VALIDATION_ERROR', 'Niepoprawny zakres artefaktu.');
    const item = artifactBytes(actor, request.params.id);
    if (!item) { reply.code(404); return { contractVersion: CONTRACT_VERSION, requestId: id(), status: 'failed', error: { code: 'NOT_FOUND', message: 'Nie znaleziono artefaktu.', retryable: false }, diagnostics: [] }; }
    if (offset > item.bytes.length) deny('VALIDATION_ERROR', 'Początek fragmentu wykracza poza artefakt.');
    const bytes = item.bytes.subarray(offset, Math.min(offset + requested, item.bytes.length)), next = offset + bytes.length;
    return { contractVersion: CONTRACT_VERSION, requestId: id(), status: 'ok', data: { artifact: item.artifact, offset, length: bytes.length, nextOffset: next < item.bytes.length ? next : null, base64: bytes.toString('base64'), chunkSha256: hash(bytes) }, diagnostics: [] };
  });
  if (options.webDir) {
    const root = resolve(options.webDir);
    app.get('/*', async (request, reply) => {
      if (request.url.startsWith('/api/')) { reply.code(404); return { error: 'NOT_FOUND' }; }
      let pathname: string;
      try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { return reply.code(400).send('Invalid path'); }
      const candidate = resolve(root, '.' + pathname);
      if (candidate !== root && !candidate.startsWith(root + sep)) return reply.code(403).send('Forbidden');
      const path = existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(root, 'index.html');
      if (!existsSync(path)) return reply.code(503).send('Frontend is not built. Run npm run build.');
      const ext = path.slice(path.lastIndexOf('.') + 1);
      reply.type(({ html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2' } as Record<string, string>)[ext] ?? 'application/octet-stream');
      return readFileSync(path);
    });
  }
  app.addHook('onClose', async () => { await dispatcher.worker.close(); store.close(); });
  await app.ready();
  return app;
}
