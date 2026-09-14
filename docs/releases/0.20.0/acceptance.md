# Studio 0.20.0 — emitter PNG atlas acceptance

Implemented and installed on 2026-09-08. Service and global CLI report 0.20.0;
personal and packaged nwn-vfx skills match. API 0.1.0; documents 1–12, ZIP v1–v7,
48 WebMCP tools. Full authoring contract: ../../agents/emitter-flipbook.md.

## Scope and behavior

Optional atomic emitter.flipbook uses existing custom PNG and shared operations.
Top-left row-major source, inclusive frame range, repeating integer FPS from each
particle birth. UI preserves unfinished fields; shader adds per-particle cell UV.
ASCII writes native grid/controllers; binary directly reads grid, loop, flags and
controller IDs 128/132/136. Original texture resources remain byte-exact. Schema12
and ZIPv7 promotion is explicit; old clients fail before atlas reads/writes.

## Evidence

- `output/flipbook-final-build.log`: production build and typecheck passed.
- `output/flipbook-acceptance.log`: 4/4 tests passed. Domain validation, boundaries,
  ranges, locks, old-client fences, undo, pause, author/time, portable snapshot,
  original RGBA, ASCII and actual binary readback; corrupted grid rejected.
- `output/playwright/flipbook-acceptance/acceptance.json`: real production PNGs
  at .25, .499999, .5, .75, 1, 1.25 s match asymmetric cells and upright markers.
  Five decoded WebM frames match expected cells; Fountain newborn uses own age.
- `output/flipbook-initial-tests.log`: 6/6 prior whole-effect integration and
  WebMCP schema-equivalence/descriptor-budget tests passed.
- `output/flipbook-client-tests.log`: 38/38 CLI, adapter and session tests passed.
- `output/releases/0.20.0/installed-cli.json`: installed global CLI invoked from
  The Last City authored own fixture; old static PNG SHA and all ASCII/TGA/TXI
  resources exactly equal 0.19.0 output. Animated render differs as intended.
- `output/releases/0.20.0/real-host-webmcp.json`: real in-app host, tab8,
  studio-flipbook-0200. 48 tools discovered. Pending invalid UI fields exposed;
  view.open refused DRAFT_CONFLICT. Corrected UI atlas saved r3. Human lock r4
  refused LOCKED; pause r5 refused AI_PAUSED. Agent set FPS12 r6; identical retry
  returned r6 and stale new key refused REVISION_CONFLICT. History identifies the
  limited actor and commit time. Selection/time set through view API. Binary
  candidate and PNG succeeded. Seven artifacts downloaded via artifacts.read,
  every chunk and whole-file SHA verified; document/validation/handoff agree.
  Grant revoked; subsequent connection.inspect returned WEBMCP_NOT_CONNECTED.
- Binary host job: 8cbe308c-2c55-44c5-adbe-0b4147386b45. Render job:
  b52cf640-7718-4e21-89b3-bfaa0d7eaabe. Own fixture ends r6, no locks, AI resumed.
- `output/releases/0.20.0/closure.json`: all 59 earlier project heads/snapshot
  hashes unchanged. Only own atlas fixture was authored. Preinstall queue empty;
  consumer explicitly paused new writes for installation. Existing user tab6
  preserved; fresh tab8 retained as the updated editor.

## Limits

No NWN/Toolset or native integration was performed here. Frame ordering, UV
filtering, spawning and actual playback tempo in retail NWN are still unqualified;
consumer task owns that asymmetric runtime check. Community engine references
inform the preview, not a proof of retail semantics. No randomized/hold-last or
zero-FPS mode; min two frames; 1/2/4/8/16 grid dimensions and integer FPS1–60.
Filtering can sample neighboring cells; author transparent cell borders. WebM30fps
may skip atlas frames above30fps. General particle and lighting approximations
remain. No user artistic assets were imported, recolored or rewritten.

## Package

`output/releases/nwn-vfx-studio-0.20.0.tgz`

SHA-256: 17d99fd21d54598a031b83a51e2961fb1cadd7fe8622beb6dc02c96b3266fe69

Bytes: 2330900

Source file hashes: source-manifest.json. Repository has no base commit; no commit
or external publication was created. Native compiler remains unchanged and pinned.
