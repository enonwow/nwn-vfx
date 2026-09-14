# TLC-WYROK-STUDIO-14 — Studio 0.10.0 and native diagnostic candidates

2026-09-07. Requester: `01a070e3-5df3-7913-943f-854ac8ea98ee`.

**Installed 0.10.1; three immutable 0.10.0 candidates delivered. Full binary r4
visibility confirmed in the runner's native retest.** Two complete cycles show
the seal, sword above the character, side trails, impact wave and fade. This
result applies to the exact candidate and native runtime bound below; it is
not global native qualification or artistic acceptance.
The runner's sequential PTS review demonstrates full ASCII r4 is invisible
while stock, historical r8 and the same r4 with ten trails disabled are visible.
This isolates the regression to enabling animmesh trails or their data path;
it does not identify the exact retail parser/playback defect. No size limit,
float32 timing failure or universal animmesh non-support is diagnosed.

**Provenance correction, 0.10.1:** the three immutable 0.10.0 candidate receipts
incorrectly identify reference-study commit `3660b18459c2c762806bc0f00458fc590b376ca9`
as the compiler build source. The actual build source is
`https://github.com/dunahan/nwnexplorer`, commit
`56da6dc2fe94da6bbabe83ad18670f47fccd7dfb`. All compiler/library C/C++/header
inputs were compared against that commit; only the documented resource-free
launcher patch differs. Exact inventory: `output/studio-14/compiler-provenance.json`.
The executable SHA-256 and every delivered MDL/HAK/job remain unchanged.
0.10.1 corrects metadata for future builds and retains readable historical
receipts; it does not regenerate these candidates or claim native qualification.
0.10.1 activation is complete: the same instance/workspace, all 19 original
project DTOs and all three delivered job DTOs remain identical; the only added
project is `studio14-minimal-trail`. Five affected tests and validation of all
three historical job DTOs pass. Final activation:
`output/studio-14/activation-final.json`. Installed tarball SHA-256:
`b3eaee8f83c0ac920b37e71a573903160dae2bdc0fc2034da0c36bf7cb85eb19`.

## Implemented control

The explicit `nwn-ee-impact-binary-experimental-v1` build profile compiles the
same validated Studio source with a bundled Windows resource-free compiler.
The existing default remains `nwn-ee-impact-ascii-experimental-v1`. The worker
uses distinct default model resrefs per export profile. No authored revision,
geometry, path, timing, material or texture is changed by this selection.

The compiler is hash-pinned, runs in a bounded private directory, has game
discovery disabled, and never starts NWN or Toolset. The package carries its
license, exact launcher patch and provenance under `bin/native`. Verification
compares every base triangle corner and winding/multiplicity, every animated
vertex/UV, controllers (including equivalent quaternion rotations), hierarchy,
materials, textures and events. Normals and retail rendering remain unqualified.

The binary MDL is placed in the resource HAK by the public worker. ASCII source,
compiler roundtrip, logs, compilation metadata and exact artifact hashes are
included alongside it. No hand-patched MDL, substituted old HAK or direct
database modification was used. UI, CLI and WebMCP share the same operation.

[Public operation guide](agents/binary-export.md).

## Validation and activation

- Typecheck and production build PASS.
- **205/205 unit/service/contract tests PASS**, including corrupt-sample and
  missing-controller rejection, AI pause, scoped build access, idempotent retry,
  distinct model identities, source preservation and artifact manifest checks.
- **Browser trail acceptance 1/1 PASS**: existing editor, rendering, CLI, grants,
  conflicts, locks, draft preservation and portable projects, extended with
  binary builds through UI and the WebMCP adapter and hashed artifact retrieval.
  This test uses an explicitly controlled WebMCP registry, not a live Codex
  host discovery claim. Screenshot: `output/playwright/trails/binary-profile-ui.png`.
- Full r4 data comparison PASS: 514,040 position samples, 514,040 UV samples,
  98 controllers, 65 geometry + 65 animation nodes. Maximum sample error
  2.8386564299154315e-7 m. A same-name in-memory build retained the original
  ASCII SHA `61780c85a31c09e3e2e19f82411f6d2db4e70b359ec5a4ec1bc1f7a7c0ec68f0`.
- Public service stop/install/start completed; instance
  `12d0fa8e-4887-4f00-ad74-9bb15b05c057` and workspace
  `7def76b2-ad42-4b55-a5e8-d919b79a8587` preserved. All 19 project DTOs matched
  before/after activation. Existing human tabs were not operated on. User skill
  synchronized. No native process was accessed.

Logs: `output/studio-14-unit-tests-final.log`, `output/studio-14-build.log`,
`output/studio-14-browser-tests.log`, `output/playwright/trails/report.json`.

## Delivered immutable candidates

All directories below are under
`C:/Projects/the last city/assets/vfx/wyrok/export/`. ZIPs were downloaded via
public `artifacts get` and unpacked without altering resources. Every handoff
artifact size and SHA-256 was independently verified.

| Candidate | Directory | Project / revision | Model and HAK resref |
| --- | --- | --- | --- |
| Full r4 binary | `studio14-full-r4-binary` | `7e5e9347-7a57-4e70-ba7a-b77e0ec70af3` / 4 | `vfx92c51c3ae9c5` |
| Minimal ASCII | `studio14-minimal-ascii` | `studio14-minimal-trail` / 2 | `vfx85db69e8475f` |
| Minimal binary | `studio14-minimal-binary` | `studio14-minimal-trail` / 2 | `vfxb47f391b191e` |

Full r4: job `a8983a2d-4cb2-4a68-bc12-7b50cd13733a`;
snapshot `e7dbd885a68d854b9b57bdbac2da3c629b661b6164591ec1e83140a8dc1bf346`;
MDL 21,658,828 B, SHA `7224f2ae0e9997ae784fbbfe14ffdb712e16fd18d10e958828a25beea6bf9760`;
HAK 34,570,930 B, SHA `0bf2461a74d34dfed1f6cd90977148830d898da82d00c203cfd101ae1903ebe0`.

Minimal ASCII: job `815cf88c-7976-409f-8fd1-f5992825666f`;
MDL 84,150 B, SHA `4ea5e3026f6f02cdbae49f83543667cf3adaf51e15726444855cb9bdcf51d840`;
HAK 149,996 B, SHA `0d120e25aada897a020cc61232a5d3c768e75ba2e8f3534d81e711875b062eec`.

Minimal binary: job `a8c0c328-dcc9-48d4-91ef-440a51d98c1f`;
MDL 98,648 B, SHA `45b0912318964c248d8305572d9690a05c530c24d8d6b7cc65076d4d72a86e90`;
HAK 164,494 B, SHA `4860d92a59b7c522246e7e0c17fdcee3f07f12668127579019b4b5b69626b0be`.

Both minimal candidates share snapshot
`dc955f8661dd3656b9e6160ac7d6783dc8f21fd0e0bbe370d115436b917e0ffb`.
Their documents are identical; the ASCII candidate equals the binary build's
source ASCII after replacing only their model identities in memory for the
comparison. Full binary source exactly equals the public saved r4 document,
including its name, asset bytes and all 32 layers. Machine-readable identities:
`output/studio-14/handoff-summary.json` and each candidate's `handoff.json`.

## Minimal control timing

Created by public `projects.create` then `changes.preview/apply`. Complete
input: `output/studio-14/minimal-changes.json`; saved source is in both packages.
Duration 3 s, no emitter, two layers:

- Green reference ring at `[0,0,0.05]`, radii 0.28–0.4 m, 32 segments.
  Alpha: 0 at 0, 1 at 0.15, 1 at 2.7, 0 at 3 s.
- Golden straight trail starts at 0.2 s; local path from `[0,0,0.3]` at 0 to
  `[0,0,1.5]` at 1.5 s. Head disabled. Tail lifetime 0.5 s, core width 0.04 m,
  glow 0.1, alpha 1, max segment length 1 m (two segments). The endpoint is
  reached at global 1.7 s and the tail expires by 2.2 s; layer interval ends at
  2.8 s. Inspect movement between approximately 0.3–2.1 s and distinguish the
  green mesh control from the golden animated body.

## Native retest result — 2026-09-07

The requester completed the native test and recorded a candidate-bound verdict:
[native-verdict.json](<C:/Projects/the last city/assets/vfx/wyrok/native/binary-r4/runtime/native-verdict.json>).
Studio independently read that verdict and runtime profile, checked all 15
referenced artifact sizes and SHA-256 values (all match), and visually inspected
the aligned stages and exact 23 s / 33 s frames. This was an offline evidence
review; Studio did not operate native processes or rerun the capture.

- **Full binary r4: visible.** Two complete cycles at approximately PTS
  22.2–25.2 s and 32.2–35.2 s show the seal, sword above the character, fine side
  trails, impact wave and fade. The third starts near 42.2 s and is truncated by
  the clip ending at 44.967 s. The VM log records starts at game times 19.854,
  29.869 and 39.870 s, intervals 10.015 and 10.001 s.
- Stock and both minimal green reference rings are visible. **Minimal trail
  motion is not independently verified:** the guard occludes the vertical path
  at heights 0.3–1.5 m. This does not establish a general ASCII animmesh failure.
- The unchanged full source remains project `7e5e9347-7a57-4e70-ba7a-b77e0ec70af3`
  r4, job `a8983a2d-4cb2-4a68-bc12-7b50cd13733a`, binary model
  `vfx92c51c3ae9c5`, with the exact MDL/HAK/snapshot hashes listed above.

The [runtime profile](<C:/Projects/the last city/assets/vfx/wyrok/native/binary-r4/profiles/runtime-profile.user-directed.json>)
binds native-saved `wyrokbn04.mod`, 36,345 B, SHA
`45bbc98e6438eb7dedb249214fb0dd64d4ed008bbf20faff170ce6d16ef476fd`.
This is the post-Save module, distinct from the 36,209 B delivery MOD with SHA
`31971c8ba1f17ec74df77991da73541b3eb9ff8c20d0a7fbf22a0733f16196de`.
The ordered HAK list is `wyrokbnreg`, `vfx92c51c3ae9c5`, `vfx85db69e8475f`,
`vfxb47f391b191e`; the profile binds their exact hashes and registration rows.
Runtime is NWN 89.8193.37-17 win32, executable SHA
`3b7cb1252e0edb2ce22d7971f333aade027039ae30a45b4bc64732c3e6bec73a`,
PID 30528, start UTC `2026-09-07T01:07:35.7018701Z`, HWND 4131382,
Toolset PID 14164, nonprimary `DISPLAY1`.

The [45 s capture](<C:/Projects/the last city/assets/vfx/wyrok/native/binary-r4/runtime/comparison.mp4>)
has SHA `02357fa4f3970e8a5c7b34c779a8cca7185e4dae57002e43ea1d895d2db3641f`.
Its sequential PTS review contains 1,320 frames, average 29.333 frames/s and
maximum PTS gap 66.667 ms. These describe the recording, not engine performance.
[Aligned phases](<C:/Projects/the last city/assets/vfx/wyrok/native/binary-r4/runtime/review/aligned-stages.jpg>)
and the [runner's review](<C:/Projects/the last city/assets/vfx/wyrok/native/binary-r4/runtime/review/review.md>)
retain the visual interpretation and its limits.

The binary export is a working route for this exact full Wyrok effect. The
earlier full ASCII negative result remains preserved; its precise retail
loading/playback cause is unresolved. The minimal tests do not independently
qualify trail motion, and this retest does not qualify all particles, normals,
lighting, colors or visual parity with the concept. The runner explicitly
claims no formal AUR-S07 packet, artistic acceptance or global native
qualification. Studio therefore leaves all immutable candidate receipts and
`nativeVerified` values unchanged. No further implementation or replacement
candidate is required for this visibility issue.
