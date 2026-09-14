# Studio 0.28.1 composition acceptance — 2026-09-10

Authoring and resource acceptance **passed** for one static Lightning/Linked
strand plus finite Fountain/P2P streams in the same main MDL. This closes the
bounded Studio implementation, including the decimal compiled-readback fix.
It does not close native attachment, combined appearance or hand-return support.

## Automated and public CLI evidence

- Production build/typecheck passed: `output/beam-composite-0281/build-final.log`.
- Full suite **309/309**, no skipped tests: `all-tests-final.log` in that folder.
  Five focused composition tests include atomic shared bindings/locks,
  nativeMotion refusal, source/resource compatibility, removal, per-node binary
  flags and safe point counts, finite animation retention, narrow float32
  acceptance, HTTP ASCII/binary, schema21/ZIP16, old-client rollback, pause,
  revision conflict, stable retries and parameter undo.
- Public CLI via a limited actor built `studio-0281-flow@2`, an explicit import
  of the V10 diagnostic plus one strand. Binary job
  `c86b2044-b888-482d-8660-2515de840c20`; bundle SHA-256
  `22b6a199fb05fc85b1b689a3eaee0523a8c9274b1462a73bcbc3157eb1de792c`.
  Export includes both beam metadata files and independently read binary nodes.
- PNG job `94bd9226-8ea7-47c2-9a04-23afe27cf669` succeeded. The PNG was visually
  inspected: the imported high-visibility diagnostic produces large white
  particle cards. It is a technical fixture, not an approved final appearance
  or evidence of how the mixed effect renders in NWN.
- The exact source from consumer
  `50338414-2f51-45a8-b776-11be5243c452@2` was imported as
  `studio-0281-decimal@1`; binary job `bf43e9e9-6ce4-4997-9d05-17f3a948dd0d`
  passed at original duration 3.9. Source input SHA-256
  `444e0608a760696f47ddecc023a7d726d0d2cce3155c40b1e7f415a1a0be8f60`.
  Bundle SHA-256 `e48a1002d957f37d9f56dc7e7abd886599272a0ca91315fce69f3a4f1db27262`.
  The consumer's old failed job/revision were preserved.
- The shipped public example ran successfully from **`C:/Projects/the last city`**
  using absolute CLI/config paths. It created its own
  `4a424834-073b-4873-8e19-bcff9140273a@2`, binary job
  `6aed7f04-5e90-4056-9411-8c9b9252f4ee`.
  Evidence: `output/beam-composite-0281/example-cross-repo-final.log`.

Earlier failed build/test logs are retained for diagnosis; the `*-final.log`
files describe the delivered runtime. The initial runtime's closed binary
exporter schema omission was fixed before this acceptance. Use **runtime-2**.

## Actual browser and WebMCP evidence

Used actual in-app browser tab 9 on `http://127.0.0.1:14387/`, discovered the
host's WebMCP capability/tools, and obtained a temporary human-issued project
grant. No DOM fetch, page injection, owner-cookie substitution or CLI call was
used as WebMCP proof. The existing authoring discovery profile retained 48 tools.

The UI created a fresh finite stream and added a static strand. In the same
fixture, UI endpoint editing saved both layer bindings atomically. WebMCP read
the project/selection, saved source and raw invalid beam width text `-`.
An ordinary saved-revision alpha edit succeeded while preserving that raw text
and exposing the newer remote revision; `view.open` refused with `DRAFT_CONFLICT`.
The fixture's own draft was then explicitly discarded/reloaded through the UI.
This is draft preservation and conflict reporting, not a blanket prohibition
on saved-revision writes while a human types.

WebMCP then changed strand width; a retry reused the same revision and a stale
write returned `REVISION_CONFLICT`. Human UI pause returned `AI_PAUSED` to the
agent. A human layer lock persisted and returned `LOCKED`. Preview time was
changed to 1.4 seconds, paused, through `view.set`.

Project `234df373-a357-4371-a905-8b88914802e8@7` exported binary job
`1157bc8e-9743-41d5-87bb-3ae4c45ffe17`, exporter `nwn-binary-vfx-0.28.1`.
The complete candidate ZIP was received via three `studio.artifacts.read`
chunks; each chunk hash, total size 44570 and full SHA-256
`ed068822b6821ba99f5e4817422b399ed258f83f62614876961d2d021760baca` matched.
Human disconnection was followed by `WEBMCP_NOT_CONNECTED`.

The compact evidence record, including artifact ID, chunk offsets/hashes,
project grant identity and all 15 checks, is
`output/beam-composite-0281/lab/webmcp-live-acceptance.json`.
The temporary WebMCP grant is revoked; the consumer CLI actor is separate.

## Consumer handoff

Use `output/beam-composite-0281/lab/handoff.json` for exact paths, source hashes,
job/artifact IDs and workspace/instance identity. The restricted config is
`lab/tlc-agent.config.json`; do not disclose its credential. The runtime CLI is
`lab/runtime-2/bin/nwn-vfx.mjs`. The actor can read/edit the two named lab
projects and create/import its own projects; it has no owner administration.

Protected services remained unchanged: 4317/PID18548, 14384/PID29392,
14385/PID50248 and 14386/PID40492. The new isolated service is 14387/PID42576.
No global installation was upgraded, and no accepted consumer project or native
MOD/HAK installation was edited.

For a meaningful native comparison import the exact visible V13, add only the
strand, preserve the original stream, and keep the same whole effect instance
through the last particle death. Static strand lifetime is external; cast01
gates Fountain only. `nativeMotion` remains blocked. Binary/readback/PNG success
does not establish native visibility, body attachment or Windows renderer parity.

See [composition contract](beam-composite.md),
[bounded renderer/callback audit](beam-render-audit-2026-09-10.md) and
[hand-return limitation](beam-hand-return-decision-2026-09-10.md).
