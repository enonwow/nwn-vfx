import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { encodeWebmFrames, VIDEO_FPS } from '../apps/service/src/video-encoder.js';
import { assertDocument } from '../packages/contracts/src/schema.js';
import { texturedVideoDocument } from './fixtures/textured-video.js';

const run = promisify(execFile), ffmpeg = process.env.NWN_VFX_FFMPEG || 'ffmpeg';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
type Counters = Record<string, number>;
async function decode(path: string, frame?: number): Promise<Buffer> {
  return (await run(ffmpeg, ['-v', 'error', '-i', path, ...(frame === undefined ? [] : ['-vf', `select=eq(n\\,${frame})`]),
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
  { windowsHide: true, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 })).stdout;
}
function cyanBounds(rgb: Buffer) {
  assert.equal(rgb.length, 960 * 640 * 3);
  let count = 0, xSum = 0, ySum = 0;
  for (let offset = 0; offset < rgb.length; offset += 3) {
    const [r, g, b] = [rgb[offset], rgb[offset + 1], rgb[offset + 2]];
    if (g > 100 && b > 100 && g > r * 1.6 && b > r * 1.6) {
      count++; xSum += offset / 3 % 960; ySum += Math.floor(offset / 3 / 960);
    }
  }
  assert.ok(count > 100, 'The textured moving marker must be clearly visible');
  return { count, x: xSum / count, y: ySum / count };
}

test('five textured PNG jobs followed by 120-frame WebM preserve phases and reuse the 32-layer GPU scene', { timeout: 240_000 }, async () => {
  const document = texturedVideoDocument(); assertDocument(document);
  assert.equal(document.layers.length, 32); assert.deepEqual(document.assets!.map(asset => [asset.width, asset.height]), [[1024,1024],[512,512],[512,512]]);
  const dataDir = await mkdtemp(join(tmpdir(), 'nwn-vfx-textured-video-'));
  const output = resolve('output/playwright/textured-video-acceptance'); await mkdir(output, { recursive: true });
  const app = await createApp({ dataDir, port: 14348, webDir: resolve('dist/web') });
  const origin = await app.listen({ host: '127.0.0.1', port: 14348 });
  const browsers = new Set<Browser>(), errors: string[] = [], samples: Array<{ index: number; counters: Counters }> = [];
  let page: Page | undefined;
  const report: Record<string, unknown> = { passed: false, nativeVerified: false, errors, duration: 4, frameCount: 120,
    layerCount: document.layers.length, assets: document.assets!.map(({ id, width, height, pngBase64 }) => ({ id, width, height, bytes: Buffer.from(pngBase64, 'base64').length })) };
  const render = createRenderer(origin, {
    // The injected launch still starts real Chromium and production /render.
    // Observe WebGL API calls without exposing diagnostics in the product UI.
    launch: async options => {
      const browser = await chromium.launch(options); browsers.add(browser); browser.on('disconnected', () => browsers.delete(browser));
      const newPage = browser.newPage.bind(browser);
      browser.newPage = async options => {
        page = await newPage(options);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.addInitScript(() => {
          const counters: Record<string, number> = {}, prototype = WebGL2RenderingContext.prototype as any;
          (window as any).__texturedVideoCounters = counters;
          for (const method of ['createTexture', 'texImage2D', 'texStorage2D', 'texSubImage2D', 'createBuffer', 'bufferData', 'bufferSubData', 'drawElements', 'drawArrays']) {
            const original = prototype[method]; counters[method] = 0;
            prototype[method] = function (...args: unknown[]) { counters[method]++; return original.apply(this, args); };
          }
        });
        return page;
      };
      return browser;
    },
    encodeWebmFrames: async options => {
      const video = await encodeWebmFrames({ ...options, frame: async index => {
        const png = await options.frame(index);
        samples.push({ index, counters: await page!.evaluate(() => ({ ...(window as any).__texturedVideoCounters })) });
        return png;
      } });
      const before = await page!.evaluate(() => ({ ...(window as any).__texturedVideoCounters })) as Counters;
      await new Promise(resolve => setTimeout(resolve, 80));
      const after = await page!.evaluate(() => ({ ...(window as any).__texturedVideoCounters })) as Counters;
      assert.deepEqual(after, before, 'A render-only page must have no perpetual RAF/WebGL work after its last requested frame');
      report.idleRenderPageStable = true;
      return video;
    },
  });
  try {
    const indices = [6,24,36,75,114], phases: Array<{ index: number; time: number; path: string; sha256: string; seconds: number }> = [];
    for (const index of indices) {
      const started = performance.now(), time = index / VIDEO_FPS;
      const result = await render(document, { format: 'png', time, signal: new AbortController().signal });
      const path = join(output, `phase-${index}.png`); await writeFile(path, result.files[0].data);
      phases.push({ index, time, path, sha256: sha256(result.files[0].data), seconds: (performance.now() - started) / 1000 });
      assert.equal(browsers.size, 0, 'Each completed PNG job must close its browser');
    }
    const started = performance.now(), result = await render(document, { format: 'webm', time: .8, signal: new AbortController().signal });
    report.webmSeconds = (performance.now() - started) / 1000;
    assert.equal(browsers.size, 0, 'The completed video job must close its browser');
    const videoPath = join(output, 'textured-120-frames.webm'); await writeFile(videoPath, result.files[0].data);
    report.videoSha256 = sha256(result.files[0].data); report.videoBytes = result.files[0].data.length;
    const timeline = JSON.parse((await run('ffprobe', ['-v','error','-select_streams','v:0',
      '-show_entries','frame=best_effort_timestamp_time:stream=codec_name,r_frame_rate,width,height:format=duration','-of','json',videoPath],
    { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout);
    const times: number[] = timeline.frames.map((frame: any) => Number(frame.best_effort_timestamp_time));
    assert.equal(times.length, 120); assert.equal(times[0], 0); assert.equal(Number(timeline.format.duration), 4);
    assert.equal(timeline.streams[0].r_frame_rate, '30/1'); assert.equal(timeline.streams[0].codec_name, 'vp9');
    assert.deepEqual([timeline.streams[0].width, timeline.streams[0].height], [960,640]);
    times.forEach((time, index) => assert.ok(Math.abs(time - index / VIDEO_FPS) <= .00051, `Wrong PTS at ${index}: ${time}`));
    report.times = times;
    assert.deepEqual(samples.map(sample => sample.index), Array.from({ length: 120 }, (_, index) => index));
    const allocationCalls = ['createTexture','texImage2D','texStorage2D','texSubImage2D','createBuffer','bufferData'];
    assert.ok(samples[0].counters.createTexture >= 3); assert.ok(samples[0].counters.createBuffer >= 32);
    assert.ok(samples[119].counters.bufferSubData > samples[0].counters.bufferSubData, 'Actual particle data must advance across frames');
    for (const sample of samples) for (const method of allocationCalls)
      assert.equal(sample.counters[method], samples[0].counters[method], `Frame ${sample.index} unexpectedly reallocates/uploads ${method}`);
    report.resources = { first: samples[0], last: samples[119], unchangedAllocationCalls: allocationCalls };
    const comparisons: unknown[] = [], locations: number[] = [];
    for (const phase of phases) {
      const [reference, video] = await Promise.all([decode(phase.path), decode(videoPath, phase.index)]);
      const expected = cyanBounds(reference), actual = cyanBounds(video); locations.push(expected.x);
      assert.ok(Math.abs(actual.x - expected.x) < 2 && Math.abs(actual.y - expected.y) < 2, `Video frame ${phase.index} has the wrong animation phase`);
      assert.ok(Math.abs(actual.count - expected.count) / expected.count < .12, 'The textured marker footprint must match the phase PNG');
      let error = 0; for (let offset = 0; offset < video.length; offset++) error += Math.abs(video[offset] - reference[offset]);
      const meanAbsoluteError = error / video.length; assert.ok(meanAbsoluteError < 4, 'Decoded WebM must retain the PNG scene within codec loss');
      comparisons.push({ ...phase, expected, actual, meanAbsoluteError });
    }
    assert.ok(Math.max(...locations) - Math.min(...locations) > 30, 'Phase comparisons must include real motion, not static or blank frames');
    assert.deepEqual(errors, []); report.comparisons = comparisons; report.passed = true;
  } catch (error) { report.failure = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    await writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
    await Promise.all([...browsers].map(browser => browser.close())); await app.close();
    const safe = resolve(dataDir); assert.equal(dirname(safe), resolve(tmpdir())); assert.ok(basename(safe).startsWith('nwn-vfx-textured-video-'));
    await rm(safe, { recursive: true, force: true });
  }
});
