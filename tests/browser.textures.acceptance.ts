import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chromium, type Page } from 'playwright';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { makeDocument, makeLayer, makeMeshLayer, type EffectDocument, type MeshGeometry, type TextureAsset, type Vec3 } from '../packages/core/src/model.js';
import { createTextureAsset } from '../packages/core/src/textures.js';
import { orientationTexture, rgbaPng, rgbPng } from './fixtures/rgba-texture.js';

type Frame = { width: number; height: number; pixels: Buffer };
type RGB = [number, number, number];
const time = .2, width = 960, height = 640;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function imagePixels(page: Page, bytes: Uint8Array): Promise<Frame> {
  const result = await page.evaluate(async base64 => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data, chunks: string[] = [];
    for (let i = 0; i < data.length; i += 32768) chunks.push(String.fromCharCode(...data.subarray(i, i + 32768)));
    return { width: canvas.width, height: canvas.height, data: btoa(chunks.join('')) };
  }, Buffer.from(bytes).toString('base64'));
  return { width: result.width, height: result.height, pixels: Buffer.from(result.data, 'base64') };
}
function pixel(frame: Frame, x: number, y: number): RGB {
  const offset = (y * frame.width + x) * 4;
  return [frame.pixels[offset], frame.pixels[offset + 1], frame.pixels[offset + 2]];
}
function closeColor(actual: RGB, expected: RGB, tolerance: number, label: string) {
  actual.forEach((value, channel) => assert.ok(Math.abs(value - expected[channel]) <= tolerance,
    `${label}: ${actual} must match ${expected} within ${tolerance}`));
}
function samePixels(actual: Frame, expected: Frame, label: string) {
  assert.deepEqual([actual.width, actual.height], [expected.width, expected.height]);
  assert.equal(sha256(actual.pixels), sha256(expected.pixels), label);
}
async function nextPaint(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

// A camera-facing quad, with UV indices deliberately different from vertex
// indices. A renderer that assumes one shared index will rotate/distort it.
function facingQuad(): MeshGeometry {
  const horizontal = Math.hypot(3.4, 5.4), distance = Math.hypot(3.4, 5.4, 2.05);
  const right = [5.4 / horizontal, 3.4 / horizontal, 0];
  const up = [-2.05 * 3.4 / (distance * horizontal), 2.05 * 5.4 / (distance * horizontal), horizontal / distance];
  const half = 1; // Same actual 2m width as the emitter; no FOV compensation.
  const vertex = (x: number, y: number): Vec3 => right.map((value, index) => half * (x * value + y * up[index])) as Vec3;
  return { kind: 'custom', vertices: [vertex(-1, -1), vertex(1, -1), vertex(1, 1), vertex(-1, 1)], faces: [[0, 1, 2], [0, 2, 3]],
    uv: [[1, 1], [0, 0], [0, 1], [1, 0]], uvFaces: [[1, 3, 0], [1, 0, 2]] };
}
function particle(asset: TextureAsset, options: { enabled?: boolean; alpha?: number; blend?: 'normal' | 'additive' } = {}): EffectDocument {
  return { ...makeDocument('empty', 'Texture pixel fixture'), schemaVersion: 3, assets: [asset], layers: [
    { ...makeLayer('single'), count: 1, start: 0, speed: 0, gravity: 0, life: 3, size: 2, endSize: 2,
      position: [0, 0, .7], color: '#ffffff', endColor: '#ffffff', texture: `asset:${asset.id}`,
      alpha: options.alpha ?? 1, endAlpha: options.alpha ?? 1, enabled: options.enabled ?? true, blend: options.blend ?? 'normal' },
  ] };
}

test('own RGBA textures preserve orientation, soft alpha, UV indices and human edits through production UI and headless render', { timeout: 180_000 }, async () => {
  const port = 14343, origin = `http://127.0.0.1:${port}`, output = resolve('output/textures-acceptance');
  const dataDir = await mkdtemp(join(tmpdir(), 'nwn-vfx-texture-browser-'));
  const render = createRenderer(origin), app = await createApp({ dataDir, port, webDir: resolve('dist/web'), render });
  await app.listen({ host: '127.0.0.1', port }); await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors: string[] = [], report: Record<string, unknown> = { passed: false, nativeVerified: false, consoleErrors: errors };
  let releaseUpload = () => {};
  const watch = (page: Page) => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  };
  const call = async (operation: string, input: Record<string, unknown>) => {
    const response = await fetch(origin + '/api/commands', { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer ' + app.studio.config.ownerToken,
    }, body: JSON.stringify({ operation, input, idempotencyKey: randomUUID() }) });
    const result: any = await response.json(); assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data;
  };
  try {
    const png = orientationTexture(), asset = createTextureAsset('orientation-soft.png', Buffer.from(png).toString('base64'));
    const pngPath = join(output, 'orientation-soft.png'); await writeFile(pngPath, png);
    report.assetId = asset.id; report.inputSha256 = sha256(png); report.browserVersion = browser.version();
    const decodePage = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 }); watch(decodePage);
    await decodePage.goto(origin + '/render', { waitUntil: 'domcontentloaded' });
    await decodePage.waitForFunction(() => typeof window.studioRender === 'function');
    const captures: Array<Record<string, unknown>> = []; report.captures = captures;
    const capture = async (name: string, document: EffectDocument, frameTime = time) => {
      const result = await render(document, { time: frameTime, format: 'png', signal: new AbortController().signal });
      const bytes = result.files[0].data; await writeFile(join(output, name + '.png'), bytes);
      const image = await imagePixels(decodePage, bytes);
      captures.push({ name, document, time: frameTime, pngSha256: sha256(bytes), rgbaSha256: sha256(image.pixels) });
      return image;
    };
    const baseline = await capture('baseline', particle(asset, { enabled: false }));
    const emitter = await capture('emitter-normal', particle(asset));
    const meshDocument: EffectDocument = { ...particle(asset), layers: [{ ...makeMeshLayer('quad'), texture: `asset:${asset.id}`,
      geometry: facingQuad(), position: [0, 0, .7], color: '#ffffff', alpha: 1, blend: 'normal' }] };
    const mesh = await capture('mesh-uv', meshDocument);
    const diameter = 640 / (Math.tan(39 * Math.PI / 360) * Math.hypot(3.4, 5.4, 2.05));
    const point = (u:number,v:number):[number,number] => [Math.round(480+(u-.5)*diameter),Math.round(320+(v-.5)*diameter)];
    const samples = [
      { name: 'top-left', u: .25, v: .25, rgb: [255, 32, 16] as RGB },
      { name: 'top-right', u: .75, v: .25, rgb: [32, 255, 16] as RGB },
      { name: 'bottom-left', u: .25, v: .75, rgb: [16, 32, 255] as RGB },
      { name: 'bottom-right', u: .75, v: .75, rgb: [255, 210, 24] as RGB },
    ].map(s => ({...s,x:point(s.u,s.v)[0],y:point(s.u,s.v)[1]}));
    for (const [name, image] of [['emitter', emitter], ['mesh', mesh]] as const) {
      for (const sample of samples) closeColor(pixel(image, sample.x, sample.y), sample.rgb, 3, name + ' ' + sample.name);
      const soft = pixel(image, ...point(.08,.25)), background = pixel(baseline, ...point(.08,.25));
      assert.ok(soft[0] > background[0] + 40 && soft[0] < 220, name + ': source soft alpha must survive sampling');
      assert.ok(pixel(image, ...point(.04,.25))[0] < soft[0] && soft[0] < pixel(image, ...point(.13,.25))[0], name + ': alpha edge must be gradual');
      closeColor(pixel(image, ...point(-.04,.25)), pixel(baseline, ...point(-.04,.25)), 0, name + ': outside texture is background');
    }
    const faded = await capture('emitter-alpha-half', particle(asset, { alpha: .5 }));
    for (const sample of samples) {
      const base = pixel(baseline, sample.x, sample.y);
      closeColor(pixel(faded, sample.x, sample.y), sample.rgb.map((value, channel) => value * .5 + base[channel] * .5) as RGB, 3, 'Layer alpha multiplies image alpha');
    }
    const additive = await capture('emitter-additive', particle(asset, { blend: 'additive', alpha: .5 }));
    const additiveSample = samples[2], base = pixel(baseline, additiveSample.x, additiveSample.y);
    closeColor(pixel(additive, additiveSample.x, additiveSample.y), additiveSample.rgb.map((value, channel) => Math.min(255, value * .5 + base[channel])) as RGB, 3, 'Custom additive blending');
    samePixels(await capture('emitter-alpha-zero', particle(asset, { alpha: 0 })), baseline, 'Alpha zero must not alter the image');
    report.orientation = samples.map(sample => ({ ...sample, emitter: pixel(emitter, sample.x, sample.y), mesh: pixel(mesh, sample.x, sample.y) }));
    report.softAlpha = { emitter: pixel(emitter, ...point(.08,.25)), mesh: pixel(mesh, ...point(.08,.25)) };

    // Midpoint data must affect the shipped renderer, not only survive saving.
    // Life equals the authored one second for every seed; the middle key is
    // reached exactly at .4 seconds, independently of birth/direction seeds.
    const whiteAsset = createTextureAsset('age-white.png', Buffer.from(rgbaPng(32, 32, () => [255, 255, 255, 255])).toString('base64'));
    const ageDocument = particle(whiteAsset);
    Object.assign(ageDocument.layers[0], { life: 1, color: '#ff0000', midColor: '#00ff00', endColor: '#0000ff',
      size: .5, midSize: 2, endSize: .5, alpha: .5, midAlpha: .8, endAlpha: .5, midPercent: .4 });
    const phases = [await capture('age-start', ageDocument, 0), await capture('age-middle', ageDocument, .4), await capture('age-end', ageDocument, .83)];
    const coloredPixels = (frame: Frame) => {
      let count = 0;
      for (let offset = 0; offset < frame.pixels.length; offset += 4) {
        if ([0, 1, 2].some(channel => Math.abs(frame.pixels[offset + channel] - baseline.pixels[offset + channel]) > 20)) count++;
      }
      return count;
    };
    const ageColors = phases.map(frame => pixel(frame, 480, 320)), ageAreas = phases.map(coloredPixels);
    for (const [phase, dominant] of [0, 1, 2].entries()) assert.ok(ageColors[phase][dominant] > Math.max(...ageColors[phase].filter((_value, channel) => channel !== dominant)) + 25,
      `Particle phase ${phase} must use its start/mid/end color`);
    assert.ok(ageAreas[1] > ageAreas[0] * 4 && ageAreas[1] > ageAreas[2] * 1.5, 'The larger midSize must expand the particle around middle age');
    report.particleAge = { times: [0, .4, .83], colors: ageColors, visibleAreas: ageAreas, midPercent: .4 };

    const project = await call('projects.create', { preset: 'empty', name: 'Human texture acceptance' });
    const ui = await browser.newPage({ viewport: { width: 1468, height: 1100 }, deviceScaleFactor: 1 }); watch(ui);
    await ui.goto(origin, { waitUntil: 'domcontentloaded' }); await ui.getByText('rewizja 1', { exact: true }).waitFor();
    await ui.getByRole('button', { name: 'Zatrzymaj', exact: true }).click();
    await ui.getByRole('slider', { name: 'Czas podglądu', exact: true }).fill(String(time));
    let commitUpload!: (result: any) => void, held = false;
    const committed = new Promise<any>(resolve => { commitUpload = resolve; });
    const gate = new Promise<void>(resolve => { releaseUpload = resolve; });
    await ui.route('**/api/commands', async route => {
      if (held || route.request().postDataJSON()?.operation !== 'assets.import') { await route.continue(); return; }
      held = true; const response = await route.fetch(); commitUpload(await response.json()); await gate; await route.fulfill({ response });
    });
    await ui.getByLabel('Plik tekstury PNG', { exact: true }).setInputFiles(pngPath);
    const imported = await committed; assert.equal(imported.status, 'ok'); assert.equal(imported.data.assetId, asset.id);
    await ui.getByRole('slider', { name: 'Rozmiar początkowy', exact: true }).fill('0.2');
    releaseUpload(); await ui.getByRole('status').filter({ hasText: 'Tekstura zaimportowana' }).waitFor();
    await ui.getByText('Niezapisane zmiany', { exact: true }).waitFor();
    assert.equal(await ui.getByRole('slider', { name: 'Rozmiar początkowy', exact: true }).inputValue(), '0.2');
    let saved = await call('projects.inspect', { projectId: project.id });
    assert.equal(saved.document.layers[0].size, .055, 'Import must not persist a later human draft');
    assert.equal(saved.document.assets[0].pngBase64, asset.pngBase64);
    assert.equal(await ui.getByRole('button', { name: 'Importuj PNG', exact: true }).isDisabled(), true);
    await ui.getByRole('combobox', { name: 'Tekstura', exact: true }).selectOption(`asset:${asset.id}`);
    await ui.getByRole('combobox', { name: 'Mieszanie', exact: true }).selectOption('normal');
    await ui.getByRole('button', { name: 'Zapisz', exact: true }).click(); await ui.getByText('rewizja 3', { exact: true }).waitFor();
    saved = await call('projects.inspect', { projectId: project.id });
    assert.equal(saved.document.layers[0].texture, `asset:${asset.id}`); assert.equal(saved.document.layers[0].size, .2);
    await ui.reload(); await ui.getByText('rewizja 3', { exact: true }).waitFor();
    assert.equal(await ui.getByRole('combobox', { name: 'Tekstura', exact: true }).inputValue(), `asset:${asset.id}`);
    await ui.getByRole('button', { name: 'Zatrzymaj', exact: true }).click();
    await ui.getByRole('slider', { name: 'Czas podglądu', exact: true }).fill(String(time));
    await ui.getByRole('button', { name: 'Dodaj geometrię', exact: true }).click();
    await ui.getByRole('combobox', { name: 'Kształt geometrii', exact: true }).selectOption('custom');
    await ui.getByText('Geometria JSON', { exact: true }).click();
    const geometry = facingQuad(), invalid = { ...geometry, uvFaces: [[1, 3, 99], [1, 0, 2]] };
    const jsonEditor = ui.getByRole('textbox', { name: 'Geometria JSON', exact: true });
    await jsonEditor.fill(JSON.stringify(invalid));
    await ui.getByRole('button', { name: 'Zastosuj geometrię', exact: true }).click();
    await ui.getByRole('alert').filter({ hasText: 'Niepoprawny indeks UV' }).waitFor();
    assert.equal(await ui.getByRole('button', { name: 'Importuj PNG', exact: true }).isDisabled(), true);
    assert.equal(await ui.getByRole('button', { name: 'Zapisz', exact: true }).isDisabled(), true);
    await jsonEditor.fill(JSON.stringify(geometry)); await ui.getByRole('button', { name: 'Zastosuj geometrię', exact: true }).click();
    await ui.getByRole('combobox', { name: 'Tekstura', exact: true }).selectOption(`asset:${asset.id}`);
    await ui.getByRole('combobox', { name: 'Mieszanie', exact: true }).selectOption('additive');
    await ui.getByRole('button', { name: 'Zapisz', exact: true }).click(); await ui.getByText('rewizja 4', { exact: true }).waitFor();
    saved = await call('projects.inspect', { projectId: project.id });
    let savedMesh = saved.document.layers.find((layer: any) => layer.type === 'mesh');
    assert.equal(saved.document.schemaVersion, 3); assert.deepEqual(savedMesh.geometry, geometry);
    assert.equal(savedMesh.texture, `asset:${asset.id}`); assert.equal(savedMesh.blend, 'additive');

    // Compare the real editor canvas and headless rendering of its saved snapshot.
    await ui.evaluate(async () => { await document.fonts.ready; });
    const canvas = ui.locator('.stage-canvas canvas');
    for (let attempt = 0; attempt < 3; attempt++) {
      await nextPaint(ui); const size = await canvas.evaluate((node: HTMLCanvasElement) => [node.width, node.height]);
      if (size[0] === width && size[1] === height) break;
      const viewport = ui.viewportSize()!; await ui.setViewportSize({ width: viewport.width + width - size[0], height: viewport.height + height - size[1] });
    }
    await nextPaint(ui);
    const uiPng = Buffer.from((await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL('image/png'))).split(',')[1], 'base64');
    await writeFile(join(output, 'ui-textures.png'), uiPng);
    samePixels(await imagePixels(decodePage, uiPng), await capture('ui-snapshot-headless', saved.document), 'UI and headless must render the same saved RGBA/UV snapshot');
    await ui.screenshot({ path: join(output, 'editor-textures.png'), fullPage: true });

    await ui.getByRole('combobox', { name: 'Tekstura', exact: true }).selectOption('');
    await ui.getByRole('button', { name: 'Zapisz', exact: true }).click(); await ui.getByText('rewizja 5', { exact: true }).waitFor();
    saved = await call('projects.inspect', { projectId: project.id }); savedMesh = saved.document.layers.find((layer: any) => layer.type === 'mesh');
    assert.equal(savedMesh.texture, undefined, 'Clear mesh texture must remove the optional field');
    assert.equal(saved.document.assets[0].id, asset.id, 'Clearing a use does not delete its immutable resource');
    await ui.getByRole('button', { name: 'Zaznacz na osi czasu: Iskry', exact: true }).click();
    await ui.getByRole('slider', { name: 'Punkt środkowy wieku', exact: true }).fill('35.5');
    await ui.getByRole('slider', { name: 'Rozmiar środkowy', exact: true }).fill('0.44');
    await ui.getByRole('slider', { name: 'Przezroczystość · środek', exact: true }).fill('0.37');
    await ui.getByLabel('Kolor środkowy', { exact: true }).evaluate((input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#20ff40');
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await ui.getByRole('button', { name: 'Zapisz', exact: true }).click(); await ui.getByText('rewizja 6', { exact: true }).waitFor();
    saved = await call('projects.inspect', { projectId: project.id });
    assert.deepEqual(['midPercent', 'midSize', 'midAlpha', 'midColor'].map(key => saved.document.layers[0][key]), [.355, .44, .37, '#20ff40']);
    await ui.getByRole('button', { name: 'Przywróć automatyczny środek', exact: true }).click();
    await ui.getByRole('button', { name: 'Zapisz', exact: true }).click(); await ui.getByText('rewizja 7', { exact: true }).waitFor();
    saved = await call('projects.inspect', { projectId: project.id });
    for (const key of ['midColor', 'midAlpha', 'midSize']) assert.equal(saved.document.layers[0][key], undefined);
    assert.equal(saved.document.layers[0].midPercent, .355);
    await ui.getByRole('button', { name: 'Zablokuj warstwę', exact: true }).click();
    assert.equal(await ui.getByRole('combobox', { name: 'Tekstura', exact: true }).isDisabled(), true);
    assert.equal(await ui.getByRole('combobox', { name: 'Mieszanie', exact: true }).isDisabled(), true);
    assert.equal(await ui.getByRole('slider', { name: 'Punkt środkowy wieku', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
    report.ui = { projectId: project.id, revision: saved.revision, importRebasePassed: true, pendingUvProtected: true,
      meshTextureClearPassed: true, midpointsAndResetPassed: true, locksPassed: true, uiHeadlessPixelIdentical: true };

    // Normalization is explicit. The same non-POT upload first fails without
    // changing the project, then becomes a centered immutable texture.
    const sourceWidth = 30, sourceHeight = 18;
    const nonPotPng = rgbaPng(sourceWidth, sourceHeight, (x, y) => {
      const rgb = y < sourceHeight / 2 ? (x < sourceWidth / 2 ? [255,32,16] : [32,255,16]) : (x < sourceWidth / 2 ? [16,32,255] : [255,210,24]);
      const alpha = Math.round(255 * Math.min(1, Math.min(x, y, sourceWidth - 1 - x, sourceHeight - 1 - y) / 2));
      return [...rgb, alpha] as [number, number, number, number];
    });
    const nonPotPath = join(output, 'orientation-non-pot.png'); await writeFile(nonPotPath, nonPotPng);
    const normalizedProject = await call('projects.create', { preset: 'empty', name: 'Human PNG normalization acceptance' });
    const normalizeUi = await browser.newPage({ viewport: { width: 1468, height: 1100 }, deviceScaleFactor: 1 }); watch(normalizeUi);
    await normalizeUi.goto(origin, { waitUntil: 'domcontentloaded' });
    await normalizeUi.getByRole('combobox', { name: 'Projekt', exact: true }).selectOption(normalizedProject.id);
    await normalizeUi.getByText('rewizja 1', { exact: true }).waitFor();
    assert.equal(await normalizeUi.getByRole('combobox', { name: 'Rozmiar importu', exact: true }).inputValue(), '', 'Import must default to strict, byte-preserving mode');
    const importResponse = () => normalizeUi.waitForResponse(response => response.url().endsWith('/api/commands') && response.request().postDataJSON()?.operation === 'assets.import');
    const failedImportPromise = importResponse();
    await normalizeUi.getByLabel('Plik tekstury PNG', { exact: true }).setInputFiles(nonPotPath);
    const failedImport = await (await failedImportPromise).json();
    assert.equal(failedImport.status, 'failed'); assert.equal(failedImport.error.code, 'INVALID_TEXTURE');
    await normalizeUi.getByRole('alert').filter({ hasText: 'potęgami dwóch' }).waitFor();
    const afterRejected = await call('projects.inspect', { projectId: normalizedProject.id });
    assert.equal(afterRejected.revision, 1); assert.deepEqual(afterRejected.document.assets || [], []);
    const normalizedProof: Array<Record<string, unknown>> = [];
    for (const targetSize of [512, 1024] as const) {
      await normalizeUi.getByRole('combobox', { name: 'Rozmiar importu', exact: true }).selectOption(String(targetSize));
      await normalizeUi.getByText(`Zachowamy proporcje i wyśrodkujemy obraz na przezroczystym tle ${targetSize}×${targetSize}. Obraz może zostać powiększony lub pomniejszony.`, { exact: true }).waitFor();
      const importedPromise = importResponse();
      await normalizeUi.getByLabel('Plik tekstury PNG', { exact: true }).setInputFiles(nonPotPath);
      const importedResult = await (await importedPromise).json();
      assert.equal(importedResult.status, 'ok', JSON.stringify(importedResult.error));
      await normalizeUi.getByText(`rewizja ${targetSize === 512 ? 2 : 4}`, { exact: true }).waitFor();
      const normalizedAsset = importedResult.data.project.document.assets.find((item: TextureAsset) => item.id === importedResult.data.assetId) as TextureAsset;
      const contentHeight = Math.round(sourceHeight * targetSize / sourceWidth), offsetY = Math.floor((targetSize - contentHeight) / 2);
      assert.deepEqual([normalizedAsset.width, normalizedAsset.height], [targetSize, targetSize]);
      assert.deepEqual(normalizedAsset.source.normalization, { version: 1, method: 'bilinear', colorSpace: 'linear-srgb', alphaMode: 'premultiplied',
        originalSha256: sha256(nonPotPng), originalWidth: sourceWidth, originalHeight: sourceHeight, originalColorType: 6,
        targetSize, contentWidth: targetSize, contentHeight, offsetX: 0, offsetY });
      const normalizedBytes = Buffer.from(normalizedAsset.pngBase64, 'base64');
      assert.equal(normalizedAsset.id, sha256(normalizedBytes)); assert.equal(normalizedAsset.source.sha256, normalizedAsset.id);
      assert.notEqual(normalizedAsset.id, sha256(nonPotPng));
      await writeFile(join(output, `normalized-${targetSize}.png`), normalizedBytes);
      const decoded = await imagePixels(decodePage, normalizedBytes);
      for (const y of [0, offsetY - 1, offsetY + contentHeight, targetSize - 1])
        assert.equal(decoded.pixels[(y * targetSize + targetSize / 2) * 4 + 3], 0, 'Padding must remain transparent');
      for (const [index, quadrant] of samples.entries()) {
        const x = Math.floor(targetSize * (index % 2 ? .75 : .25));
        const y = offsetY + Math.floor(contentHeight * (index < 2 ? .25 : .75));
        closeColor(pixel(decoded, x, y), quadrant.rgb, 1, `Normalized ${targetSize} ${quadrant.name}`);
      }
      await normalizeUi.getByRole('combobox', { name: 'Tekstura', exact: true }).selectOption(`asset:${normalizedAsset.id}`);
      await normalizeUi.getByRole('button', { name: 'Zapisz', exact: true }).click();
      await normalizeUi.getByText(`rewizja ${targetSize === 512 ? 3 : 5}`, { exact: true }).waitFor();
      const provenance = normalizeUi.locator('.texture-inspector > .texture-provenance');
      if (!await provenance.evaluate((node: HTMLDetailsElement) => node.open)) await provenance.locator('summary').click();
      await provenance.getByText(sha256(nonPotPng), { exact: true }).waitFor();
      await provenance.getByText(normalizedAsset.id, { exact: true }).waitFor();
      await provenance.getByText(`${sourceWidth}×${sourceHeight} → ${targetSize}×${targetSize}; obraz ${targetSize}×${contentHeight}, margines od lewej 0 px i od góry ${offsetY} px.`, { exact: true }).waitFor();
      if (targetSize === 512) {
        const normalizedFrame = await capture('normalized-emitter', particle(normalizedAsset));
        for (const [index, quadrant] of samples.entries()) closeColor(pixel(normalizedFrame, quadrant.x, index < 2 ? 292 : 348), quadrant.rgb, 3, `Normalized rendered ${quadrant.name}`);
        closeColor(pixel(normalizedFrame, 432, 240), pixel(baseline, 432, 240), 0, 'Rendered padding must preserve background');
        await normalizeUi.screenshot({ path: join(output, 'editor-normalization.png'), fullPage: true });
      }
      normalizedProof.push({ assetId: normalizedAsset.id, pngSha256: sha256(normalizedBytes), ...normalizedAsset.source.normalization });
    }
    const rgbSource = rgbPng(16, 8, () => [96,128,160]), rgbPath = join(output, 'rgb-metal.png');
    await writeFile(rgbPath, rgbSource);
    assert.equal(rgbSource[25], 2, 'The RGB fixture must have no alpha channel');
    await normalizeUi.getByRole('combobox', { name: 'Rozmiar importu', exact: true }).selectOption('');
    const strictRgbPromise = importResponse();
    await normalizeUi.getByLabel('Plik tekstury PNG', { exact: true }).setInputFiles(rgbPath);
    const strictRgb = await (await strictRgbPromise).json();
    assert.equal(strictRgb.status, 'failed'); assert.equal(strictRgb.error.code, 'INVALID_TEXTURE');
    assert.equal((await call('projects.inspect', { projectId: normalizedProject.id })).revision, 5, 'Strict RGB rejection must not commit');
    await normalizeUi.getByRole('combobox', { name: 'Rozmiar importu', exact: true }).selectOption('512');
    const rgbImportPromise = importResponse();
    await normalizeUi.getByLabel('Plik tekstury PNG', { exact: true }).setInputFiles(rgbPath);
    const rgbImported = await (await rgbImportPromise).json();
    assert.equal(rgbImported.status, 'ok', JSON.stringify(rgbImported.error));
    await normalizeUi.getByText('rewizja 6', { exact: true }).waitFor();
    const rgbAsset = rgbImported.data.project.document.assets.find((item: TextureAsset) => item.id === rgbImported.data.assetId) as TextureAsset;
    assert.equal(rgbAsset.source.normalization?.originalColorType, 2); assert.equal(rgbAsset.source.normalization?.originalSha256, sha256(rgbSource));
    assert.deepEqual([rgbAsset.width, rgbAsset.height, rgbAsset.source.normalization?.contentWidth, rgbAsset.source.normalization?.contentHeight,
      rgbAsset.source.normalization?.offsetX, rgbAsset.source.normalization?.offsetY], [512,512,512,256,0,128]);
    const rgbOutput = Buffer.from(rgbAsset.pngBase64, 'base64'), rgbDecoded = await imagePixels(decodePage, rgbOutput);
    assert.equal(rgbOutput[25], 6, 'Normalized PNG must have an RGBA channel layout');
    assert.equal(rgbAsset.id, sha256(rgbOutput));
    for (const y of [128, 256, 383]) for (const x of [0, 256, 511]) {
      closeColor(pixel(rgbDecoded, x, y), [96,128,160], 0, 'RGB conversion must preserve color');
      assert.equal(rgbDecoded.pixels[(y * 512 + x) * 4 + 3], 255, 'RGB content must receive full alpha');
    }
    for (const y of [0, 127, 384, 511]) assert.equal(rgbDecoded.pixels[(y * 512 + 256) * 4 + 3], 0, 'RGB padding must remain transparent');
    await writeFile(join(output, 'normalized-rgb-512.png'), rgbOutput);
    await normalizeUi.getByRole('combobox', { name: 'Tekstura', exact: true }).selectOption(`asset:${rgbAsset.id}`);
    await normalizeUi.getByRole('button', { name: 'Zapisz', exact: true }).click(); await normalizeUi.getByText('rewizja 7', { exact: true }).waitFor();
    const rgbProvenance = normalizeUi.locator('.texture-inspector > .texture-provenance');
    if (!await rgbProvenance.evaluate((node: HTMLDetailsElement) => node.open)) await rgbProvenance.locator('summary').click();
    await rgbProvenance.getByText('RGB8; dodano pełną alpha (255).', { exact: true }).waitFor();
    report.normalization = { strictRejected: true, rejectionPreservedRevision: true, metadataVisible: true, normalized: normalizedProof,
      rgb: { strictRejected: true, assetId: rgbAsset.id, pngSha256: sha256(rgbOutput), ...rgbAsset.source.normalization, contentAlpha: 255, paddingAlpha: 0 } };
    assert.deepEqual(errors, []);
    report.passed = true;
  } catch (error) { report.failure = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    releaseUpload(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close(); await app.close();
    const safe = resolve(dataDir); assert.equal(dirname(safe), resolve(tmpdir())); assert.ok(basename(safe).startsWith('nwn-vfx-texture-browser-'));
    await rm(safe, { recursive: true, force: true });
  }
});
