import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import Ajv from 'ajv';
import { build } from 'esbuild';
import { operationSchemas, validateResult } from '../packages/contracts/src/schema.js';
import { makeDocument, CONTRACT_VERSION } from '../packages/core/src/model.js';
import { WEBMCP_OPERATIONS, webMCPInputSchemas } from '../apps/web/src/webmcp-schemas.js';
import * as browser from '../apps/web/src/browser-contracts.js';
const root = fileURLToPath(new URL('../', import.meta.url));

test('generated browser validators stay synchronized with canonical schemas', () => {
  assert.deepEqual(browser.inputSchemas, webMCPInputSchemas(operationSchemas));
  for (const name of WEBMCP_OPERATIONS) {
    const { description, inputSchema, mutates } = operationSchemas[name];
    assert.deepEqual(browser.operationSchemas[name], { description, inputSchema, mutates });
  }
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/generate-browser-contracts.ts', '--check'], { cwd: root, stdio: 'pipe', windowsHide: true });
});

test('standalone input, output and envelope decisions match canonical AJV on malformed and valid data', () => {
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  const date = '2026-09-05T15:00:00.000Z', document = makeDocument();
  const project = { id: 'p', revision: 1, document, createdAt: date, updatedAt: date };
  const samples: unknown[] = [null, undefined, [], {}, { unexpected: true }, { id: 'fake' }, project,
    { ...project, revision: '1' }, { ...project, document: { ...document, layers: [{ ...document.layers[0], count: 4000 }] } },
    { items: [project], nextCursor: null }, { items: [project] },
    { projectId: 'p', revision: 1, artifact: { sha256: 'invalid' } }];
  for (const name of WEBMCP_OPERATIONS) {
    const validate = ajv.compile(operationSchemas[name].outputSchema);
    for (const value of samples) {
      let accepted = true; try { browser.validateOperationOutput(name, value); } catch { accepted = false; }
      assert.equal(accepted, validate(value), name + ': output decision');
    }
  }
  const inputs: unknown[] = [null, undefined, {}, [], { viewSessionId: 'view', input: {} },
    { viewSessionId: 'view', input: { projectId: 'p' } },
    { viewSessionId: 'view', input: { projectId: 'p', expectedRevision: 1, changes: [{ type: 'layer.set', layerId: 'sparks', values: { count: 44 } }] }, idempotencyKey: 'stable-input-key' },
    { viewSessionId: 'view', projectId: 'p', expectedRevision: 1, expectedViewRevision: 0, time: .3 },
    { viewSessionId: 'view', projectId: 'p', expectedRevision: 1, expectedViewRevision: 0, time: Infinity },
    { viewSessionId: 'view', artifactId: 'a', offset: -1 },
    { viewSessionId: 'view', artifactId: 'a', length: 262145 },
    { viewSessionId: 'view', input: {}, idempotencyKey: 'short', actorId: 'owner' }];
  for (const [name, schema] of Object.entries(webMCPInputSchemas(operationSchemas))) {
    const validate = ajv.compile(schema);
    for (const value of inputs) {
      let accepted = true; try { browser.validateToolInput(name, value); } catch { accepted = false; }
      assert.equal(accepted, validate(value), name + ': input decision');
    }
  }
  for (const envelope of [...samples,
    { contractVersion: CONTRACT_VERSION, requestId: 'req', status: 'ok', data: project, diagnostics: [] },
    { contractVersion: CONTRACT_VERSION, requestId: 'req', status: 'failed', diagnostics: [], error: { code: 'LOCKED', message: 'Locked', retryable: false } }])
    assert.equal(browser.validateResult(envelope), validateResult(envelope));
});

test('production adapter imports and validators execute with dynamic code generation disabled', async () => {
  const bundled = await build({ entryPoints: [root + 'apps/web/src/webmcp.ts'], bundle: true, write: false,
    format: 'iife', globalName: 'StudioAdapter', platform: 'browser', target: 'es2023', metafile: true });
  assert.ok(Object.keys(bundled.metafile!.inputs).every(path => !path.includes('ajv/dist/compile') && !path.endsWith('contracts/src/schema.ts')));
  const scope = vm.createContext({ crypto: globalThis.crypto, fetch: globalThis.fetch, AbortController, URL, TextEncoder, Uint8Array, atob },
    { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(bundled.outputFiles[0].text, scope);
  const tools = scope.StudioAdapter.createStudioWebMCPTools({ getGrant: () => null, view: { inspect: () => { throw new Error('Must not read unauthorized view'); }, set: () => { throw new Error('Must not change unauthorized view'); } } });
  assert.equal((await tools.find((tool: any) => tool.name === 'studio.projects.inspect').execute({ viewSessionId: 'view', input: { projectId: 'p' } })).error.code, 'WEBMCP_NOT_CONNECTED');
  assert.equal((await tools.find((tool: any) => tool.name === 'studio.changes.apply').execute({})).error.code, 'INVALID_INPUT');
  const generated = readFileSync(root + 'apps/web/src/generated/webmcp-contracts.ts', 'utf8');
  assert.doesNotMatch(generated, /\bnew\s+Function\s*\(|\beval\s*\(/);
});
