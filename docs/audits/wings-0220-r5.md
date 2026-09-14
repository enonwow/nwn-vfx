# Wings r5: animmesh and F/D/F export audit

Date: 2026-09-09. Requester: Codex task
`01a070e3-5df3-7913-943f-854ac8ea98ee` (The Last City).

**No duplicated geometry/controller export defect was found in the exact r5
artifacts.** Source and binary geometry, reverse membrane faces, deformation
samples and phase boundaries pass the checks below. The reported visual overlap
remains unresolved at runtime; these results do not dismiss the user's report.
Studio stays at 0.22.0. No application/exporter behavior was changed.

## Inputs and reproducibility

Read-only input directory:
`C:/Projects/the last city/assets/vfx/wampir/skrzydla/studio/v3/`.
The audit read `open-candidate`, `loop-candidate` and `close-candidate`, including
their source document, source MDL, binary MDL, compiled roundtrip, validation and
integration metadata. Public installed CLI `revisions get --project ID
--revision 5` independently matched each canonical source document and snapshot
hash. The current head was not substituted for r5.

| Project at revision 5 | Exact binary MDL SHA256 |
| --- | --- |
| `tlc-wampir-skrzydla-open` | `a16e09d959b80068019c793d4dc3f10cfd9cc2c9ab4211e4252c02bcd367bb95` |
| `tlc-wampir-skrzydla-loop` | `36c9b9416426235ae529fe8cedabb930a8be23207a43ccc51ab892783c26dfa6` |
| `tlc-wampir-skrzydla-close` | `85a82cdb1c5748455e3c9cfabd6c35df94d049fba7376198c560d6cac3456242` |

Run from the Studio repository:
`npx tsx scripts/audit-wings-0220.ts`.
Evidence: `output/wings-0220-audit/exact-export-audit.json` and `audit.log`.
The script checks all 18 input artifact hashes again after its read-only audit.
All remained unchanged. TypeScript checking also passed. No new candidate was
needed because no exporter correction was established.

## Geometry and animation findings

Each model contains four base animmesh nodes and four corresponding animation
bindings: `left`, `right`, `left_membrane_back`, `right_membrane_back`. There are
no extra trimesh copies. The binary reader's `meshNodes:8` counts **four base
nodes plus four bindings**, not eight independently authored scene meshes.
The 14812 audited triangle records count geometry and animation sections;
the four base meshes contain 7406 triangles in total.

This two-section representation agrees with the primary
[animmesh authoring tutorial](https://forums.beamdog.com/discussion/69250/how-to-manually-create-animmeshes-a-tutorial):
base geometry is defined once in the model hierarchy; the named animation holds
sampled vertex positions and its sample period. Repeated matching node names in
these different sections alone do not establish an extra rendered model.

Direct binary inspection, including raw draw-index arrays, passed for all three
models. Every draw triangle matches its face table with multiplicity and winding.
Base and animation vertex/UV/index ordering agree. There are no duplicate
controller types; animation nodes have one keyed position, orientation, scale
and alpha controller each. Static self-illumination is separate.

Opening/closing have 49 sampled poses; the 1.4-second loop has 85, at 60 Hz.
Every ASCII deformation sample equals the authored trajectory sampled by Studio.
Binary positions, UVs and every vertex-major sample match the float32 source
at each triangle corner. Checked binary vertex samples: 503475 / 873375 / 503475
for opening / loop / closing (UV counts equal these).

The left back membrane has 1208 positions and 1183 reversed faces; the right has
1190 positions and 1156 reversed faces. Every back position maps to its front
surface. Across all authored keys, maximum front/back motion difference is
**0 metres** for all three phases. Every back triangle reverses a matching front
triangle; no same-winding or unmatched back triangles were found. Layer
transforms, scale and alpha also agree. These layers are intentional coplanar
opposite faces, not independently moving wing pairs.

## Visibility and lifecycle

| Phase | Model animation | Length | Authored/exported alpha | Base alpha |
| --- | --- | --- | --- | --- |
| Opening | impact | 0.8 s | 0 at 0; 1 at 0.1; 1 at 0.8 | 0 |
| Loop | duration | 1.4 s | 1 throughout | 1 |
| Closing | impact | 0.8 s | 1 through 0.68; 0 at 0.8 | 1 |

All have transition time 0 and no animation events. Integration metadata is
F/D/F with `OrientWithObject=1`. The exporter faithfully retains the explicitly
authored alpha; it does not add a fade to opening r5.

Opening end → loop start, the loop seam, and loop end → closing start have
**zero vertex/position difference** for all four layers, with identical rotation
and scale. Alpha is 1 on both sides of these intended phase boundaries.
At half a loop, however, the fixed closing pose differs by up to
**0.09666014158405724 m**. An arbitrary removal phase can therefore jump even
with otherwise valid exports.

The consumer script applies opening as an instantaneous F effect, schedules DUR
after 0.8 s, holds DUR for 2.8 s, removes the tagged effect and applies closing.
It does not explicitly remove the opening model; its native F lifetime is relied
upon. Opening ends at alpha 1, so a renderer that retains that final pose could
overlap a later model. This is a **hypothesis**, not a confirmed engine behavior
or exporter defect. DUR expiration and the scheduled close also depend on
engine/client timing; two nominal periods do not prove exact client phase.
Visible base alpha in DUR/closing is another state to distinguish if a native
renderer returns to base pose. Structural validation cannot establish when
native model instances or animation bindings stop rendering.

The requester subsequently reported r6 uses opening alpha 1 at .799 and 0 at .8,
and a different vertical motion. That tail is a reasonable diagnostic for a held
opening pose, but it is an authored change, not proof of an exporter fix. Compare
phases under controlled timing before attributing any improvement to it. r6 was
not included in this r5 audit and no r6 source was changed here.

## Supplied recording and next diagnostic

The supplied recording was read, not recaptured:
`C:/Projects/the last city/assets/vfx/wampir/native/wings-v1/runtime/wings-v1-nwn.mp4`,
SHA256 `65f2d33e62a373ef81d6e511d35d6766dfb13eba5f094bddf496745f187908e3`.
`wings-visible.png` SHA256:
`053aa1bfed6ccb40d7ea8c1303b89ad9ce1261a5fa203b82749d16c14b7cbbc3`.
Frames were extracted at 2 fps from 24–31 seconds into the local audit output.
The viewed frames show wings appearing and later absent, with the camera moving
during the effect. They do not identify a particular duplicated instance or
prove that an opening model persisted. A specific offending frame/interval and
the distinction between two full pairs versus intersecting membrane surfaces
were requested; the consumer is clarifying this with the user.

The consumer's next discriminating native test is an isolated single activation
with a fixed camera: opening alone followed by a hold, DUR alone followed by
removal, then closing alone. If each phase is clean, compare the same exact
resources in F→D and D→F transitions. Record whether overlap involves the held
opening pose, a returning base pose, or two simultaneous effect instances.
Temporary gaps or the r6 alpha tail are diagnostic differences, not a guarantee
of a seamless final effect. The consumer owns those native tests.

Existing supported Studio operations are sufficient to prepare isolated variants:
`projects.fork` at an explicit revision, `changes.preview/apply` with
`layer.set` animation/alpha and expected revision, `preview.request/compose`,
`candidate.build`, and artifact retrieval through CLI or the corresponding
scoped WebMCP tools. Do not patch exported MDL or accepted project history.
No Toolset/NWN process, native module/HAK write, project edit, service restart,
or installed package update was performed during this audit.
