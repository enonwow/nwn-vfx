# Wings r6: loop sampling and motion audit

Date: 2026-09-09. Requester: The Last City task
`01a070e3-5df3-7913-943f-854ac8ea98ee`.

**The exported sample period and animmesh layout are correct. The authored
motion has abrupt changes of velocity.** The source contains 17 position keys
joined linearly, generated from `sin(2πt)^3`. Exporting their interpolation at
60 Hz does not turn those positions into a smooth spline. This is a concrete
contributor worth correcting; still images do not establish whether it fully
explains the reported native stutter or whether native frame timing contributes.

This was read-only. No service, project, resource, package or native integration
was changed. Studio remains 0.22.0. Only local audit scripts and reports were
created/updated.

## Exact inputs and results

Sources: `C:/Projects/the last city/assets/vfx/wampir/skrzydla/studio/v4/`.
Public installed CLI independently read revision **6** of the three projects
`tlc-wampir-skrzydla-open`, `tlc-wampir-skrzydla-loop` and
`tlc-wampir-skrzydla-close`, matching the candidate documents.

The loop snapshot SHA256 is
`aee8d5b88dcb223a676cd2bda90f3e262040861a2e629b00fb9479f6c6f2223a`.
The exact `vw_loop02.mdl` SHA256 is
`025e980f25187f7c7a831340be330c4d20bdd3517958fdb5be1421b1e1f9312f`.

All three phases passed the existing exact-document audit, including direct
binary draw indices, face winding, UVs, every deformation sample, base/animation
vertex ordering and unique controller types. There are four base animmesh nodes
and four matching animation bindings. Both sides of the membrane have exactly
the same vertex trajectories and opposite face winding. Their maximum relative
motion error is **0 m**. Layout does not introduce separate sampling times for
the front and back faces.

| Loop property | Observed value |
| --- | --- |
| Animation | `duration`, one animation, transition 0 |
| Period | 1.4 s |
| Source vertex keys | 17, spaced 0.0875 s |
| ASCII sampleperiod | 0.016666666666666666 s |
| Binary float32 sampleperiod | 0.01666666753590107 s |
| Sample sets per animmesh | 85: 84 intervals plus closing pose |
| Binary loop length | 1.399999976158142 s |
| Vertex/UV samples checked in binary | 873375 / 873375 |
| Duplicated controller types | 0 |
| Loop endpoint vertex difference | 0 m |
| Loop alpha | 1 throughout |

The binary render vertices total 10275 across the four meshes; splitting
position/UV/normal corners is reflected consistently in base and animation
tables. This count does not indicate additional wing instances. All original
source/MDL/roundtrip/validation/integration hashes were unchanged after the audit.

## What makes the current motion uneven

`v4/author-motion.mjs` generates nominal ±18° motion with `sin³`, spatially
weighted so the roots stay fixed. The audit independently reproduced every
authored loop vertex key from its supplied geometry and that formula.

The ideal `sin³` function is smooth, but it slows near the middle pose as well
as at the extrema. Sampling it into only 17 keys and linearly joining positions
introduces velocity discontinuities at those keys. The 60 Hz export samples
that existing path; it does not restore the analytic curve.

Measured over the actual mesh:

- Maximum jump between adjacent **authored segment velocity vectors**:
  **2.091384429 m/s**.
- Maximum vector displacement over one exported 1/60-second interval:
  **0.035839861 m**, corresponding to **2.150391675 m/s** on that segment.
- The slowest interval's maximum vertex displacement is about **0.004621 m**.
  This substantial variation is present in the source motion.
- Maximum additional deviation caused by 60 Hz resampling of the authored
  linear path: **0.003732900 m**, calculated at all original knots and boundaries.
- Dense comparison with the ideal analytic `sin³` motion: about **0.021307244 m**
  maximum deviation, including the coarse source approximation and resampling.
- Velocity mismatch at the loop seam is only **0.004874959 m/s**. The much larger
  changes occur inside the loop, not because the closing vertex set is missing.

These velocity discontinuities are changes of slope, not discontinuous
teleports in the exported position path. The Studio path remains C0 continuous.
Native interpolation and actual frame rate are not inferred from the samples.

For a controlled mathematical comparison at the same period, nominal amplitude
and 17 angle keys, replacing `sin³` with `sin` reduces maximum angular
interpolation error from 0.887° to 0.339°, and maximum angular speed jump from
86.984°/s to 31.318°/s. Reducing amplitude further reduces this angular motion.
That supports the consumer's simpler-sine direction, but does not guarantee
the final native appearance or change the interpolation contract.

![Motion law and exact source/export segment velocities](../../output/wings-0220-r6-audit/motion.png)

Standalone plot files are `output/wings-0220-r6-audit/motion.png` and `motion.svg`.
The lower plot uses the actual left wing tip; its vertical velocity differs from
the full vector magnitudes reported above.

## Limits and attachment distinction

Increasing source keys blindly is not viable for this asset. Offline size
experiments using the same geometry, PNG, four layers and a simple ±18° sine
produced 5102058 bytes at 17 keys, 6729792 at 25, 7543798 at 29, and 10391969 at
43. The document limit is **6291456 bytes (6 MiB)**. These hypothetical documents
were constructed only in memory and never saved. The native sample budget is a
separate limit; adding source knots would still produce 85 exported poses here.

The source keeps 78 vertices fixed in each main wing, with 46/45 fixed positions
in the corresponding back membranes. Layer position/orientation/scale are
constant. This establishes pinned roots in **effect-local coordinates**. It
does not attach them to a moving torso bone. `OrientWithObject` is an integration
hint for orientation; the consumer still chooses and qualifies the attachment
binding and offset in NWN. The supplied running screenshot is relevant to that
separate problem and cannot measure sampling or frame rate.

Opening r6 deliberately ends at alpha 0 while DUR starts at alpha 1. The exact
phase geometry matches, but the alpha boundary differs from r5. This earlier
diagnostic edit must not be confused with the internal loop motion examined here.

## Evidence and reproduction

- `output/wings-0220-r6-audit/exact-export-audit.json`: exact CLI/source/binary
  checks and unchanged input hashes.
- `output/wings-0220-r6-audit/motion.json`: per-layer metrics, source times,
  sample times, measured tip trajectories and hypothetical source sizes.
- `output/wings-0220-r6-audit/typecheck.log`: passed.
- `scripts/audit-wings-0220.ts`: invoke with source directory `.../studio/v4`,
  revision `6`, and output directory `output/wings-0220-r6-audit`.
- `scripts/audit-wings-r6-motion.ts`: reproduce source formula and motion metrics.
- `scripts/plot-wings-r6-motion.py`: render PNG/SVG from the saved measurements.

The reviewed user screenshots have SHA256
`7bd49f77ca8577fa3e0d4e95c76c085ec6cf4232a72658a366131a843fa0e393`
and `a9877bdd762ea0ed40983c0de1df6fa2e0c6e10dc12475c6becfdf8590ee7bbb`.
No native application was launched or controlled. Native attachment, real frame
timing and the earlier overlap report remain with the consumer's test workflow.
