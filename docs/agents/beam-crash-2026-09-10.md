# Lightning point-count crash and Studio 0.26.1

The static beam exporter in 0.25.0/0.26.0 wrote the number of **edges** into
Lightning's `birthrate`, which is the number of **points including endpoints**.
This caused an out-of-bounds point lookup in the consumer's NWN client.
Regenerate earlier beam candidates with new idempotency keys. Historical jobs,
artifacts and source revisions are retained, not overwritten or requalified.

## Exact evidence

Consumer: The Last City - VFX, `tlc-wampir-drain-life@3`, snapshot
`3926a72b74f709a3d21c62e92c669f88ec42cf881b7f862375e415cf60631621`.
Binary job `a698f2b0-0073-4179-a74a-d979bdd48d1e`; model `vd_drain01`.

- Binary MDL SHA256: `74d279598d8114ae92394336b9cd1190fee8c9d04ec15ec9ddce4838c462af0d`.
- Source MDL SHA256: `352b0801311ac8a237901f3d2c8817566a600923ce8b3885f054e76f2bdb9609`.
- Source document SHA256: `9e86b1bc82437df5853bc05880fb54c4bc9efd732235a5804da08796bd336f5a`.
- These exact local artifact hashes match public `jobs.get` metadata.
- Source has `segments:32`; ASCII and binary readback have `birthrate 32`.
- Consumer reports the first ApplyEffect crashes NWN 8193.37-17 x64.
  The saved `nwmain-crash-1789027384.nwcrash.txt` contains an embedded minidump.

The decoded exception is `c0000005`, read address `0x10`. Module base is
`0x7ff638f60000`; fault RVA `0x62535`. Captured registers include
`r8=0`, `r12=16`, `rbx=16`. The exact fault instruction is
`movss xmm10, dword ptr [r8+0x10]`. Immediately before it the client computes
`r12+rbx=32` and loads `r8` from the point-pointer array at that index.
The caller at RVA `0x658dc` invokes the midpoint function with center and
distance equal to truncated half the point count. Thus a 32-point list with
valid indices 0..31 is read at index 32. The same initial lookup happens
before the radius check; setting `lightningRadius:0` cannot repair it.

The current executable was only read as a PE file, never launched or attached:
SHA256 `3b7cb1252e0edb2ce22d7971f333aade027039ae30a45b4bc64732c3e6bec73a`.
Its 64 bytes at the fault match the code bytes captured in the minidump.
The dump does not contain the full heap point list, so its allocation is
inferred from the exact source/controller and native allocation/update code;
the invalid index and null register are directly captured.

Independent primary cross-check: Toolset decompilation
`C:/Projects/New Folder/export/decompiled_all.c`, lines 857595–857661
(allocate birthrate points), 857782–857808 (midpoint call), 855258–855265
(neighbor dereferences before radius check). File SHA256
`36bb8b1031afe2abf23f0e18180a5ad649401d9ea5e078e5170a31a96167c572`.

Raw retail `vdu_beam000` decompiled offline has Lightning counts 5/9/9 and no
animations. `vim_rayfire` has counts 3/65 and an `impact` animation, no `cast01`.
Stock progfx Type7 can still name `cast01`. Missing cast01 does not explain
the captured point dereference; no invented animation is added as a fix.

## Supported correction

| Authored segments (edges) | Native birthrate (points) |
| --- | --- |
| 2 | 3 |
| 4 | 5 |
| 8 | 9 |
| 16 | 17 |
| 32 | 33 |
| 64 | 65 |

Exporter `nwn-ascii-vfx-0.26.1` / `nwn-binary-vfx-0.26.1` adds exactly one
endpoint. The source document, texture, width, color, alpha, noise, reference
hierarchy and animation policy do not change. `beam.json.pointCountContract`
records the mapping. ASCII and direct binary readers independently reject
unsafe counts, even if corrupted source and binary agree with each other.
Regression tests replay every native midpoint index for all supported counts,
including zero radius, and reproduce the old count32/count2 failures.

ASCII-only versus binary-only switching does not remove this source error.
Both new forms are delivered to the consumer for controlled comparison; this
audit does not establish complete renderer parity or guarantee no other crash.
The consumer owns native loading, visibility, attachment and stopping tests.
Studio does not launch NWN/Toolset or modify the consumer's module/HAK.

## Suspended nativeMotion

The 0.26 atlas profile exported **two points**, which has the same out-of-range
lookup. Simply changing it to three points makes Linked repeat the entire
atlas on two edges; this breaks continuous opening/closing over the full beam.
Therefore an enabled `nativeMotion` now causes `BEAM_MOTION_EXPORT_BLOCKED`
and produces no candidate artifacts. Source, original PNG, editing, preview
and portable ZIP remain available. Capability discovery and the editor report
the suspension. For a static diagnostic variant explicitly fork and reset
`nativeMotion:null`; accepted projects are not silently changed.

Whole-beam flow and endpoint particles require a separate profile design.
Confirmed: Type7 reattaches references; Linked maps an atlas cell per edge;
FPS advances repeating frames with native frame-time rounding. Unproven:
an alternate update/render path that both tracks arbitrary endpoints and
supports one continuous full-length UV interval. Do not present an animated
mesh, a different updater, reference hierarchy or NWScript scale workaround
as supported until its native controller behavior is established.

Primary format references:
[Microsoft MINIDUMP_EXCEPTION_STREAM](https://learn.microsoft.com/en-us/windows/win32/api/minidumpapiset/ns-minidumpapiset-minidump_exception_stream),
[pinned compiler node structures](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NwnLib/NwnMdlNodes.h),
[BeamDog progfx explanation](https://gist.github.com/mtijanic/97f309b8d9262f0cf4f7dfba6618ea6a).
