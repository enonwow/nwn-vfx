# Studio 0.15.2 — saved clip volume

Activated locally on 2026-09-08 at http://127.0.0.1:4317/.
Selecting an audio clip now exposes **Głośność klipu**, a 0–100% slider and
synchronized percentage field. Apply clip, then Save project commits the existing
`audio.set` gain (percentage / 100). The separate **Głośność odsłuchu** control is
explicitly local and does not change the export.

The controls preserve incomplete pending input, fractional percentages, existing
gain precision when untouched, locks, AI pause and undo. Invalid or empty values
cannot be applied. Original audio assets are immutable. This release changes no
document or operation schema; API remains 0.1.0, audio schema 9, WebMCP 48 tools,
and exporter/resource format 0.15.0.

## Verification

- Build, TypeScript and skill validation passed.
- Nine audio, service and WebMCP descriptor tests passed:
  `output/audio-gain-unit.log`. Fixed known PCM samples independently verify gain
  0, 0.5 and 1 for preview and exported WAV, including source preservation.
- Six browser scenarios passed across the recorded runs: new percentage controls,
  audio authoring/transport, project-switch clock reset, delayed save preserving
  newer edits, polling during save, and scoped WebMCP drafts/revocation.
  The five existing scenarios passed in `output/audio-gain-browser.log`.
  That initial combined log also contains a failing new test: its Node Buffer
  DataView omitted byteOffset. After correcting the measurement and accounting
  for PCM16 quantization, the new scenario passed in
  `output/audio-gain-browser-final.log` (19.87 s). No mixer change was required.
- `output/audio-gain-acceptance/report.json` records the final browser result.
  Export at 50% and browser audio buffers at 0%, 50%, 100% matched the expected
  signal within 0.5 PCM16 sample units; zero gain was exact silence. Monitor volume
  did not affect export. Tests covered invalid/incomplete input, pending context,
  Apply/Save, undo, gain locks and AI pause. Audio source was unchanged.
- The screenshot `output/audio-gain-acceptance/clip-volume-50.png` was visually
  inspected. The percentage card and separate local-monitor explanation are clear.
  No additional broad regression suite was run for the final handoff.

## Real host WebMCP acceptance

`output/releases/0.15.2/real-host-webmcp.json` records actual
`tab.capabilities.get('webmcp')` / `tools.call` operations in a fresh Codex in-app
browser tab, using all 48 discovered descriptors and a project-scoped agent grant.
This is separate from the controlled registry in the automated browser test.

Own fixture: `studio-clip-volume-0152`, clip `host_clip`; source fixture
`3bd62c64-9803-41b2-8334-d43c1b9a4706` r8. Production projects were not edited.

| Action | Saved revision | Gain / visible controls |
| --- | --- | --- |
| Initial fixture, selected clip | 1 | 1 / 100% |
| Agent `changes.apply` | 2 | 0.5 / 50% slider and field |
| UI field 25%, Apply, Save | 3 | 0.25 / 25% |
| Agent `changes.revert` of UI operation | 4 | 0.5 / 50% slider and field |

`view.inspect` exposed pending raw `gainPercent: "25"` before Apply. History
identified r2 as agent-authored and r3 as owner-authored, with distinct operation
timestamps. Original audio assets compared exactly before/after. Original WAV
SHA-256: `c419dedbd63f6b828f6d62715ffe12deb36d844eaa2453b9ad1ef2641be39ce3`.

Final view: clean r4, clip selected, time 0, paused, monitor muted at 0.15,
unlocked false, no active sources. The test grant was revoked; subsequent real
`connection.inspect` returned `WEBMCP_NOT_CONNECTED`. The separate new tab was
left available for inspection. Existing human tabs were not reloaded or closed.

Consumer task `01a070e3-5df3-7913-943f-854ac8ea98ee` independently reported the
0.15.2 UI in its own separate tab: production `tlc-wampir-ugryzienie` r29,
`bite_contact`, both controls 100%, Apply/Save disabled, paused at 0 of 1 s and
silent. The consumer reported preserving the old human tab.

## Installation and preservation

Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`; workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587`. All 42 preexisting project revisions and
canonical document hashes matched after installation and again after live WebMCP
acceptance. Evidence: `output/releases/0.15.2/before-install.json` and
`output/releases/0.15.2/installed-preservation.json`.

- `tlc-wampir-ugryzienie` r29, gain 1, document SHA-256
  `3d6b6fd6ac08767429b9926681bb3d809964919145b7102152eee11cc9c0a880`.
- `tlc-wampir-bijace-serce` r7, gain 1, document SHA-256
  `85b949b06e8227b7a911b06381076c55ef6794d9b5713125e9ae05644f70277f`.
- Installed package: `output/releases/nwn-vfx-studio-0.15.2.tgz`, 2181723 bytes,
  SHA-256 `d0c8be5a0867c009c47ea688d414354dad0eae7a6c729f6667bc259a9c9f6f9f`.
  [Source inventory](source-manifest.json) records 216 files; no commit claimed.
- Repo and installed agent skill were updated. Shared agent examples are in
  [audio contract](../../agents/audio.md).

No Toolset/NWN process, native demo, MOD/HAK integration or native proof was
performed by this release task. Native validation remains with the consumer.
