import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, link, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { CONTRACT_VERSION, STUDIO_VERSION, DomainError, type Command, type Result } from '../../../packages/core/src/model.js';
import { validateCommand, validateOperationInput, validateResult } from '../../../packages/contracts/src/schema.js';

export const CLI_VERSION = STUDIO_VERSION;
export interface GlobalOptions {
  json?: boolean; workspace?: string; endpoint?: string; config?: string;
  requestTimeout?: number;
}
export interface Connection {
  endpoint: string; instanceId?: string; workspaceId?: string; token?: string;
  configPath: string; dataDir: string; credentialSource: 'environment' | 'configuration' | 'missing';
}
export class CliError extends Error {
  constructor(public code: string, message: string, public details?: unknown, public retryable = false) { super(message); }
}
export function result(data: unknown, status: Result['status'] = 'ok'): Result {
  return { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), status, data, diagnostics: [] };
}
export function failure(error: unknown): Result {
  const e = error instanceof CliError ? error : error instanceof DomainError ? new CliError(error.code, error.message, error.details)
    : new CliError('CLI_ERROR', error instanceof Error ? error.message : 'Nieznany błąd CLI.');
  return { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), status: 'failed',
    error: { code: e.code, message: e.message, details: e.details, retryable: e.retryable }, diagnostics: [] };
}
export function exitCode(value: Result): number {
  if (value.status !== 'failed') return 0;
  const code = value.error?.code ?? '';
  if (/TIMEOUT/.test(code)) return 6;
  if (/CANCELLED/.test(code)) return 8;
  if (/BLOCKED|INPUT_REQUIRED|PAUSED/.test(code)) return 7;
  if (/CONFLICT|LOCKED/.test(code)) return 4;
  if (/CONFIG|CONNECTION|UNAUTHORIZED|FORBIDDEN|WORKSPACE|INSTANCE|NOT_RUNNING|BUILD_REQUIRED|AUTH/.test(code)) return 3;
  if (/ARGUMENT|VALIDATION|SCHEMA|UNSUPPORTED|NOT_IMPLEMENTED|NOT_FOUND|INVALID|UNKNOWN|EXISTS/.test(code)) return 2;
  return 5;
}

export async function connection(options: GlobalOptions): Promise<Connection> {
  const dataDir = resolve(process.env.NWN_VFX_DATA_DIR || join(homedir(), '.nwn-vfx'));
  const configPath = resolve(options.config || process.env.NWN_VFX_CONFIG || join(dataDir, 'config.json'));
  let config: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object');
    config = parsed as Record<string, unknown>;
    for (const field of ['endpoint', 'instanceId', 'workspaceId', 'ownerToken']) {
      if (config[field] !== undefined && typeof config[field] !== 'string') throw new Error(`Invalid ${field}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new CliError('CONFIG_INVALID', 'Nieprawidłowy plik konfiguracji.', { configPath });
  }
  const endpoint = options.endpoint || process.env.NWN_VFX_ENDPOINT || config.endpoint as string || 'http://127.0.0.1:4317';
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new CliError('CONFIG_INVALID', 'Endpoint musi być adresem HTTP lub HTTPS.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new CliError('CONFIG_INVALID', 'Endpoint musi wskazywać origin HTTP/HTTPS bez danych logowania, ścieżki lub query.');
  }
  const token = process.env.NWN_VFX_TOKEN || config.ownerToken as string | undefined;
  return { endpoint: url.origin, instanceId: config.instanceId as string | undefined,
    workspaceId: options.workspace || process.env.NWN_VFX_WORKSPACE || config.workspaceId as string | undefined,
    token, dataDir, configPath, credentialSource: process.env.NWN_VFX_TOKEN ? 'environment' : token ? 'configuration' : 'missing' };
}

async function fetchResponse(url: string, init: RequestInit, timeout: number): Promise<Response> {
  try { return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeout) }); }
  catch (error) {
    const timeoutError = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    throw new CliError(timeoutError ? 'REQUEST_TIMEOUT' : 'CONNECTION_FAILED', timeoutError
      ? 'Upłynął czas żądania. Wynik mutacji sprawdź przez operations resolve, zachowując klucz idempotencji.'
      : 'Brak połączenia z usługą. Sprawdź konfigurację i uruchom jawnie nwn-vfx service start.', undefined, true);
  }
}
async function jsonResponse(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new CliError('INVALID_RESPONSE', `Usługa nie zwróciła prawidłowego JSON (HTTP ${response.status}).`); }
}
export async function health(conn: Connection, timeout = 15_000): Promise<Record<string, unknown>> {
  const response = await fetchResponse(`${conn.endpoint}/api/health`, {}, timeout);
  const value = await jsonResponse(response);
  if (!response.ok || !value || typeof value !== 'object') throw new CliError('CONNECTION_FAILED', `Sprawdzenie usługi nie powiodło się (HTTP ${response.status}).`, undefined, true);
  const raw = value as Record<string, unknown>;
  const data = raw.data && typeof raw.data === 'object' ? raw.data as Record<string, unknown> : raw;
  if (typeof data.instanceId !== 'string' || typeof data.workspaceId !== 'string') throw new CliError('INVALID_RESPONSE', 'Usługa nie podała tożsamości instanceId/workspaceId.');
  if (conn.instanceId && conn.instanceId !== data.instanceId) throw new CliError('INSTANCE_MISMATCH', 'Endpoint wskazuje inną instalację niż konfiguracja.', { expected: conn.instanceId, actual: data.instanceId });
  if (conn.workspaceId && conn.workspaceId !== data.workspaceId) throw new CliError('WORKSPACE_MISMATCH', 'Wybrany workspace nie odpowiada tej usłudze.', { expected: conn.workspaceId, actual: data.workspaceId });
  return data;
}
export async function execute(operation: string, input: Record<string, unknown>, options: GlobalOptions, idempotencyKey?: string): Promise<Result> {
  validateOperationInput(operation, input);
  if (!validateCommand({ operation, input, contractVersion: CONTRACT_VERSION, idempotencyKey })) throw new CliError('VALIDATION_ERROR', 'Nieprawidłowe parametry komendy.', validateCommand.errors);
  const conn = await connection(options);
  await health(conn, options.requestTimeout);
  if (!conn.token) throw new CliError('AUTH_REQUIRED', 'Brak poświadczenia. Ustaw NWN_VFX_TOKEN albo skonfiguruj lokalną sesję klienta.');
  const command: Command = { operation, input, contractVersion: CONTRACT_VERSION, workspaceId: conn.workspaceId, idempotencyKey };
  const response = await fetchResponse(`${conn.endpoint}/api/commands`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-nwn-vfx-document-schema':'24', 'x-nwn-vfx-composition-preview':'1', authorization: `Bearer ${conn.token}`,
  }, body: JSON.stringify(command) }, options.requestTimeout ?? 30_000);
  const value = await jsonResponse(response) as Result;
  if (value?.contractVersion && value.contractVersion !== CONTRACT_VERSION) throw new CliError('UNSUPPORTED_CONTRACT', 'Wersja odpowiedzi nie odpowiada wersji CLI.', { expected: CONTRACT_VERSION, actual: value.contractVersion });
  if (!validateResult(value)) {
    throw new CliError('INVALID_RESPONSE', `Niezgodna odpowiedź kontraktu (HTTP ${response.status}).`);
  }
  if (!response.ok && value.status !== 'failed') throw new CliError('INVALID_RESPONSE', `HTTP ${response.status} nie zawiera błędu domenowego.`);
  return value;
}

export async function downloadArtifact(artifact: Record<string, unknown>, destination: string, overwrite: boolean, options: GlobalOptions): Promise<Record<string, unknown>> {
  const id = artifact.artifactId ?? artifact.id;
  const hash = typeof artifact.sha256 === 'string' ? artifact.sha256 : (artifact.hash as { value?: string } | undefined)?.value;
  if (typeof id !== 'string' || typeof hash !== 'string' || !/^[a-f\d]{64}$/i.test(hash) || !Number.isSafeInteger(artifact.size) || Number(artifact.size) < 0) {
    throw new CliError('INVALID_RESPONSE', 'Manifest artefaktu nie zawiera prawidłowego ID, rozmiaru i SHA-256.');
  }
  const conn = await connection(options);
  await health(conn, options.requestTimeout);
  if (!conn.token) throw new CliError('AUTH_REQUIRED', 'Brak poświadczenia pobierania.');
  const target = resolve(destination);
  if (!overwrite) {
    try { await access(target); throw new CliError('OUTPUT_EXISTS', 'Plik docelowy istnieje. Wybierz inną ścieżkę albo jawne --overwrite.', { destination: target }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const response = await fetchResponse(`${conn.endpoint}/api/artifacts/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${conn.token}` },
  }, options.requestTimeout ?? 30_000);
  if (!response.ok || !response.body) throw new CliError(response.status === 403 || response.status === 401 ? 'FORBIDDEN' : 'DOWNLOAD_FAILED', `Pobranie artefaktu nie powiodło się (HTTP ${response.status}).`);
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.part`);
  const digest = createHash('sha256');
  let bytes = 0;
  try {
    await pipeline(Readable.fromWeb(response.body as any), new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > Number(artifact.size)) { callback(new CliError('ARTIFACT_INTEGRITY', 'Odebrano więcej bajtów niż deklaruje manifest.')); return; }
      digest.update(chunk); callback(null, chunk);
    } }), createWriteStream(temporary, { flags: 'wx' }));
    const actual = digest.digest('hex');
    if (bytes !== Number(artifact.size) || actual.toLowerCase() !== hash.toLowerCase()) throw new CliError('ARTIFACT_INTEGRITY', 'Hash lub rozmiar pobranego artefaktu nie odpowiada manifestowi.');
    if (overwrite) await rename(temporary, target);
    else { await link(temporary, target); await unlink(temporary); }
    return { ...artifact, localPath: target, verifiedSha256: actual, downloadedBytes: bytes };
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new CliError('OUTPUT_EXISTS', 'Plik docelowy został utworzony przez inny proces. Nie nadpisano go.');
    throw error;
  }
}

async function serviceEntry(): Promise<string> {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth++) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (manifest.name === 'nwn-vfx-studio') {
        const entry = join(directory, 'dist', 'node', 'service.js');
        await access(entry); return entry;
      }
    } catch { /* Continue towards the installed package root. */ }
    const parent = dirname(directory); if (parent === directory) break; directory = parent;
  }
  throw new CliError('BUILD_REQUIRED', 'Brak zbudowanej usługi dist/node/service.js w instalacji CLI. Zbuduj lub zainstaluj kompletne wydanie.');
}
export async function startService(options: GlobalOptions): Promise<Result> {
  const conn = await connection(options);
  try { return result({ ...(await health(conn, 1500)), state: 'already_running' }); }
  catch (error) {
    if (!(error instanceof CliError) || !['CONNECTION_FAILED', 'REQUEST_TIMEOUT'].includes(error.code)) throw error;
  }
  const url = new URL(conn.endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new CliError('CONFIG_INVALID', 'service start uruchamia wyłącznie lokalny endpoint HTTP.');
  const entry = await serviceEntry();
  await mkdir(conn.dataDir, { recursive: true });
  const logPath = join(conn.dataDir, 'service.log');
  const log = await open(logPath, 'a');
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env, NWN_VFX_DATA_DIR: conn.dataDir, NWN_VFX_PORT: url.port || '4317',
    NWN_VFX_WEB_DIR: process.env.NWN_VFX_WEB_DIR || resolve(dirname(entry), '..', 'web') };
  delete childEnvironment.NWN_VFX_TOKEN;
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(process.execPath, [entry], { cwd: dirname(entry), detached: true, windowsHide: true,
      stdio: ['ignore', log.fd, log.fd], env: childEnvironment });
    await new Promise<void>((done, reject) => { child.once('spawn', done); child.once('error', reject); });
    child.unref();
  } finally { await log.close(); }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { return result({ ...(await health(await connection(options), 1000)), state: 'started', logPath }); }
    catch (error) {
      if (error instanceof CliError && !['CONNECTION_FAILED', 'REQUEST_TIMEOUT', 'CONFIG_INVALID'].includes(error.code)) throw error;
    }
    await new Promise(done => setTimeout(done, 200));
  }
  throw new CliError('START_TIMEOUT', 'Usługa nie potwierdziła uruchomienia w 15 sekund. Sprawdź dziennik; nie uruchamiaj kolejnej instancji bez diagnozy.', { logPath }, true);
}

export async function stopService(options: GlobalOptions, idempotencyKey?: string): Promise<Result> {
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new CliError('INVALID_ARGUMENT', 'service stop wymaga --idempotency-key o długości 8–160 znaków.');
  const conn = await connection(options);
  await health(conn, options.requestTimeout);
  if (!conn.token) throw new CliError('AUTH_REQUIRED', 'Zatrzymanie usługi wymaga poświadczenia właściciela.');
  const response = await fetchResponse(`${conn.endpoint}/api/service/stop`, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${conn.token}` },
    body: JSON.stringify({ idempotencyKey }),
  }, options.requestTimeout ?? 30_000);
  const value = await jsonResponse(response) as Result;
  if (!validateResult(value) || (!response.ok && value.status !== 'failed')) throw new CliError('INVALID_RESPONSE', 'Nieprawidłowa odpowiedź zatrzymania usługi.');
  return value;
}
