import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { encodeWebmFrames } from '../apps/service/src/video-encoder.js';
import { DomainError } from '../packages/core/src/model.js';

test('missing FFmpeg preserves the OS cause through encoder cleanup', async () => {
  await assert.rejects(encodeWebmFrames({ frameCount: 1, signal: new AbortController().signal,
    frame: async () => Uint8Array.of(137, 80, 78, 71), executable: join(tmpdir(), `missing-ffmpeg-${randomUUID()}.exe`) }),
  (error: unknown) => {
    assert.ok(error instanceof DomainError); assert.equal(error.code, 'RENDERER_UNAVAILABLE');
    const details = error.details as any;
    assert.equal(details.stage, 'encoder'); assert.equal(details.cause.code, 'ENOENT');
    assert.match(details.cause.message, /missing-ffmpeg/); return true;
  });
});

test('synchronous invalid encoder launch preserves its original argument error', async () => {
  await assert.rejects(encodeWebmFrames({ frameCount: 1, signal: new AbortController().signal,
    frame: async () => Uint8Array.of(137, 80, 78, 71), executable: String.fromCharCode(0) }),
  (error: unknown) => {
    assert.ok(error instanceof DomainError); assert.equal(error.code, 'RENDERER_UNAVAILABLE');
    const details = error.details as any;
    assert.equal(details.stage, 'encoder'); assert.equal(details.cause.code, 'ERR_INVALID_ARG_VALUE');
    assert.equal(details.cause.name, 'TypeError'); return true;
  });
});
