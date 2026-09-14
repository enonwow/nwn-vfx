# Studio 0.22.0 acceptance — 2026-09-09

Own VFX can be authored independently of the presets. This release adds explicit
FnF/DUR selection, continuous textured mesh deformation, loop validation and
multi-cycle previews through the UI, installed CLI and existing WebMCP tools.
The technical example has matched opening → sustained loop → closing poses.
It does not contain accepted user artwork or Tripo assets.

## Installed release and preservation

- Package: `C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.22.0.tgz`
- Bytes: 2472439
- SHA256: `ad3d636c175667a39a602716bc4ffe98b080a4d8b8724cbf1f1bc29d6ee458aa`
- Service: `http://127.0.0.1:4317`, ready, version 0.22.0.
- Instance: `12d0fa8e-4887-4f00-ad74-9bb15b05c057`
- Workspace: `7def76b2-ad42-4b55-a5e8-d919b79a8587`
- The consumer confirmed its update window. The queue was empty before stop.
  All 72 previously existing project heads and canonical document hashes were
  preserved. Tests created isolated Studio projects; accepted projects were not
  edited. Existing human tabs were not reloaded.
- Evidence: `output/releases/0.22.0/installed-preservation.json` and
  `output/releases/0.22.0/before-install.json`.
- `source-manifest.json` records 263 source files. This workspace has no initial
  commit; source hashes identify the local release, not a Git commit.
- Repository, installed and personal `nwn-vfx` skill include the 0.22.0 contract.

## Verification

| Check | Result | Evidence under repository root |
| --- | --- | --- |
| Build and TypeScript | Passed | `output/duration-build.log` |
| Core/service/contract/export tests | 266 passed, 0 failed | `output/duration-all-tests.log` |
| New DUR browser acceptance | 1 passed | `output/duration-browser.log`, `output/playwright/duration/acceptance.json` |
| Relevant browser regressions | 6 passed | `output/duration-regressions.log` |
| Installed CLI from The Last City cwd | 3 projects, 11 successful jobs, artifact hashes verified | `output/releases/0.22.0/installed-acceptance.json` |
| Actual Codex host WebMCP | 49 tools; custom creation, control and artifact retrieval passed | `output/releases/0.22.0/real-host-webmcp.json` |

The automated browser test uses an explicit registration mock with the real
adapter and service. The separate installed host test discovers and calls the
actual browser WebMCP capability; it does not use that mock or a CLI substitute.

Automated coverage includes C0 endpoint validation for position, rotation,
scale, alpha and deformation; unsupported DUR layers/audio; 60 Hz deformation
period alignment; bounded render cycles; profiles; ASCII and binary readback;
ZIP v8; old clients; locks, pause, retries, conflicts and lifecycle undo.
Browser coverage includes loop stretching, independent lifecycle/orientation
locks, human draft preservation, repeated-cycle PNG equality, video duration,
portable source roundtrip and grant revocation. Existing save/draft tests passed.

The actual host created `studio-dur-0220-webmcp`, imported a PNG, replaced the
starter primitive with a custom fixed-topology animated mesh, and edited the
project through shared operations. Human UI actions set its lifecycle lock and
paused AI. WebMCP returned `LOCKED`, `AI_PAUSED`, `REVISION_CONFLICT`,
`DRAFT_CONFLICT` and out-of-scope `FORBIDDEN` as appropriate. An idempotent retry
kept revision 5. View inspection returned selection, saved document and the
separate draft; setting time to 0.5 and pausing playback preserved that draft.
One invocation used the wrong argument `revision`; schema validation rejected
it, and the corrected `expectedRevision` invocation succeeded.

WebMCP downloaded all 16 render/candidate artifacts in 4096-byte chunks,
verifying each chunk SHA, full SHA and size. The video has 90 frames at 30 fps
(three 1-second cycles). The binary candidate has verified structural readback
and integration metadata. The test draft was restored and the grant revoked;
subsequent inspection returned `WEBMCP_NOT_CONNECTED`.

## Reusable examples and exact receipts

Installed example sources:
`C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/docs/agents/examples/duration/`.
Files: `opening.json`, `loop.json`, `closing.json`. They are also in the repository
at `docs/agents/examples/duration/`. Import them under a new project ID or create
a variant before editing the saved control projects.

| Project | Revision | Canonical document SHA256 |
| --- | --- | --- |
| `studio-dur-0220-opening` | 1 | `6f01eb13f0a21b3d3c55dfba37045414426bea68f78f15257be359c8ea07b044` |
| `studio-dur-0220-loop` | 1 | `7670ba8fb2b094dd69a313caec9d71d1307f6af8b2c2c04d2f77af09bd0fb5b8` |
| `studio-dur-0220-closing` | 1 | `fc11ee922940bc41e16ecba47f0fe0b5c59ca5627e51642d405daba73195e23d` |
| `studio-dur-0220-webmcp` | 5 | `8ac8811398071f6ad21aeccd509d9b23a0689d7d15b84733ad02eb3801eeea4b` |

| Output | Job ID |
| --- | --- |
| Opening ASCII | `29be8c9d-77f9-4153-847b-7a2ba6a66ff8` |
| Opening binary | `1bc2f3f0-900c-42ca-b870-bfd59444a5e2` |
| Loop ASCII | `1d2c6641-e2e8-4612-9a85-55e95a4c6909` |
| Loop binary | `f4154561-3ad8-41fd-a57e-4f9cbeeed9c3` |
| Closing ASCII | `91abdea7-9109-47bb-9fb5-452ec64f7d44` |
| Closing binary | `12ccbb40-d1fe-4781-8c97-676898c5eb70` |
| Loop, three cycles WebM | `263fb8c2-53ef-4529-b247-cd9ad62b3b83` |
| Five-second three-phase composition | `42f13ae7-692f-4542-8a48-ac3e6ec0abf9` |
| Actual WebMCP three-cycle WebM | `7fc34a1c-489c-47fe-b522-56cb7fcd118b` |
| Actual WebMCP binary candidate | `e517b6ab-1e63-4136-8c9b-bf44ac09b6ac` |

Complete artifact IDs, paths, sizes and hashes are in `installed-acceptance.json`
and `real-host-webmcp.json`. Canonical source SHA differs from the SHA of a
pretty-printed `effect-document.json`; integration metadata records both.
Three-phase video: `output/releases/0.22.0/composition/preview.webm`.
The opening lasts 1 second, the DUR instance lasts 3 seconds with a 1-second
period, and closing lasts 1 second. Source documents remain at revision 1.

Opening end → loop start and loop end → closing start match exactly, including
all vertices, transforms and alpha=1. The loop at half a cycle differs from the
fixed closing start by up to **0.16492422502470644 metres**. This deliberately
demonstrates why a fixed closing pose is not safe at arbitrary removal phases.

## Compatibility and scope

Explicit `impact` opts into authored boundary alpha without the historical
visibility ramps. Omission preserves old export behavior. Rebuilding the
unchanged `studio-metric-preview-0212@3` control preserved MDL, HAK, TGA and TXI
byte hashes exactly; see `output/releases/0.22.0/legacy-resources.json`.

Document schema 13, portable ZIP v8 and the two experimental duration profiles
are documented in `docs/agents/duration.md`. Format evidence and concrete model
hashes are in `docs/agents/duration-format.md`. The existing 49 WebMCP names and
0.1.0 operation envelope remain. Tool schemas fit the actual host budget.

**Native validation is not complete or claimed.** DUR currently supports enabled
mesh layers, including textured fixed-topology deformation. Emitters, trails and
audio require separate FnF effects. Loop seam validation checks pose continuity,
not velocity or acceleration. Model lifetime is external to `document.duration`.
Studio does not know the engine's animation phase at removal. A consumer must
qualify animation playback, FnF disappearance and any smooth closing strategy
through its authorized NWN workflow. No Toolset/NWN process or native integration
was performed here. Metadata leaves the 2DA row and valid `Imp_*` attachment
column selection to the consumer and reports `nativeVerified:false`.
