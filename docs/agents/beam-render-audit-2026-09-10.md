# Beam: multiple emitters and particle alpha — bounded offline audit

The inspected retail renderer does **not** apply a high alpha-discard threshold
to Normal Fountain particles. Normal and Lighten select `NO_DISCARD=1`.
Punch-Through selects discard, with the ordinary uniform threshold **0.2**.
Multiple emitter target callbacks are accumulated, not overwritten by name.
These findings narrow the investigation; they do not establish why consumer V14
was invisible or qualify the mixed profile in Windows NWN.

## Exact evidence and limits

The primary executable was read, never launched:
`C:/Program Files (x86)/Steam/steamapps/common/Neverwinter Nights/bin/linux-x86/nwmain-linux`,
SHA-256 `6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`.
This is the symbol-bearing **retail Linux renderer**, not the Toolset C export
and not proof that the consumer's Windows executable behaves identically.

Reproducible, bounded extractors in this repository:
`scripts/audit-multi-emitter-callbacks.py` and
`scripts/audit-particle-discard.py`. They assert that input hash and write function
addresses, sizes, disassembly hashes and a manifest under
`output/beam-composite-0281/multi-emitter-audit/` and `alpha-discard-audit/`.
ELF NOBITS sections are excluded from byte reads. The alpha manifest also pins
the earlier extracted shaders and render disassembly in
`C:/Projects/New Folder/beam-appearance-audit-2026-09-10/`; its original
`shader-manifest.json` retains KEY/BIF identities. No native process, consumer
module or accepted resource was changed.

## Alpha-discard trace

1. `PartEmitter::Initialize` gives Normal blend state 0 at `0x4aab76`;
   the Punch-Through string comparison at `0x4aad70–0x4aad91` gives state 1,
   and the remaining Lighten path state 2.
2. `RenderEmitter` tests state 1 at `0x4ad88f`. Normal/Lighten disable renderer
   state 1 at `0x4ad8a3–0x4ad8a8`, enable blending and disable depth writes.
   Punch-Through disables blending and enables state 1/depth writes at
   `0x4aef98–0x4aefae`. Normal uses SRC_ALPHA/ONE_MINUS_SRC_ALPHA;
   Lighten uses SRC_ALPHA/ONE, as pinned in the earlier appearance audit.
3. More directly, Normal/Lighten load `vsparticle/fsparticle` with boolean true
   at `0x4af385`; Punch-Through passes false at `0x4aefed`.
   `GetCustomShaderProgram` carries it through `0x4d3c70–0x4d3cd7` to
   `LoadShader`, which forwards it to `LoadAndCompileSingleShader` at
   `0x4d377c–0x4d37b1`.
4. The compiler saves the boolean at `0x4d34cd`, reads it at `0x4d35ba`,
   and passes it to the preamble's `#define NO_DISCARD %d` at `0x4d35f1`.
   The full preamble at `0x12f3fd0` is included with its hash in the audit.
5. Extracted `fsparticle` lines 38–40 multiply `VertexColor * textureRGBA`
   and call `AlphaDiscard(FragmentColor.a)`. Extracted `inc_common` lines
   367–383 compile out the comparison when `NO_DISCARD == 1`. Otherwise the
   discard rule is `threshold >= 0 && alpha <= threshold`.
6. The fallback uniform also resolves: `ConnectShaderData` associates
   `fAlphaDiscardValue` with program offset `+0xac4` at
   `0x4cef94–0x4cefaf`. `SetUniforms` at `0x4cd9f8–0x4cda1d` supplies
   **-1** when renderer state 1 is disabled and **0.2** when enabled.
   Enable/Disable jump-table entry 1 increments the matching dirty field
   `+0x3c`, which `SetUniforms` checks. There is no high Normal cutoff here.

Texture alpha multiplied by particle/vertex alpha can still make a sprite
faint; reducing sprite size changes screen coverage. Soft particles, blending,
texture appearance and attachment can also matter. This audit does not isolate
one as the cause of V14. Do not change shaders/TXI to compensate for the
disproved high-cutoff hypothesis.

## Multiple emitter target callbacks

| Function | Evidence | Consequence |
| --- | --- | --- |
| `Gob::RegisterCallBack`, `0x497db0` | Allocates a callback and appends at `0x497deb–0x497e0a` to Gob array `+0x460`, count `+0x468` | Registration does not replace the previous callback by event name. |
| `CallBack` constructor, `0x497d60` | Function at `+0x20`, caller data at `+0x28` | Each callback retains its emitter data. |
| `PartEmitter::Initialize`, `0x4aaaa0` | Registration `0x4aae00–0x4aae1e` passes this emitter as caller data | Emitters do not share one implicit target callback state. Lightning initialization also registers its own callback. |
| `Gob::DoEvent`, `0x49d760` | Iterates matching callbacks at `0x49d809–0x49d852`; null event data uses each callback's `+0x28` | The callback list is dispatched, not only its first match. |
| `SetEmitterTarget`, `0x4aa7d0` | `rdx` becomes this emitter; searches its own child array/count `+0x38/+0x40` and stores reference Gob at emitter `+0x1c8` (`0x4aa81a–0x4aa869`) | First reference means first child of that emitter, not one global reference for the entire MDL. |
| `Gob::ReattachReference`, `0x43fc50` | Traverses reattachable references and child parts (`0x43fd07–0x43fd41`, `0x43fe58–0x43fe9f`) | Reattachment is not restricted to the first emitter. |

`ReattachReference` also updates the main Gob quaternion at
`0x43fe1f–0x43fe4a`. This is shared state worth checking in a controlled native
comparison, not an established V14 defect. The inspected V14 source uses unique
emitter/target node pairs, one cast01 with separate birthrate tracks, per-layer
particle lifetime and the maximum last-death removal time.

## Next decision

Keep the exact consumer-visible V13 as the control. To test the new composition,
import/fork it explicitly and add **one static strand only**, preserving the
original stream appearance, texture, size, alpha, binding and timing. Test alpha,
size or a second stream in separate one-variable comparisons. The consumer owns
Windows playback, body-node checks and final appearance approval.

Studio 0.28.1 supports that same-MDL composition through public operations;
see [the contract](beam-composite.md) and [acceptance](beam-composite-acceptance-2026-09-10.md).
Victim-to-caster-hand flow with the root on that hand remains unsupported;
see [the separate attachment decision](beam-hand-return-decision-2026-09-10.md).
