# Independent beam strands — Studio 0.28.2

The experimental `finite-flow-static-strands-v2` profile supports **up to four
enabled Lightning/Linked beam layers with finite Fountain/P2P in one main MDL**.
Each strand has its own emitter node, reattachable target reference, width,
alpha, color, lightning radius/delay/scale, segments, texture and blend.
Source/target endpoints and direction remain shared. This implements separate
strands; it does **not** implement phase-controlled weaving or a native helix.

New multi-strand documents or use of `texture:"beam-soft"` require document
**22**, portable ZIP **17**, minimum Studio **0.28.2**, header
`X-NWN-VFX-Document-Schema:22`. The new CLI/UI/WebMCP send this header. Old
clients fail with `CLIENT_UPGRADE_REQUIRED`, without writing. Single legacy
strands retain schema21/v1 and historical export resources; old revisions/jobs
remain readable. Removing the feature does not downgrade a saved schema.

## Public authoring

Use the existing `projects.fork`, `changes.preview/apply` and
`candidate.build`; WebMCP names are `studio.projects.fork`,
`studio.changes.preview/apply`, `studio.candidate.build`. Each durable write
requires exact expected revision and a stable idempotency key. The UI's
**Dodaj statyczną nitkę** adds beam-soft and stops at four active mixed strands;
eight total beam layers including disabled ones remain the global limit.

Ordinary `layer.add/set/remove` expose the fields. Update source, target or
direction atomically across all active bound emitters and strands. The UI does
this from the stream binding inspector. A lock on any affected field blocks
the whole operation. AI pause, rights, draft preservation, revision conflict,
retry and parameter undo retain the [existing contract](beam-composite.md).
Structural undo remains explicit layer removal.

The [executable public example](examples/beam-multistrand/run.mjs) reads the
specified source revision, **forks it**, replaces beam layers only in that fork,
adds four separate strands and builds a binary candidate. Fountain and assets
are compared exactly before/after; the original revision is reread unchanged.
Example settings are a technical starting point, not an approved appearance.

```powershell
node C:/Projects/nwn-vfx/docs/agents/examples/beam-multistrand/run.mjs `
  --cli C:/Projects/nwn-vfx/output/beam-composite-0281/lab/runtime-0282/bin/nwn-vfx.mjs `
  --config C:/Projects/nwn-vfx/output/beam-composite-0281/lab/tlc-agent.config.json `
  --source-project 0bb65bb5-d27d-4197-8728-5f44561cc83a `
  --source-revision 2 --count 4 --key my-explicit-four-strand-variant
```

This works from another repository; paths are explicit. `--count 3` provides
the three-strand comparison. Retain the same key only when retrying the same
logical operation. Public example input for each new strand includes:

```json
{
  "type":"layer.add",
  "layer":{
    "id":"independent-strand-1","name":"Osobna nitka 1","type":"beam","enabled":true,
    "color":"#c72b40","alpha":0.3,"width":0.006,"texture":"beam-soft","blend":"additive",
    "source":[0,0,1.2],"target":[0,3,1.2],"flow":{"direction":"source-to-target","speed":0},
    "radius":0.02,"delay":0.22,"lightningScale":0.02,"segments":8,"seed":42,
    "textureMapping":{"axis":"v","fit":"source"}
  }
}
```

Copy endpoints/direction from the selected source's binding, rather than assuming
the coordinates in this example apply to another project.

## Continuous soft strand texture

`beam-soft` is a deterministic builtin, available through the same `texture`
field and UI **Miękka ciągła nitka**. It requires no uploaded PNG or asset slot.
It is straight RGBA with white RGB and alpha `(1-u²)^3` across normalized
horizontal coordinates `u ∈ [-1,1]`. Every vertical row is byte-identical; side
edges have zero alpha. Width controls the band, color tints it, alpha scales it.
Existing spark/smoke/glow generators and imported PNG bytes are unchanged.

Use full-source **V** mapping or omit explicit mapping. U rotation and alpha-bounds
cropping are rejected for this builtin so the repeat cannot silently become
a sequence of spots. Selecting it in the UI also selects V/full-source mapping
in the same operation. Other authored PNGs retain their existing mapping options.

Linked still repeats the image on every segment. Identical endpoint rows remove
texture discontinuities at repeats; this is not a guarantee of seamless native
geometry joints, camera behavior, lighting or overlap. Source/TGA pixel checks
and binary readback do not constitute in-game visual approval.

## Native contract and the weaving boundary

- One Fountain pool remains in the same instance through feed and drain.
  `cast01` gates Fountain births; static strand alpha/point count are constant.
  Keep the whole effect through `beam-flow.json.removeNoEarlierThan`, then remove
  that same instance. The strands remain until removal.
- `segments+1` remains the native point count: **3/5/9/17/33/65**. Each strand's
  points, reference, modes, controller values and flags258 are independently
  checked; Fountain retains flags3 and its original finite controller tracks.
- `beam-flow.json.staticStrands` and `beam.json.composite` identify profile v2
  for multiple strands. Nodes are `strand_0...3` and `strand_target_0...3`.
  The main source/binary hashes bind both metadata files.
- `seed` affects authoring preview only. It is not exported as native random
  state, a phase offset or a guarantee of native statistical independence.
  Separate nodes and differing delay/radius/scale are not coordinated phases.
- Existing Lightning/Linked periodically regenerates displacement. Moving
  endpoints can move/rotate the current shape between updates; the random shape
  itself is not a supported smooth sinusoid or authored above/below trajectory.
  Do not label preview's smooth noise as native smooth motion.
- The current P2P profile has zero Bezier handles and travels along its endpoints
  with age-based smoothstep. Existing animated meshes/trails do not implement
  stretching a phase-controlled helix between two moving body attachments.
  No supported profile supplies phase-shifted strands alternately wrapping around
  essence on that dynamic axis. This is a boundary of the delivered profiles,
  not a claim that all possible NWN mechanisms have been exhausted.
- `nativeMotion` export stays blocked. No atlas motion, new helical preview,
  new native phase controller or native installation is added. Hand-return
  remains subject to the [existing limitation](beam-hand-return-decision-2026-09-10.md).

The bounded offline check uses retail Linux ELF SHA-256
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`.
`LightningEmitter::Update` at `0x4b29b0` gates regeneration at `0x4b2cf4` and
calls `RecursiveFractal` at `0x4b2eb7`; its interpolation branch at `0x4b2c77`
is for render mode6, while Linked is mode3. Existing callback evidence shows
separate per-emitter target references. `scripts/audit-lightning-weave.py`
records the exact function bytes/disassembly hashes under
`output/beam-multistrand-0282/lightning-audit/`. No native executable was run.
Windows combined appearance, moving attachments and final acceptance belong
to the consumer task. Studio still reports `nativeVerified:false`.
