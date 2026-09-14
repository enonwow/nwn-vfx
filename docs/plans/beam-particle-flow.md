# Finite P2P beam flow and endpoint particles — next profile

Status: **release held after the 2026-09-10 decompilation audit**. The working
implementation now corrects the Type7 animation column to Param6 in integration
schema 6. The packed artifact is still held, and reversing native objects does
not establish victim chest to caster hand.
See [audit correction](../agents/beam-audit-2026-09-10.md). The 0.26 nativeMotion
atlas remains blocked. Static Lightning repair is already released as 0.26.1.

## Agreed consumer scope

The Last City - VFX selected a configurable finite first implementation:
approximately 3 seconds of emission/channeling followed by 0.6 seconds for
existing particles to arrive and disappear, within its 5-second demo.
The same live instance must survive after birthrate goes to zero. Exceptional
interruption (death/area change) may remove the whole instance immediately;
arbitrary graceful stop is not required in this first profile.

The reference `tlc-wampir-drain-wisp@3` contains two Fountain layers with
subtle PNG wisps and additive motes. Its accepted source must remain intact.
Effects must attach at the source/target body nodes (hand/chest), not approximate
those with a fixed world offset from the feet. Body-node selection remains
the qualified consumer's integration responsibility.

## Primary evidence and limits

Offline retail ELF SHA256
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`
exposes `PartEmitter::moveParticleP2PBezier` at 0x4b0230 and P2P gravity at
0x4b0d40. `Gob::ReattachReference` at 0x43fc50 operates on the referenced
object (pointer loaded at 0x43fd07 and attached at 0x43fd41). It is not proof
that ordinary local dummy bones move to an external target. A skinned ribbon
under a local reference is therefore not an established workaround.

The Bezier path uses particle age/lifetime (division at 0x4b0811), target
position/orientation and native curve controls. Tangents, blend weighting,
zero combine-time behavior and exact update ordering need explicit comparison
with primary instructions before implementing shared preview equations.
The selected contract uses zero handles and combineTime=0; p2p=1/p2p_sel=1 was verified in retail Initialize. Gravity is less suitable for a bounded deterministic arrival because overshoot
and arrival depend on its drag/threshold dynamics.

## Implementation direction

1. Add an optional atomic binding on authored Fountain emitter layers for
   flow/source endpoint/target endpoint, with explicit preview endpoints and
   direction. Reuse existing texture, appearance, life and emission controls.
   Promote only documents using the new field; preserve old schemas and bytes.
2. Implement a finite P2P/Bezier beam exporter with birthrate animation,
   one reference for the dynamically attached target, and a named start
   animation that actually exists. No Lightning point-array profile or old
   atlas fallback. The direction contract must explicitly instruct consumers
   how to bind native source and target objects.
3. Keep particle birth, travel and death continuous in the shared preview.
   Closing must stop births and drain existing particles on the same clock.
   Do not initialize a new empty closing pool and call it continuity.
4. Consumer approved separate finite FnF endpoint models dispatched alongside the same persistent stream. Main cast01 does not propagate to referenced Gobs. Use progfx Type12, explicit Param1 body-node name and Param2 endpoint model, verified offline in ApplySpellVisual. Compile/read back every model; consumer verifies actual hand/chest rig nodes and timing.
5. Wire the binding into UI, CLI and WebMCP with grants, lock/null reset,
   raw drafts, revision conflicts, retry and undo. Keep all tool definitions
   within the host's 65,536-byte discovery budget without removing validation.

## Acceptance gates

- Immutable diagnostic fork, source-diff and exact PNG provenance.
- Shared birth/lifetime/curve tests, both flow directions, opening front and
  closing tail; moving endpoints do not use a stale saved target transform.
- Native ASCII and binary contain the same finite gate, travel time, flags,
  reference graph, real animation name and complete resources. Corruption fails.
- Build/tests, UI and actual host WebMCP retrieve the resulting artifacts.
- Independent consumer then verifies no crash, hand/chest anchoring, flow,
  cessation and removal in NWN. Until then nativeVerified remains false.
- Realistic translucent appearance requires visual comparison; a mathematical
  particle path alone is not artistic approval of Drain Life.
