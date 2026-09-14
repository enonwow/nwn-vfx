# TGA row order — Studio 0.14.2

Studio now exports uncompressed BGRA32 TGA with the bottom row first and
descriptor `0x08` (eight alpha bits, bottom-left origin). Previous exports used
top-first rows and descriptor `0x28`. The normal TGA reader honored that flag,
so a standards-only roundtrip reproduced the PNG while missing NWN's different
row interpretation. A Beamdog developer describes the engine's bottom-left
expectation and recommends saving bottom-first uncompressed images in
[Upside down TGA Textures](https://forums.beamdog.com/discussion/72413/upside-down-tga-textures).

## Preserved authoring data

The serializer reverses row storage and swaps RGBA to BGRA without changing any
channel. It preserves alpha and invisible RGB under zero alpha. PNG assets and
their IDs, UV and independent face indices, positions, topology, material,
normals, keyframes and sample periods are unchanged. TXI contents are unchanged.
The same change applies to custom PNG, procedural emitter/mesh textures and
generated trail textures in both ASCII and binary candidate profiles.

Texture resrefs are derived from serialized TGA plus TXI bytes, so a new export
gets new texture/TXI names and matching MDL references. Existing candidates and
saved documents are immutable. The browser still uses the same PNG/RGBA data.
Do not flip UV or edit the source PNG to compensate for this corrected exporter.

## Readback and re-export

For both 0.14.2 exporter profiles, `validation.readback.textures[]` requires:

```json
{
  "origin": "bottom-left",
  "generator": "shared-rgba-tga-bottom-first-2",
  "rgbaSha256": "<SHA-256 of top-down source RGBA>",
  "nwnBottomFirstRgbaSha256": "<the same SHA-256>"
}
```

The exporter compares all pixels using a standards reader and a reader modeling
NWN's bottom-first addressing. Tests independently inspect literal raw payload
corners and every asymmetric RGBA texel. Historical job receipts keep accepting
top-left origin and missing new evidence; they are not relabeled as new builds.
Refresh closed client output schemas before consuming new receipts.

Inspect `doctor`, the selected project/revision and `schema get candidate.build`.
Build the same saved revision through CLI, API or `studio.candidate.build` with
a **new stable idempotency key**. A retry of that intended build uses the same
new key. Reusing an older build's key returns its older result. No source edit
is required. For a consumer's explicit A/B test, pass a unique legal `modelName`
through the shared operation input; retrieve `jobs.get`, then verify each
artifact's complete size and SHA-256. A WebMCP client uses its existing scoped
grant and chunked artifact reads. Exporter changes do not bypass human locks,
AI pause, revision conflicts or project permissions.

## Heart reproducer and limits

The immutable `tlc-wampir-bijace-serce` r4 document hash is
`5675ce09546c078f6d1aa0359b0b61a3c4f9dbace033f54c4d88e9ed254ba5bf`.
An offline render using its exact geometry and UV, alpha 1 and depth writing
reproduces the distinctive patches and horizontal seam when the old TGA is read
bottom-first. Four angles retain identical silhouette masks. The consumer
compared this with the user's screenshots and accepted it as a strong,
reproducible explanation to verify in the game.

Reproduce with `python scripts/heart-texture-orientation-audit.py` while the
explicit consumer source fixture is available. Evidence is in
`output/texture-orientation-audit/orientation-comparison.png` and
`software-render-proof.json`. `scripts/heart-texture-candidate.ts` creates one
isolated fork and exact-document export through the installed 0.14.2 service.
`scripts/compare-heart-texture.ts` compares it with the 0.14.1 candidate,
including raw TGA addressing, all geometry/sample arrays and static normals.

The consumer owns the single labelled **SERCE-A** manual test, actor attachment
and module integration. This release does not change animmesh timing or claim
to fix repeated playback. Static and held diagnostic controls from previous
releases deliberately do not deform; unlabeled screenshots do not identify
which candidate ran. `nativeVerified` remains false. No NWN/Toolset launch,
native process control or MOD/HAK installation belongs to this Studio task.
