# Explicit FnF and animated DUR — Studio 0.22.0

Start from your own mesh, PNG and animation. Presets are starting documents;
they do not restrict the effect's geometry or authored keys. This release adds
continuous mesh loops and a matched technical opening → loop → closing example.

## Contract and compatibility

- Optional `document.lifecycle`: `impact` (FnF) or `duration` (DUR).
- Omission retains historical FnF export, including alpha=0 at clip boundaries
  and its reported visibility ramps of at most 1 ms. Reading, upgrading the app
  or importing an old ZIP does not add the field or rewrite a revision.
- **Explicit `impact` is an opt-in to authored boundary alpha.** Both explicit
  modes serialize the authored first/last alpha, without the historical ramps.
  This allows opening-end alpha=1 → loop-start alpha=1 → closing-start alpha=1.
  To fade, author alpha keys. Model removal in NWN remains a consumer test.
- First use of lifecycle or lock `{@effect,lifecycle}` promotes to document 13,
  portable ZIP v8, minimum Studio 0.22.0. Undo preserves the promoted version;
  undo of a previously omitted field restores omission and the old profile.
- `document.duration` is **one animation / one DUR loop in seconds**. The
  consumer's NWScript effect lifetime is external; no ability lifetime is stored
  in this field. `profileId` is derived atomically from lifecycle. Do not patch
  the profile independently.
- Existing envelope version 0.1.0 and all 49 WebMCP tool names remain. Clients
  send `X-NWN-VFX-Document-Schema:13`; old clients get
  `CLIENT_UPGRADE_REQUIRED` before writing new features. Open a fresh editor
  tab and preserve any older tab containing human drafts.

`capabilities.effectLifecycle` describes these limits. The shared operations are
`projects.create`, `changes.preview/apply/revert`, `preview.request/compose` and
`candidate.build`; there is no separate privileged agent mutation path.

## Duration restrictions and validation

Enabled DUR layers must currently be **meshes**. Static primitive meshes and
fixed-topology custom meshes are supported, including PNG/UV/material, rigid
transforms and `animation.vertices`. Studio 0.24.0 also supports audio clips;
see [duration-audio.md](duration-audio.md) for document15, repeated preview PCM
and the explicit consumer audio schedule. Enabled emitters and trails still
produce `DURATION_INCOMPATIBLE`; they are never silently dropped. Disabled
layers and unreferenced assets remain in the source. Use separate FnF projects
for the final mist or other unsupported DUR components.

Each enabled mesh must start at 0 and cover the whole loop. Validation compares
position, quaternion-equivalent orientation, scale, alpha and every deformed
vertex at the two endpoints, with tolerance 1e-6. Faces, UV and vertex order
remain fixed. Failures identify the layer and measured channel differences.
This checks **C0 pose continuity**, not continuity of velocity/acceleration.
Matching endpoints can still produce a visible change of speed if the author
chooses different incoming/outgoing slopes. No keys are repaired or normalized.

Deformed DUR periods must be an integer multiple of 1/60 second. Nonconforming
periods fail without rounding. Existing shared 60 Hz vertex samples, geometry
budgets and approximate lighting apply. These checks do not establish native
animmesh playback, shading, interpolation or timing.

In the UI, **Nowy → Nowy efekt DUR** creates one mesh. **Tryb efektu** selects
explicit FnF or DUR and has its own owner lock. Historical FnF is labelled
separately until explicitly changed. **Pętla — rozciągnij klucze** changes loop
length by scaling mesh start/duration and key times together; its label explains
that edit. Values and topology remain unchanged and existing field locks apply.
CLI/WebMCP users perform the equivalent multi-field change in one
`changes.preview/apply` batch. Invalid intermediate UI JSON remains a draft.

## CLI from a consumer directory

No Studio repository cwd is required. Use your installed CLI and assigned actor.
These commands create an isolated project rather than editing an accepted one:

```powershell
Set-Location 'C:/Projects/the last city'
nwn-vfx --json doctor
nwn-vfx --json capabilities
nwn-vfx --json projects create --project my-wing-loop --name 'My wing loop' --preset empty --lifecycle duration --idempotency-key wing-loop-create-001
nwn-vfx --json schema get changes.apply
```

`projects.create` returns the saved revision and mesh ID `mesh`. Import your PNG
with `assets import` and your triangulated OBJ with `meshes import-obj`, using
each returned revision. Author `animation.vertices` or rigid keys through
`layer.set`. Existing texture, OBJ, deformation and shading documentation gives
their complete schemas and limits. Geometry import does not automatically add a
rig or manufacture animation keys from an image.

For an existing compatible mesh, the mode change is an ordinary changes file:

```json
[{"type":"project.set","values":{"lifecycle":"duration"}}]
```

Pass it to `changes preview/apply --project ID --expected-revision N
--input-file PATH`; apply also needs its stable idempotency key. If timing or
endpoints do not match, put their explicit corrections in the same batch.

```powershell
nwn-vfx --json preview request --project my-wing-loop --revision 1 --format webm --cycles 3 --idempotency-key wing-loop-preview-001
nwn-vfx --json candidate build --project my-wing-loop --revision 1 --profile nwn-ee-duration-ascii-experimental-v1 --idempotency-key wing-loop-ascii-001
nwn-vfx --json candidate build --project my-wing-loop --revision 1 --profile nwn-ee-duration-binary-experimental-v1 --idempotency-key wing-loop-binary-001
```

Use the actual current saved revision after editing, then `jobs wait JOB_ID` and
`artifacts get ARTIFACT_ID --out EXPLICIT_PATH`. PNG `time` may extend across
the requested cycles. `cycles` accepts integers 1–10, at most 30 seconds total;
values above 1 require DUR. Omission renders one loop. Rendering metadata records
`lifecycle`, `loopSeconds`, `cycles` and total `duration` for explicit modes.

## WebMCP in the human's tab

Discover the actual host's tools, then `studio.connection.inspect({})`. The
human connects using **Połącz agenta → Udostępnij projekt AI**. With its returned
`viewSessionId`, call the discovered tool schemas, for example:

```javascript
await tools.call('studio.projects.create', {
  viewSessionId,
  input: {name:'Agent wing loop', preset:'empty', lifecycle:'duration'},
  idempotencyKey:'agent-wing-loop-create-001'
});
await tools.call('studio.preview.request', {
  viewSessionId,
  input:{projectId, revision, format:'webm', cycles:3},
  idempotencyKey:'agent-wing-loop-preview-001'
});
await tools.call('studio.candidate.build', {
  viewSessionId,
  input:{projectId, revision, profileId:'nwn-ee-duration-binary-experimental-v1'},
  idempotencyKey:'agent-wing-loop-build-001'
});
```

`tools` here is the actual discovered WebMCP capability, not a page global.
Read `studio.view.inspect` before touching the visible editor. Saved revisions
and unsaved drafts remain separate; operations on the saved project do not
overwrite pending JSON or navigate the human's tab. Locks, pause, expected
revisions, stable retry keys and revocation still apply. An agent can create
its own new projects under the human grant; it cannot access arbitrary existing
consumer projects. Artifact reads remain bounded chunks with per-chunk and
full-file SHA-256 verification. A registration-mock test is not host discovery.

## Three-phase composition and integration

`preview.compose.instances[].duration` optionally extends a **DUR** instance's
visible lifetime in the composition. It does not rescale its cycle or change
its source revision. FnF rejects that property. Without it, an instance uses
its source document length, preserving older composition behavior.

For one-second opening/loop/closing documents, the technical example uses:

```json
{
  "duration":5,
  "instances":[
    {"id":"open","projectId":"OPEN_ID","revision":1,"start":0,"position":[0,0,0],"yawRadians":0},
    {"id":"hold","projectId":"LOOP_ID","revision":1,"start":1,"duration":3,"position":[0,0,0],"yawRadians":0},
    {"id":"close","projectId":"CLOSE_ID","revision":1,"start":4,"position":[0,0,0],"yawRadians":0}
  ]
}
```

Use CLI `preview compose --input-file PATH --idempotency-key KEY` or the same
input in `studio.preview.compose`. Manifests bind every source revision/hash.
This composition is a browser preview, not a new combined NWN resource.

Explicit-mode candidates contain `vfx-integration.json` schema 2, also in
validation/handoff metadata. It binds the **final** model file SHA-256, document
SHA, canonical snapshot, project/revision, lifecycle animation/loop length,
seam measurements, `OrientWithObject`, and `Type_FD` (`F` or `D`). A
`resourceBinding` lists verified NWN1 `Imp_*_Node` column conventions; **the
consumer selects the attachment columns and row**, not Studio. There is no
fabricated `Dur_*_Node` mapping and no automatic `Ces_*` registration. The row
fragment stays outside the resource HAK. Original candidates retain schema 1.

The ASCII profiles are `nwn-ee-impact-ascii-experimental-v1` and
`nwn-ee-duration-ascii-experimental-v1`; binary profiles substitute `binary`.
Explicit lifecycle exports identify exporter 0.22.0. Legacy omission retains
exporter 0.21.1 and its resource path. Profile/mode mismatches fail before
queueing. Binary output uses the existing hash-pinned resource-free compiler,
roundtrip controller checks and direct vertex/UV readback. Independently built
binary files need not be byte-identical; always hand off the actual job hashes.

The example's three meshes share geometry, UV and pivot, with an exactly
matched pose/alpha at opening-end → loop-start and loop-end → closing-start.
The loop's halfway pose deliberately differs. An **arbitrary immediate removal
of DUR followed by a fixed closing clip cannot guarantee a matching pose**.
Studio exposes no NWN phase introspection. A consumer may schedule a transition
at a nominal cycle boundary, but client startup, visibility changes and engine
scheduling still need native measurement. Source-time equality alone is not a
native synchronization guarantee. Single-model cessation/blending is a possible
future separately qualified design, not an implemented fallback in this release.

All results remain `nativeVerified:false`. The consumer alone integrates and
tests NWN removal of the FnF model, DUR playback, attachment and phase timing.
See [format findings](duration-format.md) for what the source references prove.
