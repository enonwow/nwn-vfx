# Particle preview in Studio 0.21.2

This release changes the browser/PNG/WebM renderer only. Exporter versions stay
`nwn-ascii-vfx-0.21.1` and `nwn-binary-vfx-0.21.1`. No document migration, source
parameter correction, new revision, history rewrite or artifact replacement is
performed. Document schemas 1–12 and all 49 WebMCP tools are unchanged.

## Geometry and camera

Each particle is an instanced square facing the camera. Its full side in metres
is the sampled `size * layer.scale * instance.scale` (instance scale is 1 for a
single project). The centre follows the existing source transform; the quad is
expanded in camera space and its four corners are projected normally.

For a centred square at camera-space depth `d`, vertical FOV `f` and output height
`H`, its projected side is `H * size / (2 * d * tan(f / 2))`. Use radians in that
formula. FOV does not change the document or exported model dimensions. Layer
and composition scales each apply once.

The old `gl_PointSize` calculation omitted FOV, and capped particles at 300 px.
At FOV39, an unclamped old sprite was about 0.70824 times the correct metric
width (about half the area). A fresh 0.21.2 render of the same source can therefore
look larger. Do not compensate by modifying source/export size automatically.

Two triangles replace each GL point, removing both the application cap and
hardware point-size limits. Normal viewport/near/far clipping applies to the
quad, including when its centre is outside the viewport. Camera near/far remain
0.05/100 m. Large translucent layers can increase GPU fill cost; existing layer,
particle and composition budgets remain in force.

## Time, speed and appearance

Particle `life` and initial `speed` equal their authored values. The old hidden
life multiplier 0.85–1.15 and speed multiplier 0.6–1.4 are removed. There are no
new implicit random controls or changes to source values.

Explosion particles are born at `layer.start`. Fountain births retain the
existing seeded distribution over `layer.duration`; launch directions retain
the existing seed and spread. The historical random stream stride is preserved.
These birth/direction rules are preview approximations, not native timing proof.

Age is `instanceLocalTime - birth`. A particle exists on `[0, life)` and is absent
at exactly `age == life`, even with nonzero endAlpha. Colour, alpha and size use
`age / life`, with the existing shared `midPercent`. A PNG atlas uses this same
age in seconds with its own FPS, rather than normalized age or layer time.
Repeated renders of the same revision, camera and time are deterministic.

Custom PNG alpha remains `textureAlpha * sampledParticleAlpha`; UV orientation,
atlas frame order and blending modes are unchanged. Built-in procedural masks
remain approximations, including the smoke mask's 0.48 opacity multiplier.
Orientation, gravity and the existing full-displacement scale are unchanged.

## Public operations and adoption

Read `version`, then use existing `preview.request` or `preview.compose` at an
explicit saved revision. `jobs.get` and the handoff metadata identify the actual
`rendererVersion`. Old jobs and idempotency keys still return their old artifacts;
use a fresh key to request a corrected image.

```text
nwn-vfx --json preview request --project <project-id> --revision <revision> --time 0.25 --format png --camera-file camera.json --idempotency-key <new-render-key>
nwn-vfx --json jobs wait <job-id> --timeout 30s
nwn-vfx --json artifacts get <png-artifact-id> --out <explicit-file.png>
```

Example camera: `{"position":[0,-8,0.7],"target":[0,0,0.7],"fov":39}`.
WebMCP uses `studio.preview.request({viewSessionId,input:{projectId,revision,
time:0.25,format:"png",camera},idempotencyKey})`, followed by `studio.jobs.get`
and bounded `studio.artifacts.read` chunks with full size/SHA-256 verification.
Human locks, AI pause, grants and draft protection are unchanged.

Open a fresh editor tab after upgrading. Preserve existing tabs with unsaved
work: they retain their loaded renderer until refreshed. A new server PNG can
differ from an old tab's live preview without any source change. No automatic
reload or draft replacement occurs.

## Evidence and limits

`npm run test:preview-metrics` compares real production pixels against an
independent world-space mesh and a pinhole calculation at FOV10/30/39/60/90/120,
depths 2/8/20 m and DPR1/2. It checks large sprites, viewport/near/far clipping,
exact lifetime/alpha/velocity across seeds, instance scale and 2000 particles.
Existing particle, texture, atlas and composition tests cover UI, PNG and WebM.

This establishes preview geometry and source timing, not equivalence with NWN.
Native particle physics, sorting, blending, texture filtering and character
occlusion still require the consumer's qualified game test. The editor's faint
wireframe reference is not an opaque character. No native tools are started.
