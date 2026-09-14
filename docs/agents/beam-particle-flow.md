# Finite particle connection — Studio 0.27.0

**Release hold:** the [2026-09-10 audit correction](beam-audit-2026-09-10.md)
supersedes the native integration claims below. Type7 uses Param6 for the
animation. Working code/closed schemas now use integration version 6; the earlier
packed 0.27.0 is still held. Reversing objects does not give
a target hand attachment.

`beamBinding` is an optional atomic field on a Fountain emitter. It creates
actual particle travel through a finite native P2P/Bezier profile. It is separate
from static Lightning texture mapping and the suspended `nativeMotion` atlas.
Document 19 / portable ZIP 14 / minimum Studio 0.27.0 / client schema header 19.
Existing documents and immutable jobs are not rewritten.

## Authoring contract

Create `preset:empty,lifecycle:beam`, then use one `changes.apply` to replace its
default beam with the authored emitters. On an existing project, make an explicit
fork and disable its static beam; retain its assets and source layers. This first
profile does not mix enabled Lightning and Fountain layers in one main model.
Use `examples/beam-flow/from-empty.json` only with the known default layer ID.

```json
{"role":"flow","source":[0,0,1.2],"target":[0,3,1.2],
 "direction":"source-to-target","pulse":{"period":0.55,"duty":0.65}}
```

- `role`: `flow`, `source` endpoint, or `target` endpoint.
- `source` / `target`: logical preview points, XYZ metres, each ±20, distance
  0.05–30 m. Every enabled binding shares both points and direction.
- `direction`: `source-to-target` or `target-to-source`. This is an integration
  instruction to reverse native object binding, not a negative particle speed.
- Optional `pulse`: flow only, period 0.05–3 s, duty 0.05–0.95, at most 48 cycles
  within the layer's emission duration. Omission gives uninterrupted feed.
- Endpoint roles require `node`, an explicit ASCII creature-model node name
  (letter followed by up to 31 letters, digits or underscores). It must exist on
  the actual rig. There is no inferred foot offset or universal node guarantee.

All active layers must be bound Fountain emitters, maximum eight, with at least
one flow layer. Positions are `[0,0,0]`: the binding supplies the preview position
and the consumer supplies the native attachment. Flow requires speed, spread and
gravity zero, scale one and neutral orientation. `life` determines travel time;
there is no separately inferred speed. Reuse normal color, alpha, size, midpoint,
PNG texture, material, flipbook and count controls. Endpoint layers retain the
existing Fountain velocity/spread/appearance controls.

`start` starts emission, `duration` is the feed window, and `life` is each
particle's lifetime. Project duration must cover `start + duration + life` for
every enabled layer. The feed ends in the existing instance; old particles keep
their age and finish normally. A new closing model is never substituted.

Linear birthrate gates have edge ramps up to 1 ms. The compensated integral is
`count`; actual native particle counts and pulse edges depend on frame stepping.
Preview births invert that same integral using the existing seed stream. The
native RNG is not seeded by Studio. With zero handles, progress along the segment
is `3t²−2t³`, where `t=age/life`: this is not constant metres per second. The same
particle age drives size/color/alpha and atlas frames. Native transform update
order, alpha interpolation and renderer parity remain unqualified.

`beamBinding:null` removes the field without downgrading the document. Removing
the last flow requires an atomic compatible lifecycle/layer change. Its whole
value is one diff, undo and lock field. AI pause, project scopes, revision CAS,
stable retry keys and human draft protections apply. The UI offers **Nowy → Nowy
strumień cząstek**, additional flow/source/target layers and a binding editor.
Pending binding text is `meshEditorDrafts[layerId].beamBinding:{text,baseline}`;
invalid text remains visible to the agent and blocks save/navigation.

## CLI / WebMCP

```text
nwn-vfx --json projects create --preset empty --lifecycle beam --name "Own flow" --idempotency-key flow-create-001
nwn-vfx --json changes preview --project PROJECT --expected-revision 1 --input-file from-empty.json
nwn-vfx --json changes apply --project PROJECT --expected-revision 1 --input-file from-empty.json --idempotency-key flow-author-001
nwn-vfx --json candidate build --project PROJECT --revision 2 --model-name own_flow --profile nwn-ee-beam-binary-experimental-v1 --idempotency-key flow-build-001
nwn-vfx --json preview request --project PROJECT --revision 2 --format webm --idempotency-key flow-preview-001
nwn-vfx --json jobs wait JOB --timeout 30s
nwn-vfx --json artifacts get ARTIFACT --out EXPLICIT_PATH
```

Discover all 49 tools in a new connected tab. `studio.changes.preview/apply`,
`studio.candidate.build` and `studio.preview.request` use the same operation
inputs. Inspect `studio.connection.inspect` and `studio.view.inspect` first.
From 0.27.0, omitted `viewSessionId` uses the current tab's grant; explicit IDs
still reject a different session. Mutations still require explicit stable keys,
project IDs and revisions. The adapter never substitutes an owner credential.
Do not refresh a human's unsaved older tab to upgrade it.

Render metadata includes `beamParticleFlow` with exact layer bindings, start,
feed, life and count. A finite flow has one render cycle; use project duration
to include an empty tail. Composition can place this finite source alongside
other explicit instances without changing the sources.

## Native integration — consumer task only

`beam-flow.json` records exact source hashes, every gate, reference and endpoint
resource. `vfx-integration.json` schema 6 identifies the finite profile and points
to that artifact. Source/target labels are logical authoring endpoints, not
universal caster/victim identities. Historical schema 3–5 / Param2 exports remain
readable and immutable; create a fresh job key to receive the corrected metadata.

For the main stream, allocate a `visualeffects.2da` Type `B` row and a `progfx.2da`
Type **7** row with Param1 = exported main model and Param6 = **cast01**. Bind
`visualeffects.ProgFX_Duration` to that row. For source-to-target, EffectBeam's
effector is logical source and the effect is applied to logical target; reverse
these for target-to-source. The consumer selects the supported source BODY_NODE
and verifies the engine-selected opposite attachment on its actual creatures.
Studio preview coordinates do not set those native body nodes.

For the audited standard creature path the receiver is `impact`; the selectable
`nBodyPart` belongs to the effector. Swapping objects therefore does not provide
victim-to-caster-hand flow while preserving a caster-hand root. `targetAttachment`
in the manifest is a verification obligation, not an independent target-node
control. Current public-export proof and the precise support boundary are in
[beam-hand-return-decision-2026-09-10.md](beam-hand-return-decision-2026-09-10.md).

Keep that single beam instance alive through all reported `lastDeath` values.
Do not reapply, swap or remove it at feed end. Schedule removal no earlier than
`removeNoEarlierThan`, allowing native scheduling/frame tolerance. There is no
arbitrary graceful stop trigger; exceptional interruption may remove immediately.

Each endpoint is a separate finite FnF MDL, dispatched once at the common start:

1. Allocate a `progfx.2da` **Type 12** row: Param1 = authored `node`, Param2 =
   that endpoint model's resref.
2. Allocate a `visualeffects.2da` Type `F` row whose `ProgFX_Impact` references it.
3. Apply `EffectVisualEffect(allocated row)` with `DURATION_TYPE_INSTANT` to the
   corresponding logical endpoint object. The row chooses the node; merely
   calling `ApplyEffectToObject` does not select an arbitrary body part.
4. Verify the actual rig's node, impact animation, lifetime, locomotion and
   orientation. `handconjure` and `impact` are explicit example names, not proof
   that every creature provides them. Separate dispatch can have frame delay.

The main beam references the external stock `fx_ref` object. Endpoint models are
separate resources, not its children: beam cast01 animation propagation into a
referenced Gob was not established. Every generated MDL is compiled and read
back; binary endpoint hashes and proofs appear in `beam-flow.json`. No native
module, table row IDs, installation or game proof is produced here.

## Primary offline evidence

Retail `nwmain-linux` SHA-256
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`:

- `PartEmitter::Initialize` 0x4aaaa0 selects P2PBezier 0x4b0230 when P2P and
  P2PSel are both true. At 0x4b0811, age is divided by lifeExp.
- Bezier weighting uses `powf(t³, combineTime)`; combineTime zero gives pure
  curve weighting. Both handle lengths are zero in this profile.
- `ApplyBeam` 0x815b60 plays the Param6 animation on the main Gob. This corrects
  the earlier Param2 claim; empty table values do not preserve the default.
- `LoadSpellVisual` 0x813a30 reads Param2 and creates the model.
  `ApplySpellVisual` 0x813c80 reads Param1, attaches that model to the named node
  at 0x813d77 and plays literal `impact` at 0x813d99.
- `CreateReferenceObjects` 0x4421e0 creates a separate Gob; the tile-only
  `ExpandReferenceParts` path does not establish live child animation syncing.

The pinned compiler's [node/controller declarations](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NwnLib/NwnMdlNodes.h)
identify P2P flags and Bezier controllers. Microsoft's [powf contract](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/pow-powf-powl?view=msvc-170)
documents the zero-exponent boundary. The offline reports are under
`output/beam-motion-research/p2p-*.txt`; no executable was launched for this
analysis. Retail visual qualification still belongs to the consumer task.
