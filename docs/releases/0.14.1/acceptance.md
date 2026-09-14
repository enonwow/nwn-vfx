# Studio 0.14.1 — animmesh controller correction and direct binary audit

Activated locally on 2026-09-07. The confirmed exporter ambiguity is removed:
animmesh animation nodes now contain one controller of each type, retaining
their keys instead of also copying static position/orientation/scale/alpha.
Trails no longer duplicate alpha. The pinned compiler is unchanged.

**The cause of the heart's ragged native appearance is not established.** This
release and its offline checks must not be described as a proven NWN visual fix.
The consumer performs the controlled game comparison with the returned resources.

## Installed result

- CLI/service: 0.14.1; endpoint http://127.0.0.1:4317/; API envelope 0.1.0.
- Instance: `12d0fa8e-4887-4f00-ad74-9bb15b05c057`.
- Workspace: `7def76b2-ad42-4b55-a5e8-d919b79a8587`.
- Before restart: 34 projects and zero active jobs. All 34 revision numbers and
  canonical document hashes matched after installation. Evidence:
  `output/releases/0.14.1/installed-preservation.json` and `before-install.json`.
- Updated `nwn-vfx` skill installed. No consumer/native files were changed.
- Package hash and source file inventory: [source-manifest.json](source-manifest.json).
  The workspace remains unborn/untracked; this is a source hash inventory, not a git commit.

## Verification

- Build, TypeScript and skill validation passed.
- Unit/service suite: **234/234 passed**.
- Browser acceptance: **2/2 passed**, rigid and deforming smooth mesh; human
  selector, CLI from another cwd, WebMCP operations, drafts, PNG/WebM, ASCII and
  binary jobs, verified artifact retrieval. This uses a controlled WebMCP host
  registry; no new live Codex-host mutation is claimed for this release.
- Direct binary regression modifies a draw index while retaining all face
  records and samples. The pinned decompiler/old roundtrip and normal reader
  still pass; new `geometryReadback` rejects the corrupted draw buffer.
- A second regression compiles the old static-plus-keyed alpha pattern. Old
  roundtrip/normal checks pass; direct controller uniqueness rejects it.
- Sample position, UV, out-of-section pointer and duplicate controller
  corruptions also fail the new check.
- Logs: `output/animmesh-audit/{unit-tests,browser-tests,build,install}.log`.

## Original r4 findings

Audit: `output/animmesh-audit/r4-offline-audit.json`.

- Project `tlc-wampir-bijace-serce` r4, document SHA-256:
  `5675ce09546c078f6d1aa0359b0b61a3c4f9dbace033f54c4d88e9ed254ba5bf`.
- Original binary MDL SHA-256:
  `f8e9629d3e4fccd4692cf33aa3688c422d17ff8804aa30bfff73af311d0ae27a`.
- 1122 source positions, 1675 UV; 2240 triangles form a closed mesh with 3360
  consistently wound manifold edges. Export expands to 1675 position/UV corners.
- Base and animation have identical ordered positions, UV, faces and draw
  buffers (6720 draw indices each). Each of the 121 binary sample sets matches
  the source; 202675 expanded position samples and 202675 expanded UV samples.
- Texture alpha is 255 in all 1048576 texels.
- Base animmesh has zero sample sets, animation has 121 with period 1/60 s.
  There is one base renderable mesh and one animation binding. Two sections
  and 4480 total stored triangles do **not** prove two simultaneous surfaces.
- Impact controller types were `[8,20,36,100,128,8,20,36,128]`; position,
  orientation, scale and alpha occurred twice. This survived the earlier checks.
- Consumer separately reported 10-second application spacing for a two-second
  effect, no duplicated cycles in its logs, and empty gaps in its video. This
  weakens loop-overlap suspicion but is not a renderer instance count.

## Exact-document candidate and controls

All were created through public Studio operations on isolated forks.

| Purpose | Project/revision | Model | Candidate job |
| --- | --- | --- | --- |
| Static control, 0.14.0 | `studio-heart-audit-static-0140` r2 | `vh_static0140` | `e28c7e2e-5909-4a25-b7c3-71be49110f08` |
| Held animmesh, 0.14.0 | `studio-heart-audit-held-0140` r2 | `vh_hold0140` | `b1161ce3-d7c9-47b5-9a9b-6ff894823348` |
| Same r4 document, 0.14.1 | `studio-heart-audit-controllers-fixed-0141` r1 | `vh_ctrl0141` | `791d104d-f43e-4b3a-9823-a2e76a6f6152` |

The first removes only deformation (and changes the diagnostic project name).
The held variant replaces deformation with two identical boundary keys, yielding
121 constant samples; all other artistic fields are preserved. An earlier attempt
to repeat full-precision base coordinates 62 times exceeded the existing document
limit and was rejected; the two-key control uses a new idempotency key.

The fixed candidate's document hash equals r4 exactly, including its name.
`output/animmesh-audit/fixed-vs-r4.json` independently verifies every base and
animation geometry array, draw index, position/UV sample, static normal and
texture byte unchanged. Parsed ASCII differs only by the model resref and removal
of four redundant static controller values. Impact types are now
`[100,8,20,36,128]`. Binary MDL SHA-256:
`4022c01fb48c27cf64390437d5dacd6430305e1ec0b07a24286e61dea318731d`.

Handoffs and verified ZIP/MDL artifacts are in `output/animmesh-audit/` under
`controls-handoff.json`, `fixed-handoff.json` and the three variant directories.
The consumer independently accepted the two controls' hashes and document diffs
and received the fixed candidate for comparison above the same player.

Re-export operations, output meanings and native comparison plan:
[agent contract](../../agents/animmesh-export-audit.md).
Native lighting, dynamic normals, playback and the screenshot defect remain
unqualified pending the consumer's observation. No NWN/Toolset was launched here.

## Consumer follow-up

The consumer accepted the fixed candidate's exact-document comparison and artifact
hashes. It prepared a combined native comparison with rows 11085 original,
11086 static, 11087 held and 11088 fixed, shown above the player at ten-second
intervals. Its report and evidence are in the consumer workspace under
`assets/vfx/wampir/bijace-serce/native/surface-comparison-0141/`.

The user observed motion in the first variant, then stationary variants and
remaining artifacts. Static and held are deliberately stationary. The available
log ends at held (11087), the screenshots are not unambiguously tied to a variant,
and observation of fixed (11088) is not confirmed. Consequently this evidence
neither validates nor disproves the visual effect of the controller correction.

The user now performs the native tests; the consumer supplies packages and
analysis. Further changes should be driven by a clearly labelled manual test of
variant 4 or a precise static reproducer. No additional speculative geometry
change is justified by this follow-up.
