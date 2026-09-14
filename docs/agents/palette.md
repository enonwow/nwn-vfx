# Effect palette â€” Studio 0.13.0

Use `palette.preview` and `palette.apply` for one atomic palette operation.
The UI, CLI and WebMCP use the same service, algorithm and document. Existing
document schemas 1â€“8 and API envelope 0.1.0 remain supported. Discover
`capabilities.palette` and both operation schemas before using a closed client.
No NWN/Toolset execution or module integration belongs to this workflow.

## Options and algorithm

Save this options object as `palette.json` (it is not a changes array):

```json
{
  "from": "#ff0000",
  "to": "#00ff00",
  "scope": { "layerIds": "all", "excludeLayerIds": [], "includeDisabled": false },
  "textureMode": "transform"
}
```

`oklch-hue-rotation-v1` converts sRGB to linear RGB and Oklab, then applies the
same hue angle difference from `from` to `to` to every selected effective color.
It keeps Oklab lightness and chroma, reducing chroma by 20-step binary search
where needed to fit sRGB, then rounds to RGB8. The anchors select **hue only**;
the target's lightness and saturation are not copied. Relative hue offsets and
light/dark detail are retained within gamut/quantization limits. Oklab chroma
below 0.0001 is neutral and stays byte-exact; neutral anchors are rejected.
This preserves white/gray bones when they are neutral, but there is no semantic
mask or blood recognition. Exclude layers explicitly to protect their artwork.

The matrix authority is [Ottosson's Oklab definition](https://bottosson.github.io/posts/oklab/)
(2021-01-25 linear-sRGB matrices, public domain); the transfer curve is sRGB as
defined in [CSS Color 4](https://www.w3.org/TR/css-color-4/). The specific hue
operation and gamut reduction above are Studio's versioned algorithm.

Scope is `layerIds:"all"` or an explicit nonempty array of IDs. Exclusions are
always removed from that scope. Disabled layers are skipped unless
`includeDisabled:true`; no layer is enabled by recoloring. Unknown IDs, an empty
effective scope and a proposal with no changes produce explicit errors.

Effective channels:

- Emitters: `color`, existing `midColor`, `endColor`. Missing midpoints remain
  missing; their usual interpolation is not replaced with an authored midpoint.
- Trails and legacy mesh materials: `color`.
- Explicit mesh materials: `material.diffuse` and `material.selfIllumination`.
  Inactive legacy mesh `color` remains unchanged. Black self-illumination stays
  exactly black; the operation never creates a material or enables emission.

`textureMode:"preserve"` changes these parameters only and warns for custom
textured layers: RGB multiplication cannot generally remap a baked red PNG.
`textureMode:"transform"` changes a custom PNG **instead of** its material or
particle color multipliers. Every effective multiplier must be neutral; a
chromatic multiplier returns `PALETTE_TEXTURE_TINT_CONFLICT` for that layer.
Choose parameter-only mode or explicitly neutralize the multiplier in a separate
reviewed edit. Studio does not bake a composite lighting/material result.
Layers without a custom PNG still use their effective color channels.

PNG transformation is pixel-local with no resizing, filtering or UV changes.
Alpha bytes and RGB bytes under alpha zero are exact. Pixels retain Oklab
lightness within gamut and RGB8 rounding; the report includes actual maximum
lightness error. Each new PNG has its own SHA-256 ID. Multiple included users
of the same texture share one derivative; excluded/disabled layers retain the
original. Original PNG bytes remain in the document and historical revisions.
The operation report records source/derived IDs and affected layers.

Limits remain 8 stored assets, 2 MiB per PNG, 8â€“1024 POT dimensions and 6 MiB
compact document. Original assets are never automatically removed to make room.
Capacity/document limits reject the whole proposal and commit, without a partial
revision. Free unused slots explicitly or narrow the scope.

## CLI and WebMCP

Use the current project revision and an explicit options file:

```text
nwn-vfx --json palette preview --project PROJECT_ID --expected-revision N --input-file palette.json
nwn-vfx --json palette apply --project PROJECT_ID --expected-revision N --input-file palette.json --proposal-hash HASH_FROM_PREVIEW --idempotency-key YOUR_STABLE_KEY
```

The preview returns `{projectId,revision,document,diff,report,proposalHash}`.
Inspect `document`/`diff`, then use its exact `proposalHash`. Apply returns
`{project,report,proposalHash}`. Store the envelope `operationId` for undo.
An identical lost-response retry uses the same input and idempotency key.

```javascript
const input = {projectId, expectedRevision, options};
const preview = await tools["studio.palette.preview"]({viewSessionId, input});
// Present/review preview.data.document, diff and report before committing.
const applied = await tools["studio.palette.apply"]({viewSessionId,
  input: {...input, proposalHash: preview.data.proposalHash},
  idempotencyKey: "palette-unique-intent-001"});
```

Here `tools` means the actual connected host's discovered tool handles, not a
global browser object. Discover the 44 tools, connect through the human-granted
tab session, and inspect `studio.connection.inspect`/`studio.view.inspect` first.
CLI `schema get palette.apply` exposes the same canonical input contract.

Both operations require edit scope. Preview is read-only and can explain a
proposal while AI writes are paused. Apply enforces pause, revision, locks,
preview hash and stable idempotency inside the existing transaction. A changed
revision requires a fresh reviewed preview. A lock on any actually modified
field rejects the entire operation, including for the owner.

Undo is the existing `changes revert --project PROJECT_ID --expected-revision N
--operation OPERATION_ID --idempotency-key UNDO_KEY` / `studio.changes.revert`.
It restores prior fields/references and removes derivatives created by this
operation while preserving independent later imports and edits. Later dependent
field changes, use of a derivative by another layer, or missing original data
cause `UNDO_CONFLICT`. Old revision exports retain the exact old pixels.

## Human workflow

Save the current draft, then click **Paleta efektu** in the project bar. Choose
source/target hue, full or selected scope, exclusions, disabled-layer inclusion,
and optional PNG transformation. **PodglÄ…d palety** displays saved A and proposed
B with synchronized time, plus differences and texture diagnostics. Nothing is
saved yet. **ZatwierdĹş paletÄ™** commits one revision; **Anuluj paletÄ™** discards the
proposal. Pending options/hash appear as `paletteDraft` in the tab context and
block view navigation. A remote update cannot silently rebase the proposal.

Render PNG/WebM and export from the returned saved revision. They use the exact
transformed asset bytes and channels; no extra palette filter is applied by the
renderer or exporter. Native appearance remains unqualified.
