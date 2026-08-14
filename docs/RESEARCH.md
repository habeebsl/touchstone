# Research notes

Why Undertone is built the way it is. Recorded on 2026-08-12, during the build.

Everything here is labelled by how much weight it can carry. That matters more than the findings
themselves: two of the decisions below rest on a single interview, and one rests on a leading
question that should carry no weight at all.

---

## 1. The user interview (n = 1)

One conversation, with the developer's sister, over WhatsApp on 2026-08-11. She wears makeup but
owns few products. **Sample of one, and a related one — treat as a story, not as validation.**

The first seven questions were open and past-tense. The last three were leading ("would you use
it?") and are recorded only so nobody later mistakes them for evidence.

### What she said

| Q | Answer |
|---|---|
| Last product bought | "lip colors, lip liners and mascara… I love how mascara makes my eye pop and twinkle" |
| Ever bought and not used | "Nope. I don't really have make up products asides the ones I mentioned" |
| How you know a shade suits you | Talked about *foundation* shade ranges and brands labelling skin tones |
| Outfit or makeup first | "What you're wearing" |
| Time an outfit changed your makeup | "Yes… my birthday shoot" — changed **eye shadow and lip colour**; wore a sleeveless top first "to prevent staining my dress", then a **blue-based** multicoloured dress |
| A colour you love that doesn't suit you | "Nah there isn't" |
| What you'd want from a paid colour analysis | "Black, blue, red, orange. I honestly don't think there's any colour that wouldn't suit me" |

### Reading

**The outfit story is the strongest evidence in this document.** Unprompted, specific, and she
volunteered the dress's *undertone* ("blue-based") as the thing that drove the change — the exact
axis the engine reasons about. She also changed precisely the two regions the engine's accent
system controls. The staining detail independently confirms the sequence: outfit chosen → makeup
applied → dress on last.

**She rejects the framing the app was built on.** "There's no colour that wouldn't suit me" is not
"I don't know which colours suit me" — she doesn't accept the category. And when asked how she
picks a shade she answered about foundation *matching*, a solved problem, not about colour
harmony. A product that opens with "here's your season, here's what to avoid" would land badly.

**She's an outlier on the pain**, and her own answer says why: three products, bought rarely, so
no history of expensive mistakes. §2 shows the wider picture is very different.

**Her kit is lip colour, lip liner, mascara.** Looks that render eight categories are not
actionable for someone who owns three.

---

## 2. Is the problem real? (external research, good evidence)

### Shade frustration is widespread

Ipsos survey — proportion who report frustration finding the right shade:

| Product | Frustrated |
|---|---|
| Foundation | 65% |
| Concealer | 60% |
| **Lipstick** | **50%** |
| **Blush** | **41%** |

86% would try a device that guarantees a shade match; 94% among cosmetics users; 90% would trust
its result.

**Note honestly: the biggest pain is foundation, which this product does not solve.** We address
lipstick and blush — half and two-fifths of respondents. Large, real, but the submission must not
imply otherwise.

### Getting it wrong is expensive

- 64% of beauty returns happen because the product looked different in person.
- Foundation/concealer return rates ~23% where returns are allowed, above the ecommerce average.
- Hygiene rules block opened-product returns, so **most dissatisfaction never becomes a return** —
  she keeps the wrong shade and stops buying from that brand.

### Demand for colour analysis specifically

- The #1 must-do for beauty tourists visiting South Korea; TikTok has been the biggest demand
  driver for three years.
- Seoul studios: ~$60–115 for a 4-type session, ~$115–190 for 8/12-season. House of Colour
  Brooklyn: **$545** for three hours.
- **Seoul studios now take a spectrophotometer reading first** — skin brightness, redness and
  yellowness as numbers — before the traditional fabric draping.

That last point is the sharpest framing available to us: *Touchstone does from a selfie what those
studios do with an instrument.*

### Undertone is genuinely hard to self-assess

The folk methods are the vein test and the jewellery test. Multiple sources note identifying your
own undertone is harder in practice than the guides admit, and that "spotting the underlying cast
in a lip shade can be challenging for the untrained eye."

**Counterpoint worth keeping:** at least one first-hand account argues undertone matters little
for lipstick and what decides it is whether the shade is lighter or darker than the natural lip.
The engine happens to reason about both, so it is covered either way — but the framework is not
uncontested.

---

## 3. Deep skin — the documented failure we already fix

Well-recorded industry history: limited deep ranges (YSL, Givenchy, Tarte, Beautyblender), Fenty's
50 shades in 2017 as the turning point, and its *deep* shades selling out first.

The line that matters for us, from beauty professionals describing what is still wrong even when
the shade category is right:

> whether blushes, bronzers, eye shadows, and lipsticks were **actually pigmented enough to show
> up on the skin**

That is exactly the two bugs already fixed in the colour engine:

- the **visibility guard**, which enforces a minimum perceptual distance from measured skin, and
- the **"bold means vivid, not darker"** rework, after the first version produced a near-black
  statement lip on Fitzpatrick VI.

We solved a named industry failure without knowing it had a name. It should be shown, not
claimed — the engine lab renders every template across Fitzpatrick I–VI at zero API cost.

---

## 4. Outfit ↔ makeup coordination (trade convention, consistent across sources)

Salon and makeup-academy sources converge on:

- **Complement, don't match.** An exact colour match reads cheap; softly coordinating shades read
  elegant.
- **Bold outfit → step the makeup back.** Bright dress, neutral face. Neutral outfit → licence to
  go bold on lip or eye.
- **Cool garments** (blue, silver) → taupe, grey, silver shadow. **Warm** (red, gold) → bronze,
  copper.
- **Red dress → nude lip, soft brown eye.** Let the dress lead.
- Alternative anchor: coordinate with an accessory rather than the main garment.

This is trade convention, not research — but it is consistent, and it corroborates the one real
user story we have.

### How we encode it

The rules map onto machinery that already exists, so the engine gains an input rather than a
rewrite:

| Convention | Mechanism |
|---|---|
| Bold outfit → step back | Garment loudness lowers `preferredIntensity`, changing *which looks are offered* |
| Cool/warm garment → matching shadow | Garment hue nudges the eyeshadow accent, blended partway |
| Complement, don't match | Hue shifts stay clamped to ±16°, inside her seasonal palette |
| Don't clash with the dress | If the lip lands within ~20° of a loud garment colour, push it apart or drop its chroma |
| Neutral outfit → go bolder | Raises `preferredIntensity` slightly |

**Deliberate limit:** the outfit never takes over the lip's hue family. If the garment can drag
the makeup anywhere, the product is a matching toy and the claim that it suits *her* is gone.
Demo legibility comes from explaining the influence on each card, not from amplifying it.

---

## 5. Decisions taken as a result

| Decision | Rests on | Confidence |
|---|---|---|
| Build outfit-aware makeup at all | Her birthday-shoot story + §4 trade convention | Medium — one story, but specific and conventional |
| Reframe from "what suits you" to outfit-led styling | Her Q7 rejection of the premise | Medium-low — n=1, but nothing contradicts it |
| Outfit influence stays subtle | Reasoning, not evidence | Low — revisit if it doesn't read in the demo |
| Show colouring + foundation readout on the Looks screen | §2 foundation being the top pain; analysis currently invisible | Medium |
| Add lip liner and lashes | Her stated kit, and the mascara enthusiasm | Medium |
| Make deep-skin handling explicit in the submission | §3, strong external evidence | High |
| Palette (multi-swatch) rather than one garment colour | Real outfits are multi-garment; confirmed by the cut-out test image | High |
| Don't add foundation as a *rendered* effect | Invisible when right; reads as skin-lightening when wrong | High |
| Takeaway palette card demoted | Her Q7 suggests she wouldn't value it | Low — was ranked higher before the interview |

---

## 6. Open questions

Things we are acting on without evidence, listed so they are not mistaken for settled:

- How much outfit influence reads as intelligent versus gimmicky. Pure judgement right now.
- Whether five looks feels generous or overwhelming.
- Whether "Autumn"/"Winter" naming reads as fun or as a verdict. (It is a colour-analysis
  convention with no relation to the calendar — worth relabelling as "Warm Deep" etc. if it
  confuses.)
- Whether anyone wants a takeaway artefact, or whether the renders are the whole value.
- Everything about people who wear a lot of makeup: our one interviewee owns three products.

**What would change our minds:** two or three more interviews, especially with someone who wears
makeup daily. Question 5 ("can you think of a time what you were wearing changed your makeup?") is
the one that matters — if nobody can produce a specific instance, the apparel work is weaker than
this document assumes.

---

## Sources

- [Ipsos — shade-match frustration survey](https://www.ipsos.com/en-us/nearly-nine-ten-women-would-try-hand-held-device-which-guarantees-find-their-perfect-foundation)
- [Eightx — beauty & cosmetics return-rate benchmarks 2026](https://eightx.co/blog/average-beauty-and-cosmetics-return-rate-benchmarks)
- [Mintoiro — the real cost of a bad shade match](https://www.mintoiro.com/post/the-real-cost-of-a-bad-shade-match)
- [TIME — personal colour analysis craze fuels Korean tourism](https://time.com/6299099/personal-color-analysis-korea-tourism/)
- [Kissinskin — what Korean colour analysis costs](https://kissinskin.net/en/guides/personal-color-analysis-korea/)
- [Extent Research — personal colour analysis market & AI growth](https://www.extentresearch.com/blog/personal-colour-analysis-market)
- [Medium — trying to use undertones to choose lipstick](https://medium.com/@amynicholewilson/my-experience-trying-to-use-warm-and-cool-undertones-to-choose-lipstick-shades-ef49f0bccbc6)
- [Global News — the makeup industry is still failing people with dark skin](https://globalnews.ca/news/6537327/makeup-dark-skin/)
- [Who What Wear — inclusive shade ranges](https://www.whowhatwear.com/beauty/makeup/diverse-complexion-shade-ranges)
- [QC Makeup Academy — rules for matching makeup to your outfit](https://www.qcmakeupacademy.com/blog/2017/12/4-rules-matching-makeup-outfit)
- [Crazy Girls Salon — matching makeup with dress colour and event theme](https://www.crazygirlssalon.com/match-makeup-with-event-theme-dress-colour/)
