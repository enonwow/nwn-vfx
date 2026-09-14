import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs, promisify } from 'node:util';
import { assertDocument } from '../packages/contracts/src/schema.js';
import { canonical } from '../apps/service/src/store.js';
import type { EffectDocument } from '../packages/core/src/model.js';

/** Offline evidence only: never opens a browser, service, project or native game.
 * PNG references MUST have been rendered at the selected frame's exact k/fps.
 * requestedTime may describe an off-grid artistic phase, referenceTime may not.
 * SSIM here is luminance SSIM over non-overlapping uniform 8x8 windows; it is
 * reported explicitly rather than presented as FFmpeg's differently windowed SSIM.
 */
const { values } = parseArgs({ options: {
  project: { type: 'string' }, video: { type: 'string' }, references: { type: 'string' }, background: { type: 'string' },
  'video-handoff': { type: 'string' }, 'background-handoff': { type: 'string' }, roi: { type: 'string', multiple: true }, output: { type: 'string' },
  fps: { type: 'string', default: '30' }, ffmpeg: { type: 'string' }, ffprobe: { type: 'string' }, help: { type: 'boolean' },
  'max-full-mae': { type: 'string', default: '3' }, 'min-full-ssim': { type: 'string', default: '.95' },
  'max-roi-mae': { type: 'string', default: '6' }, 'min-roi-ssim': { type: 'string', default: '.90' },
  'max-foreground-mae': { type: 'string', default: '8' }, 'max-foreground-p95': { type: 'string', default: '24' },
  'min-foreground-ssim': { type: 'string', default: '.85' },
} });
if (values.help) {
  process.stdout.write(`Offline WebM proof from an explicit saved project and exact PNG references.

node --import tsx scripts/verify-textured-video.ts --project project.json --video preview.webm \\
  --references references.json --background empty-scene.png [--video-handoff handoff.json] \\
  [--background-handoff empty-scene.handoff.json] \\
  [--roi blade:410:20:150:440 --roi impact:250:300:470:230] [--output output/video-proof]

references.json is an array, or {"references":[...]}. Paths are relative to that JSON:
[{"label":"before","requestedTime":0.6,"referenceTime":0.6,"referencePath":"before.png","handoffPath":"before.handoff.json"},
 {"label":"impact","requestedTime":0.88,"referenceTime":"26/30","referencePath":"impact-exact.png"}]

The second reference MUST be rendered at 26/30, not at 0.88. The verifier refuses
off-grid reference times before any pixel comparison. The background is an explicit
empty-scene PNG with the same camera/resolution. It is only used to select effect pixels.
All selected frames are extracted by decoded frame index, never approximate seek time.
Reports and extracted PNGs go to a new run-* directory; input artifacts stay unchanged.

Defaults target Studio's lossy VP9 output: full MAE<=3, SSIM>=.95; each supplied ROI
MAE<=6, SSIM>=.90; foreground union MAE<=8, p95<=24, SSIM>=.85. Errors use RGB levels
0–255. Thresholds are adjustable with --max-full-mae/--min-full-ssim, --max-roi-mae/
--min-roi-ssim, --max-foreground-mae/--max-foreground-p95/--min-foreground-ssim.
They are regression thresholds, not an artistic or native NWN acceptance standard.
`);
  process.exit(0);
}
for (const key of ['project', 'video', 'references', 'background'] as const) if (!values[key]) throw Error(`Required --${key}; see --help.`);
const fps = Number(values.fps);
if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw Error('fps must be an integer 1–120.');
const thresholds = { fullMae: Number(values['max-full-mae']), fullSsim: Number(values['min-full-ssim']),
  roiMae: Number(values['max-roi-mae']), roiSsim: Number(values['min-roi-ssim']),
  foregroundMae: Number(values['max-foreground-mae']), foregroundP95: Number(values['max-foreground-p95']), foregroundSsim: Number(values['min-foreground-ssim']) };
if (Object.entries(thresholds).some(([key, value]) => !Number.isFinite(value) || value < 0 || value > (key.endsWith('Ssim') ? 1 : 255))) throw Error('Invalid metric threshold.');
const ffmpeg = values.ffmpeg ?? process.env.NWN_VFX_FFMPEG ?? 'ffmpeg', ffprobe = values.ffprobe ?? 'ffprobe';
const run = promisify(execFile), hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const projectPath = resolve(values.project!), videoPath = resolve(values.video!), referencesPath = resolve(values.references!), backgroundPath = resolve(values.background!);
const outputBase = resolve(values.output ?? 'output/textured-video-proof'); await mkdir(outputBase, { recursive: true });
const output = await mkdtemp(join(outputBase, 'run-'));
const failures: string[] = [], check = (value: unknown, message: string) => { if (!value) failures.push(message); };
type Roi = { name: string; x: number; y: number; width: number; height: number };
type ReferenceInput = { label: string; requestedTime: number | string; referenceTime: number | string; referencePath: string; handoffPath?: string };
const time = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(value)) { const [a, b = '1'] = value.split('/'); const result = Number(a) / Number(b); if (Number.isFinite(result)) return result; }
  throw Error(`Invalid reference time: ${String(value)}`);
};
const unwrap = (value: any) => value?.data ?? value;
const report: any = { passed: false, recordedAt: new Date().toISOString(), scope: 'offline Studio video regression',
  nativeVerified: false, projectPath, videoPath, referencesPath, backgroundPath, thresholds, fps,
  metricDefinitions: { mae: 'Mean absolute RGB error, 0–255.',
    ssim: 'Luminance SSIM, uniform non-overlapping 8x8 windows; C1=(.01*255)^2, C2=(.03*255)^2.',
    foreground: 'Union of reference or decoded pixels whose maximum RGB difference from the supplied empty scene exceeds 16. Foreground SSIM includes 8x8 windows with at least 4 union pixels.',
    foregroundP95: '95th percentile of per-pixel mean absolute RGB error on that foreground union.',
    time: 'frameIndex=round(requestedTime*fps); exact document reference time=frameIndex/fps. Off-grid PNGs are visual context only and are rejected as metric references.' },
  lineageLimitations: ['Without a handoff, reference time and saved-project association are caller-supplied assertions.',
    'An empty-scene background must use the same camera/resolution. It is not inferred from a flat background color.',
    'Selected-frame metrics do not establish every intermediate visual detail, artistic quality or native NWN behavior.'], frames: [], failures };
async function probe(path: string, frames = false) {
  const args = ['-v', 'error', '-select_streams', 'v:0', ...(frames ? ['-show_frames'] : []), '-show_streams', '-show_format', '-of', 'json', path];
  const { stdout } = await run(ffprobe, args, { windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}
async function rgb(path: string, width: number, height: number): Promise<Buffer> {
  const { stdout } = await run(ffmpeg, ['-v', 'error', '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
    { windowsHide: true, timeout: 60_000, encoding: 'buffer', maxBuffer: width * height * 4 + 1024 });
  if (stdout.length !== width * height * 3) throw Error(`Wrong decoded dimensions: ${path}`);
  return stdout;
}
function metrics(a: Uint8Array, b: Uint8Array, width: number, region: Roi, mask?: Uint8Array) {
  let sum = 0, count = 0, squared = 0; const histogram = new Uint32Array(766);
  for (let y = region.y; y < region.y + region.height; y++) for (let x = region.x; x < region.x + region.width; x++) {
    const p = y * width + x; if (mask && !mask[p]) continue;
    let error = 0; for (let c = 0; c < 3; c++) { const delta = Math.abs(a[p * 3 + c] - b[p * 3 + c]); error += delta; squared += delta * delta; }
    sum += error; count++; histogram[error]++;
  }
  let cumulative = 0, p95 = 0; for (let error = 0; error < histogram.length; error++) { cumulative += histogram[error]; if (cumulative >= Math.ceil(count * .95)) { p95 = error / 3; break; } }
  let ssimSum = 0, windows = 0;
  for (let by = region.y; by < region.y + region.height; by += 8) for (let bx = region.x; bx < region.x + region.width; bx += 8) {
    let n = 0, selected = 0, sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
    for (let y = by; y < Math.min(by + 8, region.y + region.height); y++) for (let x = bx; x < Math.min(bx + 8, region.x + region.width); x++) {
      const p = y * width + x, i = p * 3, av = .2126 * a[i] + .7152 * a[i + 1] + .0722 * a[i + 2], bv = .2126 * b[i] + .7152 * b[i + 1] + .0722 * b[i + 2];
      n++; if (!mask || mask[p]) selected++; sumA += av; sumB += bv; sumAA += av * av; sumBB += bv * bv; sumAB += av * bv;
    }
    if (mask && selected < Math.min(4, n)) continue;
    const meanA = sumA / n, meanB = sumB / n, varA = Math.max(0, sumAA / n - meanA * meanA), varB = Math.max(0, sumBB / n - meanB * meanB), cov = sumAB / n - meanA * meanB;
    ssimSum += ((2 * meanA * meanB + 6.5025) * (2 * cov + 58.5225)) / ((meanA * meanA + meanB * meanB + 6.5025) * (varA + varB + 58.5225)); windows++;
  }
  return { pixels: count, meanAbsoluteError: count ? sum / (count * 3) : null,
    rootMeanSquaredError: count ? Math.sqrt(squared / (count * 3)) : null, pixelMeanErrorP95: count ? p95 : null,
    luminanceSsim: windows ? ssimSum / windows : null, ssimWindows: windows };
}
try {
  const source = unwrap(JSON.parse(await readFile(projectPath, 'utf8'))), project = source.project ?? source;
  const document: EffectDocument = project.document ?? project; assertDocument(document);
  report.projectId = project.id ?? null; report.revision = project.revision ?? null; report.snapshotSha256 = hash(canonical(document));
  report.documentDuration = document.duration; report.layerCounts = { total: document.layers.length, enabled: document.layers.filter(l => l.enabled).length,
    mesh: document.layers.filter(l => l.type === 'mesh').length, emitter: document.layers.filter(l => l.type === 'emitter').length };
  const reuse = new Map<string, number>(); for (const layer of document.layers) if (layer.enabled && layer.texture) reuse.set(layer.texture, (reuse.get(layer.texture) ?? 0) + 1);
  report.textureReuse = [...reuse].map(([reference, enabledLayers]) => ({ reference, enabledLayers }));
  report.videoSha256 = hash(await readFile(videoPath));
  const data = await probe(videoPath, true); await writeFile(join(output, 'ffprobe.json'), JSON.stringify(data, null, 2));
  const stream = data.streams?.[0]; if (!stream) throw Error('No video stream.');
  const width = Number(stream.width), height = Number(stream.height); if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16_777_216) throw Error('Invalid video dimensions.');
  const pts: number[] = data.frames.map((frame: any) => Number(frame.best_effort_timestamp_time ?? frame.pts_time));
  const expectedFrames = Math.ceil(document.duration * fps), gaps = pts.slice(1).map((v, i) => v - pts[i]), duration = Number(data.format?.duration);
  check(stream.codec_name === 'vp9', `Expected VP9, found ${stream.codec_name}.`);
  check(time(stream.r_frame_rate) === fps, `Expected ${fps}fps, found ${stream.r_frame_rate}.`);
  check(pts.length === expectedFrames, `Expected ${expectedFrames} frames, got ${pts.length}.`);
  check(pts.length > 0 && pts[0] === 0, 'First PTS must be 0.');
  check(pts.every((v, i) => Number.isFinite(v) && Math.abs(v - i / fps) <= .0006), 'PTS differs from fixed k/fps by more than 0.6ms.');
  check(gaps.every(gap => gap > 0 && gap <= Math.ceil(1000 / fps) / 1000 + 1e-9), 'Nonpositive or skipped-frame PTS interval.');
  check(Number.isFinite(duration) && Math.abs(duration - expectedFrames / fps) <= .002, 'Container duration differs from quantized document duration.');
  report.timeline = { codec: stream.codec_name, width, height, declaredFps: stream.r_frame_rate, frameCount: pts.length, expectedFrames, duration,
    expectedDuration: expectedFrames / fps, firstPts: pts[0], lastPts: pts.at(-1), maximumGapSeconds: Math.max(0, ...gaps), maximumTimestampErrorSeconds: Math.max(0, ...pts.map((v, i) => Math.abs(v - i / fps))), pts };
  const lineage = async (path: string | undefined, kind: 'png' | 'webm', fileSha256: string, referenceTime?: number) => {
    if (!path) return { status: 'caller-supplied' };
    const handoff = unwrap(JSON.parse(await readFile(path, 'utf8')));
    check(handoff.snapshotSha256 === report.snapshotSha256, `Snapshot mismatch: ${path}`);
    if (report.projectId !== null) check(handoff.projectId === report.projectId && handoff.revision === report.revision, `Project/revision mismatch: ${path}`);
    if (referenceTime !== undefined && !(Math.abs(handoff.metadata?.time - referenceTime) <= 1e-9 && handoff.metadata?.format === 'png')) throw Error(`Reference time/format mismatch: ${path}; refusing pixel comparison.`);
    check(handoff.metadata?.format === kind, `Format metadata mismatch: ${path}`);
    const artifact = handoff.artifacts?.find((entry: any) => entry.name === `preview.${kind}`);
    check(artifact?.sha256 === fileSha256, `Actual file SHA-256 differs from the handoff artifact: ${path}`);
    check(handoff.metadata?.resolution?.[0] === width && handoff.metadata?.resolution?.[1] === height, `Resolution metadata mismatch: ${path}`);
    return { status: 'handoff-checked', path, jobId: handoff.jobId, rendererVersion: handoff.metadata?.rendererVersion, camera: handoff.metadata?.camera };
  };
  report.videoLineage = await lineage(values['video-handoff'] ? resolve(values['video-handoff']) : undefined, 'webm', report.videoSha256);
  const backgroundProbe = await probe(backgroundPath); if (backgroundProbe.streams?.[0]?.width !== width || backgroundProbe.streams?.[0]?.height !== height) throw Error('Background resolution differs from video.');
  const background = await rgb(backgroundPath, width, height); report.backgroundSha256 = hash(await readFile(backgroundPath));
  report.backgroundLineage = await lineage(values['background-handoff'] ? resolve(values['background-handoff']) : undefined, 'png', report.backgroundSha256);
  if (report.videoLineage.camera && report.backgroundLineage.camera) check(canonical(report.videoLineage.camera) === canonical(report.backgroundLineage.camera), 'Background camera differs from video.');
  const rawReferences = JSON.parse(await readFile(referencesPath, 'utf8')), refs: ReferenceInput[] = Array.isArray(rawReferences) ? rawReferences : rawReferences.references;
  if (!Array.isArray(refs) || !refs.length || refs.length > 30) throw Error('Provide 1–30 PNG references.');
  const rois = (values.roi ?? []).map(spec => {
    const [name, ...numbers] = spec.split(':'), [x, y, roiWidth, roiHeight] = numbers.map(Number);
    if (!name || numbers.length !== 4 || ![x, y, roiWidth, roiHeight].every(Number.isInteger) || x < 0 || y < 0 || roiWidth < 1 || roiHeight < 1 || x + roiWidth > width || y + roiHeight > height) throw Error(`Invalid ROI: ${spec}`);
    return { name, x, y, width: roiWidth, height: roiHeight };
  });
  report.regions = rois;
  const full = { name: 'full', x: 0, y: 0, width, height };
  // Validate every time before comparing any PNG. A caller cannot accidentally
  // compare the .88 screenshot with decoded frame 26 at .8666667.
  for (const ref of refs) {
    const requested = time(ref.requestedTime), referenceTime = time(ref.referenceTime), index = Math.round(requested * fps);
    if (index < 0 || index >= expectedFrames || Math.abs(referenceTime - index / fps) > 1e-9) throw Error(`Reference ${ref.label}: PNG time ${referenceTime} is not exact frame ${index}/${fps}; re-render the reference at ${index / fps}.`);
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(ref.label)) throw Error('Reference labels must be unique simple file-safe labels.');
  }
  if (new Set(refs.map(ref => ref.label)).size !== refs.length) throw Error('Repeated reference label.');
  for (const ref of refs) {
    const requestedTime = time(ref.requestedTime), referenceTime = time(ref.referenceTime), index = Math.round(requestedTime * fps);
    const referencePath = resolve(dirname(referencesPath), ref.referencePath), referenceProbe = await probe(referencePath);
    if (referenceProbe.streams?.[0]?.width !== width || referenceProbe.streams?.[0]?.height !== height) throw Error(`Reference resolution mismatch: ${referencePath}`);
    const referenceFileSha256 = hash(await readFile(referencePath));
    const referenceLineage = await lineage(ref.handoffPath ? resolve(dirname(referencesPath), ref.handoffPath) : undefined, 'png', referenceFileSha256, referenceTime);
    if (report.videoLineage.camera && referenceLineage.camera) check(canonical(report.videoLineage.camera) === canonical(referenceLineage.camera), `Camera mismatch: ${ref.label}`);
    if (report.videoLineage.rendererVersion && referenceLineage.rendererVersion) check(report.videoLineage.rendererVersion === referenceLineage.rendererVersion, `Renderer version mismatch: ${ref.label}`);
    const decodedPath = join(output, `${ref.label}-frame-${index}.png`);
    await run(ffmpeg, ['-v', 'error', '-i', videoPath, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', decodedPath], { windowsHide: true, timeout: 60_000 });
    const [a, b] = await Promise.all([rgb(referencePath, width, height), rgb(decodedPath, width, height)]);
    const mask = new Uint8Array(width * height); let referenceForegroundPixels = 0, decodedForegroundPixels = 0, overlap = 0;
    const bounds = [width, height, -1, -1];
    for (let p = 0; p < mask.length; p++) {
      let da = 0, db = 0; for (let c = 0; c < 3; c++) { da = Math.max(da, Math.abs(a[p * 3 + c] - background[p * 3 + c])); db = Math.max(db, Math.abs(b[p * 3 + c] - background[p * 3 + c])); }
      const ma = da > 16, mb = db > 16; if (ma) referenceForegroundPixels++; if (mb) decodedForegroundPixels++; if (ma && mb) overlap++;
      if (ma || mb) { mask[p] = 1; const x = p % width, y = Math.floor(p / width); bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y); bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y); }
    }
    const entire = metrics(a, b, width, full), foreground = metrics(a, b, width, full, mask);
    check(entire.meanAbsoluteError! <= thresholds.fullMae && entire.luminanceSsim! >= thresholds.fullSsim, `${ref.label}: full-frame regression exceeds thresholds.`);
    if (foreground.pixels) {
      check(foreground.meanAbsoluteError! <= thresholds.foregroundMae && foreground.pixelMeanErrorP95! <= thresholds.foregroundP95, `${ref.label}: foreground RGB regression exceeds thresholds.`);
      if (foreground.luminanceSsim !== null) check(foreground.luminanceSsim >= thresholds.foregroundSsim, `${ref.label}: foreground SSIM regression exceeds threshold.`);
    }
    const regions = rois.map(region => {
      const result = metrics(a, b, width, region);
      check(result.meanAbsoluteError! <= thresholds.roiMae && result.luminanceSsim! >= thresholds.roiSsim, `${ref.label}/${region.name}: ROI regression exceeds thresholds.`);
      return { ...region, ...result };
    });
    const frame = { label: ref.label, requestedTime, frameIndex: index, referenceTime, decodedPts: pts[index], requestedTimeOffset: referenceTime - requestedTime,
      referencePath, referenceFileSha256, decodedPath, decodedPixelSha256: hash(b), referenceLineage,
      full: entire, regions, foreground: { ...foreground, referenceForegroundPixels, decodedForegroundPixels, intersectionOverUnion: foreground.pixels ? overlap / foreground.pixels : null,
        boundingBox: foreground.pixels ? { x: bounds[0], y: bounds[1], width: bounds[2] - bounds[0] + 1, height: bounds[3] - bounds[1] + 1 } : null } };
    report.frames.push(frame);
    process.stdout.write(`${ref.label}: requested=${requestedTime}, exact=${referenceTime}, frame=${index}, PTS=${pts[index]}, full MAE=${entire.meanAbsoluteError?.toFixed(3)}, foreground MAE=${foreground.meanAbsoluteError?.toFixed(3) ?? 'empty'}, foreground SSIM=${foreground.luminanceSsim?.toFixed(4) ?? 'empty'}\n`);
  }
  report.passed = failures.length === 0;
} catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
process.stdout.write(`${report.passed ? 'PASS' : 'FAIL'} REPORT ${join(output, 'report.json')}\n`);
if (!report.passed) { process.stderr.write(failures.join('\n') + '\n'); process.exitCode = 1; }
