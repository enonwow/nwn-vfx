# Own geometry and mesh materials — Studio 0.7.2

Use `meshes import-obj` from any working directory. It replaces only geometry and, when explicitly requested, a PNG assignment in an existing mesh. ID, name, timing, transform, animation, color and material stay intact. Add a new layer explicitly with `--new-layer-file` instead of `--layer`; the JSON is a complete MeshLayer without `geometry` (ID, name, type `mesh`, enabled, color, alpha, start, duration, position, orientation, scale, animation; texture/blend/material optional).

```powershell
nwn-vfx --json meshes import-obj --project PROJECT_ID --expected-revision REVISION --layer LAYER_ID --file 'C:/source/guard.obj' --source-up z --meters-per-unit 1 --normals flat --preview
nwn-vfx --json meshes import-obj --project PROJECT_ID --expected-revision REVISION --layer LAYER_ID --file 'C:/source/guard.obj' --source-up z --meters-per-unit 1 --normals flat --texture-asset ASSET_SHA256 --idempotency-key stable-obj-001
```

`--preview` returns `{document,diff,report}` without a revision or mutation. Commit returns `{project,report}`. Recover an uncertain commit with its original key via `operations resolve`; do not issue a new key for the same uncertain write. All writes honor expectedRevision, project/edit rights, human locks, AI pause and normal actor/time history. Selective undo of an existing import restores geometry and its optional texture assignment, preserving independent edits. Undo of a new-layer import removes that unchanged layer; later dependent edits or locks refuse it.

OBJ input is bounded to 1 MiB UTF-8, 2048 positions, 4096 triangles, 8192 UV coordinates and 8192 source normals. `v` and `vt` have independent indices, including seams with more UV entries than positions. Supported corners: v, v/vt, v//vn, v/vt/vn; valid negative relative indices work. UV must cover every triangle if textured and stay in [0,1]. No triangulation, welding, automatic centering, fitting, decimation or arbitrary format conversion occurs. Bad indices, mixed or missing UV, degenerate faces, nonfinite numbers and coordinates outside ±20 metres fail before saving.

Specify `--source-up y|z`, positive `--meters-per-unit` and `--normals flat`. Y-up becomes right-handed Z-up `(x,y,z) → (x,-z,y)`. Optional `--transform-file` contains `{ "translation":[0,0,0], "orientation":[0,0,1,0], "scale":1 }`. Order: axis conversion, units, scale (0.01–10), rotation about a unit axis (radians ±8π), translation (±20 metres). This bakes into geometry; the layer transform is preserved. The report records this conversion and resulting bounds.

Source `vn` and `s` are validated and explicitly diagnosed as replaced by flat face normals. A single `o` label and group labels are diagnosed as labels omitted from the selected layer; a second object label is refused. `mtllib`, `usemtl` and unsupported records are refused; no external path is read. Supply an already imported PNG with `--texture-asset`. Blender sources can export without materials; RGB8 2048 PNGs can use `assets import --target-size 512` before assignment. No GLB/FBX/PBR/rig support is implied.

## Atomic optional material

```json
[{"type":"layer.set","layerId":"stone","values":{"material":{"diffuse":"#888888","selfIllumination":"#000000"}}}]
```

Apply through the normal `changes preview/apply` commands or `studio.changes.*`. `material` is one locked/diff/undo field; a partial object is invalid. `material:null` removes it. Authoring it promotes to document schema 5 and undo keeps the newer schema. Omission retains the released unlit preview and exports diffuse=selfillumcolor from legacy `color`; old documents are never rewritten just by opening them.

With material present, preview uses fixed ambient light 0.28 and a white directional light of intensity 2 at (-3,-4,7), flat Lambert shading, diffuse color and a separately authored emissive term. PNG texels modulate both terms. Opaque normal-blended surfaces write depth; animated alpha below 1, alpha textures and additive blending disable depth writing. Flags follow each sampled animation frame. This is an approximation without shadow casting or an NWN lighting qualification. [`MeshLambertMaterial`](https://threejs.org/docs/pages/MeshLambertMaterial.html) describes these preview terms. The NWN fields are independently serialized and read back as `diffuse` and `selfIllumination`; [rollnw's parser](https://github.com/jd28/rollnw/blob/main/lib/nw/model/MdlTextParser.cpp) documents diffuse and its [mesh controllers](https://github.com/jd28/rollnw/blob/main/lib/nw/model/Mdl.cpp) document selfillumcolor. Native pixel equivalence remains unverified.

Build PNG, WebM and candidate MDL/HAK from the same saved revision. The candidate readback independently checks vertices, faces, UV indices, both material colors and animation controllers; `nativeVerified:false` remains mandatory. Portable project ZIP retains geometry, material and exact stored PNG bytes. Original OBJ text/conversion remain in the import operation's history; the portable document contains the resulting geometry rather than the original source file.

Studio 0.7.2 exports portable manifest v3: `project.json` stores asset metadata and `assets/*.png` stores each image once. Import reconstructs the complete document and checks its canonical snapshot SHA-256. Use Studio 0.7.2 or newer to import v3; existing v1/v2 archives still work. Limits remain 8 MiB ZIP, 12 MiB inflated entries and 6 MiB reconstructed compact document. Candidate `handoff.json` is byte-identical loose and inside `candidate.zip`; it describes content artifacts without a self-reference hash.

## Browser collaboration

Discover the 42 tools in a newly loaded Studio 0.7.0 tab and use `studio.connection.inspect`, then `studio.view.inspect`. `studio.meshes.importObj.preview` and `studio.meshes.importObj` take `{viewSessionId,input:{projectId,expectedRevision,fileName,objText,sourceUpAxis,metersPerUnit,normalMode,target:{layerId},textureAssetId?,transform?},idempotencyKey?}`; commit requires the key. `target:{newLayer:{...}}` explicitly creates a layer. WebMCP passes source text, never a local path.

Human UI: select/add geometry → choose OBJ → specify axis, units and flat normals → apply to draft → inspect → Save. Pending `meshEditorDrafts.obj` contains source, options and a baseline of geometry+texture. It participates in draftDirty/viewRevision, blocks Save/switch while unapplied, survives layer selection, and will not overwrite newer geometry/texture or pending geometry JSON. WebMCP commits operate on saved revisions and preserve the human's separate draft. Keep old tabs with unsaved work open; open a separate new tab to use the new interface after upgrading.

## Reclaim only explicit unused textures

```powershell
nwn-vfx --json assets remove --project PROJECT_ID --expected-revision REVISION --asset-ids SHA256_A,SHA256_B --idempotency-key stable-prune-001
```

`assets.remove` / `studio.assets.remove` require an explicit unique list of 1–8 assetIds. Any missing ID or reference (including disabled/locked layers) rejects the whole operation. No references are rewritten, no automatic prune occurs and the project limit remains eight assets. Return: `{project,removedAssetIds}`. Revision snapshots and their exported portable ZIPs retain their PNG bytes. Selective undo restores only those removed assets alongside independent later edits/imports, and refuses if the restored result would exceed eight assets or an ID was already reimported. These guards also apply through limited WebMCP rights.
