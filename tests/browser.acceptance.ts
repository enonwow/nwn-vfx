import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';

test('web + external API: create/edit/save, conflict preserves draft, jobs produce real PNG/WebM and downloadable NWN', { timeout: 180_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'nwn-vfx-browser-'));
  const port = 14319;
  const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, port, webDir: resolve('dist/web'), render: createRenderer(origin) });
  await app.listen({ host: '127.0.0.1', port });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors: string[] = [];
  const call = async (operation: string, input: any = {}, key = randomUUID()): Promise<any> => {
    const response = await fetch(`${origin}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${app.studio.config.ownerToken}` }, body: JSON.stringify({ operation, input, idempotencyKey: key }) });
    const result: any = await response.json(); assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data;
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Przeciążenie cewki', exact: true }).click();
    await page.getByText('rewizja 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Zatrzymaj', exact: true }).click();
    await page.getByRole('slider', { name: 'Czas podglądu', exact: true }).fill('0.55');
    const size = page.getByRole('slider', { name: 'Rozmiar początkowy', exact: false });
    await size.fill('0.12');
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
    await page.getByText('rewizja 2', { exact: true }).waitFor();
    const list = await call('projects.list', { limit: 10 }); const project = list.items[0];
    assert.equal(project.document.layers[0].size, .12);
    await size.fill('0.15');
    await call('changes.apply', { projectId: project.id, expectedRevision: 2, changes: [{ type: 'layer.set', layerId: 'smoke', values: { color: '#334455' } }] });
    await page.getByRole('alert').filter({ hasText: 'rewizję 3' }).waitFor({ timeout: 10_000 });
    assert.equal(await size.inputValue(), '0.15');
    await page.getByRole('button', { name: 'Odrzuć propozycję i wczytaj' }).click();
    await page.getByText('rewizja 3', { exact: true }).waitFor();
    assert.equal(await size.inputValue(), '0.12');
    await page.getByRole('button', { name: 'Eksport NWN', exact: true }).click();
    await page.getByText('Gotowe', { exact: true }).first().waitFor({ timeout: 15_000 });
    const href = await page.getByRole('link', { name: 'candidate.zip', exact: true }).getAttribute('href');
    assert.ok(href);
    const download = await page.request.get(`${origin}${href}`); assert.equal(download.status(), 200);
    const bytes = await download.body(); assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
    await mkdir(resolve('output/playwright'), { recursive: true });
    await page.screenshot({ path: resolve('output/playwright/editor-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve('output/playwright/editor-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile must not overflow horizontally');
    await page.close(); // No open editor during rendering.
    for (const format of ['png', 'webm']) {
      const job = await call('preview.request', { projectId: project.id, revision: 3, time: .55, format });
      await app.studio.drainJobs();
      const done = await call('jobs.get', { jobId: job.id });
      assert.equal(done.status, 'succeeded', JSON.stringify(done.error));
      const artifact = done.artifacts.find((a: any) => a.name === `preview.${format}`); assert.ok(artifact);
      const result = await fetch(`${origin}/api/artifacts/${artifact.id}`, { headers: { Authorization: `Bearer ${app.studio.config.ownerToken}` } });
      const buffer = Buffer.from(await result.arrayBuffer());
      assert.equal(createHash('sha256').update(buffer).digest('hex'), artifact.sha256);
      assert.ok(buffer.length > 4000, 'Real render must contain image/video payload');
      if (format === 'png') assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      else assert.equal(buffer.subarray(0, 4).toString('hex'), '1a45dfa3');
      await writeFile(resolve(`output/playwright/preview.${format}`), buffer);
    }
    assert.deepEqual(errors, []);
    await writeFile(resolve('output/playwright/acceptance.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), viewport: [1440, 1000], mobile: [390, 844], projectId: project.id, revision: 3, nativeVerified: false, consoleErrors: errors }, null, 2));
  } finally { await browser.close(); await app.close(); }
});
