# Composition preview — Studio 0.21.0

`preview.compose` renders exact saved revisions together in one PNG or WebM.
It creates a job and artifacts only: no new EffectDocument, model, HAK, source
revision or editor draft. Ordinary projects retain their 32-layer limit.
API envelope stays 0.1.0; document schemas remain 1–12 and portable ZIP v1–v7.

## Input

```json
{
  "duration": 2.3,
  "time": 1.04,
  "format": "png",
  "referenceGeometry": true,
  "camera": {"position":[6.34,-8.66,5.48],"target":[1,0,0.95],"fov":40},
  "instances": [
    {"id":"departure","projectId":"tlc-wampir-skok-start","revision":8,"start":0,"position":[0,0,0],"yawRadians":0},
    {"id":"arrival","projectId":"tlc-wampir-skok-koniec","revision":3,"start":0.54,"position":[2,0,0],"yawRadians":0},
    {"id":"wake","projectId":"tlc-wampir-skok-smuga","revision":3,"start":0.63,"position":[1,0,0],"yawRadians":0,"scale":1}
  ]
}
```

This example illustrates the contract; it does not replace a consumer's complete
placement schedule. An authoring plan must be converted to the exact closed
schema: extra plan fields such as role, modelSha256 and documentSha256 reject.
Each instance optionally accepts `snapshotSha256` (SHA-256 of the canonical
sorted-key EffectDocument). A mismatch rejects before queuing. IDs are unique
within the composition. Source project IDs and positive revisions are mandatory.

Transform order: existing layer transforms/animation, uniform instance scale,
right-handed yaw about world +Z, then instance position in metres. Yaw is radians
within ±8π, positions within ±50 m, scale .01–10 (default 1). Local +X rotates
towards +Y for positive π/2. Instance time is `compositionTime - start`; particle
birth and atlas age are then calculated within that source timeline. Source
seeds and layer IDs are unchanged, including repeated copies of a revision.

Duration .1–30 s is mandatory. Starts are >=0 and strictly less than duration.
PNG time defaults to min(.5,duration), within [0,duration]. WebM always samples
the whole composition at k/30, ceil(duration*30) frames; the time field does not
trim video. Sources are visible only from instance start through the earlier of
source duration/end of composition. Manifest `clipped` and `visibleUntil` make
intentional end cropping explicit. Camera follows the existing camera contract.
Grid/mannequin context is optional (`referenceGeometry`, default true), fixed in
world space, and belongs only to the preview.

## CLI and WebMCP

```text
nwn-vfx --json preview compose --input-file C:/absolute/compose.json --idempotency-key compose-scene-v1
nwn-vfx --json jobs wait JOB_ID --timeout 120s
nwn-vfx --json artifacts get ARTIFACT_ID --out C:/absolute/preview.webm
```

In a fresh connected Studio tab discover 49 tools and call
`studio.connection.inspect({})`. Then:

```javascript
await tools.call('studio.preview.compose', {
  viewSessionId,
  input: request,
  idempotencyKey: 'compose-scene-v1'
});
await tools.call('studio.jobs.get', {viewSessionId,input:{jobId}});
await tools.call('studio.artifacts.read', {viewSessionId,artifactId,offset:0,length:65536});
```

Use the actual host's discovered tools. `accepted` means queued, not rendered.
Read chunks to nextOffset=null; verify every chunk hash, full size and SHA-256.
Uncertain retries use identical input/key. `operations.resolve` uses operation
`preview.compose` and its key, **without projectId** (workspace key scope).
The job's projectId/revision identify its first source as a storage/list anchor;
they do not describe the whole composition. Use `sourceProjectIds` and manifest.

## Rights and compatibility

Read and render rights are required on **every** source. They are checked at
submission, worker start and publication; AI pause on any source blocks the job.
Human layer locks remain unchanged; a read-only render does not edit locked
fields. Job reads/cancel, artifact metadata/downloads/chunks and operation result
reads require access to all sources. Lists/events hide inaccessible compositions.
Revoking access prevents retrieval even if a caller knows an artifact ID.

The current browser grant covers the human-shared project and projects/variants
created by that grant. It does not automatically include other existing projects.
For compositions of separately existing projects, use a CLI actor explicitly
granted all sources; a partial WebMCP grant returns FORBIDDEN. Do not substitute
the owner's browser credentials. Domain composition calls preserve tab drafts,
selection and playback; they do not switch the human's project.

Studio 0.21 CLI/UI/WebMCP declare `X-NWN-VFX-Composition-Preview: 1` together with
`X-NWN-VFX-Document-Schema: 12`. Older clients get CLIENT_UPGRADE_REQUIRED for the
new operation or composition job metadata, including cached results. Discovery
stays available. Open a new tab after upgrading and preserve old human drafts.

## Budgets and artifacts

At most 24 instances, 256 layers, 32,000 particles (including disabled emitter
allocations), 2,000,000 vertex samples and 2,000,000 UV samples. Existing individual
document budgets also apply. Unique source JSON <=24 MiB; unique decoded texture
RGBA <=64 MiB. Repeated instances count for layer/particle/sample allocation;
identical source revision storage and texture content are deduplicated. Queue
limit remains 32 active jobs and output limit 256 MiB.

The worker stores immutable source snapshots when accepting the request and
verifies their canonical hashes before rendering. It publishes preview.png or
preview.webm, composition.json and handoff.json. Composition metadata identifies
every source revision/hash, instance transform/start, source duration, clipping,
camera, budgets and renderer version. The handoff snapshot hash identifies the
entire frozen composition, not only its first source.

First version is visual only: audio mixing is omitted explicitly. No composition
timeline editor, new NWN resource or game validation is provided. All results
carry nativeVerified:false; consumer tasks perform native integration and proof.
