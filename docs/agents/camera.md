# Explicit render camera — Studio 0.8.0

`preview.request` optionally accepts `camera:{position:[x,y,z],target:[x,y,z],fov:number}`. The camera belongs to the render job, not the effect document: no project revision, geometry, scale or candidate resources change. PNG and every frame of WebM use this same static camera. Job metadata and `handoff.json` record the effective camera, including when omitted.

Coordinates are metres in NWN's Z-up world. `fov` is **vertical field of view in degrees**. Position and target coordinates must be finite and within ±100; their distance must be 0.1–90 m; FOV must be 10–120°. The XY distance must be at least 0.0001 m, avoiding an undefined Z-up roll when looking directly along Z. No extra fields, implicit partial defaults, null, auto-fit, animation of the camera or content scaling are supported. Near/far clipping remains 0.05/100 m, resolution 960×640. Choose a frame that includes the complete effect at all times.

Omitting `camera` retains the previous camera exactly: position `[3.4,-5.4,2.75]`, target `[0,0,0.7]`, FOV `39`. Existing jobs and old browser tabs remain valid. Explicit export cameras bypass interactive orbit distance/angle clamps.

## CLI from any project

Create an explicit local camera file (maximum 4 KiB), for example `camera-high.json`:

```json
{"position":[7,-11,6],"target":[0,0,2.6],"fov":45}
```

```powershell
nwn-vfx --json preview request --project PROJECT_ID --revision REVISION --format png --time 1.48 --camera-file 'C:/path/camera-high.json' --idempotency-key high-png-001
nwn-vfx --json preview request --project PROJECT_ID --revision REVISION --format webm --camera-file 'C:/path/camera-high.json' --idempotency-key high-webm-001
```

The CLI sends the parsed camera, never the file path. Use the same revision and camera file for PNG and WebM. WebM always samples the full document at `k/30` seconds with `ceil(duration*30)` frames; `time` chooses the PNG instant and does not trim video. Use `jobs get`, then `artifacts get --out` as usual. A repeated key/input returns the same job; changing the camera under the same key returns `IDEMPOTENCY_CONFLICT`.

## WebMCP

Discover the tools in a connected Studio 0.8.0 tab and read its limited connection first. Then:

```json
{
  "viewSessionId":"VIEW_SESSION_ID",
  "input":{
    "projectId":"PROJECT_ID",
    "revision":46,
    "format":"png",
    "time":1.48,
    "camera":{"position":[7,-11,6],"target":[0,0,2.6],"fov":45}
  },
  "idempotencyKey":"high-png-001"
}
```

Call `studio.preview.request`. For video change `format` to `webm` and use a new key. Existing grant, AI pause, artifact retrieval and idempotency rules apply. No additional permission scope is needed. Older tabs do not advertise the new optional field; preserve any unsaved work there and use a fresh tab for 0.8.0 discovery.

## Editor

The unchecked **Kadr z podglądu** option keeps the legacy export framing. Check it to capture the current main viewport's orbit camera when clicking **Zapisz kadr** or **Nagraj podgląd**. Only position, target and FOV are captured; output remains 960×640 with the renderer's standard background/grid. The viewport can have a different aspect ratio. This view option does not dirty, save or replace the effect draft. It does not follow later mouse movements during an already accepted render.

Camera validation does not prove appearance in NWN. All previews remain approximate and `nativeVerified:false`.
