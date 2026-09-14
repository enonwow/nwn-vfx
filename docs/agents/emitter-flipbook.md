# Animated emitter PNG atlases — Studio 0.20.0

Create new particle artwork by importing an immutable PNG atlas and assigning it
to an emitter. UI, CLI and WebMCP use the same `layer.add/set` operations. This is
a generic authoring feature; it does not install or change any consumer effect.

```json
{
  "type": "layer.set",
  "layerId": "smoke",
  "values": {
    "texture": "asset:<existing-asset-sha256>",
    "flipbook": {"columns":4,"rows":4,"frameStart":0,"frameEnd":15,"fps":16}
  }
}
```

`flipbook` is optional and atomic. Its absence keeps the exact static texture
path. `flipbook:null` in `layer.set` removes it. It is valid only for `emitter`,
with an existing custom PNG. Builtin spark/smoke/glow, mesh, trail, ribbon and
light cannot use it. No new operation or additional WebMCP privilege is needed.

## Frame convention and limits

- Source PNG frame 0 is at the **top left**. Advance left to right, then rows
  downward. UV origin remains bottom left; frames are upright.
- `columns` and `rows` are each 1, 2, 4, 8 or 16. Up to 256 cells, each at least
  8 × 8 pixels. Existing PNG limits remain: RGBA8, POT dimensions 8–1024,
  2 MiB/asset, 8 assets, 6 MiB/document. The stored PNG is not reordered or cropped.
- `frameStart` and `frameEnd` are integers, zero based and **both inclusive**.
  Start ≥0, end < columns×rows; at least two frames. Single-frame selections,
  including native's ambiguous 0..0 special case, are outside this first contract.
- `fps` is an integer 1–60. Positive FPS repeats the chosen range:
  `frameStart + floor(particleAgeSeconds * fps) % (frameEnd-frameStart+1)`.
  Each particle begins at frameStart at its own birth, including Fountain.
- No randomized start, random frame selection, hold-last mode, zero-FPS
  lifetime fitting, controller animation, or per-cell resampling.
- Preview samples full cell UV bounds with bilinear filtering. Use transparent
  borders within each cell to limit neighboring-cell bleed. Non-square cells are
  mapped onto the existing square particle billboard. PNG normalization that
  letterboxes a source changes its grid layout; author the final POT atlas directly.
- Offline WebM samples at 30 fps, so it may skip atlas frames above 30 fps.

The browser preview remains approximate. **Retail NWN frame order, UV filtering,
particle spawning and playback speed require a separate qualified native test.**
Studio's tests establish a consistent authoring/PNG/WebM convention and exact
serialization/readback, not retail runtime equivalence. `nativeVerified:false`.

## Author through CLI or WebMCP

Import with `nwn-vfx --json assets import --project ID --expected-revision N
--file atlas.png --idempotency-key KEY`. The returned `{project,assetId}` supplies
the next revision and immutable texture identity. Put the change above in a JSON
array, using the actual layer ID and asset ID, then run:

```text
nwn-vfx --json changes preview --project ID --expected-revision N --input-file changes.json
nwn-vfx --json changes apply --project ID --expected-revision N --input-file changes.json --idempotency-key KEY
nwn-vfx --json preview request --project ID --revision N --time 0.5 --format png --idempotency-key PNG_KEY
nwn-vfx --json preview request --project ID --revision N --format webm --idempotency-key VIDEO_KEY
nwn-vfx --json candidate build --project ID --revision N --model-name own_atlas --idempotency-key BUILD_KEY
```

Use the revision returned by apply for all render/build jobs. Discover exact
arguments with `schema get changes.apply` and `--help`; do not reuse placeholder
IDs or keys. Jobs are asynchronous; inspect success, then download/hash artifacts.

WebMCP uses the existing 48 tools. Human connects the chosen project; discover
the actual host's tools and call `studio.connection.inspect({})`, then
`studio.view.inspect({viewSessionId})`. Import PNG with `studio.assets.import`
input `{projectId,expectedRevision,fileName,pngBase64}`. Submit changes with
`studio.changes.preview/apply({viewSessionId,input:{projectId,expectedRevision,
changes:[...]},idempotencyKey})`. Use project/revision-bound `studio.preview.request`
and `studio.candidate.build`, followed by jobs.get and artifacts.read.

In the UI, select a custom PNG and edit **Animowana tekstura cząstki**. Apply its
fields before saving. Pending text is exposed as
`meshEditorDrafts[layerId].flipbook:{text,baseline}`; text is a JSON array of five
strings, possibly invalid. Baseline contains the prior flipbook and texture.
Preserve this work. Pending inputs participate in dirty/view revision checks,
block save/switch, and must not be replaced by an agent's saved revision.

Expected revision, stable idempotency keys, history/author/time, undo, human
`{layerId,field:"flipbook"}` or whole-layer locks and AI pause all apply. Agents
cannot remove human locks, resume themselves or use owner credentials.

## Compatibility and export evidence

First explicit atlas use or its field lock promotes a new revision to document
schema **12**. Undo/removal does not downgrade. Historical snapshots, source PNGs
and artifacts remain immutable. Portable ZIP is **v7**, minimum Studio **0.20.0**;
v1–v6 and documents 1–11 remain readable. Clients declare
`X-NWN-VFX-Document-Schema:12`. Older declarations receive
`CLIENT_UPGRADE_REQUIRED` before atlas reads/writes; discovery stays available.
Use a fresh browser tab after upgrade and preserve old tabs with pending work.

Native MDL writes `xgrid=columns`, `ygrid=rows`, `frameStart`, `frameEnd`, `fps`.
`random=0` and native `loop=0`; **loop controls Single emitter emission**, not the
sprite animation repeat mode. TGA/TXI keep the same immutable texture identity
and bottom-first RGBA bytes as static export. No automatic native integration.

`validation.readback.layers[].flipbook` contains the values actually read from
ASCII. Binary candidates additionally verify actual serialized grid/loop/flags
and controller values at IDs 128/132/136, with no animation overrides, in
`validation.compilation.emitterFlipbookReadback`. PNG/WebM metadata includes
`emitterFlipbooks` with layer, texture, settings, clock, frame order and playback.
These receipts bind to the usual snapshot, revision, artifacts and handoff.

Format evidence: [NWN emitter documentation](https://nwn.wiki/pages/viewpage.action?pageId=139690011)
describes grids, positive FPS and inclusive frame indices. Community
[rollnw particle timing](https://github.com/jd28/rollnw/blob/main/lib/nw/render/particle_system.cpp)
and [sprite UV calculation](https://github.com/jd28/rollnw/blob/main/lib/nw/render/particle_render.cpp)
inform the preview interpretation; they are not the retail engine. Binary layout
comes from the unchanged pinned
[NwnMdlNodes.h](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NwnLib/NwnMdlNodes.h).
The consuming task owns the asymmetric native atlas test before artistic approval.
