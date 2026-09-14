# One native projectile: Type10 animation and paths

2026-09-11. Bounded offline audit. The user's current direction is **one native
VFX projectile containing its head and trail**. Helper Placeable/VT and a
separate trail are withdrawn. No implementation, service or native session
was changed.

**Timing erratum:** the fresh instruction-bound Windows read below supersedes
the older August 13 report's `+1.5` constant. The actual instruction reads
`+2.0` from the next float address. This is a source-audit error, not evidence
of a changed binary.

## Animation selector resolved

Retail Linux client SHA256
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`:

- `CNWCVisualEffectOnObject::ApplyMirv`, `0x8154f5..0x8154fd`, passes numeric
  animation selector **1** to `CNWCProjectile::SetAnimation`.
- `CNWCProjectile::SetAnimation`, `0x7f3960`, dispatches through its animation
  base. `CNWCAnimBaseProjectile::SetAnimation`, `0x9dd300`, maps selectors:

| Selector | Requested model animation |
| --- | --- |
| 0 | `default` (`0x9dd378`) |
| 1 | `travel01` (`0x9dd390`) |
| 2 | `impact01` (`0x9dd363`) |

This resolves the previous numeric-selector unknown. It does **not** imply
that arrival necessarily plays selector 2; arrival dispatch is a separate
question. `impact` for Chunk and `cast01` for Type7 beam are different contracts.

The consumer's decoded `native/projectile-audit/vpr_magmisl.ascii.mdl` has
**no `newanim` blocks, supermodel `null`, and three Fountain emitters with
static birthrates 10, 3 and 3**. The Type10 request for `travel01` therefore
does not demonstrate an authored animation in this stock model. Its positive
static emission does not require the FnF `impact` birthrate gate used by
current Studio exports. No invented missing-animation fallback is assumed.

The consumer's `wamar_001.ascii.mdl` is a closer structural baseline: it
contains the `g_wamar_001` trimesh and `omenemitter01` with `render Linked`,
texture `fxpa_white`, `inherit 0`, `inherit_local 0`, `lifeExp 0.18`, and both
`travel01` and `impact01` (each length 0.966667). This confirms a stock
mesh-plus-trail resource in one MDL. It does not demonstrate the requested
mirrored path, automatic arrival animation or time normalization.

## Travel animation synchronization and Param5

The recovered `CNWCProjectile::SetAnimation` wrapper passes playback rate
**1.0** (`0x7f3970`) to the animation base. `ApplyMirv` requests selector 1
before it calculates travel duration. The Windows duration setter
`0x1409873c0..0x1409873cc` only stores the integer timer at `+0x194` and
`+0x21c`; it does not set an animation rate.

Therefore **automatic stretching of the whole `travel01` to the projectile
flight is not established**. A fixed-time lateral excursion in `travel01`
must not be presented as a normalized whole-flight LEFT/RIGHT curve at varying
distances. No other global animation-clock behavior was audited here.

Both inspected Type10 handlers have these Param5 branches:

| Param5 | Recovered behavior |
| --- | --- |
| exact `log` | `trunc(distance / (3*logf(distance)+2) * 1000)` milliseconds |
| exact `linear2` | twice the integer result of `CalculateProjectileTimeToTarget` |
| anything else, including `linear`, blank, an unknown word or numeric text | ordinary `CalculateProjectileTimeToTarget` result |

There is **no numeric-duration parser in the inspected Type10 handler**.
`"0.35"` does not supply a 0.35-second timer. `linear` is not a third special
comparison: it follows the default branch. The default helper's full speed
formula was not expanded in this bounded audit.

Windows evidence binds SHA256
`3b7cb1252e0edb2ce22d7971f333aade027039ae30a45b4bc64732c3e6bec73a`:
`0x14096af3d` is `addss xmm0,[rip+0x417223]`, an eight-byte instruction.
Its effective address is **`0x140d82168` = 2.0**. The old report read
`0x140d82164` = 1.5, four bytes earlier. Linux independently reads 2.0 at
`0x8155cc`. The log operation is deterministic; the old RNG interpretation
remains incorrect. The claimed `+1.5` formula, 625-ms three-metre oracle and
`exp(-0.5)` short-distance boundary must not be reused from the older report.

## Arrival and impact timing: existing evidence only

The existing Windows `vfx-progfx-type10-projectile-audit-2026-07-18.md`
states that the audited row-181/path-4
owner, model particles and source-MDL light are released after arrival. It
does not establish a retained post-arrival playback phase. The numeric mapping
to `impact01` above **does not prove an automatic Type10 arrival dispatch**.
This follow-up did not recover a new arrival state machine or generalize the
path-4 result to every projectile family.

The consumer's extracted `retail/nwn_base/nw_s0_magmiss.nss` separately creates
`eMissile=EffectVisualEffect(VFX_IMP_MIRV)` and
`eVis=EffectVisualEffect(VFX_IMP_MAGBLUE)`. Lines 88–90 schedule damage, impact
visual and missile through separate calls. The script's `fDelay` at line 53
is `distance/(3*log(distance)+2)`. The freshly checked Type10 `log` branch uses
the same additive constant, with float32 evaluation and integer-millisecond
truncation. The script still schedules impact separately; this is not
evidence of automatic `impact01` playback by the moving owner. Additional
missiles are scheduled by the script loop, not by the value `Param4=4`.

For the requested boar this leaves an explicit boundary: **post-arrival
dip/lift and WAV timing cannot be promised as part of the Type10 owner on the
strength of these sources**. One moving resource can contain head and trail,
but a custom arrival phase or audio trigger needs an actual native contract.
No helper, separate-effect workaround or new hypothesis is proposed here.

## Native path dispatch

The jump table at `0x1323a34`, read directly from the same client, maps
`SetProjectileType(Param4)` as follows. These select behavior lists for **one
projectile**; their names/count of segments do not create extra projectiles.

| Param4 | Native constructor |
| --- | --- |
| 1 / 2 / 3 | Homing / Ballistic / HighBallistic |
| 4 / 5 | BurstUp / Accelerating |
| 6 | Spiral |
| 7 / 8 | Linked / Bounce |
| 9 / 10 | Burst / LinkedBurstUp |
| 11 / 12 | TripleBallistic with argument 1 / 0 |
| 13 | DoubleBallistic |
| 50 | Test |

These are symbol-backed constructor names, not a claim of complete trajectory
simulation. In particular, the name BurstUp for 4 does not overturn the
existing Windows audit of its single `0x400` segment and straight path update.

**6, Spiral:** `0x7f28ed..0x7f291b` calculates the XY target-minus-source
vector. `rand()` at `0x7f2920` selects a bit at `0x7f2936`; the branches at
`0x7f2949` and `0x7f2a80` construct opposite perpendicular vectors. This is a
source-to-target lateral component, **but its side is randomly chosen**.
The constructor also subtracts 2500 ms from an intermediate duration at
`0x7f2a68`; a 0.35-second authored expectation is not an established contract
for this path. No short-duration runtime behavior is inferred here.

**13, DoubleBallistic:** `rand()` at `0x7f1b4a` affects the angle passed to
`sincosf` (`0x7f1bd5`). A waypoint uses a 3.0-unit offset near the target.
The constructor contains a scene/terrain query. It is a real curved native
route, not an established deterministic LEFT/RIGHT selector.

**11/12, TripleBallistic:** their constructor at `0x7f1f30` contains no direct
RNG call. The argument negates both initial-facing XY components at
`0x7f209d..0x7f20ab`. Waypoint arithmetic uses target XY plus that vector
scaled by 1.5, then a further 0.7 offset, with terrain queries for height.
`ApplyMirv` copies the source object's initial orientation into the projectile
at `0x81547c..0x8154bc`. Consequently these variants are not automatically
left/right relative to S→T: their sign follows initial facing, and the offsets
are not an authored fraction of the source-target distance. This audit does
not label either native variant LEFT or RIGHT or claim native visual success.

The other constructors are enumerated above, but their full movement equations
were not recovered in this bounded follow-up. No exhaustive claim that the
entire engine lacks another suitable path is made.

## Native capability versus Web preview

NWN implements these native routes and nonzero orientation modes. Aurora Web's
current restriction to path 4 and orientation mode 0 is a **preview support
boundary**, not a prohibition on native modes 1/2. Conversely, listing a native
path or producing an MDL does not establish Web parity or native acceptance.
Deterministic `logf` timing is separate from RNG in the Spiral/DoubleBallistic
constructors; the correct additive constant is documented above.

## Exact public exporter gap

Studio 0.30.1 supports impact/duration/beam documents and generates
`impact`/`duration`/`cast01`. It has no public Type10 projectile export contract.
The narrow required addition, if subsequently authorized, is:

1. One centered model with its mesh and moving-owner trail emitters; explicit
   static visibility/emission or `travel01` controller policy. No baked
   inter-creature translation, helper object or separately dispatched trail.
2. Versioned Type10 integration metadata for Param1=model, Param2=projectile
   spell/config, Param3=orientation mode, Param4=path, Param5=timing. Consumer
   allocates table rows and supplies source/target/application context.
3. Explicit lifecycle limits: model ownership, release at arrival, and whether
   any remaining particle tail can survive. The existing stock owner-release
   audit does not justify promising a post-arrival tail.
4. Shared public create/change/build/artifact operations and explicit preview
   capability diagnostics. Preserve exact requested native mode even when Web
   cannot simulate it; do not present a guessed straight preview as parity.

Changing only the old FnF animation name or importing an existing baked v2
model does not supply this contract. No public operation currently expresses
the complete Type10 candidate, so no pseudo-command is supplied.

## Evidence

`C:/Projects/New Folder/boar-projectile-type10-audit-2026-09-11/` contains
`dispatch.asm.txt`, `curved-paths.asm.txt`, `path-dispatch.json`,
`windows-type10-timing.asm.txt`, `windows-input.json`, `inputs.json` and
`verification.json`. Previous `projectile-model.asm.txt`
in `boar-projectile-audit-2026-09-11` contains the numeric-selector wrapper.
The stock ASCII source is the consumer's decoded resource, not a new extraction
or native playback proof. Full source paths and hashes are in verification.

The consumer owns stock script/table selection and the native test. This task
did not launch NWN/Toolset, change 14385 or author another prototype.
