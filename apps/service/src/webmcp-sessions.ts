import {WORKFLOW_OPERATIONS as workflowOperations} from '../../../packages/contracts/src/workflow-schema.js';
import { randomBytes } from 'node:crypto';
import { DomainError } from '../../../packages/core/src/model.js';
import { hash, id, type Actor, type Store } from './store.js';

export const WEBMCP_SCOPES = ['read', 'edit', 'create', 'export', 'build', 'render', 'jobs', 'artifacts', 'cancel', 'review'] as const;
export const WEBMCP_OPERATIONS = new Set([
  ...workflowOperations,
  'version', 'doctor', 'capabilities', 'workspaces.list', 'operations.list', 'operations.get', 'operations.resolve', 'schema.get',
  'projects.list', 'projects.resolve', 'projects.inspect', 'projects.create', 'projects.fork', 'projects.export',
  'assets.import', 'assets.list', 'assets.get', 'assets.remove',
  'audio.import', 'audio.list', 'audio.get', 'audio.remove',
  'meshes.importObj.preview', 'meshes.importObj',
  'palette.preview', 'palette.apply',
  'native.test.status',
  'changes.preview', 'changes.apply', 'changes.revert', 'revisions.list', 'revisions.get', 'policy.inspect',
  'candidate.build', 'preview.request', 'preview.compose', 'jobs.get', 'jobs.list', 'jobs.cancel', 'artifacts.get', 'artifacts.list',
  'reviews.add', 'reviews.list', 'events.list',
]);
export interface BrowserSession { actor: Actor; tokenHash: string; expires: number }
interface SessionRow { token_hash: string; owner_session_hash: string; view_session_id: string; actor_id: string; project_id: string; expires: number; revoked: number }
const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const durationMs = 30 * 60 * 1000;
function deny(code: string, message: string): never { throw new DomainError(code, message); }
function input(value: unknown, fields: string[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) deny('VALIDATION_ERROR', 'Niepoprawne dane sesji WebMCP.');
  const parsed = value as Record<string, unknown>;
  if (fields.some(key => typeof parsed[key] !== 'string' || !identifier.test(parsed[key] as string))) deny('VALIDATION_ERROR', 'Niepoprawna tożsamość karty lub projektu.');
  return parsed as Record<string, string>;
}

export function createWebMcpSessions(store: Store) {
  function requireOwner(owner: BrowserSession) {
    if (owner.actor.kind !== 'owner' || owner.actor.revoked || owner.expires <= Date.now()) deny('FORBIDDEN', 'Sesję WebMCP może przyznać wyłącznie aktywny właściciel aplikacji.');
  }
  function revokeRows(rows: SessionRow[]) {
    for (const row of rows) {
      const value = store.db.prepare('SELECT value FROM actors WHERE id=?').get(row.actor_id) as { value: string } | undefined;
      if (value) { const actor = JSON.parse(value.value) as Actor; actor.revoked = true; store.db.prepare('UPDATE actors SET value=? WHERE id=?').run(JSON.stringify(actor), actor.id); }
      store.db.prepare('UPDATE webmcp_sessions SET revoked=1 WHERE token_hash=?').run(row.token_hash);
    }
  }
  function metadata(row: SessionRow, actor: Actor) {
    return { actorId: actor.id, expiresAt: new Date(row.expires).toISOString(), viewSessionId: row.view_session_id, projectId: row.project_id, scopes: [...actor.scopes], projectIds: [...actor.projectIds] };
  }
  function create(owner: BrowserSession, value: unknown) {
    requireOwner(owner); const { viewSessionId, projectId } = input(value, ['viewSessionId', 'projectId']);
    store.project(projectId);
    return store.db.transaction(() => {
      const existing = store.db.prepare('SELECT * FROM webmcp_sessions WHERE owner_session_hash=? AND view_session_id=? AND revoked=0').all(owner.tokenHash, viewSessionId) as SessionRow[];
      // Rotation changes the opaque credential, never authority. In particular,
      // a same-project renewal must not widen a grant narrowed by the owner.
      const previous = existing.find(row => row.project_id === projectId && row.expires > Date.now());
      const previousActor = previous ? JSON.parse((store.db.prepare('SELECT value FROM actors WHERE id=?').get(previous.actor_id) as { value: string }).value) as Actor : undefined;
      if (previousActor?.revoked) deny('UNAUTHORIZED', 'Uprawnienia tej karty zostały cofnięte.');
      if (previousActor && !previousActor.projectIds.includes(projectId)) deny('FORBIDDEN', 'Dostęp tej karty do projektu został cofnięty.');
      revokeRows(existing);
      const count = (store.db.prepare('SELECT count(*) AS n FROM webmcp_sessions WHERE revoked=0 AND expires>?').get(Date.now()) as { n: number }).n;
      const ownerCount = (store.db.prepare('SELECT count(*) AS n FROM webmcp_sessions WHERE revoked=0 AND expires>? AND owner_session_hash=?').get(Date.now(), owner.tokenHash) as { n: number }).n;
      if (count >= 128 || ownerCount >= 32) deny('LIMIT_EXCEEDED', 'Osiągnięto limit aktywnych kart WebMCP.');
      const token = randomBytes(32).toString('base64url');
      const actor: Actor = { id: id(), name: 'WebMCP · ' + viewSessionId, kind: 'agent', scopes: previousActor ? WEBMCP_SCOPES.filter(scope => previousActor.scopes.includes(scope)) : [...WEBMCP_SCOPES], projectIds: [projectId], revoked: false };
      // An opaque WebMCP credential is deliberately not a generic API bearer.
      // No client ever receives the independently generated actor credential.
      store.db.prepare('INSERT INTO actors(id,token_hash,value) VALUES(?,?,?)').run(actor.id, hash(randomBytes(32)), JSON.stringify(actor));
      const row: SessionRow = { token_hash: hash(token), owner_session_hash: owner.tokenHash, view_session_id: viewSessionId, actor_id: actor.id, project_id: projectId, expires: Math.min(Date.now() + durationMs, owner.expires), revoked: 0 };
      store.db.prepare('INSERT INTO webmcp_sessions(token_hash,owner_session_hash,view_session_id,actor_id,project_id,expires,revoked) VALUES(?,?,?,?,?,?,?)').run(row.token_hash, row.owner_session_hash, row.view_session_id, row.actor_id, row.project_id, row.expires, row.revoked);
      return { ...metadata(row, actor), token };
    }).immediate();
  }
  function resolve(owner: BrowserSession, token: unknown, viewSessionId: unknown) {
    requireOwner(owner);
    if (typeof token !== 'string' || !tokenPattern.test(token) || typeof viewSessionId !== 'string' || !identifier.test(viewSessionId)) deny('UNAUTHORIZED', 'Brak poprawnego poświadczenia karty WebMCP.');
    const row = store.db.prepare('SELECT * FROM webmcp_sessions WHERE token_hash=? AND owner_session_hash=? AND view_session_id=?').get(hash(token), owner.tokenHash, viewSessionId) as SessionRow | undefined;
    if (!row || row.revoked || row.expires <= Date.now()) deny('UNAUTHORIZED', 'Sesja WebMCP wygasła, została cofnięta lub należy do innej karty.');
    const actor = store.actor(row.actor_id);
    if (actor.revoked || actor.kind !== 'agent') deny('UNAUTHORIZED', 'Poświadczenie WebMCP zostało cofnięte.');
    return { actor, metadata: metadata(row, actor) };
  }
  function revoke(owner: BrowserSession, value: unknown) {
    requireOwner(owner); const { viewSessionId } = input(value, ['viewSessionId']);
    store.db.transaction(() => { revokeRows(store.db.prepare('SELECT * FROM webmcp_sessions WHERE owner_session_hash=? AND view_session_id=? AND revoked=0').all(owner.tokenHash, viewSessionId) as SessionRow[]); }).immediate();
    return { revoked: true, viewSessionId };
  }
  return { create, resolve, revoke };
}
