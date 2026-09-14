# 0.6.0 — native dependency status (prepared, not activated)

Date: 2026-09-06. Source and package preparation only. The installed service and global agent skill remain 0.5.1. No service restart, live database edit, r10 change, exported resource edit, Toolset/NWN probe, native action or capture was performed by this task.

The new read-only `native.test.status` operation binds an existing `candidate.build` job to its project, revision and canonical snapshot SHA-256. CLI exposes `native test status --candidate <job-id>`; WebMCP exposes `studio.native.test.status`. Discovery has 39 tools in this source version. Actual discovery in a running 0.6.0 browser host has not been tested because activation was explicitly excluded.

A pending or failed candidate is distinguished from a completed candidate waiting for a qualified external runner. Native evidence stays missing, `nativeVerified` and `nativeTestAvailable` stay false, and external work is `not_observed_by_studio`. `native.test.request` queues nothing and reports its unavailable dependency. Caller-supplied paths or positive verdicts cannot be imported through this status operation. Project grants, read scope and current WebMCP authorization apply.

Changed product sources are `packages/core/src/native-workflow.ts`, `apps/service/src/native-status.ts`, command/schema discovery and dispatch, CLI routing, WebMCP schemas/session allow-list, generated browser contracts, version metadata, documentation and the source agent skill. The common operation is used by all transports.

Verification:

- Full unit suite: **150/150 passed**, `output/native-07/unit.log` (23,953.771 ms).
- Focused status/WebMCP tests: **23/23 passed**, `output/native-07/status-green.log`. The preceding red run demonstrated the missing operation.
- Build, generated contracts and TypeScript checks passed: `output/native-07/build.log`.
- Source agent skill passed `quick_validate.py`. Its YAML dependency was installed in the isolated `output/native-07/validation-deps` directory; the global skill was not replaced.
- No new live WebMCP or native verification is claimed. Earlier live WebMCP results belong to their explicitly identified releases.

The related central Aurora work addresses TLC-WYROK-STUDIO-07: immutable source inspection, human Paint/Save evidence, an audited child module and a revalidated geometry gate before AUR-S07. Its final runbook and qualification limits are separate from this Studio status contract. The autonomous native Paint transport remains unavailable; this release does not convert the central human dependency into an agent-authenticated observation or a successful NWN test.

The central changes were deployed as 23 source/test/document files after precondition checks, preserving the consumer's independent S07 changes. **30/30** focused central offline tests passed; **2/2** public CLI checks passed again against the deployed shared sources. The actual read-only r8 inspection still reports `native_entry_observation_missing`, with the unchanged source manifest SHA and measured post-Save module. See the [central acceptance](C:/Projects/aurora-web/backend/docs/aurora-reverse/native-entry-07-integration-acceptance-2026-09-06.md) and [exact human Paint continuation for r8](C:/Projects/aurora-web/backend/docs/aurora-reverse/binary-entry-surface-human-paint-resume-2026-09-06.md). No ARM, user witness, native capture, positive real geometry gate or S07 execution was produced in this task.

Prepared package: `C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.6.0.tgz`, 1,024,081 bytes, SHA-256 `4e8d27b7eac43e7264b81e41c1db59435407a8852d628697b8f6e97f9e348057`. The accompanying source manifest records 105 source files. This package was not installed.
