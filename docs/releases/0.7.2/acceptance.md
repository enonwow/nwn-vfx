# Studio 0.7.2 — own VFX and verified export

Installed and running on 2026-09-06 at `http://127.0.0.1:4317/`. The release includes custom OBJ geometry, explicit mesh materials and unused-asset removal from 0.7.0, the real-host WebMCP descriptor fix from 0.7.1, and two export corrections below. UI, CLI and WebMCP use the same revisioned operations.

## Export fixes

- Candidate `handoff.json` is serialized once from an independent content-artifact metadata snapshot. Exactly the same bytes are published loose and inside `candidate.zip`; it does not claim a hash for itself or its enclosing archive. The regression test first reproduced the old mismatch and then passed, verifying every referenced file's bytes, size and SHA-256.
- New portable exports use manifest v3, storing each PNG once. Import reconstructs the full document and verifies its canonical snapshot hash. Studio 0.7.2 is required to read v3; existing v1/v2 archives remain readable. Limits remain 8 MiB ZIP, 12 MiB inflated entries and 6 MiB reconstructed document. Actual DEFLATE output is bounded independently of declared ZIP sizes.

Exact read-only TLC r35 acceptance: old ZIP **8647176 bytes**, v3 **4418366 bytes**, inflated v3 **4928188 bytes**. Full compact document remains **6291257 bytes**; all eight PNGs and the reconstructed document are unchanged. Canonical snapshot SHA-256: `5bdfcd5a7bbe076ef67f27d234e9fd0e18aac18830c558a25a806d18bae5558f`. Source SHA and mtime were unchanged. [Detailed report](../../../output/portable-r35-acceptance/report.json). This local source acceptance is separate from the subsequently completed public CLI acceptance below.

## Verification

- **194/194** unit, contracts, CLI, service, export and WebMCP tests passed: `output/studio-072-unit-tests.txt`.
- Typecheck, browser contract generation and production build passed: `output/studio-072-build.txt`. Vite reports the existing large compiled-validator chunk warning.
- Independent read-only reviews of both export fixes found no blocker. Rendering semantics were not changed by 0.7.2.
- Actual 0.7.1 host verification covers custom OBJ preview/import, replay, revision conflict, persisted human lock, AI pause, view selection/time/conflict, PNG render and complete artifact receipt with locally calculated SHA-256: [live report](../0.7.1/acceptance.md).
- Fresh **0.7.2** Codex in-app tab discovered **42 tools** and used a limited project grant. `studio.version` returned 0.7.2. Actual `studio.candidate.build`, `studio.projects.export`, `studio.jobs.get` and `studio.artifacts.read` succeeded on own test project `41c6dd72-4900-4999-a009-284bf19c4894`, r7.
- Candidate job `25af1a5e-7134-49ab-8a43-a8bb65e8963d`: all three outputs (candidate ZIP, loose handoff, portable ZIP) were received through WebMCP, base64-decoded and independently hashed. The downloaded candidate has identical loose/ZIP handoff bytes, seven verified content references, and the correct document snapshot hash. Portable v3 imports to an exactly equal document. [Live artifact report](../../../output/studio-072/live-artifact-report.json).

## Consumer public CLI acceptance — PASS

The consumer regenerated the exact historical `tlc-wyrok` r35 through public CLI on installed Studio 0.7.2 using fresh keys and a separate output directory. Candidate job: `fd9a26fc-886b-4233-ada3-f730d580644d`. Its [package integrity report](<C:/Projects/the last city/assets/vfx/wyrok/export/r35-studio072/review/package-integrity.json>) was read back by the release task and records:

- **29** verified artifacts and **27** verified manifest entries; loose and archived `handoff.json` match.
- Portable manifest v3, **4417528 bytes**, **4928181 inflated bytes**, complete document equal after roundtrip, **8 PNG assets**.
- The same canonical snapshot SHA-256 `5bdfcd5a7bbe076ef67f27d234e9fd0e18aac18830c558a25a806d18bae5558f`; `nativeVerified:false`.

The consumer additionally confirmed no selfhash, all artifact SHA/size and PNG hashes matching, MDL/HAK SHA identical to the old r35 candidate, and preservation of prior receipts. This closes the pending package acceptance. The consumer's subsequent stylistic edits are a separate task; r35 remains a historical checkpoint.

## Activation and preservation

The consumer explicitly provided a quiet window. Public before/after project-list snapshots matched for **all 15 projects**. Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057` and workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587` remain the same. No TLC document or native 07/07B work was changed; no existing human tab was reloaded, saved or closed. Only the owned test fixture was edited. After artifact verification it was named `TEST WebMCP 0.7.2 — własny OBJ` at r8; artifacts remain bound to r7. Both temporary test grants were revoked, with `WEBMCP_NOT_CONNECTED` verified.

The first `service start` invocation returned an empty exit-1 response; subsequent public `service status`, `version` and live WebMCP calls confirmed the service was already ready at 0.7.2. No second launch or unrelated process restart was used.

Source, globally installed and user companion skills match SHA-256 `80f0c811ce2aa58e98f99e8cbd5e8951b987a3f2441b8a16f5ba80ed2a28792f`. The consumer received the explicit **GOTOWE** callback and completed its public r35 candidate/portable acceptance, recorded above.

Package `output/releases/nwn-vfx-studio-0.7.2.tgz`: **1213165 bytes**, SHA-256 `f8afc121226c8aeabc36bf46939926281b8a2b2330f4f0d89459fff59b239475`. [Source manifest](source-manifest.json) binds 121 source files. The workspace has no Git commit; no commit identity is claimed.

Preview and generated NWN resources remain `nativeVerified:false`. This release proves authoring, interoperability and artifact integrity; appearance in NWN requires a separate qualified native run.
