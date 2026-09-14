# Periodic ribbon material — Studio0.29.0

`linked-periodic-pan-v1` adds one animated material on a straight Linked beam.
It uses16 sampled texture frames and intentionally repeats the same frame on
each of two segments. This gives an illusion of twisting painted ribbons;
it does not add helical geometry, a curved Bezier axis or whole-span opening.
Native appearance/cadence remain unqualified.

The optional atomic beam field is:

```json
{"materialMotion":{"mode":"periodic-pan","direction":"source-to-target","fps":15}}
```

Direction also accepts `target-to-source`, FPS is integer1–30. `null` removes
the field and gives a static control without changing other layer settings.
Document23, portable ZIP18, minimum Studio0.29.0, header23 are required. Schema
promotion is permanent; resetting motion does not downgrade the document.
Legacy `nativeMotion` remains blocked and cannot coexist with this field.

Required carrier: one enabled beam, segments2→3 points, radius/scale/speed0,
imported PNG, explicit textureMapping V/source. Its source/target and geometric
direction remain shared with the finite Fountain. `materialMotion.direction`
controls movement on that logical geometry independently of particle flow.
Native object reversal is still governed by beam-flow.json, not by this field.

The PNG must have byte-identical top/bottom RGBA rows and transparent side alpha.
The generator preserves the source, derives1024×256 RGBA with16 columns, one
row and64×256 cells, and records source/atlas hashes. It uses periodic bilinear
sampling with premultiplied-alpha weights. Frame zero equals a64×256 input
exactly; differently sized inputs are resampled. The generated row endpoints
remain byte-identical. White test RGB is tinted by the layer color.

Preview reads the very same atlas at `floor(time*fps)%16` on both segments.
Width keeps the static Linked meaning: native full width is2×width. Preview
does not interpolate between phases. This profile alone exports the closed
TXI variant `mipmap0/filter1`; all other materials retain their existing variant.
The preview suppresses mipmaps for this material even under export filtering.

Export checks source and binary grid16×1, frames0–15, FPS,3 points, flags258,
reference and exact TGA/TXI/atlas data. `random0` keeps the random-start flag off.
The finite Fountain and cast01 remain in the same instance; retain that instance
through its reported lastDeath before consumer removal. The ribbon keeps looping
until removal. Native frame rounding, shared-clock drift, geometric seams,
camera-facing appearance and moving attachment require consumer testing.

Use existing CLI/WebMCP operations: projects.fork, assets.import,
changes.preview/apply/revert, preview.request, candidate.build, jobs.get and
artifacts.get/read. UI **Okresowy ruch materiału** shares the same operations.
Field/layer locks, AI pause, scoped grants, exact revisions, stable retries,
pending raw drafts and save conflicts still apply. Capability discovery reports
the profile under beamAuthoring.materialMotion. `beam.json.layers[].materialMotion`
contains the derivative contract; preview metadata contains beamMaterialMotion.

The [public example](examples/beam-periodic-pan/run.mjs) works from another repo
using only Node builtins and public CLI operations:

```powershell
node C:/Projects/nwn-vfx/docs/agents/examples/beam-periodic-pan/run.mjs `
  --cli C:/Projects/nwn-vfx/output/beam-composite-0281/lab/runtime-0290/bin/nwn-vfx.mjs `
  --config C:/Projects/nwn-vfx/output/beam-composite-0281/lab/tlc-agent.config.json `
  --source-project 0bb65bb5-d27d-4197-8728-5f44561cc83a `
  --source-revision 2 --key my-periodic-comparison
```

It explicitly forks V17, imports a procedural periodic soft/tapering ribbon
**fixture**, replaces only the beam layer, then creates a static fork by null
reset. It verifies exact essence and all original assets. Each gets a binary
candidate and PNG/WebM previews. This is technical test art, not accepted art.
The two documents differ by materialMotion and their nonvisual fork labels;
both retain schema23. Resource
differences include model identity, atlas dimensions/pixels/resrefs, TXI mipmap,
grid/FPS/frame range, exporter version and derived manifests/hashes. The static
exporter keeps its legacy version because that document has no active feature.

Native sequence belongs to the consumer: fixed scene/camera/distance V17→STATIC
→ANIMATED, then a separate moving-target test after material visibility/motion
passes. See the [decision](beam-ribbon-decision-2026-09-10.md). No native process,
integration or qualification is performed by Studio: nativeVerified:false.
