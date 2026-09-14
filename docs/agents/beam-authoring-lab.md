# Isolated authoring connection for The Last City - VFX

The corrected 0.27.0 source is available as a frozen runtime on port 14384.
This is an isolated CLI authoring service, not the held global release. The
global 0.26.2 service on 4317 and its connection remain unchanged.

- Runtime: `C:/Projects/nwn-vfx/output/beam-authoring-lab/2026-09-10-param6/runtime`.
- CLI: the runtime's `bin/nwn-vfx.mjs`.
- Private client config: `C:/Projects/nwn-vfx/output/beam-authoring-lab/2026-09-10-param6/tlc-agent.config.json`.
- Workspace: `956bb5be-f64b-415b-8a40-64917ecbee85`.
- Instance: `41aae96c-5a3a-4390-84f3-637d218df963`.
- Actor: `cb566927-bd04-408b-8154-dd3580f5f7d7`, agent rather than owner.

Use the explicit config per invocation; do not print its contents or replace a
global config/token. It grants read/create/edit/render/build/export/artifacts/
jobs on the labs and the actor's subsequently created projects. Human locks and
AI pause remain enforced. Administration and accepted source projects are not
granted. The credential field's legacy name `ownerToken` does not confer owner
authority: the service resolves this credential to the restricted actor.

Two working projects are available:

| Project | Initial revision | Starting point |
| --- | --- | --- |
| `tlc-beam-authoring-lab` | 1 | Explicit fork of the visible white V10 control |
| `tlc-beam-wisp-lab` | 2 | Separate fork, restoring all V9 source layer values through public changes.apply; both PNG assets retained |

Inspect the current revision before editing: these are mutable working projects.
Create further forks for comparisons. `tlc-beam-lab-cli-check` is a disposable
acceptance fixture with a count lock, not an authoring source. Accepted V9/V10
sources and artifacts remain intact.

For a PowerShell session, a local helper avoids repeating paths:

```powershell
$beamStudioCli = 'C:/Projects/nwn-vfx/output/beam-authoring-lab/2026-09-10-param6/runtime/bin/nwn-vfx.mjs'
$beamStudioConfig = 'C:/Projects/nwn-vfx/output/beam-authoring-lab/2026-09-10-param6/tlc-agent.config.json'
function Invoke-BeamStudio { & node $beamStudioCli --json --config $beamStudioConfig @args }
Invoke-BeamStudio doctor
Invoke-BeamStudio projects inspect --project tlc-beam-wisp-lab
Invoke-BeamStudio schema get changes.apply
```

Author with changes.preview/apply, stable idempotency keys and the inspected
revision. Use `assets import` for PNG and `layer.set` for texture, blend, color,
alpha, size, count and supported timing. A finite flow still requires zero
speed/spread/gravity, and total duration covering the feed plus particle life.
Rendering and candidate jobs bind to an explicit revision. Wait for completion,
then retrieve artifacts with `artifacts get --out <explicit path>`.
See `beam-particle-flow.md` for complete operation examples.

New candidate metadata is integration schema6 / Type7 Param6=cast01. Historical
Param2 jobs remain readable. `Motion_Blur` is not exposed by the current public
emitter schema: the exporter selects Normal. Enabling it needs a separate
feature and preview/export/native qualification; do not edit exported MDLs.
Reverse P2P with the caster-hand root is still an open architecture requirement.

The exact frozen runtime files and source dependency lock hash are recorded in
`output/beam-authoring-lab/2026-09-10-param6/runtime-manifest.json`. Dependencies
resolve from the Studio workspace's node_modules. `acceptance.json` records
actual CLI checks from the consumer cwd: scopes, mutation, retry, conflict,
pause, human lock, binary build, PNG render and verified artifact downloads.
This is CLI qualification; it does not claim a new real-host WebMCP acceptance
or complete native qualification. Native V10 visibility was reported by the
consumer and applies only to that candidate/configuration.

The service is intentionally left running during authoring. The consumer will
coordinate its release with Studio. Do not rerun the one-time provisioning
script against active work, stop this service for an unrelated test, or replace
its frozen files in place. Use a separate instance for future feature tests.
