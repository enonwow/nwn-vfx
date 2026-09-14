# Mesh transparency preview — Studio0.30.1

Normal-alpha mesh preview now draws triangles back-to-front by their centroid
in camera space. The previous renderer sorted objects only: reordering faces
within the same closed mesh changed visible colors. Disabling depth writes is
appropriate for blended surfaces, but does not by itself establish draw order.

This is a shared editor/PNG/WebM/composition renderer fix. CLI/WebMCP operations,
document schemas1–24, portable ZIP versions and export profiles are unchanged.
Use a fresh tab after upgrading, preserving older drafts. For new PNG/WebM
results use a new job idempotency key; check `rendererVersion:0.30.1`. Historical
artifacts stay immutable. No default instance is automatically upgraded.

Only the private GPU draw index buffer is reordered. Authored faces, independent
UV faces, winding, positions, normals, material, alpha, animation and exported
MDL/TGA/TXI are preserved. The sort uses current deformed positions and world /
camera transforms, with base corner data breaking depth ties deterministically.
Opaque and additive paths retain their original draw order and depth policy.

## Evidence and limits

Boar source `tlc-berserker-boar-spectral-v1`, r4 normal alpha0.6, r5 additive
alpha0.6, r6 normal alpha1;3028 triangles. At time1 with camera
`[.88,-1.4,1.07]`→`[0,0,.76]`,fov35:

- Before: reversing r4 faces and corresponding UV faces changed15100 pixels,
  maximum channel delta101; deterministic shuffle changed9202 pixels.
- After: original/reversed/shuffled r4 produce identical RGBA. The independent
  red-near/blue-far control composites in correct order and is also invariant.
- Additive r5 and opaque r6 were already permutation invariant and are pixel
  identical before/after. Additive still reveals overlapping front-facing
  surfaces of tusks and snout; watertight topology does not imply one visible
  surface along every ray through a concave mesh.

This is centroid sorting per mesh, not per-pixel order-independent transparency.
Intersecting triangles, cyclic overlaps, near-equal-depth transitions and
overlap between separate transparent meshes/particles can remain approximate.
It does not infer volumetric thickness, remove inner geometry, enable backfaces
or make a closed mesh opaque. Complexity is O(triangles log triangles) for each
visible normal-alpha mesh per rendered frame. Studio is not a qualified NWN
renderer; `nativeVerified:false` remains correct.

Tests: `tests/mesh-transparency.test.ts` (camera, parent transform, deformation,
ties, buffer/source preservation, material transitions) and
`tests/browser.mesh-transparency.acceptance.ts` (real WebGL pixels across three
face orders, two times, normal/additive/opaque/deformed cases).
Consumer-specific evidence: `output/playwright/mesh-alpha-0301`.
