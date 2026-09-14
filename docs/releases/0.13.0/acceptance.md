# Studio 0.13.0 — effect palette acceptance

Released locally on 2026-09-07. UI, CLI and WebMCP now offer the same reviewed,
atomic palette operation for whole effects or explicit layer selections.
PNG recoloring is opt-in and creates immutable derivatives. Timing, geometry,
UV, alpha, source images and independent history remain intact.

## Installed identity

- URL: http://127.0.0.1:4317/
- CLI and service: 0.13.0; API envelope: 0.1.0.
- Instance: `12d0fa8e-4887-4f00-ad74-9bb15b05c057`.
- Workspace: `7def76b2-ad42-4b55-a5e8-d919b79a8587`.
- Package: `output/releases/nwn-vfx-studio-0.13.0.tgz`; SHA-256 in `source-manifest.json`.
- All 26 pre-existing project revisions and canonical document hashes matched
  after the update. Only two new, own acceptance projects were created.
- Installed skill: `C:/Users/enonw/.codex/skills/nwn-vfx/SKILL.md`.

## Verification

- Build and TypeScript check passed.
- Full unit/service suite: **227/227 passed**.
- Seven palette core tests passed again after strengthening export assertions.
- Browser acceptance passed: UI review/commit, CLI from a foreign cwd, registered
  WebMCP calls, artifact reads, PNG/WebM and resource export at the same snapshot.
- The real Codex in-app browser discovered all **44 tools**. Through its WebMCP
  connector, an agent inspected the view, forked revision 1 of an own fixture,
  previewed and committed red-to-green recoloring, retried the same operation,
  received `REVISION_CONFLICT` for a stale write, opened its fork and retrieved
  the completed PNG with matching chunk/full SHA-256 and size.
- Separate service tests cover human locks, AI pause, project/scopes, proposal
  hash, atomic rejection and selective undo with independent/dependent edits.
- Core tests cover multicolor emitters, trails, explicit/legacy materials,
  neutral/black channels, PNG alpha/detail, excluded/disabled/shared textures,
  tinted-material refusal, eight-asset and real six-MiB document limits.
- Discovery descriptors: 61,429 UTF-8 bytes, below the 61,440-byte test budget
  and 65,536-byte host cap. Schema validation keywords are preserved.
- Updated skill passed `quick_validate.py`.

## Reviewable evidence

Paths below are relative to `C:/Projects/nwn-vfx`.

- `tests/fixtures/palette.ts`: synthetic red-detail PNG, mesh, neutral comparison
  mesh, multicolor emitter, trail and excluded shared-texture reference.
- `output/playwright/palette/palette-ui-preview.png`: reviewed A/B dialog.
- `output/playwright/palette/before-preview.png`, `after-preview.png`,
  `video-preview.webm`: same fixture before/after; changed render pixels 7,456,
  PNG/video mean absolute RGB error 1.073 on the tested frame.
- `output/playwright/palette/report.json`: saved-snapshot equality and texture
  lineage. PNG, WebM and export handoffs match snapshot
  `7c3a03a7f97f565da29995d4ed6e0c9479f9b427f739c1f0d5b2bfe40e2fcd8d`.
- `output/playwright/palette/export-validation.json`: geometry/controller/UV
  readback and exact exported RGBA validation.
- `output/releases/0.13.0/before-install.json`, `installed-proof.json`: preserved
  installation identity and original project hashes; own CLI proof project
  `studio-palette-0130-proof`, revision 2.
- `output/releases/0.13.0/live-webmcp-proof.json`: actual Codex-host calls and
  artifact identity; own project `studio-palette-0130-webmcp-proof`, revision 2.
- `output/palette-all-unit-final.log`, `palette-browser-final.log`,
  `palette-build-final.log`: test/build output.

## Use

Save the UI draft, choose **Paleta efektu**, source/target hue, scope and optional
PNG transformation. **Podgląd palety** shows A/B and differences;
**Zatwierdź paletę** saves one revision. Cancel discards only the proposal.

Full contract and CLI/WebMCP examples: [palette.md](../../agents/palette.md).
The options file is an object with `from`, `to`, `scope` and `textureMode`.

```text
nwn-vfx --json palette preview --project PROJECT_ID --expected-revision N --input-file palette.json
nwn-vfx --json palette apply --project PROJECT_ID --expected-revision N --input-file palette.json --proposal-hash HASH_FROM_PREVIEW --idempotency-key YOUR_STABLE_KEY
```

WebMCP uses `studio.palette.preview({viewSessionId,input})`, then
`studio.palette.apply({viewSessionId,input:{...input,proposalHash},idempotencyKey})`.
Connect the intended project via the UI and inspect the connection/view first.

## Limits

Hue anchors do not replace brightness/saturation; neutral colors remain exact.
No semantic masks or blood/bone recognition. Chromatic multipliers on a custom
PNG reject texture transformation to avoid double recoloring. Asset/document
limits reject the entire operation; originals are never automatically removed.
Native appearance remains unqualified. No Toolset/NWN execution, MOD/HAK
installation or native integration/proof was performed for this release.
