# Studio 0.16.0 — amplification to 200% and explicit clipping

Installed and verified on 2026-09-08 at http://127.0.0.1:4317/.
The saved audio clip gain now accepts **0–2** through UI, CLI, WebMCP, canonical
and generated schemas, browser playback, rendered audio, native WAV derivatives
and portable ZIP import/export. UI percentages cover 0–200%; 100% is source
level, 150% means linear amplitude multiplied by 1.5. The monitor remains local,
0–1, initially muted at 0.15. Original audio bytes are never rewritten.

Audio capability version is 2. Document schema 9, portable ZIP v4 and API envelope
0.1.0 retain their shapes, with the gain bound expanded. Above-unity projects need
Studio 0.16.0+; refresh closed client schemas and use a new tab, preserving any old
human draft. Exporter identifiers advance to `nwn-ascii-vfx-0.16.0` and
`nwn-binary-vfx-0.16.0`; corresponding validation requirements remain enforced.

## Signal reporting

UI **Poziomy audio** reports the applied draft. `changes.preview/apply` return
structured `diagnostics[].audio` for stereo/48 kHz and mono/44.1 kHz. Each report
identifies pre-clamp sample peak, samples above absolute 1, and channel samples
outside PCM16 [-1, 32767/32768]. The latter include the positive +1 boundary.
Clipping emits `AUDIO_CLIPPING` / warning. The mix is explicitly hard clipped and
quantized to PCM16; **no normalization or limiter** was introduced.

Native `audio-events.json` adds levels for individual event WAV files and the
preferred full mono WAV; stereo mix levels remain available. Candidate validation
includes clipping warnings. WebM metadata retains peak/count and reports the
level message in limitations. These are sample peaks, not reconstructed true
peaks. Lossy Opus, positional game audio and perceived loudness are separate.
Full command examples and limitations: [audio contract](../../agents/audio.md).

## Verification

- Build, final TypeScript, skill validation and UTF-8 checks passed.
- **18/18** audio/service/contracts/generated browser validators/descriptor tests
  passed: `output/audio-amplification-unit.log`. Gains 0, .5, 1, 1.5 and 2 preserve
  independently expected PCM, exact original assets and portable roundtrips.
  Native full mono and stereo WAV sample values are checked. A separate overload
  signal proves exact hard clipping, unclipped values, rounding, both signs and
  the positive PCM16 ceiling. Invalid gains are rejected. Rights, conflicts,
  idempotency, history/undo and restart remain covered.
- **Six browser scenarios** passed across recorded runs. Four existing scenarios
  (project switch, two concurrent-save cases, scoped WebMCP) passed in
  `output/audio-amplification-browser.log`. The final new amplification scenario
  and full authoring/export/mobile scenario passed in
  `output/audio-amplification-browser-final.log` (16.84 / 18.32 s).
  Initial failures found an incorrectly encoded new test string and an existing
  mobile toolbar overflow. The string is UTF-8 and project actions now wrap on
  small screens; final runs above passed. Initial exporter-version contract
  omissions and an invalid short test fixture were corrected before unit success.
- Browser `audioTimelineBuffer` at gains 0/.5/1/1.5/2 and downloaded WebM-sidecar
  WAV at gain1.5 differ from independently interpolated source samples by at most
  **0.5 PCM16 sample units**. Zero gain is exact silence. Monitor does not affect
  export. Overlap fixture peaks at 1.46484375 in stereo with 15024 clipped channel
  samples; mono peak .3661150251 is unclipped. Both appear clearly in the UI.
  Report: `output/audio-amplification-acceptance/report.json`; visually inspected
  screenshots: `clip-volume-150.png` and `clipping-warning.png` in that directory.
- Installed CLI `changes preview` succeeded from `C:/Projects/the last city` on
  the independent fixture, producing gain1.5 and structured levels without save:
  `output/releases/0.16.0/cli-preview.json`.
- **Real host WebMCP PASS**: a fresh Codex tab discovered 48 tools and gain max2.
  Scoped agent saved fixture `studio-amplification-0160` / `host_clip` from r1
  gain1 to r2 gain1.5. Both controls displayed 150 with max200. Retrying the same
  key returned r2; assets were identical. Final view clean, paused at0, muted,
  unlocked false, no active sources. The grant was revoked and connection inspect
  returned `WEBMCP_NOT_CONNECTED`. The separate new tab remains available.
  Evidence: `output/releases/0.16.0/real-host-webmcp.json`.

## Consumer previews and preserved state

Only `changes.preview` was performed on the accepted consumer documents. Applying
gain1.5 to all existing audio clips produced these sample peaks with **zero
clipped samples** in both mixes:

| Project / saved revision | Clip IDs | Stereo peak | Mono NWN peak |
| --- | --- | --- | --- |
| `tlc-wampir-ugryzienie` r29 | `bite_contact` | .238632202148 | .203631031270 |
| `tlc-wampir-bijace-serce` r7 | `heart_cycle_1`, `heart_cycle_2` | .266555786133 | .266555786133 |

These previews did not save gain. Production still has gain1. The consumer can
apply the recorded changes against current revisions, build its candidates and
perform its own native integration/demo/recording. Full proposals and unchanged
hashes: `output/releases/0.16.0/consumer-gain-preview.json`.

All **43 preexisting projects** retained exact revisions and canonical hashes
after installation and again after real WebMCP acceptance. In particular:

- Ugryzienie r29 SHA-256
  `3d6b6fd6ac08767429b9926681bb3d809964919145b7102152eee11cc9c0a880`.
- Serce r7 SHA-256
  `85b949b06e8227b7a911b06381076c55ef6794d9b5713125e9ae05644f70277f`.

Evidence: `output/releases/0.16.0/{before-install,installed-preservation}.json`.
Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587`. Installed and repo skills match.
Package `output/releases/nwn-vfx-studio-0.16.0.tgz`: 2185906 bytes, SHA-256
`f88b6961da440da7111441ab27e646be0c62d9f47839a08f2addc728f4911502`.
[Source inventory](source-manifest.json) records 217 files; no commit claimed.

Studio did not change consumer projects, source audio, MOD/HAK installations or
native demos, and did not launch or control Toolset/NWN. Export readback is not
native verification; the consumer owns native integration and recording.
