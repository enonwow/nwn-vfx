# Iteration workflow — Studio 0.28.0

Use the explicitly supplied CLI/config and check `doctor` before working. The
global 0.26.2 installation and lab14384 are separate, preserved environments.
The implementation operates on public saved revisions; it never installs a
module, runs Toolset/NWN, or treats an exported resource as native proof.

## One shared workflow

UI **Praca nad iteracją**, CLI and WebMCP use the same 17 operations:

| Purpose | Operations |
| --- | --- |
| Compact source, comparison, measured diagnostics | `workflow.inspect`, `workflow.compare`, `workflow.analyze` |
| Preview conditions and concept PNG | `workflow.settings.preview`, `workflow.settings.apply` |
| Pin a passing exact external observation | `benchmarks.pin` |
| Independent variants and composite job | `diagnostics.plan`, `iteration.prepare`, `jobs.resume` |
| Immutable selections with dependencies | `components.publish`, `components.list`, `components.insert.preview`, `components.insert.apply` |
| Named markers and audio/visual starts | `timing.preview`, `timing.apply` |
| Consumer declarations | `reports.import`, `reports.list` |

CLI commands mirror dots, e.g. `workflow compare --input-file compare.json`.
Mutations require `--idempotency-key KEY`. Keep that exact key when recovering
an unknown result. `operations resolve` and `jobs get` avoid blindly repeating
work. Input/output schemas remain available through `schema get`.

New workflow operations require `X-NWN-VFX-Document-Schema:20` (sent by the
0.28 CLI and adapter). First authoring metadata or an authoring lock promotes
a new revision to document20, portable ZIP15, minimum Studio0.28.0. Existing
documents stay at their existing versions. Older clients reject new operations
without mutation. Open a fresh browser tab and preserve older tab drafts.

## WebMCP discovery fits the host

There are 67 tool names across two profiles, never all registered together.
`studio.tools.select({profile:"workflow"})` exposes iteration, reports, timing,
components and OBJ import. Select `authoring` for `studio.changes.preview` and
`studio.changes.apply`. Rediscover tools after selecting. Both sets retain
connection/view/artifact/recovery tools; no former tool is removed from the
application. The connection dialog exposes the same selector for a human.

Profile selection preserves the grant, project, revision, selection and draft.
It does not grant new rights. Agent selection checks live edit rights and AI
pause. Registration errors remain visible. Full closed input schemas are kept;
each profile is tested against the 65,536-byte host descriptor cap.

Read `studio.view.inspect` before changing the open project. Pending workflow
fields are in `workflowDrafts` and count toward `draftDirty` and `viewRevision`.
They survive closing the panel and block navigation/save until explicitly
cleared. New workflow writes to that same project reject dirty drafts.
Writes never silently replace the tab's unsaved document. Read-only operations
and explicit forks of saved revisions can still proceed.

## Compare, diagnose and prepare

```json
{
  "projectId":"BASELINE_ID", "revision":1,
  "observed":{"projectId":"OBSERVED_ID","revision":1},
  "layerId":"essenceFountain", "groups":["texture","alpha","size"],
  "binary":true, "render":true, "times":[1],
  "conditions":{"filtering":"export-mipmaps","background":"dark"}
}
```

Pass this to `diagnostics.plan`, then `iteration.prepare`. A control plus each
requested group starts from the same baseline. Maximum6 variants,8 PNG times,
32 queued/running jobs and256MiB output. Mode `white-control` replaces only a
texture (and removes an incompatible atlas); `solo` disables other layers and
audio. A retained-data change in solo export is rejected; use an explicit
dedicated baseline for a composition that requires a different export layout.
Model names are unique per job/variant. Shared resource names must have equal
bytes. Historical and current baseline locks are both honored.

Compact comparison reports added/removed layers and resources separately from
changed authored fields. With `candidateId`/`baselineCandidateId`, it reads exact
stored candidates and exposes source/effective export and compiled readback.
Without them it derives ASCII export and explicitly marks compiled readback
unavailable. Compiler defaults and float32 formatting are not automatically
declared behavior errors. No pixel, PCM or full geometry arrays occur in compact
source reads. There is no inferred single cause of invisibility.

Analysis includes alpha statistics/bounds, emitter lifetime/appearance samples,
PNG/derived-texture versus TGA pixels and TXI, HAK resource identity, mesh indices,
duplicate/degenerate faces, UV/bounds/deformation, and the existing audio mixer
levels plus offsets/ranges/period. Zero base birthrate with positive animation
keys is informational. The `m2-alpha` estimate is not NWN brightness. Findings
are structural errors, warnings, measurements, estimates or hypotheses.

## Conditions, concepts and components

Conditions pin filtering, camera, background, light intensity and optional
`schematic-human-v1` scale/orientation/velocity/anchor. `export-mipmaps` enables
the mipmap policy requested by export; it is not parity with NWN fog/depth or
the complete color pipeline. Hand markers are schematic measurements, not a
promise that EffectBeam supports a target hand. Legacy renders remain unchanged.

Concepts reference immutable PNG asset hashes in an exact revision and may
reference a named phase. If times are omitted, `iteration.prepare` uses those
concept phases (otherwise the normal default time). The ZIP includes PNGs and
manifest pairings to previews at the same phase. Explicit times that do not
include a concept phase produce an empty pairing; they do not pretend to match.
PNG/video inspection and external observations do not approve artwork.

Publishing a component freezes exact source revision/hash and a layer/audio
selection. Insertion copies only required texture/audio assets, layer/clip IDs,
locks and bound markers, with explicit mappings and source provenance. It
requires matching lifecycle and target budgets. Source material/audio bytes and
existing target parts remain unchanged. Testing a source component never
qualifies every new composition.

## Timing and reports

`timing.preview/apply` accept optional `period`, `markers[{id,name,time}]` and
`bindings[{targetType:"layer"|"audio",targetId,markerId,offset}]`. The binding
sets a start at marker time plus offset. Changing period scales visual keys,
events, particle lifetime/velocity and existing marker offsets coherently.
Audio source bytes, clip length, offset, fades and gain are never stretched.
An audio clip that no longer fits requires an explicit trim decision. DUR
frame/sample constraints still apply. The consumer must stop scheduling new
WAVs at external stop; an issued WAV may finish.

Iteration checkpoints persist across restart. Resume uses the same job and
projects, verifies artifacts, version and all source rights again, then resumes
unfinished stages. Identical render computation may reuse verified immutable
bytes across jobs for the same actor only when source hash, renderer version,
camera, profile, time and format match and all old source reads remain allowed.
The new job receives its own artifact records with `sourceJobId` provenance.
New candidates are built for their own model names/handoffs.

External report schema and ZIP lineage: [iteration-contract-v1.md](iteration-contract-v1.md).
Reports bind to instance/workspace/project/revision/snapshot/job/variant and exact
candidate ZIP hash. External evidence remains a runner declaration; URIs are
never fetched or executed. `benchmarks.pin` requires a matching passing
observation with evidence. It remains pinned across later saves. Art approval
continues through the human review operation; `nativeVerified` stays false.

Field locks, AI pause, CAS, scoped retries and history apply throughout. Undo of
new document workflow writes is allowed only at that exact resulting revision
and rejects current locks. Later independent revisions require an explicit fork
or new edit instead of overwriting subsequent work.
