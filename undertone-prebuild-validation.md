# Undertone — Pre-Build Validation Plan

Purpose: derisk every unproven assumption before writing the full app. Each item below is a small, isolated spike with a clear pass/fail condition. Do not start the "real" build until the items marked **Blocking** have a result — a failure on any of them changes the architecture, not just a detail, so finding out early is the entire point of this doc.

Run these in priority order. Time-box each one; if you blow through the estimate without a clear answer, stop and reassess rather than sinking the whole day into one spike.

---

## 1. Live blend-mode rendering quality — **Blocking, do this first**
**Why it's first:** this is the single highest-risk, least-proven part of the entire product. Everything else in the build is standard web app work; this is the one piece that might not be achievable in the time available, and if it isn't, the whole "live preview" feature needs to be cut or replaced before you build anything around it.

**Test:** On your own webcam, using MediaPipe Face Landmarker (`@mediapipe/tasks-vision`, npm-installable), get live landmark tracking running, then render one hardcoded lip color on top using a blend mode (multiply or soft-light, not flat alpha) with a soft feathered edge mask.

**Pass condition:** it looks like lipstick, not paint — you can see natural lip shading/highlights through the color, edges aren't hard-cut, and it holds up reasonably as you move/talk.

**Time box:** half a day.

**If it fails:** try DeepAR's free tier (up to 10 MAU, on-device web processing) instead of building the rendering yourself — test their web demo directly rather than trusting comparison articles, since available sources disagree on how good its makeup segmentation actually is. If DeepAR's out-of-box lip/blush rendering looks convincing, switch to it and skip building your own blend-mode compositor. If neither works well in the time box, fall back to a static-only demo (no live camera step) — see the overview doc's non-goals for how to reframe the pitch if this happens.

---

## 2. Makeup VTO end-to-end round trip — **Blocking**
**Why it matters:** this is the core API call the entire product depends on. Need to confirm the real shape of a response, real latency, and that a hand-built effects JSON actually produces a sane image.

**Test:** Using a sample selfie, POST one `effects` payload (start with just `lip_color` and `blush`, using the example payload structure from the docs) to `/s2s/v2.0/task/makeup-vto`, poll the status endpoint, and confirm you get back a usable rendered image.

**Pass condition:** round trip completes, output image looks correct (color applied where expected, no artifacts), and you know the real latency (not the doc's description — the actual number on your account/network).

**Time box:** 1-2 hours.

**Also confirm while you're in there:** how many API units one task consumes, so you can budget the full build against the 1,000-unit free allocation (3 looks × however many test iterations you'll realistically need while tuning templates).

---

## 3. Facial Color Tones API — real response shape — **Blocking**
**Why it matters:** the entire personalization engine depends on knowing exactly what fields this API returns and in what format (hex values? named colors? a range?). Don't guess from documentation prose — call it and look at the raw response.

**Test:** Send a sample selfie to the Facial Color Tones Analyzer and the Fitzpatrick Skin Type endpoint, log the raw JSON response.

**Pass condition:** you can identify exactly which fields give you skin undertone, eye color, and hair color, in a format your color engine can consume (or convert) into hex values usable in a Makeup VTO payload.

**Time box:** 1 hour.

---

## 4. Camera Kit integration in your actual frontend — **Blocking**
**Why it matters:** confirmed the SDK is script-tag-only and callback-driven against a global `window.YMKAsyncInit`. Need to confirm it behaves the same once wrapped in whatever framework you're using, not just in a raw HTML file.

**Test:** Run the quickstart example unmodified in a blank HTML file first (confirm baseline behavior), then wire it into your actual app shell — script loaded once outside the component tree, stable mount point div that your framework never re-renders, `faceDetectionCaptured` event correctly handing you back an image your app can use.

**Pass condition:** capture flow opens, captures, and fires the callback with a usable image, inside your real app, not just the demo file.

**Time box:** half a day (includes the raw-HTML baseline check).

---

## 5. One full end-to-end pass, hardcoded — **Blocking, do this last**
**Why it matters:** validates that the pieces actually connect, not just that each one works in isolation. This is the "does the architecture hold together" checkpoint.

**Test:** Wire together, with one hardcoded template (not the full 8-10): Camera Kit capture → Color Tones + Fitzpatrick call → color engine fills the one template → Makeup VTO call → render result on screen → tap → live preview with blend-mode lip/blush.

**Pass condition:** a person can go from opening the app to seeing themselves live in makeup, start to finish, without you manually intervening at any step.

**Time box:** 1 full day. This is intentionally the last spike — everything before it is a component test; this is the integration test.

---

## Non-blocking, worth checking if time allows
- **DeepAR free-tier makeup segmentation quality**, tested directly against their web demo — only needed if item 1 fails and you're choosing between DeepAR and a from-scratch renderer.
- **Total latency budget** for the full analyze → generate → poll → display chain, so you know whether you need loading-state design work or whether it's fast enough to feel instant.
- **Error handling for Makeup VTO's documented face-angle/size errors** — confirm Camera Kit's validation actually prevents these from reaching the API, so you're not building redundant error UI for cases Camera Kit already blocks.

## What "done" looks like for this phase
All five blocking items have a clear pass/fail result. If all five pass, move to full build with confidence in the architecture. If any fail, the fix is a scoped architecture change (documented above per item) — not a reason to panic, and not a reason to skip validating the rest.
