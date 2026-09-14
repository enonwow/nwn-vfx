# Explicit binary candidate profile (Studio 0.10.0)

`nwn-ee-impact-binary-experimental-v1` compiles Studio's validated ASCII source
to binary MDL through the bundled, hash-pinned resource-free nwnmdlcomp. It is
an experimental alternative for controlled native comparisons; it is not a
native-tested fix. Default exports remain ASCII. No project revision, trail
path, material or timing is changed by choosing the build profile.

Read `capabilities.exportProfiles` for availability. The bundled compiler is
Windows-only. Unsupported/missing/tampered compiler installations return
`CAPABILITY_UNAVAILABLE`, without silently producing ASCII instead. Neither
the API nor project data can select an executable, path or compiler flags.

```text
nwn-vfx --json capabilities
nwn-vfx --json candidate build --project PROJECT_ID --revision REVISION --profile nwn-ee-impact-binary-experimental-v1 --idempotency-key binary-build-unique-001
nwn-vfx --json jobs wait JOB_ID --timeout 30s
nwn-vfx --json artifacts get ARTIFACT_ID --out EXPLICIT_DESTINATION
```

WebMCP uses the existing `studio.candidate.build`:

```json
{
  "viewSessionId": "CONNECTED_VIEW_ID",
  "input": {
    "projectId": "PROJECT_ID",
    "revision": 4,
    "profileId": "nwn-ee-impact-binary-experimental-v1"
  },
  "idempotencyKey": "binary-build-unique-001"
}
```

Use discovered IDs, revision and grant, not the illustrative placeholders.
Existing build scopes, AI pause, cancellation, stable retry keys and chunked
artifact delivery apply. Old tabs with drafts must be preserved; open a fresh
tab for the updated closed schemas. The UI offers **Binarny MDL
(eksperymentalny)** beside export; the selection affects NWN candidate builds
only, never PNG/WebM or the saved document.

The source document keeps its authoring profile; `handoff.profileId` and
`validation.profileId` identify the selected export profile. Default model
resrefs distinguish ASCII and binary builds of the same project/revision.
Explicit `modelName` is still honored: the consumer must avoid resource
collisions when deliberately reusing a name.

The package includes binary `.mdl`, resource `.hak`, unchanged TGA/TXI,
`effect-document.json`, `source-model.mdl.txt`, `compiled-roundtrip.mdl.txt`,
`compiler-log.json`, `validation.json` and `handoff.json`. Only the binary MDL
and texture dependencies enter the HAK. All identities/hashes come from job
artifacts; do not hand-replace resources inside an older candidate.

`validation.compilation` binds compiler hash/source revision, source/binary/
roundtrip MDL hashes, byte counts, checked nodes/triangles/controllers and
vertex/UV samples. The verifier handles compiler traversal, welding and
quaternion-equivalent rotations, compares winding with multiplicity, and
rejects missing or changed samples/controllers. The existing `readback` fields
describe the exact ASCII source. Float32/decompiler comparison tolerance is
max(1e-6 absolute, 1e-6 relative); measured maximum sample error is returned.
This verifies data, not native normals, lighting, blending or playback.

Studio 0.12.1 fixes a false `COMPILE_VALIDATION_FAILED` when distinct source
double values (for example `0.96` and `0.9600000000000001`) have identical
float32 encodings. Source corner classes now use exact float32 values for
the base vertex/UV and **every** animation sample. Values with different
float32 encodings remain distinct, including coincident corners whose later
samples diverge. No numeric tolerance, triangle/UV/winding coverage or normal
check was relaxed. Failures identify the node, table and missing source class
or unmatched output row. The source document, ASCII writer and pinned
compiler are unchanged; the binary receipt uses `nwn-binary-vfx-0.12.1`.
Failed 0.12.0 jobs remain immutable: submit a new build key for the same
project/revision to use the corrected validator. Existing successful artifacts
and job receipts retain their original hashes and versions.

Independent compiler runs may differ in binary bytes. An idempotent retry
returns the existing job; its exact output bytes and hashes are authoritative.
Studio 0.10.1 corrects the compiler build source commit to
`56da6dc2fe94da6bbabe83ad18670f47fccd7dfb` (dunahan/nwnexplorer). The first
0.10.0 receipts recorded the earlier reference-study commit instead; their
executable hash and artifacts remain valid and immutable. See
`bin/native/README.md` for the provenance erratum.
No NWN or Toolset process is launched. A separately qualified NWN runner must test
the returned candidate and record the actual client/MOD/HAK/resources/capture.

For a minimal diagnostic trail, use existing `projects.create` with `empty`
then `changes.apply` (`layer.add`/`layer.remove`). Keep a visible mesh control
in the same project and build both profiles from that exact saved revision.
Do not introduce effect-specific MDL templates or modify Studio storage.
