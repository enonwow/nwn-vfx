# Emitter emission export — Studio 0.21.1

Build candidates through the unchanged public `candidate.build` operation,
CLI `candidate build`, or `studio.candidate.build`. Both ASCII and binary
exporters are 0.21.1. Document schema 12, ZIP source format, permissions,
locks, pause and revision rules are unchanged. Refresh closed output schemas
for the new exporter version; open a fresh tab and preserve old human drafts.

When all enabled Explosion emitters share one start time, export now writes
one global `detonate` at that exact time and a constant base and animated
`birthrate=count` for each Explosion emitter. This removes the dependence of
its count on controller sampling before/after the event. No start is moved,
and no extra detonate is inserted. Fountain emission is unchanged.

Several distinct Explosion starts still use the previous event-time gates.
Their values match the authored count exactly at their own event and zero
at other events, but an engine frame can miss a narrow peak or fire the wrong
emitter. Export reports `EXPLOSION_FRAME_SAMPLING_UNQUALIFIED` and
`checks.burstEventsIsolated:false`. This is a known limitation, not a repaired
multi-burst runtime guarantee. `burstEventTimeValuesRead:true` means exact
event-time values were checked. `nativeBurstTimingVerified` stays false.

Every candidate includes `emitter-emission.json` outside the resource HAK.
It records the source model hash, actual event times, minimum spacing,
base/animated birthrate values and nonzero key intervals. Its 24 experiments
cover 30/60/120 Hz, four frame phases and controller sampling before/after a
frame. They assume crossed global events share that frame's controller value
and round counts to nearest integer. They report missing/changed own bursts
and foreign particles. This is a sensitivity experiment, not observed NWN
behavior or a complete physics simulation.

Binary candidates add the exact binary model hash and direct reads of the
serialized event table, emitter flags and birthrate controllers. These are
checked independently of the compiler's text decompiler. Event names end at
NUL; unused trailing storage is not treated as a different event name.
Existing atlas, geometry, normal and full resource dependency checks remain.

For a controlled native comparison, fork an exact source revision and explicitly
set enabled Explosion starts to one shared time using `changes.preview/apply`.
That is a changed diagnostic variant, not a silently corrected original.
Compare a bright static texture, a single atlas particle and the full cloud.
Use `jobs.get` then `artifacts.get/read` (WebMCP) or `artifacts download` (CLI),
verify size/SHA-256, and pass resources to the consumer. A native-qualified
consumer chooses 2DA rows and effect application; Studio does not install or
launch NWN/Toolset. `nativeVerified:false` remains mandatory.

Reference comparison: actual vanilla `vim_magblue` has static Explosion counts
70/30 and `impact`/`detonate`; `vim_exp2flame` uses a 4×4 atlas with frames
0–15 at 16 fps. See the firsthand [emitter format guide](https://nwn.wiki/pages/viewpage.action?pageId=139690011).
The alternate [rollnw event importer](https://github.com/jd28/rollnw/blob/main/lib/nw/model/mdl_particle_import.cpp)
and [particle system](https://github.com/jd28/rollnw/blob/main/lib/nw/render/particle_system.cpp)
illustrate frame-time sampling; they do not establish the retail engine's order.
