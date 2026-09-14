# Static beam texture mapping — Studio 0.26.2

`textureMapping` is an optional atomic setting on a static `beam` layer. Author
it through the UI, CLI `changes preview/apply`, or `studio.changes.preview/apply`
in a granted WebMCP tab. It uses the same rights, locks, pause, draft conflict,
revision, retry and undo rules. Existing projects and source PNGs are preserved.

```json
[{"type":"layer.set","layerId":"beam","values":{
  "textureMapping":{"axis":"u","fit":"alpha-bounds"}
}}]
```

- `axis:u`: source image left to right follows the native segment from V0 to V1.
  The derivative rotates the source pixels 90 degrees counterclockwise.
- `axis:v`: source image bottom to top follows native V. No rotation.
- `fit:source`: retain the entire PNG including transparent padding.
- `fit:alpha-bounds`: crop the rectangle containing pixels with alpha > 0,
  then stretch that rectangle to the source dimensions before rotation.
  Completely transparent crops are rejected. Filtering uses the shared area
  reduction/bilinear enlargement in linear sRGB with premultiplied alpha.
- `textureMapping:null`: remove the setting. Omission preserves the historical
  texture bytes and preview. It does not rewrite earlier source revisions.

This is **per-segment mapping**. Native Lightning/Linked repeats the entire
texture on each edge: 32 segments = 33 points = 32 repetitions. It cannot
stretch one continuous image across all edges. Transparent ends therefore
produce separate dashes even after rotation/cropping. Use a suitable authored
tile for a joined appearance; no tile repair, brightness or alpha enhancement
is inferred. This setting does not add flow, opening, closing or endpoint motes.
It cannot coexist with `nativeMotion`, whose candidate export remains blocked.

The explicit mapping preview uses independent edge quads with native V along
each edge, the exact derivative RGBA used by export, and no synthetic flow
pulse. Native size.x is a per-side extent, so its displayed full width is
`2 * width`. The UI labels the authored parameter as a half width in this mode.
Historical omission retains the old intent preview without changing its source
or exported width. Camera facing, Lightning noise and attachment remain
approximate; this does not establish full native parity.

`beam.json.layers[].textureMapping` records settings, source/output RGBA hashes,
crop, derivative dimensions, rotation, filter, repetitions and native full width.
Source PNG bytes and their imported provenance remain in the document/ZIP.
Exported TGA is read in NWN bottom-first order and checked against all derivative
RGBA bytes, including hidden RGB. The HAK and compiled MDL still undergo their
normal exact resource and reference/controller checks. PNG/WebM job metadata
includes `beamTextureMapping` with the settings, repetitions and full width.

First use or a field lock promotes only the new revision to document 18 / ZIP13
with minimum Studio 0.26.2. New CLI and WebMCP declare
`X-NWN-VFX-Document-Schema:18`; older declarations receive
`CLIENT_UPGRADE_REQUIRED` without mutation. Reset does not downgrade a document.
All 49 tools remain available. Open a fresh tab after upgrading; preserve older
tabs containing human drafts. Read connection and view context before edits.

## Evidence and limits

The native Linked branch in the local Toolset primary decompilation
`C:/Projects/New Folder/export/decompiled_all.c` (SHA256
`36bb8b1031afe2abf23f0e18180a5ad649401d9ea5e078e5170a31a96167c572`),
lines 856418–856765, constructs each adjacent-point quad separately, applies
the full UV cell to it, and adds/subtracts size.x on opposite sides. The prior
Studio static preview instead used U over the entire beam. This mismatch is
the reason for the explicit preview/export mapping mode.

The consumer reported a visible two-blob diagnostic at 3 native points in V4,
after V3 survived repeated use but was invisible. The inspected V4 frame is
consistent with texture repetition, but it does not independently prove all
body-node attachments or explain every V3 visibility factor.

Read-only analysis of `tlc-wampir-drain-life@3` found a 1024×1024 stored PNG
whose nonzero-alpha bounding rectangle is `[0,420,1024,184]`; 6.97% of pixels
have nonzero alpha and mean alpha over the full image is 2.47%. Its original
2172×724 PNG was explicitly normalized with transparent square padding.
Rotation/crop is a controlled diagnostic, not evidence that the accepted
artwork should be replaced. Consumer integration and NWN playback remain
separate. All new candidates continue to report `nativeVerified:false`.
