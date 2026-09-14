# Studio 0.14.0 — smooth deformation acceptance

Activated locally on 2026-09-07. Custom mesh layers now accept `shading:smooth`
together with `animation.vertices` through UI, CLI and WebMCP. Studio, PNG and
WebM recompute area-weighted shared-position normals from interpolated 60 Hz
positions. Geometry, UV, authored keys and source sample budgets remain intact.

## Installed identity and preservation

- Endpoint: http://127.0.0.1:4317/ ; CLI/service 0.14.0, API envelope 0.1.0.
- Instance: `12d0fa8e-4887-4f00-ad74-9bb15b05c057`.
- Workspace: `7def76b2-ad42-4b55-a5e8-d919b79a8587`.
- Before restart: **31 projects, zero active jobs**. Every pre-existing project
  revision and canonical document SHA-256 matched after the update.
- One own installed acceptance project was added:
  `studio-smooth-deformation-0140-proof`, revision 2.
- Its installed PNG job `2820e106-5d44-4131-846a-b0d9e7930857` and binary job
  `cf9ff8c9-c716-4548-9328-b93d4e9160da` succeeded. Downloaded artifacts passed
  full SHA-256 and size checks; derived normal hashes match across both jobs.
- Updated skill installed at `C:/Users/enonw/.codex/skills/nwn-vfx/SKILL.md`.
- Package: `output/releases/nwn-vfx-studio-0.14.0.tgz`; hash in the adjacent
  `source-manifest.json`. No pinned compiler binary/source change.

## Verification

- Build and TypeScript checks passed; skill validator passed.
- Full unit/service suite: **232/232 passed**.
- Final browser acceptance: **2/2 passed**, covering rigid and deforming smooth
  meshes through human editing, CLI from another cwd, registered WebMCP tools,
  drafts, saved revisions, PNG/WebM, ASCII and binary export and artifact reads.
  This acceptance uses a controlled WebMCP host registry, not a claim of a new
  real-Codex-host session for 0.14.0. All 44 descriptors and schemas pass their
  existing host-budget and canonical-equivalence tests.
- Service tests cover combined public smooth+animation commit, locks on
  shading/geometry/animation, AI pause, revisions, idempotency, history, undo
  preserving independent changes and portable ZIP. Flat and rigid regressions
  remain covered.
- Continuous normal validation rejects triangle collapse between sampled
  endpoints and cancelling shared normals; zero-time keys remain overrides.
  Mutation after a successful validation is rechecked. One exact input is
  cached to avoid repeating the motion proof for material-only edits.
- Binary corruption tests alter a stored normal in the **animation tree** and
  the legacy animated-normal array count; both fail validation.
- Own fixture: two disconnected rounded components, two nonuniform contractions,
  independent per-face UV. 121 position sample sets; 104,544 derived corner
  normal samples. Smooth/flat frame comparison differs by >20 intensity on
  2,782 pixels; PNG/WebM mean absolute RGB error is about 1.102 at frame 15.
- Binary proof checks 1,728 stored corners across two smooth animmesh nodes
  (base and animation), maximum component error about 1.732e-7. The actual
  animated-normal array counts are zero.

## Read-only consumer compatibility

An in-memory copy of `tlc-wampir-bijace-serce` r3 with smooth enabled passed
the new validation: 1122 positions, 2240 triangles, 1675 UV, 62 authored keys,
121 sample sets, 135,762 position samples and 202,675 UV samples. No public
commit or export of that consumer project was performed. Its revision and
canonical SHA remained `b47d2cb718fd03b991fe0f1c290d755efcba74fdd6b274e5473e4a4394d955e9`.
This establishes input compatibility, not native appearance or artistic approval.

## Contract and exact export limitation

See [smooth-deformation.md](../../agents/smooth-deformation.md) for commands,
metadata definitions, limits and pinned upstream source evidence.

`capabilities.meshShading` reports `smoothGeometry:custom`,
`vertexDeformation:true`, dynamic preview normals and
`exportedAnimatedNormals:false`. ASCII preserves smoothing mask 1 and every
position/UV sample. The unchanged compiler stores **static base normals**;
direct readback verifies them in both base and animation smooth animmesh nodes.
The normal-frame hash is derived from parsed positions, not an exported normal
channel. The result warns with `MESH_ANIMATED_NORMALS_NOT_EXPORTED`.

The layout has a legacy `m_avAnimNormals` field, but the pinned compiler has no
animated-normal input and leaves its counts at zero. This is a limitation of
the supported pipeline, not a universal assertion about all NWN tools/formats.
No normal animation, native normal recomputation, native lighting or playback
parity is claimed. `nativeVerified:false`; no Toolset/NWN launch, native tooling,
MOD/HAK installation or native proof was performed.

## Evidence paths

Relative to `C:/Projects/nwn-vfx`:

- `output/playwright/smooth-deformation/`: UI screenshot, smooth/flat PNG, WebM,
  ASCII/binary validations, exported ZIPs, exact-snapshot handoffs and report.
- `output/releases/0.14.0/before-install.json`, `installed-proof.json` and
  downloaded `png-*` / `binary-*`: deployed service identity and acceptance.
- `output/releases/0.14.0/source-compatibility.json`: consumer read-only check.
- `output/smooth-deformation-unit-final.log`, `smooth-deformation-browser-final.log`,
  `smooth-deformation-build-final.log`: final regression/build results.
- `tests/fixtures/smooth-deformation.ts` and
  `docs/agents/examples/smooth-deformation/`: own fixture and portable example.

To smooth an existing authorized mesh, apply only
`[{"type":"layer.set","layerId":"YOUR_ID","values":{"shading":"smooth"}}]`
through `changes preview/apply` at its current revision with a stable key.
The consumer chooses when to edit its own project; this release did not edit it.
