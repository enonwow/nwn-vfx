# Studio 0.8.0 — explicit render camera

TLC-WYROK-STUDIO-09 is implemented and installed. Public `preview.request` accepts optional `camera:{position,target,fov}` through CLI `--camera-file`, WebMCP and the editor's **Kadr z podglądu** opt-in. The camera is fixed for all video frames, recorded in job/handoff metadata, and does not mutate, scale or revise the effect document. [Contract, bounds and examples](../../agents/camera.md).

## Verification — PASS

- **198/198** tests passed (`output/studio-080-unit-tests.txt`). Coverage includes shared/compiled-browser validation of nonfinite, out-of-range and degenerate cameras; public CLI from another cwd; idempotency/replay and camera-change conflicts; durable job camera and handoff metadata; document preservation; output schemas and host descriptor budget.
- Typecheck, regenerated browser contracts and final production build passed (`output/studio-080-build-final.txt`). The existing large compiled-validator bundle warning remains.
- Real renderer/browser acceptance **1/1** passed (`output/studio-080-browser-camera.txt`). The fixture spans **2.3–5.2 m**, with a wave of **3 m radius** and authored alpha animation. Camera `[7,-11,6]` → `[0,0,2.6]`, vertical FOV45 frames the whole composition. The upper marker is visible with margin at y162–174; the legacy frame misses it.
- PNG and full WebM use one saved r2 and snapshot `8a8b1008ef369b337947eaea4db1bb2c8cc910d6bf9091f81077520ecf8c4391`. WebM has **36 frames / 1.2 s / 30 fps**, all PTS verified. PNG at 0.4 s vs video frame 12 mean absolute RGB error **1.1850**, within codec tolerance. Later animation differs from the first frame. Both job and handoff camera metadata agree.
- Real editor orbit + opt-in submitted its captured camera and produced matching job metadata without changing the document. Checkbox is off by default. Export-bar wrapping was added afterward and included in the final build; live 0.8.0 UI discovery confirms the checkbox is available.
- Windows Chromium GUI executable/headless-channel handling and `windowsHide:true` FFmpeg/CLI helpers remain intact. Test render browsers were closed and temporary service data removed.

[Renderer report](../../../output/playwright/camera/report.json) · [High-frame PNG](../../../output/playwright/camera/png-preview.png) · [Full WebM](../../../output/playwright/camera/webm-preview.webm).

## Actual Codex WebMCP — PASS

A fresh tab loaded installed Studio **0.8.0**, discovered **42 tools** and exposed the camera schema. Fetched descriptors were **58473 bytes**, below the host limit. A temporary limited grant scoped to owned test project `41c6dd72-4900-4999-a009-284bf19c4894` was used; no owner credentials were substituted.

At historical r7/time0.5, `studio.preview.request` with explicit camera succeeded as job `b0f9873f-a881-4675-9465-93351071666d`. Same-key replay returned the same job; changed camera with the same key returned `IDEMPOTENCY_CONFLICT`; position=target returned `VALIDATION_ERROR`.

Complete PNG and handoff bytes were received with `studio.artifacts.read`, decoded and independently hashed:

- PNG `c8ce304f-955c-42cc-a928-7601b8bb1e16`: **59789 bytes**, SHA-256 `d0af86c7a85c24c7585ac4a8a36ef1ebf2f17f0a85ec000f8446709c7f0b1f87`.
- Handoff `1a51010c-14b5-4031-b434-5d813fe10323`: **1857 bytes**, SHA-256 `990bc0c2f5727207e7bdd90f3062f805fefafde6b8549c4f1af2b4c296373608`. It records the exact requested camera and snapshot `399010092f12f3d83f5e54aab00d8af114fc1bc8cb3179d36964b89e6962c50b`.

The omitted-camera regression job `2384c042-0fce-4ebe-a6b2-87b257b30ceb` produced **47823 bytes**, SHA-256 `544b46a732e4614ade45a4b1b59d40a22c40b7f9cbf0f0749d409c5cde5afb12`: **byte-identical to the preserved 0.7.1 PNG of the same r7/time**. Its complete bytes were also independently hashed after WebMCP receipt. The temporary grant was revoked; `WEBMCP_NOT_CONNECTED` confirmed cleanup. This test did not edit any project or existing human tab.

[Live PNG](../../../output/studio-080/live-camera.png) · [Live handoff](../../../output/studio-080/live-camera-handoff.json).

## Activation and handoff

The consumer explicitly supplied an installation window after completing its 0.7.2 jobs at tlc-wyrok r46. The service was stopped, package installed globally and started through public CLI. `service start` returned **ready 0.8.0**, instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587`. Public snapshots before/after matched for **all 15 projects**. No consumer document, existing draft or native work was changed. The explicit **GOTOWE — można wznowić** callback included version, examples, validation and limits; no further service restart is planned for this task.

Source/global/user companion skills match SHA-256 `f838b49642f8571b236fbac49117450186771ba2174420a802946e0abddf9238`. Package `output/releases/nwn-vfx-studio-0.8.0.tgz`: **1219806 bytes**, SHA-256 `53b236ed9d13c321ad191730594b987b13af227dee85489caa359791930cf1d2`. [Source manifest](source-manifest.json) binds 125 source files; no Git commit is claimed.

## Consumer acceptance — PASS

The consumer confirmed installed 0.8.0 and unchanged instance/workspace through public `doctor`, and a deep-equal r46 document before/after installation. It subsequently authored r47/r48 through public `changes.preview/apply`; the final camera acceptance is bound to historical **tlc-wyrok r48**, separately from the independent fixture above.

The release task read both [concept acceptance](<C:/Projects/the last city/assets/vfx/wyrok/preview/r48/review/concept-acceptance.json>) and [video inspection](<C:/Projects/the last city/assets/vfx/wyrok/preview/r48/review/video-inspection.json>). They record:

- Camera position `[4.2,-7.6,6.8]`, target `[0,0,2.25]`, vertical FOV42; matching camera checks for two PNG jobs and the video job.
- Full VP9 WebM **120 frames / 4 s / 30 fps / 960×640**; PTS gaps 33–34 ms, timing passed. Video job `523f86ee-4bff-45dd-ae2b-03181303b314`, SHA-256 `e75b00f6402917757cd50abf5c3ab1b3c3ef94335bb369d4bcf8422ba52b786d`.
- PNG at 1.0 s versus video frame30 RGB MAE **1.252763**, consistent with lossy encoding. Shared snapshot `fe13a261591ef617c7e8d89081e90ebc0a971c8f22e39b50c6089ab65067f279`.
- 28 layers, two custom textures, constant sword scale, manifestation tip at2.415 m and `nativeVerified:false`.

The consumer additionally confirmed identical camera values in every job/handoff, the complete sword spanning2.415–5.382 m fitting in the viewed frame, and preview/export sharing the same snapshot (candidate `0b5e3f86-7e30-4da1-97ad-8888857b1324`). It reports 15/15 package hashes,13 manifest entries and exact portable-v3 roundtrip with two PNGs. TLC-WYROK-STUDIO-09 is closed on both sides. Technical camera/resource acceptance does not imply artistic approval or native NWN qualification.

Near/far 0.05/100 m, fixed 960×640, static Z-up camera and documented input bounds remain limitations. All previews remain `nativeVerified:false`; no NWN appearance proof is claimed.
