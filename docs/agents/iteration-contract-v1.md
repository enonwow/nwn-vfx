# Iteration contract v1 — implementation contract

Target Studio 0.28.0 in an isolated instance. This document fixes the consumer
contract; availability must be checked through the running service. Global
0.26.2 and the active 0.27.0 lab are not upgraded by this work.

## Diagnostic bundle

`iteration.prepare` returns a durable job. Use `jobs.get`, then retrieve its
`diagnostic.zip` through the existing artifact API. The ZIP contains:

```text
diagnostic-manifest.json
comparison.json
variants/control/candidate.zip
variants/control/analysis.json
variants/control/preview-000.png
variants/texture/candidate.zip
variants/texture/analysis.json
variants/texture/preview-000.png
```

Each nested candidate.zip uses the existing resource candidate format, with
handoff.json, effect-document.json, validation.json, MDL, HAK and dependencies.
Nested `handoff.jobId` is the **root iteration job ID** (no child candidate job).
Nested handoff also carries `variantId`; its projectId/revision/snapshotSha256
identify that variant's immutable project, not the baseline. The outer manifest
and imported report use the same root job ID plus variantId.

`workflow.analyze.candidateId` and `workflow.compare.candidateId` /
`baselineCandidateId` accept either an ordinary `candidate.build` ID or this
root `iteration.prepare` ID. Supply the variant's exact projectId and revision
(not the baseline project). Exactly one matching variant is required. Reads
verify its frozen document, diagnostic ZIP, nested candidate ZIP and handoff
resource hashes without running another export. Every source project requires
read/artifacts access, including observed and other variants. Responses include
candidate identity with variantId, snapshotSha256, rootArtifactId/rootSha256
and candidateSha256. Missing/ambiguous matches fail with
`CANDIDATE_TARGET_MISMATCH`; corrupt bytes fail with `ARTIFACT_HASH_MISMATCH`.
Additional selected variants use `color`, `alpha`, `size` or explicit safe IDs.
Every variant forks the same immutable baseline. No sequential accumulation of
changes. Model resrefs are unique within a bundle. Texture dependencies with
the same resref must have the same bytes, otherwise the bundle fails.

The manifest has this shape (hash strings below are illustrative):

```json
{
  "schemaVersion": 1,
  "kind": "nwn-vfx-diagnostic-bundle",
  "instanceId": "instance-id",
  "workspaceId": "workspace-id",
  "jobId": "iteration-job-id",
  "baseline": {"projectId":"base-id","revision":3,"snapshotSha256":"64 hex"},
  "conditions": {"camera":{"position":[3.4,-5.4,2.75],"target":[0,0,0.7],"fov":39},"times":[0.5],"filtering":"export-mipmaps","background":"dark"},
  "variants": [{
    "id":"control",
    "hypothesis":"Unchanged baseline control",
    "source":{"projectId":"base-id","revision":3,"snapshotSha256":"64 hex"},
    "project":{"projectId":"variant-id","revision":1,"snapshotSha256":"64 hex"},
    "allowedFields":[],
    "verifiedDifferences":[],
    "candidate":{"path":"variants/control/candidate.zip","sha256":"64 hex","size":123,"profileId":"nwn-ee-beam-binary-experimental-v1","modelName":"vfx0123456789abc"},
    "resources":[{"name":"vfx0123456789abc.mdl","sha256":"64 hex","size":123}],
    "analysisPath":"variants/control/analysis.json",
    "previews":[{"path":"variants/control/preview-000.png","time":0.5,"sha256":"64 hex","size":123}]
  }],
  "nativeVerified":false
}
```

The top-level diagnostic.zip and manifest do not include their own hashes.
Use the public artifact metadata for the outer ZIP's size/hash. Resource paths
are relative ZIP paths; never install a path supplied in an external report.

## External report import

Operation `reports.import` is a recorded, idempotent write under the `review`
scope, bound to the reported project and every contributing project. It does
not execute programs or download URLs. Input:

```json
{
  "projectId":"variant-id",
  "report": {
    "schemaVersion":1,
    "kind":"nwn-vfx-external-report",
    "target": {
      "instanceId":"instance-id",
      "workspaceId":"workspace-id",
      "projectId":"variant-id",
      "revision":1,
      "snapshotSha256":"64 hex",
      "jobId":"iteration-job-id",
      "variantId":"control",
      "candidateSha256":"64 hex"
    },
    "runner":{"name":"The Last City","version":"consumer-version"},
    "conditions":{"description":"Stationary pair, distance 3 m, same area and camera"},
    "installation":[{"name":"demo.mod","sha256":"64 hex","size":123},{"name":"demo.hak","sha256":"64 hex","size":123}],
    "session":{"id":"consumer-session-id","startedAt":"2026-09-10T12:00:00Z"},
    "observations":[{"id":"visibility","kind":"visibility","result":"pass","description":"Particles visible between stationary subjects","evidenceIds":["video"]}],
    "evidence":[{"id":"video","name":"test.mp4","sha256":"64 hex","size":123,"uri":"local-consumer-path-or-https-url"}],
    "notes":"External runner observation; no artistic approval."
  }
}
```

`variantId` is omitted for an ordinary `candidate.build` job. `candidateSha256`
is the hash of the nested candidate.zip, or the existing job's candidate.zip
artifact. All target identities and the candidate hash must match stored
immutable outputs. A mismatch is rejected as `REPORT_TARGET_MISMATCH`.

Observation kinds: `visibility`, `behavior`, `preview`, `integration`;
results: `pass`, `fail`, `inconclusive`. Art approval remains the existing
human-only review operation. No imported report toggles global nativeVerified.
External video/MOD/HAK hashes are recorded as the runner's claims; the service
does not claim it read those remote/local-consumer bytes. Import returns
`targetVerified:true`, `evidenceVerification:"external-declaration"`.

The consumer can record one report per variant, sharing the same session and
evidence hashes. `reports.list` filters by project/revision; a pinned benchmark
references a particular report and observation. New source revisions never
advance that benchmark automatically.

## Delivery and acceptance

Implementation includes all seven roadmap items: compact comparison/benchmarks;
isolated diagnostic variants; measured diagnostics; controlled preview/concept
phases; component dependencies and bounded attachment preview; marker-based
retiming with unchanged audio bytes; durable iteration and external reports.
Callbacks distinguish implemented code, tested public operations, running
instance identity, and any remaining native/host acceptance.


## Additive metadata in 0.28 qualification

`concepts` in the diagnostic manifest contains exact source/asset hashes, ZIP
paths, optional marker/time and same-time variant preview pairings. No matching
time means an empty pairing, never an implied visual approval. Render stages
may carry `sourceJobId` when their immutable bytes were reused. Nested artifact
entries intentionally carry name/fileName/size/sha256; they are ZIP members,
not independently downloadable public artifact IDs. Their identity follows
outer ZIP → manifest → candidate hash → nested handoff.

WebMCP exposes full schemas in two profiles. Select `workflow` through
`studio.tools.select` and rediscover before using the operations in this contract.
