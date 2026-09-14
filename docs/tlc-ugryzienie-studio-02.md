# TLC-UGRYZIENIE-STUDIO-02 — rigid mesh smooth shading

2026-09-07. Requester: task `01a070e3-5df3-7913-943f-854ac8ea98ee`.

**Completed and installed: Studio 0.12.0.** Mesh shading is available through
public layer operations, UI, CLI and actual Codex WebMCP. Preview and ASCII
share the normal rule; binary candidates additionally read and verify the
actual stored normals. The author's Ugryzienie project, geometry and artwork
were not modified by this task. Native/artistic acceptance remains external.

## Contract and usage

Optional mesh field `shading:"flat"|"smooth"`; omission retains the previous
flat appearance. Null in `layer.set` removes the explicit value. Explicit use
promotes schema 8; schemas 1–7 remain readable. The public capability is
`meshShading`. A minimal change for an inspected rigid custom layer is:

```json
[{"type":"layer.set","layerId":"YOUR_MESH_LAYER_ID","values":{"shading":"smooth"}}]
```

Use current `expectedRevision`, preview first, apply with a stable idempotency
key. `layer.add` accepts the same field. UI **Cieniowanie** provides the human
equivalent. The field is protected by shading/whole-layer locks, AI pause,
revisions, history, selective undo and portable ZIP. No new tools/scopes.

Full operations, material choice, geometry rules and limits:
[mesh-shading.md](agents/mesh-shading.md). Complete technical inputs:
[examples/shading](agents/examples/shading/). These files are also installed in
the global package's `docs/agents` directory; the user skill was updated.

Smooth requires `geometry.kind:custom` and no `animation.vertices`. Rigid
position/orientation/scale/alpha keys remain allowed. Area-weighted normal
sums use shared **position indices** only. No coordinate/proximity welding is
performed. Independent UV indices retain smoothness across texture seams;
separate position indices retain separate normals even at coincident points.
Cancelled/undefined normal sums reject the change. Neither polygon count nor
silhouette changes; this is not subdivision or PBR.

## Verification and files

- **213/213 unit/service/contract tests pass**:
  `output/ugryzienie-02-unit-tests.log`. New coverage includes schema/default
  compatibility, scope rejection, area weighting, independent UV seams,
  separated and coincident components, mask and binary-normal corruption,
  permissions, pause, locks, revisions, undo, history and ZIP.
- **1/1 browser acceptance passes**:
  `output/ugryzienie-02-browser-tests.log`. It exercises the human selector,
  unsaved draft conflict, controlled WebMCP registry, foreign-cwd CLI, PNG/WebM
  and both candidates. Full report/images: `output/playwright/shading/`.
- **Typecheck/build and final five affected tests pass**:
  `output/ugryzienie-02-build-final.log`,
  `output/ugryzienie-02-final-focused.log`.
- **Installed CLI acceptance passes from `C:/Projects/the last city`**:
  `output/ugryzienie-02/installed/report.json`. Each job succeeded, and all
  downloaded artifacts matched their complete size and SHA-256.

The technical example has two disconnected rounded components, 148 positions,
288 triangles and 864 independent UV corners. Normal readback checks all 864
corners. Maximum stored float32 component error is
`1.731803411786359e-7`, within the explicit tolerance `0.0002`.
Preview and ASCII corner-normal SHA-256:
`0ddc72bdff21f6124590f84ed612bc6ece925c4ca0b221b3fb367567be41762a`.
Actual binary corner-normal SHA-256:
`8232ba2ce367977a02fd0b49adae2146a00fedfe6bdfe43a90f0d6f62f718d25`.
Different hashes reflect float32 arithmetic and are compared numerically.

The flat/smooth PNG comparison changes 4,399 pixels by more than 20/255 in the
red channel; visual inspection confirms smooth surface lighting while retaining
the same polygonal outline. PNG at 0.5 s versus WebM frame 15 has mean absolute
RGB error `1.1104768880208333/255`.

| Installed example `studio-ugryzienie-02-shading`, r3 | Job |
| --- | --- |
| PNG, 0.5 s | `fc24c571-052f-48a7-97f1-5b229745863a` |
| WebM, full 1 s | `7f778c82-9ae9-4b0b-9b5a-1da5e72cad8d` |
| ASCII | `eaf7fb46-c950-48b0-a871-64c459862e14` |
| Binary | `121f5b14-3b56-45a7-aab1-3cf2c588b9bd` |

## Actual host and installation

Actual Codex WebMCP discovered 42 tools with schema 8. Through a normal limited
tab grant, it forked the example to `studio-ugryzienie02-host`, changed flat at
r2 to smooth at r3, built binary job
`634c18f2-6c5e-49ab-bee6-bee16ab7fb8e` and retrieved **all 12 artifacts using
`studio.artifacts.read`**, independently checking each chunk/full SHA-256 and
byte count. The readback verified all 864 normals. Source example r3 remained
unchanged. The grant was revoked, `WEBMCP_NOT_CONNECTED` confirmed, and the
diagnostic tab closed. Evidence: `output/ugryzienie-02/live-webmcp.json`.

Installed endpoint `http://127.0.0.1:4317`, instance
`12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587`.
Tarball `output/nwn-vfx-studio-0.12.0.tgz`, SHA-256
`2edf2c88f958caad86f4fa949dad58d69790174eaf776efeb213c40a426f6b13`.
Source/user skill SHA-256:
`c716534bdaf08f5eeb5822f732e354793648b658cc0bc02f24ed70fd9a7d6598`.
The pinned compiler executable and its provenance remain unchanged.

Installation briefly stopped the service and replaced the global CLI shim.
The requester observed `CONNECTION_FAILED` during that interval and was told
when service/CLI were ready. Snapshot at `2026-09-07T12:36:02.168Z` verifies all
23 original current project DTOs unchanged, all original revisions preserved,
six historical job DTOs unchanged, the same instance/workspace and no active
jobs. See `output/ugryzienie-02/before.json` and `after.json`. The two added
projects are isolated technical fixtures. No further restart is required.

## Remaining limits

Smooth only interpolates shading on existing triangles. Duplicate position
indices may intentionally or unintentionally leave hard seams; the author must
prepare topology. No automatic welding, angle threshold, subdivision, imported
custom normals, smooth vertex deformation, specular/PBR or authored lights.
Use explicit diffuse material to see the result; legacy unlit material is kept.
ASCII stores smoothing masks, not an explicit normals array. Binary readback
checks base rigid trimesh normals; the preview's fixed Lambert lighting and
NWN's final appearance can differ. `nativeVerified` remains false.

## r17 follow-up

Studio 0.12.1 fixes the consumer r17 false binary validation failure caused by
double-valued UV aliases sharing one float32 representation. The consumer's
source and compiler are unchanged. Complete reproduction, checks, installed
job and retry guidance: [r17 regression report](tlc-ugryzienie-r17-regression.md).
