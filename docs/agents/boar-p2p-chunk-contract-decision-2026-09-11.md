# P2P Chunk: bounded follow-up decision

2026-09-11. **STOP before implementation: the standard MDL/beam attachment
path does not provide the required controllable S→T lateral frame.**
Exactly-one emission has a source-backed route. This result does not rule out
other engine/consumer mechanisms; the consumer is independently auditing
`SetObjectVisualTransform`, which was not duplicated here.

## Exactly one Chunk: recovered

Retail Linux `ExplosionEmitter::Update` at `0x4b23a0`:

- `0x4b23bd` truncates the current emission count to an integer.
- `0x4b2518..0x4b253a` invokes the emitter's selected movement function.
  `PartEmitter::Initialize` stores P2P Bezier in that slot at
  `0x4aae2e..0x4aae40`; this path is not restricted to Fountain.
- `0x4b2541` tests the detonation flag; `Detonate` sets it at `0x4aa771`.
- `0x4b2610` tests whether the Chunk resource name is nonempty;
  `0x4b2636` constructs `ChunkyParticle`. The pool-reuse branch instead
  reinitializes an existing particle.
- `0x4b2658` increments the allocation-loop counter, compared against the
  requested integer count at `0x4b267f`; `0x4b2556` clears the event flag.

Thus **one delivered detonate, constant count 1, a fresh Explosion emitter
and a resolvable Chunk resource produce one particle allocation/activation**.
This closes the count-integral problem of Fountain. It does not prove that a
particular consumer dispatches the animation event exactly once or that the
resource is visibly correct in Windows NWN. The parent animation must deliver
one event; the Chunk child independently starts `impact` (prior audit).

## Attachment orientation: concrete blocker

There is a useful correction to an overly simple model of attachment:
`Gob::ReattachReference` *does* rotate the beam owner toward the reference.
At `0x43fe1f` it calls `RotationArc(currentOwnerForward, targetPosition -
ownerPosition)` and composes the result into the owner quaternion at
`0x43fe3c..0x43fe4a`. `RotationArc` at `0x5b7070` uses normalized input vectors,
their dot/cross products, and the shortest-arc quaternion. This aligns an
axis; it does not construct a frame using world-up and a semantic LEFT/RIGHT.

The separate target Gob is attached with **mode 0**, explicitly passed at
`0x43fd35`. The jump table at `0x12ef120` maps mode 0 to `0x43e1d0`, which
constructs `CAurBehaviorAttach` at `0x4a2d50`.

`Gob::AttachToObject`, `0x43e121..0x43e132`, writes the selected target Part's
world position and quaternion straight into that Gob. Later
`CAurBehaviorAttach::Control`, `0x4a28d8..0x4a28ee`, repeats the same operation.
Consequently, an authored local rotation on the original reference Part or
its referenced model is not a retained independent orientation override for
this target Gob. P2P reads **that Gob's quaternion**, at `0x4b0341`, rather
than an authored target-model child orientation.

Source handle direction comes from the emitter's world quaternion:
`AnimateParticles` gets the world transform at `0x4ac78c`, then writes its
forward vector at `0x4ac9a7..0x4ac9d5`. Local emitter rotations can therefore
change a handle, but a fixed rotation does not supply heading-dependent roll.

For example, take an initially identity owner and an emitter rotated so its
handle points along local +Y. The recovered shortest rotation +Z→+X leaves
that handle at world +Y. Changing the connection to +Y maps it to world -Z:
the same supposed lateral handle becomes vertical. With a connection to -X,
it remains world +Y and changes semantic side. This is an algebraic
counterexample, not a native rendering experiment.

More generally, with initial +Z forward, a fixed local handle `(a,b,c)`
becomes `(c,b,-a)` for +X and `(a,c,-b)` for +Y. Requiring perpendicular,
horizontal handles for both headings forces `a=b=c=0`. Fixed local rotation
cannot close this gap. A nonzero target handle additionally inherits the
target Part's orientation; setting that handle to zero removes its dependency
but does not repair the source frame. Static/time-only MDL keys contain no
input for the live S→T heading or independent creature orientations.

**Missing contract:** a supported per-instance operation or recovered engine
behavior that sets and maintains the source/target handle frame from the two
attachment positions and world-up, without rotating either creature. It must
also define degenerate/vertical connections and moving-target updates.
The inspected standard reference-attachment path supplies no such control.

## Payload and trail consequence

If a future consumer/engine path provides that frame, the narrow design is:
Explosion + one detonate + count 1 + P2P Bezier + centered Chunk payload,
with child `impact` and no baked inter-creature translation. Head orientation
and the moving child's trail still require their own recovered contract.

The existing v2 trails are precomputed local mesh paths. They cannot be
advertised as the history of a live projectile's positions. Nested emission
also needs explicit ownership: deleting the parent Chunk/model must not be
mistaken for stopping births while allowing its existing trail to drain.
No trail/export implementation was started after the orientation gate failed.

## Consumer-owned VT alternative

The consumer reports a client-interpolated `SetObjectVisualTransform` path
for a helper Placeable. **This is the smaller Studio-side route:** centered,
static-visible mesh export is already expressible with explicit
`lifecycle: "impact"`, mesh `start: 0`, `position: [0,0,0]`, constant positive
`alpha` and `animation: {}`. Preserve the approved geometry, UV, material and
texture, and author a separate variant. `mdl-writer.ts` passes explicit
lifecycle visibility to `mesh-writer.ts`, which preserves the first alpha
value in the static node. No flight-animation feature is needed in Studio.

This does not establish Placeable compatibility or VT-to-particle transform
semantics. The consumer owns a bounded native test: one helper, a 0.35-second
snapshot S→T path for each side, and a short diagnostic trail. Accept only
if the actual head follows the path, older trail positions remain on that
path, and the declared tail survives for the required interval. An attached
rigid trail or premature tail deletion fails the trail portion. The VT
implementation and native test were not duplicated here.

The consumer subsequently narrowed the scene to fixed snapshot endpoints at
humanoid chest height 1.42 m and proposed two independently faced, invisible
proxies. That removes the constraint of arbitrary creature facing, but
**facing alone still does not define the required handle direction**: yaw
about Z leaves an ordinary Part's local +Z vertical. Custom proxy Parts could
be oriented so their world +Z follows the desired lateral direction. This is
potentially workable, not ruled out by the earlier fixed-local counterexample.
It requires proven anchor models, attachment names and update order, however.

Existing `beam-audit-2026-09-10/binding.asm.txt` shows `AttachBeam` passing
mode 0 for the source too (`0x815aec..0x815afb`), followed by the target
reattachment and owner RotationArc. The source attachment Control can then
write the source Part orientation again. A calibrated proxy design must
establish the orientation actually consumed at emission and subsequent
movement; matching only the initial facing is insufficient.

For this bounded demo, the single recommended method remains **one helper
Placeable moved through consumer-controlled VT**, with the native head/trail
test above. Two specialized anchor models plus new Chunk authoring/export
and child-trail handling are a larger change. No claim of general P2P/proxy
impossibility or native VT trail success is made.

## Evidence and scope

Evidence: `C:/Projects/New Folder/boar-projectile-audit-2026-09-11/`:
`single-chunk.asm.txt`, `attachment-contract.asm.txt`,
`attachment-update.asm.txt`, `attachment-dispatch.json`,
`rotation-arc.asm.txt`, and `contract-check.json`.
Existing `beam-reverse-audit-2026-09-10/transforms.asm.txt` and
`birth-and-curve.asm.txt` supply the other instruction anchors.

All new instruction evidence binds the retail Linux binary SHA256
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`;
this is separate from Toolset C and Windows native qualification.
Only audit artifacts were written. No Studio version, public API, exporter,
service, consumer project, accepted revision or native installation changed.
