# Touchstone: flow and screen spec

What the product actually is, screen by screen, with the constraint each screen has to respect.

Where a number appears it was measured or read off the API console, not estimated.

---

## The whole product, as states

Four states. Camera Kit owns a fifth and we do not design it.

```
[1 Intro] ──> [2 Capture: Camera Kit owns this] ──> [3 Analysing] ──> [4 Outfit] ──> [5 Looks]
     │                                                                    │              │
     └──> sample face ────────────────────────────────────────────────────┘        shade sheet
                                                                    (skippable)   placement proof
                                                                                foundation match
```

No accounts, no catalogue, no purchase step, no saved looks.

---

## 1. Intro

One job: get to a face. One headline, one button, and three sample faces underneath.

- **The samples are not decoration.** Without them, anyone on a desktop without a webcam, or
  anyone unwilling to photograph themselves, cannot reach the product at all. They ignore the
  camera-ready flag, because the point of a sample is that it needs no camera.
- They span Fitzpatrick II, IV and VI deliberately. The engine's central claim is about how
  colour placement behaves across skin depth, and three faces from one band would demonstrate
  nothing.
- They are generated faces, and the screen says so in the label rather than in a footnote.
- A sample enters through the ordinary path: fetched, handed over as a `File`, uploaded, analysed,
  rendered. There is one flow, so the sample flow cannot drift from the real one.

## 2. Capture: Camera Kit owns this screen

**The most important constraint in this document.** The YouCam JS Camera Kit renders its own
fullscreen capture UI into a `<div id="YMK-module">` mount. It brings its own framing guides,
shutter, camera flip and face-position validation, and cannot meaningfully be restyled.

- **Do not design a capture screen.** Any mockup with a custom shutter or framing overlay is not
  buildable as drawn.
- What we own is the handoff in both directions: the button that opens it, and what happens the
  instant it returns an image.
- Its own face-position validation runs before it hands anything back, so most bad inputs never
  reach our code. No redundant "move closer" UI.
- Camera Kit needs no API key. Confirmed live: `YMK.init()` does not validate one client-side.

## 3. Analysing

**Load-bearing, and cannot be a spinner.** Measured latency:

| Step | Measured |
| --- | --- |
| Upload (File API + presigned PUT) | ~1s, varies with connection |
| Facial Color Tones | ~1.5s |
| Fitzpatrick | ~1.9s, in parallel with the above |
| Makeup VTO, per look | ~1.5-2s |

The analysis resolves well before the renders do, so its results are revealed as they land: her
measured skin, eye and hair colour as real swatches of her own colouring, then the derived
Fitzpatrick type. That fills the wait with evidence that something was genuinely measured, which
is the whole trust problem this product exists to answer.

The progress bar is scaled to whichever pass is running, analysis or rendering, rather than to a
total that would sit still through the outfit step. Nothing about it is fabricated.

## 4. Outfit (optional)

Sits between the analysis and the renders, because rendering is the expensive part and the outfit
changes which looks are worth rendering at all. Asking afterwards would mean paying twice.

- Photograph a garment, pick one of three we ship, or skip. Skipping is a first-class path, not a
  failure: plenty of people are not dressing for anything in particular.
- The photo goes through `sod` background removal, then palette extraction from the surviving
  pixels. Perfect Corp has no garment-analysis endpoint, so the colours come from the image.
- Extracted swatches are shown ticked, with anything that is not part of the outfit unticked by
  the user. The common case is that we got it right and should cost zero taps.
- The three shipped garments are chosen by **measured chroma**, one per branch of the influence
  rule, so the demo shows three different behaviours rather than three colours:

| Garment | Chroma | Loudness | Behaviour |
| --- | --- | --- | --- |
| Cobalt | 0.172 | 1.00 | Leads; the looks step back |
| Clay | 0.074 | 0.45 | Carries a hue; the eye picks it up |
| Charcoal | 0.009 | 0 | No usable hue; the makeup leads |

## 5. Looks

Five renders of her own face, chosen from eleven templates.

- **Mood labels only.** Never a template id, never a technical descriptor.
- Each carries a two-sentence line: what the look is going for, then why it was picked for her.
  The second sentence is computed for the set rather than per look, so no two cards can give the
  same reason.
- Three shades per card with **names**, not hex. "Vivid brick" is something she can say at a
  counter; `#c14f35` is not. The full ten-shade palette is behind a tap.
- **This is the one screen that widens on desktop.** The steps before it ask one thing at a time.
  This one is five renders meant to be compared, and a phone column can only ever show one.

Rendered URLs are **pre-signed and expire in two hours**. A session is cached for 90 minutes so a
reload never shows a broken image, and only the renders are cached: everything else is derived
again from the stored measurements, so an engine change is never masked by a stale session.

### Three surfaces below the looks

**Shade sheet.** Every colour in one look, in the order a face is made up, each named and with its
value. A bottom sheet on a phone, a centred dialog on a laptop.

**Placement proof.** The engine's one real claim, shown rather than asserted. Makeup colour is
conventionally placed below the skin's own lightness, which is a fair-skin assumption: there is
room below fair skin and almost none below deep skin, and what room exists is where sRGB cannot
hold a saturated colour at all. Both shades come from the same engine with only that rule
switched off. On the deepest colouring the conventional rule lands on "black" and the adapted one
on "vivid raspberry". Rendering both on her face costs one unit and is offered, not forced.

**Foundation match.** Three shades around her measurement, holding her undertone and moving only
depth, compared against her bare photo with a drag-to-wipe. Three rather than one because the
measurement will not carry one: `skin_color` is an average off a photo of the face, foundation is
matched at the jaw, and her camera is uncalibrated.

---

## Cross-cutting constraints

- **Mobile-first**, with the looks screen the single exception.
- **No accounts, no commerce, no LLM in the personalisation path.**
- **One credential, never in the browser.** `YOUCAM_API_KEY` is deliberately not `VITE_`-prefixed,
  since anything Vite sees as `VITE_*` is inlined into the built JavaScript. The client calls
  `/api/youcam/...` with no credentials; a Vercel function attaches the header in production and a
  Vite plugin does the same in dev.
- **Failure states we own** (the rest is Camera Kit's job): a task returning `error`, a network
  timeout during polling, an expired render URL, and an unreadable garment photo, which is
  recoverable and leaves the analysis behind it untouched.

## Unit costs, confirmed

Read from the console's usage export on 11 Aug, not assumed.

| Call | Units |
| --- | --- |
| Facial Color Tones | 20 |
| Fitzpatrick | 10 |
| Makeup VTO, per render | 1 |
| Background removal (`sod`) | 1 |

**A full run costs 33 units**, of which **30 are spent before a single look is rendered**. An
earlier estimate of 5 counted tasks rather than units and was wrong by a factor of about seven.

Two consequences shaped the build. Re-rendering against an already-analysed image is cheap, which
is what makes the placement counterfactual and the foundation comparison affordable at one unit
each, on request. And iterating on the engine had to become free: stored analyses replay a real
measurement at zero units, and seven check suites run offline against them.
