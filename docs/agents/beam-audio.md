# Finite beam audio — Studio 0.30.0

Active audio on a finite Fountain/P2P beam uses document24, portable ZIP19 and
client header `X-NWN-VFX-Document-Schema: 24`. Existing schema1–23 documents,
FnF/DUR audio and immutable revisions remain readable. The first active clip
promotes the new revision; disabling it does not downgrade that revision.

Use the existing public `audio.import` and `changes.preview/apply` operations
with `audio.add/set/remove`. UI audio controls and WebMCP use those same
operations. Gains accept mutually exclusive `gainDb` (−60…+24) or linear `gain`;
gainDb0 preserves unity, gain0 mutes. Starts, source offset, duration, enabled,
fadeIn/fadeOut share locks, pause, expected revision, idempotency and undo.
Preserve unsaved drafts; open a fresh tab for the new schema.

The beam must contain an enabled finite Fountain/P2P flow. A static-only beam
still rejects active audio. `document.duration` must fit whole samples at both
44100 and48000Hz (multiples of1/300s); Studio never silently rounds the source.
Keep the authored feed/drain and ribbon parameters. `preview.request` has one
finite pass (`cycles:1`). UI loop replays the whole preview. `preview.compose`
continues to omit audio.

At3.6s, preview produces108 video frames at30fps and172800 stereo48000Hz PCM
frames. WebM encodes Opus; `audio-mix.wav` is the exact pre-encoding PCM mix.
Monitor mute/gain is local listening state and does not alter export. There is
no normalization or limiter. Inspect `peakDbFS` and `clippedSamples`; PCM16
clamps only at final output. Opus is lossy and has codec delay/padding.

The unchanged `nwn-ee-beam-binary-experimental-v1` candidate profile adds:

- One full-timeline mono44100 PCM16 WAV, including silence, gain and fades.
- `audio-events.json` version3, profile `finite-beam-audio-v1`, with exact source,
  WAV and PCM hashes, frame counts, clip timing and measured levels.
- `preferredIntegration.method: consumer-once-full-mix-wav`, with one dispatch
  at beam activation on an explicitly selected valid object.
- `audio-events.nss`, a single full-mix `PlaySound` helper. The consumer owns
  its compilation and invocation alongside the beam and endpoint effects.

Do not also trigger individual clip WAVs or SoundImpact. Do not replay at feed
end or replace the live beam instance while particles drain. Type B automatic
SoundImpact is not assumed. Native action queues, network timing and spatial
attenuation require consumer testing. Issued audio has no stop handle here and
may finish after emergency visual removal. There is no native phase or instant
stop guarantee. Geometry subexports carry no audio; one final mix belongs to
the composed candidate. Source PNGs and geometry parameters are unchanged.

Run [the public CLI example](examples/beam-audio/run.mjs) with an explicit source
project/revision and WAV. It forks first and returns completed job/artifact IDs.
WebMCP equivalents: `studio.audio.import({viewSessionId,input:{projectId,
expectedRevision,fileName,dataBase64},idempotencyKey})`, then
`studio.changes.preview/apply` with `input.changes:[{type:'audio.add',clip:…}]`.
Read the discovered schemas, connection and view context before acting.

Studio never installs resources or launches NWN/Toolset. `nativeVerified:false`.
