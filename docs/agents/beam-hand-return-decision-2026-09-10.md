# Drain Life: reverse flow with caster-hand root

**Decision: unsupported by the current finite Fountain/P2PBezier profile.**
There is no qualified implementation of victim → caster hand while keeping
the main native EffectBeam root on the caster's hand. The existing `direction`
field reverses the integration's objects; it does not reverse particle travel
relative to an unchanged root. No new hand-support feature was enabled.

This decision reuses and verifies the primary offline evidence in
[beam-reverse-audit-2026-09-10.md](beam-reverse-audit-2026-09-10.md) and
[beam-audit-2026-09-10.md](beam-audit-2026-09-10.md), then checks the current
public Studio exporter. It does not claim every conceivable engine extension
or other unqualified architecture is impossible.

## Why the requested binding is not implemented

For the current profile, let S be the main emitter's native world position and
T the separately reattached reference's native position. Retail code gives
`P(t) = S + (T-S)*(3*t*t-2*t*t*t)`, with `t = age/life`.
Age starts at zero, so birth is at S; particles approach T. The required
reverse mode with S=caster hand instead needs birth at T and arrival at S.
Changing the consumer's object assignment changes S and T themselves.

| Fact | Pinned retail Linux instructions |
| --- | --- |
| Particle age starts at zero; world birth position comes from emitter | `Particle::initialize` 0x4abc45, 0x4abca6–0x4abcb7 |
| Bezier parameter is age/life | 0x4b080b–0x4b0811 |
| Cubic coefficients yield the stated zero-handle curve | 0x4b0848–0x4b08c3 |
| Target comes from the reference child's separate Gob | `SetEmitterTarget` 0x4aa81a–0x4aa869 |
| `nBodyPart` controls the effector/source attachment | `ExecuteCommandEffectBeam` 0xc3619f–0xc361d0; `AttachBeam` 0x815afb |
| Standard looping EffectBeam sends opposite body byte zero | `HandleServerToPlayerUpdateVisualEffects` 0x7a1407 |
| Ordinary creature receiver byte0/1 maps to impact | `LoadVisualEffect` 0x818e58→0x81972f→0x819e82 |
| Type7 animation uses Param6 | `ApplyBeam` 0x815bf4–0x815c09 |

Retail ELF SHA256:
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`.
The Toolset C export is a different program; neither is a Windows playback
test. This check verified hashes of 5 original inputs and 41 saved evidence
files. Evidence remains under `C:/Projects/New Folder/beam-reverse-audit-2026-09-10`.

The alternate gravity path also births at S, then attracts or repels relative
to T. Negating attraction does not create particles at T. Nonzero Bezier
handles preserve cubic endpoints. Negative life does not supply `1-age/life`.
Ordinary children of a PartReference retain their parent/Gob transforms; they
are not automatically children of the separately reattached Gob at +0x68.
No return reference plus animation contract for a nested victim-side model has
been established. These are not implementation shortcuts supported by this audit.

## Public current-export qualification

Ran public CLI on isolated Studio0.28, port14386, using exact V10 revision1.
Two explicit forks have the same authored values and model name, with opposite
`beamBinding.direction`. Both candidate jobs passed ASCII/readback analysis:

| Direction | Project/revision | Candidate job |
| --- | --- | --- |
| source-to-target | `studio-reverse-root-forward@2` | `d6c994d6-4637-47e7-ba03-cd01b3ef3c3a` |
| target-to-source | `studio-reverse-root-reverse@2` | `c0b4ce10-949d-41e0-bda2-7f595c2c5d5a` |

The MDL, TGA and TXI are **byte-identical** between directions. MDL
`vreverseproof.mdl` SHA256:
`3dbaffdd05be6a398f2625dc4be3db54015751e0c3f7e4c6add4f3008aa2c946`.
Both integrations use schema6, Type7, Param1=vreverseproof, Param6=cast01.
The `nativeObjects.effector/appliedTo` labels are swapped. The ZIPs correctly
have different identities because their documents and handoffs differ.

Full IDs, hashes, public-operation inputs and downloaded ZIPs:
`C:/Projects/nwn-vfx/output/beam-reverse-root-audit/2026-09-10/result.json`.
Reproduction script: `scripts/audit-reverse-root-public.ts`. It uses public
operations, bounded job wait and verified artifact downloads. The original
source revision remains unchanged. No resources were installed and no native
process was launched.

## Available choices and next gate

| Choice | Actual attachment/travel | Meets victim → hand with caster-hand root? |
| --- | --- | --- |
| Keep caster as effector, BODY_NODE_HAND, apply to victim | caster hand → victim impact, subject to actual rig node availability | No: direction is wrong |
| Victim as effector, BODY_NODE_CHEST, apply to caster | victim impact → caster impact, subject to rig node availability | No: caster hand/root requirement is missing |
| Implement a different engine mechanism with independent birth, destination and attachment control | Requires new evidence and a qualified native contract before Studio can export it | Not available or established yet |

The consumer can continue isolated color/count/visibility work while recording
the hand-return requirement as unmet. A separate hand FnF, world offset, swapped
object with unchanged labels, or preview-only reverse pulse must not be used to
claim that requirement passed. The suspended Lightning atlas/nativeMotion
profile is not a supported alternative.

Before implementing another exporter profile, require primary evidence for
birth at the victim with a caster-hand root, a real dynamic return reference,
animation dispatch and complete particle lifetime. Only then add explicit
schema/UI/CLI/WebMCP support and request native verification from the consumer.
Existing projects and candidate bytes must remain immutable throughout.
