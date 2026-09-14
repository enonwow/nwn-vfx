# Studio 0.14.2 — bottom-first TGA export

Activated locally on 2026-09-07. TGA now stores bottom-first BGRA32 rows with
descriptor `0x08`, matching the engine row interpretation described by a
[Beamdog developer](https://forums.beamdog.com/discussion/72413/upside-down-tga-textures).
The previous top-first `0x28` layout passed a standards-aware roundtrip while
mapping rows upside down under that NWN interpretation.

An offline reproducer using the immutable heart r4 geometry and UV recreates
the user's texture patches and horizontal seam by changing only row
interpretation. The consumer independently viewed that comparison and accepted
it as a strong explanation to test. **Native appearance and repeated playback
remain unverified.** The release makes no change to animation or actor binding.

## Installation and verification

- CLI/service 0.14.2, endpoint `http://127.0.0.1:4317/`, API envelope 0.1.0.
- Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057` and workspace
  `7def76b2-ad42-4b55-a5e8-d919b79a8587` preserved.
- Before the update the service was not responding; explicit CLI start restored
  0.14.1 with its existing identity. Snapshot then found 35 projects and no active
  jobs. After upgrade all 35 revisions and canonical document hashes matched.
  Evidence: `output/releases/0.14.2/{before-install,installed-preservation}.json`.
- Build, TypeScript and skill validation passed. Updated skill installed;
  installed CLI `doctor` also passed from `C:\Projects\the last city`.
- Unit/service suite: **237/237 passed**. Asymmetric raw payload tests verify
  every RGBA texel including transparent colored pixels. Old top-first output
  demonstrably passes standard decoding and fails bottom-first decoding.
- Historical procedural pixel/MDL checks still use their original hashes after
  reconstructing the old serialization/resrefs; they do not replace old expected
  values with new hashes. New receipt contracts reject top-first/missing native
  addressing evidence; historic receipts remain readable.
- Browser acceptance: **3/3 passed** — asymmetric custom RGBA textures, rigid
  smooth shading and deforming smooth shading. Coverage includes production UI,
  drafts, CLI, controlled WebMCP registry, PNG/WebM, ASCII and binary candidates.
  This is not a new live Codex-host WebMCP mutation or native rendering test.
- Logs: `output/texture-orientation-audit/{unit-tests,browser-tests,install}.log`.
- Package `output/releases/nwn-vfx-studio-0.14.2.tgz`, 2028850 bytes, SHA-256
  `8e66e5e82cacfdf96aa9599f79b4966737024b2720a8b8b59a462bedd3ec7add`.
  [Source hash inventory](source-manifest.json) records the local unborn/untracked
  workspace, not a commit.

## One exact-r4 candidate

Created through public operations as an isolated fork, preserving the source
project and all historical artifacts. No artistic field or name changed in the
document. Model name is an explicit export option.

| Item | Value |
| --- | --- |
| Source | `tlc-wampir-bijace-serce` r4 |
| Fork | `studio-heart-texture-origin-0142` r1 |
| Model | `vh_tex0142` |
| Texture and TXI resref | `vfx_2eb93911bc47` |
| Candidate job | `f1047e8d-da0f-4ccf-8e8b-dab6e0799eb6` |
| ZIP artifact | `3e99544e-006f-418c-aa02-f9af976fcbf1` |
| MDL artifact | `844dccfa-3277-41de-b58a-0110f6003050` |

- Document SHA-256, exactly equal to r4:
  `5675ce09546c078f6d1aa0359b0b61a3c4f9dbace033f54c4d88e9ed254ba5bf`.
- ZIP SHA-256, 17012605 bytes:
  `b081bd687eacc44739c0e613a336efa4874f08bbe1891da6f7b4dbb6f6dc3b7f`.
- Binary MDL SHA-256, 4333628 bytes:
  `087b225ca608c1f9f2d5eb4dc768016702882718fdea2bd1c7d1fbde174a94d7`.
- New TGA SHA-256:
  `b09a4489b0b70c8be0df90ed3d3e2d1f990b9bf4a65c645f00c651485b90af59`.

Files: `output/texture-orientation-audit/bottom-first-0142/`.
Handoff metadata: `output/texture-orientation-audit/candidate-handoff.json`.

## Independent comparison

`output/texture-orientation-audit/bottom-first-vs-0141.json` compares the new
candidate with immutable `vh_ctrl0141` from the previous release:

- Parsed ASCII is identical after normalizing model and texture resource names.
- Both binary mesh sections preserve ordered positions, UV, faces, draw indices,
  all vertex/UV sample values, controller types, sample period and render flags.
- 1675 expanded corners and 2240 triangles; one renderable base mesh and one
  animation binding. 121 impact sample sets at 1/60 s; 202675 position samples
  and 202675 UV samples checked. No duplicate controllers.
- Static normal arrays are unchanged, SHA-256:
  `f71be49677e6dd16daedb680f9d3874336c8a2980cb5dcf06f136ae49d40fba8`.
- The new 1024×1024 TGA's raw bottom-first addressing matches all 4194304 source
  RGBA bytes. Standard and modeled NWN readers also match. All 1048576 alpha
  values are 255. No alpha, gamma, filtering or tint correction was applied.
- Source PNG asset remains
  `3070a81f9be9beca7e4061a3eb0a5b1351bf3d7deafdfea1fede754c4f04fb34`;
  decoded RGBA SHA-256 is
  `4583d68c48b5359d32f525a081309063ad5fcc98fd10e41a676dc42e1a141e94`.
- Reversing the new TGA payload rows and restoring descriptor `0x28` reproduces
  the entire old TGA byte-for-byte. TXI contents remain identical; their new
  name follows the new TGA content-derived resref.

Software comparison image and mask statistics are in
`output/texture-orientation-audit/{orientation-comparison.png,software-render-proof.json}`.
Across four angles silhouette masks match exactly while row interpretation
changes the internal texture patches. This is offline evidence only.

## Consumer boundary

The consumer receives this single candidate for a manually observed, clearly
labelled **SERCE-A** test. It owns `ApplyEffectToObject`, per-cycle labels and
module integration. The user's running game and camera were not controlled here.
Animation samples were not modified; this release does not establish why a
previous unlabeled variant appeared stationary. `nativeVerified:false` remains
in every candidate and report until a separate qualified consumer observation.
Agent-facing workflow: [TGA contract](../../agents/tga-origin.md).
