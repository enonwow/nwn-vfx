# Audio on a DUR timeline — Studio 0.24.0

Active audio clips are supported with `lifecycle:"duration"`. UI audio import, timeline, start/duration, source offset, gainDb/mute and fades use the same audio.import and audio.add/set operations as FnF, in CLI and WebMCP. No new tool or separate audio authority is introduced. Project grants, human locks, AI pause, revisions, idempotency, history, selective undo and human draft protections remain enforced.

## Period, source and compatibility

`document.duration` is one visual/audio period, not the external ability lifetime. Active DUR audio promotes only the new revision to document **15**, portable ZIP **v10**, minimum Studio **0.24.0**. Clients declare `X-NWN-VFX-Document-Schema:15`. Older clients cannot read or commit the new combination; mutations roll back before becoming visible. Existing FnF documents, historical revisions, audio source bytes, and DUR projects without enabled audio remain unchanged. An enabled clip with gain zero still uses the new contract; disabling all clips does not downgrade an existing schema 15 revision.

The period must contain whole samples at both 48 kHz and 44.1 kHz, i.e. a multiple of 1/300 second, allowing floating-point roundoff only. A deformed DUR mesh additionally retains its existing multiple-of-1/60-second rule. **1.6 seconds = 76 800 preview frames = 70 560 native WAV frames**. Invalid periods return DURATION_AUDIO_INVALID; Studio does not change geometry timing or round the authored period. Audio clips must fit inside the period and their source offsets must fit the source. The existing 6 MiB combined document, 8 assets, 32 clips, 2 MiB original audio and 30-second limits still apply.

Changing the editor's DUR length stretches mesh key times only. Audio clips keep their source speed, start, duration, offsets and fades. A shorter period that no longer contains a clip is rejected until the author explicitly changes that clip. No audio time-stretch, normalization, limiter, automatic crossfade or seam repair is performed. Put fades/silence at the desired boundaries and inspect the resulting loop.

## Preview

The editor mixes one period into one AudioBufferSourceNode. Loop playback repeats that buffer; pause, Stop, seek/reconfigure and project switching stop/disconnect the preceding source. Playback remains initially muted and requires the human's existing Play/unmute gesture. WebMCP can control view time/playing/loop, but cannot unmute the monitor.

`preview.request` with `format:"webm",cycles:3` produces three copies of the period's mixed PCM (4.8 seconds for a 1.6-second document). It returns both the Opus video and exact PCM16 stereo/48 kHz `audio-mix.wav`. Clip starts, source offsets, gains, overlaps and fades are applied once inside each period, then the period repeats. Monitor gain does not change the rendered file. Seeking uses the same period phase; a finite render stops at its requested output duration. Metadata supplies total audio frames, PCM SHA-256, renderer version, document schema, loopSeconds and cycles. Opus is lossy; use the separate WAV for exact sample comparisons.

**preview.compose continues to omit audio.** Its manifest says `audio:"omitted"` and its limitations identify visual-only composition. Do not use a silent composed movie as evidence that a source clip is missing or broken.

## Export and consumer integration

The supported `candidate.build` pipeline exports resources, source audio, the stereo one-period `audio-mix.wav`, mono PCM16/44.1 kHz WAV resources, and **audio-events.json version 2** for active DUR audio. No MOD/HAK integration, game launch or native proof is performed by Studio. Its normal resource-candidate HAK contains the WAV resources, but loading that HAK does not start audio.

Read `preferredIntegration` from audio-events.json:

| Field | Contract |
| --- | --- |
| method | `consumer-scheduled-period-wav` |
| file, resref, sha256, pcmSha256 | Exact one-period mono WAV and its identities |
| frames, sampleRate, channels | Exact resource duration; rate 44100, mono |
| schedule.firstStartSeconds, offsetSeconds | Both 0 relative to the visual activation; source/clip offsets are already baked |
| schedule.intervalSeconds | document.duration |
| schedule.repetitions | null — chosen from the consumer's external lifetime |
| schedule.rule | Dispatch at `activationTime + k*period`, while `k*period < lifetime` |
| stop | Cancel future dispatch at the external end; no stop handle for a sound already issued |
| automaticSoundImpactLoop, nativeSynchronizationVerified | Both false |

For a 1.6-second period and a 3.2-second ability, dispatch at 0 and 1.6 seconds, never at 3.2. For a 2.4-second lifetime, dispatch at 0 and 1.6; the already issued second WAV may play past the visual end. This exporter does not trim that last partial period or promise immediate silence. The WAV lasts one period after its actual start, and action-queue delay can extend the tail further beyond the requested ability end.

The supplied `audio-events.nss` helper plays **one period per call**. It does not implement or start a scheduler. The consumer must keep an activation generation/token, invalidate it at cancellation/retrigger, and check both generation and emitter validity immediately before each finite dispatch. The consumer also chooses how to handle late dispatch and overlapping activations. Do not queue unlimited repetitions. Do not combine this schedule with SoundImpact, the per-clip resources listed for readback, or repeated visual activation. A single SoundImpact binding is not a native audio loop.

PlaySound action-queue timing, attenuation, native audio settings, stopping and alignment with the native animation require separate consumer tests. Studio does not expose native animation phase. All artifacts remain `nativeVerified:false`. FnF retains its version-1 audio manifest and previous SoundImpact/full-mix or alternate event contract.

## CLI and WebMCP examples

Use the packaged **technical fixture** under `docs/agents/examples/duration-audio`. Its tone tests timing and is not an accepted wings sound. Import it into a new project, never overwrite an accepted consumer project:

```text
nwn-vfx --json projects import --project MY_NEW_FIXTURE --file project.json --idempotency-key UNIQUE_IMPORT_KEY
nwn-vfx --json preview request --project MY_NEW_FIXTURE --revision 1 --format webm --cycles 3 --idempotency-key UNIQUE_RENDER_KEY
nwn-vfx --json candidate build --project MY_NEW_FIXTURE --revision 1 --model-name my_dur_audio --profile nwn-ee-duration-binary-experimental-v1 --idempotency-key UNIQUE_EXPORT_KEY
```

For an existing own DUR project, import WAV/MP3 with `audio import --project ID --expected-revision N --file PATH --idempotency-key KEY`, then use the returned project revision and asset ID in changes.preview/apply. The packaged `changes.json` shows audio.add/set with source offsets, gainDb and fades. Read all concrete IDs and current revisions before adapting it.

After a human grants a fresh WebMCP tab, call studio.connection.inspect and then the discovered studio.audio.import, studio.changes.preview/apply, studio.preview.request, studio.candidate.build and studio.artifacts.read schemas. Domain calls use `{viewSessionId,input,idempotencyKey?}`; read-only calls omit the key. Retrieve chunks through nextOffset=null, verifying each chunk SHA and the full artifact size/SHA. Use the exact saved revision for render/export. Preserve unsaved human drafts, including invalid pending audio text. Open a new tab after upgrading and retain old tabs with drafts.
