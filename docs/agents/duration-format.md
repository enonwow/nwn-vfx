# Duration format findings — 2026-09-09

This is an offline format investigation, not a game test. No Toolset, NWN,
module installation or consumer HAK mutation was performed.

The consumer supplied a read-only extraction:
`C:/Projects/the last city/docs/vfx/tlc-style-baseline-2026-09-06/kopia/`.
`used-vfx-resources.json` records resource providers; extracted names do not
establish that an asset is vanilla. For example `vdr_spellres_w.mdl` is selected
from `lc_vfx.hak`, SHA-256
`14c211eb526690daac6eb45224995276533b843ac93b2f255d8fdec5d79eb84e`.

Observed ASCII model structure:

- `vdr_spellres_w.mdl`: classification EFFECT; animations `impact` (0.3 s),
  `duration` (1.33333 s), `cessation` (1 s).
- `vfx_dr_menace1.mdl`: impact (0.3 s), duration (1.66667 s), cessation (2 s).
- `vdr_shieldblk.mdl`, SHA-256
  `6a49700d92a99f04f19e3b63297d652a18c26e855d5991f1139369665f20d057`:
  a real trimesh `Cylinder02`, base alpha 0; its one-second `duration`
  animation has alpha keys **1 at time 0 and 1 at time 1**. It does not fade
  out each cycle. This supports preserving authored loop alpha in the exporter.

The extracted `visualeffects-first-declared.2da` has real Type_FD D rows:
277/468 reference `vdr_bardsong` through `Imp_HeadCon_Node`; 10110 references
`vfx_dr_menace1` through `Imp_HeadCon_Node`; 10112 references `vfx_dr_immblze`
through `Imp_Root_M_Node`. Duration is a model animation convention; it is not
an instruction to invent NWN2-style `Dur_*` columns in an NWN1 table.

Independent public primary material agrees:

- The [Sinfar asset source at a fixed commit](https://git.sinfar.net/core/sinfar-haks/raw/commit/b5ee1b75586340698807cb8d498022499c5b5a78/hak/sf_effects/vdr_biglbp.mdl)
  contains a five-second `duration` animation between impact and cessation
  phases, with matching light controller endpoints.
- Jasperre's [NWN1 visualeffects.2da investigation](https://nwn.wiki/spaces/NWN1/pages/38175069/visualeffects.2da)
  distinguishes F from D and describes the `Imp_*` model binding even for
  sustained effects. Its cessation-column notes remain qualified; Studio
  therefore does not promise automatic binding of a separate closing model.

These references establish animation spelling, ASCII sections, controller
placement and table conventions. They **do not** prove the newly generated
single-animation DUR animmesh plays correctly in a retail engine. The observed
reference models contain multiple phases; Studio deliberately exports each
requested phase as its own model, with `transtime 0` and no added intro/closing
motion. The new duration-only model, sampled animmesh, authored FnF alpha,
removal behavior and inter-model timing require the consumer's qualified NWN
test. No source timing or accepted geometry was changed to imitate a reference.
