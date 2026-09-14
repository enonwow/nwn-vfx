# Studio 0.28 — implementation and acceptance

Date: 2026-09-10. Scope: the seven items in The Last City's
`docs/vfx/studio-automation-roadmap-2026-09-10.md`. The Studio task did not launch
Aurora or NWN, install MOD/HAK, or qualify native appearance itself.

## Delivered behavior

| Item | Available behavior | Evidence |
| --- | --- | --- |
| 1. Compact comparison and benchmark | Authored changes, added/removed layers/assets, effective export, compiled readback, immutable source/observation pin | Public V10/V11 comparison; consumer stage1 PASS; later saves preserve the pin |
| 2. Diagnostic variants | Independent control/texture/color/alpha/size/count forks, bounded white/solo modes, allowed-field verification, unique resource names and one ZIP | Real binary V10/V11 bundle; texture/alpha/size have 1/2/3 allowed export differences; stable request keys |
| 3. Analysis | PNG alpha/bounds, expected TGA pixels/TXI, HAK identity, emitter appearance/emission, mesh topology/UV/normals/deformation bounds, audio mixer/ranges/period | Valid zero-base animated emitter is informational; corrupt texture rejected; four real candidates analyzed without another build |
| 4. Preview and concept | Saved camera/filter/background/light, schematic character scale/pose/motion, immutable concept PNG and phase matching | Real renderer: repeated uncached PNG hash identical; changed background differs; concept/render phase 0.5 matches |
| 5. Components | Immutable selection, required assets, ID/marker mapping, inherited locks and source provenance | Technical fixture and actual TLC left wing; only 1 required audio asset copied from 6; source and existing target geometry preserved |
| 6. Timing | Named markers and visual/audio bindings, period proposal/apply, explicit schedule and unchanged source audio | Technical DUR 1.6→2.4 and actual TLC wings 1.4→1.6; exact audio bytes/trim/gain and geometry/key values preserved; lock/CAS/undo checked |
| 7. Durable iteration and external reports | Persisted stages/timing, verified resume, exact-input render cache, artifact chunks and hash-bound external reports | Restart/injected failure/retry/cache invalidation tests; consumer imported four real reports; mismatched hash rejected |

UI, CLI and WebMCP call shared operations. Workflow metadata uses document20 /
project ZIP15. Existing revisions and native resource artifacts remain immutable.

## Automated and actual-host checks

- `npm test`: **304/304 passed**, no skipped tests. Log:
  `output/iteration-lab/2026-09-10/unit-tests-final.log`.
- Production build and TypeScript checks passed. Build log:
  `output/iteration-lab/2026-09-10/build-final.log`.
- Browser acceptance: **4/4 passed** (save during edits, history attribution,
  polling race, production adapter callbacks, workflow forms, render/concept).
  `output/iteration-lab/2026-09-10/browser-tests-final.log`.
  These automated tests explicitly mock host tool registration; the server,
  browser callbacks and renderer are real.
- Separate **actual Codex WebMCP**, using `document.modelContext` and CUA's
  `webmcp.fetchTools()/call()`, passed without registration mocks: discovery,
  fork, view context/open, timing write, stale revision, human pause, human layer
  lock, pending workflow draft, iteration, chunk download, existing-candidate
  analysis and grant revocation. The compact response measured 2932 bytes and
  contained no PNG/PCM base64. The temporary grant was revoked after testing.
  Evidence: `output/iteration-lab/2026-09-10/qualified/webmcp-live-acceptance.json`.

All 67 distinct tools remain available through two profiles: authoring48 and
workflow65. `studio.tools.select` switches and requires rediscovery. This keeps
each descriptor set within the actual host's 64KiB limit while retaining closed
input schemas. It does not erase grants, selection or drafts. The actual-host
check exercised the workflow above, not every possible input to every tool.

## Runtime and consumer handoff

The consumer instance **http://127.0.0.1:14385/** now runs:

```text
C:/Projects/nwn-vfx/output/iteration-lab/2026-09-10/first-public/runtime-final/bin/nwn-vfx.mjs
```

Existing config: `first-public/tlc-agent.config.json`. A separate non-owner
import-capable config is `first-public/tlc-import-agent.config.json`; the older
credential and its retry history remain usable. Both paths are under the lab
directory above and must not be pasted as credential contents.

Instance `d7a631d0-aa36-4e0f-a341-1efbd9bdd1da`, workspace
`76ec268a-cbab-459e-99cf-8132fd2ad5a2` were preserved. Deployment occurred with
zero active jobs after a complete data backup. Public before/after comparison
matched **7 projects, 1 job, 4 reports**; all **21 artifact files** retained exact
bytes. The consumer's benchmark fork `50e39224-eb09-4ffa-aad3-3d9c750f80e3@3`
remained unchanged. Evidence: `first-public/deployment-acceptance.json`,
`deployment-before.json`, `deployment-after.json`; backup:
`first-public/backup-before-final-20260910`.

The accepted first bundle remains job
`488fde3c-df7a-459d-a460-f6fa931848b3`, artifact
`b0e8ce1c-8e3d-409a-b03e-6e0fb7eb9f5e`, SHA256
`3e05fab0fd12933281ed0eb8de663338519d1072b181fbcd26a9af4ebe93a551`.
The final code analyzed and compared those existing nested candidates through
public CLI without another export: `first-public/candidate-qualification.json`.

The separate qualification instance **http://127.0.0.1:14386/** uses
`qualified/runtime-2/bin/nwn-vfx.mjs`; identity and source paths are in
`qualified/handoff.json`. Its binary four-variant bundle is job
`a871e1f6-eb17-436c-9023-27a26de6c273`, artifact
`a84359fe-7072-4b7d-9203-ab441a3b3135`, 1680757 bytes, SHA256
`a70d0455626b95b02b687827dc9359d7eef4d6abd96d18543dff97975247410f`.
It does not inherit the first instance's native reports. Frozen runtime file
hashes are recorded in each lab's `runtime-manifest.json`.

Global 4317 (0.26.2) and authoring lab14384 were not upgraded. They retain their
previous processes and data. No global install or personal skill replacement
was performed.

## External observations and limits

The Last City - VFX reported an Aurora build with no errors and verified save,
followed by a 25-second NWN recording of the first bundle. Its control,
texture-only, alpha-only and size-only variants were all visible; the texture
variant loaded the wisp. These separate changes do not establish one cause of
the full V11 invisibility. The consumer imported four exact-candidate reports
and independently passed benchmark/compact-response acceptance:
`C:/Projects/the last city/output/vfx-workflow/acceptance-028-stage1/result.json`.
This is attributed external evidence, not a Studio-run native test.

Fog/depth/full color parity, actual target rig attachment, phase behavior in
NWN and artistic approval remain outside these checks. Schematic hands do not
promise EffectBeam hand targeting. Audio retiming does not stretch samples;
the consumer stops future WAV dispatch at external stop, and an issued WAV may
finish. A changed composition needs its own applicable consumer test.

Full instructions and limits: [iteration-workflow.md](iteration-workflow.md).
Candidate/report lineage and exact error behavior:
[iteration-contract-v1.md](iteration-contract-v1.md).

Actual TLC wings authoring acceptance also passed on separate qualified14386
projects `studio-028-wings-source-check@3` and
`studio-028-wings-component-check`. Source:
`C:/Projects/the last city/assets/vfx/wampir/skrzydla/source/audio/master-minus16-v1/candidate/effect-document.json`,
SHA256 `c44d9ed942a63471a91dcb11100b9cffbeb9758d55aff9edb485d728ffc4f218`.
The period changed 1.4→1.6 and the downstroke start 0.8→0.9142857142857145.
All geometry and animation key values were equal; only key times changed.
All six source audio assets and clip trim/gain were equal. Insertion copied the
left wing, bound marker and its one required audio asset; the source and an
existing target reference mesh remained equal. Evidence:
`output/iteration-lab/2026-09-10/qualified/wings-acceptance/result.json`.
This checks authoring semantics, not native synchronization of the new variant.
The initial empty-target fixture was corrected to satisfy the existing
one-layer minimum; production validation was not weakened.

The Last City independently repeated actual-wings acceptance through its public
CLI and reported **PASS**, with **20/20 consumer tests**. Its project is
`6082a3b3-5f44-4f75-b9fc-b4e56d120cb4@3`, component
`66d27cc7-bbbd-4405-9bb5-85499476ba48`, target
`ec0c2aa1-d0ab-46b9-8b95-5d2568956255`. It confirmed the same source hash,
period/start changes, exact geometry/key values and audio bytes, dependency
pruning to one of six audio assets, marker remapping and unchanged native demo.
Independent result:
`C:/Projects/the last city/output/vfx-workflow/acceptance-028-wings/result.json`.

Response size, stage durations, cache use and build count are measurable here.
No token-savings percentage is claimed without token telemetry.
