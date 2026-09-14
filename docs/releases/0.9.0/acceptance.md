# Studio 0.9.0 — custom animated trails

TLC-WYROK-STUDIO-10 adds a generic `trail` layer with an explicit timed 3D path,
local narrowing/fade, additive soft profile and optional small moving head.
UI **Dodaj smugę**, CLI and WebMCP use the same changes operations and document
schema 6. Existing documents remain supported. Generated animmesh nodes stay
internal; each source trail consumes one logical layer slot. Complete public
input, CLI/WebMCP examples and limits: [trail contract](../../agents/trails.md).

## Verification

Production typecheck, browser validator generation and build passed. Final
unit suite: **203/203 PASS**. Browser acceptance: **2/2 PASS** (custom trails and
explicit-camera regression). All 42 complete WebMCP descriptors total **60,829
bytes**, below the 60 KiB local budget and 65,536-byte host cap. Canonical schema
reconstruction and AJV equivalence pass; no input keyword was removed.

The isolated six-trail browser fixture exercises six distinct 64-point paths,
scoped adapter access, revision conflict, idempotency, human path lock, AI pause,
pending invalid human path text and project-switch refusal. Atomic path undo
preserves a subsequent head edit. A scoped CLI agent writes from a foreign cwd.
PNG, full 120-frame WebM, candidate ZIP and portable ZIP are retrieved through
the actual adapter's chunk operation, verifying every chunk and complete hash.
Portable import reconstructs the source exactly. Candidate readback checks all
12 generated body/head nodes. This test explicitly mocks browser registration;
actual host discovery is a separate proof below.

Logs: `output/trail-final-build.log`, `output/trail-final-unit.log`,
`output/trail-final-browser.log`. Fixture report:
`output/playwright/trails/report.json`; contact sheet and video are beside it.
The explicit render-camera regression passed with the new renderer. The updated trail fixture uses saved r8. PNG start/end frames verify the same
default scene with no trail visible; active PNG/WebM frames are compared with
codec tolerance. Final PNG at 2.6 s versus video frame78 RGB MAE: **1.0751904**.
Start/end PNG RGB bytes are identical, with default helpers visibly present.
Video first/last MAE: **0.0129845**, within codec tolerance.

Independent format feasibility used NWN Explorer compiler/decompiler with no
game discovery or game process. It verified all 370,176 vertex and UV samples
after binary roundtrip, with coordinate error below 1.69e-7 m. This preceding
six-trail probe did not include heads. Its separate inputs, hashes, source
provenance and limitations are recorded in [format report](../../tlc-wyrok-studio-10.md).
The product's actual head/body tables are independently read from its emitted
ASCII MDL and matched to serialized HAK resources in the product tests.

## Actual Codex WebMCP

**PASS** in a fresh Codex IAB tab running installed 0.9.0. Discovery returned all
**42 tools**, **59,737 compact bytes** after host normalization. The actual
`changes.apply` descriptor includes the trail union and fields. Agent identity
`dc43ab80-fec7-46a0-89a6-7d398991fb39` had a limited grant for the owned project
`studio-trail-host-090`; no owner credential was substituted.

The agent previewed and saved a custom path (r2/schema6), replayed the same
operation exactly, and received `REVISION_CONFLICT` for stale input. Pending
invalid human path text remained separate from four saved points and blocked
navigation with `DRAFT_CONFLICT`. A human path lock returned `LOCKED`; AI pause
returned `AI_PAUSED`. After resume, an allowed width edit produced r4. A view
change attempted before the revision event reached the tab was refused; a fresh
view inspection observed r2 and allowed the intended selection/time change.

PNG, full WebM and candidate jobs succeeded at r4, all with snapshot
`4f947331cd5a929d5d48c6606222c22430da74336f502b137cae05b64c0f14ef`.
Complete PNG (45,722 B), WebM (44,131 B), candidate ZIP (512,219 B), validation
and all three handoff manifests were received through `studio.artifacts.read`.
Each chunk and full artifact was decoded and independently SHA-256 checked in
the agent runtime. Candidate ZIP used two chunks. Actual body/head readback has
38,560 + 2,892 vertex/UV samples. No native validation is claimed.

The temporary grant was revoked; `WEBMCP_NOT_CONNECTED` confirmed cleanup.
[Live proof with IDs and hashes](../../../output/trail-live-webmcp.json).

## Activation

**Installed and running 0.9.0** after the consumer's explicit five-minute window.
Service stop/install/start used public CLI. Instance remains
`12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587`; doctor reports database/API/renderer ready.
Public before/after DTOs for **all 15 existing projects are deep-equal**, including
TLC r52/schema5. Existing human tabs were not reloaded or edited. Source/global/
user companion skill hashes match the value below. The consumer independently
confirmed its full TLC DTO, version and skill, then resumed its own authoring.
No further restart is planned for this release.

[Activation report](../../../output/trail-activation.json) and
`output/trail-projects-before-install.json` / `trail-projects-after-install.json`
record the boundary before creation of two isolated host test projects.

## Final consumer acceptance — PASS

Receiving task `01a070e3-5df3-7913-943f-854ac8ea98ee` closed
**TLC-WYROK-STUDIO-10** after reviewing the actual host proof and using public
CLI to author **tlc-wyrok r60**. The release task read the consumer's
[final review](<C:/Projects/the last city/assets/vfx/wyrok/source/studio090-final-consumer-review.json>),
[package integrity](<C:/Projects/the last city/assets/vfx/wyrok/export/r60/review/package-integrity.json>)
and [composition checks](<C:/Projects/the last city/assets/vfx/wyrok/preview/r60/review/concept-acceptance.json>).

The accepted composition uses all 32 source slots: 12 mesh, 10 emitter and
10 trail layers. All 20 generated trail nodes were read, with **684,440 vertex
samples and 684,440 UV samples**. The consumer reports 241 sets at 60 Hz,
maximum checked head-path deviation **0.021145 m**, ASCII MDL **34,804,622 B**
and HAK **47,716,724 B**, within the documented budgets.

Video job `a5e1ba9f-cb92-4934-ad6d-a7f19c7f9773` and candidate job
`918dcfb6-fb10-468d-bd4f-9b118f15553d` share snapshot
`4a3393666444a81527376f8f8ce48044e9727cbfb3f1c36a7065fd5d2d0bf441`.
The reports confirm 17 structural checks, 25 verified artifacts, 23 manifest
entries, matching loose/ZIP handoff and exact portable-v3 document roundtrip
with five source textures. PNG versus video manifestation RGB MAE is 1.2703868.

This closes functional consumer acceptance of the feature. Artistic approval
has **not** been granted; the consumer continues tuning against the original
concept. `nativeVerified:false` remains unchanged. No further implementation,
service restart or TLC mutation is requested by this acceptance callback.

## Limits

Shared 60 Hz vertex/UV samples drive editor, offline PNG/WebM and exported
animmesh. PNG interpolates at requested time; WebM samples 30 fps. Causal trail
opening takes up to 2/60 s. Source paths are linear polylines without hidden
smoothing. At most 64 authored points and 128 output segments per trail;
1,000,000 vertex samples across enabled body/head parts; ASCII MDL at most
128 MiB. Candidate diagnostics report actual cost and checked path deviation.

Offline PNG/WebM preserve the grid and reference silhouette of 0.8.0.
The no-helper scene was limited to the independent format experiment.
No scene-switch API was added. Camera and source parameters are preserved.

All previews/candidates remain `nativeVerified:false`. No native NWN/Toolset
process was used. Format integrity does not establish in-game appearance,
performance, transparency or artistic acceptance. Light, live attachment,
collision and arbitrary deforming-mesh import remain unsupported.

Final package: `output/releases/nwn-vfx-studio-0.9.0.tgz`, **1,371,358 bytes**,
SHA-256 `80387b5e0a60ab7977642babd4807443dae18a45339ba60f83097ef3e6e259f7`.
[Source manifest](source-manifest.json) binds 136 source files. Source companion
skill SHA-256: `2b1ff26f2e952caaed41c8a22c1bfc6f3ed95f8e01e65fa04e05ca77d874acfc`.
No Git commit is claimed. The preceding uninstalled tarball was superseded.
