# Studio 0.26.1 — Lightning midpoint crash correction

Installed on 2026-09-10 at http://127.0.0.1:4317. The global CLI and personal
skill are updated. The consumer explicitly released the service for restart;
only the verified Studio service process was stopped. No native app was started,
controlled or integrated from this task.

## Behavior and evidence

- Lightning now serializes `birthrate = segments + 1`. Both ASCII and binary
  readers reject unsafe counts independently of source/readback agreement.
- Exact r3 minidump identifies a point[32] lookup in a 32-point Lightning
  carrier. [Audit](../../agents/beam-crash-2026-09-10.md) records hashes,
  exception registers, native code offsets and inference limits.
- Active nativeMotion resource export fails with `BEAM_MOTION_EXPORT_BLOCKED`.
  Source, draft, PNG/preview and ZIP still work. UI and capabilities explain it.
  Adding one point to that profile would repeat the atlas over two edges;
  this is not accepted as whole-beam opening/closing.
- Existing source schemas, portable formats, permissions, locks and histories
  remain unchanged. No unsafe old artifact is rewritten or silently accepted.

## Verification

- Build/typecheck passed; full tests **286/286**.
- Regression independently replays native midpoint indices for all supported
  segment counts and radius zero, reproduces count32/count2 failures, and
  rejects a binary whose unsafe controller agrees with equally unsafe ASCII.
- Final Chrome **2/2**: static and motion editor flows, drafts, shared adapter,
  PNG/WebM retrieval, corrected static candidates, rejected motion candidates.
- Actual Codex WebMCP host: **49 tools / 65,372 bytes** including origin/pageUrl.
  Refused before grant; limited grant for the diagnostic fork; capability
  reports suspension; actual candidate.build plus artifacts.read yields
  MDL SHA256 `d6defeea3fa14cc87462835312f920a1bd9035fea14fd4ba8db6e44243115089`
  with 33 points and final nextOffset:null. Revocation verified and own tab closed.
  This hotfix host test does not repeat every 0.26 collaboration scenario.
- Before/after public snapshots preserve all **91** earlier project heads,
  revisions and document hashes. Instance/workspace IDs remain unchanged.
- Installed CLI from `C:/Projects/the last city`: 4 successful jobs / 63 verified
  files plus 2 failed motion jobs with no artifacts. FnF and DUR resource bytes
  match Studio-owned historical fixtures. Historical motion source remains intact.

## Consumer handoff

Original `tlc-wampir-drain-life@3` remains unchanged. Public diagnostic fork:
`e20f5af8-068b-4cec-809d-2bd28dec9086@1`, snapshot
`c1198a62b896aec703d5a05ef28f4bcfb22705afc25648b1118091ef3b5da766`.
Only source-document change is its diagnostic name. Exact MDL text changes
only `birthrate 32` to `birthrate 33`; PNG/TGA/TXI and every other MDL field match.

| Form | Job | MDL SHA256 |
| --- | --- | --- |
| ASCII | 979ed6b6-9e28-42c9-8260-f6c272674623 | d6defeea3fa14cc87462835312f920a1bd9035fea14fd4ba8db6e44243115089 |
| Binary | e943b209-31d9-4dba-81ec-f3301e229b4b | 388513a82bb793ad500d22224031b6444adb5a6ea2bbf94775816a0487bc2409 |

Both downloaded candidates are in `output/releases/0.26.1/diagnostic/` and
were handed to The Last City - VFX. That task independently confirmed all
15 binary artifacts and the sole MDL source delta, and owns its native test.
No native pass or final visual acceptance is claimed in this release report.

Machine evidence: `output/releases/0.26.1/{before-install,installed-preservation,
installed-acceptance,real-host-webmcp}.json`; test/build logs in
`output/beam-crash-research/`. Package/source hashes are recorded in
`source-manifest.json`. The packaged crash audit's C-file hash was corrected
after initial install and synchronized to the installed documentation; runtime
code was identical. The final package includes that documentation correction.
