import {WORKFLOW_SCHEMAS} from '../../../packages/contracts/src/workflow-schema.js';
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { readFile, stat } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { operationSchemas, validateOperationInput } from '../../../packages/contracts/src/schema.js';
import { CONTRACT_VERSION, type Layer, type Project, type Result } from '../../../packages/core/src/model.js';
import { OBJ_IMPORT_LIMITS } from '../../../packages/core/src/obj.js';
import { CLI_VERSION, CliError, connection, downloadArtifact, execute, exitCode, failure, health, result, startService, stopService, type GlobalOptions } from './client.js';

type Options = Record<string, any> & GlobalOptions;
let outputWritten = false;
const jsonMode = process.argv.includes('--json');
function writeOutput(value: Result, forcedCode?: number): void {
  if (outputWritten) return;
  outputWritten = true;
  process.exitCode = forcedCode ?? exitCode(value);
  if (jsonMode) process.stdout.write(`${JSON.stringify(value)}\n`);
  else if (value.status === 'failed') process.stderr.write(`${value.error?.code}: ${value.error?.message}\n${value.error?.details ? JSON.stringify(value.error.details, null, 2) + '\n' : ''}`);
  else process.stdout.write(`${JSON.stringify(value.data, null, 2)}\n`);
}
const whole = (value: string): number => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new InvalidArgumentError('Wymagana nieujemna liczba całkowita.');
  return Number(value);
};
const numeric = (value: string): number => {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new InvalidArgumentError('Wymagana skończona liczba.');
  return Number(value);
};
function textureTargetSize(value: string): 512 | 1024 {
  if (value !== '512' && value !== '1024') throw new InvalidArgumentError('Rozmiar tekstury musi wynosić 512 albo 1024.');
  return Number(value) as 512 | 1024;
}
function duration(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(value);
  if (!match) throw new InvalidArgumentError('Podaj czas, np. 30s, 500ms lub 2m.');
  const ms = Number(match[1]) * ({ ms: 1, s: 1000, m: 60_000 }[match[2] || 's'] ?? 1000);
  if (!Number.isSafeInteger(ms) || ms > 3_600_000) throw new InvalidArgumentError('Czas musi mieścić się między 0 a 1h.');
  return ms;
}
function boolean(value: string): boolean {
  if (!['true', 'false'].includes(value)) throw new InvalidArgumentError('Podaj true albo false.');
  return value === 'true';
}
const csv = (value: string): string[] => value.split(',').map(s => s.trim()).filter(Boolean);
function clean(value: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
function requireKey(options: Options, operation: string): string | undefined {
  if (operationSchemas[operation]?.mutates && !options.idempotencyKey) throw new CliError('INVALID_ARGUMENT', 'Mutacja wymaga --idempotency-key. Zachowaj ten sam klucz przy ponowieniu.');
  return options.idempotencyKey;
}
async function invoke(operation: string, input: Record<string, unknown>, options: Options): Promise<Result> {
  const key = requireKey(options, operation);
  return execute(operation, clean(input), options, key);
}
async function jsonInput(options: Options): Promise<unknown> {
  if (options.inputFile && options.input !== undefined) throw new CliError('INVALID_ARGUMENT', 'Wybierz jedno źródło: --input-file albo --input -.');
  let source: string;
  if (options.inputFile) source = await readFile(resolve(options.inputFile), 'utf8');
  else if (options.input === '-') {
    if (process.stdin.isTTY) throw new CliError('INVALID_ARGUMENT', 'Dla --input - przekaż JSON przez pipe; CLI nie pyta interaktywnie.');
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of process.stdin) {
      const buffer = Buffer.from(chunk); size += buffer.length;
      if (size > 32 * 1024 * 1024) throw new CliError('INVALID_ARGUMENT', 'Wejście JSON przekracza 32 MiB.');
      chunks.push(buffer);
    }
    source = Buffer.concat(chunks).toString('utf8');
  } else throw new CliError('INVALID_ARGUMENT', 'Wymagane --input-file <plik.json> albo --input -.');
  try { return JSON.parse(source.replace(/^\uFEFF/, '')); }
  catch { throw new CliError('INVALID_JSON', 'Nie można odczytać JSON wejścia.'); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CliError('INVALID_ARGUMENT', 'Wejście musi być obiektem JSON.');
  return value as Record<string, unknown>;
}
function inputOptions(command: Command): Command {
  return command.option('--input-file <path>', 'Plik JSON wejścia').option('--input <source>', 'JSON ze stdin: -');
}
function mutation(command: Command): Command { return command.option('--idempotency-key <key>', 'Trwały klucz ponowień (8–160 znaków)'); }
function project(command: Command): Command { return command.requiredOption('--project <id>', 'Stabilne ID projektu Studio'); }
function revision(command: Command, required = false): Command {
  return required ? command.requiredOption('--revision <number>', 'Dokładna rewizja', whole) : command.option('--revision <number>', 'Rewizja; domyślnie ostatnia', whole);
}
function expected(command: Command): Command { return command.requiredOption('--expected-revision <number>', 'Rewizja bazowa zmiany', whole); }
function paging(command: Command): Command { return command.option('--limit <number>', 'Liczba wyników (1–100)', whole).option('--cursor <cursor>', 'Kursor kolejnej strony'); }
function attach(command: Command, action: (options: Options, args: unknown[]) => Promise<Result>): Command {
  return command.action(async (...args: unknown[]) => {
    const leaf = args.at(-1) as Command;
    // --no-input belongs to the global command, whereas --input - is a local data source.
    writeOutput(await action({ ...leaf.optsWithGlobals(), input: leaf.opts().input } as Options, args.slice(0, -2)));
  });
}

const program = new Command().name('nwn-vfx').description('NWN VFX Studio — wspólne API człowieka i agentów')
  .option('--json', 'Jeden obiekt JSON na stdout; bez interaktywnych pytań')
  .option('--no-input', 'Bez interaktywnych pytań (domyślnie CLI nie pyta)')
  .option('--workspace <id>', 'Jawne ID skonfigurowanego workspace; niezależne od cwd')
  .option('--endpoint <url>', 'Origin lokalnej usługi')
  .option('--config <path>', 'Plik konfiguracji klienta')
  .option('--request-timeout <duration>', 'Limit pojedynczego żądania', duration, 30_000)
  .showSuggestionAfterError(false).exitOverride().configureOutput({
    writeErr: () => undefined,
  });
program.addHelpText('after', '\nStart: nwn-vfx service start\nAutomatyzacja: nwn-vfx --json doctor; nwn-vfx --json operations list\nMutacje wymagają --idempotency-key; CLI nie wybiera projektu na podstawie cwd.');

attach(program.command('version').description('Wersja CLI i kontraktu, bez połączenia z usługą'), async () => result({ cliVersion: CLI_VERSION, contractVersion: CONTRACT_VERSION, nodeVersion: process.version }));
attach(program.command('doctor').description('Diagnoza połączenia, tożsamości i możliwości'), async options => {
  const conn = await connection(options);
  const reply = await invoke('doctor', {}, options);
  if (reply.status !== 'failed') reply.data = { ...object(reply.data), client: { version: CLI_VERSION, configPath: conn.configPath, credentialSource: conn.credentialSource, endpoint: conn.endpoint } };
  return reply;
});
attach(program.command('capabilities').option('--profile <id>', 'Profil NWN'), options => invoke('capabilities', { profileId: options.profile }, options));

const service = program.command('service').description('Jawne zarządzanie lokalną usługą');
attach(service.command('start'), options => startService(options));
attach(service.command('status'), async options => result({ ...(await health(await connection(options), options.requestTimeout)), state: 'running' }));
attach(mutation(service.command('stop')), options => stopService(options, options.idempotencyKey));
const workspaces = program.command('workspaces');
attach(workspaces.command('list'), async options => {
  const conn = await connection(options);
  return result({ items: conn.workspaceId ? [{ id: conn.workspaceId, workspaceId: conn.workspaceId, instanceId: conn.instanceId, endpoint: conn.endpoint, configPath: conn.configPath }] : [],
    diagnostics: conn.workspaceId ? [] : ['Brak zapisanego workspace. Uruchom usługę lub skonfiguruj połączenie.'] });
});

const operations = program.command('operations').alias('operation').description('Katalog i odzyskiwanie wyników');
attach(operations.command('list'), options => invoke('operations.list', {}, options));
attach(operations.command('get <operation-id>'), (options, [operationId]) => invoke('operations.get', { operationId }, options));
attach(operations.command('resolve').requiredOption('--operation <name>', 'Nazwa operacji domenowej').requiredOption('--idempotency-key <key>', 'Klucz zapisany przed wywołaniem').option('--project <id>'), options =>
  execute('operations.resolve', clean({ operation: options.operation, idempotencyKey: options.idempotencyKey, projectId: options.project }), options));
attach(mutation(inputOptions(operations.command('call <name>').description('Wywołaj zarejestrowaną operację z walidacją jej schematu'))), async (options, [name]) => {
  const operation = String(name);
  const input = object(await jsonInput(options));
  validateOperationInput(operation, input);
  return invoke(operation, input, options);
});
const schema = program.command('schema');
attach(schema.command('get <operation>'), (options, [operation]) => invoke('schema.get', { operation }, options));

const projects = program.command('projects').alias('project');
attach(paging(projects.command('list')), options => invoke('projects.list', { limit: options.limit, cursor: options.cursor }, options));
attach(projects.command('resolve').requiredOption('--name <name>'), options => invoke('projects.resolve', { name: options.name }, options));
attach(revision(project(projects.command('inspect'))), options => invoke('projects.inspect', { projectId: options.project, revision: options.revision }, options));
attach(mutation(projects.command('create').option('--project <id>', 'Jawne ID nowego projektu').option('--name <name>').option('--preset <name>', 'coil, vial lub empty').option('--lifecycle <mode>', 'impact (FnF), duration (DUR) lub beam; duration/beam wymagają preset empty')), options =>
  invoke('projects.create', { projectId: options.project, name: options.name, preset: options.preset, lifecycle: options.lifecycle }, options));
attach(mutation(revision(project(projects.command('fork').option('--name <name>')))), options => invoke('projects.fork', { projectId: options.project, name: options.name, revision: options.revision }, options));
attach(mutation(projects.command('import').requiredOption('--file <path>', 'Dokument JSON albo paczka ZIP Studio').option('--project <id>', 'Jawne nowe ID')), async options => {
  requireKey(options, 'projects.import');
  const bytes = await readFile(resolve(options.file));
  if (bytes.length > 9_000_000) throw new CliError('VALIDATION_ERROR', 'Plik importu przekracza limit 9 MB tej wersji API.');
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return invoke('projects.import', { bundleBase64: bytes.toString('base64'), projectId: options.project }, options);
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error instanceof SyntaxError) throw new CliError('UNSUPPORTED_FORMAT', 'Ta wersja importuje JSON lub paczkę ZIP Studio. Import MDL nie jest jeszcze dostępny.'); throw error; }
  const imported = object(parsed);
  return invoke('projects.import', { document: imported.document ?? imported, projectId: options.project }, options);
});
attach(mutation(revision(project(projects.command('export').option('--out <path>', 'Pobierz wynik do jawnego pliku').option('--overwrite', 'Zastąp istniejący plik')), true)), async options => {
  const reply = await invoke('projects.export', { projectId: options.project, revision: options.revision }, options);
  if (reply.status !== 'failed' && options.out) {
    const data = object(reply.data);
    data.artifact = await downloadArtifact(object(data.artifact), options.out, !!options.overwrite, options);
  }
  return reply;
});

const assets = program.command('assets').description('Niezmienne obrazy PNG RGBA w rewizjach projektu');
const audio = program.command('audio').description('Audio WAV PCM16/MP3 i klipy przez changes audio.add/set/remove');
attach(revision(project(audio.command('list'))),options=>invoke('audio.list',{projectId:options.project,revision:options.revision},options));
attach(revision(project(audio.command('get <asset-id>'))),(options,[assetId])=>invoke('audio.get',{projectId:options.project,revision:options.revision,assetId},options));
attach(mutation(expected(project(audio.command('remove').requiredOption('--asset-ids <ids>','ID nieużywanych dźwięków',csv)))),options=>invoke('audio.remove',{projectId:options.project,expectedRevision:options.expectedRevision,assetIds:options.assetIds},options));
attach(mutation(expected(project(audio.command('import').requiredOption('--file <path>','WAV PCM16 mono/stereo 8–48 kHz albo MP3, do 2 MiB / 30 s')))),async options=>{
  requireKey(options,'audio.import');const filePath=resolve(options.file),info=await stat(filePath);
  if(!info.isFile()||info.size>2097152)throw new CliError('INVALID_ARGUMENT','Audio musi być plikiem do 2 MiB.');
  const bytes=await readFile(filePath);if(bytes.length>2097152)throw new CliError('INVALID_ARGUMENT','Audio przekracza 2 MiB.');
  return invoke('audio.import',{projectId:options.project,expectedRevision:options.expectedRevision,fileName:basename(filePath),dataBase64:bytes.toString('base64')},options);
});
const palette=program.command('palette').description('Podgląd i atomowe zatwierdzenie palety całego efektu');
attach(inputOptions(expected(project(palette.command('preview')))),async options=>invoke('palette.preview',{
  projectId:options.project,expectedRevision:options.expectedRevision,options:object(await jsonInput(options))},options));
attach(mutation(inputOptions(expected(project(palette.command('apply').requiredOption('--proposal-hash <sha256>','Hash zaakceptowanego podglądu'))))),async options=>invoke('palette.apply',{
  projectId:options.project,expectedRevision:options.expectedRevision,options:object(await jsonInput(options)),proposalHash:options.proposalHash},options));
attach(mutation(expected(project(assets.command('remove').requiredOption('--asset-ids <ids>', 'Jawne ID nieużywanych zasobów, rozdzielone przecinkiem', csv)))), options =>
  invoke('assets.remove', { projectId: options.project, expectedRevision: options.expectedRevision, assetIds: options.assetIds }, options));
attach(revision(project(assets.command('list'))), options => invoke('assets.list', { projectId: options.project, revision: options.revision }, options));
attach(revision(project(assets.command('get <asset-id>'))), (options, [assetId]) => invoke('assets.get', { projectId: options.project, revision: options.revision, assetId }, options));
attach(mutation(expected(project(assets.command('import').requiredOption('--file <path>', 'PNG RGBA8, POT 8–1024, do 2 MiB; z --target-size: RGB/RGBA8 do 8 MiB; bez przeplotu')
  .option('--target-size <px>', '512 albo 1024: zachowaj proporcje i dodaj przezroczysty margines (źródło 1–4096 px, RGB otrzyma alpha 255; wynik RGBA do 2 MiB)', textureTargetSize)))), async options => {
  requireKey(options, 'assets.import');
  const filePath = resolve(options.file);
  const inputLimitMiB = options.targetSize ? 8 : 2;
  if ((await stat(filePath)).size > inputLimitMiB * 1024 * 1024) throw new CliError('LIMIT_EXCEEDED', `PNG przekracza limit wejścia ${inputLimitMiB} MiB.`);
  const bytes = await readFile(filePath);
  // Recheck after reading because another process may replace/grow the input.
  if (bytes.length > inputLimitMiB * 1024 * 1024) throw new CliError('LIMIT_EXCEEDED', `PNG przekracza limit wejścia ${inputLimitMiB} MiB.`);
  return invoke('assets.import', { projectId: options.project, expectedRevision: options.expectedRevision, fileName: basename(filePath), pngBase64: bytes.toString('base64'), targetSize: options.targetSize }, options);
});

const meshes = program.command('meshes').description('Jawny import triangulowanej geometrii OBJ');
attach(mutation(expected(project(meshes.command('import-obj').requiredOption('--file <path>', 'Lokalny triangulowany OBJ UTF-8, do 1 MiB')
  .requiredOption('--source-up <axis>', 'Oś źródła: y albo z').requiredOption('--meters-per-unit <number>', 'Metry na jednostkę źródła; np. 1 lub 0.01', numeric)
  .requiredOption('--normals <mode>', 'flat: przelicz normalne płaskie; vn i smoothing nie są zachowywane')
  .option('--layer <id>', 'Wskazana istniejąca warstwa mesh').option('--new-layer-file <path>', 'Jawna nowa warstwa mesh jako JSON bez geometry')
  .option('--texture-asset <id>', 'ID już zaimportowanego PNG; brak opcji zachowuje teksturę warstwy')
  .option('--transform-file <path>', 'Jawny JSON {translation,orientation,scale}, po konwersji osi i jednostek')
  .option('--preview', 'Waliduj i zwróć dokument/diff bez zapisu')))), async options => {
  const operation = options.preview ? 'meshes.importObj.preview' : 'meshes.importObj';
  requireKey(options, operation);
  if (!!options.layer === !!options.newLayerFile) throw new CliError('INVALID_ARGUMENT', 'Wybierz dokładnie jedno: --layer albo --new-layer-file.');
  if (!['y', 'z'].includes(options.sourceUp) || options.normals !== 'flat' || options.metersPerUnit <= 0)
    throw new CliError('INVALID_ARGUMENT', 'OBJ wymaga --source-up y|z, dodatniego --meters-per-unit oraz --normals flat.');
  const filePath = resolve(options.file), maxBytes = OBJ_IMPORT_LIMITS.maxTextBytes;
  if ((await stat(filePath)).size > maxBytes) throw new CliError('LIMIT_EXCEEDED', 'OBJ przekracza limit 1 MiB.');
  const bytes = await readFile(filePath);
  if (bytes.length > maxBytes) throw new CliError('LIMIT_EXCEEDED', 'OBJ przekracza limit 1 MiB.');
  let objText: string;
  try { objText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new CliError('INVALID_ARGUMENT', 'Plik OBJ musi być poprawnym tekstem UTF-8.'); }
  const readObject = async (file: string) => object(await jsonInput({ inputFile: file }));
  const target = options.layer ? { layerId: options.layer } : { newLayer: await readObject(options.newLayerFile) };
  return invoke(operation, { projectId: options.project, expectedRevision: options.expectedRevision, fileName: basename(filePath), objText,
    sourceUpAxis: options.sourceUp, metersPerUnit: options.metersPerUnit, normalMode: options.normals, target,
    textureAssetId: options.textureAsset, transform: options.transformFile ? await readObject(options.transformFile) : undefined }, options);
});

const changes = program.command('changes');
for (const verb of ['preview', 'apply']) {
  let command = inputOptions(expected(project(changes.command(verb))));
  if (verb === 'apply') command = mutation(command);
  attach(command, async options => {
    requireKey(options, `changes.${verb}`);
    const source = await jsonInput(options);
    let patch: unknown;
    if (Array.isArray(source)) patch = source;
    else {
      const container = object(source);
      if (Object.keys(container).some(key => key !== 'changes')) throw new CliError('INVALID_ARGUMENT', 'Plik zmian zawiera wyłącznie tablicę zmian albo obiekt {changes:[...]}.');
      patch = container.changes;
    }
    return invoke(`changes.${verb}`, { projectId: options.project, expectedRevision: options.expectedRevision, changes: patch }, options);
  });
}
attach(mutation(expected(project(changes.command('revert').requiredOption('--operation <id>')))), options =>
  invoke('changes.revert', { projectId: options.project, expectedRevision: options.expectedRevision, operationId: options.operation }, options));

const layers = program.command('layers').description('Warstwy; mutacje wykonują changes.apply');
async function layerChange(options: Options, change: Record<string, unknown>): Promise<Result> {
  return invoke('changes.apply', { projectId: options.project, expectedRevision: options.expectedRevision, changes: [change] }, options);
}
attach(mutation(inputOptions(expected(project(layers.command('set').requiredOption('--layer <id>'))))), async options =>
  layerChange(options, { type: 'layer.set', layerId: options.layer, values: object(await jsonInput(options)) }));
attach(mutation(inputOptions(expected(project(layers.command('add'))))), async options => layerChange(options, { type: 'layer.add', layer: object(await jsonInput(options)) }));
attach(mutation(expected(project(layers.command('remove').requiredOption('--layer <id>')))), options => layerChange(options, { type: 'layer.remove', layerId: options.layer }));
attach(mutation(expected(project(layers.command('move').requiredOption('--layer <id>').requiredOption('--index <number>', 'Indeks od zera', whole)))), options => layerChange(options, { type: 'layer.move', layerId: options.layer, index: options.index }));
attach(mutation(expected(project(layers.command('enable').requiredOption('--layer <id>').requiredOption('--enabled <boolean>', 'true/false', boolean)))), options => layerChange(options, { type: 'layer.set', layerId: options.layer, values: { enabled: options.enabled } }));
attach(mutation(expected(project(layers.command('duplicate').requiredOption('--layer <id>').requiredOption('--new-layer <id>').option('--name <name>')))), async options => {
  requireKey(options, 'changes.apply');
  const reply = await invoke('projects.inspect', { projectId: options.project, revision: options.expectedRevision }, options);
  if (reply.status === 'failed') return reply;
  const doc = (reply.data as Project).document;
  const layer = doc?.layers.find((candidate: Layer) => candidate.id === options.layer);
  if (!layer) throw new CliError('NOT_FOUND', 'Warstwa nie istnieje w podanej rewizji.');
  return layerChange(options, { type: 'layer.add', layer: { ...layer, id: options.newLayer, name: options.name || `${layer.name} — kopia` } });
});
const constraints = program.command('constraints').description('Ograniczenia parametrów właściciela');
attach(project(constraints.command('inspect')), options => invoke('projects.inspect', { projectId: options.project }, options));
attach(mutation(inputOptions(expected(project(constraints.command('set'))))), async options => layerChange(options, { type: 'locks.set', locks: await jsonInput(options) }));

const revisions = program.command('revisions');
attach(paging(project(revisions.command('list'))), options => invoke('revisions.list', { projectId: options.project, limit: options.limit, cursor: options.cursor }, options));
attach(revision(project(revisions.command('get')), true), options => invoke('projects.inspect', { projectId: options.project, revision: options.revision }, options));
attach(mutation(revision(expected(project(revisions.command('restore'))), true)), options => invoke('revisions.restore', { projectId: options.project, expectedRevision: options.expectedRevision, revision: options.revision }, options));

const candidate = program.command('candidate');
attach(mutation(revision(project(candidate.command('build').option('--profile <id>').option('--model-name <resref>', 'Jawna nazwa modelu eksportu')), true)), options => invoke('candidate.build', { projectId: options.project, revision: options.revision, profileId: options.profile, modelName: options.modelName }, options));
const preview = program.command('preview');
attach(mutation(inputOptions(preview.command('compose'))), async options => invoke('preview.compose', object(await jsonInput(options)), options));
attach(mutation(revision(project(preview.command('request').option('--time <seconds>', 'Czas sceny', numeric).option('--format <format>', 'png lub webm').option('--cycles <count>', 'Obiegi DUR: 1–10, łącznie do 30 s', numeric)
  .option('--camera-file <path>', 'JSON kamery: position, target (metry), fov (stopnie)')), true)), async options => {
  let camera: unknown;
  if (options.cameraFile) {
    const path = resolve(options.cameraFile);
    if ((await stat(path)).size > 4096) throw new CliError('INVALID_ARGUMENT', 'Plik kamery przekracza 4 KiB.');
    try { camera = JSON.parse(await readFile(path,'utf8')); } catch { throw new CliError('INVALID_ARGUMENT', 'Plik kamery wymaga poprawnego JSON.'); }
    validateOperationInput('preview.request', { projectId: options.project, revision: options.revision, camera });
  }
  return invoke('preview.request', { projectId: options.project, revision: options.revision, time: options.time, format: options.format, camera, cycles:options.cycles }, options);
});
const native = program.command('native');
const nativeTest = native.command('test');
attach(nativeTest.command('status').requiredOption('--candidate <id>'), options => invoke('native.test.status', { candidateId: options.candidate }, options));
attach(mutation(nativeTest.command('request').requiredOption('--candidate <id>').requiredOption('--profile <id>')), options => invoke('native.test.request', { candidateId: options.candidate, profileId: options.profile }, options));

const jobs = program.command('jobs');
attach(paging(project(jobs.command('list'))), options => invoke('jobs.list', { projectId: options.project, limit: options.limit, cursor: options.cursor }, options));
attach(jobs.command('get <job-id>'), (options, [jobId]) => invoke('jobs.get', { jobId }, options));
attach(mutation(jobs.command('cancel <job-id>')), (options, [jobId]) => invoke('jobs.cancel', { jobId }, options));
attach(jobs.command('wait <job-id>').option('--timeout <duration>', 'Łączny limit oczekiwania; nie anuluje zadania', duration, 30_000), async (options, [jobId]) => {
  const deadline = Date.now() + options.timeout;
  let lastStatus: unknown;
  let lastJob: Record<string, unknown> | undefined;
  const timedOut = (): Result => {
    const value = failure(new CliError('WAIT_TIMEOUT', 'Upłynął limit oczekiwania; zadanie nie zostało anulowane.', { jobId, status: lastJob?.status }, true));
    if (lastJob) value.data = lastJob;
    return value;
  };
  while (true) {
    if (Date.now() >= deadline) return timedOut();
    const reply = await invoke('jobs.get', { jobId }, { ...options, requestTimeout: Math.max(1, Math.min(options.requestTimeout ?? 30_000, deadline - Date.now())) });
    if (reply.status === 'failed') return reply;
    const job = object(reply.data);
    lastJob = job;
    if (job.status === 'succeeded' || job.status === 'completed') return reply;
    if (['failed', 'cancelled', 'blocked'].includes(String(job.status))) {
      const value = failure(new CliError(job.status === 'cancelled' ? 'JOB_CANCELLED' : job.status === 'blocked' ? 'JOB_BLOCKED' : 'JOB_FAILED', `Zadanie ${jobId}: ${job.status}.`, job.error));
      value.data = job; return value;
    }
    if (!['queued', 'running', 'cancelling'].includes(String(job.status))) throw new CliError('INVALID_RESPONSE', 'Nieznany stan zadania.', { jobId, status: job.status });
    if (job.status !== lastStatus) { process.stderr.write(`job ${jobId}: ${job.status}\n`); lastStatus = job.status; }
    if (Date.now() >= deadline) {
      return timedOut();
    }
    await new Promise(done => setTimeout(done, Math.min(500, Math.max(0, deadline - Date.now()))));
  }
});

const artifacts = program.command('artifacts');
attach(paging(project(artifacts.command('list'))), options => invoke('artifacts.list', { projectId: options.project, limit: options.limit, cursor: options.cursor }, options));
attach(artifacts.command('get <artifact-id>').option('--out <path>', 'Pobierz do jawnego pliku').option('--overwrite', 'Zastąp plik po zweryfikowaniu pobrania'), async (options, [artifactId]) => {
  const reply = await invoke('artifacts.get', { artifactId }, options);
  if (reply.status !== 'failed' && options.out) reply.data = await downloadArtifact(object(reply.data), options.out, !!options.overwrite, options);
  return reply;
});
const policy = program.command('policy');
attach(project(policy.command('inspect')), options => invoke('policy.inspect', { projectId: options.project }, options));
attach(mutation(project(policy.command('set').requiredOption('--paused <boolean>', 'true/false', boolean))), options => invoke('policy.set', { projectId: options.project, paused: options.paused }, options));
for (const [verb, paused] of [['pause', true], ['resume', false]] as const) attach(mutation(project(policy.command(verb))), options => invoke('policy.set', { projectId: options.project, paused }, options));
const actors = program.command('actors');
attach(actors.command('list'), options => invoke('actors.list', {}, options));
attach(mutation(actors.command('create').requiredOption('--name <name>').requiredOption('--projects <ids>', 'ID rozdzielone przecinkiem; pusty ciąg oznacza brak projektów', csv).requiredOption('--scopes <scopes>', 'Zakresy rozdzielone przecinkiem', csv)), options =>
  invoke('actors.create', { name: options.name, projectIds: options.projects, scopes: options.scopes }, options));
attach(mutation(actors.command('revoke <actor-id>')), (options, [actorId]) => invoke('actors.revoke', { actorId }, options));
const reviews = program.command('reviews').alias('review');
attach(project(reviews.command('list')), options => invoke('reviews.list', { projectId: options.project }, options));
attach(mutation(revision(project(reviews.command('add').requiredOption('--text <text>').option('--verdict <verdict>', 'note, approved albo needs-work')), true)), options =>
  invoke('reviews.add', { projectId: options.project, revision: options.revision, text: options.text, verdict: options.verdict }, options));
const events = program.command('events');
attach(project(events.command('list').option('--cursor <number>', 'Ostatni odebrany kursor', whole).option('--limit <number>', 'Liczba zdarzeń', whole)), options => invoke('events.list', { projectId: options.project, cursor: options.cursor, limit: options.limit }, options));

for(const [operation,schema] of Object.entries(WORKFLOW_SCHEMAS)){
  const parts=operation.split('.');let parent=program;
  for(const part of parts.slice(0,-1))parent=parent.commands.find(c=>c.name()===part)??parent.command(part);
  const cmd=inputOptions(parent.command(parts.at(-1)!).description(schema.description));
  attach(schema.mutates?mutation(cmd):cmd,async options=>invoke(operation,object(await jsonInput(options)),options));
}
process.once('SIGINT', () => {
  writeOutput(failure(new CliError('CLIENT_INTERRUPTED', 'Przerwano klienta. Zadania usługi nie zostały anulowane.')), 130);
  process.stdout.write('', () => process.exit(130));
});
try {
  if (process.argv.length < 3) program.help();
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) process.exitCode = 0;
  else writeOutput(failure(error instanceof CommanderError ? new CliError('INVALID_ARGUMENT', error.message) : error));
}
