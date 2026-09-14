# Studio 0.21.1 — emission audit and controlled export

Implemented and installed on 2026-09-08. Service, global CLI and personal skill
are 0.21.1. Package: `output/releases/nwn-vfx-studio-0.21.1.tgz`, 2,430,112 bytes,
SHA-256 `ce47a0103a2e1f49566fd5b1cbe11675931911311495cedeb496251c5ad355c6`.
Instance/workspace identities and all 70 pre-install project heads/hashes were
preserved (`output/releases/0.21.1/installed-preservation.json`). Old tabs 6/8
were left alone; the live test used a separate hidden tab 10.

## Diagnosis and limits

The five consumer exports departure r8, arrival r3, wake r5, wake B r3 and
wake C r3 have intact resources and exact HAK payloads. A direct binary reader
confirms their detonate tables, base/animated birthrate and emitter flags match
the source ASCII. Their minimum event gaps are respectively 2, 2, 4, 3 and 3 ms.
The existing validator checked gate values only at exact event timestamps.
Before/after-frame sampling experiments expose missing and foreign bursts.
For departure r8, one scenario misses 19 of its 24 own bursts; another emits
74 particles at foreign events. These are sensitivity experiments, not NWN
observations and not a proof that this alone caused total native invisibility.

Independent retail resources supplied by the consumer: `vim_magblue` SHA-256
`9da0d117618d28d5097050bce05bef82e7e59f02f436c48754145325372c8bff`
has constant Explosion birthrates 70/30 and impact/detonate. `vim_exp2flame`
SHA-256 `f1e4dc4f4745df62d24f243a437b66f4d5f37698b77af5c3302e880fcdb60b58`
uses a 4×4 atlas with frames 0–15. A separately preserved vanilla `vff_explfire`
has base-zero Explosion emitters with nonzero constant animation controllers:
base birthrate zero alone is not a demonstrated format error.

The consumer's qualified v3 negative MP4 was hash-verified read-only:
`80bcb909f2da6c6b56a122e190b9e00c97a7832b710df73a0d337f31e97b6852`,
5,504,625 bytes. The later v4 capture belongs to a different runtime module
according to the consumer, so it supplies no A/B/C/D conclusion for smoke.
This task did not launch/control NWN/Toolset or modify a consumer MOD/HAK/2DA.
Raw audit: `output/smoke-emission-audit/audit.json`; reproducible read-only audit:
`scripts/audit-smoke-emission.ts`.

## Bounded correction

One common Explosion start now produces constant base and animated count,
with exactly one detonate at the unchanged authored time. This eliminates
count sensitivity to controller sampling for that case. Distinct burst times
keep their existing gates and receive an explicit warning; their frame isolation
is not claimed. Fountain, textures, atlas fields, physics, source revisions and
browser preview are unchanged. Native visibility remains unqualified.

`emitter-emission.json` accompanies each candidate. Binary candidates include
a direct event/controller/flag readback independent of the compiler's text
decompiler. The public operation names and permissions are unchanged.
See [the agent contract](../../agents/emitter-emission.md).

## Verification and handoff

- Production build/typecheck passed: `output/smoke-emission-audit/build-final.log`.
- Full regression: 263/263 passed, no skips; `full-tests-final.log` in that directory.
  Tests cover single bursts at zero/delayed starts, frame sensitivity, unchanged
  source, malformed binary offsets, altered event names/times/counts/flags,
  shared CLI/service/WebMCP permissions, pause, history, conflicts and downloads.
  The historical orientation test restores the intentional birthrate correction
  before its old byte-hash comparison; all unrelated historical bytes still match.
- Installed global CLI, executed from The Last City cwd, produced six controlled
  candidates (three before, three after) from identical r2 documents/snapshots.
  `controlled-comparison.json` proves the only source MDL changes are birthrate
  and explicit model identities; texture dependencies are byte-identical.
- Real host WebMCP: job `310ed59f-bcbd-4b78-a8f8-e6d08344d77b`, `smweb_probe`.
  Set preview time; preserved an unsaved draft and view revision through export;
  returned the same job on retry; refused stale view and foreign-project access;
  retrieved all 14 artifacts via chunk reads with size/SHA verification.
  Test draft cleared and grant revoked. `real-host-webmcp.json` records evidence.

| Control | Own source r2 | 0.21.0 model | 0.21.1 model | Particles |
|---|---|---|---|---:|
| Full cloud, starts explicitly aligned to zero | studio-smoke-single-0211 | smold_smoke | smnew_smoke | 90 |
| Bright static glow | studio-emission-probe-0211 | smold_probe | smnew_probe | 70 |
| One stationary original atlas particle | studio-emission-atlas-0211 | smold_atlas | smnew_atlas | 1 |

Files are under `output/releases/0.21.1/{before,after}/{smoke,probe,atlas}`.
Each directory contains the exact model, resource HAK, textures, source document,
ASCII source, compiled readback, validation, public job manifest and handoff.
No accepted source or old artifact was replaced. The consumer must test these
exact resource hashes in its qualified workflow before any native success claim.
