import Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { DomainError, type Project } from '../../../packages/core/src/model.js';
import type { RenderErrorDetails } from './render-errors.js';

export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => (value as any)[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical((value as any)[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export interface Actor { id: string; name: string; kind: 'owner' | 'agent'; scopes: string[]; projectIds: string[]; revoked: boolean }
export interface Config { endpoint: string; instanceId: string; workspaceId: string; ownerToken: string }
export interface Artifact { id: string; artifactId: string; projectId: string; jobId?: string; name: string; fileName: string; mime: string; size: number; sha256: string; hash: { algorithm: 'sha256'; value: string }; downloadUrl: string }
export interface Job { id: string; jobId: string; projectId: string; revision: number; actorId: string; sourceProjectIds?: string[]; type: 'candidate.build' | 'preview.request' | 'preview.compose' | 'iteration.prepare'; status: 'queued' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'; createdAt: string; updatedAt: string; artifacts: Artifact[]; metadata?: unknown; error?: { code: string; message: string; details?: RenderErrorDetails } }

export function openStore(dataDir: string, port: number) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = join(dataDir, 'service.lock');
  const lockNonce = id();
  if (existsSync(lockPath)) {
    const old = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid: number };
    let alive = true;
    try { process.kill(old.pid, 0); } catch (error: any) { if (error.code === 'ESRCH') alive = false; }
    if (alive) throw new DomainError('SERVICE_ALREADY_RUNNING', 'Ten magazyn ma już właściciela zapisu.');
    unlinkSync(lockPath);
  }
  const lock = openSync(lockPath, 'wx', 0o600);
  writeFileSync(lock, JSON.stringify({ pid: process.pid, nonce: lockNonce })); closeSync(lock);
  const db = new Database(join(dataDir, 'studio.sqlite'));
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000');
  db.exec([
    'CREATE TABLE IF NOT EXISTS components (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS external_reports (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS iteration_steps (job_id TEXT NOT NULL, step_key TEXT NOT NULL, fingerprint TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(job_id,step_key));',
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS revisions (project_id TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT NOT NULL, operation_id TEXT, PRIMARY KEY(project_id,revision));',
    'CREATE TABLE IF NOT EXISTS actors (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, actor_id TEXT NOT NULL, expires INTEGER NOT NULL);',
    'CREATE TABLE IF NOT EXISTS webmcp_sessions (token_hash TEXT PRIMARY KEY, owner_session_hash TEXT NOT NULL, view_session_id TEXT NOT NULL, actor_id TEXT UNIQUE NOT NULL, project_id TEXT NOT NULL, expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);',
    'CREATE INDEX IF NOT EXISTS webmcp_sessions_view ON webmcp_sessions(owner_session_hash,view_session_id);',
    'CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, project_id TEXT, name TEXT NOT NULL, value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS idempotency (scope TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS events (cursor INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, value TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, project_id TEXT NOT NULL, status TEXT NOT NULL, value TEXT NOT NULL, snapshot TEXT NOT NULL, options TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, value TEXT NOT NULL, file_path TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS policies (project_id TEXT PRIMARY KEY, pause_ai INTEGER NOT NULL DEFAULT 0);',
    'CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, value TEXT NOT NULL);',
  ].join('\n'));
  const configPath = join(dataDir, 'config.json');
  let config: Config;
  if (existsSync(configPath)) config = JSON.parse(readFileSync(configPath, 'utf8'));
  else config = { endpoint: '', instanceId: id(), workspaceId: id(), ownerToken: randomBytes(32).toString('base64url') };
  config.endpoint = 'http://127.0.0.1:' + port;
  const dbIdentity = db.prepare('SELECT value FROM meta WHERE key=?').get('instanceId') as any;
  if (dbIdentity && dbIdentity.value !== config.instanceId) { db.close(); unlinkSync(lockPath); throw new DomainError('INSTANCE_MISMATCH', 'Konfiguracja nie należy do tej bazy.'); }
  db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').run('instanceId', config.instanceId);
  const owner: Actor = { id: 'owner', name: 'Właściciel', kind: 'owner', scopes: ['*'], projectIds: ['*'], revoked: false };
  db.prepare('INSERT OR IGNORE INTO actors(id,token_hash,value) VALUES(?,?,?)').run(owner.id, hash(config.ownerToken), JSON.stringify(owner));
  writeFileSync(configPath + '.tmp', JSON.stringify(config, null, 2), { mode: 0o600 }); renameSync(configPath + '.tmp', configPath);
  mkdirSync(join(dataDir, 'artifacts'), { recursive: true, mode: 0o700 });
  function project(projectId: string, revision?: number): Project {
    const row = revision === undefined ? db.prepare('SELECT value FROM projects WHERE id=?').get(projectId) as any : db.prepare('SELECT value FROM revisions WHERE project_id=? AND revision=?').get(projectId, revision) as any;
    if (!row) throw new DomainError('NOT_FOUND', 'Nie znaleziono projektu lub rewizji.');
    return JSON.parse(row.value);
  }
  function actor(actorId: string): Actor {
    const row = db.prepare('SELECT value FROM actors WHERE id=?').get(actorId) as any;
    if (!row) throw new DomainError('UNAUTHORIZED', 'Nieznany wykonawca.');
    // Durable workers use the same actor lookup as HTTP commands. A browser
    // grant cannot outlive either its own expiry or the authorizing cookie.
    const grant = db.prepare('SELECT w.expires,w.revoked,s.expires AS owner_expires FROM webmcp_sessions w LEFT JOIN sessions s ON s.token_hash=w.owner_session_hash WHERE w.actor_id=?').get(actorId) as any;
    if (grant && (grant.revoked || grant.expires <= Date.now() || !grant.owner_expires || grant.owner_expires <= Date.now())) throw new DomainError('UNAUTHORIZED', 'Sesja WebMCP wygasła lub została cofnięta.');
    return JSON.parse(row.value);
  }
  function event(projectId: string | null, value: unknown) {
    db.prepare('INSERT INTO events(project_id,value) VALUES(?,?)').run(projectId, JSON.stringify({ ...value as object, at: now() }));
  }
  function saveProject(value: Project, operationId: string) {
    db.prepare('INSERT INTO projects(id,revision,value) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,value=excluded.value').run(value.id, value.revision, JSON.stringify(value));
    db.prepare('INSERT INTO revisions(project_id,revision,value,operation_id) VALUES(?,?,?,?)').run(value.id, value.revision, JSON.stringify(value), operationId);
    event(value.id, { type: 'project.changed', projectId: value.id, revision: value.revision, operationId });
  }
  function saveJob(value: Job, snapshot?: string, options?: string) {
    if (snapshot !== undefined) db.prepare('INSERT INTO jobs(id,actor_id,project_id,status,value,snapshot,options) VALUES(?,?,?,?,?,?,?)').run(value.id, value.actorId, value.projectId, value.status, JSON.stringify(value), snapshot, options ?? '{}');
    else db.prepare('UPDATE jobs SET status=?,value=? WHERE id=?').run(value.status, JSON.stringify(value), value.id);
    event(value.projectId, { type: 'job.changed', jobId: value.id, status: value.status });
  }
  function artifact(projectId: string, name: string, bytes: Uint8Array, jobId?: string): Artifact {
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,100}$/.test(name)) throw new DomainError('INVALID_ARTIFACT', 'Nieprawidłowa nazwa artefaktu.');
    const artifactId = id(), digest = hash(bytes), path = join(dataDir, 'artifacts', artifactId);
    writeFileSync(path + '.partial', bytes, { flag: 'wx', mode: 0o600 });
    if (hash(readFileSync(path + '.partial')) !== digest) throw new DomainError('ARTIFACT_HASH_MISMATCH', 'Błędny hash zapisu artefaktu.');
    renameSync(path + '.partial', path);
    const ext = name.slice(name.lastIndexOf('.') + 1);
    const mime = ({ wav:'audio/wav',mp3:'audio/mpeg',nss:'text/plain', json: 'application/json', zip: 'application/zip', png: 'image/png', webm: 'video/webm', mp4: 'video/mp4', mdl: 'text/plain', txi: 'text/plain' } as Record<string, string>)[ext] ?? 'application/octet-stream';
    const value: Artifact = { id: artifactId, artifactId, projectId, ...(jobId ? { jobId } : {}), name, fileName: name, mime, size: bytes.length, sha256: digest, hash: { algorithm: 'sha256', value: digest }, downloadUrl: '/api/artifacts/' + artifactId };
    db.prepare('INSERT INTO artifacts(id,project_id,value,file_path) VALUES(?,?,?,?)').run(artifactId, projectId, JSON.stringify(value), path);
    return value;
  }
  function close() {
    db.close();
    if (existsSync(lockPath) && JSON.parse(readFileSync(lockPath, 'utf8')).nonce === lockNonce) unlinkSync(lockPath);
  }
  return { db, config, project, actor, event, saveProject, saveJob, artifact, close };
}
export type Store = ReturnType<typeof openStore>;
