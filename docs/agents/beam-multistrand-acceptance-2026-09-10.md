# Studio 0.28.2 — independent beam strands acceptance

The bounded release is complete: one unchanged finite Fountain plus up to four
separate Lightning/Linked strands using the new continuous `beam-soft` texture.
Document schema22, portable project ZIP17, minimum client0.28.2. The public
[contract and executable example](beam-multistrand.md) apply equally to CLI and
WebMCP. This is authoring/export acceptance, **not native visual acceptance**.

## Exact consumer handoff

Lab: `http://127.0.0.1:14387`, instance
`8b4f65b0-db70-4c0e-b891-4e300c66ec43`, workspace
`00055d70-45f3-47f4-ac83-73bbef89e88d`.

- CLI: `C:/Projects/nwn-vfx/output/beam-composite-0281/lab/runtime-0282/bin/nwn-vfx.mjs`
- Restricted config: `C:/Projects/nwn-vfx/output/beam-composite-0281/lab/tlc-agent.config.json`
- Restart wrapper: `C:/Projects/nwn-vfx/output/beam-composite-0281/lab/start-lab.ps1`
- Release handoff: `C:/Projects/nwn-vfx/output/beam-multistrand-0282/handoff.json`
- Frozen manifest: `C:/Projects/nwn-vfx/output/beam-composite-0281/lab/runtime-0282-manifest.json`

The wrapper sets the existing lab data directory before service start. Running
service start against a default data directory can select a different instance.
No credentials changed and no global service configuration was modified.

Source V17: `0bb65bb5-d27d-4197-8728-5f44561cc83a@2`, job
`92498861-e37e-4cb2-839b-ac57da48ccfa`.

| Candidate | Project/revision | Job | ZIP artifact | SHA-256 |
| --- | --- | --- | --- | --- |
| Four strands, consumer V18 input | `eb38031b-86ae-430f-959c-3cad15a69662@2` | `939231ba-304a-4658-a8e1-92d0bd43f95a` | `8559a3b0-8e73-4834-b2a4-a3216231befc` | `9ec68bf7f2fd992376960d2f8980aa95e066d7c120c829b0c46c80bcb5248cc9` |
| Three-strand comparison | `9dbb9970-8f7c-4455-9652-2db4896a11f5@2` | `474cc82b-bfa5-45d6-ab39-291b908623a6` | `55c6bf4a-c3c2-4f8b-96a6-50bc0095f76f` | `8981a370b5f33bc45b0b7a6749bbc81c4695708e237c986fb11615da1295dd61` |

Both came from the public CLI example run from `C:/Projects/the last city`.
The consumer has started intake of the four-strand artifact; reuse it rather
than creating another equivalent candidate. Main model: `vstrands282`.

## Verified results

Evidence directory: `C:/Projects/nwn-vfx/output/beam-multistrand-0282`.

- `all-tests.log`: **313/313 pass**, zero skips/failures; `targeted-tests-final.log`:
  nine relevant tests pass. `build-final.log`: production build and typecheck pass.
- `public-readback.json`: public downloads checked against full ZIP hashes. Exact
  essence layer, all three original assets, duration, all non-strand ASCII nodes,
  direct binary controller values, `cast01` and essence TGA/TXI bytes match V17.
  Only exact main model name values are normalized for structural comparison.
  Three/four independent Linked nodes have flags258 and nine points each
  (`segments8 + 1`). Source Fountain remains flags3.
- `webmcp-acceptance.json`: actual Codex browser WebMCP host, with a human-granted
  restricted connection. Fork, fourth-strand edit, unchanged remaining layers,
  stable retry, stale revision rejection, fifth-strand rejection, human AI pause,
  human layer lock, resume/unlock and binary export passed. Three ZIP chunks and
  full650270-byte SHA-256 verified. Disconnect returned `WEBMCP_NOT_CONNECTED`.
  UI selects the soft texture, disables adding a fifth strand and states the
  unsupported weaving limitation. All edits use isolated fixture
  `3563b67b-dd4a-4077-a2ce-8f04c778f3fb@4`, not the consumer candidate.
- `preservation.json`: read-only SQLite comparison and integrity check pass.
  All original eight projects,21 revisions,10 jobs,139 artifacts and one external
  report remain value-identical;139 artifact files plus two credential configs
  retain their exact bytes. New fixture rows are additive.

Schema22/ZIP17 roundtrip, old-client rejection without writes, shared-endpoint
atomicity, rights, locks, pause and blocked nativeMotion are also covered by
the automated service tests. Changing preview seed does not change native MDL.

## Native boundary

This release creates independent emitters; it does not add controlled phase
offsets, smooth native helix motion, alternating weaving or a hand-return fix.
The pinned offline Lightning audit is linked from the contract. A continuous
texture removes texture-row discontinuities; native geometry seams and combined
appearance still need evaluation by the consumer's qualified native workflow.

No Aurora/NWN process, installation or module integration was performed here.
`nativeVerified:false`, `phasedWeavingSupported:false`. Consumer report
`48133326-c68c-4fe9-9ce3-145f10caae56` for V17 is preserved; its
`targetVerified:true` does not promote Studio native verification.
