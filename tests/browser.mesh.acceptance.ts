import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createApp } from '../apps/service/src/app.js';
import type { MeshLayer } from '../packages/core/src/model.js';

test('human mesh editor preserves geometry, all animation tracks and unapplied JSON across layer selection', { timeout: 90000 }, async () => {
  const port = 14326, origin = `http://127.0.0.1:${port}`, dataDir = await mkdtemp(join(tmpdir(), 'nwn-vfx-mesh-ui-'));
  const app = await createApp({ dataDir, port, webDir: resolve('dist/web') });
  await app.listen({ host: '127.0.0.1', port });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const call = async (operation: string, input: Record<string, unknown>) => {
    const response = await fetch(origin + '/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + app.studio.config.ownerToken },
      body: JSON.stringify({ operation, input, idempotencyKey: randomUUID() }) });
    const result: any = await response.json(); assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data;
  };
  try {
    const project = await call('projects.create', { preset: 'coil', name: 'Mesh UI acceptance' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'pl-PL' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByText('rewizja 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Zatrzymaj', exact: true }).click();
    await page.getByRole('button', { name: 'Dodaj geometrię', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nazwa warstwy', exact: true }).fill('Próba geometrii');
    await page.getByRole('spinbutton', { name: 'Wymiar X (m)', exact: true }).fill('0.31');
    await page.getByRole('spinbutton', { name: 'Pozycja Z (m)', exact: true }).fill('1.2');
    await page.getByRole('spinbutton', { name: 'Kąt obrotu (rad)', exact: true }).fill('0.5');
    const effectDuration = page.getByRole('spinbutton', { name: 'Czas efektu', exact: true });
    await effectDuration.fill('1');
    await page.getByRole('alert').filter({ hasText: 'Geometria wykracza poza czas efektu' }).waitFor();
    assert.equal(await effectDuration.inputValue(), '3', 'A rejected duration must retain the valid document duration');
    assert.equal(await page.getByRole('spinbutton', { name: 'Wymiar X (m)', exact: true }).inputValue(), '0.31', 'A rejected duration must preserve the existing human edit');
    await page.getByRole('spinbutton', { name: 'Długość geometrii (s)', exact: true }).fill('1');
    await effectDuration.fill('1');
    assert.equal(await effectDuration.inputValue(), '1', 'Shorten the mesh first, then the effect');
    assert.equal(await page.getByRole('alert').filter({ hasText: 'Geometria wykracza poza czas efektu' }).count(), 0);
    await effectDuration.fill('3');
    await page.getByRole('spinbutton', { name: 'Długość geometrii (s)', exact: true }).fill('3');
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
    await page.getByText('rewizja 2', { exact: true }).waitFor();
    let saved = await call('projects.inspect', { projectId: project.id });
    assert.equal(saved.document.schemaVersion, 2);
    let mesh = saved.document.layers.find((layer: any) => layer.type === 'mesh') as MeshLayer;
    assert.deepEqual(mesh.geometry, { kind: 'box', dimensions: [.31, .15, 1] });
    assert.deepEqual(mesh.position, [0, 0, 1.2]); assert.deepEqual(mesh.orientation, [0, 0, 1, .5]);
    assert.deepEqual(saved.document.layers.filter((layer: any) => layer.type !== 'mesh'), project.document.layers, 'Adding a mesh must preserve the original emitters');

    await page.getByRole('combobox', { name: 'Kształt geometrii' }).selectOption('ring');
    await page.getByRole('spinbutton', { name: 'Promień wewnętrzny (m)' }).fill('0.25');
    await page.getByRole('spinbutton', { name: 'Promień zewnętrzny (m)' }).fill('0.65');
    await page.getByRole('spinbutton', { name: 'Segmenty pierścienia' }).fill('24');
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click(); await page.getByText('rewizja 3', { exact: true }).waitFor();
    saved = await call('projects.inspect', { projectId: project.id });
    mesh = saved.document.layers.find((layer: any) => layer.type === 'mesh');
    assert.deepEqual(mesh.geometry, { kind: 'ring', innerRadius: .25, outerRadius: .65, segments: 24 });

    await page.getByRole('combobox', { name: 'Kształt geometrii' }).selectOption('custom');
    await page.getByText('Geometria JSON', { exact: true }).click();
    const invalid = JSON.stringify({ kind: 'custom', vertices: [[0, 0, 0], [1, 0, 0], [0, 0, 1]], faces: [[0, 1, 9]] }, null, 2);
    await page.getByRole('textbox', { name: 'Geometria JSON', exact: true }).fill(invalid);
    assert.equal(await page.getByRole('button', { name: 'Zapisz', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Zastosuj geometrię', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'niepoprawnych wierzchołków' }).waitFor();
    await page.getByRole('button', { name: 'Zaznacz na osi czasu: Iskry', exact: true }).click();
    await page.getByRole('slider', { name: 'Rozmiar początkowy', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Zaznacz na osi czasu: Próba geometrii', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Geometria JSON', exact: true }).inputValue(), invalid);
    const custom = { kind: 'custom', vertices: [[-.15, 0, 0], [.15, 0, 0], [0, 0, 1.7]], faces: [[0, 1, 2]] };
    await page.getByRole('textbox', { name: 'Geometria JSON', exact: true }).fill(JSON.stringify(custom, null, 2));
    await page.getByRole('button', { name: 'Zastosuj geometrię', exact: true }).click();
    await page.getByText('Klucze animacji JSON', { exact: true }).click();
    const animation = {
      position: [{ time: 0, value: [0, 0, 2] }, { time: 1, value: [0, 0, .2] }],
      orientation: [{ time: 0, value: [0, 0, 1, 0] }, { time: 1, value: [0, 1, 0, .5] }],
      scale: [{ time: 0, value: .7 }, { time: 1, value: 1.3 }],
      alpha: [{ time: 0, value: 0 }, { time: .2, value: 1 }, { time: 2.8, value: 0 }],
    };
    await page.getByRole('textbox', { name: 'Klucze animacji JSON', exact: true }).fill(JSON.stringify(animation, null, 2));
    await page.getByRole('button', { name: 'Zastosuj klucze', exact: true }).click();
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click(); await page.getByText('rewizja 4', { exact: true }).waitFor();
    saved = await call('projects.inspect', { projectId: project.id }); mesh = saved.document.layers.find((layer: any) => layer.type === 'mesh');
    assert.deepEqual(mesh.geometry, custom); assert.deepEqual(mesh.animation, animation);

    await page.getByRole('slider', { name: 'Czas podglądu', exact: true }).fill('0.55');
    await page.getByRole('button', { name: 'Dodaj klucz: Pozycja', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Pozycja klucz 2: Z', exact: true }).fill('0.8');
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click(); await page.getByText('rewizja 5', { exact: true }).waitFor();
    saved = await call('projects.inspect', { projectId: project.id }); mesh = saved.document.layers.find((layer: any) => layer.type === 'mesh');
    assert.deepEqual(mesh.animation.position?.[1], { time: .55, value: [0, 0, .8] });
    assert.deepEqual(mesh.animation.alpha, animation.alpha);
    await page.reload(); await page.getByText('rewizja 5', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Zaznacz na osi czasu: Próba geometrii', exact: true }).click();
    assert.equal(await page.getByRole('spinbutton', { name: 'Pozycja klucz 2: Z', exact: true }).inputValue(), '0.8');
    assert.equal(await page.getByRole('combobox', { name: 'Kształt geometrii' }).inputValue(), 'custom');
    assert.equal(await page.getByRole('spinbutton', { name: 'Kąt obrotu (rad)', exact: true }).evaluate((input: HTMLInputElement) => input.validity.valid), true, 'Arbitrary valid radians must not produce an HTML step mismatch');
    await page.getByRole('button', { name: 'Zablokuj warstwę', exact: true }).click();
    assert.equal(await page.getByRole('spinbutton', { name: 'Pozycja Z (m)', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Dodaj klucz: Pozycja', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Ukryj Próba geometrii', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Odblokuj', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Zapisz', exact: true }).isDisabled(), true, 'Removing an uncommitted lock restores the clean saved draft');
    await mkdir(resolve('output/playwright'), { recursive: true });
    await page.screenshot({ path: resolve('output/playwright/mesh-editor-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mesh controls must fit a mobile viewport');
    await page.screenshot({ path: resolve('output/playwright/mesh-editor-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});
