# Touchstone — Design System

Source inputs: the beauty/editorial entries from the `ui-ux-pro-max` skill database, the measured
constraints in [flow-spec.md](./flow-spec.md), and the product thesis in [CLAIMS.md](./CLAIMS.md).

## The one rule everything else serves

**The interface has no brand colour. The user's own extracted colours are the only saturated
colour on screen.**

This is functional, not stylistic. After capture, every screen is dominated by a face and by
makeup shades the user is trying to judge. A saturated UI colour sitting beside a rendered lip
shade measurably interferes with reading that shade — the same reason Lightroom, Capture One and
every colour-grading tool use neutral chrome. It also sidesteps a real problem for this product
specifically: any brand accent flatters some skin tones more than others, which is awkward for a
product pitched on existing tools failing people outside the lightest range.

So: warm, light, editorial surfaces — the beauty-category idiom users expect — with **zero
saturated hue in the chrome**. Warmth comes from the neutrals themselves, not from an accent.

## Palette

Warm neutral, light mode. No accent colour is defined on purpose.

| Role | Hex | Notes |
|---|---|---|
| Background | `#F7F4EF` | Warm bone. The dominant surface. |
| Surface / card | `#FFFFFF` | Pure white for cards holding face imagery — neutral ground for colour judgement. |
| Foreground | `#1C1917` | Warm near-black. Body and headline text. |
| Muted foreground | `#6B6259` | Secondary text, captions, hex value labels. Verify ≥4.5:1 on both surfaces. |
| Border | `#E7E1D8` | Hairline dividers, card edges. |
| Primary (actions) | `#2A2320` | Deep espresso — near-black, deliberately not a hue. Buttons, active states. |
| On primary | `#FAF8F5` | |
| Destructive | `#B91C1C` | Errors only. The single permitted saturated chrome colour, and it should be rare. |

**User-supplied colour** — the extracted `skin_color`, `eye_color`, `hair_color`, and each look's
lip/blush values — renders as swatches and accents. These are the visual interest. Do not tint,
overlay, or "harmonise" them; they must be shown as the true measured value or the product's core
claim is undermined.

## Typography

Per the skill's "Elegant Luxury" pairing (best-for: luxury brands, fashion, spa, beauty, editorial):

- **Headline:** Playfair Display — 400/500/700
- **Body & labels:** Inter — 300/400/500/600
- **Hex values and measured data:** Inter, tabular figures, letter-spaced uppercase for labels.
  Numbers that represent measurements should look measured.

Base body size 16px minimum, line-height 1.5.

## Shape & depth

- Corner radius: 4px on controls, 8px on cards/images. Editorial leans sharp; avoid pill shapes
  except where a control is genuinely a chip/tag.
- Depth via hairline borders and generous whitespace, not heavy shadows. If shadow is used, keep it
  soft and warm-tinted, never grey-blue.
- Generous margins. Whitespace is the main luxury signal in this idiom and costs nothing.

## Motion

- 150–300ms, ease-out. Motion should convey spatial continuity between a look card and the sheet
  it opens, not decorate.
- Respect `prefers-reduced-motion`.
- The analysing state is the one place extended motion is justified — see below.

## Screen-specific direction

Full behavioural detail is in [flow-spec.md](./flow-spec.md). Design-relevant highlights:

### Intro
One headline, one button. No carousel, no pre-permission explainer. Playfair headline is the whole
visual — this is the only screen where type carries the design alone.

### Capture — **not ours to design**
YouCam Camera Kit renders its own fullscreen UI (shutter, framing guides, face-position validation)
into a fixed mount point. **Do not produce a capture screen mockup** — a custom shutter or framing
overlay is not buildable. Design only the hand-off into and out of it.

### Analysing
Runs 5–8 seconds — real measured latency, not padding. Analysis resolves ~2s in, well before the
renders finish, so the user's actual extracted swatches (skin, eye, hair) can appear progressively
while the looks render.

This is the product's credibility moment: real measured colour, shown as it arrives, against a
neutral ground. It is the single best argument that this is not another filter guessing. Design it
as a reveal, not a spinner. Do not fabricate progress steps — the real ones are enough.

### Outfit — optional
Sits between analysing and the looks. Skipping is a first-class path and must look like one, not
like a failure to complete a step.

### Looks
Five rendered images of the user's own face, labelled **by mood only** — never by template or
technical name. Personalisation should feel discovered, not picked from a menu. Tapping a card
opens its full shade list.

Each card carries a shade's **name** beside its swatch, not its hex. A hex is a measurement she
cannot repeat at a counter; the values live in the sheet, where she is considering one look rather
than scanning five.

**The only screen that widens past the phone column.** Every other screen asks one thing at a time
and a wide column would only separate the question from its answer. This one is five renders meant
to be compared, which a single column cannot do. Two columns at 48rem, three at 64rem.

Rendered image URLs are pre-signed and expire in 2 hours — no "save your looks" affordance that
implies permanence.

### The two exhibits below the looks
Both sit *after* the payoff, never before it. They are evidence, and evidence reads better after
the thing it is evidence for.

**Placement proof** shows one shade placed the conventional way against the same shade placed for
her depth, named as well as valued, with the rendered pair on request. **Foundation match** is a
drag-to-compare wipe rather than a side-by-side, because a correct foundation is invisible and two
near-identical images side by side read as a rendering fault.

## Non-negotiables (from the skill's pre-delivery checklist)

- Contrast ≥4.5:1 for body text; verify the muted foreground on both surface colours
- Touch targets ≥44×44px with ≥8px spacing
- SVG icons only (Heroicons/Lucide) — never emoji as icons
- Visible focus states; never remove focus rings
- `prefers-reduced-motion` respected
- Mobile-first: 375px is the primary target, this is a selfie product
- Reserve layout space for images so the face render arriving doesn't shift the page

## Anti-patterns for this product specifically

- Any saturated brand hue in chrome — pinks, corals, purples, golds
- "AI product" visual language: neon, gradient meshes, purple/cyan, "compute" aesthetics. This is a
  beauty tool that happens to measure accurately, not an AI demo.
- Tinting or filtering the user's face imagery or extracted swatches
- Dark mode (rejected: the beauty category convention is strongly light, and the colour-critical
  benefit of dark is not worth fighting that expectation)
- Skeuomorphic makeup textures, compact-case metaphors, glitter
