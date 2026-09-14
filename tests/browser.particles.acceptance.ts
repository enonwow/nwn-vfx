import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { chromium, type Page } from 'playwright';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { makeDocument, makeLayer, type EffectDocument, type EmitterLayer } from '../packages/core/src/model.js';
import { assertDocument } from '../packages/contracts/src/schema.js';

type Pixels = { width: number; height: number; rgba: Buffer };
type RGB = [number, number, number];
const textures = ['smoke', 'glow', 'spark'] as const;
const source: RGB = [255, 128, 64];
const frameTime = .2;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function particleDocument(texture: EmitterLayer['texture'], values: Partial<EmitterLayer> = {}): EffectDocument {
  const document = makeDocument('empty', `Single ${texture}`);
  document.layers = [{ ...makeLayer('single'), texture, count: 1, start: 0, life: 3, speed: 0, gravity: 0,
    size: 2, endSize: 2, position: [0, 0, .7], color: '#ff8040', endColor: '#ff8040', alpha: 1, endAlpha: 1, ...values }];
  assertDocument(document);
  return document;
}

// Decode the delivered PNG with the browser's image decoder, not a shader mock
// or a new PNG dependency. Transfer RGBA as base64 to avoid millions of JSON numbers.
async function decodePng(page: Page, png: Uint8Array): Promise<Pixels> {
  const decoded = await page.evaluate(async base64 => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const chunks: string[] = [];
    for (let offset = 0; offset < rgba.length; offset += 32768) chunks.push(String.fromCharCode(...rgba.subarray(offset, offset + 32768)));
    return { width: canvas.width, height: canvas.height, base64: btoa(chunks.join('')) };
  }, Buffer.from(png).toString('base64'));
  return { width: decoded.width, height: decoded.height, rgba: Buffer.from(decoded.base64, 'base64') };
}

function pixel(frame: Pixels, x: number, y: number): RGB {
  const offset = (y * frame.width + x) * 4;
  return [frame.rgba[offset], frame.rgba[offset + 1], frame.rgba[offset + 2]];
}

function closeRGB(actual: RGB, expected: RGB, tolerance: number, label: string) {
  for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(actual[channel] - expected[channel]) <= tolerance,
    `${label}: channel ${channel}, got ${actual}, expected ${expected} within ${tolerance}`);
}

function comparePixels(actual: Pixels, expected: Pixels, label: string, tolerance = 0) {
  assert.equal(actual.width, expected.width, label + ': width'); assert.equal(actual.height, expected.height, label + ': height');
  let maxDifference = 0, changedPixels = 0;
  for (let offset = 0; offset < actual.rgba.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(actual.rgba[offset + channel] - expected.rgba[offset + channel]);
      maxDifference = Math.max(maxDifference, difference); changed ||= difference > 0;
    }
    if (changed) changedPixels++;
  }
  assert.ok(maxDifference <= tolerance, `${label}: maximum difference ${maxDifference}, ${changedPixels} changed pixels`);
  return { maxDifference, changedPixels };
}

async function settledFrame(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('production particles have defined radial masks, sRGB color, correct alpha and matching UI/headless pixels', { timeout: 180_000 }, async () => {
  const port = 14337, origin = `http://127.0.0.1:${port}`, output = resolve('output/particles-acceptance');
  const dataDir = await mkdtemp(join(tmpdir(), 'nwn-vfx-particles-'));
  const render = createRenderer(origin);
  const app = await createApp({ dataDir, port, webDir: resolve('dist/web'), render });
  await mkdir(output, { recursive: true });
  await app.listen({ host: '127.0.0.1', port });
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors: string[] = [], frames: Array<Record<string, unknown>> = [];
  const report: Record<string, unknown> = { passed: false, recordedAt: new Date().toISOString(), time: frameTime,
    backend: 'Chromium headless / ANGLE SwiftShader', nativeVerified: false, frames, consoleErrors: errors };
  function watch(page: Page) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  }
  async function call(operation: string, input: Record<string, unknown>) {
    const response = await fetch(origin + '/api/commands', { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer ' + app.studio.config.ownerToken,
    }, body: JSON.stringify({ operation, input, idempotencyKey: randomUUID() }) });
    assert.equal(response.status, 200);
    const result: any = await response.json(); assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data;
  }
  try {
    report.health = await (await fetch(origin + '/api/health')).json(); report.browserVersion = browser.version();
    const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 }); watch(page);
    await page.goto(origin + '/render', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.studioRender === 'function');
    report.gpu = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext('webgl2')!;
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    assert.match(String(report.gpu), /SwiftShader/i);

    async function capture(name: string, document: EffectDocument): Promise<Pixels> {
      // Exercise the real service renderer, which starts its own browser against
      // the production dist/web. The observed render page independently checks
      // the same shipped callback for WebGL/JavaScript errors and pixel parity.
      const rendered = await render(document, { time: frameTime, format: 'png', signal: new AbortController().signal });
      const png = rendered.files.find(file => file.name === 'preview.png')?.data; assert.ok(png);
      await writeFile(join(output, name + '.png'), png);
      const frame = await decodePng(page, png);
      assert.equal(frame.width, 960); assert.equal(frame.height, 640);
      await page.evaluate(async ({ document, time }) => { await window.studioRender!(document, time); }, { document, time: frameTime });
      const routePng = await page.locator('canvas').screenshot({ type: 'png' });
      const routePixels = await decodePng(page, routePng);
      const parity = comparePixels(routePixels, frame, name + ': render route versus service renderer');
      frames.push({ name, path: join(output, name + '.png'), document, metadata: rendered.metadata,
        bytes: png.length, pngSha256: sha256(png), rgbaSha256: sha256(frame.rgba), serviceRouteParity: parity });
      assert.deepEqual(errors, [], name + ': production render must have no console errors');
      return frame;
    }

    const baseline = await capture('baseline-disabled', particleDocument('smoke', { enabled: false }));
    // Pinhole geometry: the 2m square is centred on the camera target. Sample
    // relative to its metric radius, independently of the renderer shader.
    const radius = 320 / (Math.tan(39 * Math.PI / 360) * Math.hypot(3.4, 5.4, 2.05));
    const samplePoints = { center: [480, 320], half: [480 + Math.round(radius / 2), 320], edge: [480 + Math.ceil(radius) + 6, 320] } as const;
    const colored = new Map<EmitterLayer['texture'], Pixels>();
    const measurements: Record<string, unknown> = {};
    report.measurements = measurements; report.samplePoints = samplePoints;
    for (const texture of textures) {
      const frame = await capture('single-' + texture, particleDocument(texture)); colored.set(texture, frame);
      const background = pixel(baseline, ...samplePoints.center), center = pixel(frame, ...samplePoints.center);
      const expected = source.map((value, channel) => texture === 'smoke'
        ? value * .48 + background[channel] * .52 : Math.min(255, value + background[channel])) as RGB;
      closeRGB(center, expected, texture === 'smoke' ? 3 : 5, texture + ': center color in output sRGB');
      const radial = Object.fromEntries(Object.entries(samplePoints).map(([name, [x, y]]) => {
        const actual = pixel(frame, x, y), base = pixel(baseline, x, y);
        return [name, { rgb: actual, background: base, gain: actual.reduce((sum, value, channel) => sum + value - base[channel], 0) }];
      })) as Record<string, { rgb: RGB; background: RGB; gain: number }>;
      assert.ok(radial.center.gain > radial.half.gain + 20, texture + ': center must be stronger than half-radius');
      assert.ok(radial.half.gain > radial.edge.gain + 20, texture + ': half-radius must remain visible');
      closeRGB(radial.edge.rgb, radial.edge.background, 3, texture + ': edge must return to background');
      measurements[texture] = { expectedCenter: expected, tolerance: texture === 'smoke' ? 3 : 5, radial };
      const invisible = await capture(texture + '-alpha-zero', particleDocument(texture, { alpha: 0, endAlpha: 0 }));
      comparePixels(invisible, baseline, texture + ': alpha zero must leave every background pixel unchanged');
    }
    const white = await capture('white-spark', particleDocument('spark', { color: '#ffffff', endColor: '#ffffff' }));
    closeRGB(pixel(white, ...samplePoints.center), [255, 255, 255], 5, 'White spark remains visible');
    const repeated = await capture('single-smoke-repeat', particleDocument('smoke'));
    report.deterministicFrame = comparePixels(repeated, colored.get('smoke')!, 'Repeating the same saved frame must be deterministic');

    // Import the same fixture through public operations, then use the real human
    // controls. Match canvas dimensions without replacing production CSS/canvas.
    const fixtureDocument = particleDocument('smoke');
    const project = await call('projects.create', { preset: 'empty', name: fixtureDocument.name });
    await call('changes.apply', { projectId: project.id, expectedRevision: 1, changes: [
      { type: 'layer.remove', layerId: 'sparks' }, { type: 'layer.add', layer: fixtureDocument.layers[0] },
    ] });
    const ui = await browser.newPage({ viewport: { width: 1468, height: 1100 }, deviceScaleFactor: 1, locale: 'pl-PL' }); watch(ui);
    await ui.goto(origin, { waitUntil: 'domcontentloaded' });
    await ui.getByText('rewizja 2', { exact: true }).waitFor();
    await ui.getByRole('button', { name: 'Zatrzymaj', exact: true }).click();
    await ui.getByRole('slider', { name: 'Czas podglądu', exact: true }).fill(String(frameTime));
    await ui.evaluate(async () => { await document.fonts.ready; });
    const uiCanvas = ui.locator('.stage-canvas canvas');
    for (let attempt = 0; attempt < 3; attempt++) {
      await settledFrame(ui);
      const size = await uiCanvas.evaluate((node: HTMLCanvasElement) => ({ width: node.width, height: node.height }));
      if (size.width === 960 && size.height === 640) break;
      const viewport = ui.viewportSize()!;
      await ui.setViewportSize({ width: viewport.width + 960 - size.width, height: viewport.height + 640 - size.height });
    }
    await settledFrame(ui);
    assert.deepEqual(await uiCanvas.evaluate((node: HTMLCanvasElement) => [node.width, node.height]), [960, 640]);
    async function uiPixels(name: string) {
      await settledFrame(ui);
      // Read the actual canvas, excluding text overlays positioned above it.
      const url = await uiCanvas.evaluate((node: HTMLCanvasElement) => node.toDataURL('image/png'));
      const bytes = Buffer.from(url.split(',')[1], 'base64'); await writeFile(join(output, name + '.png'), bytes);
      return decodePng(page, bytes);
    }
    const uiSmoke = await uiPixels('ui-smoke');
    const smokeParity = comparePixels(uiSmoke, colored.get('smoke')!, 'UI smoke versus headless frame', 1);
    await ui.getByRole('button', { name: 'Ukryj Iskry', exact: true }).click();
    comparePixels(await uiPixels('ui-hidden'), baseline, 'Human visibility control must remove the particle', 1);
    await ui.getByRole('button', { name: 'Pokaż Iskry', exact: true }).click();
    await ui.getByRole('combobox', { name: 'Tekstura', exact: true }).selectOption('glow');
    const uiGlow = await uiPixels('ui-glow');
    const glowParity = comparePixels(uiGlow, colored.get('glow')!, 'UI glow versus headless frame', 1);
    await ui.screenshot({ path: join(output, 'editor-glow.png'), fullPage: true });
    report.ui = { projectId: project.id, savedRevision: 2, canvas: [960, 640], time: frameTime,
      smokeParity, glowParity, visibilityTogglePassed: true, glowSource: 'unsaved human texture selection' };
    assert.deepEqual(errors, []);
    report.passed = true;
  } catch (error) {
    report.failure = error instanceof Error ? error.message : String(error); throw error;
  } finally {
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close(); await app.close();
    assert.ok(resolve(dataDir).startsWith(resolve(tmpdir()) + sep) && basename(dataDir).startsWith('nwn-vfx-particles-'));
    await rm(dataDir, { recursive: true, force: true });
  }
});
