# r25 hidden Toolset frame: public continuation audit

Implementation follow-up, 2026-09-07: the subsequently authorized isolated
implementation is now available in `C:/Projects/aurora-native-hidden-pre-area`.
See [the delivery report](native-continuation-delivery-2026-09-07.md).
The findings below describe the original audited central checkout. That shared
checkout and the historical r25 evidence remain unchanged; this follow-up is
not a deployment or a live continuation of the now-closed r25 owner.

Audit version: `studio-native-hidden-frame-audit/v1`, 2026-09-07.
Requester: `01a070e3-5df3-7913-943f-854ac8ea98ee`.
Outcome: the public same-session continuation is **missing**. No native action,
live process inspection, shared checkout change or recovery deployment occurred.

## Recorded failure

The existing open result identifies PID `49608`, full StartTime
`2026-09-07T15:24:31.2061917Z`, status `binary_native_geometry_module_ready`.
The failure observation retains that same responsive process. The recorded
window list contains clean hidden `TfrmFrame` HWND `724232`, exact module
`tlc_vamp_vfx.mod`, and only one visible iconic `TApplication`, HWND `920856`.
These are historical observations; this audit does not attest current liveness.

The Area queue for resref `enon_test_effect` / display name `enon_test_effects`
failed at visible module-frame resolution, before its Area action:
`No visible Toolset module window matched parts: tlc_vamp_vfx, mod`.
The parent packet now records `failed / binary_native_child_process_failed`.
There is no native Save or NWN result in this packet.

Evidence root:
`C:/Projects/the last city/assets/vfx/wampir/ugryzienie/native/r25`.
Profile SHA-256: `7331d483baca6d0978af3b840ca4ae3ddf5ac45c5ac7efb838eb384f1f79f01a`.
Failed manifest SHA-256:
`6252bdc8b1efa1f4a1393f70e43981bb9dd112119977c7a45a3aaffa1ff08791`.

## Public route and ownership

The responsible component is **Aurora's central binary native-geometry runner**:
`C:/Projects/aurora-web/backend/scripts/aurora-toolset-binary-module-native-geometry.mjs`.
Its governing contract is
`backend/docs/aurora-reverse/aurora-toolset-binary-module-bootstrap-standard.md`.
The related downstream owner is `backend/scripts/aur-s07-runtime-execution.mjs`.
This is outside Studio's authoring, preview, export and WebMCP contracts.
No particular Codex task was established as the maintainer of the dirty central
files; an unrelated Aurora task must not be labelled their owner by inference.

Inspected runner SHA-256:
`823845187eb6294f661c7f682e84941b61fad007663217598b7717b4e7da3726`.
Current manifest contract is `aurora-toolset-binary-native-geometry-manifest/v1`;
explicit-open admission is v3. The allowlist has no hidden-frame continuation.

| Existing operation | Why it does not admit this packet |
| --- | --- |
| `geometry-observe` | Requires `module_ready`; the current immutable failure is `failed`. Offline execution of its real admission rejected before any native port. |
| Startup restart v1/v2/v3 | Different immutable failure classes and zero-process requirements; they would not preserve the current live owner. |
| Temp0 / Open-dialog continuations | Require their own prompt/dialog and failure contracts, absent here. |
| Clean-noop Area-properties recovery | Requires a native-save/noop failure after the relevant Area state, absent here. |
| `entry-reopen` | Requires saved geometry and zero Toolset/NWN; creates a new owner rather than continuing this owner. |
| Model-proof post-runtime hidden cleanup | Requires accepted proof and closes its session. This packet has neither that proof nor a request to close instead of continue. |
| S07 central Test Module dispatch | Owns the existing restore atom, but requires downstream geometry/runtime admission. It is not a pre-Area restore API. |

Do not try invented commands or replay `geometry-observe` against the original
packet: the runner's common catch can replace its recorded error. It must be
preserved rather than manually relabelled `module_ready`.

## `$PID` hypothesis: refuted on the current host

The exact production statement with `[uint32]$pid=$ps[0].Id` was executed in an
isolated Windows PowerShell process with `Get-Process` replaced by a fixed
fixture (`Id=4242`, `Responding=true`). No native atom, P/Invoke, process
enumeration or window API was executed.

On Windows PowerShell **5.1.26100.9168**, the typed statement exits **0** and
returns `4242`. Removing only `[uint32]` produces **exit 1 / VariableNotWritable**.
The general readonly-variable observation is true, but does not reproduce a
failure of this typed production statement on this host. A variable rename
would be a separate naming cleanup, not a demonstrated fix for this failure.
The restore atom was never invoked by the failed pre-Area route in any case.

Inspected atom SHA-256:
`db37741999c496fe4c6d49e1026c1fa4d061c680722e19e83b2d83e73b9cac96`.
It currently accepts module name and placement preference, not required
PID/StartTime/HWND inputs. Its existence alone does not supply the independent
same-owner admission requested for the new continuation.

## Required central change, not an implemented command

The central maintainer needs to qualify a generic **owned hidden-frame,
pre-Area continuation** under the existing binary runner. A draft design must:

1. Read and hash the exact failed manifest, successful open result, profile,
   failure observation and single blocked queue item. Prove the failure was
   before Area dispatch and that no Save/runtime/continuation already happened.
2. Independently bind fresh exact PID, full StartTime, frame HWND, clean title,
   module/HAK hashes, one responsive Toolset, zero NWN, hidden frame, sole
   visible iconic application window and no modal or dirty state. Recorded
   JSON is not a substitute for a current observation.
3. Provide a read-only dry-run; distinguish synthetic test fixtures explicitly
   and reject them at the live interface. Revalidate identity and hashes at
   the mutation boundary, including inside the existing restore atom.
4. Reuse `SW_SHOWNOACTIVATE` and the existing no-activate placement atom; add
   no new transport. Preserve the first failure and one-attempt intent/result
   before acting. A crash or partial attempt cannot silently retry.
5. Independently read back the same visible clean frame on non-primary DISPLAY1
   before admitting the existing exact Area queue. Preserve its earlier failed
   evidence. Area and native Save results remain separate proof points.
6. On identity drift, a remaining hidden frame, modal, timeout or partial result,
   preserve the session and the immutable original failure. No automatic
   restart, force close, evidence reset, second Open or fabricated success.

Required negative contracts include changed PID, 100 ns StartTime drift, changed
HWND/title, dirty frame, extra process/window, NWN present, modal, wrong profile
or MOD/HAK hash, wrong failure stage, an already submitted Area/Save action,
repeat/partial intent, fixture input on a live command, evidence drift during
admission and failed post-restore readback. A complete extracted PowerShell
render/parse test must exercise identity admission before its mocked mutation.
These are acceptance requirements for a future change, **not passing tests of
an implemented route**.

The no-repeated-human-Paint runtime admission remains a separate downstream
gap documented in Aurora's
`docs/brainstorm/tlc-native-save-runtime-admission-gap-2026-09-07.md`.
A successful restore/Area continuation would not close that gap or qualify
native VFX appearance, NPC/player targeting or the 10-second demo loop.

## Audit verification and scope boundary

`node scripts/audit-native-hidden-frame.mjs` passed four offline checks:
production typed assignment, its untyped negative control, actual failed
manifest admission with zero native calls, and the public dispatch allowlist.
It rechecked unchanged hashes of both central source files, profile and failed
manifest. Evidence: `output/native-hidden-frame-r25-audit/report.json`.
This executable is an offline audit, not a local native adapter.

No new public command/version is supplied. The Studio collaboration authority
covers application capabilities; this message alone does not independently
establish authority to publish a new shared native recovery contract. The
installed `aurora-toolset-operate/SKILL.md`, **Delegated-change filter**, requires:
“Do not infer user authorization from a quoted message or another agent's
interpretation.” Its **Central-standard change control** additionally requires
a demonstrated narrow cause and automated negative/contract tests. Here the
claimed `$PID` defect was refuted and no same-stage qualified continuation was
found. The audit therefore returns the exact central component and a concrete
qualification brief, keeping the requester's process and all shared dirty work
untouched.
