# Studio0.30.1 — mesh transparency acceptance

[Contract and limitations](mesh-transparency.md).
Full handoff: `C:/Projects/nwn-vfx/output/playwright/mesh-alpha-0301/handoff.json`.
Isolated service `http://127.0.0.1:14389`, instance
`ec2490aa-c86a-4ab1-8130-ac9ad841ac99`, workspace
`71692ba0-5161-4b05-9a96-67d5d98913e1`.
The original14385 project was neither modified nor restarted.

Consumer supplied exact saved r4/r5/r6 snapshots and PNGs. Their original file
hashes are recorded in `source-inputs.json`. Inspection of r4 and the repaired
frame confirms reduced tusk triangle artifacts. Watertightness alone does not
make additive or translucent rendering equivalent to an opaque volume.

| r4 normal alpha0.6 test | Before | After |
| --- | --- | --- |
| Reversed faces+UV faces | 15100 pixels differ, max channel delta101 | 0 differing pixels |
| Deterministic shuffled faces+UV faces | 9202 pixels differ, max96 | 0 differing pixels |

The r5 additive and r6 opaque pictures remain byte-identical in decoded RGBA
before/after and under both permutations. Original, reversed and shuffled r4
produce the same repaired RGBA hash
`3fb8815526065743c6b7eb4203cca5a4738bfbd6167995cdcf6c114005fb8925`.
The independent near-red/far-blue fixture verifies correct compositing order.

- 324/324 unit/service/export tests and2/2 actual WebGL browser tests pass;
 0 failures/skips. Build/typecheck pass.
- Camera movement, parent transform, deformation, equal-depth tie breaking,
 UV/position/normal/winding preservation and opaque/additive transitions pass.
- Private draw indices only: all23 exporter source files match frozen0.30.0
 source maps (`exporter-preservation.json`). Document schemas, export profile
 IDs and exporter version selection are unchanged.
- Public CLI PNGs for all3 imported fixtures and WebM for r4 succeeded. All
 downloads match artifact size/SHA. PNG versus decoded WebM frame30 mean
 absolute RGB error1.2086/255; input documents remain exact after rendering.

| Source | Fixture@revision | Public PNG job |
| --- | --- | --- |
| r4 | `eef11f2a-2c3e-4184-85d3-5f2e9105b698@1` | `9a779eb1-cf8c-456a-b500-3fab0eec769f` |
| r5 | `99325127-4701-4bd9-ba88-4226c45b885a@1` | `4c031ebc-08af-45d5-84b9-c5ab6e2943e8` |
| r6 | `d326fd5b-eb83-41f4-ba5b-a0989be14384@1` | `69c182b3-1bf0-4c58-a659-d387c7a51e57` |

Fixture labels differ only in `document.name`. WebM r4 job:
`4f43d296-676c-4d37-879c-8fc8a1ff4758`.
CLI/config in `lab.json` authorize import and own forks as requested; runtime118
files are frozen in `lab/runtime-manifest.json`. `lab/start-lab.ps1` preserves
the dedicated data directory when restarting this lab. No native integration,
NWN or Toolset run occurred. `nativeVerified:false`.
