# Studio 0.17.0 — clip volume to 400%

Installed on 2026-09-08 at http://127.0.0.1:4317/. Saved clip gain now accepts
**0–4**, with UI controls covering **0–400%**. Setting gain3 / 300% doubles the
amplitude compared with gain1.5 / 150%. The bound is shared by core validation,
canonical and generated browser contracts, CLI/WebMCP, preview, native WAV and
portable import/export. UI bound/help text derives from the same constant.

Audio capabilities version is **3**, gain `{min:0,max:4,unity:1}`. The report peak
bound derives from 32 clips times gain4 (128), so valid heavy clipping reports
cannot be rejected by the response schema. API 0.1.0, document schema9, ZIPv4,
48 WebMCP tools and exporter/resource format 0.16.0 remain unchanged. Gains
above2 require Studio0.17.0+ and refreshed schemas; preserve old human tabs and
open a separate new tab to use the new build.

Source WAV/MP3 bytes, timing, gain envelopes and mixing algorithm are unchanged.
Clips add linearly, then hard clip to PCM16 with explicit diagnostics. There is
no normalization or limiter. The monitor remains local 0–1 and initially muted
at0.15. Drafts, locks, AI pause, history, undo and idempotency still apply.

## Tests and live acceptance

- Build/typecheck and skill validation passed.
- **19/19** audio/service/contract/generated-validator/descriptor tests passed:
  `output/audio-300-unit.log`. Independent sample expectations cover gains
  0/.5/1/1.5/2/3/4, exact source preservation and portable roundtrips. Invalid
  values above4 are rejected. Existing clipping, rights and undo tests pass.
- A direct comparison of gain3 against gain1.5 verifies stereo48k preview and
  mono44.1k native WAV: pre-clamp peaks are exactly twice as large and each
  quantized sample differs from twice the former sample by at most **one PCM16
  unit**. This comparison includes two independently quantized signals.
- **5/5 browser scenarios** passed: `output/audio-300-browser.log`. They cover
  300% control synchronization, 400% maximum, invalid/pending text, Apply/Save,
  undo/locks/AI pause, source preservation, local monitor, WebM audio, project
  clock reset, concurrent saves and scoped WebMCP/revocation. The new full audio
  scenario took23.49s. Compared with unquantized expected samples, the downloaded
  gain3 WAV and browser buffers differ by at most **0.5 PCM16 unit**.
- An overlapping test mix produces peak2.9296875 with37440 clipped stereo
  channel samples; mono remains below1. The warning remains visible and no
  automatic gain change occurs. Report and inspected UI screenshot:
  `output/audio-300-acceptance/{report.json,clip-volume-300.png}`.
- Installed **public CLI** ran from `C:/Projects/the last city` on an independent
  fork: `changes preview` then `changes apply` gain3 committed r2. Exact audio
  assets were preserved. Evidence:
  `output/releases/0.17.0/{cli-preview,cli-apply,fixture}.json`.
- **Actual host WebMCP PASS** in a fresh Codex tab. Discovered48 tools and gain
  max4. Own fixture `studio-amplification-0170` / `host_clip`: CLI r2 gain3;
  WebMCP r3 gain1.5; WebMCP r4 gain3. Both reported peaks doubled exactly, and
  controls displayed300 with max400. Retrying the same key returned r4. Source
  assets were identical; final view clean, paused at0, muted, unlocked false,
  activeSources0. Grant revoked: `WEBMCP_NOT_CONNECTED`. The separate new tab
  remains available. `output/releases/0.17.0/real-host-webmcp.json` records this
  independently of the automated test's controlled WebMCP registry.

## Consumer handoff

Production was only inspected and previewed, without saving. Applying gain3 to
the existing clips produces **zero clipped samples** in both target mixes:

| Preserved project | Clips | Proposed stereo peak | Proposed mono peak |
| --- | --- | --- | --- |
| `tlc-wampir-ugryzienie` r30 | `bite_contact` | .477264404296 | .407262062540 |
| `tlc-wampir-bijace-serce` r8 | `heart_cycle_1`, `heart_cycle_2` | .533111572266 | .533111572266 |

They remain at gain1.5. Full proposals and hashes are recorded in
`output/releases/0.17.0/consumer-gain-preview.json`.

Example changes JSON for Ugryzienie:

```json
[{"type":"audio.set","clipId":"bite_contact","values":{"gain":3}}]
```

For Serce use two `audio.set` changes, one per `heart_cycle_1` and
`heart_cycle_2`, each with `values:{"gain":3}`. Consumer reads the current revision
and calls CLI `changes preview/apply --project ID --expected-revision N
--input-file PATH` (apply also needs `--idempotency-key KEY`), or WebMCP
`studio.changes.apply({viewSessionId,input:{projectId,expectedRevision,changes},
idempotencyKey})`. Full [audio contract](../../agents/audio.md) describes reports.

All **44 preexisting projects** retained revisions and canonical document hashes
after installation and live acceptance. Preserved production hashes:

- Ugryzienie r30: `2239ae4b1aeaec76cc84b343dc5d4fd0dc87007a5830ac3fe81f050eded9f41f`.
- Serce r8: `d97deb4037e329ac811f7c2bed6119991b8cfdda1f0fc3c04fef2c166c468314`.

Evidence: `output/releases/0.17.0/{before-install,installed-preservation}.json`.
Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587`, unchanged. Installed skill matches source.
Package `output/releases/nwn-vfx-studio-0.17.0.tgz`:2186677bytes, SHA-256
`23c85c9c677d50b8503bb9e27e6883e737659e5b5c0a07a39469024d86152d00`.
[Source inventory](source-manifest.json) records218 files; no commit claimed.

Sample peaks are not reconstructed true peaks. Opus, game attenuation and
perceived loudness require their own assessment. No native launch/control,
module integration or demo recording was done here; the consumer performs those
steps on its selected new revisions. Resource readback is not native proof.
