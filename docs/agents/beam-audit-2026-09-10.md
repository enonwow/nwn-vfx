# Beam audit correction — release hold

The offline audit at `C:/Projects/New Folder/AUDYT_VFX_BEAM.md` found a confirmed
error in the current integration contract: retail `ApplyBeam` reads **Param6**
for its animation, not Param2. A blank entry overwrites the initial cast01
string; `Gob::PlayAnimation("")` clears active animations. Finite emitters with
base birthrate zero therefore need the actual cast01 name explicitly in Param6.

At audit time the implementation, closed output schemas and handoffs described
Param2. The working source now emits **integration schema 6** with Type7
`Param1:<model>, Param6:cast01`. Closed schemas still read historical schema
3–5 / Param2 jobs, but reject mixed columns or a version/column mismatch.
Type12 endpoint instructions retain Param1=node and Param2=model.

The correction passed 30 targeted tests and the production build. The regression
derives the animation column from pinned retail instructions in
`tests/fixtures/beam-animation-column-evidence.json`. The public HTTP acceptance
script `scripts/accept-beam-animation-correction.ts` re-exported the unchanged
`studio-finite-essence-diagnostic@1`, retrieved both old and new jobs through
closed output validation, and compared all four MDL/TGA/TXI/HAK resources byte
for byte. See `output/beam-animation-correction/report.json` and `handoff.json`.
New job: `1dc89346-f0a5-4b0c-bbb0-8700ea0f8360`; old job and source stay immutable.

This source correction does not update the previously packed artifact. Do not
install or qualify that held 0.27.0 package. A consumer's controlled Windows
playback test is still needed; this acceptance is export/readback only.

EffectBeam nBodyPart selects the **effector/source** attachment. The standard
looping path sends the other body byte as zero; ordinary creatures map target
values zero and one to impact. Reversing objects does not provide a target hand.
Missing requested nodes may fall back to root. The desired victim chest to
caster hand flow is not established by the current reverse-object contract.

This finding is based on the pinned Linux retail ELF, with Toolset C parser
evidence kept separate. Windows runtime behavior still needs a controlled
consumer test. Param2 in Type12 remains the endpoint MODEL and must not be
changed by a blanket replacement. No native executable was run by this audit.

Follow-up: the consumer's V9 remained invisible after the Param6-only change.
The correction is not an established complete cause of the rendering failure.
See [reverse and initialization audit](beam-reverse-audit-2026-09-10.md) for
particle birth/age/reference evidence, stock Type7 resources, the absence of a
missing `_EmitterTarget` event, and the separate V10 visibility diagnostic.
