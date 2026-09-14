# TLC-WYROK-STUDIO-12 — invisible native r4 investigation

2026-09-07. Requester: `01a070e3-5df3-7913-943f-854ac8ea98ee`.

Status: this diagnostic stage is closed at the requester's instruction; the cause of the native failure is still unresolved. The runner's native visibility result remains FAIL. No exporter change or replacement release is justified by the findings below. Studio remains 0.9.0. No live process or installed game resource was accessed by this task.

## Exact candidate

- Project `7e5e9347-7a57-4e70-ba7a-b77e0ec70af3`, revision 4, duration 3 seconds, 32 enabled layers: 12 meshes, 10 emitters, 10 trails. Current identity was read through the public `nwn-vfx projects inspect` command.
- Candidate job `d4db561a-acfe-4c88-b29e-0193fa434440`.
- Export directory: `C:\Projects\the last city\assets\vfx\wyrok\export\r4-timing-3s`.
- ASCII model `vfxf9e25b16d066.mdl`: 26,330,902 bytes, SHA-256 `61780c85a31c09e3e2e19f82411f6d2db4e70b359ec5a4ec1bc1f7a7c0ec68f0`.
- Resource HAK SHA-256 reported by the requester: `bccdc40adea6e317da6ef7fdf2d7f6ba8ed2a22880780d5de01b9f9c32cbdba2`. Local audit independently compared every archived HAK resource with its loose export and validation hash.

The requesting runner reported an owned 30-second NWN capture with no visible effect despite repeated READY/FIRE/END messages, after reviewing all 60 half-second samples and four full frames. Its independent temporal pixel diagnostic excludes a completely frozen capture. Its installed-resource audit verifies archived identities but explicitly does not claim to inspect engine-loaded resource identity. Those are runner observations, not native actions performed by the Studio task.

## Independent format checks

The complete r4 model was compiled and decompiled using the existing isolated NWN Explorer tool. Compiler SHA-256: `5b8b49441cbc8121ff8f38ec48651e2388d54842ccc12128cf2b59f8b735739d`. Its launcher disables game discovery; the format implementation is unchanged. Source provenance is recorded in the [Studio-10 report](tlc-wyrok-studio-10.md).

Both compilation modes passed: normal defaults and `-n` (retain empty faces). Neither reported an error or warning. Their decompiled ASCII outputs are identical, SHA-256 `ea34463a1e0c3eaa6913fd04200241743bc82331f49081ad58aa968f654825f8`. The binary files differ in bytes; no binary determinism claim is made.

An independent table reader checked every animated sample after vertex-index remapping:

| Check | Result |
| --- | --- |
| Trail nodes | All 20 body/head nodes retained |
| Frame sets per node | 181 |
| Sample period | 1/60 s in source; 0.01666667 in decompiler text |
| Effect length | 3 s |
| Vertex samples checked | 514,040 |
| UV samples checked | 514,040 |
| Maximum coordinate error | 2.8387e-7 m |
| Maximum UV error | 7.9488e-8 |
| Base vertices, faces, independent UV indices | Retained |

The actual r4 source therefore has 514,040 samples per channel, not the 684,440 cost from the earlier four-second work. Counts remain complete for the current duration.

The animation blocks include the required base `verts`, `tverts` and `faces`, followed by complete `animverts` and `animtverts`. UV rows have three components with a zero third component. The author's [animmesh tutorial](https://forums.beamdog.com/discussion/69250/how-to-manually-create-animmeshes-a-tutorial) describes the full-frame sample layout and required repeated base geometry; its illustrated missing-geometry failure does not match this candidate. This community tool/author evidence is not a test of the installed retail runtime parser.

## Exporter and resource comparison

Rebuilding the archived documents in memory with the current exporter gives the exact original ASCII bytes:

| Source | Original exporter | Model SHA-256 | Current rebuild |
| --- | --- | --- | --- |
| r8, 4 s, 22 mesh + 10 emitter | 0.4.0 | `e15d246123f6b85b58cdc45147b1cee6f8768de31e4156a507004a2781e2c09f` | Byte-exact |
| current r4, 3 s, 12 mesh + 10 emitter + 10 trail | 0.9.0 | `61780c85a31c09e3e2e19f82411f6d2db4e70b359ec5a4ec1bc1f7a7c0ec68f0` | Byte-exact |

No existing r8 material, hierarchy or controller changed during the current rebuild. Both models have 65 geometry nodes, so exceeding 64 nodes is not a newly introduced difference. All 19 resources inside the archived r4 HAK match their loose files and recorded hashes. All nine TGA dependencies decode successfully and contain nonzero alpha pixels. Source documents, exports and project revisions were preserved.

## Location mapping hypothesis

The hypothesis that `ApplyEffectAtLocation` necessarily requires a nonempty `Imp_Impact_Node` is not supported by the checked source artifacts:

- The archived stock table used by this consumer has row 22 `VFX_FNF_FIREBALL` with `Imp_Impact_Node=****` and `Imp_Root_M_Node=vff_explfire`. Rows 23 and 28 have the same root-medium pattern for their models.
- Central row-22 proof source calls `ApplyEffectAtLocation(DURATION_TYPE_INSTANT, EffectVisualEffect(VFX_FNF_FIREBALL), ...)`: `C:\Projects\aurora-web\backend\docs\aurora-reverse\evidence\vfx-nwn-web-row22\nwn\scripts\vfx22shot.nss:18`, with its invocation recorded in the adjacent `row22-runner-preflight.json`.
- The consumer's historical r8 script also used `ApplyEffectAtLocation`; it was not an object-targeted comparison.
- Row 10101 contains actual tab delimiters (27 bytes of value 0x09), not literal backslash-t sequences.
- The central readiness document explicitly leaves the exact retail root-size fallback unresolved: `C:\Projects\aurora-web\backend\docs\aurora-reverse\vfx-aurora-first-implementation-readiness-r90.md:4108`.

These observations contradict treating the empty impact slot alone as the established cause. They do not independently prove what resource the current client has loaded. A mapping change should be a controlled runner experiment, not an assumed exporter repair.

## Smallest discriminating native trial — plan only

The requesting runner owns this future trial. Nothing below authorizes changing an open session, and none of it was executed by the Studio task.

1. Prepare one separately identified diagnostic module through the existing qualified workflow after the runner finishes its currently owned session. Retain the exact r4 resource HAK, MDL, three-second source and registration row; change only the diagnostic script in that new module. Record all resulting identities before opening. No new Paint/Save is required solely to repeat previously established evidence; follow the actual module-change and saved-state needs of this new diagnostic run.
2. At runtime, log `Get2DAString` results for row 10101: `Label`, `Type_FD`, `Imp_HeadCon_Node`, `Imp_Impact_Node`, all four `Imp_Root_*_Node`, `LowQuality` and `LowViolence`. Log the stock control's row 22 as well, together with module, Area, actual target location and intended resref. This observes the script VM's selected 2DA; it still does **not** prove the client's loaded MDL identity. Do not present it as memory-level model inspection.
3. Use the same supported `ApplyEffectAtLocation` path and the same visible location for both effects. Fire stock `VFX_FNF_FIREBALL` once, allow it to finish, then start the exact r4 candidate and repeat r4 every 10 seconds. Keep distinct control/candidate log markers and preserve the candidate's three-second duration. For example: stock at 2 s, r4 at 12, 22 and 32 s; do not overlap them.
4. Record one owned-window capture covering the control and at least two complete r4 cycles. Frame the full expected effect volume, including the ground and space above the guard. Bind process identity, monitor, MOD/HAK/source hashes, script, log intervals and footage. A 40–45 s recording can cover the example sequence if capture starts before the control. Review onset, peak and end of each cycle, rather than inferring visibility from FIRE/END log messages.
5. Decide from that result: wrong runtime 2DA values point to runtime resolution; an invisible stock control makes this a scene/application/capture problem before attributing failure to custom geometry; a visible stock control plus correct table values and invisible r4 narrows the problem to the custom model's loading/playback/rendering path. None of these branches alone proves a particular animmesh parser bug.

Only if the final branch remains should a second experiment isolate trails: create a clearly labelled diagnostic fork through the public Studio CLI, disable trail layers in that fork, keep all other layers and the three-second timeline unchanged, and build a separate candidate through `candidate build`. Compare it in the same qualified runner setup. This diagnostic fork would not replace or satisfy the artistic contract for the original r4. No such fork or candidate was created in this stage.

## Evidence and remaining work

All diagnostics are under `C:\Projects\nwn-vfx\output\studio-12`:

- `r4-independent-compile.log`, `r4-independent-decompile.log` and default-mode equivalents.
- `roundtrip-audit.json`, `default-roundtrip-audit.json`, `audit-roundtrip.ts`.
- `candidate-audit.json`, `audit-candidate.ts`, `project-inspect.json`.
- Independently compiled/decompiled diagnostic models; they are not Studio release candidates or authorized live resource replacements.

The remaining discrimination requires the owned runner: inspect the actual loaded-resource/animation behavior or run a controlled baseline comparison while preserving exact module, registry and source identities. The Studio exporter, service installation, human browser state, candidate source and both live native processes remain unchanged. A generic Studio fix and regression will be added if a concrete exporter defect is reproduced; no speculative patch or falsely qualified replacement candidate has been produced.
