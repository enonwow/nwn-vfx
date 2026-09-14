# Audio authoring — Studio 0.18.0

Audio is a separate `audioAssets` library and `audioClips` timeline in document

schema 9 (legacy gain up to 4) or 10 (expanded gain). Visual layers stay emitter/mesh/trail. Start from any saved project,

including `projects.create` with `preset:"empty"`; presets do not constrain what

you can author. CLI, UI and the 48-tool WebMCP adapter share these operations.

Discover the installed version and schemas before sending closed-schema data.

## Gain in dB — Studio 0.18.0

The saved clip control is **Wzmocnienie (dB)**: -60 to +24 dB, a 0.5 dB
slider and a precise number field. 0 dB is source amplitude. **Wycisz** writes
`gain:0`; it is independent of `enabled` and the local monitor. Unmuting a clip
opened at gain 0 starts at 0 dB. Toggling mute back before applying keeps the
pending gain. Apply the clip, then Save the project. Opening or editing other
fields preserves the exact linear gain, even when its dB display is rounded or
an old positive gain is below the slider range.

`audio.add.clip` and `audio.set.values` accept **exactly one of `gain` and
`gainDb` when setting amplitude**. `audio.set` may omit both when editing other
fields. The domain converts `gain = 10^(gainDb/20)` once. Only `gain` is stored;
no second gain, normalization, limiter or source rewriting is introduced.
New explicit dB inputs must be finite and in [-60,24]. Linear gain remains
supported in [0,15.848931924611133], including the mute value 0.

```json
[{"type":"audio.set","clipId":"bite_contact","values":{"gainDb":12}}]
```

Save this array as `gain-db.json`, then run from any repo:

```text
nwn-vfx --json changes preview --project PROJECT --expected-revision N --input-file gain-db.json
nwn-vfx --json changes apply --project PROJECT --expected-revision N --input-file gain-db.json --idempotency-key gain-db-change-001
```

WebMCP uses the same change inside
`studio.changes.preview/apply({viewSessionId,input:{projectId,expectedRevision,changes},idempotencyKey})`.
For adding a clip, replace the `gain` key in the full `audio.add` example below
with `gainDb:0`. To mute, send `values:{gain:0}`; to restore source level, send
`values:{gainDb:0}`. Never send both fields. `gain:1.5` reads +3.521825... dB
(UI +3.52), `gain:3` +9.542425... dB (UI +9.54), and `gain:6` +15.563025... dB
(UI +15.56). Sending rounded +9.54 dB explicitly is a new amplitude; to retain
exact gain 3 leave it untouched or send `gain:3`.

`projects.inspect` / `revisions.get` return an `AUDIO_CLIP_GAINS` diagnostic with
`clips:[{clipId,gain,gainDb,muted,enabled}]`; silence is `gainDb:null,muted:true`.
`studio.view.inspect` adds `audioClipGains:{saved:[],draft:[]}`. These projections
never modify the canonical saved/draft document. Pending text remains in
`meshEditorDrafts[clipId].audio`. Its new fields are `gain` (raw baseline),
`gainDb` (display/input text) and `muted`; legacy `gainPercent` drafts are still
read without rounding their raw baseline. Agent tools cannot unmute the monitor.

Preview/apply diagnostics include sample peaks **before clamping** as both
`peak` (linear, retained for compatibility) and `peakDbFS` (number or null for
silence). `AUDIO_CLIPPING` includes clipped sample counts for stereo48k and
mono44.1k. UI shows the applied draft's levels before export. Render metadata and
native `audio-events.json` carry dBFS too. Positive full scale in PCM16 is
32767/32768, so a peak of exactly 0 dBFS can already clip positive samples.
No limiter or automatic normalization is applied.

### Version negotiation and migration

Audio capabilities version **4** advertises the formula, limits, mute/read
semantics and migration. API envelope remains 0.1.0; 48 WebMCP tools remain.
Studio/CLI/UI 0.18.0 send `X-NWN-VFX-Document-Schema: 10`. Third-party HTTP clients
must send that header only after supporting schema 10 and refreshing schemas.
Older/missing declarations retain access to schema-9 projects, but new dB input,
schema-10 reads/writes and lists containing schema 10 return
`CLIENT_UPGRADE_REQUIRED` with a 0.18.0 upgrade instruction, before any mutation.
This header declares compatibility, never authorization; all grants/locks/pause
and revision checks still apply.

A change producing gain >4 promotes **only the resulting revision** to document
schema **10**, exported in portable ZIP **v5** with `minimumStudioVersion:0.18.0`.
Gain <=4 in a schema-9 project stays schema 9 / ZIP v4. Schema 9 now keeps its
historic maximum of 4 rather than silently expanding it. Schema 10 is not
implicitly downgraded by lowering gain or undoing; old revisions/ZIP v1–4 remain
readable and unchanged. ZIP v5 requires an updated importer. Older Studio
versions reject v5; their legacy error may say `BUNDLE_HASH_MISMATCH` because
those versions combined version/hash validation. New unknown versions return
`UNSUPPORTED_BUNDLE_VERSION`. Exporter metadata is 0.18.0; legacy WAV, MDL, TGA
and TXI content is preserved for unchanged inputs. Preserve old browser tabs
with human drafts; open a separate fresh tab after upgrade.

## Import and place

```text

nwn-vfx --json audio import --project PROJECT --expected-revision N --file sound.wav --idempotency-key audio-import-001

nwn-vfx --json audio list --project PROJECT

nwn-vfx --json audio get SOURCE_SHA256 --project PROJECT

```

The import result is `{project,assetId}`. Use its returned revision. `audio.list`

returns metadata; `audio.get` includes exact original and decoded PCM base64.

No path or URL is accepted by the service. WebMCP uses:

```json

{"viewSessionId":"TAB_SESSION","input":{"projectId":"PROJECT","expectedRevision":3,"fileName":"sound.wav","dataBase64":"BASE64_OF_ORIGINAL_FILE"},"idempotencyKey":"audio-import-001"}

```

Call that input with `studio.audio.import` after `studio.connection.inspect`.

Place an imported asset using `changes.preview/apply` (WebMCP

`studio.changes.preview/apply`). A changes JSON file for a one-second effect:

```json

[{"type":"audio.add","clip":{"id":"bite_audio","type":"audio","name":"Bite","assetId":"SOURCE_SHA256","enabled":true,"start":0.4,"duration":0.6,"offset":0,"gain":1,"fadeIn":0,"fadeOut":0}}]

```

```text

nwn-vfx --json changes preview --project PROJECT --expected-revision N --input-file clips.json

nwn-vfx --json changes apply --project PROJECT --expected-revision N --input-file clips.json --idempotency-key audio-clips-001

```

Change a clip with `{"type":"audio.set","clipId":"bite_audio","values":{"gain":0.5}}`;

remove it with `{"type":"audio.remove","clipId":"bite_audio"}`. Reuse one asset

for multiple clips. `audio.remove` takes `assetIds:[...]` and refuses any referenced

asset, including references from disabled clips. Its CLI option is `--asset-ids`.

IDs must be unique across visual layers and audio clips.

All mutations use revisions, stable idempotency keys, project grants, human locks,

AI pause and selective undo. Locks use the existing `layerId` slot with a clip ID

and `field:"*"` or one audio field. Agent calls cannot remove human locks.

Asset history and originals survive removal from the current library. Undo refuses

dependent later changes; it preserves independent clips/assets.

## Limits and source identity

- WAV: RIFF PCM16 little endian, mono/stereo, 8–48 kHz; MP3: decoded through

  bounded FFmpeg to stereo PCM16/48 kHz. Invalid/truncated headers are rejected.

- At most 2 MiB per original, 30 seconds per asset, 8 audio assets and 32 clips.

  The existing **6 MiB document limit includes original and decoded base64** as

  well as visual geometry and PNG. These limits apply together; a 30-second or

  2 MiB input is not guaranteed to fit an already large project.

- Original bytes, SHA-256 ID, filename, byte count and decoded PCM hash/decoder

  are stored. WAV PCM is retained exactly; MP3 is a derived decode, with original

  MP3 bytes retained. MP3 processing has a 15-second timeout and bounded output.

- `start`, `duration`, `offset`, `fadeIn`, `fadeOut` are seconds. Clip duration

  must fit both effect and source after offset. Gain is 0–15.848931924611133 (schema 9: at most 4); fades are 0–2 s
  and must fit the clip without overlap. Disabled clips produce no signal.

- Preview/export use deterministic sample positions, linear resampling and

  linear fades, sum all clips, then clamp once to PCM16. No automatic normalization,

  EQ, tempo change or invented silence trimming. Peak and clipped-sample count

  are reported. Waveform metadata contains 128 peak bins.

## Human transport and tab context

UI has waveform rows, pointer movement, numeric start/duration/offset/gain/fades,

enabled/name controls and multiple clips. Inspector text becomes effective only

after **Zastosuj klip**, followed by the shared project save. Pending text appears

in `meshEditorDrafts[clipId].audio:{text,baseline}`; preserve it even when invalid.

It blocks navigation/save until the human applies or discards it. Concurrent save

rebases later local edits rather than replacing the whole draft with the reply.

The monitor starts **muted**, with remembered UI gain initially 0.15; project

selection resets it to muted. Importing/selecting a project does not start sound.

Only an explicit human Play/unmute gesture unlocks browser audio. Play/Pause,

Stop, restart, seek and loop use one source and one timeline clock; a suspended

AudioContext freezes visual time with the samples. Seek preserves playback state.

Monitor gain/mute is local to the tab and **never changes exported audio**.

`studio.view.inspect` exposes selected audio clip in `selectedLayerId`, draft,

saved document, time, playing, loop and read-only `audioMonitor` (muted, gain,

unlocked, activeSources, loop). `studio.view.set` can select, seek, pause/play and

set `loop`; it requires expected view/project revisions and obeys AI pause.

Agents cannot unmute or silently replace an unsaved human draft.

## Portable and rendered artifacts

`projects.export` produces portable ZIP v4 for schema 9 audio, or v5 for schema 10; it

stores each original and PCM dependency once, and reconstructs the same canonical

document on import. Old ZIP versions remain readable. Limits remain 8 MiB ZIP,

12 MiB expanded and 6 MiB reconstructed document.

Request WebM from the saved revision using `preview.request`. Video samples stay

at 30 fps; the matching audio mix is PCM16 stereo/48 kHz. The WebM contains **lossy

Opus**, while a separate `audio-mix.wav` is the exact deterministic mix. Metadata

records frame count, PCM hash, peak and clipping. Muted monitoring has no effect

on either artifact. Read jobs to completion, retrieve artifact metadata, then

download/verify size and SHA-256 (WebMCP supports bounded `artifacts.read` chunks).

## NWN resource handoff

`candidate.build` exports actual PCM16 mono/44.1 kHz WAV resources and stable

content-derived resrefs (`va_` plus 13 hash characters), also packed into its HAK.

`audio-events.json` records source/derived hashes, clip timing, explicit processing

and a **preferred full-timeline mix**, including leading silence. Its

`preferredIntegration.resref` is the proposed `visualeffects.2da.SoundImpact` value.

The consumer must bind that value to its chosen row and trigger the effect once

at timeline zero; merely placing the WAV in a HAK does not play it.

Alternative per-clip WAV events and `audio-events.nss` are supplied explicitly.

They use an assigned emitter object and DelayCommand/PlaySound, whose action queue

can introduce timing delay. **Choose full-mix SoundImpact or per-clip NSS, never

both for one effect.** Existing queued PlaySound calls have no automatic Studio

stop handle. The consumer owns object placement, rows, ApplyEffect calls and

repeat/lifetime behavior. See the tester's [Sounds and Music guide](https://nwn.wiki/display/NWN1/Sounds+and+Music)

and [PlaySound reference](https://nwnlexicon.com/PlaySound).

Studio does not modify MOD/HAK integration or start Toolset/NWN. All reports retain

`nativeVerified:false`, `autoPlayback:false`; successful resource readback is not

a native synchronization or auditory approval.

## Agreed consumer examples

The accepted bite source `ugryzienie-lagodne-v1.wav` (SHA-256

`c39d66018b978b0f2c16ea4efba85bb4a204f1d2a7079a7f3da44d229ede928c`)

is 0.60 s stereo/24 kHz. Place once at 0.40 s in a 1 s effect, offset 0,

duration 0.60, gain 1 and zero fades. Do not choose an already delayed source.

The consumer-prepared `heartbeat-cycle-v1.wav` from the user-approved source family (SHA-256

`c2336be5483e2abace01b09a76aba0f1c3dba036822b23903a7d1866372047c5`)

is 0.60 s stereo/44.1 kHz. Two clips in a 2 s effect start at

`0.13716553287981859` and `0.8871655328798186`, offset 0, duration 0.60,

gain 1 and zero fades. The source accent at `0.3128344671201814` then falls

at 0.45 and 1.20 s before sample-grid quantization. This reuses the accepted CC0

recording; it does not resynthesize or retime it. Alignment still needs the

consumer's listening/native check. Feature acceptance uses isolated forks;

accepted source projects and artifacts must remain intact.

