# Undertone — Flow & Screen Spec

Purpose: the concrete screen inventory for the build, and the constraints each screen has to
respect. The overview doc deliberately stopped at scope ("this doc is scope, not spec") and never
specified screens. This fills that gap.

Everything here is grounded in what the five prebuild-validation spikes actually proved — not
assumptions. Where a number appears (latency, etc.) it was measured, not estimated.

## The whole product, as states

Five states. **We only design four of them** — Camera Kit owns its own UI.

```
[1 Intro] → [2 Capture — Camera Kit owns this] → [3 Analyzing] → [4 Three looks] → [5 Live preview]
                                                                        ↑______________|
                                                                     (back to looks)
```

There is no browsing, no accounts, no catalog, no purchase step. Per the overview doc's non-goals.

---

## 1. Intro

The only job: get the user to tap once and open the camera. A judge watching the demo should
understand the entire value proposition before anything loads.

- One line of copy + one button.
- No onboarding carousel, no permission pre-explainer, no sign-in.
- Camera permission is requested by Camera Kit itself on open — don't build a custom pre-prompt.

## 2. Capture — **Camera Kit owns this screen**

**This is the most important constraint in this document.** The YouCam JS Camera Kit renders its
own fullscreen capture UI into a `<div id="YMK-module">` mount point. It brings its own framing
guides, shutter button, camera-flip control, and face-position validation. We cannot meaningfully
restyle it.

Design implications:
- **Do not design a capture screen.** Any mockup showing a custom shutter button, custom framing
  overlay, or custom guidance text for this step is not buildable as drawn.
- What we *do* own is the hand-off in both directions: the button that opens it (state 1), and
  what happens the instant it returns an image (state 3).
- Camera Kit's own face-position/angle validation runs before it hands anything back, which means
  most bad inputs never reach our code. Don't design redundant "move closer / face the camera"
  error UI — that's Camera Kit's job and it already does it.

## 3. Analyzing

**This state is load-bearing and cannot be a spinner.** Measured latency from the spikes:

| Step | Measured |
|---|---|
| File upload (File API + S3 PUT) | ~1s, varies with connection |
| Facial Color Tones | ~1.5s |
| Fitzpatrick | ~1.9s (runs in parallel with the above) |
| Makeup VTO, per look | ~1.5–2s |

Three looks means the realistic window between "photo taken" and "looks ready" is roughly
**5–8 seconds**. That is far too long for an undifferentiated spinner, and it is also the single
best opportunity in the product to make the personalization feel *earned* rather than instant-and-
therefore-suspicious.

Design opportunity — we have real data to reveal progressively here, because the analysis
completes well before the renders do:
- Extracted skin tone, eye color, hair color come back as **actual hex values** ~2s in.
- Fitzpatrick type (I–VI) comes back at the same time.
- Showing these *as they resolve* — real swatches of the user's own coloring — fills the wait with
  proof that something was genuinely measured. This directly counters the "TikTok filter is just
  guessing" problem the overview doc identifies as the core trust issue.

Do not fabricate progress. The steps are real and sequential; the UI should reflect the real ones.

## 4. Three looks

Three rendered images of the user's own face, returned from Makeup VTO.

- Labelled **by mood — "Soft", "Polished", "Bold"** — never by template name, never by a technical
  descriptor. Per the overview doc: "the personalization should feel discovered, not chosen from a
  menu."
- Each look is a full-face render including eyeshadow/liner/brows, because the static VTO render
  handles those convincingly.
- Tapping one goes to live preview.
- A secondary "see more looks" surface is permitted but is explicitly **not** the demo path — it
  must not compete with the tap-to-live-preview action.

Note the rendered image URLs are **pre-signed S3 links that expire in 2 hours**. Fine for a session,
but they cannot be treated as durable — no "save your looks" feature that assumes the URL persists.

## 5. Live preview

The emotional high point. User sees the selected look on their live face, moving in real time.

**Hard constraint: lip color + blush only.** The live layer is client-side blend-mode compositing
over MediaPipe face landmarks — it does not render eyeshadow, liner, lashes, or brows. Those exist
only in the static render from state 4.

Design implications:
- Do not mock up a live preview showing dramatic eye makeup. It cannot be built for this step.
- The transition from the static render (full look) to live preview (lips + blush) is a visible
  fidelity drop if handled naively. Worth designing deliberately — e.g. keeping the static render
  visible alongside/behind the live view so the full look stays present as reference rather than
  appearing to vanish.
- Per the overview doc, this distinction should be stated confidently in the pitch, not hidden:
  *"YouCam's Makeup VTO generates the studio-quality personalized look; our real-time layer lets
  you preview that exact look live before committing."*

---

## Cross-cutting constraints

- **Mobile-first.** This is a selfie product; the demo will be shot on a phone.
- **No accounts, no e-commerce, no LLM in the personalization path.** (Overview doc non-goals.)
- **Total build must stay inside 1,000 free API units.** Per-task unit cost is still unconfirmed —
  the one open item left from the spikes. Each full run of the flow costs 2 analysis tasks + 3 VTO
  tasks, so iteration during design/tuning is not free. Worth confirming the per-task cost in the
  YouCam console before heavy iteration.
- **Failure states we actually need** (everything else is Camera Kit's job):
  - Analysis or render task returns `error` — the API returns real error codes, and no units are
    consumed on failure.
  - Network/timeout during polling.
  - User denies camera permission.

## What's built already (spikes, working)

| Capability | Where |
|---|---|
| Camera Kit capture → `File` in app code | `src/components/CameraCapture.tsx` |
| Upload + all three API calls, typed | `src/lib/youcam/client.ts` |
| Rule-based color engine, 1 of 8–10 templates | `src/lib/colorEngine/template.ts` |
| Live blend-mode lip + blush rendering | `src/components/LivePreview.tsx` |
| Full end-to-end pass | `src/spikes/EndToEndSpike.tsx` |

The architecture holds. What's missing for the real build is: the remaining 7–9 templates, the
mood-labelling logic that picks which 3 to surface, and all of the actual design.
