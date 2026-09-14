# Smooth mesh deformation — Studio 0.14.0

`shading:"smooth"` and `animation.vertices` now work together on custom meshes
through the same UI, CLI and WebMCP `layer.add/set` operations. Document schema
8, the 44 WebMCP tools and API envelope 0.1.0 remain unchanged. No new grant is
needed. Explicit flat and omitted shading retain their earlier behavior.

Discover `capabilities.meshShading`: `smoothGeometry:"custom"`,
`vertexDeformation:true`,
`deformationNormals:"recomputed-from-interpolated-60Hz-positions"`,
`exportedAnimatedNormals:false`, `binaryAnimmeshNormals:"static-base-per-corner"`.
These last two fields are a material limitation of export, not a reason to
remove the vertex deformation or replace it with uniform scale.

## Authoring

Read the project and layer ID at a concrete revision. To smooth an existing
deformed layer, save this array as `smooth.json`:

```json
[{"type":"layer.set","layerId":"YOUR_MESH_ID","values":{"shading":"smooth"}}]
```

```text
nwn-vfx --json changes preview --project PROJECT_ID --expected-revision N --input-file smooth.json
nwn-vfx --json changes apply --project PROJECT_ID --expected-revision N --input-file smooth.json --idempotency-key YOUR_STABLE_KEY
```

This changes only shading. The material, base geometry, all 1–64 authored
vertex keys and other animation channels remain intact. To author both fields
together, `values:{shading:"smooth",animation:COMPLETE_ANIMATION_OBJECT}` is an
atomic change. Read and preserve other channels when replacing `animation`.

```javascript
const input = {projectId, expectedRevision, changes: [
  {type:"layer.set", layerId, values:{shading:"smooth"}}
]};
await tools.call("studio.changes.preview", {viewSessionId,input});
await tools.call("studio.changes.apply", {viewSessionId,input,idempotencyKey});
```

`tools` is the connected browser host's discovered WebMCP handle. Inspect
`studio.connection.inspect` and `studio.view.inspect` first; preserve human
drafts. CLI may run from any repository with its configured connection.

UI: select the custom mesh, choose **Cieniowanie → Gładkie — własna siatka**,
inspect its changing shape, then **Zapisz**. A notice explains the normal-export
limitation when vertex deformation is present. Use an explicit diffuse material
to see lighting; the shading edit does not change material or enable emission.

Locks on `shading`, `animation`, `geometry` or the whole layer, AI pause,
expected revisions, idempotency, history, selective undo and portable ZIP all
retain their existing semantics. A rejected geometry/normal proposal creates
no partial revision. Disabled smooth layers are also validated.

## Sampling and validation

The same global 60 Hz position samples drive editor, PNG, WebM and both MDL
profiles. Studio linearly interpolates positions for the current time and then
recomputes normals from those positions, before the layer transform. It does
not linearly interpolate cached normals or reuse normals from the rest shape.
WebM still captures at 30 fps; arbitrary PNG/editor times interpolate the shared
60 Hz position samples.

Normals are normalized sums of incident oriented triangle cross products,
weighted by area and grouped by authored position index. Separate UV indices
never split these normals; distinct position indices are never welded.
Faces, winding, vertex order, UV values and UV indices are unchanged.

Smooth deformation validates continuous motion, including between authored
keys and between 60 Hz samples that cross authored knots. The cross product of
two linearly moving edges is quadratic; interval validation checks nonzero
face area and stable incident-normal sums. A vanishing face or cancelling sum
rejects the change with layer and interval plus face/vertex diagnostics. The
minimum face cross-product magnitude is 1e-10 square metres; the normal-sum
threshold is 1e-8 of a conservative incident-area bound. Highly ill-conditioned
motion may therefore be rejected rather than normalized unpredictably.

Limits remain 2048 positions, 4096 triangles, 8192 independent UV, 64 vertex
keys, 6 MiB source and the shared 1,000,000 position / UV sample budgets across
enabled deformed meshes and trails. Adding smooth does not change these counts.

`metadata.meshShading[].deformationNormals` matches ASCII readback
`meshes[].shading.deformationNormals` for the same revision:

- `method`: recomputed from interpolated 60 Hz positions.
- `source:"derived-from-position-samples"`: a derived calculation, not stored
  normal-animation bytes.
- `frameSets` and `cornerSamples`: checked sample-grid normal counts.
- `frameNormalHashesSha256`: each position frame is converted into normals in
  face/corner order and JSON-hashed with SHA-256, then the ordered JSON list of
  frame hashes is hashed. Evaluation between frames still recomputes normals.

## What export actually contains

ASCII `animmesh` retains full `animverts` and `animtverts`, smoothing mask 1 in
both geometry and animation nodes, and the unchanged transforms/controllers.
Readback checks every table and mask. Derived normal hashes use these parsed
position samples. `exportedAnimatedNormals:false` and diagnostic
`MESH_ANIMATED_NORMALS_NOT_EXPORTED` are explicit in the result.

The unchanged pinned Windows compiler creates **static base normals** from
`verts` and smoothing masks. The direct binary reader checks every oriented
position/UV corner and its stored float32 normal for base trimeshes and smooth
animmeshes in both geometry and animation trees (component tolerance 0.0002).
It also checks that smooth animmesh `m_avAnimNormals` counts are zero. The
existing compiled roundtrip independently checks all position/UV samples,
indices and controllers. No compiler or native tool changes are bundled.

Evidence at pinned source commit `56da6dc2fe94da6bbabe83ad18670f47fccd7dfb`:

- [Attribute table](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NmcLib/NmcAttribute.cpp#L769)
  accepts `sampleperiod`, `animverts` and `animtverts`, with no animated-normal
  attribute.
- [Mesh compilation](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NmcLib/NmcMesh.cpp#L1330)
  constructs position/UV sets and later clears the temporary normal array.
- [Animmesh layout](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NwnLib/NwnMdlNodes.h#L809)
  contains a legacy normal-array field at 0x028C (count at 0x0290). Its existence
  does not establish compiler input or engine playback support.

The supported pipeline does not export normal animation. This is not a claim
that every possible NWN format/tool can never support it. Native lighting and
deformation appearance remain unqualified; `nativeVerified:false`. No
Toolset/NWN launch, module integration or native proof belongs to this workflow.

## Own portable example

[examples/smooth-deformation](examples/smooth-deformation/) contains a synthetic
two-lobed mesh with two nonuniform contractions, independent per-face UV and a
diffuse material. It contains no TLC heart geometry or user artwork. Import
`source-document.json` as a **new** project using `projects import --file`, then
render the returned revision at 0.5 s with `camera.json`, or render the full 2 s
WebM. Build ASCII/default or `nwn-ee-impact-binary-experimental-v1` from that
same revision. Keep its destination and stable mutation/job keys explicit.
