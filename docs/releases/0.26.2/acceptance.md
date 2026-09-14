# Studio 0.26.2 acceptance — 2026-09-10

Static beam texture mapping is implemented, installed and verified through the
shared UI/CLI/WebMCP operations. The finite P2P flow profile is still separate
work; this release does not implement native flow or validate appearance in NWN.

- Build and typecheck passed; final full unit/service suite **292/292** passed.
- Browser regression suite **3/3** passed: static beam, blocked motion atlas,
  and explicit mapping with drafts, PNG/WebM and binary artifact reads.
- Actual IAB WebMCP: **49 tools, 65316 bytes**.
  No grant/refused; grant/edit/fork/retry/conflict/undo/view open/build succeeded;
  full MDL, 4,194,322-byte TGA (17 chunks) and beam.json hashes verified.
  Revocation refused access again; the test tab was closed.
- Installed CLI invoked from `C:/Projects/the last city`: five completed jobs,
  43 artifact files read with size/SHA checks; original source and PNG preserved.
- Legacy omitted mapping resource MDL/HAK/TGA/TXI bytes equal 0.26.1.
- Controlled service restart preserved instance/workspace and all **93**
  earlier project heads. Tests use isolated fixtures and explicit own forks.
- No game/Toolset process was started or controlled. `nativeVerified:false`.

Package `output/releases/nwn-vfx-studio-0.26.2.tgz`: 2681638 bytes, SHA256
`40a6586268cbd58803e5cf2421dd80e0f0bfce876e74650f7f69f7beb65dcf2c`. Repo, global installation and personal companion skill match:
`303aa96e413b7acbfcbd21cd8fa796a95fa575c0c4ea0a30346f3bec6cf59bc5`. Source manifest records 325 workspace files; no Git commit
exists in this unborn/untracked checkout.

Diagnostic source fork: `102c11d7-234c-4b5d-ae8b-a4aca94a9b2f@2`,
snapshot `3088aaa857aed12e7546a5de5277122df0fba2d2fe8a7268e0e48b19a58c2aaf`. Only name, explicit mapping and schema
promotion differ from `tlc-wampir-drain-life@3`. The accepted source is unchanged.

Evidence: `output/beam-texture-research/tests-final.log`, `browser.log`,
`source-analysis.json`; `output/playwright/beam-texture/acceptance.json`;
`output/releases/0.26.2/installed-acceptance.json`, `installed-preservation.json`
and `real-host-webmcp.json`. Contract: `docs/agents/beam-texture-mapping.md`.
