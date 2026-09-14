# Studio 0.15.0 — audio authoring and shared transport

Activated locally on 2026-09-08. WAV PCM16 and MP3 imports preserve their original
bytes and provenance; separate audio clips share the effect timeline. UI, CLI
and WebMCP support import/read/remove, clip editing, revisions, selective undo,
human locks, AI pause and preservation of pending human edits.

Monitoring starts muted. The browser uses at most one full-timeline audio source,
with synchronized Play/Pause/Stop/restart/seek/loop. The final tests exposed and
fixed an async `AudioContext.resume()` race: an old click's position could replace
a newer restart at the natural end. Resume now changes the clock epoch only when
creating the context synchronously and never reapplies a stale position. A real
suspended context freezes preview time with the samples. Selecting an audio
project pauses playback and resets monitor mute.

## Installation and contracts

- CLI/service 0.15.0 at `http://127.0.0.1:4317`, API envelope 0.1.0, document
  schemas 1–9. Combined document limit remains 6 MiB. Audio caps: 8 assets,
  32 clips, 2 MiB original and 30 seconds each, subject to combined size.
- Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057` and workspace
  `7def76b2-ad42-4b55-a5e8-d919b79a8587` preserved. Before restart: 36 projects,
  zero active jobs. All 36 revisions and canonical document hashes matched after
  installation. `output/releases/0.15.0/installed-preservation.json` records this.
- Global CLI version and actual `audio import` exercised from
  `C:\Projects\the last city`; duplicate byte import returned the same asset/r3.
- Build/TypeScript and skill validation passed. Source skill and installed skill
  updated. The heartbeat source-approval wording was corrected in source and
  installed agent documentation, then the package was repacked; executable build
  bytes did not change.
- Final package: `output/releases/nwn-vfx-studio-0.15.0.tgz`, 2179947 bytes,
  SHA-256 `554e9730fa13f5d25c83cf0a68ecf894b4d7875964be750958909b449beb3536`.
  [Source inventory](source-manifest.json) records this unborn/untracked workspace.

## Automated evidence

- Full unit/service suite **242/242 PASS**, `output/audio-unit-tests.log`.
  Final affected audio/service/descriptor tests **8/8 PASS**,
  `output/audio-affected-tests.log`. Exact PCM, fades, trim/offset, disabled and
  overlapping clips, clipping, source integrity, invalid imports, MP3 decoding,
  ZIP v4, real HAK WAV resource readback, grants, locks, pause, conflict and undo.
- Final production browser audio scenario **PASS**,
  `output/audio-browser-final.log` and `output/audio-acceptance/browser-report.json`.
  UI file import, waveform, pointer drag/numeric edit, multiple clips, pending
  draft, same-source reuse, Play/Pause/Stop/restart, seek during playback, natural
  end and subsequent Play, real AudioContext suspend/resume, project switching.
  Four observed timeline wraps; maximum active physical source count 1, master
  gain 0, zero audible playback. Offline PCM separately repeats three cycles
  identically. This signal check does not substitute for the real UI transport.
- Four existing save/WebMCP/video browser scenarios **PASS** on the final build,
  `output/audio-browser-tests.log`. That file also retains a superseded audio
  test failure caused by selecting an unrefreshed project option; the corrected
  audio test above opens the agent's variant through its public view tool.
- WebM decoded to 48000 stereo frames for a 1-second tone fixture. Pre-clip RMS 0,
  active RMS 0.0863406378. Opus is lossy; exact PCM is a separate WAV artifact.
  Initial DC-only audio fixture was unsuitable for Opus signal testing and was
  replaced with a 440 Hz tone; analytical DC unit coverage remains.

## Real Codex host WebMCP

**PASS**, without injected registration mocks or owner-cookie substitution.
Evidence: `output/releases/0.15.0/real-host-webmcp.json`.

- Real in-app browser discovers **48 tools**, serialized descriptors 62720 bytes
  on this host. The independent descriptor test budgets a conservative 63968-byte
  package against the host's 65536-byte limit. Only description annotations are
  omitted from registration; full canonical schemas remain in `schema.get`.
- Isolated UI-created project `3bd62c64-9803-41b2-8334-d43c1b9a4706`, final r8,
  titled `TEST WebMCP 0.15 — własne audio`. Human UI grant produced a scoped agent;
  original WAV import/read is byte-exact, repeated import key returns the same
  operation/r3, audio.add and audio.set/revert succeeded.
- Real tools observed pending inspector text and returned `DRAFT_CONFLICT` on
  navigation. Human UI lock and pause caused `LOCKED` and `AI_PAUSED`.
  A stale revision caused `REVISION_CONFLICT`; no forced retries.
- Preview job `bbf28287-cc3d-4c66-9866-9579123067ec` succeeded. Agent retrieved
  `audio-mix.wav` artifact `6b6d3615-77b1-4f20-80d4-2dc1cd450dd1` in three chunks,
  verified each chunk and full 192044 bytes, SHA-256
  `f5c6b2ab147d9178e81fcb7be6ec41349def15d99d598dda56a6afe545d5c686`.
- Monitor stayed muted and locked (`unlocked:false`, activeSources 0). Grant was
  revoked at test end; subsequent inspect returned `WEBMCP_NOT_CONNECTED`.

## Exact-visual consumer forks and resources

Feature tests used separate forks, preserving every visual field of bite r27 and
heart r5 and their source projects. Original WAV hashes remained exact. The bite
recording itself has user approval. The heartbeat clip and timing are consumer
prepared from the user-approved bart/CC0 source family; exact fragment/alignment
still awaits user listening feedback.

| Item | Bite | Heart |
| --- | --- | --- |
| Source | `tlc-wampir-ugryzienie` r27 | `tlc-wampir-bijace-serce` r5 |
| Fixture | `studio-bite-audio-0150` r3 | `studio-heart-audio-0150` r3 |
| Model | `vb_audio0150` | `vh_audio0150` |
| Full mix resref | `va_1569bd6a5a836` | `va_bc271b35f827d` |
| PCM16 mono rate/frames | 44100 / 44100 | 44100 / 88200 |
| Candidate job | `53d01fa7-b9f8-4d25-8974-1488a35d9fc7` | `64f0f72d-0855-457b-97f4-aa0d82c012b0` |
| Video job | `5713ffa8-f51f-4288-a18c-3d78b7d3c75b` | `ea43c8b8-a69d-4e0a-a45d-25d4bbb875f3` |
| ZIP artifact | `0870681d-12d8-4fba-bb0b-7eb60c3875a7` | `0139b951-b3d3-4533-97b3-71ba9ec02e5b` |

Full downloaded evidence and public artifact manifests:
`output/releases/0.15.0/audio/installed-audio-proof.json` and
`output/releases/0.15.0/audio/{bite,heart}/{candidate,video}/`.
Portable ZIP v4 was exported and imported into additional isolated projects,
with exact canonical source-document hashes on both roundtrips.

Independent verification (`audio/signal-verification.json`) recomputes each native
mix from original source samples/times without the shared mixer: **zero PCM-unit
difference** for both resources. Bite contains exact .4-second leading silence;
heart accent arithmetic is .45/1.20 seconds. Decoded Opus videos have 48000/96000
frames and zero RMS before the first clip, then positive signal. This establishes
offline timing and resource consistency, not an auditory or native approval.

## Consumer boundary

Native candidate HAKs contain real WAV resources with stable resrefs. The
preferred integration is one full mono/44.1 kHz mix with its timeline silence,
explicitly bound by the consumer to its selected `visualeffects.2da.SoundImpact`
row and triggered at VFX time zero. The alternative per-clip NSS/PlaySound path
can wait on action queues. Never trigger both strategies for the same effect.
Original sources, exact stereo/48 kHz mix, event manifest and derivative provenance
are available separately. See [audio contract and commands](../../agents/audio.md).

**Native validation remains unavailable/unperformed by Studio.** This task did
not start/control Toolset or NWN, change consumer module integration, or approve
game synchronization/repeated playback. The consumer owns that observation and
the user's final listening feedback.
