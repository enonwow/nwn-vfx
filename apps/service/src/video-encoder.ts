import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, rmdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DomainError } from '../../../packages/core/src/model.js';
import { renderCause, renderDetails, rendererFailure } from './render-errors.js';

export const VIDEO_FPS = 30;
const MAX_VIDEO_BYTES = 256 * 1024 * 1024;
export interface VideoFrames {
  frameCount: number;
  frame: (index: number) => Promise<Uint8Array>;
  signal: AbortSignal;
  executable?: string;
  audioWav?:Uint8Array;
}

/** Frame number owns the timeline. Neither screenshot latency nor encoder
 * backpressure changes the image2pipe input PTS k/30. Never fall back to live
 * recording: that would skip document phases on slow software renderers.
 */
export async function encodeWebmFrames({ frameCount, frame, signal, audioWav, executable = process.env.NWN_VFX_FFMPEG || 'ffmpeg' }: VideoFrames): Promise<Uint8Array> {
  if (signal.aborted) throw new DomainError('CANCELLED', 'Render anulowany.');
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 900)
    throw new DomainError('INVALID_INPUT', 'Wideo obsługuje 1..900 klatek przy 30 fps.');
  // WebM needs a seekable destination to finalize Duration/Cues. A stdout pipe
  // produces an unindexed stream with an unknown duration in media players.
  const tempDirectory = await mkdtemp(join(tmpdir(), 'nwn-vfx-video-'));
  const outputPath = join(tempDirectory, 'preview.webm');
  const audioPath=join(tempDirectory,'mix.wav');
  const cleanup = async () => { await rm(outputPath, { force: true }); await rm(audioPath,{force:true}); await rmdir(tempDirectory); };
  if(audioWav)try{await writeFile(audioPath,audioWav);}catch(error){await cleanup();throw error;}
  const cleanupPreserving = async (primary?: DomainError) => {
    try { await cleanup(); }
    catch (error) {
      if (primary) throw new DomainError(primary.code, primary.message,
        { ...renderDetails(primary.details), cleanupError: renderCause(error) });
      throw rendererFailure(error, { stage: 'cleanup' }, [], signal.aborted);
    }
  };
  const unavailable = (error: NodeJS.ErrnoException) => new DomainError('RENDERER_UNAVAILABLE', error.code === 'ENOENT'
    ? 'Brak FFmpeg do eksportu wideo. Zainstaluj FFmpeg z libvpx-vp9 i dodaj do PATH lub ustaw NWN_VFX_FFMPEG.'
    : `Nie można uruchomić FFmpeg: ${error.message}`, { stage: 'encoder', cause: renderCause(error) });
  const spawnEncoder = () => spawn(executable, ['-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'image2pipe', '-framerate', String(VIDEO_FPS), '-vcodec', 'png', '-i', 'pipe:0',
    ...(audioWav?['-i',audioPath,'-map','0:v:0','-map','1:a:0','-c:a','libopus','-b:a','128k','-af',`apad=whole_dur=${frameCount/VIDEO_FPS}`,'-t',String(frameCount/VIDEO_FPS)]:['-an']), '-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', '4', '-threads', '2',
    '-b:v', '0', '-crf', '18', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough',
    '-f', 'webm', outputPath], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let encoder: ReturnType<typeof spawnEncoder>;
  try { encoder = spawnEncoder(); }
  catch (error) {
    const primary = rendererFailure(unavailable(error as NodeJS.ErrnoException), { stage: 'encoder' }, [], signal.aborted);
    await cleanupPreserving(primary); throw primary;
  }
  let stderr = '', failure: DomainError | undefined, settled = false;
  const finished = new Promise<void>((resolve, reject) => {
    encoder.on('error', (error: NodeJS.ErrnoException) => {
      failure = unavailable(error);
      settled = true; reject(failure);
    });
    encoder.on('close', code => {
      settled = true;
      if (signal.aborted) reject(new DomainError('CANCELLED', 'Render anulowany.'));
      else if (failure) reject(failure);
      else if (code !== 0) reject(new DomainError('RENDER_FAILED', `FFmpeg zakończył się kodem ${code}: ${stderr.trim() || 'brak szczegółów'}`));
      else resolve();
    });
  });
  // A process can fail while Chromium is producing the next image. Attach a
  // handler immediately, then await the same promise at the next boundary.
  void finished.catch(() => {});
  encoder.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-8000); });
  // The write callback handles a closed pipe. This listener prevents a second
  // asynchronous EPIPE from becoming an uncaught EventEmitter error.
  encoder.stdin.on('error', () => {});
  const abort = () => { encoder.stdin.destroy(); encoder.kill(); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let primaryError: DomainError | undefined;
  try {
    for (let index = 0; index < frameCount; index++) {
      if (signal.aborted) throw new DomainError('CANCELLED', 'Render anulowany.');
      if (settled) { await finished; throw new DomainError('RENDER_FAILED', 'FFmpeg zakończył się przed otrzymaniem wszystkich klatek.'); }
      const png = await frame(index);
      if (signal.aborted) throw new DomainError('CANCELLED', 'Render anulowany.');
      if (settled) { await finished; throw new DomainError('RENDER_FAILED', 'FFmpeg zakończył się przed otrzymaniem wszystkich klatek.'); }
      await new Promise<void>((resolve, reject) => encoder.stdin.write(png, error => error ? reject(error) : resolve()));
    }
    encoder.stdin.end();
    await finished;
    const { size } = await stat(outputPath);
    if (!size) throw new DomainError('RENDER_FAILED', 'FFmpeg nie zwrócił filmu.');
    if (size > MAX_VIDEO_BYTES) throw new DomainError('LIMIT_EXCEEDED', 'Wideo przekroczyło limit 256 MB.');
    return await readFile(outputPath);
  } catch (error) {
    let reason = error;
    encoder.stdin.destroy();
    if (!settled) encoder.kill();
    try { await finished; } catch (processError) {
      if (failure) reason = failure;
      else if (['EPIPE', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END', 'ECONNRESET'].includes((error as NodeJS.ErrnoException)?.code || '')) reason = processError;
    }
    primaryError = rendererFailure(reason, { stage: 'encoder' }, [], signal.aborted);
    throw primaryError;
  } finally {
    signal.removeEventListener('abort', abort);
    // Only the one output file in the directory created above is removed.
    await cleanupPreserving(primaryError);
  }
}
