# Experimental NWN VFX export

`buildCandidate(document, modelName)` returns in-memory files and a validation report. It does not install anything, execute a tool, or write to a consumer project. `zipCandidate(result)` creates a repeatable ZIP. The service owns job state, immutable storage, access control, revision binding and delivery.

The result contains ASCII MDL, BGRA32 TGA and TXI for referenced textures, a resource-only HAK V1.0, the original Studio document, a readback report and integration notes. An untextured mesh with normal blending needs only MDL in its HAK. It does **not** contain a MOD or `visualeffects.2da`: a consumer such as TLC must allocate its own registration and HAK order through the integration profile.

## Emitter mapping

| Studio field | Serialized representation |
| --- | --- |
| `position` | `position` on a dummy parent, unchanged NWN Z-up coordinates |
| `scale` | Static `scale` and `scalekey` on that parent; emitter sizes are not baked or multiplied |
| `size`, `midSize`, `endSize` | `sizeStart`, `sizeMid`, `sizeEnd`; Y size zero uses the X dimension |
| `color`, `midColor`, `endColor` | `colorStart`, `colorMid`, `colorEnd` as authored hex/255 RGB fractions |
| `alpha`, `midAlpha`, `endAlpha` | `alphaStart`, `alphaMid`, `alphaEnd` over normalized particle age |
| `midPercent` | One shared `percentMid` for all three channels, fraction 0.01–0.99; `percentStart 0`, `percentEnd 1` |
| `life` | `lifeExp` in seconds |
| `speed`, `spread` | `velocity` and `spread` in radians; zero `randvel` |
| `gravity` | Direct signed `mass`; positive down/negative up intent, **not** the P2P `grav` field or measured SI acceleration |
| Explosion `start`, `count` | Global `detonate` and per-emitter keyed birthrate; each emitter has zero birthrate at other layers' events |
| Fountain `start`, `duration`, `count` | Bounded linear birthrate envelope with ramps up to 1 ms; its integral equals count |
| `texture`, `blend` | Shared builtin or imported RGBA image; normal → emitter `Normal` and TXI `default`, additive → emitter `Lighten` and TXI `additive` |
| `seed` | Preserved in source JSON; a warning states that native particle RNG is not controlled |

Explosion emits instantaneously: its `duration` is retained in the project for switching to Fountain, and is explicitly documented as inapplicable to this native update mode. An effect whose duration would truncate particle life is rejected. Disabled layers remain in the source document and do not contribute render resources. Enabled ribbon/light layers currently reject export.

Explicit midpoints require document schema 3. Missing `midPercent` means 0.5. An omitted channel's mid value interpolates its start/end at the selected fraction, preserving a straight line. The fraction concerns **each particle's normalized age**, not project time or the emitter's emission duration. The format subset has no independent color/alpha/size midpoint times, arbitrary curves, moving percent endpoints or zero-length segments. Writer and independent reader preserve all authored values; native support and interpolation still require qualification. RGB controller values retain historical hex/255 semantics. The Studio renderer uses linear-light RGB; preserving these values does not claim native color-management parity.

## Texture mapping (Studio 0.4, document schema 3)

Imported assets are immutable original PNG bytes addressed by full SHA-256. The accepted subset is non-interlaced RGBA8 PNG, power-of-two dimensions 8–1024 on each axis, at most 2 MiB per image, 8 assets per document and 6 MiB per serialized document. PNG ICC/chromaticity profiles, non-sRGB gamma and animated PNG are outside the importer. The source document preserves original bytes, file name, hash and dimensions; the exporter validates identity and decodes all declared assets, including unused ones. Missing references fail even on disabled layers.

The preview and exporter use the same pure RGBA source for imported images and builtins. The three builtin 128×128 textures retain their previously released pixel values. Since 0.14.2 TGA conversion swaps R/B byte order, serializes rows bottom-first and uses a standard uncompressed 32-bit header with 8 alpha bits and bottom-left origin. NWN assumes bottom-first even when an image declares top-left; the earlier standards-compliant top-first output could appear vertically flipped in game. It never premultiplies RGB, transforms gamma, discards RGB under zero alpha, resizes, or requires a transparent border. The readback decodes the serialized TGA into top-to-bottom RGBA and compares every byte with the source. A fully opaque or transparent image is representable.

Every material has explicit TXI `blending default` or `blending additive`, `mipmap 1`, `filter 1`. There is no `blending normal` TXI literal. The content hash covers **both TGA and TXI**, so assigning one image with different blends produces distinct resrefs and cannot overwrite a material. Texture dependencies deduplicate by those bytes, independent of display names. Legacy emitter defaults remain spark/glow additive and smoke normal; imported emitters and meshes default to normal. Additive meshes without an assigned image use an internal opaque white 8×8 texture with an additive TXI.

`validation.assets` is a complete metadata/hash manifest without base64. Its `referenced` flag means referenced by enabled exported layers, and `resources` lists the generated TGA/TXI names; unused assets stay in the source document. The resource HAK includes only enabled native dependencies. `readback.textures` records actual dimensions, alpha range, origin, RGBA SHA-256, source references, blend, and parsed TXI fields. Runtime filtering, blending, material lighting, sorting and display color are not established by this pixel-preservation check.

## Mesh mapping (geometry schema 2; texture/UV schema 3)

Box, planar ring/disk and custom indexed triangle geometry use the same `buildMeshGeometry` function as the Studio renderer. Vertices remain in local coordinates measured in meters, in the NWN Z-up system. There is no project-specific sword or ring asset in the exporter.

Each mesh has an identity dummy parent and one `trimesh`. The MDL contains full `verts`, `tverts` and `faces` tables. Faces have eight fields: three vertex indices, smoothing group 0, **three independent UV indices**, material index 0. UV rows are `u v 0`; their origin is bottom-left. Custom UV has 3–8192 coordinates in [0,1] and exactly one UV triangle per geometric triangle. Assigning a texture to custom geometry requires explicit `uv` and `uvFaces`; no welding or guessed projection occurs. Legacy untextured custom geometry gets neutral UV.

Box geometry maps the full image to each face with separate seam indices. Ring/disk projection is `u = 0.5 + x/(2*outerRadius)`, `v = 0.5 + y/(2*outerRadius)`, including a disk center at (0.5,0.5). Winding is preserved; mesh faces are single-sided. A custom mesh may explicitly supply reverse faces when that geometry is required.

| Studio field | Serialized representation |
| --- | --- |
| `geometry` | Real indexed triangles, up to 2048 vertices / 4096 faces per layer |
| `position` | Mesh position, NWN Z-up; `positionkey` preserves linear local-space translation |
| `orientation` | Unit axis plus angle in radians; `orientationkey` retains each authored endpoint |
| `scale` | Uniform positive `scale` and `scalekey` |
| `color` | RGB fractions in both `diffuse` and `selfillumcolor`; texture color multiplies the material |
| `texture`, `blend` | `bitmap` resref plus TGA/TXI dependency; normal without an image uses `bitmap NULL` |
| `alpha` | Controlled by `alphakey` during `impact`; geometry alpha is 0 so a mesh is invisible before animation |
| `animation` | Local key time + layer `start`, linear position/scale/alpha; transform endpoints held outside the layer interval |
| `start`, `duration` | Alpha 0 outside the interval; nonzero boundary alpha uses linear ramps no longer than 1 ms |

An absent or empty controller uses the base value. A first key after local time 0 interpolates from the base value; a key at 0 overrides it in the animation. The final key is held. All authored interior alpha keys survive the lifetime gate; ramps are shortened when a key lies within 1 ms of a boundary, and their exact durations appear in readback. Zero boundary alpha needs no ramp. Key times that collapse to the same float32 engine time reject export explicitly.

Studio samples orientation using shortest-path quaternion slerp. The exporter preserves axis-angle endpoints and does not claim a verified match to the engine's interpolation. Unlit material appearance, transparency sorting, winding and native animation activation also require later NWN proof. There is no lighting material, automatic two-sided material, rig/skinning, geometry importer or custom controller interpolation in this subset.

`validation.readback.layers` retains the emitter records. `validation.readback.meshes` contains the actual parsed vertices, triangle/UV indices and coordinates, texture/material/base transform values, all four controller tables and visibility-ramp durations. Old candidate reports can omit new fields; exporter 0.4 reports all of them, with an empty `meshes` array when appropriate. `alpha` in a mesh readback is the static MDL value (0), while `alphaKeys` is the animated opacity.

## What the validation establishes

The ASCII reader parses independently from the writer, checks hierarchy, keyframes, mesh table counts, finite values, triangle/UV indices, degenerate faces, references and animation bounds, then the builder compares serialized properties and geometry against the input. Rotation comparisons concern endpoints, not invented linear interpolation of axis-angle components. The HAK reader follows actual resource IDs, checks ranges and verifies each extracted payload's hash against the source bytes. Independent TGA and TXI readers check pixels and material declarations. Tests include independent emitter and trimesh ASCII fixtures, an independently assembled asymmetric PNG with varied RGBA, separate UV seams, normal/additive variants of one image, and a HAK built directly from the binary layout with resource IDs out of key order.

`nativeVerified` is always `false`. Native execution, particle randomness, inherited scale, visual size, blending, gravity behavior, frame-dependent emission count, art quality and preview parity have not been established. The builder does not launch the Toolset or NWN. A byte readback result cannot close the native acceptance gate.

## Reference basis

- ASCII structure and animation grammar: [NWN MDL ASCII documentation](https://nwn.wiki/spaces/NWN1/pages/12027273/MDL+ASCII).
- Emitter properties and the global detonate/birthrate relationship: [NWN emitter documentation](https://nwn.wiki/pages/viewpage.action?pageId=139690011).
- ERF V1.0 field layout cross-check: [neverwinter.nim ERF implementation](https://github.com/niv/neverwinter.nim/blob/master/neverwinter/erf.nim). No donor CLI or source function is executed.
- Material directives: [original BioWare TXI example](https://neverwintervault.org/article/tutorial/bioware-txi-example), which explicitly names `default`, `additive` and `punchthrough` (the last is outside this subset).
- Shared normalized percentages and three-stage lifetime curves: [rollnw emitter import implementation](https://raw.githubusercontent.com/jd28/rollnw/main/lib/nw/model/mdl_particle_import.cpp). This is a primary implementation of a compatible renderer, not proof that the installed NWN build behaves identically.
- Native controller identifiers: [xoreos NWN model implementation](https://raw.githubusercontent.com/xoreos/xoreos/master/src/graphics/aurora/model_nwn.cpp) lists AlphaMid, ColorMid, PercentStart/Mid/End and SizeMid.
- Existing local Coil V3 ASCII and scripts were inspected read-only for syntax and limitations. No model, texture or engine proof from that project is bundled as a newly verified result.
