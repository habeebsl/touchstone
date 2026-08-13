# Positioning

Written 13 Aug 2026, four days before the deadline, after checking what already ships.
Companion to [RESEARCH.md](RESEARCH.md), which holds the user and market evidence this rests on.

---

## 1. Where we actually stand

We checked whether the idea is novel. It is not. Recording this plainly so it does not get
re-litigated, and so nothing in the submission claims otherwise.

**The core loop already ships — in the sponsor's own app.** YouCam Makeup's AI Agent takes a
selfie, determines a seasonal colour type from undertones, and recommends makeup shades, clothing
colours and hair colour. That is Undertone's main flow, shipped, by Perfect Corp.

**Outfit → makeup is occupied too.**

| Product | What it does |
|---|---|
| Chanel Lipscanner (2021) | Photograph any object, including an outfit; matches the closest lipstick shade pixel-by-pixel |
| ShadeScout | Capture any colour, find matching cosmetics across thousands of products |
| Makeup Check AI | Answers "what lipstick matches my dress?" |
| STIL | Outfit → makeup recommendations, from app-generated outfits |
| Dressika | Explicitly coordinates makeup, hair and clothes |

Our garment path differs in mechanism — a full palette extracted from a photo of real clothing,
influencing look *selection* rather than nearest-product lookup — but that is not a distinction
worth claiming novelty for.

**Conclusion: we do not compete on Quality of the Idea.** Three of the four judging criteria
remain, and we are strong on them. Optimise for those.

### What did survive

The literature documents the exact failure our engine is built against:

> "Deeper skin tones amplify visibility problems because the contrast ratio between lip and
> surrounding skin compresses colour gamut perception."

> "An algorithm correctly identified a foundation match but rendered blush as **barely visible** —
> even at maximum intensity — because it assumed her natural flush level was lower than it
> actually is."

That is our check suite, almost verbatim: `barely visible (dE …)` and `blush darkens deep skin`
are named, failing assertions across a Fitzpatrick I–VI fixture set. 77% of faces in major
computer-vision datasets are Fitzpatrick I–III, which is why incumbents fail at the deep end.

So the differentiator is not a feature. It is that **our recommender is correct on skin the
shipped tools measurably get wrong**, and we can demonstrate it.

---

## 2. What we claim, and what we don't

**We do not claim** to read skin better than Perfect Corp. We use `skin-tone-analysis` and
`fitzpatrick-scale-analyzer` for exactly that. Claiming to beat them at their own measurement is
false and trivially checked.

**We claim** that every shade we recommend clears a measured perceptual-visibility floor against
that person's own skin and lip colour, verified across the full Fitzpatrick range.

The accuracy story is **correct by construction, not better sensors.**

---

## 3. The technical claim, stated properly

The one-line version — "shades too close to see get moved" — undersells it into a checkbox. The
statement is simple; satisfying it is not.

A shade must clear four constraints simultaneously:

1. Far enough from her **skin** that it reads as makeup
2. Far enough from her **own lip colour** that you can tell something was applied
3. Still inside her **palette** — hue clamped to ±16°
4. **Distinct from the other four looks**, or the set stops being a choice

Any one is a loop. Together they fight. On 13 Aug, scaling the natural-lip gap by application
intensity satisfied constraint 2 and immediately broke constraint 4 — `Polished and Feline share
a lip colour`, `bold no more striking than soft`. It was reverted. The check suite caught a
plausible change collapsing the product, which is the evidence that this is constraint
satisfaction rather than a threshold.

The non-obvious part is directional. **On deep skin you cannot fix an invisible shade by
darkening it — you run out of colour.** sRGB cannot hold saturated colour at low lightness, so
pushing a shade "further away" downward makes it both less visible and less renderable. The guard
has to know which way to move, and that constraint only binds at the deep end of the range —
which is precisely where the industry's tools fail.

---

## 4. Where the APIs are load-bearing

Honest accounting, because a judge will ask.

| API | Role | Load-bearing? |
|---|---|---|
| `skin-tone-analysis` | Measured skin, lip, hair, eye colour | **Yes** — the guarantee is measured against these. Without real values there is nothing to compute visibility against |
| `fitzpatrick-scale-analyzer` | Independent depth reading | **Yes** — cross-checks the measurement, drives register selection |
| `makeup-vto` | Renders the finished look | **Yes** — the output device for the whole pipeline |
| `sod` | Background removal before garment palette extraction | **Yes**, and off-label — it is a background remover used as colour-extraction preprocessing |

The visibility guard itself is arithmetic on hex values; no API does that part, and we should not
imply otherwise. The framing that is both true and generous to the sponsor:

> Their measurement makes the guarantee possible. The guarantee is what makes the measurement
> useful.

---

## 5. Copy

### Tagline

> **Makeup that shows up on you.**

Both senses intended. Alternative, for the rigour angle: *The colour analyst that shows its work.*

### Devpost summary

> Undertone builds makeup looks from two things it can actually measure: your colouring, and the
> outfit you're about to wear. Perfect Corp's APIs read your skin, lips and undertone. Undertone
> turns that into five complete looks and renders them on your face.
>
> The part nobody else does is the check. Every shade has to clear a measured perceptual distance
> from your own skin and your own lips, stay inside your palette, and stay distinct from the other
> four looks. Shades that can't clear all four don't get recommended.
>
> That last constraint is why this is hard on deep skin: you can't fix an invisible shade by
> darkening it — you run out of colour. The engine solves for all four at once, and the result is
> verified across the full Fitzpatrick range, I through VI.

### Video open — first 20 seconds

> My sister picked a blue-based dress for her birthday shoot, then changed her eyeshadow and her
> lip to go with it. She did that by eye, with three products.
>
> Every app I tried started somewhere else. A quiz. A season. A wall of five hundred shades.
>
> Undertone starts where she started. And before it hands you a colour, it checks that you'll
> actually be able to see it.

### Rules for all copy

- **"Season" appears once**, in the list of what other apps do. Never in the promise.
  RESEARCH.md §1: a product that opens with "here's your season" lands badly with the one real
  user we interviewed.
- Frame the failure as **industry-wide and dataset-driven**, never as "YouCam gets this wrong."
  We are pitching the company whose app is in that set.
- The outfit is the **occasion**. The visibility guarantee is the **claim**.

---

## 6. Build plan

Ordered by argument delivered per hour. Roughly a day and a half; the video and write-up need the
remaining two full days.

**1. Shade receipts — the guard made visible.** For each recommended shade, show what the engine
did: the shade the palette first picked, its measured ΔE from her own lip, the floor it failed,
and the adjusted shade that clears it. The data already exists inside `enforceDistance` and is
discarded. Surfacing it turns an internal invariant into a per-user proof that fires live on a
judge's own face.

**2. The Fitzpatrick sweep.** One look template across all six fixtures, shades side by side with
measured ΔE. Proves the engine adapts rather than returning one shade to everyone — the exact
failure the dataset-bias research describes. Exists today only as console output.

**3. Cut the live preview from the submission build.** Not demote — remove. Judges will click it,
a half-working AR filter damages *Design*, and it invites comparison with the sponsor's shipped
flagship. The `ShadeSheet` and all colour content stay; they move onto the looks screen. Code
stays in the repo on a branch.

**4. Package the checks as evidence.** One command, clean output, quoted in the README. The
assertions are already written and already named after the failures in the literature.

---

## 7. Open risks

- **Novelty is our weakest criterion and no amount of building fixes it.** The mitigation is
  framing, not features.
- **The S2S API key is embedded in the built bundle.** Must be decided before any public deploy.
- **The seasonal naming is a convention layered over measurements.** If a judge reads it as
  astrology, the rigour argument dies with it. Keep it subordinate to the measured findings.
- **One interview is one interview.** RESEARCH.md is explicit that Aliyah is an outlier on the
  pain; §2 carries the wider picture and should do the load-bearing work on Potential Impact.
