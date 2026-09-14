import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chromium, type Page } from 'playwright';
import { createApp } from '../apps/service/src/app.js';

async function fixture(port: number) {
  const dataDir = await mkdtemp(join(tmpdir(), 'nwn-vfx-browser-webmcp-')), origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, port, webDir: resolve('dist/web') });
  await app.listen({ host: '127.0.0.1', port });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function call(operation: string, input: Record<string, unknown> = {}, token = app.studio.config.ownerToken) {
    const response = await fetch(`${origin}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ operation, input, idempotencyKey: randomUUID() }) });
    const result: any = await response.json(); assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data;
  }
  return { app, browser, origin, call, close: async () => { await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); } };
}

test('a real committed save with delayed response preserves newer human edits; history renders operation author and timestamp', { timeout: 60000 }, async () => {
  const f = await fixture(14320); let release!: () => void;
  try {
    const page = await f.browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'pl-PL' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(f.origin, { waitUntil: 'domcontentloaded' });
    try { await page.getByRole('button', { name: 'Przeciążenie cewki', exact: true }).click({ timeout: 10000 }); }
    catch (error) { throw new Error('Studio did not boot: ' + JSON.stringify({ errors, body: await page.locator('body').innerText() }), { cause: error }); }
    await page.getByText('rewizja 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Zatrzymaj', exact: true }).click();
    const project = (await f.call('projects.list', { limit: 10 })).items[0];
    const size = page.getByRole('slider', { name: 'Rozmiar początkowy', exact: true });
    let didHold = false, committed!: (result: any) => void;
    const committedResponse = new Promise<any>(resolve => { committed = resolve; });
    const responseGate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/commands', async route => {
      const request = route.request();
      if (request.method() !== 'POST' || request.postDataJSON()?.operation !== 'changes.apply' || didHold) { await route.continue(); return; }
      didHold = true;
      // Forward the real write first: only delivery of its successful response
      // is delayed. Mocking a response would not exercise the save race.
      const response = await route.fetch(); committed(await response.json());
      await responseGate; await route.fulfill({ response });
    });
    await size.fill('0.12'); await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
    const accepted = await committedResponse; assert.equal(accepted.status, 'ok'); assert.equal(accepted.data.revision, 2);
    const during = await f.call('projects.inspect', { projectId: project.id }); assert.equal(during.document.layers[0].size, .12);
    assert.equal(await page.getByRole('button', { name: 'Zapisz', exact: true }).isDisabled(), true);
    await size.fill('0.15'); assert.equal(await size.inputValue(), '0.15');
    release();
    await page.getByRole('status').filter({ hasText: 'Zapisano rewizję 2' }).waitFor();
    assert.match(await page.getByRole('status').filter({ hasText: 'Zapisano rewizję 2' }).innerText(), /Późniejsze edycje pozostają w szkicu/);
    await page.getByText('Niezapisane zmiany', { exact: true }).waitFor();
    assert.equal(await size.inputValue(), '0.15', 'The late save response must not replace the newer human draft');
    assert.equal((await f.call('projects.inspect', { projectId: project.id })).document.layers[0].size, .12);
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click(); await page.getByText('rewizja 3', { exact: true }).waitFor();
    await page.getByRole('status').filter({ hasText: 'Zapisano rewizję 3' }).waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: 'Zapisano rewizję 3' }).innerText(), 'Zapisano rewizję 3.');
    assert.equal(await page.getByText('Niezapisane zmiany', { exact: true }).count(), 0);
    const saved = await f.call('projects.inspect', { projectId: project.id }); assert.equal(saved.document.layers[0].size, .15);

    const agentName = 'TLC browser history reviewer';
    const actor = await f.call('actors.create', { name: agentName, projectIds: [project.id], scopes: ['read', 'edit'] });
    await f.call('changes.apply', { projectId: project.id, expectedRevision: 3, changes: [{ type: 'layer.set', layerId: 'smoke', values: { color: '#334455' } }] }, actor.token);
    await page.getByText('rewizja 4', { exact: true }).waitFor({ timeout: 10000 });
    const records = (await f.call('revisions.list', { projectId: project.id })).items;
    assert.equal(records[0].actorName, agentName); assert.equal(records[0].actorKind, 'agent'); assert.ok(records[0].committedAt);
    assert.notEqual(records[0].committedAt, project.createdAt, 'History timestamp must belong to the operation, not project creation');
    await page.getByRole('button', { name: 'Historia', exact: true }).click();
    const agentRow = page.locator('.history-item').filter({ hasText: 'Rewizja 4' });
    await agentRow.getByText(`${agentName} · AI`, { exact: true }).waitFor();
    const formattedAgentTime = await page.evaluate(value => new Date(value).toLocaleString('pl-PL'), records[0].committedAt);
    assert.equal(await agentRow.locator('small').textContent(), formattedAgentTime);
    const humanRow = page.locator('.history-item').filter({ hasText: 'Rewizja 3' });
    await humanRow.getByText('Właściciel · człowiek', { exact: true }).waitFor();
    const humanTime = await page.evaluate(value => new Date(value).toLocaleString('pl-PL'), records.find((r: any) => r.revision === 3).committedAt);
    assert.equal(await humanRow.locator('small').textContent(), humanTime); assert.deepEqual(errors, []);
  } finally { release?.(); await f.close(); }
});

async function invoke(page: Page, name: string, input: unknown = {}): Promise<any> {
  return page.evaluate(async ({ name, input }) => {
    const registry = (window as any).__testWebMCPRegistry as Map<string, { execute: (input: unknown) => Promise<unknown> }>;
    const tool = registry.get(name); if (!tool) throw new Error('Tool was not registered: ' + name);
    return tool.execute(input);
  }, { name, input });
}

test('polling during a pending save preserves a human edit back to the previous baseline', { timeout: 60000 }, async () => {
  const f = await fixture(14322); let release!: () => void;
  try {
    const project = await f.call('projects.create', { name: 'Reverted field fixture', preset: 'coil' });
    const page = await f.browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(f.origin, { waitUntil: 'domcontentloaded' }); await page.getByText('rewizja 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Zatrzymaj', exact: true }).click();
    const size = page.getByRole('slider', { name: 'Rozmiar początkowy', exact: true }), original = String(project.document.layers[0].size);
    let committed!: () => void, held = false;
    const committedResponse = new Promise<void>(resolve => { committed = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/commands', async route => {
      if (route.request().postDataJSON()?.operation !== 'changes.apply' || held) { await route.continue(); return; }
      held = true; const response = await route.fetch(); assert.equal((await response.json()).status, 'ok'); committed(); await gate; await route.fulfill({ response });
    });
    await size.fill('0.12'); await page.getByRole('button', { name: 'Zapisz', exact: true }).click(); await committedResponse;
    const poll = page.waitForResponse(async response => response.url().endsWith('/api/commands') && response.request().postDataJSON()?.operation === 'projects.inspect' && (await response.json()).data?.revision === 2);
    await size.fill(original); assert.equal(await size.inputValue(), original);
    await poll; await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    assert.equal(await size.inputValue(), original, 'Polling cannot replace an edit made while a save response is pending, even when it equals the old baseline');
    release(); await page.getByRole('status').filter({ hasText: 'Zapisano rewizję 2' }).waitFor();
    await page.getByText('Niezapisane zmiany', { exact: true }).waitFor(); assert.equal(await size.inputValue(), original);
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click(); await page.getByText('rewizja 3', { exact: true }).waitFor();
    assert.equal((await f.call('projects.inspect', { projectId: project.id })).document.layers[0].size, Number(original));
  } finally { release?.(); await f.close(); }
});
async function connect(page: Page) {
  await page.getByRole('button', { name: 'Połącz agenta', exact: true }).click();
  await page.getByRole('button', { name: 'Udostępnij projekt AI', exact: true }).click();
  await page.getByRole('button', { name: 'Odłącz WebMCP', exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
}

test('production WebMCP callbacks through an explicit registration mock preserve tab grants, drafts and revocation', { timeout: 60000 }, async () => {
  const f = await fixture(14321);
  try {
    const project = await f.call('projects.create', { name: 'WebMCP browser fixture', preset: 'coil' });
    const context = await f.browser.newContext({ viewport: { width: 1440, height: 1000 } });
    // This test exercises the shipped adapter and real server. It mocks only
    // browser registration and is deliberately NOT evidence of native WebMCP.
    await context.addInitScript(() => {
      const registry = new Map<string, unknown>(); (window as any).__testWebMCPRegistry = registry;
      Object.defineProperty(document, 'modelContext', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'modelContext', { configurable: true, value: {
        registerTool(tool: any, options?: { signal?: AbortSignal }) {
          if (registry.has(tool.name)) throw new Error('Duplicate registered tool'); registry.set(tool.name, tool);
          options?.signal?.addEventListener('abort', () => registry.delete(tool.name), { once: true });
        }, unregisterTool(name: string) { registry.delete(name); },
      } });
    });
    const page = await context.newPage(), other = await context.newPage();
    const errors: string[] = []; for (const tab of [page, other]) tab.on('pageerror', error => errors.push(error.message));
    for (const tab of [page, other]) {
      await tab.goto(f.origin, { waitUntil: 'domcontentloaded' });
      try { await tab.getByText('rewizja 1', { exact: true }).waitFor({ timeout: 10000 }); }
      catch (error) { throw new Error('Studio did not boot: ' + JSON.stringify({ errors, body: await tab.locator('body').innerText() }), { cause: error }); }
      await tab.waitForFunction(() => (window as any).__testWebMCPRegistry?.has('studio.view.open'));
      assert.equal((await invoke(tab, 'studio.connection.inspect')).error.code, 'WEBMCP_NOT_CONNECTED');
    }
    await connect(page); const connection = await invoke(page, 'studio.connection.inspect'); assert.equal(connection.status, 'ok');
    const viewSessionId = connection.data.viewSessionId; assert.notEqual(connection.data.actorId, 'owner'); assert.equal(connection.data.token, undefined);
    assert.equal((await invoke(other, 'studio.connection.inspect')).error.code, 'WEBMCP_NOT_CONNECTED');
    await connect(other); const second = await invoke(other, 'studio.connection.inspect'); assert.equal(second.status, 'ok');
    assert.notEqual(second.data.viewSessionId, viewSessionId); assert.notEqual(second.data.actorId, connection.data.actorId);
    assert.equal((await invoke(other, 'studio.view.inspect', { viewSessionId })).error.code, 'VIEW_SESSION_MISMATCH');
    let view = (await invoke(page, 'studio.view.inspect', { viewSessionId })).data; assert.equal(view.projectId, project.id); assert.equal(view.draftDirty, false);
    const originalViewRevision = view.viewRevision;
    const selected = await invoke(page, 'studio.view.set', { viewSessionId, projectId: project.id, expectedRevision: view.revision, expectedViewRevision: view.viewRevision, selectedLayerId: 'smoke', time: .41, playing: false });
    assert.equal(selected.status, 'ok'); assert.equal(selected.data.selectedLayerId, 'smoke'); assert.equal(selected.data.time, .41);
    view = (await invoke(page, 'studio.view.inspect', { viewSessionId })).data;
    assert.equal(view.playing, false); assert.ok(view.viewRevision > originalViewRevision);
    assert.equal((await invoke(page, 'studio.view.set', { viewSessionId, projectId: project.id, expectedRevision: view.revision, expectedViewRevision: originalViewRevision, time: .5 })).error.code, 'VIEW_CONFLICT');
    assert.equal((await invoke(page, 'studio.view.inspect', { viewSessionId: randomUUID() })).error.code, 'VIEW_SESSION_MISMATCH');
    await f.call('policy.set', { projectId: project.id, paused: true });
    assert.equal((await invoke(page, 'studio.view.set', { viewSessionId, projectId: project.id, expectedRevision: view.revision, expectedViewRevision: view.viewRevision, time: .5 })).error.code, 'AI_PAUSED');
    assert.equal((await invoke(page, 'studio.view.inspect', { viewSessionId })).data.time, .41);
    await f.call('policy.set', { projectId: project.id, paused: false });
    const fork = await invoke(page, 'studio.projects.fork', { viewSessionId, input: { projectId: project.id, revision: 1, name: 'Browser agent variant' }, idempotencyKey: randomUUID() }); assert.equal(fork.status, 'ok');
    await f.call('changes.apply', { projectId: fork.data.id, expectedRevision: 1, changes: [{ type: 'locks.set', locks: [{ layerId: 'sparks', field: 'size' }] }] });
    const edit = { projectId: fork.data.id, expectedRevision: 2, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .2 } }] };
    assert.equal((await invoke(page, 'studio.changes.apply', { viewSessionId, input: edit, idempotencyKey: randomUUID() })).error.code, 'LOCKED');
    assert.equal((await invoke(page, 'studio.changes.apply', { viewSessionId, input: { ...edit, expectedRevision: 1 }, idempotencyKey: randomUUID() })).error.code, 'REVISION_CONFLICT');
    await f.call('policy.set', { projectId: fork.data.id, paused: true });
    const buildArgs = { viewSessionId, input: { projectId: fork.data.id, revision: 2 }, idempotencyKey: randomUUID() };
    assert.equal((await invoke(page, 'studio.candidate.build', buildArgs)).error.code, 'AI_PAUSED');
    await f.call('policy.set', { projectId: fork.data.id, paused: false });
    const accepted = await invoke(page, 'studio.candidate.build', buildArgs); assert.equal(accepted.status, 'accepted');
    assert.equal((await invoke(page, 'studio.candidate.build', buildArgs)).operationId, accepted.operationId);
    await f.app.studio.drainJobs();
    const job = await invoke(page, 'studio.jobs.get', { viewSessionId, input: { jobId: accepted.data.id } }); assert.equal(job.data.status, 'succeeded');
    const artifact = job.data.artifacts.find((a: any) => a.name === 'candidate.zip'); assert.ok(artifact);
    const chunks: Buffer[] = []; let offset = 0;
    while (true) {
      const chunk = await invoke(page, 'studio.artifacts.read', { viewSessionId, artifactId: artifact.id, offset, length: 8192 });
      assert.equal(chunk.status, 'ok', JSON.stringify(chunk.error)); chunks.push(Buffer.from(chunk.data.base64, 'base64'));
      if (chunk.data.nextOffset === null) break; offset = chunk.data.nextOffset;
    }
    const downloaded = Buffer.concat(chunks); assert.equal(downloaded.length, artifact.size); assert.equal(createHash('sha256').update(downloaded).digest('hex'), artifact.sha256);
    await page.getByRole('slider', { name: 'Rozmiar początkowy', exact: true }).fill('0.15');
    view = (await invoke(page, 'studio.view.inspect', { viewSessionId })).data; assert.equal(view.draftDirty, true);
    assert.equal(view.draft.layers.find((l: any) => l.id === 'smoke').size, .15);
    const blocked = await invoke(page, 'studio.view.open', { viewSessionId, projectId: fork.data.id, expectedViewRevision: view.viewRevision }); assert.equal(blocked.error.code, 'DRAFT_CONFLICT');
    assert.equal(await page.getByRole('combobox', { name: 'Projekt', exact: true }).inputValue(), project.id);
    assert.equal(await page.getByRole('slider', { name: 'Rozmiar początkowy', exact: true }).inputValue(), '0.15');
    await page.getByRole('button', { name: 'Połącz agenta', exact: true }).click(); await page.getByRole('button', { name: 'Odłącz WebMCP', exact: true }).click();
    await page.getByRole('button', { name: 'Udostępnij projekt AI', exact: true }).waitFor();
    assert.equal((await invoke(page, 'studio.connection.inspect')).error.code, 'WEBMCP_NOT_CONNECTED');
    assert.equal((await invoke(page, 'studio.view.inspect', { viewSessionId })).error.code, 'WEBMCP_NOT_CONNECTED');
    assert.equal((await invoke(other, 'studio.connection.inspect')).status, 'ok', 'Revoking this tab must not revoke another tab');
    assert.deepEqual(errors, []);
  } finally { await f.close(); }
});
