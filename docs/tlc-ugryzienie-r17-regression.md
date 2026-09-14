# r17 binary export regression — Studio 0.12.1

Status: fixed and installed on 2026-09-07. The source r17 and all consumer
projects/artifacts were left unchanged. Native NWN qualification remains false.

## Reproduction and cause

Consumer project `tlc-wampir-ugryzienie` r17/schema8: ASCII job
`7fdda3a5-60f2-4437-b515-7e11dd84dac3` succeeded; binary job
`09d43cfb-a40c-49d3-af19-1a681dfb5599` failed `COMPILE_VALIDATION_FAILED`.
Our public fork `2f13e69e-cd79-4d12-8bb7-2618a2ce5f7c` r1 differs only in
project name. Its 0.12.0 job `8e40ea8e-bfc5-4c99-84f8-5a6a6177c05a`
reproduced the same failure.

The source-class validator used exact JS doubles, whereas MDL stores float32.
UV rows 267 `[0.75,0.9600000000000001,0]` and 274 `[0.75,0.96,0]` have identical
float32 encodings. Each affected source table contained 1650 UV rows. Exact
double grouping required 274 classes but tolerant remapping reached 273.
This occurred in `mesh_0/upper_teeth`, `mesh_2/lower_teeth`,
`mesh_30/upper_teeth_right`, and `mesh_31/lower_teeth_right`.
The source and compiler preserved the representable data; validation was a
false positive. Source UV editing or welding would conceal the regression.

`compiled-readback.ts` now canonicalizes the base vector and every sample by
exact `Math.fround` before grouping. Distinct float32 values remain distinct,
even within the unchanged numeric tolerance. Class coverage, all sample
comparisons, oriented triangle/UV multiplicity and direct binary normal checks
remain required. Failure messages now include node/table and a missing source
class or unmatched destination row. No source writer, renderer, compiler bytes,
geometry topology, UV data, tolerance or native status changed.

## Evidence

The pre-fix diagnostic bytes passed the corrected validator without being
recompiled or edited:

- Source MDL SHA-256: `c9cfa7a4439635d25d39f06fd89d7d0e148ae0dc05525e6268429cb09939be7d`.
- Binary MDL SHA-256: `8c0eb186ded8f542b4e6ea189cb37335f2b7b30ae653a754425ac958f8a0b5e3`.
- Roundtrip MDL SHA-256: `12a300708140919f2f923cc9c255d628470dcb629e62cc8a5111053ee7adacc0`.
- 130 nodes, 22,764 triangles, 91,476 vertex samples, 91,476 UV samples,
  128 controllers; maximum sample error `6.666666663157628e-8`.
- 60,612 rigid corners across 30 meshes read directly from binary;
  maximum normal component error `0.00003872595880444196`, tolerance `0.0002`.

A fresh local build and an installed public CLI build both passed. The CLI
ran from `C:/Projects/the last city` against our fork r1. Installed job
`6a1b7952-8ca2-48f7-95d6-c7113b860d48` uses `nwn-binary-vfx-0.12.1`.
All 16 artifacts were retrieved and their complete hashes and lengths checked;
downloaded source/binary/roundtrip were independently read again. The fork
stayed at r1. See `output/ugryzienie-02/r17-regression/installed/report.json`
and the adjacent `job.json` for authoritative artifact identities.

Validation: **217/217 unit tests**, including a real pinned-compiler UV-alias
fixture, float32-equivalent sampled aliases, distinct later vertex/UV samples,
distinct float32 values within tolerance, changed UVs and winding. Typecheck
and production build passed. The unchanged 42 WebMCP descriptors passed their
schema and host-size checks. No additional live WebMCP run is claimed for this
patch; the shared build operation is unchanged and prior live evidence is in
`docs/tlc-ugryzienie-studio-02.md`.

## Installation and retry

CLI/service 0.12.1 at `http://127.0.0.1:4317`, same instance
`12d0fa8e-4887-4f00-ad74-9bb15b05c057` and workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587`. The consumer explicitly confirmed
downloads finished and agreed to the brief public stop/install/start.
Before/after snapshots preserve all **26 project DTOs and nine historical
job DTOs**, including the consumer's successful ASCII and failed binary r17
jobs. See this regression's `before.json` and `after.json`.

Package `output/nwn-vfx-studio-0.12.1.tgz`, SHA-256
`54442796bbf961d3c66fe5c45bfbdd36fdd84ff0a20445162bd6a6bc94b90bda`.
ASCII exporter remains `nwn-ascii-vfx-0.12.0`; the binary receipt identifies
the corrected validator as `nwn-binary-vfx-0.12.1`. Successful historical binary
receipts remain readable. Retry the unchanged consumer r17 with a **new** build
idempotency key; the old failed job/key intentionally retains its old result.

## Consumer confirmation

The Last City subsequently rebuilt its **unchanged r17** successfully through
the public CLI: job `5b00b32d-fbdd-4cd4-b444-2efd926bcf91`, exporter
`nwn-binary-vfx-0.12.1`. Studio independently inspected this public job and
confirmed its project/revision, successful status, compilation checks and
artifact identities. The consumer reports all 16 downloaded artifact hashes
and sizes verified, source equal to ASCII r17, 30 rigid-normal hashes and two
deformation sample pairs matching the previews.

- ZIP SHA-256: `53e4e0920d8585a807cd72de82f8136b743d3df849d832755cc2d9fbf539d406`.
- Model: `vfxaf4fc8c74d89.mdl`.
- Binary SHA-256: `38c1531702ffac04a69e3a9a69839c7f704d239fb07f641dc49fb173ef3baabc`.
- Consumer report: `C:/Projects/the last city/assets/vfx/wampir/ugryzienie/export/r17/binary-0121-review.json`.

The consumer explicitly closed the integration regression and continues its
separate package/native proof workflow. This confirmation does not establish
NWN appearance or playback; the candidate still records `nativeVerified:false`.
