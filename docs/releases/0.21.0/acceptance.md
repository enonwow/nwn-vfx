# Studio 0.21.0 — composition preview

Implemented and installed on 2026-09-08. Service/global CLI/personal skill use
0.21.0 at http://127.0.0.1:4317. Instance and workspace identities preserved.
Full contract and examples: ../../agents/composition-preview.md.

`preview.compose` freezes explicit source revisions, reuses the existing renderer
with independent instance groups/clocks, and returns one PNG/WebM plus composition
and handoff manifests. Source documents, ordinary limits, editor drafts and native
export formats are unchanged. CLI and 49 registered WebMCP tools share rights,
validation, idempotency and jobs. Reading a composite result requires all sources,
including artifact chunks, cancellation history and cached operation resolution.

## Evidence

- `output/composition-final-build.log`: production build/typecheck passed.
- `output/composition-full-tests-final.log`: 259/259 unit/service/CLI/adapter tests
  passed. An obsolete orientation test expecting schemas only through 9 was
  updated to the already-supported 1–12. No new document schema was introduced.
- `tests/composition.test.ts`: strict input/budget/hash validation; immutable
  old revisions; partial grants denied across jobs, lists, events, operation and
  artifact reads; idempotency; old-client fence; pause on a secondary source at
  publication blocks output, then resume rechecks sources. Cancellation operation
  history cannot disclose a composite to an actor with only the anchor source.
- `output/composition-browser.log` and
  `output/playwright/composition/acceptance.json`: production PNG/WebM pixel checks
  verify translation, yaw π, uniform scale, delayed instance birth and distinct
  revision FPS. Video has 45 frames at 30 fps. Identity instance PNG is byte-exact
  with single-project rendering and historical 0.20.0 output: SHA-256
  `467aa22c4ed5834d5260fe5ea7dfd0bcd44bbe4294b58f811bbad113af3a1d7c`.
- `output/releases/0.21.0/installed-cli.json`: installed global CLI, invoked from
  The Last City cwd, rendered two exact fixture revisions to WebM and downloaded
  every artifact with hash verification. Job `418ffb13-b089-49ef-befe-9495d0e13c94`.
- `output/releases/0.21.0/real-host-webmcp.json`: actual Codex in-app browser tab9
  called studio.preview.compose for two distinct authorized projects, denied an
  ungranted TLC source, preserved the human's unsaved draft/view revision, and
  retrieved/verified PNG, composition.json and handoff.json through WebMCP chunks.
  Job `e24496f1-305a-45fc-9fd0-57ece3b636e1`. Own test draft cleared; grant revoked.
  Previous tabs6/8 were preserved.
- `output/releases/0.21.0/installed-preservation.json`: all 63 pre-existing heads
  and canonical snapshot hashes unchanged after installation and acceptance.
- `output/releases/0.21.0/tlc-requests/`: six callable request files converted
  from the consumer's explicit 2/5/8m outbound/reverse plan, plus one PNG request.
- TLC 2m PNG job `f5f64934-476a-44da-8bd2-1d419b4edc05` used 5 instances/66 layers/
  234 particles at t=1.04. Original source hashes matched the supplied plan.
- TLC 8m WebM job `6c6cd270-8f2e-47c3-b412-9c75e7e8ad96` used 15 instances/126
  layers/414 particles; ffprobe confirms 960×640, 69 frames, 30 fps, 2.300 s.
  Video SHA-256 `cb891d5ecfcde1f1b06d10e9066fe2cd9ed02a3f853b0935a830fe6a81017b42`.
  Sources remain tlc-wampir-skok-start r8, tlc-wampir-skok-koniec r3 and
  tlc-wampir-skok-smuga r3. Neither original resources nor models were rewritten.

## Limits

24 instances/256 layers/32,000 particles/30 seconds; 2m vertex and UV samples,
24 MiB unique source JSON and 64 MiB decoded texture data. Every original document
also retains its individual budgets. Preview-only reference geometry, explicit
end clipping and audio omission appear in the manifests. NativeVerified is false.
No native process, integration or game proof was performed by this task.

The current WebMCP grant covers the shared existing project and projects/variants
created through that grant; separately existing source projects require a CLI
actor granted all sources. The operation never widens a grant automatically.
Older client declarations cannot read new composite job metadata; use a fresh
0.21 tab while preserving any old human drafts.

Host registration keeps all input validation. Descriptions were shortened; the
standard false annotation defaults are omitted, and untrusted-content annotations
remain true on every user/project result (only fixed discovery metadata omits it).
The descriptor test retains a 512-byte reserve below the 65,536-byte host cap.
Annotation semantics: https://webmachinelearning.github.io/webmcp/#dictdef-toolannotations.

Package and exact local source hashes are recorded in source-manifest.json.
