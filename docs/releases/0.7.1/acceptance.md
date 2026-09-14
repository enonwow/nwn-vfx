# Studio 0.7.1 — final WebMCP host acceptance

Feature scope is [OBJ/material/asset removal from 0.7.0](../0.7.0/acceptance.md). This patch changes WebMCP schema representation and repeated descriptions, preserving all 42 tools and their input decisions. Local draft-07 `definitions/$ref` share repeated subtrees; constraints and literal data are unchanged. The compiled browser validators use the same compact schemas. No host limit is modified.

The former 68676-byte catalog exceeded this installed host's default 65536-byte descriptor bound. Patched descriptors including origin, page URL and annotations are **59027 bytes**, leaving **6509 bytes**. A regression check enforces a stricter 60 KiB budget and at least 4 KiB of headroom. Structural expansion reconstructs every original schema; canonical and compact AJV decisions agree on all tested valid and malformed arguments across all tools.

- Base feature verification: **184/184 tests passed** in `output/studio-070-unit-tests.txt`.
- Patch-specific contracts, registration, adapter and budget checks: **18/18 passed**, `output/studio-071-webmcp-tests.txt`.
- Browser editor/save/WebMCP callback regression: **4/4 passed**, `output/studio-071-browser-tests.txt`; this uses an explicit registration mock and is separate from actual host discovery.
- Real renderer acceptance: [lighting and alpha](../../../output/playwright/material-acceptance/report.json), [PNG/WebM/MDL/HAK from one revision](../../../output/playwright/obj-artifacts/report.json).
- Real source parser acceptance: [all six read-only OBJ sources](../../../output/studio-070/real-obj-sources.json), including guard's independent 2801 UV entries for 1301 positions.
- Typecheck, production build and regenerated contracts passed.

Package: `output/releases/nwn-vfx-studio-0.7.1.tgz`, **1210038 bytes**, SHA-256 **f284b018fd1282519174a9169b040906a1aff9583657e583433bfba5384391bb**. [Source manifest](source-manifest.json) binds 119 local source files; the workspace has no Git commit, so no commit identity is claimed.

Activated on 2026-09-06 in the consumer-approved quiet window. Public project-list snapshots before/after activation are byte-equivalent after the same JSON serialization: **15 projects unchanged**. Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057` and workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587` were preserved. No existing browser tab was reloaded or saved; tlc-wyrok was not changed.

## Actual Codex WebMCP acceptance — PASS

A new isolated in-app browser tab discovered all **42 tools** through the installed Codex host. `fetchTools` and actual calls succeeded with a limited, project-scoped tab grant, without owner credentials. `studio.version` returned installed service 0.7.1.

Own test project: `41c6dd72-4900-4999-a009-284bf19c4894`; layer `proof-obj`. No consumer document was used for mutations.

- `studio.view.inspect`: clean saved schema-5 document r2, separate draft, revision/view revision, selection/time and grant identity available.
- `studio.meshes.importObj.preview`: custom triangle from OBJ text, 3 positions / 3 UV / 1 face, explicit Z-up metres, geometry-only diff.
- `studio.meshes.importObj`: r2 → r3, material diffuse `#44aaff` / selfillumination `#000000` preserved. Same key replay stayed r3. New key with stale r2 returned `REVISION_CONFLICT`.
- Human AI pause returned `AI_PAUSED`; a persisted lock on the mesh at r7 returned `LOCKED`. A draft-only lock was visible separately and did not represent a persisted policy. A concurrent saved change preserved that draft and surfaced remote revision for explicit resolution on this own fixture.
- `studio.view.set`: selection `proof-obj`, time 0.65, paused playback; retry with stale view revision returned `VIEW_CONFLICT`.
- `studio.preview.request` → `studio.jobs.get`: PNG render of r7 succeeded, job `b84b5f05-3efa-4339-bf96-813112604378`, schema5 / renderer0.7.1 / nativeVerified false.
- `studio.artifacts.read` received the complete 47823-byte PNG in one chunk, offset0 / nextOffset null. Decoding the returned base64 and hashing those bytes with SHA-256 independently matched both artifact and chunk hash: `544b46a732e4614ade45a4b1b59d40a22c40b7f9cbf0f0749d409c5cde5afb12`. Installed-CLI download also verified the same size/hash; the image was visually inspected.

PNG evidence: [actual WebMCP preview](../../../output/studio-071/live-webmcp-preview.png). This proves live agent control and artifact receipt, not native NWN appearance.
