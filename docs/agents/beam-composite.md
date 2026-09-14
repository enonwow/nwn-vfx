# One static strand with finite beam particles — Studio 0.28.1

The `finite-flow-static-strand-v1` composition adds **one enabled static
Lightning/Linked beam layer** to an existing finite Fountain/P2P project. Both
live in the **same main MDL and EffectBeam instance**, each with its own
reattachable `fx_ref` reference. Optional source/target FnF layers still export
as separate models. This is an experimental resource profile, not native proof.

Use document **21**, portable ZIP **16**, minimum Studio **0.28.1**, and
`X-NWN-VFX-Document-Schema: 21`. Older clients fail with
`CLIENT_UPGRADE_REQUIRED` and their mutations roll back. Historical sources,
standalone static/flow resources and saved artifacts are unchanged.

## Author through UI, CLI or WebMCP

In a finite flow project choose **Dodaj statyczną nitkę**. The initial strand has
width 0.008 m (native full width 0.016 m), alpha 0.2, four segments/five points,
zero noise and `textureMapping:{axis:"v",fit:"source"}`. These are editable
starting values, not an artistically approved effect.

CLI and WebMCP use the existing `changes.preview` and `changes.apply` with
`layer.add/set/remove`. No extra credential, direct database access or resource
patching is required. The static layer must share `source`, `target` and
`flow.direction` with all active bound emitters; its `flow.speed` must be zero.
Submit changes to shared ends/direction **atomically for every affected layer**.
The UI does this from the emitter binding inspector and shows strand endpoints
as read-only. Role, pulse, material, width and alpha remain per-layer values.

Use [the executable example](examples/beam-composite/run.mjs) with an explicit
Studio CLI and config path. It imports its own finite source, previews/applies
the extra strand, then requests a binary candidate and waits for its result.
It never modifies an existing project. `source.json` and `add-strand.json`
show the complete public inputs. From another repository, use absolute paths:

```powershell
node C:/Projects/nwn-vfx/docs/agents/examples/beam-composite/run.mjs `
  --cli C:/Projects/nwn-vfx/output/beam-composite-0281/lab/runtime-2/bin/nwn-vfx.mjs `
  --config C:/Projects/nwn-vfx/output/beam-composite-0281/lab/tlc-agent.config.json
```

The WebMCP equivalents are `studio.changes.preview/apply` and
`studio.candidate.build`, with `input`, exact saved revision and stable mutation
keys. Read `studio.connection.inspect` and `studio.view.inspect` first. Schema21
is already declared by the shipped CLI and adapter. Both discovery profiles
retain their existing names. Human locks, AI pause, unsaved drafts, revision
conflicts, retry identity and parameter undo remain enforced. Structural undo
is still unsupported; remove an added layer explicitly through `layer.remove`.

Ordinary saved-revision operations may commit while a human has a separate
unsaved text draft. They preserve that draft and expose the newer remote
revision; they do not overwrite or merge it. `view.open` refuses the draft.
Workflow mutations that explicitly require a clean view refuse it before write.
Inspect both saved state and draft; do not assume all writes are blocked by drafts.

## Native lifetime and resource contract

- Type7 uses **Param1 = main model, Param6 = cast01**, integration schema6.
  Type12 endpoint models retain Param1 = node and Param2 = model.
- `cast01` gates Fountain births only. Each stream retains its authored
  start, pulse envelope and full particle lifetime. The static strand's point
  count and alpha are constant; it has no opening, closing or draining animation.
- Keep this same instance alive through `beam-flow.json.removeNoEarlierThan`,
  then remove the whole effect. The strand remains until that removal. Emergency
  removal may cut off live particles. Do not replace the effect at feed end.
- `beam.json` identifies strand nodes, texture mapping and safe point counts
  (segments + 1: 3/5/9/17/33/65); `beam-flow.json.staticStrands` links it to the
  finite model. Both metadata files bind the exact main source and binary hashes.
  `emitter-emission.json` reads both kinds of emitter; binary validation checks
  Lightning/Linked flags258 separately from Fountain/Normal flags3.
- `nativeMotion` export stays blocked with `BEAM_MOTION_EXPORT_BLOCKED`.
  Null reset removes it; whole-span moving Lightning atlases are not implemented.
- This composition does **not** solve victim → caster-hand flow with the main
  root on that hand. Read the [hand-return decision](beam-hand-return-decision-2026-09-10.md).
  Runtime attachment, combined appearance and timing require the consumer's
  qualified native test. All `nativeVerified` values remain false.

## Compiler boundary correction

Consumer project `50338414-2f51-45a8-b776-11be5243c452@2` failed during binary
roundtrip parsing, not source ASCII. The pinned decompiler wrote animation
length `3.9` and final key `3.9000001`; both represent the same float32.
Only compiled-roundtrip parsing now accepts such an overshoot when
`Math.fround(key) === Math.fround(length)`. Source parsing remains strict;
larger overshoots fail. No keys, duration, source resources, compiler output or
old job records are rewritten. Re-export the same revision with a **new job key**.
