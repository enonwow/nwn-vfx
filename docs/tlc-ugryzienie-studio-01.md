# TLC-UGRYZIENIE-STUDIO-01 — custom mesh deformation

2026-09-07. Requested by task `01a070e3-5df3-7913-943f-854ac8ea98ee`.

**Implemented, installed and accepted: Studio 0.11.0.** Public CLI and actual
Codex WebMCP can author fixed-topology vertex animation, render it and retrieve
ASCII/binary candidates. This provides the generic capability requested for
Ugryzienie; the approved v6 artwork and the target project were not authored by
this implementation task. Native visual qualification remains with its runner.

## Installed interface and example

- Endpoint: `http://127.0.0.1:4317`.
- Instance: `12d0fa8e-4887-4f00-ad74-9bb15b05c057`.
- Workspace: `7def76b2-ad42-4b55-a5e8-d919b79a8587`.
- Global CLI: `nwn-vfx`, installed package `nwn-vfx-studio@0.11.0`.
- Tarball: `output/nwn-vfx-studio-0.11.0.tgz`, SHA-256
  `506031f9d8025ea4cd3f13f201341cba88ad0bf44cbdc8351765a0dcb077ff01`.
- Source and installed user skill have identical SHA-256
  `4be4f462b304c3c284fd6626b98b3efcc090c70e51fc3f8dc06acd95244caed3`.

The complete [agent guide](agents/mesh-deformation.md) defines the schema,
coordinates, timing, normals, transforms, limits and sequential CLI/WebMCP
recipes. Copyable inputs are in [examples/deformation](agents/examples/deformation/):
`changes.json`, `red-surface.png`, `camera.json` and `effect-document.json`.
The same files are included in the installed package's `docs/agents` directory.

Use existing `changes.preview/apply` with a mesh `animation.vertices` channel:
`[{time, value:[[x,y,z],...]}]`. Coordinates are absolute mesh-local Z-up metres;
every key preserves vertex count/order, faces and independent UV indices.
Document schema promotes to 7. The human can edit the channel in the mesh
animation JSON editor. Pending text remains visible in WebMCP's draft context.
Human locks, AI pause, optimistic revision checks, idempotency, history,
selective undo and portable project ZIPs apply to this channel.

The technical example is a small red surface with seven vertices and five
triangles, normal blend, PNG texture and black self-illumination. It starts at
0.40 s, grows sideways with an irregular bend and fades by 0.85 s. It is not an
artistic Ugryzienie candidate. Local key 0.137 s deliberately falls outside the
global 60 Hz grid.

## Verification

- **209/209 unit/service/contract tests pass**, including validation limits,
  fixed UV topology, shape/normals, resampling, ASCII/binary readback, corrupted
  sample rejection, revisions, human locks, pause, undo and ZIP preservation.
  Log: `output/ugryzienie-01-unit-tests-final.log`.
- **1/1 browser acceptance passes**: public CLI from a foreign working
  directory, a controlled WebMCP registry, human JSON draft conflict, PNG/WebM,
  ASCII/binary and all artifact hashes. This registry test is separate from the
  actual host proof below. Report: `output/playwright/deformation/report.json`.
- **Typecheck and build pass**: `output/ugryzienie-01-build.log`.
- **Installed CLI acceptance passes** from `C:\Projects\the last city`, using
  project `studio-ugryzienie-01-deformation`, revision 3, schema 7. All four jobs
  succeeded and every downloaded artifact's size and SHA-256 was checked.
  Report and files: `output/ugryzienie-01/installed/`.

| Installed CLI result | Job ID |
| --- | --- |
| PNG at 0.60 s | `82739582-0efb-496a-ba97-b2fe38a192f3` |
| Full 2 s WebM | `23eab741-5fa5-477b-a569-1867071aed50` |
| ASCII candidate | `76eaa57f-6a45-4422-99d5-ffa1501b22a3` |
| Binary candidate | `6d39aafd-db8a-4ca3-8a42-4b74478cc832` |

Preview metadata and ASCII readback have identical sample hashes:

- 121 frame sets, period 1/60 s, 847 position and 847 UV samples.
- Animverts SHA-256:
  `f9bc44b6a928ef17f7d017136a3928c76b38fb14fe923eb40813affb4f882642`.
- Animtverts SHA-256:
  `ffbe0f141281f50b0720cc8efb973d743125d5a28458a1a28d9a6afd35551ee7`.
- Maximum local resampling deviation: `0.002951302779874967` m (about 2.95 mm).
- Binary all-sample readback maximum numeric error: `5.463258787030689e-8`.
- Browser PNG versus WebM frame at 0.60 s: mean absolute RGB error
  `1.055627712673611/255`; 12,729 changed red pixels versus the inactive frame.

## Actual Codex WebMCP proof

A fresh diagnostic tab in the real Codex In-app Browser discovered all 42 tools
and the schema 7 deformation capability. The tool descriptors use compact local
`$defs` references and stay within the tested 60 KiB host descriptor budget.

Through the actual host's `webmcp` capability, an agent with a normal limited tab
grant inspected context, forked the example to `studio-ugryzienie01-host`,
previewed and applied a changed vertex key to revision 2, built a binary
candidate and retrieved **all 12 artifacts via `studio.artifacts.read`**. Each
decoded file matched its independently computed SHA-256, reported chunk hash,
full hash and byte size. No owner credential was read or substituted.

Binary job: `ac1fa2a1-cafa-4e8f-bc15-bbb1e49f0acd`, succeeded. Its readback
verifies all 847 position and UV samples; the changed key gives maximum local
resampling deviation `0.003018186233372104` m. Binary roundtrip is verified.
The visible original example remained revision 3. The tab grant was revoked
through the UI, `WEBMCP_NOT_CONNECTED` was confirmed, and the diagnostic tab
was closed. Evidence: `output/ugryzienie-01/live-webmcp.json`.

## Preservation and limits

The activation snapshot preserved the same instance/workspace, all 21 original
project revisions and all three historical STUDIO-14 job DTOs. Twenty current
project DTOs were unchanged. The consumer independently advanced
`tlc-wampir-ugryzienie` from r5 to r6 with owner operation
`1bd67464-1a37-4dfb-8479-03679717b0f1` at `2026-09-07T11:42:17.566Z`; it confirmed
this was its teeth geometry/texture edit. Original r5 was verified unchanged.
Snapshots: `output/ugryzienie-01/before.json` and `after.json`. The two added
projects are our isolated technical fixtures.

Limits are explicit: 1–64 vertex keys, 2048 vertices, finite coordinates within
±20 m, 6 MiB compact document, and a shared enabled mesh/trail budget of
1,000,000 position samples and 1,000,000 UV samples. Layer transforms apply
after deformation; uniform scale multiplies the reported local error.
Faces/UV remain fixed. There is no fluid simulation, topology change or
automatic repair of folded/collapsed faces.

Preview recomputes normals each frame under fixed Lambert lighting. Export
contains animated vertex samples and fixed topology, without animated normal
keys. Native normal recomputation, transparency and wet shading are unqualified.
PNG highlights are baked; no PBR, dynamic reflections or authored lights are
added. `nativeVerified` remains false. The runner must evaluate the actual
Ugryzienie candidate in NWN.

The historical `empty` preset still creates `sparks`, and the document requires
at least one layer. This explains the reported empty-project surprise. The
example explicitly replaces that emitter with the authored mesh in one change;
the secondary preset behavior was not changed for this request.
