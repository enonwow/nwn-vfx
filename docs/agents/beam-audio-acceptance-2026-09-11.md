# Studio0.30.0 — finite beam audio acceptance

Delivered the [finite beam audio contract](beam-audio.md) in an isolated lab at
`http://127.0.0.1:14388`. Existing consumer14387 remains running.
Full handoff: `C:/Projects/nwn-vfx/output/beam-audio-0300/handoff.json`.

V20 source `2aeeee4d-8fe2-4d39-b998-375966ee3688@3` was publicly imported as
`391e9ae7-1e50-4010-bde4-dc45b53aaba6@1`, then forked. Deliverable:
`530f1b25-ec2e-47cc-83f8-fa02a90c5fef@3`, “V20 + Squishy Gore — 0 dB”.
Audio is start0/duration3.6/offset0/gainDb0/fadeIn0/fadeOut0. Feed3/tail0.6,
Fountain, periodic ribbon and all PNGs are preserved.

- 321/321 unit/service/export tests;0 failures/skips; build/typecheck pass.
- Public CLI example ran from the consumer repository, using a restricted actor.
  Candidate job `27dc9d36-287d-4524-97f9-7f068451fede`; preview job
  `64861802-f59f-40cd-b73a-d22df3fc04ac`.
- Native mono44100 PCM16 WAV is byte-identical to selected master SHA256
  `291802c084f443a5a3497cfa6e3036d4a23b224491952f035e939d9bdeb2d0f9`.
  158760 frames. Preview stereo48000 WAV:172800 frames, no clipping.
  Preview WAV equals candidate `audio-mix.wav`; monitor gain is not baked.
- Five MDL/TGA/TXI files are byte-identical to the visual-only control with the
  same model name. All108 decoded video frames are identical. Logical timeline
  is3.6s at30fps; Opus/WebM container reports3.608s with codec padding.
- Actual browser-host WebMCP: import/add/set, gain/timing, retry, conflict, undo,
  human clip lock, AI pause, view context and checked artifact read.
  A saved-revision edit may coexist with a local draft: the draft is retained,
  remoteRevision is shown and view.open refuses DRAFT_CONFLICT. This is not a
  blanket prohibition of domain changes.apply while the human has a draft.
  Fixture `9a6afe9d-9bc3-4bc8-89e7-54a49725455b@11` restored to master settings;
  grant revoked. Deliverable project remains@3.
- Source14387 revision3 matches the original public snapshot. No game/Toolset
  process or installation was performed; nativeVerified remains false.

Final runtime and exact CLI/config are in `lab.json`; frozen116-file manifest
is `lab/runtime-final-manifest.json`. Previous test runtime is retained. Do not
substitute a globally installed CLI with an older document schema.
