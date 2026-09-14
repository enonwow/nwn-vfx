# Fixed-topology mesh deformation — Studio 0.11.0

Use the existing `changes.preview` and `changes.apply` operations through CLI,
HTTP or a connected WebMCP tab. Mesh `animation.vertices` adds per-vertex shape
keys alongside position, orientation, scale and alpha. This is a general mesh
feature; it does not author Ugryzienie or change any existing project.

## Input and timing

```json
{
  "vertices": [
    {"time": 0, "value": [[0,0,0], [0.1,0,0], [0,0,0.1]]},
    {"time": 0.137, "value": [[0,0,0], [0.2,0.015,0], [-0.04,-0.01,0.16]]},
    {"time": 0.45, "value": [[0,0,0], [0.3,0.03,-0.04], [-0.08,-0.025,0.1]]}
  ],
  "alpha": [{"time":0,"value":0}, {"time":0.025,"value":1}, {"time":0.45,"value":0}]
}
```

This is the **whole `animation` field** of a mesh with `geometry.kind: custom`,
three corresponding base vertices, and a face such as `[0,2,1]`. For a complete
textured example use [changes.json](examples/deformation/changes.json),
[PNG](examples/deformation/red-surface.png),
[camera.json](examples/deformation/camera.json) and the portable
[source document](examples/deformation/effect-document.json).

Each key contains absolute mesh-local XYZ positions in metres, Z up, in exactly
the base vertex order. Values are not offsets. Layer-local times are strictly
increasing in `[0, layer.duration]`. A key at zero overrides base positions at
zero; a later first key interpolates from base geometry at zero. The final value
is held. Faces, winding, UV coordinates and independently indexed UV faces stay
fixed. Delete the `vertices` channel to restore rigid geometry; an empty channel
is rejected. Geometry and animation are still separate atomic fields: changing
the vertex count requires supplying compatible geometry and animation in the
same change. No vertex is automatically pinned; repeat a contact vertex's
position in every key to anchor it.

The authored curve interpolates positions linearly. Studio samples it on the
**global** grid `time = i/60`, from zero through `ceil(document.duration*60)/60`,
and linearly interpolates those samples in editor, PNG and WebM. ASCII animmesh
contains these exact samples and a sample period of `1/60`; binary compiles the
same ASCII and checks the result within the documented float32 tolerance.

The complete example starts at 0.40 s, has local keys at 0, **0.137** and 0.45 s,
and fades out by 0.85 s in a 2 s project. Global 0.537 s is deliberately off the
sampling grid. A sharp bend at that time is approximated by shared samples;
`maxDeviationMetres` reports the maximum distance from the authored piecewise
linear curve, checked at its knots and the sampling grid's endpoints. The error
is in local metres. The source keys remain unchanged; no silent decimation is
performed. The example is a small red fan that grows sideways and bends, with a
fixed contact vertex. It is a technical fixture, not approved blood artwork.
Detached drops can use separate existing mesh/emitter layers.

Layer transforms apply **after** deformation:
`world = position(t) + scale(t) * rotation(t) * localVertex(t)`.
For example, scale 2 doubles size and local approximation error; a Z rotation
of π/2 turns local +X into world +Y. Translation moves the contact point and
does not change sample hashes. To hold the contact point fixed in world space,
keep its local position at zero and the layer position stationary. Existing
orientation keys use shortest-path quaternion SLERP in Studio; native rotation
interpolation remains unqualified.

## Public operations

Discover `capabilities.meshDeformation`, `meshAnimationChannels` and
`schema get changes.apply`. Documents using the channel promote to schema 7;
schemas 1–6 remain readable, and schema promotion never reverses. UI editing is
available in **Klucze animacji JSON**. Pending text, even invalid JSON, remains
in `meshEditorDrafts[layerId].animation` and blocks save/switch until applied or
discarded. Existing field locks, AI pause, expected revisions, idempotency,
history, selective undo and portable ZIP apply unchanged. No new grant scope
or administrative tool is introduced.

PowerShell example, using a new diagnostic project and the installed CLI from
any repository (set `$exampleDir` to the installed package's docs directory):

```powershell
$exampleDir = 'C:\Users\enonw\AppData\Roaming\npm\node_modules\nwn-vfx-studio\docs\agents\examples\deformation'
$create = nwn-vfx --json projects create --project deformation-demo-01 --name 'Deformation demo' --preset empty --idempotency-key deformation-create-01 | ConvertFrom-Json
$projectId = $create.data.id
nwn-vfx --json assets import --project $projectId --expected-revision 1 --file "$exampleDir\red-surface.png" --idempotency-key deformation-texture-01
nwn-vfx --json changes preview --project $projectId --expected-revision 2 --input-file "$exampleDir\changes.json"
nwn-vfx --json changes apply --project $projectId --expected-revision 2 --input-file "$exampleDir\changes.json" --idempotency-key deformation-shape-01
nwn-vfx --json preview request --project $projectId --revision 3 --time 0.6 --format png --camera-file "$exampleDir\camera.json" --idempotency-key deformation-png-01
nwn-vfx --json preview request --project $projectId --revision 3 --format webm --camera-file "$exampleDir\camera.json" --idempotency-key deformation-video-01
nwn-vfx --json candidate build --project $projectId --revision 3 --idempotency-key deformation-ascii-01
nwn-vfx --json candidate build --project $projectId --revision 3 --profile nwn-ee-impact-binary-experimental-v1 --idempotency-key deformation-binary-01
```

Inspect each reply before the dependent command. These keys identify this one
example run; a different intended run needs new project/key identities. The PNG
asset ID embedded in the changes is
`019b5fa069128fe17aa78352287fd9e3f47d7a43466c0b0a1885954e6a86ff40`.
Import the exact supplied PNG first. The changes explicitly remove `sparks`:
**0.11.0 retains the historical `empty` preset**, which creates that emitter.
This factory behavior and the minimum-one-layer document contract explain the
reported surprise. No existing project's layers are removed by the upgrade.

For each accepted job, use `jobs wait JOB_ID --timeout 30s`, inspect `jobs get`,
then `artifacts get ARTIFACT_ID --out EXPLICIT_PATH`. ZIP export/import also
preserves original keyframes and PNG bytes; generated samples are derived.

WebMCP uses the actual discovered tab tools, not JavaScript access to a cookie:

```javascript
// First discover tools and inspect studio.connection.inspect({}).
// viewSessionId and projectId come from that connection/context.
// pngBase64, changes and camera contain the supplied example files' contents.
studio.assets.import({viewSessionId, input: {
  projectId, expectedRevision: 1, fileName: "red-surface.png", pngBase64
}, idempotencyKey: "deformation-texture-01"});
studio.changes.preview({viewSessionId, input: {projectId, expectedRevision: 2, changes}});
studio.changes.apply({viewSessionId, input: {projectId, expectedRevision: 2, changes},
  idempotencyKey: "deformation-shape-01"});
studio.preview.request({viewSessionId, input: {projectId, revision: 3, time: 0.6, format: "png", camera},
  idempotencyKey: "deformation-png-01"});
studio.preview.request({viewSessionId, input: {projectId, revision: 3, format: "webm", camera},
  idempotencyKey: "deformation-video-01"});
studio.candidate.build({viewSessionId, input: {projectId, revision: 3}, idempotencyKey: "deformation-ascii-01"});
studio.candidate.build({viewSessionId, input: {projectId, revision: 3, profileId: "nwn-ee-impact-binary-experimental-v1"},
  idempotencyKey: "deformation-binary-01"});
```

These are tool names and structured arguments; call them sequentially through
the host connector. Read jobs and artifact chunks with `studio.jobs.get` and
`studio.artifacts.read`, checking chunk/full hashes as in the base skill. The
human must share this diagnostic project to use its tab grant. Preserve any
existing tab's unsaved work; use a fresh tab to discover upgraded schemas.

## Validation, resource limits and material

Bounds: 1–64 keys, 3–2048 vertices, finite coordinates ±20 m, existing 4096-face
and 8192-UV limits, 6 MiB compact UTF-8 document including assets. All enabled
deformed meshes and trails together may allocate at most 1,000,000 position
samples and 1,000,000 UV samples; independent UV seams count separately. The
whole effect duration determines sample count, including inactive time. Limits
are checked before allocating sample arrays. Candidate MDL remains capped at
128 MiB. No fluid solver, variable topology, collision, rig or FBX import.
Base triangles must be nondegenerate. Deformed faces can collapse or cross;
Studio does not remesh, fix winding or create a back side automatically.

`validation.readback.meshes[].deformation` contains all-samples-read status,
frame/sample counts, period, hashes of serialized animverts/animtverts and
maximum local resampling error. Preview metadata `deformations[]` contains the
same hashes; binary additionally reports source/binary/roundtrip file hashes
and all-sample comparison under `validation.compilation`.

The fixture uses **normal blend**, red RGBA8 PNG, white diffuse and black
self-illumination. No glow map or additive layer is generated. PNG highlights
are baked into the authored texture and stretch with fixed UVs. In the preview,
positions and flat face normals are recomputed each frame, with fixed Lambert
lighting; transformed normals follow the layer transform. Export preserves
faces/smoothing group 0 and position samples, but does not export animated
normal keys or qualify NWN's normal recomputation. Native lighting during a
large deformation may differ. No PBR, roughness, metallic, normal map, dynamic
wet specular/reflection or authored light is exposed. Baked reflections can
suggest wetness; they do not respond to lights or the viewer. A native test must
judge this particular material in its actual area. `nativeVerified` stays false.

Studio 0.14.0 also supports explicit smooth shading during vertex deformation. See [smooth-deformation.md](smooth-deformation.md) for dynamic preview normals, static export normals, continuous validation, discovery and examples. This document's original fixture remains flat.
