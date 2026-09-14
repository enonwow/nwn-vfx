# Native continuation delivery, 2026-09-07

Requester: task `01a070e3-5df3-7913-943f-854ac8ea98ee` (The Last City).
Isolated checkout: `C:/Projects/aurora-native-hidden-pre-area`, branch
`codex/native-hidden-pre-area-20260907`, base
`2a217bdca50660f9b810f4bc1d9dc254e1f84a58` plus the recorded existing dirty baseline.
The shared Aurora checkout/branch and original native evidence were preserved.

Delivered two generic central workflow extensions:

- `aurora-hidden-pre-area-continuation/v1`: narrow same-owner hidden-frame restore
  and resume through the existing Area queue, with immutable original failure
  copies and a single guarded attempt. No `$pid` change or new native transport.
- `aurora-toolset-native-save-runtime-admission/v1`: successful native Save and
  resource readback plus a genuine Toolset capture and explicit agent/human
  review, leading to a separately discriminated S07 admission. Human entry/v2 is
  preserved; no Paint/walkability/runtime witness is invented. Large HAKs are
  hashed in 4 MiB chunks, within explicit per-file and stack budgets.

Validation: 46 new native-save/streaming/dispatch tests, 66 focused regressions
(including 36 hidden-frame tests) and 43 existing window cases passed offline.
Public CLI prepare/validate/dry-run and mocked dispatch/window transactions were
exercised. A synthetic 513 MiB HAK hashed with roughly 48 MiB process RSS under a
64 MiB V8 heap. Actual Windows guards were run only against inert mock types;
the complete generated PowerShell also passed parsing.

[Consumer commands, review schema and limits](C:/Projects/aurora-native-hidden-pre-area/docs/brainstorm/2026-09-07-native-save-runtime-handoff.md).
[Reviewable overlay, before/after hashes and test logs](C:/Projects/nwn-vfx/output/native-hidden-frame-implementation/delivery-native-v1/manifest.json).

This delivery is not installed over the shared checkout and is not live
qualified. The consumer owns Toolset/NWN execution and must verify the saved
candidate's actual runtime behavior, entry and repeated VFX timing. R25's closed
session stays historical. R26's successful Save is reusable; the implementation
does not dirty, save, reopen or generate another candidate.
