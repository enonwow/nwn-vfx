# Animmesh export audit — Studio 0.14.1

The exporter previously copied static position/orientation/scale/alpha into an
animation node and then wrote keyed controllers for the same fields. The pinned
compiler retained both entries. Version 0.14.1 writes one controller per type;
trail animation likewise no longer duplicates alpha. Geometry, UV, samples,
material, timing and saved documents remain unchanged. Compiler bytes are unchanged.

This removes a confirmed ambiguity. It is **not proof** that the reported NWN
heart rendering problem is fixed. Static normals alone do not establish missing
geometry; duplicate animation/geometry sections do not establish two rendered
instances. Native playback must be compared by the consumer.

New `validation.compilation.geometryReadback` checks raw draw indices against
oriented faces, reads every vertex-major binary position/UV sample against the
frame-major source, checks base/animation vertex order, and rejects duplicate
controller types. Counts include expanded UV/normal corners and both sections:
`drawTriangles` is a data count, **not** a count of surfaces rendered at runtime.
The decompiler does not read the draw index buffer. A regression deliberately
damages that buffer: the old roundtrip and normal checks pass, the new check fails.
Another reproduces the old duplicate-alpha output and checks its rejection.

## Re-export through public operations

No artistic edit or new project revision is required. Build the selected saved
revision using a **new idempotency key**; an old key returns its original artifact.

```text
nwn-vfx --json doctor
nwn-vfx --json candidate build --project tlc-wampir-bijace-serce --revision 4 --profile nwn-ee-impact-binary-experimental-v1 --idempotency-key heart-r4-0141-export-001
nwn-vfx --json jobs wait <job-id> --timeout 30s
nwn-vfx --json artifacts get <artifact-id> --out <explicit-output-file>
```

WebMCP uses the same installed exporter:

```json
{"viewSessionId":"<granted-session>","input":{"projectId":"tlc-wampir-bijace-serce","revision":4,"profileId":"nwn-ee-impact-binary-experimental-v1"},"idempotencyKey":"heart-r4-0141-export-001"}
```

Call `studio.candidate.build`, inspect `studio.jobs.get`, and retrieve verified
chunks through `studio.artifacts.read`. Existing scopes, pause, locks and expiry
still apply. No new tools or document fields were added; refresh closed output
schemas for `geometryReadback`. Older receipts remain valid historical records.

## Controlled comparison

Use one isolated model at a time, same camera/lighting, during full alpha in the
middle of its two-second animation. Preserve the original r4 resources.

| Candidate | Purpose |
| --- | --- |
| Original r4 | Observed baseline |
| Static, 0.14.0 | Same geometry/texture/material/alpha, no vertices track |
| Held animmesh, 0.14.0 | Same base shape, constant samples, same rendering path |
| Exact r4 document, 0.14.1 | Only exporter controller change |

If static also fails, deformation is not necessary to reproduce the defect.
If only animmesh fails, inspect that native path. If held succeeds but moving
fails, inspect sampled playback. Only the exact-document comparison can support
attributing improvement to the controller change. No conclusion is automatic.

Source references: [pinned compiler mesh construction](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NmcLib/NmcMesh.cpp),
[binary node layout](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NwnLib/NwnMdlNodes.h),
[animmesh authoring tutorial and full tables](https://forums.beamdog.com/discussion/69250/how-to-manually-create-animmeshes-a-tutorial).
