# Mesh shading — Studio 0.14.0

`MeshLayer.shading` is optional: `"flat"` or `"smooth"`. Omission retains the
previous flat export and preview appearance. `layer.set` with `shading:null`
removes the explicit value. Using the field promotes the document to schema 8;
historical schemas 1–7 remain readable. Promotion never reverses.

Smooth is supported for **`custom` geometry**, including `animation.vertices`
since 0.14.0. Position, orientation, uniform scale and alpha animation remain
supported. Preview recomputes smooth normals during deformation; the pinned
export compiler stores static base normals only. See the
[deformation contract and evidence](smooth-deformation.md). Box/ring smooth is rejected. Explicit flat
is allowed for all mesh geometry kinds, including deformation. Emitters/trails
cannot have the field.

## Existing projects

Inspect the current project/revision, layer IDs and `capabilities.meshShading`.
Read `schema get changes.apply`. Save this array to an explicit changes file,
replacing `YOUR_MESH_LAYER_ID` with an inspected ID:

```json
[{"type":"layer.set","layerId":"YOUR_MESH_LAYER_ID","values":{"shading":"smooth"}}]
```

Then use the current revision and a unique key for this intended write:

```text
nwn-vfx --json changes preview --project PROJECT_ID --expected-revision N --input-file changes.json
nwn-vfx --json changes apply --project PROJECT_ID --expected-revision N --input-file changes.json --idempotency-key YOUR_STABLE_KEY
```

Inspect each result before continuing. Rendering/building uses the returned
saved revision. A complete `layer.add` accepts the same optional field. Existing
geometry, textures and animation channels do not need replacement to set it.

In a connected WebMCP tab, inspect `studio.connection.inspect` and
`studio.view.inspect` before acting, then use the actual discovered tools:

```javascript
studio.changes.preview({viewSessionId, input: {
  projectId, expectedRevision, changes: [
    {type:"layer.set", layerId, values:{shading:"smooth"}}
  ]
}});
studio.changes.apply({viewSessionId, input: {
  projectId, expectedRevision, changes: [
    {type:"layer.set", layerId, values:{shading:"smooth"}}
  ]
}, idempotencyKey});
```

The human UI provides **Cieniowanie → Płaskie / Gładkie**. Changing it creates a
draft until saved; WebMCP sees that draft separately from the saved document.
The field is locked with `{layerId,field:"shading"}` or the whole-layer lock.
AI pause, revision conflicts, idempotency, actor/commit history, selective undo
and portable Studio ZIP work normally. No new tool or grant scope is required.

To see shading, use an explicit material, for example
`{diffuse:"#ffffff",selfIllumination:"#000000"}`. This is a separate material
choice: setting `shading` does not turn on lighting or change authored colors.
Legacy unlit material retains its previous behavior. Normal/additive blending
and independent diffuse/self-illumination remain unchanged.

## Geometry and normal rules

For smooth shading, each normal is the normalized sum of the incident oriented
triangle cross products (area weighting), grouped by the **authored position
vertex index**. No positions are welded by proximity, equality, UV, or name.
Disconnected components using separate indices remain independent even if
their positions coincide. No new triangles or connections are generated.
If two parts reuse the same position index, they explicitly share a normal.

UV indices are independent: a texture seam using different `uvFaces` indices
and the same position index remains smooth. Duplicate position indices retain
a normal seam even at equal coordinates; to smooth a surface, author shared
position indices and independent UV indices. To keep an intentional hard edge,
duplicate its position indices. There is no automatic angle threshold or
per-face smoothing-group editor. OBJ import still discards source `vn`/`s`
under its explicit flat import policy; set `shading:"smooth"` afterward to
compute normals from the imported topology.

Faces must retain valid winding. A cancelling or numerically undefined normal
sum is rejected; the operation does not silently fix geometry. Smooth changes
lighting interpolation, not the silhouette or polygon count. The existing
2048-position, 4096-face and 8192-UV limits remain.

Preview uses these normals before the layer transform, and expands UV corners
without recomputing seam normals. Flat behavior remains unchanged. PNG and
every WebM frame use this renderer. `metadata.meshShading[]` identifies the
mode and SHA-256 of the ordered local corner normals for each enabled rigid
mesh and each enabled smooth deformed mesh. The base hash matches
`validation.readback.meshes[].shading.cornerNormalsSha256`. Deformed smooth
meshes additionally report `deformationNormals`, derived from position samples;
that report does not represent an exported normal-animation channel.

ASCII writes face smoothing masks 0 for flat and 1 for smooth, preserving all
position and independent UV indices. Its readback checks every mask and
computes normals from the parsed tables. The pinned compiler uses the same
index-based area weighting; see [its implementation](https://github.com/dunahan/nwnexplorer/blob/56da6dc2fe94da6bbabe83ad18670f47fccd7dfb/_NmcLib/NmcMesh.cpp#L231).

Binary additionally reads the **actual stored base-trimesh normals and smooth
animmesh base normals directly from MDL bytes**, including smooth animmesh
nodes inside animations. `validation.compilation.normalReadback` records all checked
oriented position/UV corners, counts, source/binary normal hashes, maximum
component error and tolerance 0.0002. A missing, nonfinite or mismatched normal
fails the build. Vertex/UV reordering or welding by the compiler is permitted
only when every oriented corner still matches. Source and binary normal hashes
may differ because of float32 arithmetic. Existing position/controller/sample
roundtrip verification also remains required. `coverage` names exactly the
node classes checked; legacy flat animmesh nodes are not included in this
normal check. `animmeshNodes` counts base and animation entries and
`animatedNormalSamples:0` is verified against the actual legacy array counts.
Animated normals are not exported by the pinned compiler.

## Technical example and limits

[examples/shading](examples/shading/) contains a complete source document,
changes, PNG and camera. It has two disconnected rounded components with
independent per-face UV indices. This is a technical fixture, not TLC artwork.
To create a fresh example, choose a unique project ID and keys, create with
`--preset empty`, import `ivory.png` at r1, then preview/apply `changes.json` at
r2. It explicitly replaces the historical starter `sparks` layer. Render r3 at
0.5 s with the supplied camera; WebM covers the full one-second effect. Build
ASCII or the existing `nwn-ee-impact-binary-experimental-v1` profile and retrieve
artifacts normally. Never apply the example's layer removal to an existing
authored project.

This provides smooth diffuse shading, not PBR/specular, reflections, extra
lights or additional geometry detail. The preview uses fixed Lambert lighting.
Resource readback proves stored data, not appearance under NWN's lighting.
`nativeVerified:false` remains explicit. Native visual testing and artistic
acceptance belong to the qualified consumer workflow.
