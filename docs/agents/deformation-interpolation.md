# Mesh deformation interpolation — Studio 0.23.0

Create effects from an empty project, then author emitters, meshes, trails, PNG textures and audio through the shared operations. Presets are starting documents, not a closed catalogue. This release adds an optional interpolation choice for custom mesh `animation.vertices`; it does not generate geometry or extra source keys.

## Contract

Set the mesh field `deformationInterpolation` through `layer.set` in changes.preview/apply, CLI or WebMCP. The editor exposes **Interpolacja deformacji**.

| Value | Authored curve | Boundary |
| --- | --- | --- |
| omitted or `linear` | Historical linear interpolation | Hold outside the layer |
| `monotone-cubic` | Componentwise monotone cubic Hermite | Zero endpoint velocity; hold outside |
| `monotone-cubic-loop` | Same interior interpolation | Exact matching endpoint positions and one shared periodic tangent |

Use `null` in layer.set to remove the field. Omission keeps historical MDL/HAK/texture bytes and exporter version. Explicit selection or a lock on this field promotes the new revision to document 14, ZIP v9, minimum Studio 0.23.0. Historical revisions are not rewritten. Clients declare `X-NWN-VFX-Document-Schema: 14`; older clients receive CLIENT_UPGRADE_REQUIRED before mutation. New explicit selection exports as nwn-ascii-vfx-0.23.0 or nwn-binary-vfx-0.23.0. A schema-14 document remains schema 14 after undo.

Smooth modes require custom geometry and vertices keys. Existing constraints remain: 1–64 keys, 2048 source vertices per mesh, fixed topology/UV, coordinates within ±20 m, 6 MiB combined document, and the shared million-sample mesh/trail budget. Source knots, including implicit time 0 and duration knots, must be at least 0.000001 s apart. If the first key is later than zero, base geometry supplies time zero; the last pose is held to layer duration. Loop endpoints must match exactly, without tolerance-based repair.

Interpolation is independent of lifecycle. Select `monotone-cubic` for FnF phases that stop at their boundaries and `monotone-cubic-loop` for DUR loops. The latter supplies periodic endpoint tangents, not a separate playback clock. Existing DUR lifecycle validation and loop clock still apply. It does not alter external NWScript lifetime or bone attachment.

## Curve and sampling guarantees

Each coordinate uses weighted harmonic PCHIP interior derivatives: zero at a zero/sign-changing secant, otherwise `(w1+w2)/(w1/dPrevious+w2/dNext)`, with `w1=2*hNext+hPrevious` and `w2=hNext+2*hPrevious`. These are the monotonicity-preserving derivatives described in the [SciPy PCHIP reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html). Studio's endpoint rule is an explicit extension: either zero derivatives at both ends, or the same harmonic derivative from the last and first secants at both ends.

The analytic curve is C1 and stays within each coordinate's adjacent source values. Constant coordinates and pinned vertices remain exact. This is not a guarantee about angular/radial bounds, mesh self-intersections, physical motion or character attachment. Front/back layers with identical position tracks and interpolation produce identical samples regardless of face winding.

Preview and export compile the same global 60 Hz position samples and linearly interpolate them. That sampled approximation is C0, not analytically C1. `maxDeviationMetres` is an object-local upper bound between the analytic curve and this sampled path; it excludes layer scale, binary float quantization and native renderer differences. Smooth reports use `interpolation.errorMethod:"curvature-bound"`: `period²/8 * sup(norm(secondDerivative))`, plus conservative endpoint derivative-jump terms for off-grid clipped boundaries, capped by the vertex coordinate-box diagonal. This bound can be loose for closely spaced knots. Historical linear reports retain the exact deviation measured at source knots.

Read `capabilities.meshDeformation.interpolationSelection` and job metadata `deformations[].interpolation`; candidate readback exposes `meshes[].deformation.interpolation`. Metadata distinguishes analytic C1 from sampled C0 and clamped/periodic boundaries. Smooth shading validates the actual linear intervals between rendered samples. Binary animated normals remain static; geometry readback is not native validation. All outputs remain `nativeVerified:false` until independently tested by a qualified consumer.

## Public operations

Save this array as `smooth-loop.json`, replacing the concrete layer ID after projects.inspect:

```json
[{"type":"layer.set","layerId":"panels","values":{"deformationInterpolation":"monotone-cubic-loop"}}]
```

```text
nwn-vfx --json changes preview --project PROJECT --expected-revision REVISION --input-file smooth-loop.json
nwn-vfx --json changes apply --project PROJECT --expected-revision REVISION --input-file smooth-loop.json --idempotency-key UNIQUE_STABLE_KEY
```

Use the CLI's `schema get changes.apply` / help for your installed version. In a granted WebMCP tab, discover the current schemas and call:

```json
{"viewSessionId":"FROM_CONNECTION_INSPECT","input":{"projectId":"PROJECT","expectedRevision":1,"changes":[{"type":"layer.set","layerId":"panels","values":{"deformationInterpolation":"monotone-cubic-loop"}}]},"idempotencyKey":"UNIQUE_STABLE_KEY"}
```

Pass this to `studio.changes.preview` without idempotencyKey, then `studio.changes.apply` with a stable key. Project grants, AI pause, whole-layer locks, the interpolation-field lock and the animation lock apply. Inspect conflicts; do not retry a stale revision under a new key. Undo uses changes.revert. Preserve the human's pending geometry/animation text and draft; edits to saved revisions do not authorize replacing a draft. Open a fresh tab after upgrading, preserving old tabs with unsaved work. Studio still registers all 49 WebMCP tools; the new field uses the existing operations.

The packaged examples under `docs/agents/examples/deformation-interpolation` include a complete independent project and ready-to-use changes. Consumer projects are never migration fixtures.
