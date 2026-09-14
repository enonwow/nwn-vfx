import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { encodeWebmFrames, VIDEO_FPS } from '../apps/service/src/video-encoder.js';
import { DomainError, makeDocument, makeLayer, makeMeshLayer, type EffectDocument } from '../packages/core/src/model.js';

const run = promisify(execFile);
const ffmpeg = process.env.NWN_VFX_FFMPEG || 'ffmpeg';
const probe = async (path: string) => JSON.parse((await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'frame=best_effort_timestamp_time:stream=codec_name,r_frame_rate,width,height:format=duration', '-of', 'json', path],
{ windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout);
function assertTimeline(data: any, frameCount: number) {
  const times = data.frames.map((frame: any) => Number(frame.best_effort_timestamp_time));
  assert.equal(times.length, frameCount, 'Every authored frame must reach the video');
  assert.equal(times[0], 0);
  assert.equal(data.streams[0].codec_name, 'vp9');
  assert.equal(data.streams[0].r_frame_rate, '30/1');
  for (let index = 0; index < frameCount; index++)
    assert.ok(Math.abs(times[index] - index / VIDEO_FPS) <= .00051, `Wrong PTS at frame ${index}: ${times[index]}`);
  assert.ok(Math.abs(Number(data.format.duration) - frameCount / VIDEO_FPS) <= .001, 'The finalized WebM must expose its quantized duration');
  return times;
}
async function decodeImage(path: string, frameIndex?: number): Promise<Buffer> {
  const result = await run(ffmpeg, ['-v', 'error', '-i', path,
    ...(frameIndex === undefined ? [] : ['-vf', `select=eq(n\\,${frameIndex})`]),
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
  { windowsHide: true, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
  return result.stdout;
}
function cyanBounds(rgb: Buffer) {
  assert.equal(rgb.length, 960 * 640 * 3);
  let count = 0, xSum = 0, ySum = 0, minX = 960, maxX = 0, minY = 640, maxY = 0;
  for (let offset = 0; offset < rgb.length; offset += 3) {
    const [r, g, b] = [rgb[offset], rgb[offset + 1], rgb[offset + 2]];
    if (g > 105 && b > 105 && g > r * 1.5 && b > r * 1.5) {
      const x = (offset / 3) % 960, y = Math.floor(offset / 3 / 960);
      count++; xSum += x; ySum += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  assert.ok(count > 100, 'Fixture must contain a clearly visible cyan moving mesh');
  return { count, x: xSum / count, y: ySum / count, minX, maxX, minY, maxY };
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('fixed-frame WebM retains every PTS and agrees with PNG around impact, even when frame production is slow', { timeout: 180_000 }, async () => {
  await run(ffmpeg, ['-version'], { windowsHide: true });
  await run('ffprobe', ['-version'], { windowsHide: true });
  const dataDir = await mkdtemp(join(tmpdir(), 'nwn-vfx-video-acceptance-'));
  const output = resolve('output/playwright/video-acceptance'); await mkdir(output, { recursive: true });
  const app = await createApp({ dataDir, port: 14332, webDir: resolve('dist/web') });
  const origin = await app.listen({ host: '127.0.0.1', port: 14332 });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const document: EffectDocument = { ...makeDocument('empty'), schemaVersion: 2, duration: 1.61, name: 'Video timing fixture', layers: [
    { ...makeMeshLayer('moving'), color: '#00dfff', duration: 1.61, alpha: 1, geometry: { kind: 'box' as const, dimensions: [.45, .24, .55] as [number,number,number] },
      animation: { position: [{ time: 0, value: [-.7, 0, 1.7] }, { time: .6, value: [-.2, 0, .75] },
        { time: .84, value: [0, 0, .1] }, { time: .94, value: [.6, 0, .3] }, { time: 1.42, value: [1.1, 0, .8] }] } } as ReturnType<typeof makeMeshLayer>,
    { ...makeLayer('impact'), start: .84, life: .55, count: 35, position: [0, 0, .12], color: '#ff6611', endColor: '#cc3300', size: .04, speed: 1.2 } as ReturnType<typeof makeLayer>,
  ] };
  try {
    const render = createRenderer(origin), signal = new AbortController().signal;
    const started = performance.now();
    const result = await render(document, { format: 'webm', time: .84, signal });
    const elapsed = (performance.now() - started) / 1000;
    const videoPath = join(output, 'fixed-timeline.webm'); await writeFile(videoPath, result.files[0].data);
    const frames = Math.ceil(document.duration * VIDEO_FPS), timeline = await probe(videoPath), times = assertTimeline(timeline, frames);
    assert.ok((result.metadata as any).limitations.some((text: string) => text.includes('k/30')));
    assert.equal((result.metadata as any).nativeVerified, false);
    const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
    await page.goto(origin + '/render', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.studioRender === 'function');
    assert.equal(await page.evaluate(() => 'studioCapture' in window), false, 'The old real-time recorder must be removed');
    const comparisons: unknown[] = [];
    for (const time of [.60, .84, .94, 1.42]) {
      const frameIndex = Math.round(time * VIDEO_FPS), frameTime = frameIndex / VIDEO_FPS;
      const exactPath = join(output, `png-${time.toFixed(2)}.png`), referencePath = join(output, `frame-${frameIndex}-reference.png`);
      await page.evaluate(async ({ doc, time }) => { await window.studioRender!(doc, time); }, { doc: document, time });
      await page.locator('canvas').screenshot({ path: exactPath, type: 'png' });
      await page.evaluate(async ({ doc, time }) => { await window.studioRender!(doc, time); }, { doc: document, time: frameTime });
      await page.locator('canvas').screenshot({ path: referencePath, type: 'png' });
      const [decoded, reference, exact] = await Promise.all([decodeImage(videoPath, frameIndex), decodeImage(referencePath), decodeImage(exactPath)]);
      const actualBounds = cyanBounds(decoded), referenceBounds = cyanBounds(reference), exactBounds = cyanBounds(exact);
      assert.ok(Math.abs(actualBounds.x - referenceBounds.x) < 1.5 && Math.abs(actualBounds.y - referenceBounds.y) < 1.5, `Frame ${frameIndex} has the wrong scene phase`);
      assert.ok(Math.abs(actualBounds.count - referenceBounds.count) / referenceBounds.count < .07, 'The decoded mesh footprint must match its PNG');
      assert.ok(Math.abs(times[frameIndex] - time) <= 1 / VIDEO_FPS, 'Requested phase must be within one output frame');
      comparisons.push({ requestedTime: time, frameIndex, pts: times[frameIndex], frameTime, actualBounds, referenceBounds, requestedPngBounds: exactBounds });
    }
    const png = await readFile(join(output, 'png-0.60.png'));
    // A deliberately slow producer proves the encoder does not derive PTS from
    // wall-clock time, independently of the machine's current SwiftShader load.
    const slowStart = performance.now(), produced: number[] = [];
    const slow = await encodeWebmFrames({ frameCount: 12, signal, frame: async index => { produced.push(index); await delay(90); return png; } });
    const slowElapsed = (performance.now() - slowStart) / 1000;
    const slowPath = join(output, 'slow-producer.webm'); await writeFile(slowPath, slow);
    assert.deepEqual(produced, Array.from({ length: 12 }, (_, index) => index));
    assert.ok(slowElapsed > 1); assertTimeline(await probe(slowPath), 12);
    await assert.rejects(encodeWebmFrames({ frameCount: 1, signal, frame: async () => png, executable: join(dataDir, 'missing-ffmpeg.exe') }),
      (error: unknown) => error instanceof DomainError && error.code === 'RENDERER_UNAVAILABLE' && error.message.includes('FFmpeg'));
    await assert.rejects(encodeWebmFrames({ frameCount: 1, signal, frame: async () => png, executable: String.fromCharCode(0) }),
      (error: unknown) => error instanceof DomainError && error.code === 'RENDERER_UNAVAILABLE');
    // Node rejects FFmpeg flags and exits while the frame producer is waiting.
    // Preserve encoder stderr instead of leaking ERR_STREAM_DESTROYED/EPIPE.
    await assert.rejects(encodeWebmFrames({ frameCount: 2, signal, executable: process.execPath,
      frame: async () => { await delay(150); return png; } }),
    (error: unknown) => error instanceof DomainError && error.code === 'RENDER_FAILED' && error.message.includes('hide_banner'));
    const controller = new AbortController();
    await assert.rejects(encodeWebmFrames({ frameCount: 12, signal: controller.signal, frame: async () => { controller.abort(); return png; } }),
      (error: unknown) => error instanceof DomainError && error.code === 'CANCELLED');
    await writeFile(join(output, 'acceptance.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), documentDuration: document.duration,
      videoDuration: Number(timeline.format.duration), frameCount: frames, fps: VIDEO_FPS, times, elapsedSeconds: elapsed, slowProducerSeconds: slowElapsed,
      slowVideoDuration: 12 / VIDEO_FPS, comparisons, nativeVerified: false }, null, 2));
  } finally {
    await browser.close(); await app.close();
    const safe = resolve(dataDir);
    assert.equal(dirname(safe), resolve(tmpdir())); assert.ok(basename(safe).startsWith('nwn-vfx-video-acceptance-'));
    await rm(safe, { recursive: true, force: true });
  }
});
