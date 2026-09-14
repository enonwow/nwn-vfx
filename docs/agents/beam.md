Static PNG orientation/crop and per-segment preview are available through optional `textureMapping` in Studio 0.26.2. Read [the mapping contract](beam-texture-mapping.md); omission preserves earlier resource bytes.

# Custom EffectBeam — Studio 0.26.1

Studio 0.26.1 fixes a confirmed Lightning crash: native birthrate is **segments + 1** points. Regenerate every earlier beam candidate using a fresh job key. Existing projects and old artifacts remain unchanged. Active `nativeMotion` exports are blocked; its draft/preview remains available. See [crash evidence and limits](beam-crash-2026-09-10.md) and [motion status](beam-native-motion.md).

Create an authored Lightning/Linked beam with your own PNG, width, color,
alpha and irregularity. This is a minimal experimental native carrier for
two dynamically attached endpoints. The browser preview uses two explicit
points; the consumer chooses the objects/body nodes in NWN. Presets do not
restrict the authored appearance.

## Document and shared operations

`projects.create` with `preset:"empty", lifecycle:"beam"` creates one layer
with ID `beam`. First use promotes the document to **16**, portable ZIP to
**11**, minimum Studio **0.25.0**. Send `X-NWN-VFX-Document-Schema:16`.
Old clients receive `CLIENT_UPGRADE_REQUIRED`; reading or updating the app
never migrates old documents or rewrites history.

All fields below are required on `layer.add`; `layer.set` accepts a subset.
`flow` is one atomic field. Ordinary rights, human field/layer locks, AI pause,
expected revision, stable idempotency key and selective undo apply.

```json
{
  "id":"beam", "name":"Custom blood filament", "type":"beam", "enabled":true,
  "color":"#9b152b", "alpha":0.8, "width":0.045,
  "texture":"glow", "blend":"additive",
  "source":[0,0,1.2], "target":[0,3,1.2],
  "radius":0.08, "delay":0.05, "lightningScale":0.15,
  "segments":16, "seed":42,
  "flow":{"direction":"target-to-source", "speed":1.2}
}
```

| Field | Bounds / meaning |
| --- | --- |
| source, target | Three coordinates, each ±20 m; separation 0.05–30 m. Preview only. |
| width | 0.001–0.5 m in preview; independent of endpoint distance. Native sizeStart/Mid/End. |
| texture | `spark`, `smoke`, `glow`, or `asset:` followed by imported PNG SHA-256. |
| color, alpha, blend | #RRGGBB; 0–1; normal or additive. Constant native color/alpha controls. |
| radius, delay, lightningScale | 0–1; direct Lightning radius/delay/scale controllers. Preview noise is approximate. |
| segments | 2, 4, 8, 16, 32, 64. Number of edges. Native birthrate = segments + 1: 3, 5, 9, 17, 33, 65 points. |
| seed | Integer 0–2147483647. Deterministic preview noise only. |
| flow | source-to-target or target-to-source; speed 0–10 m/s. Preview intent only. |

At most eight beam layers. Beam mode permits enabled beam layers only;
enabled emitters, meshes, trails and audio are rejected. Disabled source
layers/assets may be retained. Continuous Fountain endpoint particles are
not part of this first profile. Author separate FnF opening/closing particles
for the consumer to attach explicitly. A reference child is not a promise
that arbitrary attached geometry will follow a target.

`document.duration` is the **preview window**, not native effect lifetime.
There are no layer start/duration keys, detonate events or animated birthrate
gates. Preview `cycles` 1–10 extends continuous time, total ≤30 s. Metadata
uses `previewWindowSeconds`, `cycles` and total `duration`, without loopSeconds.
`preview.compose` may extend a beam instance with explicit duration; audio
remains omitted. Browser direction/speed modulate a visual pulse along the
metric ribbon; they are not native texture scroll controls.

## CLI from any consumer repository

```powershell
nwn-vfx --json doctor
nwn-vfx --json capabilities
nwn-vfx --json projects create --project my-custom-beam --name 'My custom beam' --preset empty --lifecycle beam --idempotency-key custom-beam-create-001
nwn-vfx --json assets import --project my-custom-beam --expected-revision 1 --file 'C:/my-assets/filaments.png' --target-size 1024 --idempotency-key custom-beam-texture-001
```

Use the returned asset ID and revision in an explicit changes file. PNG
normalization, source provenance and existing asset limits remain unchanged.
The normalized source is retained with the project; exports contain TGA/TXI.

```json
[{"type":"layer.set","layerId":"beam","values":{
  "texture":"asset:REPLACE_WITH_RETURNED_SHA256", "width":0.035,
  "flow":{"direction":"target-to-source","speed":2}
}}]
```

```powershell
nwn-vfx --json changes preview --project my-custom-beam --expected-revision 2 --input-file 'C:/my-assets/beam-changes.json'
nwn-vfx --json changes apply --project my-custom-beam --expected-revision 2 --input-file 'C:/my-assets/beam-changes.json' --idempotency-key custom-beam-edit-001
nwn-vfx --json preview request --project my-custom-beam --revision 3 --format webm --cycles 2 --idempotency-key custom-beam-video-001
nwn-vfx --json candidate build --project my-custom-beam --revision 3 --model-name my_beam --profile nwn-ee-beam-ascii-experimental-v1 --idempotency-key custom-beam-ascii-001
nwn-vfx --json candidate build --project my-custom-beam --revision 3 --model-name my_beam --profile nwn-ee-beam-binary-experimental-v1 --idempotency-key custom-beam-binary-001
```

Use actual returned revisions, then `jobs wait JOB_ID --timeout 60s` and
`artifacts get ARTIFACT_ID --out EXPLICIT_PATH`. Keep the returned final hashes.
The packaged `examples/beam/project.json` is an independent technical source
that can also be imported through `projects import --file ... --project ...`.

For an existing empty FnF project, one atomic batch may set lifecycle to beam,
remove its actual initial emitter (usually `sparks`) and add the complete beam
layer above. Preserve imported PNG assets and all other source data. A mode
change alone fails if incompatible enabled layers remain. This batch pattern
also lets an agent author a completely new effect rather than pick a preset.

## Real tab WebMCP

Use a fresh tab after upgrading, preserving all old tabs with drafts. The human
connects the isolated project using **Połącz agenta → Udostępnij projekt AI**.
Discover the host tools, inspect the connection and use its viewSessionId:

```javascript
await tools.call('studio.projects.create', {
  viewSessionId,
  input:{projectId:'agent-custom-beam',name:'Custom beam',preset:'empty',lifecycle:'beam'},
  idempotencyKey:'agent-custom-beam-create-001'
});
await tools.call('studio.changes.apply', {
  viewSessionId,
  input:{projectId:'agent-custom-beam',expectedRevision:1,changes:[
    {type:'layer.set',layerId:'beam',values:{width:0.035,target:[0,5,1.2],
      flow:{direction:'target-to-source',speed:2}}}
  ]},
  idempotencyKey:'agent-custom-beam-edit-001'
});
```

`studio.assets.import` takes `fileName,pngBase64,targetSize?`, not filesystem
paths. Read exact input schemas from discovery. There are still 49 tools;
compact descriptors use local standard JSON Schema anchors without removing
validation bounds. Pending beam numeric input lives at
`meshEditorDrafts[layerId].beam:{text,baseline}`. It may contain invalid strings
such as `-`; it is human work and blocks navigation/save until applied/discarded.

Use `studio.view.inspect` for project/revision, selection, time and separate
saved document/draft; `view.set/open` require view revision and honor conflicts.
Saved mutations do not overwrite a human's draft. On conflict, inspect again
and recompute. Read job artifacts through `studio.artifacts.read` to
`nextOffset:null`; verify every chunk SHA and final size/SHA.

## Native carrier and consumer binding

Each enabled layer emits an emitter with `update Lightning`, `render Linked`,
`p2p 0`, `p2p_sel 1`, `inherit_local 1`, and a child `reference` with
`refModel fx_ref`, `reattachable 1`. The model is static EFFECT, with no authored
animations. The emitter/rest-reference positions are [0,0,0]/[0,1,0]; authored
preview coordinates and flow do not change MDL bytes.

`beam.json` records source intent, exact ASCII controller/reference readback,
limitations and, for binary, direct bounds-checked controller/reference reads.
Resource HAK bytes and texture pixels are independently read back. `fx_ref` is
an external stock dependency and is not silently copied into the resource HAK.

New `vfx-integration.json` effect schema 6 supplies:

- visualeffects rowId=null, `Type_FD:B`, `ProgFX_Duration:null`, SoundDuration `****`;
- Metadata uses **`Param6:cast01`**, the column read by retail Type7.
  Historical schema 3–5 / Param2 jobs remain readable but need a fresh export
  for corrected metadata. See [the audit correction](beam-audit-2026-09-10.md).
  The model is `Param1:<final model resref>`, Type7, rowId=null.
- explicit binding: allocate a progfx row and put its ID in visualeffects.ProgFX_Duration;
- external lifetime, nativeFlowControl=false, no cessation animation; all nativeVerified=false.

These are row fragments, not complete allocated 2DA files. The consumer chooses
fresh rows, complete remaining columns, EffectBeam objects/body nodes and
applies/removes the resulting effect. `cast01` preserves the observed stock
beam table convention; it does not claim an authored cast01 animation or prove
the engine's use of that parameter. Do not reuse stock row IDs automatically.

The effect is authored as continuous while applied. The consumer owns duration,
cancellation, range changes, replacement and removal. **This release does not
export native flow direction/speed, a growing start, cessation animation or a
draining tail.** Endpoint motion, orientation, width, texture mapping, effective
segmentation and removal behavior require an independent NWN test before art
acceptance. The agreed first delivery is this minimal carrier, not final Drain
Life artwork. Studio does not launch NWN/Toolset or modify consumer modules.

Local references used: `vdu_beam000.decompiled-reference.mdl`, binary
`lc_engbeam1.mdl`, stock visualeffects row 73/307, progfx row 600. The pinned
[compiler structures](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NwnLib/NwnMdlNodes.h)
define independent binary controller/reference offsets. Offline readback is
format evidence, never native visual validation.
