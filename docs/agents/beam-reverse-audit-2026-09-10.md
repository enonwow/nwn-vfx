# Reverse P2P and emitter initialization — offline audit

The existing finite profile has no verified reverse-particle mode that preserves
a caster-hand root. Swapping EffectBeam objects changes attachments. It is not
an independent reversal of particle travel. No source revision or V9/V10
candidate was changed by this audit.

Evidence directory: `C:/Projects/New Folder/beam-reverse-audit-2026-09-10`.
The retail Linux ELF remains SHA256
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`.
Toolset C is a different program/platform; its parser/flag evidence is kept
separate. These are static code and resource observations, not Windows playback.

## Direction and reference binding

| Observation | Retail instruction evidence |
| --- | --- |
| Particle age starts at zero | `Particle::initialize` 0x4abc45 |
| Birth position is the emitter's world position, optionally randomized within its local emission area | 0x4abca6–0x4abcb7; `randomPosition` 0x4ab7e0 |
| Age increases by the update delta; negative age is clamped to zero | `chkParticleLife` 0x4b1bce–0x4b1be9 |
| With nonnegative lifeExp, an old particle is recycled when its age reaches lifeExp | 0x4b1bb1–0x4b1bcc, 0x4b1c08–0x4b1c27 |
| The Bezier parameter is age / emitter lifeExp | 0x4b080b–0x4b0811 |
| Cubic coefficients are `(1-t)^3`, `3t(1-t)^2`, `3t²(1-t)`, `t³` | 0x4b0848–0x4b08c3 |
| P2P target is the first reference child's separate Gob | `SetEmitterTarget` 0x4aa81a–0x4aa869 |
| Target is read again during motion | Bezier 0x4b07ef–0x4b07f9; gravity 0x4b1049–0x4b1053 |
| `p2p` and `p2p_sel` select enabled/algorithm bits | 0x4aaa70 / 0x4aaa80; Toolset C lines 852420–852432 |

For the current constant-positive-life, zero-handles, combineTime=0, zero
additional-velocity profile, the instructions give
`P(t) = S + (T-S) * (3t²-2t³)`. Thus P(0)=S and P(1)=T. Changing the two
Bezier handles changes the intermediate control points, not the two endpoints.
There is no `1-age/life` operation in this path. Negative life does not supply
that operation either: it changes expiry behavior and gives negative t.

The gravity variant accelerates along the normalized vector from the particle
to that same target (0x4b1069–0x4b1142), using the attraction coefficient and
frame delta (0x4b1160–0x4b11c8). Changing its sign is attraction/repulsion, not a
swap of birth and destination. It does not establish spawning at the victim and
arriving at the caster hand.

This conclusion concerns these paths and the current finite profile. Animated
lifeExp, nested resource models, or other engine mechanisms are not proved
impossible; they do not yet have a validated authoring/runtime contract here.

`ReattachReference` attaches the referenced Gob at +0x68 to the second object
(0x43fd07–0x43fd41). Its traversal follows ordinary Part children +0x38/+0x40
(0x43fe65–0x43fe94). It does not rewrite their parent chain. `PartReference` uses
the same `Part::GetWorld` method as Part (vtable +0x20 = 0x437930): parent links
at +0x48 and owning Gob at +0x50 determine its ordinary children's transform.
Putting an emitter under an ordinary reference node therefore does not by
itself transfer that emitter into the separately reattached model. A nested
model also needs a demonstrated return reference to the caster and animation
dispatch; neither was established. Do not advertise this hierarchy as a fix.

## No missing `_EmitterTarget` animation event was found

`PartEmitter::Initialize` registers `_EmitterTarget` at 0x4aae07–0x4aae18.
`NewCAurObject` creates reference objects at 0x44144d, then emits the named event
at 0x44147f–0x441489. Gob vtable +0x2a0 resolves to `Gob::DoEvent` 0x49d760.
`SetEmitterTarget` then resolves the child reference; when no reference exists,
its fallback at 0x4aa996 is `DeregisterCallback`, not a reverse-target lookup.
Adding `_EmitterTarget` to cast01 without another reason is unwarranted.

Evidence: `emitter-callback-refs.json`, `emitter-creation.asm.txt`,
`reverse-path.asm.txt`, `transforms.asm.txt`, `virtual-call-targets.json`.

## Shipped resources give a useful animation-control comparison

`scripts/audit-stock-beams.py --decompile` reads both local KEY catalogs and
extracts their Type7 progfx entries with exact KEY/BIF offsets and resource
hashes. The hash-pinned resource-free compiler only decodes the 13 stock MDLs;
it does not launch NWN or Toolset. `stock/manifest.json` records every result.
No runtime override precedence is inferred from the two catalogs.

| Stock model | Main moving emitter | Base emission | Other relevant values |
| --- | --- | --- | --- |
| `vim_rayflame` | Fountain, P2P=1, sel=1, Linked | birthrate 10 | lifeExp 1; combineTime .5; handles 0; animation impact |
| `vim_lashfire` | Fountain, P2P=1, sel=0; Linked and Normal emitters | birthrate 50 | lifeExp 1.3/1.5; animation cast01 |

Neither is evidence of reverse travel to a caster hand. They are concrete
stock configurations for the same two motion algorithms. Their emitter
sizeStart_y is zero too; that value alone is not an established defect in our
model. This resource comparison is not native qualification of either model.

Both shipped progfx tables have rows 600–612 with Param2=cast01 and empty
Param6. The inspected Linux ApplyBeam still demonstrably reads Param6. The
stock models' positive base birthrates allow emission without our finite
animation gate. Their rows therefore do not prove that the current finite
cast01 gate runs, nor do Linux instructions prove the Windows execution path.
Keep this distinction explicit when interpreting the Param6 correction.

## V9 outcome and V10 scope

The consumer reported that V9 remained invisible after the Param6-only change,
including the user's observation and inspection of an unpaused recording.
Therefore Param6 is not an established complete explanation of the failure.
No second initialization/animation defect has been proved by this audit yet.

V10 is a public-operation fork `studio-finite-essence-visibility-v10@3`, binary
job `e67badcd-11df-4d85-99c5-ced0f90c9552`. Only texture, three colors, three
alphas and three sizes changed, plus the fork name and new asset. The white
texture is 32x32 RGBA255, size .5, alpha 1. Emission, cast01 keys, P2P/reference,
lifeExp, direction and native-object instructions remain identical to V9.
See `output/beam-high-visibility-v10/report.json` and `binary/handoff.json`.

Packaging correction: the job has 15 artifacts; handoff lists 13 and excludes
itself and candidate.zip. The resource HAK contains only the new MDL/TGA/TXI.
Old assets remain in the source document/history, not in this HAK. The earlier
message saying the old texture was retained in the HAK was incorrect.

The consumer subsequently reported visible white particles in V10, changing
range/pulsing and disappearing over repeated cycles without an observed crash.
Consumer video SHA256:
`669d6000d536d653d6c453a00e9e37663a86424e04d3329f28f10493113fef8e`.
This is an external observation from The Last City - VFX, not a Studio native
proof/import. It establishes visibility for that configuration; the exact
per-particle .6-second tail, reverse travel and hand/chest attachment remain
unqualified. Appearance changed in several fields together, so this comparison
does not isolate texture, alpha, color or size individually.

Investigate authored appearance next without changing the native emission
mechanism. A constant-base-emission diagnostic is not needed on current evidence.
Preserve V10 as the visible control. Reverse travel with a caster-hand root is
a separate architectural requirement with no supported solution established by
this audit. The earlier packed 0.27.0 remains held; global Studio was not changed.
