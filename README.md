# Touchstone

Makeup looks built from two things that can actually be measured about you: your colouring, and
the outfit you're about to wear. Every shade is checked to make sure you'd be able to see it on
your own face.

Built for the YouCam API Skin AI & Apparel VTO Hackathon. Perfect Corp's APIs read the face and
render the result; the engine in between decides what to put on it.

| | |
| --- | --- |
| **Live** | https://touchstone-lime.vercel.app |
| **Flow and screens** | [Spec](https://claude.ai/code/artifact/88c56f33-102a-4e79-ad2d-d24d387a8976) |
| **What we claim, and what we don't** | [Positioning](https://claude.ai/code/artifact/8177a4bb-31cc-438b-8cdb-93080cd5ee9a) |
| **Evidence behind it** | [Research](https://claude.ai/code/artifact/3d7eaf96-5ade-4c12-b26e-6c801e1831a4) |

**No camera required.** The first screen offers three faces spanning Fitzpatrick II, IV and VI,
and the outfit step offers three garments. They run the same upload, analysis and render path a
real photo does.

---

## The claim

Makeup colour is conventionally placed below the skin's own lightness. That is a fair-skin
assumption. There is room below fair skin and almost none below deep skin, and what room exists
is the region sRGB cannot hold a saturated colour in at all. So the conventional rule does not
produce a deeper shade there. It produces something close to black.

One look, computed across the fixture range. Both columns come from the same engine, the same
look and the same visibility guards; the only difference is that one placement rule:

| Colouring | Fitz | Placed the usual way | Placed for depth | ΔE moved |
| --- | --- | --- | --- | --- |
| Very fair, cool | I | `#f83698` (chroma 0.238) | `#f83698` (chroma 0.238) | 0.000 |
| Light, cool | II | `#e31e85` (chroma 0.234) | `#e31e85` (chroma 0.234) | 0.000 |
| Medium, warm | IV | `#80341e` (chroma 0.111) | `#80341e` (chroma 0.111) | 0.000 |
| Olive, neutral | IV | `#7c301a` (chroma 0.111) | `#7c301a` (chroma 0.111) | 0.000 |
| Deep, warm | V | `#461a0c` (chroma 0.072) | `#5d1801` (chroma 0.105) | 0.052 |
| Deepest | VI | `#050403` (chroma 0.005) | `#a7075d` (chroma 0.191) | 0.414 |

**The rule does nothing until it is needed.** It is identical across the five lighter fixtures.
Not a special case bolted on for deep skin, then, but a rule that only binds where there is no
room below.

**Distance is not visibility.** That "usual way" column is the shade *after* the visibility guard
has run and tried to push it clear of the skin. On the deepest colouring the conventional
placement scores ΔE 0.247 from her skin and the adapted one scores 0.205, so a pure distance test
passes the black and ranks it *higher*. Black is a long way from skin and still not a lipstick. A
shade has to clear a distance **and** survive as a colour.

The app shows this rather than asserting it: `PlacementProof` displays both shades, and on request
renders the same look with that one rule switched off, so the comparison is two faces rather than
two hex values.

---

## Check it without taking our word for it

```bash
cd app && npm install && npm run checks
```

Seven suites, no network, no API key, no units. They run against stored measurements spanning
Fitzpatrick I to VI, so the claim above can be verified in about thirty seconds by someone who has
never seen this code. Several are named after the failure that prompted them.

| Suite | Asserts |
| --- | --- |
| `placement.check.ts` | The shade in use still has colour in it; the adaptation stays inert where it isn't needed; where the conventional rule collapses, ours doesn't |
| `engine.check.ts` | Looks stay distinct, bold reads bolder than soft, the outfit influences without hijacking |
| `blend.check.ts` | A shade is visible on what it sits on, keeps its texture, and lands on the right hue at every luminance |
| `garment.check.ts` | Garment palette extraction against a real API cutout |
| `patterns.check.ts` | Every pattern label exists in the live catalogues. An invalid one fails a render with no useful message |
| `shadeName.check.ts` | Shades sharing a name really are the same shade, and the pair the placement proof shows side by side never is |
| `oklch.check.ts` | The colour maths itself |

The three files alongside them (`vtoProbe`, `browProbe`, `realCutout`) call the live API and cost
units. They exist to answer a question once and are excluded from `npm run checks`.

`npm run sweep` regenerates the table above from the engine, so it cannot drift from the code.

---

## Where the APIs sit

The chain is: their measurement → our decision → their rendering.

| API | Role |
| --- | --- |
| `skin-tone-analysis` | Measured skin, lip, hair and eye colour. The guarantee is computed against these, since you cannot check a shade is visible on someone without knowing their real colour |
| `fitzpatrick-scale-analyzer` | Independent depth reading; cross-checks the measurement and drives register selection |
| `makeup-vto` | Renders each finished look, and the placement counterfactual |
| `sod` | Background removal, used off-label as preprocessing for garment colour extraction |

A full run costs 33 units, of which 30 are spent before a single look is rendered.

---

## How it fits together

```
intro       Camera Kit capture
analysing   skin-tone-analysis + fitzpatrick-scale-analyzer -> ColourProfile
outfit      optional garment photo -> sod -> palette extraction -> look selection
looks       five looks rendered by makeup-vto, then the placement proof and the foundation match
```

**If you read three files, read these.**

- `lib/colorEngine/palette.ts` builds one colour for one role, in OKLCh, placed relative to
  measured skin lightness. This is where the depth adaptation lives, and it is the argument above
  in about forty lines.
- `lib/colorEngine/__checks__/placement.check.ts` is that argument as assertions: the adaptation
  stays inert where it is not needed, and where the conventional rule collapses, ours does not.
- `components/PlacementProof.tsx` is how it reaches the user, which is as two shades and, on
  request, two faces.

The rest:
- `lib/colorEngine/template.ts` holds eleven look structures; five are chosen per person and filled
  with their colours.
- `lib/colorEngine/shadeName.ts` turns a measured colour into words, so a swatch reads "vivid
  brick" rather than a hex nobody can repeat at a counter.
- `lib/garment/` covers palette extraction from a garment photo, and how it influences selection.
- `docs/` holds [POSITIONING.md](docs/POSITIONING.md) (what this can and cannot claim, and why),
  [RESEARCH.md](docs/RESEARCH.md) (user and market evidence), and the API notes.

## Running it yourself

```bash
cd app
npm install
cp .env.example .env.local     # add YOUCAM_API_KEY
npm run dev
```

One credential, and it never reaches the browser. `YOUCAM_API_KEY` is deliberately not prefixed
with `VITE_`: anything Vite sees as `VITE_*` is inlined into the built JavaScript. The client calls
`/api/youcam/...` with no credentials at all. A Vercel function attaches the header in production,
and a Vite plugin does the same in dev. Camera Kit needs no key; confirmed live that `YMK.init()` does
not validate one client-side.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server, with the API proxy |
| `npm run build` | Typecheck and build |
| `npm run checks` | All seven offline check suites. No network, no API units |
| `npm run sweep` | Regenerate [docs/SWEEP.md](docs/SWEEP.md) from the engine |

### Deploying

Vercel, root directory `app`, with `YOUCAM_API_KEY` set as a server environment variable.
`api/youcam.ts` serves it, with `vercel.json` rewriting `/api/youcam/:path*` onto it.

