# Custom animated trails — Studio 0.9.0

`trail` is a generic authored layer, available through the existing UI and
`changes.preview/apply` operations in CLI/WebMCP. Adding it promotes the document
to schema 6. It consumes one of the 32 logical layer slots. The source contains
an explicit timed 3D path; generated animmesh nodes are internal export data.

## Complete input example

Save this array as `trail.changes.json`. It replaces the initial `sparks` layer
in a newly created empty project. Read a real project's layer IDs and revision
before adapting the example to it.

```json
[
  {"type":"project.set","values":{"duration":4}},
  {"type":"layer.remove","layerId":"sparks"},
  {"type":"layer.add","layer":{
    "id":"gold_thread","name":"Golden thread","type":"trail","enabled":true,
    "start":0.4,"duration":2.1,"color":"#FFCA73","alpha":0.8,
    "path":[
      {"time":0,"position":[0,0,0.1]},
      {"time":0.45,"position":[0.1,0.03,0.7]},
      {"time":0.95,"position":[-0.07,0.08,1.35]},
      {"time":1.4,"position":[0.02,0.12,1.9]}
    ],
    "width":0.018,"tailLifetime":0.7,"profile":"soft","blend":"additive",
    "glowStrength":0.12,"head":{"enabled":true,"size":0.025},
    "maxSegmentLength":0.05
  }}
]
```

```text
nwn-vfx --json projects create --project my-trail-demo --preset empty --name "My trail" --idempotency-key trail-demo-create-01
nwn-vfx --json changes preview --project my-trail-demo --expected-revision 1 --input-file trail.changes.json
nwn-vfx --json changes apply --project my-trail-demo --expected-revision 1 --input-file trail.changes.json --idempotency-key trail-demo-author-01
nwn-vfx --json preview request --project my-trail-demo --revision 2 --time 1.4 --format png --idempotency-key trail-demo-png-01
nwn-vfx --json preview request --project my-trail-demo --revision 2 --format webm --idempotency-key trail-demo-video-01
nwn-vfx --json candidate build --project my-trail-demo --revision 2 --idempotency-key trail-demo-build-01
```

Resolve project ID collisions explicitly. For retries use the same input/key;
for subsequent edits read the current revision and use a new key. Wait for each
job to succeed and retrieve its actual returned artifact IDs. Do not infer a
job or file ID from the example key.

In a connected WebMCP tab, discover tools and call `studio.connection.inspect`
then `studio.view.inspect`. Preserve the human's draft. The corresponding
mutation is:

```js
studio.changes.apply({
  viewSessionId,
  input: { projectId, expectedRevision, changes },
  idempotencyKey: "trail-demo-author-01"
})
```

Here `changes` is the JSON array above adapted to the actual shared project.
`studio.changes.preview` takes the same `viewSessionId` and `input`, without an
idempotency key. Render/build tools take `{viewSessionId,input:{projectId,
revision,...},idempotencyKey}`. Fetch files through `studio.artifacts.read`
until `nextOffset === null`; verify every chunk and the complete size/SHA-256.

## Semantics and limits

- Positions are absolute metres in NWN world Z-up, each component ±20.
  `path` contains 2–64 `{time,position}` points. First time is 0, times strictly
  increase, consecutive positions differ by at least 0.00001 m. Times are local
  to `start`. Input is a linear polyline; prepare dense explicit samples for a
  smooth curve. Studio does not apply smoothing or infer motion from artwork.
- `duration` is the layer interval. Last path time + `tailLifetime` must fit it;
  `start + duration` must fit the document. Tail lifetime: .05–10 s.
- `width`: .001–.2 m, full Gaussian core FWHM before adding glow. The tail's
  geometric width decreases linearly with local age; texture alpha decreases
  with `(1-age)^1.5`. Halo FWHM is 2.8 × core width, peak strength is
  `glowStrength` (0–.3) relative to core, geometry support is 3 × width with
  transparent boundary texels. RGB is the layer color. Rendering is additive.
- `head` is required; disable with `enabled:false`. `size` is the full Gaussian
  FWHM diameter (.001–.2 m). The head follows the same sampled motion, fades in
  and fades out while completing the path (up to .06 s per fade), and never
  persists as a fixed lamp. It is generated crossed geometry, not a light.
  Its journey must span at least one complete global 1/60 s grid interval;
  shorter enabled-head paths are rejected before saving.
- `maxSegmentLength`: .005–1 m. Authored vertices are preserved; each segment
  is subdivided as necessary. Max 128 output segments per trail. A budget error
  includes the limiting count; there is no silent decimation.
- Shared sampling: **60 Hz**, `ceil(document.duration*60)+1` vertex/UV sets.
  PNG interpolates those samples at its requested time; WebM takes 30 fps from
  the same model. The head also uses those samples. Start/stop/curved-path
  approximation is explicit. Causal trail opening takes up to 2/60 s; the
  effect cannot appear before its authored start.
- At most **1,000,000 vertex samples** across enabled trails and heads. Each
  has a corresponding UV sample. Body vertices = 4 × (segments+1), head adds
  12 vertices. Body costs 1 native node, optional head 1 more. Root and other
  layer nodes are counted separately. ASCII MDL has a 128 MiB limit.
- Example cost from the isolated six-trail, four-second format check without
  heads: 370,176 vertex samples + 370,176 UV samples, 19.15 MB ASCII MDL,
  19.22 MB resource HAK, 3.95 MB ZIP. Actual values depend on path sampling,
  enabled heads, other layers and numeric serialization. Read each candidate's
  diagnostics/resource sizes rather than treating these as a quota guarantee.

## Human control, diagnostics and export

UI: **Dodaj smugę** provides parameters and an explicit path editor. Apply or
discard path text before saving/switching projects. Pending text is exposed as
`meshEditorDrafts[layerId].path:{text,baseline}`; it can be invalid human work.
Never overwrite or silently discard it. `path` and `head` are atomic for edits,
field locks, history and selective undo. AI pause and project-scoped grants
apply normally. Generated nodes do not appear as additional editable layers.

Read `validation.json` → `readback.trails` for layer/node/part, vertex and face
counts, frame sets, period, every-sample readback hashes, alpha keys and the
largest head-path deviation checked at 240 Hz. `TRAIL_COMPILED_COST` reports
sample counts and actual MDL/HAK bytes; `TRAIL_SAMPLED_APPROXIMATION` describes
the time model. Resource hashes and ZIP artifact sizes remain authoritative.

Export contains real animmesh `animverts`, `animtverts`, alpha controllers and
shared RGBA-derived TGA/TXI. The exporter reads its serialized tables and HAK
resources. Portable Studio ZIPs retain the original path, controls and schema
6 without storing generated animation frames. Import with Studio 0.9.0+.

Offline PNG/WebM preserve the default grid and reference silhouette from 0.8.0.
Editor helpers remain optional in the interactive viewport. All results remain `nativeVerified:false`.
An independent compiler roundtrip proves file representation, not the NWN
engine's transparency, interpolation, visual quality or performance. A native
test must refer to the exact exported candidate through a qualified runner.
No moving attachment, physics, collision, light, arbitrary mesh deformation
import or standalone MCP is added by this feature.
