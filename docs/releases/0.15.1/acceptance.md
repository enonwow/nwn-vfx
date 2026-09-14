# Studio 0.15.1 — reset playback when switching projects

Activated locally on 2026-09-08. Selecting a one-second audio project while a
three-second project plays past two seconds now leaves the new project at
**time 0, paused, muted and with no active audio source**. The next Play starts
at zero. The same reset applies to UI project loading and WebMCP `view.open`.

The outgoing requestAnimationFrame callback could run between React's new DOM
commit and the passive effect that reconfigured the audio clock, replacing the
requested zero with the old project's position. Project loading now stops and
resets the clock synchronously. Stale callbacks check the current draft identity
and effect lifetime before publishing a time or scheduling another callback.

## Regression evidence

`tests/browser.project-playback.acceptance.ts` uses isolated projects and a real
Chromium UI. A MutationObserver deliberately delivers an outgoing animation
callback at the DOM-commit boundary, exercising the timing race consistently.
No context clock or player position is fabricated.

- Previous installed 0.15.0 bundle: **FAIL**, retained time
  `2.0456000000238417` instead of zero. `output/project-playback-before.log`.
- New 0.15.1 build: **PASS** with both initially locked audio and a real unlocked
  AudioContext. Initial times 2.014 / 2.032 s; after switching, time and slider
  equal zero, paused/muted, activeSources 0. Play was observed at .0106667 / 0 s.
  `output/project-playback-regression.log`.
- Five browser scenarios passed on the new build: audio authoring/transport,
  project switching, delayed save with concurrent human edits, polling during
  save, and scoped WebMCP drafts/revocation. `output/project-playback-after.log`.
- Build, TypeScript and skill validation passed. This UI patch does not rerun or
  claim a new full core/export suite; the 0.15.0 full suite remains separately
  recorded at 242/242. Exporter/resource format stays **0.15.0**.
- Installed 0.15.1 bundle: **PASS** using the same isolated regression (8.38 s);
  `output/project-playback-installed.log` and
  `output/project-playback-acceptance/report.json` identify its exact web directory.

## Installation and preservation

Service/CLI 0.15.1 at `http://127.0.0.1:4317`. Instance
`12d0fa8e-4887-4f00-ad74-9bb15b05c057` and workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587` are unchanged. Snapshot before installation
found 42 projects and no active jobs; all 42 revisions and canonical document
hashes matched after restart. Evidence:
`output/releases/0.15.1/{before-install,installed-preservation}.json`.

- `tlc-wampir-ugryzienie` r29 preserved, document SHA-256
  `3d6b6fd6ac08767429b9926681bb3d809964919145b7102152eee11cc9c0a880`.
- `tlc-wampir-bijace-serce` r7 preserved, document SHA-256
  `85b949b06e8227b7a911b06381076c55ef6794d9b5713125e9ae05644f70277f`.
- Package `output/releases/nwn-vfx-studio-0.15.1.tgz`, 2180205 bytes,
  SHA-256 `f78fa7a715fb8f34907d7db562e6760545bf40d4b8aa9e7cd384a2ccaaebbe37`.
  [Source inventory](source-manifest.json) records the local source; no commit.
- Agent skill updated in source and installed location. An already loaded tab
  still contains its previous JavaScript: preserve human drafts and use a fresh
  tab to verify the new build.

No consumer project edit, new resource build, native integration, Toolset/NWN
launch or native proof was performed by this patch task. Consumer validation and
the heartbeat listening approval remain separate from this browser fix.
