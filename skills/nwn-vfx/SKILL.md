---

name: nwn-vfx

description: Create and edit Neverwinter Nights VFX projects, emitters, PNG textures, OBJ geometry, materials, mesh animation, timed 3D trails and WAV/MP3 audio clips through NWN VFX Studio CLI from any repository or WebMCP in a connected editor tab; render previews and retrieve resource candidates. Native tests require a separate qualified runner.

---



# NWN VFX Studio

Studio 0.29.0 adds the experimental linked-periodic-pan-v1 material:16 shared preview/export frames, two deliberate segment repeats, three safe points and scoped no-mipmap TXI. Read docs/agents/beam-periodic-pan.md and its public STATIC/ANIMATED example. Document23/ZIP18/header23; legacy nativeMotion remains blocked, nativeVerified:false.


Studio 0.28.2 adds up to four independent static Linked strands beside finite Fountain in one main MDL, plus beam-only builtin beam-soft (constant along V, soft across U). Read docs/agents/beam-multistrand.md and its executable public example. New use requires document22 / ZIP17 / minimum0.28.2 / header22. Each strand has its own authored parameters/reference; shared endpoints/direction remain atomic. Fountain and legacy resource bytes are preserved. This does NOT support phase-controlled weaving or helices between moving endpoints; seed is preview-only and Linked periodically regenerates shape. NativeMotion remains blocked; nativeVerified:false. Preserve old drafts and open a fresh tab after the lab upgrade.



Studio 0.28.1 supports one static Lightning/Linked strand plus finite Fountain/P2P in the same main model. Read docs/agents/beam-composite.md and examples/beam-composite. Document21 / ZIP16 / header21 / minimum0.28.1. Shared endpoints/direction must change atomically across the strand and bound emitters; strand flow.speed=0. The UI adds a thin mapped strand and edits common ends from the flow inspector. cast01 gates particles only; the static strand remains until the consumer removes the SAME instance after all lastDeath times. Type7 Param6 remains cast01. nativeMotion export stays blocked; victim-to-hand with caster-hand root is still unsupported. Binary readback checks both emitter modes separately. The compiler decimal-boundary fix accepts identical float32 end times only in compiled roundtrip parsing; source/output bytes and old jobs are unchanged. Use a new candidate key. No native process, integration or art acceptance is authorized here. Keep old services/projects/drafts intact and use the supplied isolated CLI/config.

Studio0.28.0 adds compact diagnostics/benchmarks, independent iteration ZIPs, controlled preview/concepts, immutable components, named event timing and external reports. Read docs/agents/iteration-workflow.md and iteration-contract-v1.md. Use the explicitly supplied isolated CLI/config; global0.26.2 and lab14384 remain separate. New operations require header20; authoring metadata promotes document20/ZIP15/minimum0.28. Full source stays immutable. Discover WebMCP after studio.tools.select({profile:"workflow"}) for iteration/reports/timing/components/OBJ, or {profile:"authoring"} for changes.preview/apply. All67 tool names remain available across bounded profiles, not simultaneously (host64KiB cap). Selection preserves grants/drafts. view.inspect includes workflowDrafts; dirty fields block same-project writes/navigation. Keep stable keys, verify candidate/report hashes, and resume jobs instead of rebuilding completed stages. NativeVerified stays false and art review remains human-owned.


The 2026-09-10 audit corrects Type7 animation binding to Param6=cast01 in new integration schema6. Historical schema3–5 / Param2 jobs remain readable and immutable; use a new build key. Type12 Param2 remains the endpoint model. The earlier packed 0.27.0 is held and must not be installed. Working source correction and byte-identical resource acceptance do not prove native playback. EffectBeam nBodyPart selects the effector/source node; reversing objects does not establish a target hand. Read docs/agents/beam-audit-2026-09-10.md.

Studio 0.27.0 adds optional atomic Fountain `beamBinding` for finite P2P/Bezier travel and separate source/target FnF endpoints. Read `docs/agents/beam-particle-flow.md` and `examples/beam-flow/` before authoring. Reuse appearance/PNG/flipbook/count/start/duration/life; main flow has zero speed/spread/gravity, scale 1, neutral orientation, zero position. All active bindings share endpoints/direction; do not mix enabled static Lightning. Create/fork through public operations, preserve accepted sources and old drafts. Source19 / ZIP14 / minimum0.27.0 / header19. `beam-flow.json` and integration schema6 describe one cast01 stream instance through feed+drain, object order, every finite gate, and separately dispatched endpoint Type12 / Param1 node / Param2 model / impact resources. Actual rig nodes and native timing must be tested by the consumer; no arbitrary graceful interruption. All generated MDLs compile/read back, but nativeVerified stays false. UI, CLI and all49 WebMCP tools share grants, locks, pause, revisions, retry, undo and raw beamBinding drafts. Omitted viewSessionId now uses the current tab grant; explicit mismatches still fail. Inspect connection/view first and never substitute the owner credential. Static mapping and the suspended nativeMotion atlas retain their previous behavior.


Studio 0.26.2 adds optional atomic static beam textureMapping:{axis:'u'|'v',fit:'source'|'alpha-bounds'}. Read docs/agents/beam-texture-mapping.md. U maps source left-to-right onto native V; V preserves bottom-to-top. Explicit crop/rotation changes a derivative only. Linked repeats the entire texture on EACH segment; mapped preview shows those repeats at native full width 2*width, without synthetic flow. This does not provide whole-span UVs or native motion. Null reset restores historical behavior/resources. Incompatible with nativeMotion; its export remains blocked. Document18 / ZIP13 / minimum0.26.2 / header18; locks, pause, drafts, revision, retry and undo apply. All49 WebMCP tools remain; use a fresh tab and preserve old drafts. NativeVerified stays false.


Studio 0.26.1 fixes a confirmed native Lightning crash: segments means edges and birthrate=segments+1 points (3/5/9/17/33/65). Regenerate all earlier beam candidates with fresh job keys; old immutable artifacts are unsafe to replay. Read docs/agents/beam-crash-2026-09-10.md. ASCII and binary both corrected; nativeVerified stays false. Enabled nativeMotion candidate exports are suspended with BEAM_MOTION_EXPORT_BLOCKED because the old two-point carrier crashes and three points would repeat the atlas, breaking whole-beam motion. Source/draft/PNG/preview/ZIP remain supported; do not claim native flow/phase support. For a static diagnostic fork explicitly reset nativeMotion:null. Schema17/ZIP12/header17 and human/agent collaboration remain unchanged; all49 tools remain. The 0.26 motion examples are preview/research material until a replacement profile is implemented.

Studio 0.25.0 adds authored EffectBeam Lightning/Linked layers through the same UI/CLI/WebMCP operations. Read docs/agents/beam.md and examples/beam. Create with preset empty + lifecycle beam, or atomically convert an own empty FnF project while preserving assets. Document16 / ZIP11 / minimum0.25 / header16. Width, PNG/material/color/alpha and Lightning noise export; source/target coordinates, seed and reversible flow speed/direction are PREVIEW INTENT ONLY. External lifetime; no native flow, start/cessation/draining tail, continuous endpoint particles or audio in the first beam profile. Beam metadata uses Type B / progfx Type7 with null row IDs for consumer allocation; direct ASCII/binary reference/controller readback is not native proof. All49 tools remain; preserve old drafts and use a fresh tab.

Studio 0.24.0 supports active audio clips on DUR timelines. Read docs/agents/duration-audio.md and examples/duration-audio before use. Audio import/add/set, gainDb/mute/offset/fades share UI/CLI/WebMCP rights, locks, pause, drafts, revisions and undo. First active DUR clip promotes document15 / ZIPv10 / minimum0.24 / header15; old FnF and revisions remain unchanged. Period must fit whole samples at 44100 and 48000Hz (1.6s = 70560/76800 frames). Preview cycles repeat exact period PCM; editor has at most one active source and stops previous playback on pause/Stop/project change. Compose still omits audio. Export audio-events.json v2 and one-period mono WAV require a finite consumer schedule at k*period while k*period < external lifetime. A single SoundImpact is NOT a native loop. Cancel future dispatch at stop; an issued WAV may finish after the visual, with action-queue delay. No native phase/instant stop proof; nativeVerified:false. Technical packaged tone is not an accepted wings recording. All49 WebMCP tools remain; preserve old drafts in a separate tab.

Studio 0.23.0 adds optional mesh deformationInterpolation: linear (also historical omission), monotone-cubic (zero endpoint velocity), or monotone-cubic-loop (exact endpoint positions and shared periodic tangent). Read docs/agents/deformation-interpolation.md and its packaged examples before use. Shared layer.set selection/null reset, UI control, field and animation locks, pause, revision, retry and undo. Document14 / ZIPv9 / minimum0.23.0 / schema header14. No extra source keys or geometry changes. Analytic curve C1; preview/export share linear 60Hz samples (C0); coordinate bounds and pinned vertices preserved. Smooth error metadata is a conservative curvature bound; sampled normals/native appearance remain limited. All49 WebMCP tools remain; open a fresh tab preserving old drafts.

Studio 0.22.0 adds optional lifecycle impact/duration (document13, ZIPv8). Read docs/agents/duration.md and duration-format.md before authoring sustained meshes or matched FnF → DUR → FnF phases. Explicit impact preserves authored boundary alpha; omission retains historical ramps/resources. DUR currently accepts enabled meshes only, validates C0 seams, and uses document.duration as one loop, separate from external NWScript lifetime. Deformed loop length is a multiple of 1/60s. preview.request cycles 1–10 (total<=30s), and preview.compose instance duration extends DUR without changing source. New duration ASCII/binary experimental profiles; nativeVerified:false, no engine phase introspection. Schema header13; refresh the tab while preserving older drafts. All49 WebMCP tools and grant/retry/lock/pause rules remain.


Studio 0.21.2 corrects particle preview geometry and timing. Read installed `docs/agents/particle-preview.md` when judging scale/density: camera-facing metric quads replace GL points, include FOV, and remove the 300px/hardware cap. Life and speed equal authored values without hidden jitter; age is local time minus seeded birth, active on [0,life), with the same age driving appearance and atlas frames. Fountain births/directions keep their existing seed stream. Exporter remains 0.21.1; no document, revision, history or old artifact changes. Use a fresh PNG/WebM job key and inspect rendererVersion. Open a fresh tab preserving old human drafts. Larger corrected sprites are not a reason to silently rescale source/export. Native appearance remains unqualified.



Use the installed `nwn-vfx` command from the caller's working directory, or WebMCP when collaborating in a connected Studio tab. Both share the editor's operations, service and project history. Do not edit Studio's SQLite, internal files or exported MDL to bypass its operations.



## Work with a human in a browser tab



Studio 0.21.1 provides 49 WebMCP tools in a supporting host. The human connects the chosen project through **Połącz agenta → Udostępnij projekt AI**. Discover the actual tab's WebMCP tools with the browser connector, then call `studio.connection.inspect({})`. In Codex's browser REPL, display results with `nodeRepl.write(...)`. The connection result identifies the tab's `viewSessionId`, granted project, agent identity, scopes and expiry; it never returns a credential. A missing browser API, no discovered tools, and `WEBMCP_NOT_CONNECTED` are different conditions. Report them accurately; a CLI or DOM fallback is not proof of WebMCP operation. Preserve any old tab containing unsaved work when updating; use a separate new tab for new tools.



The grant lasts at most 30 minutes and is limited to the shared project and this agent's own variants/projects. **Odłącz WebMCP** revokes it. Human locks and AI pause apply, including view changes. Tools cannot administer actors, remove human locks or approve artwork for the human. Do not extract browser credentials or substitute the owner's cookie.



Call `studio.view.inspect({viewSessionId})` before acting on the visible editor. It returns project/revision, `viewRevision`, selection, preview time/playing state, and separate `savedDocument` and unsaved `draft`. `meshEditorDrafts` contains pending geometry/animation/path JSON text by layer ID, with `{text,baseline}` per field. It may be invalid; preserve it as human work. `draftDirty` and `viewRevision` include these edits, which block UI save/project switching until applied or discarded. Domain commands use `{viewSessionId, input: <shared operation input>, idempotencyKey?}`; use the discovered schema. Durable mutations require the same stable keys and revision handling described below for CLI. They operate on saved revisions; viewing the human's draft does not authorize overwriting it.



`studio.view.set` takes explicit project/revision and expected view revision to change selection, time or playback. `studio.view.open` takes an explicit target project and expected view revision; it refuses an unsaved draft or a pending save. On `DRAFT_CONFLICT`, `VIEW_CONFLICT` or `REVISION_CONFLICT`, inspect again and resolve the actual conflict instead of blindly retrying. Changing a saved project does not silently switch the human's tab to it.



Read job results with `studio.jobs.get`. `studio.artifacts.get` returns metadata; `studio.artifacts.read({viewSessionId, artifactId, offset?, length?})` returns bounded base64 chunks, offsets, `nextOffset`, and `chunkSha256` (default 65536 bytes, maximum 262144). Assemble to `nextOffset === null`, then verify full size and `artifact.sha256` before handing off the file. Keep the destination explicit, including when working from the last city. API envelope version remains 0.1.0. Document schemas 1–19 are supported; audio promotes to 9 and gain above 4 to 10; explicit mesh shading promotes to 8; custom mesh deformation promotes to 7; trails promote to 6; emitter orientation promotes to 4; adding mesh promotes an existing document to at least 2, textures/UV/lifecycle controls to 3. Refresh closed client schemas for the layer union and capabilities.



Studio 0.15.1 fixes project switching during playback: the outgoing clock is stopped before the new project is published and stale animation frames are ignored. A selected audio project starts at time 0, paused and muted with no active source; Play starts from that zero. Open a fresh tab after upgrading and preserve any existing human draft. Exporter/resource format remains 0.15.0.



Studio 0.18.0 replaces saved clip percentages with **Wzmocnienie (dB)** (-60 to +24 dB; slider step 0.5, precise field) and separate **Wycisz**. `audio.add/set` accept mutually exclusive `gainDb` or linear `gain`; domain conversion is `10^(gainDb/20)` once, and only exact gain is stored. Gain 0 mutes; `gainDb:0` restores source level. Gain 1.5/3/6 display +3.52/+9.54/+15.56 dB without rounding stored values on unrelated edits. `projects.inspect`/`revisions.get` diagnostics expose `clips:{gain,gainDb,muted}` (silence dB=null); view context adds saved/draft `audioClipGains`. Preserve pending audio text including raw gain, gainDb text and muted; old percentage drafts remain readable. Read `changes.preview` stereo48k/mono44.1k `peakDbFS` (silence=null) and clipping counts before apply/export. No normalization or limiter. Gain >4 promotes the new revision to schema 10 / ZIP v5 (minimum Studio 0.18.0); max gain is 15.848931924611133. Existing schema 9 stays <=4 with exact old revisions/ZIP v4. Audio capabilities version 4; clients/adapter declare `X-NWN-VFX-Document-Schema: 10`. Missing/old declarations receive `CLIENT_UPGRADE_REQUIRED` for new dB/schema10 operations, without mutation. Open a fresh tab and preserve old human drafts. Exporter metadata is 0.18.0. Full contract, migration, limits and examples: docs/agents/audio.md.



## Preview multiple VFX instances together

Studio 0.21.0 adds `preview.compose`, CLI `preview compose --input-file PATH --idempotency-key KEY`, and `studio.preview.compose`. Read installed `docs/agents/composition-preview.md` before using it. Input supplies exact `instances[{id,projectId,revision,start,position,yawRadians,scale?,snapshotSha256?}]`, duration, optional time/format/camera/referenceGeometry. It produces one PNG/WebM, composition.json and handoff.json, with immutable source hashes and per-instance local clocks. It never edits source revisions or tab drafts and is not an NWN model. Limits: 24 instances,256 layers,32000 particles,30s; bounded aggregate geometry/texture/source budgets. Audio omitted; nativeVerified:false. Every source needs read/render rights and all-source access also protects result reads. Browser grants cover the shared project plus their own projects/variants, not arbitrary existing projects; use an explicitly scoped CLI actor for separate existing sources. Send X-NWN-VFX-Composition-Preview:1 and document schema12; older clients fail on composition metadata. Open a fresh tab preserving old drafts. Workspace-scoped operations.resolve omits projectId. The job projectId/revision are a first-source list anchor; inspect the full manifest.

## Animate emitter textures with a PNG atlas

Before native candidate export, read `docs/agents/emitter-emission.md`. Studio/exporter 0.21.1 keeps a constant base and animated count when all enabled Explosion emitters share one start; exactly one detonate remains at that time. Distinct starts retain event-time gates and explicitly report `EXPLOSION_FRAME_SAMPLING_UNQUALIFIED` / `burstEventsIsolated:false`. Never silently align source timings. The new `emitter-emission.json` artifact records source/binary hashes, controller/event/flag readback and before/after-frame sensitivity experiments. These are not retail NWN observations. Use explicit forks for comparisons; preserve accepted sources and drafts. Refresh closed output schemas for exporter 0.21.1 and use a fresh tab. CLI/WebMCP operations and rights are unchanged.

Studio 0.20.0 adds optional atomic emitter `flipbook:{columns,rows,frameStart,frameEnd,fps}` through `layer.add/set`, UI and WebMCP. Read installed `docs/agents/emitter-flipbook.md` before authoring. Use an existing custom PNG. Columns/rows are 1,2,4,8,16; cells at least 8×8 pixels, at least two frames; fps integer 1–60. Source frame zero is top-left, then right and down; endpoints inclusive. Repeat from each particle's own birth, not global/layer time. `flipbook:null` restores static texture. No random playback, hold-last, zero-FPS or mesh atlases. Native `loop` controls Single emission and stays zero. Retail NWN sequence/UV/timing remain unqualified; the consumer performs that test.

First use or flipbook lock promotes document schema 12 / ZIP v7, minimum Studio 0.20.0; clients declare X-NWN-VFX-Document-Schema:12. Old schemas/revisions/PNG/static export remain unchanged; old clients receive CLIENT_UPGRADE_REQUIRED on the new feature. Discovery still lists 48 tools. Preserve pending `meshEditorDrafts[layerId].flipbook:{text,baseline}` (five input strings, possibly invalid; baseline includes texture and flipbook). Locks, pause, revision, idempotency, history, undo and draft protections apply. Render metadata carries `emitterFlipbooks`; ASCII readback layers carry `flipbook`, binary compilation carries `emitterFlipbookReadback` for directly read grid/controller fields. Export readback is not native proof. Open a fresh tab after upgrading; preserve old drafts.

## Orient a whole effect with its attached object

Studio 0.19.0 adds UI **Obracaj z postacią** and `project.set` values `{orientWithObject:true|false}` through changes.preview/apply in CLI and WebMCP. Canonical `document.orientWithObject` is optional; historical omission means false and is never rewritten on read. Explicit true/false or its owner lock `{layerId:"@effect",field:"orientWithObject"}` promotes a new revision to schema 11 / ZIP v6 (minimum Studio 0.19.0). Preserve other locks. Only an owner may change locks; pause, expected revision, undo and draft protections remain enforced. The clients declare `X-NWN-VFX-Document-Schema: 11`; older declarations receive CLIENT_UPGRADE_REQUIRED for this feature. Discovery stays available. Use a fresh tab, preserving existing human drafts.

Read installed `docs/agents/effect-integration.md` for the full contract/examples. Candidate jobs publish `vfx-integration.json`: schemaVersion1, projectId, revision, snapshotSha256, documentSha256, model:{resref,file,sha256}, orientWithObject, visualeffects2da:{rowId:null,columns:{OrientWithObject:0|1}}, nativeVerified:false. It is repeated at validation.integration.effect and handoff.metadata.validation.integration.effect, outside the resource HAK. Consumer chooses row and attachment. It does not attach ApplyEffectAtLocation or change layer orientation, geometry, animation, textures or audio. No rotating-character preview/native proof. Binary independent builds can differ in trailing event-name storage; verify source/readback and keep actual final model SHA. Reusing an earlier accepted binary requires explicit consumer lineage with both hashes, not relabeling the new handoff.

## Author audio on the effect timeline



Studio 0.15.0 supports immutable WAV PCM16 (mono/stereo 8–48 kHz) and MP3 imports, waveform rows and separate audio clips. Read installed `docs/agents/audio.md` for the complete contract and exact consumer examples. CLI `audio import/list/get/remove` and WebMCP `studio.audio.import/list/get/remove` share rights, revisions and idempotency. Import uses `fileName,dataBase64` in WebMCP and `--file` in CLI; import returns `{project,assetId}`. Add clips through `changes.apply` with `audio.add`, and edit/remove through `audio.set/remove`. Fields are `id,type:"audio",name,assetId,enabled,start,duration,offset,gain,fadeIn,fadeOut`. Times are seconds; gain 0–15.848931924611133 (schema 9 <=4), or gainDb -60 to +24; clip/source/effect boundaries are validated. One asset can feed multiple clips. Limits: 2 MiB original, 30 s, 8 audio assets, 32 clips, and the existing combined 6 MiB document limit including source/PCM base64 and all visuals. MP3 needs bounded FFmpeg decoding; originals and decoded hashes/provenance remain public through `audio.get`.



Preserve pending `meshEditorDrafts[clipId].audio:{text,baseline}`. Selection uses `selectedLayerId`; `view.inspect` includes read-only `audioMonitor` and loop. `view.set` controls time/playing/loop with expected view revision but cannot unmute. Monitoring starts muted at gain .15; project changes reset mute. Only a human Play/unmute gesture unlocks sound. Monitor volume never changes exports. All clip locks, AI pause, undo and save-conflict rules apply.



WebM has mixed Opus audio plus an exact separate PCM16 stereo/48 kHz `audio-mix.wav`. Portable ZIP v4 carries source/decoded dependencies and reconstructs exact schema 9. Native candidates contain real PCM16 mono/44.1 kHz WAV resources and `audio-events.json`. Prefer its full-timeline `preferredIntegration.resref`, including leading silence, for explicit consumer binding to `visualeffects.2da.SoundImpact` and one VFX trigger at time zero. Per-clip events/NSS are an alternative with PlaySound action-queue limitations; never trigger both. No automatic playback from HAK, no native qualification or module editing by Studio. Source resampling/downmix is an explicit derivative, not a source overwrite; do not apply EQ, tempo changes or new delays to accepted recordings.



## Recolor a whole effect



Studio 0.13.0 adds `palette.preview` and `palette.apply` (CLI `palette preview/apply`, WebMCP `studio.palette.preview/apply`). Read installed `docs/agents/palette.md` for the options and full workflow. Pass `{from,to,scope:{layerIds:"all"|string[],excludeLayerIds:[],includeDisabled:false},textureMode:"preserve"|"transform"}` as `options`; preview returns document/diff/report/proposalHash. Apply requires that exact proposal hash, expected revision and stable idempotency key. UI **Paleta efektu** offers the same A/B preview and one-revision commit. Pending `paletteDraft` in view context is human work and blocks navigation.



The versioned Oklch hue rotation keeps relative hues and lightness, reducing chroma to fit sRGB. Anchors specify hue only. Neutral colors and black self-illumination stay unchanged; explicit material replaces legacy mesh color semantics. PNG transformation is explicit and copies the asset, preserving alpha/UV/original bytes and excluded references. It requires neutral effective multipliers; `PALETTE_TEXTURE_TINT_CONFLICT` refuses texture-plus-colored-tint ambiguity. No semantic masks or automatic blood/bone detection. Scope/exclusions, 8 assets/2 MiB PNG/6 MiB document, locks and AI pause remain enforced. Use `changes.revert` to undo; render/export the returned saved revision. This task handles authoring, preview and export only; Toolset/NWN launch and module integration belong to the consumer task.



## Discover the installation



Document schema 5 adds optional atomic mesh `material:{diffuse:'#RRGGBB',selfIllumination:'#RRGGBB'}`. Omission keeps the legacy unlit behavior; null in layer.set resets it. Preview uses fixed Lambert lighting and remains approximate/nativeVerified false. Import OBJ with `meshes import-obj --project ID --expected-revision N --layer ID --file PATH --source-up z --meters-per-unit 1 --normals flat --preview`; remove `--preview` and add a stable `--idempotency-key` to commit. Optional `--texture-asset SHA256` assigns an already imported PNG; `--new-layer-file JSON` explicitly creates a layer instead of `--layer`. WebMCP equivalents are `studio.meshes.importObj.preview` and `studio.meshes.importObj`, using `objText` and `target:{layerId}` rather than paths. Preserve independent UV indices. Limits: 1 MiB OBJ, 2048 positions, 4096 triangles, 8192 UV, UV[0,1], final coordinates ±20m; no auto centering/scaling, MTL reads, triangulation, decimation or rig import. Source normals/smoothing/labels are explicitly diagnosed; flat normals are required. Pending human OBJ source/options appear in `meshEditorDrafts.obj`; preserve them like pending geometry/animation JSON.



Reclaim texture slots with `assets remove --project ID --expected-revision N --asset-ids SHA_A,SHA_B --idempotency-key KEY` or `studio.assets.remove`. Only explicitly selected unused assets can be removed; any reference, including a disabled/locked layer, refuses the entire command. History and revision ZIPs retain exact PNG bytes. Undo preserves independent later assets and refuses capacity overflow or already reimported IDs; limit remains eight. See the installed `docs/agents/obj-material.md` for complete schemas, transforms, material and portable-source limits.



Run `Get-Command nwn-vfx` on Windows, then:



```text

nwn-vfx --json doctor

nwn-vfx --json capabilities

nwn-vfx --json projects list --limit 20

```



If the configured service is stopped, `nwn-vfx service start` starts it explicitly. Do not replace an already running instance. `doctor` reports instance/workspace identity; cwd and an open browser tab do not select a VFX project. Use `--workspace` when a specific configured workspace was requested. If the command is missing, report the missing installation instead of inventing a repo-relative executable.



Use the client's assigned credential through `NWN_VFX_TOKEN` or its configured connection (`NWN_VFX_CONFIG`). Owner credentials are for owner-authorized setup; being in another repo does not grant ownership. Never print or commit credentials. `actors create` is an owner operation whose response includes a secret: capture it privately when provisioning is authorized.



## Work on a concrete revision



Read `projects inspect --project <id>` and `schema get changes.apply`. Use stable IDs, current revisions, locks and capabilities from the replies. Ambiguous names require choosing an ID. Presets are `coil`, `vial`, `empty`; supported authoring/export layers are `emitter`, `mesh`, `trail` and experimental `beam`.



For a requested variant, `projects fork --project <id> --revision <n> --name <name> --idempotency-key <key>` returns a new project ID. Read that ID and revision from the response. Its input document drives both preview and export.



A changes file is a JSON array, for example:



```json

[{"type":"layer.set","layerId":"sparks","values":{"speed":2.8,"life":0.6}}]

```



Use the real layer ID and values required by the user's task. Then:



```text

nwn-vfx --json changes preview --project <id> --expected-revision <n> --input-file <patch.json>

nwn-vfx --json changes apply --project <id> --expected-revision <n> --input-file <patch.json> --idempotency-key <saved-key>

```



Generate and retain a distinct key of 8–160 characters for each intended mutation. A retry after a lost response uses the same input and key, even if the project has advanced. Recover the result with `operations resolve --operation changes.apply --project <id> --idempotency-key <saved-key>`. A revision conflict requires reading the new state and recomputing the proposal, not silently replacing the expected revision. Human locks and a pause on AI writes apply equally to external clients.



`changes revert` targets one `operationId`; it preserves independent later edits and refuses dependent/structural changes it cannot safely undo. `revisions restore` replaces the whole document as a new revision and is an owner operation. Do not use it as a substitute for selective undo.



## Orient an emitter



Since Studio 0.5.0, emitters support optional static `orientation:[axisX,axisY,axisZ,angleRadians]`. The axis must be unit length (tolerance 1e-5); angle is within ±8π. This is a right-handed rotation of the emitter's local +Z launch cone and initial velocity. It does not rotate the emitter position or gravity. Positive `gravity` acts down world Z, negative acts up. Preview retains the existing full-displacement scale: `position + scale * (R * localVelocity * age + [0,0,-.5*gravity*age*age])`. Native NWN mass and trajectories remain unqualified.



Use the existing `layer.add/set` through CLI or WebMCP. +X is `[0,1,0,1.5707963267948966]`; +Y is `[1,0,0,-1.5707963267948966]`; -Z is `[1,0,0,3.141592653589793]`. Read the actual layer ID and expected revision before submitting. Omission is neutral `[0,0,1,0]` and preserves historical behavior. Explicit orientation promotes the document to schema 4. `orientation:null` in `layer.set` removes the emitter field; it is invalid for mesh. Promotion never downgrades, including subsequent asset import. This field is replaced/locked/undone atomically, subject to human locks and AI pause. No animated emitter orientation is supported.



The UI offers six axis presets and explicit normalization/application of a custom axis. Pending inputs appear in the existing `meshEditorDrafts[layerId].orientation` view context as `{text,baseline}`; `text` is JSON containing four input strings and may contain invalid/incomplete values. Preserve this human work. It blocks saving/project switching until applied or discarded. PNG, WebM and candidate build must use the same saved revision. MDL readback verifies the static emitter orientation, neutral parent and unchanged physics fields; this is not native NWN proof.



## Author mesh and keyframes



Add a complete layer through `layer.add`. This generic box fits a document at least 1 second long; choose a unique ID and parameters for the actual project:



```json

[{"type":"layer.add","layer":{"id":"impact_box","name":"Impact box","type":"mesh","enabled":true,"start":0,"duration":1,"position":[0,0,0.5],"orientation":[0,0,1,0],"scale":1,"color":"#ffbb66","alpha":1,"geometry":{"kind":"box","dimensions":[0.2,0.15,1]},"animation":{"alpha":[{"time":0,"value":0},{"time":0.1,"value":1},{"time":1,"value":0}]}}}]

```



`geometry` is `box` with `dimensions:[x,y,z]`, `ring` with `innerRadius`, `outerRadius`, `segments`, or `custom` with `vertices:[[x,y,z],...]` and zero-based triangular `faces:[[i,j,k],...]`. Box is centered on its origin; ring lies in XY, with inner radius 0 producing a disk. Face winding defines the visible side. Limits: 32 layers, 2048 vertices/4096 faces per custom mesh, 8–128 ring segments, 6 MiB compact UTF-8 JSON per document. Read the current schema for numeric bounds; degenerate faces and outer radius ≤ inner radius are rejected.



`animation` has optional `position`, `orientation`, `scale`, `alpha` arrays of `{time,value}`, up to 64 keys each. Times are strictly ascending, local to layer `start`, in 0–`duration`; `start + duration` must fit the effect. Positions are absolute layer coordinates in NWN Z-up meters. Orientation is `[axisX,axisY,axisZ,angleRadians]` with a unit axis; neutral is `[0,0,1,0]`. Scale is uniform (0.01–10), alpha is 0–1. Position/scale/alpha interpolate linearly; orientation uses shortest-path quaternion SLERP, so full turns need intermediate keys. A first key later than 0 interpolates from the base value at 0; the last value is held until the layer ends. Mesh is hidden outside its interval.



Edit through `layer.set` with `values.geometry` or `values.animation`. Each replaces the whole field, so read first and preserve channels you are not changing. Field locks and selective undo treat geometry/animation atomically. Shorten mesh timing and keys before shortening the effect below their end. For motion, inspect multiple preview times and the video from one saved revision.



## Choose mesh shading



Studio 0.12.0 adds optional mesh `shading:"flat"|"smooth"` through public `layer.add/set`; null in set removes it, and omission preserves previous flat appearance. Explicit use promotes schema 8. Since Studio 0.14.0, smooth supports custom geometry with animation.vertices as well as rigid meshes. Position/orientation/scale/alpha keys remain allowed. Preview recomputes normals from interpolated 60 Hz positions; export retains only static base normals. It averages area-weighted face normals only at shared authored position indices, never welding separate or coincident components. Independent UV indices preserve smooth normals across texture seams; duplicate position indices retain hard seams. Undefined/cancelling normals and collapsing triangles reject the change. Smooth deformation checks continuous authored motion and sample intervals crossing authored knots, including disabled layers. No subdivision or silhouette improvement is implied. Use an explicit diffuse material to see the shading; existing unlit material is preserved.



UI Cieniowanie edits the same draft field, locked as shading or whole layer. AI pause, revisions, idempotency, history, undo and ZIP remain enforced. PNG/WebM metadata.meshShading hashes match ASCII readback.meshes[].shading. For smooth deformation, deformationNormals.frameNormalHashesSha256 is derived from position samples, not an exported normal channel. ASCII checks smoothing masks and all position/UV samples; binary compilation.normalReadback checks actual static base normals for base trimeshes and smooth animmeshes in both geometry/animation trees, tolerance 0.0002. Its coverage is explicit; animmeshNodes and animatedNormalSamples:0 are read from binary data. capabilities.meshShading.exportedAnimatedNormals is false. The unchanged pinned compiler has no animated-normal input; the legacy format field alone does not prove support. No PBR/native appearance qualification. OBJ import still uses its existing flat normal policy; apply smooth afterward. Full recipes: installed docs/agents/mesh-shading.md and docs/agents/smooth-deformation.md; own portable examples under docs/agents/examples/shading/ and docs/agents/examples/smooth-deformation/. Setting only shading preserves all authored keys, UV and materials. Never replace nonuniform vertex deformation with uniform scale to bypass a limitation.



## Deform a custom mesh



Studio 0.11.0 adds `animation.vertices:[{time,value:[[x,y,z],...]}]` to custom mesh layers through the existing `layer.add/set` operations. Positions are absolute mesh-local Z-up metres before position/orientation/scale; every key has the exact base vertex count and order. Faces and independent UV indices remain fixed. Supply 1–64 keys with strictly increasing local times in 0–layer.duration, finite coordinates within ±20 m. A later first key interpolates from base vertices at time 0; a zero key overrides them; the last value is held. Remove the channel to return to rigid geometry. Read and preserve all other channels when replacing the atomic animation field. Geometry and animation changes must remain compatible. Schema promotes to 7 and never downgrades.



Preview, PNG/WebM and ASCII/binary use the same global 60 Hz vertex samples with linear interpolation. Off-grid authored knots are approximated explicitly: `validation.readback.meshes[].deformation` reports maximum local deviation, all-samples-read status and animverts/animtverts SHA-256; render metadata `deformations[]` carries matching hashes. Uniform layer scale multiplies local error. The enabled mesh+trail total is limited to 1,000,000 position and 1,000,000 UV samples over the entire document duration; 6 MiB compact source, 2048 custom vertices, 4096 faces and 8192 UV limits remain. No silent decimation, changing topology or fluid solver.



UI **Klucze animacji JSON** edits this channel; pending text remains in `meshEditorDrafts[layerId].animation`, protected by the existing save/conflict/lock workflow. Preview recomputes normals per frame: flat by default, shared-position smooth when explicitly selected. Export does not provide animated normal keys or qualify native lighting. For non-glowing blood use normal blend, an authored red PNG, explicit diffuse and black selfIllumination. Baked highlights can suggest wetness; no PBR, dynamic wet specular/reflections or light authoring is exposed. NativeVerified remains false.



Complete sequential CLI/WebMCP commands, a 0.40–0.85 s technical example with an off-grid local 0.137 s key, PNG, camera, coordinate/normal details and limits: installed `docs/agents/mesh-deformation.md` and `docs/agents/examples/deformation/`. These are generic examples, not the author's Ugryzienie assets. Historical preset `empty` still creates `sparks`; the example removes that layer explicitly after texture import. Do not remove layers from an existing human project as an upgrade step.



## Author a custom trail



Studio 0.9.0 adds generic `trail` layers through `layer.add/set`, promoting to document schema 6. Use UI **Dodaj smugę** or the same CLI/WebMCP changes operations. A complete executable example and bounds are in installed `docs/agents/trails.md`. Each logical trail uses one of 32 layer slots; generated body/head animmeshes are internal and do not consume PNG asset slots.



Required fields include `path:[{time,position:[x,y,z]}]`, `width`, `tailLifetime`, `profile:'soft'`, `blend:'additive'`, `glowStrength`, `head:{enabled,size}`, `maxSegmentLength` plus common id/name/type/enabled/start/duration/color/alpha. Positions are metres, world Z-up. Supply 2–64 explicit points, first time 0, strictly increasing local times, distinct consecutive positions, max 128 subdivided segments. No inferred motion or automatic smoothing. Last path time plus tail lifetime must fit layer duration and the effect. An enabled head's journey must cover a complete global 1/60 s grid interval. Width and head size are full core FWHM (.001–.2 m); halo FWHM is 2.8 times width, glow strength 0–.3. Local tail age drives narrowing and fade; the optional small moving head fades while finishing its path.



PNG, WebM and native export interpolate the same 60 Hz vertex/UV samples. Causal opening takes up to 2/60 s. At most 1,000,000 vertex samples across enabled trails/heads and 128 MiB ASCII MDL; budget errors do not silently simplify paths. Read `trailAuthoring` capabilities and candidate `TRAIL_COMPILED_COST`, `TRAIL_SAMPLED_APPROXIMATION`, `readback.trails` for actual cost, serialized sample hashes and measured path deviation. Resource format roundtrip is not NWN qualification.



`path` and `head` replace/lock/undo atomically. Pending UI text appears as `meshEditorDrafts[layerId].path:{text,baseline}`; preserve it even when invalid. It blocks save/switch until explicitly applied/discarded. Portable Studio ZIP preserves schema 6 source, without generated sample arrays; import requires Studio 0.9.0+. Offline PNG/WebM preserve the default grid/reference scene from 0.8.0. No light, live attachment, collision or arbitrary vertex animation import is provided.



## Import textures and shape particle lifecycles



`assets import --project <id> --expected-revision <n> --file <explicit.png> --idempotency-key <key>` reads the local file in the caller's cwd and returns `{project,assetId}`. It creates a revision; assign `texture:"asset:<assetId>"` to a mesh/emitter in a subsequent `layer.set`. `assets list --project <id> --revision <n>` returns metadata; `assets get <assetId> --project <id> --revision <n>` includes original PNG base64. WebMCP equivalents are `studio.assets.import/list/get`; import input is `{projectId,expectedRevision,fileName,pngBase64}`, never a path or URL. These use project edit/read rights and AI pause. Duplicate image bytes reuse their SHA-256 identity without a new revision.



Import supports PNG RGBA8, noninterlaced, power-of-two dimensions 8–1024, up to 2 MiB/file, 8 images and 6 MiB compact document including embedded assets. RGB is sRGB, alpha linear; ICC, cHRM, nonstandard gamma and animated PNG are rejected. TGA is export-only. `blend` is `normal` or `additive`; custom assets default to normal. Mesh `texture:null` removes its map. PNG assets are immutable and preserved with history and portable ZIP dependencies.



For a source PNG with other dimensions, explicitly choose `assets import ... --target-size 512` or `--target-size 1024` (WebMCP import input: `targetSize:512` or `1024`). Only this option permits non-POT input dimensions 1–4096, RGB8 or RGBA8 without interlace, and an 8 MiB source limit. RGB8 receives alpha255; tRNS, unsupported color profiles and APNG remain rejected. The resulting RGBA8 PNG still has the 2 MiB stored-asset limit. Studio fits the image into a transparent centered square, preserves its aspect ratio to the nearest output pixel and uses area reduction or bilinear enlargement in linear sRGB with premultiplied alpha. It saves a new validated PNG without overwriting the caller's file. Omitting the option remains strict and never resizes. `asset.id` and `source.sha256` identify the actual stored PNG; `source.normalization.originalSha256` identifies the original input and the remaining normalization fields record originalColorType (2=RGB, 6=RGBA), dimensions, offsets and the versioned filter. Read both hashes from `assets get/list`. Deduplication preserves the first stored asset and its provenance. ZIP, previews and exports use the normalized PNG; the original source bytes remain with the caller.



Custom textured geometry needs `uv:[[u,v],...]` and `uvFaces:[[i,j,k],...]`, with one UV face per geometric face and independently indexed UVs in 0–1. UV origin is bottom-left. Ring/disk generates planar UV `.5+x/(2*outerRadius), .5+y/(2*outerRadius)`; box maps each face to the image. UV changes replace/lock the whole `geometry` field; preserve pending human JSON. Validate asymmetric patterns at multiple times before handing off an animated texture.



Emitters optionally expose `midColor`, `midAlpha`, `midSize`, and one **shared** `midPercent` from .01 to .99 (default .5). Start/end fields remain `color/endColor`, `alpha/endAlpha`, `size/endSize`. The midpoint is a fraction of each particle's age, not layer time. Omitted midpoint values preserve a linear channel; null restores the omitted default. Export writes start/mid/end controllers and the shared native percent fields. Do not invent independent channel percentages or arbitrary Bézier curves. Read discovery for current bounds.



## Control the render camera



Studio 0.8.0 `preview.request` accepts optional `camera:{position:[x,y,z],target:[x,y,z],fov:number}`; CLI uses `--camera-file PATH` (JSON up to 4 KiB), WebMCP passes the object directly. Metres, fixed world Z up, vertical FOV degrees. Finite coordinates ±100, distance 0.1–90 m, FOV 10–120°, XY distance at least 0.0001 m. Omit for the exact legacy camera `[3.4,-5.4,2.75]` → `[0,0,0.7]`, FOV39. Near/far0.05/100 m and output960×640 remain fixed. The same camera applies to PNG and every video frame and appears in job/handoff metadata; it never changes or scales the document. Example for a high effect: `{"position":[7,-11,6],"target":[0,0,2.6],"fov":45}`. Match revision and camera for PNG/WebM; changing camera needs a fresh job key. WebM still renders the full document at30fps. UI **Kadr z podglądu** opts into the current viewport camera for render submission, without modifying the draft. For 0.8.0 discovery use a fresh tab while preserving existing unsaved tabs. See installed `docs/agents/camera.md` for full examples and limits.



## Render, export and hand off



Studio 0.10.0 adds an explicit experimental binary build profile. Discover

`capabilities.exportProfiles`; when available, pass CLI `candidate build

--profile nwn-ee-impact-binary-experimental-v1` or WebMCP `studio.candidate.build`

input `profileId` with that value. Default builds remain ASCII; the document

and its revision are unchanged. The bundled resource-free Windows compiler is

hash-pinned and never starts NWN/Toolset. Read `validation.compilation` for

source/binary/roundtrip hashes and complete geometry/controller/sample checks.

The binary MDL and HAK must come from this job, never a manual substitution.

This diagnostic profile remains `nativeVerified:false`; only the qualified

runner can establish whether it resolves a particular native failure. See

installed `docs/agents/binary-export.md` for UI choice, commands, identities,

float32 tolerance, platform limits and artifact contents.

Studio 0.10.1 corrects the bundled compiler's source-commit metadata; the

executable and existing 0.10.0 candidates are unchanged. See the provenance

erratum in `bin/native/README.md`; preserve all original candidate hashes.



```text

nwn-vfx --json preview request --project <id> --revision <n> --time 0.5 --format png --idempotency-key <render-key>

nwn-vfx --json candidate build --project <id> --revision <n> --idempotency-key <build-key>

nwn-vfx --json jobs wait <job-id> --timeout 30s

nwn-vfx --json artifacts get <artifact-id> --out <explicit-destination>

```



PNG and WebM rendering work without an open editor. Since 0.5.1 on Windows the renderer selects full Chromium in headless mode (channel chromium), avoiding the console-subsystem headless-shell executable. Install with playwright install chromium; an only-shell installation is insufficient. Studio CLI and FFmpeg child processes use windowsHide. Both require the installed Chromium renderer; since 0.3.1, WebM also requires FFmpeg with `libvpx-vp9` on the service's PATH. WebM samples fixed 30 fps (`time = frameIndex / 30`) and encodes offline, so slow rendering extends job runtime rather than skipping effect time. Duration is rounded up to a whole frame. Use `--format webm` for the whole preview timeline. Render and build must target the same chosen revision. `accepted` means queued work; inspect the final job state. Timeout/Ctrl+C stop waiting, not the job. `cancelling` is still in progress. Explicit cancellation is `jobs cancel` with its own idempotency key.



List/recover work through `jobs list/get`; retrieve artifact metadata through `artifacts list/get`. Since 0.4.2, render failures retain bounded `error.details` with stage and cause, and frame index/time when available. Inspect these before proposing installation or retrying: a launch timeout is different from a missing Chromium executable, and later rendering/encoding failures identify their own stage. Historical failures may lack these details. The download command checks size and SHA-256 before publishing the file. Choose an existing destination directory; existing files require explicit `--overwrite`. Pass an authorized collaborator IDs and the `handoff.json` manifest, not internal storage paths. Knowing an ID alone grants no access.



`projects export` produces a portable Studio ZIP. Studio 0.7.2 exports portable manifest v3, storing each PNG once; importing reconstructs the exact document and verifies its snapshot hash. Import v3 with Studio 0.7.2 or newer; older v1/v2 archives remain readable. Limits stay 8 MiB ZIP, 12 MiB inflated entries and 6 MiB reconstructed document. `projects import --file` accepts that ZIP or a Studio JSON document as a new project. It is not a generic MDL importer. Resource candidates contain ASCII MDL, generated TGA/TXI and a resource HAK; installing them into a module is a separate consumer/runner action.



Mesh export writes real `trimesh` geometry and `positionkey`/`orientationkey`/`scalekey`/`alphakey` controllers in the MDL `impact` animation; inspect `validation.json` → `readback.meshes` and diagnostics. Static mesh alpha is 0. Nonzero alpha at layer boundaries needs a reported visibility ramp of up to 1 ms; alpha keys of 0 at both endpoints avoid that approximation. Custom textures produce TGA/TXI dependencies, bitmap and tverts/UV face indices, also packed in the resource HAK. Handoff manifests include snapshot and asset metadata. PNG/WebM and candidate build should use the same revision. Builtin emitter preview masks remain procedural approximations; custom PNG paths share decoded RGBA with export.



## Interpret the result honestly



Studio 0.14.1 removes duplicate static/keyed controllers from animmesh export. `validation.compilation.geometryReadback` directly checks draw indices, all binary vertex/UV samples and base/animation corner order. Re-export an existing saved revision with a new candidate.build idempotency key; no source edit is needed. Old keys retain old results. See installed `docs/agents/animmesh-export-audit.md` for the controlled native comparison. This fix removes an exporter ambiguity; the NWN heart artifact cause and native improvement require separate observation. Two MDL sections and the report's doubled triangle count do not mean two simultaneously rendered surfaces.



Studio 0.14.2 physically writes TGA rows bottom-first, uncompressed BGRA32 with descriptor 0x08. NWN assumes bottom-first even for older top-first descriptors; a standards-only decode hid the old incompatibility. `readback.textures[]` now reports `origin:"bottom-left"`, generator `shared-rgba-tga-bottom-first-2`, and `nwnBottomFirstRgbaSha256` equal to source `rgbaSha256`. All RGBA bytes, including hidden RGB under zero alpha, remain exact. UV, PNG assets, geometry, material and vertex keys are unchanged. Re-export the same saved revision with a new build key; old keys/artifacts are immutable. New content-derived texture/TXI resrefs prevent aliasing earlier TGA resources. Use a unique modelName for an explicit native comparison through shared `candidate.build`; see installed `docs/agents/tga-origin.md`. The heart texture reproducer is offline evidence, not a native appearance or repeated-playback qualification.



Since 0.6.0, `native test status --candidate <candidate.build-job-id>` reports candidate readiness and the missing qualified-native dependencies. WebMCP exposes the same read operation as `studio.native.test.status({viewSessionId,input:{candidateId}})`. Use the build job ID, not an artifact/model/project ID. The result binds project, revision and snapshot SHA-256, and distinguishes pending/failed candidate construction from `awaiting_qualified_runner`. It returns candidate artifacts separately from native evidence. `externalState:not_observed_by_studio` means an external operator may be working, but Studio has no accepted report of it. There is no native evidence importer or configured native executor; `native.test.request` still rejects without starting a job or native process. A successful status read is not a successful NWN test. Never supply a fabricated human observation or treat a marker screenshot as proof of an accessible entry surface.



Use `--json` for machine output: one object on stdout, progress on stderr. Discovery lists use `items` and `nextCursor`. Project and job operations usually return their object directly in `data`. Check `error.code` and `status`; `jobs get` may succeed while the job it reads has failed.



The browser is an approximate preview. Native mesh material/interpolation, particles, visibility, timing and physics have not been qualified: `nativeVerified: false`, `nativeTestAvailable: false`. An export build, readback or image is not a successful NWN test. Capabilities currently exclude qualified native testing, arbitrary ribbons/light authoring, animated emitter orientation, arbitrary MDL/FBX import and standalone MCP. WebMCP availability also depends on the current browser host. History's `committedAt` is the revision's actual commit time; `createdAt` belongs to the project. Legacy missing author/time metadata is nullable. Do not launch NWN through a new script or sign an artistic approval on the human's behalf.



For less common commands use `nwn-vfx --help` and `schema get <operation>`. `operations call` only invokes registered operations with the same validation and rights; it is not a raw shell.

