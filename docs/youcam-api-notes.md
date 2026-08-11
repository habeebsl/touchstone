# YouCam / Perfect Corp API — Research Notes

> **Update 2026-08-10:** Spikes #2 and #3 from the prebuild-validation plan have been run live
> against the real API. All three endpoints below are now confirmed working end-to-end. Corrections
> to the docs-derived info are marked ✅ CONFIRMED inline. See "Confirmed findings" section at the
> bottom for the short version.

Source: https://docs.perfectcorp.com (Skin AI product docs). Extracted directly from the
docs site's page-data JSON (the reference pages are JS-rendered, so this required pulling
`https://docs.perfectcorp.com/page-data/reference/<slug>/data.json` for each endpoint rather
than reading the rendered page). Kept here so we don't have to re-derive it.

Relevant reference page slugs found on the site:
- `/reference/ai_skin_analysis` — skin concern analysis (wrinkle/pore/acne/texture/skin_type oiliness) — not used in our product
- `/reference/ai_skin_tone_analysis` — **this is "AI Facial Color Tones Analyzer"** (misleading slug)
- `/reference/ai_fitzpatrick_skin_type` — AI Fitzpatrick Skin Type Analysis
- `/reference/makeup_vto` — AI Makeup Virtual Try-On

## Shared conventions across all task-based APIs

- Base host: `https://yce-api-01.makeupar.com`
- Auth: `Authorization: Bearer <API_KEY>` header on every request. Get key at
  https://yce.makeupar.com/api-console/en/api-keys/
- File upload flow (needed before any AI task unless you pass a public image URL instead):
  1. `POST /s2s/v2.0/file` with `{ files: [{ content_type, file_name, file_size }] }`
  2. Response gives `file_id` + a pre-signed `requests[0].url` (S3). You must **separately PUT**
     the raw file bytes to that URL — calling the File API alone does not upload anything.
  3. Use the returned `file_id` (as `src_file_id`) in the task call, or use `src_file_url` with a
     public URL to skip upload entirely.
- Task pattern: `POST /s2s/v2.0/task/<task-name>` → `{ data: { task_id } }`, then poll
  `GET /s2s/v2.0/task/<task-name>/<task_id>` until `task_status` is `success` or `error`.
  `running` = still processing, no units consumed yet. Units only consumed on `success`.
- Results are retained 24h; polling is mandatory within that window or you get `InvalidTaskId`.

## 1. Facial Color Tones Analyzer — `POST /s2s/v2.0/task/skin-tone-analysis`

Despite living at slug `ai_skin_tone_analysis`, this is the "AI Facial Color Tones Analyzer" —
the API the whole personalization engine depends on.

Optional input: `face_angle_strictness_level` (`strict|high|medium|low|flexible`, default `high`)
controls how strict pitch/yaw/roll checking is before it'll run.

**Response shape (confirmed from docs example):**
```json
{
  "status": 200,
  "data": {
    "task_status": "success",
    "results": {
      "color": {
        "eye_color": "#293F9B",
        "eye_color_name": "Blue",
        "lip_color": "#D23245",
        "eyebrow_color": "#5B2B31",
        "skin_color": "#b9947c",
        "hair_color": "#a0a0a0",
        "hair_color_name": "Auburn"
      }
    }
  }
}
```
- `eye_color_name` enum: Amber, Brown, Green, Blue, Gray, Other
- `hair_color_name` enum: Auburn, Black, Blonde, Brown, Grey/White, Red
- All `*_color` fields are hex strings — directly usable as color-engine inputs, no conversion needed.

Image constraints: long side ≤ 4096px, single person only, jpg/jpeg, < 10MB, face width > 60% of image width.

## 2. Fitzpatrick Skin Type Analysis — `POST /s2s/v2.0/task/fitzpatrick-scale-analyzer`

Optional pre-process step (`POST` / `GET .../pre-process`) only needed for multi-face images or
explicit target-face selection — skip for single-face selfies.

Returns one of six Fitzpatrick types (I–VI, White → Very Dark Brown scale). **The docs page does
not show a sample JSON response for the final result** (only prose: "returns one of six
standardized skin types") — the exact response field name is unconfirmed. This is squarely what
prebuild-validation spike #3 is for: call it for real and log the raw response before building
against it.

Image constraints: long side ≤ 4096px, short side ≥ 320px, jpg/jpeg only, < 10MB.

Error codes include face position/angle errors (`error_face_angle_invalid` — front-facing must be
within 10° — matches the Camera Kit validation note in our prebuild doc).

## 3. Makeup Virtual Try-On — `POST /s2s/v2.0/task/makeup-vto`

Endpoint: `/v2.0/task/makeup-vto` (note: docs show this without the `/s2s` prefix in one place
and with it in another — use `/s2s/v2.0/task/makeup-vto` to match the file/task API convention
used everywhere else; confirm in spike #2).

Request body:
```json
{
  "src_file_url": "https://.../selfie.jpg",   // or use src_file_id from File API
  "effects": [ /* array of Effect objects, see below */ ],
  "version": "1.0"
}
```

Poll `GET /s2s/v2.0/task/makeup-vto/<task_id>` → `{ data: { task_status, results: [{ download_url }] } }`
(note: one example response shows `results.url` singular instead of `results[0].download_url` —
shape is inconsistent in the docs; confirm exact shape in spike #2).

### Effect JSON schema (this is the core payload our color engine fills)

Every effect is `{ category: string, ...category-specific fields }` in the top-level `effects` array.

**`skin_smooth`** (auto-applied at strength 50 if omitted):
```json
{ "category": "skin_smooth", "skinSmoothStrength": 0-100, "skinSmoothColorIntensity": 0-100 }
```

**`blush`** — pattern name must come from https://plugins-media.makeupar.com/wcm-saas/patterns/blush.json (each pattern has a `colorNum` = required palette count):
```json
{
  "category": "blush",
  "pattern": { "name": "2colors1" },
  "palettes": [
    { "color": "#hex", "texture": "matte|satin|shimmer", "colorIntensity": 0-100,
      "glowStrength": 0-100,        // required if texture=satin
      "shimmerColor": "#hex", "shimmerDensity": 0-100  // required if texture=shimmer
    }
  ]
}
```

**`lip_color`** — the other region our live preview layer targets:
```json
{
  "category": "lip_color",
  "shape": { "name": "original" },   // from lipshape.json: original, heart-shaped, m-shaped, petal, plump, pouty, smile, vintage
  "morphology": { "fullness": 0-100, "wrinkless": 0-100 },  // optional
  "style": { "type": "full|ombre|twoTone", "innerRatio": 0-100, "featherStrength": 0-100 },
  "palettes": [
    { "color": "#hex", "texture": "matte|gloss|holographic|metallic|satin|sheer|shimmer",
      "colorIntensity": 0-100,
      "gloss": 0-100,               // required for gloss/holographic/metallic/sheer/shimmer
      "shimmerColor": "#hex", "shimmerIntensity": 0-100, "shimmerDensity": 0-100, "shimmerSize": 0-100,  // required for holographic/metallic/shimmer
      "transparencyIntensity": 0-100  // required for gloss/sheer/shimmer
    }
  ]
}
```

Other categories exist (`bronzer`, `concealer`, `contour`, `eyebrows`, `eye_liner`, `eye_shadow`,
`eyelashes`, `foundation`, `highlighter`, `lip_liner`) — full schemas captured in
`app/src/lib/youcam/types.ts`. Templates now emit seven of them: `skin_smooth`, `blush`,
`eye_shadow`, `eye_liner`, `eyebrows`, `contour`, `lip_color`.

Image constraints for Makeup VTO: long side < 1920px, face width ≥ 100px, jpg/jpeg/png, < 10MB.

### Debugging a rejected VTO payload

A bad effect fails the *whole task* with `failure_reason: "invalid_parameter"` and no indication
of which effect or field is at fault. Two things make this tractable:

- **Failed tasks are not charged**, so probing is free until it works.
- `src_file_url` accepts the docs' sample face, so probing needs no upload and no personal photo.

`app/src/lib/colorEngine/__checks__/vtoProbe.ts` runs each template's full effect list, then —
only if it fails — each effect on its own, which names the culprit category directly.

**Confirmed 2026-08-11 (correction to the docs):** for `eyebrows` with `pattern.type: "shape"`,
the docs annotate `curvature`, `thickness` and `definition` as merely "(shape only)". They are in
fact **required** — omit any one and the task fails with `invalid_parameter`. (`type: "color"`,
which takes no shape fields, is accepted.) Note the difference in how the two classes of error
surface: a *structurally* invalid payload is rejected synchronously with HTTP 400 and a detailed
message, while this one passes schema validation and only fails later during processing, with no
detail at all.

## Confirmed findings (spikes #2 + #3, run live 2026-08-10)

All three tested against `https://plugins-media.makeupar.com/strapi/assets/sample_Image_1_202b6bf6e6.jpg`
(the docs' own sample image) via `src_file_url` — no File API upload needed for testing.

**Facial Color Tones** (`POST/GET /s2s/v2.0/task/skin-tone-analysis`) — response shape matches
docs exactly, plus one undocumented bonus field:
```json
{"status":200,"data":{"error":null,"task_status":"success","results":{
  "color":{"eye_color":"#342724","eye_color_name":"Brown","lip_color":"#be8782",
           "eyebrow_color":"#805d47","skin_color":"#bc9d88","hair_color":"#B56637","hair_color_name":"Auburn"},
  "face_quality":{"has_face":true,"area":"good","frontal":"good","lighting":"good","faceangle":"good"}
}}}
```
`face_quality` isn't in the docs — useful for a pre-flight check before showing results. Round trip: ~1.5s.

**Fitzpatrick** (`POST/GET /s2s/v2.0/task/fitzpatrick-scale-analyzer`) — **two corrections to the docs:**
- `version: "1.0"` is a **required** field on the POST body (docs never mention it — omitting it
  gives `400 InvalidParameters: "version is required"`).
- Result field is `results.fitzpatrick_scale`, a roman-numeral string (`"I"`–`"VI"`), not the
  guessed `fitzpatrick_type`. Also returns `results.timed` (processing ms).
```json
{"status":200,"data":{"error":null,"task_status":"success","results":{"timed":1929,"fitzpatrick_scale":"I"}}}
```

**Makeup VTO** (`POST/GET /s2s/v2.0/task/makeup-vto`) — **corrections to the docs:**
- Path **does** need the `/s2s` prefix: `/s2s/v2.0/task/makeup-vto` (one docs example omitted it — that's wrong).
- `lip_color` effect's `style` field is **required**, not optional as the schema comment implied —
  omitting it (or `pattern`/other required sub-fields for other categories) produces one combined,
  hard-to-parse `InvalidParameters` error listing every possible schema branch's missing field. If
  you get that error, check every effect object against the full schema in `types.ts`, not just the
  one category you're touching.
- Poll response is `results.url` (singular string), **not** `results[].download_url` or
  `results.download_url` — both docs examples were wrong/inconsistent; only `results.url` is real:
```json
{"status":200,"data":{"error":null,"task_status":"success",
  "results":{"url":"https://yce-us.s3-accelerate.amazonaws.com/ttl30/.../c31e5b7d....jpg?X-Amz-..."}}}
```
- `url` is a **pre-signed S3 link, expires in 2 hours** (`X-Amz-Expires=7200`) — display/cache
  immediately, don't persist the URL itself long-term.
- Round trip (start → success) was under ~2s for a 2-effect payload (lip_color + blush) against the
  sample image. Output image: 1080×1436 PNG, lip color and blush both rendered correctly, no
  visible artifacts, natural shading retained under the color — visually confirms this is the
  reference our client-side spike #1 rendering should be judged against for "looks like real makeup."

### Unit costs — CONFIRMED 2026-08-11 (from the console's UsageRecord export)

| Call | Console label | Units |
|---|---|---|
| Facial Color Tones | `API_Skin Tone Analysis` | **20** |
| Fitzpatrick | `API_Skin Tone Analysis_Fitzpatrick` | **10** |
| Makeup VTO | `API_Makeup VTO` | **1** per output image |

**One full run of the product costs 33 units** (20 + 10 + 3×1), not the 5 previously assumed —
that figure counted *tasks*, not units, and was wrong by ~6.6×.

The cost is overwhelmingly in the analysis, not the rendering: **30 of 33 units (91%) are spent
before a single look is rendered.** Three VTO renders cost 3 units total.

Two consequences that should shape how the remaining work is done:
- **Iterating on templates is nearly free if the analysis is cached.** Re-rendering three looks
  against an already-analysed image costs 3 units. Re-running the whole flow costs 33. Any
  template/colour-engine tuning should replay a stored analysis rather than re-analysing.
- **Fitzpatrick is 30% of every run's cost and its result is currently discarded** — the app
  awaits the task and then derives undertone from `skin_color` instead. Either use it or drop it.

Budget as of 2026-08-11: **813 units remaining** of 1040 granted (1000 redeem code + 40 free
tries); 227 spent across spikes and testing. At 33/run that is ~24 full runs left; ~35 if
Fitzpatrick is dropped; ~271 VTO-only re-renders against a cached analysis.

### client.ts / types.ts fixes needed from these findings
- Add `version: "1.0"` to `FitzpatrickRequest` (currently missing).
- Rename `FitzpatrickResult.fitzpatrick_type` → `fitzpatrick_scale`, type `"I"|"II"|"III"|"IV"|"V"|"VI"`, add `timed: number`.
- `MakeupVtoResult`: drop `download_url`, keep only `url: string`.
- Make `LipColorEffect.style` required (drop the `?`).
- Add `face_quality` to `FacialColorTonesResult`.

## JS Camera Kit

The docs partial (`_partials/js-camera-kit.md`) is transcluded server-side and never appears in
the page-data JSON or in a Googlebot-UA fetch — it's not extractable through the docs site at all.
Instead, went straight to the shipped SDK bundle:

- **Script tag:** `https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js` (confirmed real,
  fetched and inspected directly — 236KB minified bundle).
- Both `ymkAsyncInit` and the `faceDetectionCaptured`/`openCameraKit` symbols exist verbatim in
  the bundle, confirming the SDK really does work the way search results describe: define
  `window.ymkAsyncInit` (lowercase per the actual bundle — docs/prebuild notes said
  `window.YMKAsyncInit`, casing is inconsistent across sources, so the quickstart page sets both
  as aliases to be safe), then `YMK.init(options)` → `YMK.openCameraKit()`.
- **Not confirmed via static analysis:** the exact shape of the `options` object passed to
  `YMK.init()` — property names aren't visible in the minified bundle (no literal `apiKey` string
  found, unlike the S2S APIs where every field name survives in plaintext JSON). Given `.env.local`
  has both an API key and a secret key, this SDK likely uses HMAC-style auth distinct from the
  S2S Bearer token — needs empirical confirmation.
- **Spike #4 baseline test page:** `app/public/camera-kit-quickstart.html`, served at
  `http://localhost:5173/camera-kit-quickstart.html` by the Vite dev server. Raw HTML/JS, no
  framework — paste API key (+ optionally secret key) into the page, click Init, watch the log
  output and browser console for the SDK's own validation errors, same technique that resolved
  the undocumented `version` field on Fitzpatrick. Keys are typed at runtime, never written to a
  file, so nothing secret is at risk of being committed.

**Confirmed live 2026-08-11:**
- The SDK requires a specific mount container: `<div id="YMK-module"></div>` in the DOM before
  `YMK.init()`/`openCameraKit()` runs. Without it, `openCameraKit()` throws
  `TypeError: Cannot read properties of null (reading 'style')` — it's silently trying to style a
  container it can't find. This wasn't mentioned in any docs page we could reach; found via a
  secondhand community integration example, then verified by fixing the crash.
  Casing is `window.YMKAsyncInit` (capital, matches the docs/prebuild notes — the lowercase
  `ymkAsyncInit` symbol also exists in the bundle but isn't the one to rely on).
- **Camera Kit opens and works with no API key at all** — `YMK.init()` doesn't validate the key
  client-side, and the capture UI itself doesn't call out to YouCam's backend just to open. The
  key almost certainly only matters once the SDK/app calls an actual analysis endpoint (or if
  Camera Kit's built-in skincare-analysis mode is used, which we're not using — we only need
  `faceDetectionCaptured` to get a raw image back, then send that to our own S2S calls). This
  simplifies things: no client-side key exposure risk from Camera Kit itself, and the secret key
  in `.env.local` may end up unused entirely — keep it, don't build around it, revisit only if
  something later demands it.
- Next to confirm: the exact shape of the `faceDetectionCaptured` event payload (base64 vs Blob,
  which our color-engine pipeline needs to know before it can hand the image to the S2S file
  upload flow).

**Confirmed live 2026-08-11 (React integration debugging):** `window.YMKAsyncInit` is effectively
vestigial — in a real test it never fired even 8 seconds after the script loaded, while
`window.YMK` was already a defined object well before that. The quickstart page only "worked" with
`YMKAsyncInit` because that page never actually depended on it either — the Init button calls
`window.YMK.init()` directly, whenever a human clicks it, which is always well after `window.YMK`
becomes available on its own. `app/src/lib/cameraKit/loadCameraKit.ts` now gates readiness on
polling for `window.YMK` to exist after `script.onload`, not on the `YMKAsyncInit` callback.
