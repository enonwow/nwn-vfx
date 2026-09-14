# Studio 0.7.0 — OBJ, materials and unused texture removal

2026-09-06. Implemented triangulated OBJ import/preview for existing or explicit new layers, atomic optional diffuse/selfillumination materials, and `assets.remove` for selected unused PNGs. CLI, UI and shared WebMCP operations use the same domain model, revision CAS, idempotency, grants, locks, pause and history.

184/184 unit/service/contract/CLI/adapter tests passed; browser OBJ/material editor, lighting and complete artifact acceptance passed. [Six real source OBJ files](../../../output/studio-070/real-obj-sources.json) passed read-only, including guard with 1301 positions and 2801 independently indexed UV coordinates. [One saved revision](../../../output/playwright/obj-artifacts/report.json) produced verified PNG/WebM/MDL/HAK. No native test was run.

Package `output/releases/nwn-vfx-studio-0.7.0.tgz`: 1217046 bytes, SHA-256 `b28f002e8613cf3b5725fdcca16acd68a63bb38b7b52c0813e6551554be79519`. Installed CLI and service report 0.7.0. Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587`, and all 14 project snapshots were preserved exactly across activation. No existing tab was reloaded, closed or saved; tlc-wyrok was not mutated.

**Live host acceptance exposed a blocker:** the 42 registered WebMCP descriptors total 68676 bytes before host provenance, exceeding the host's default 65536-byte catalog bound. `fetchTools` consequently disabled discovery in a newly created proof tab. This release is not the final WebMCP acceptance. 0.7.1 reduces duplicate schema fragments while retaining the complete tool catalog and input decisions.

An earlier attempt to launch a separate detached CLI test service was rejected by automatic approval review with only “blocked by policy”; that command did not execute and was not retried through another launcher. Bounded test harnesses succeeded. Authorized management of the existing installed service succeeded through its normal public CLI.
