// Turn a measured colour into words she can use.
//
// Every shade the engine picks was reaching the screen as a hex. A hex is a measurement, not
// something anyone can say at a counter or type into a search box, so the most actionable part of
// the result was also the least usable part of it. The foundation module already made this
// argument for itself (see foundation.ts: "the two words to carry into a shop") and then only
// carried it out for foundation.
//
// The vocabulary is makeup vocabulary, not colour-wheel vocabulary. A lipstick at hue 30° is a
// brick or a terracotta; calling it "dark orange", which is what a generic namer produces, is
// both accurate and useless. Names were chosen to match the words shades are actually sold and
// searched under.
//
// This names a colour. It does not name a product, and the distinction is the same one foundation
// draws: "warm terracotta" is a description of what she is holding, and any claim past that would
// need a shade catalogue we do not have.

import { hexToOklch } from "./oklch";

/**
 * Makeup hue families, by OKLCh hue in degrees.
 *
 * Ordered and read as "up to", wrapping at 360. The arc from roughly 0 to 90 is where nearly
 * every lip, cheek and bronzer shade lives, so it carries most of the resolution; greens and blues
 * get one name each because they appear only as eyeshadow and rarely as anything else.
 */
const FAMILIES: Array<{ upTo: number; name: string; deep?: string; pale?: string }> = [
  { upTo: 12, name: "crimson", deep: "wine", pale: "rose" },
  { upTo: 27, name: "red", deep: "oxblood", pale: "rose" },
  { upTo: 40, name: "brick", deep: "mahogany", pale: "peach" },
  { upTo: 55, name: "terracotta", deep: "chocolate", pale: "apricot" },
  { upTo: 70, name: "copper", deep: "bronze", pale: "sand" },
  { upTo: 95, name: "gold", deep: "olive", pale: "champagne" },
  { upTo: 140, name: "moss", deep: "forest", pale: "sage" },
  { upTo: 200, name: "jade", deep: "pine", pale: "mint" },
  { upTo: 260, name: "teal", deep: "navy", pale: "sky" },
  { upTo: 300, name: "violet", deep: "indigo", pale: "lilac" },
  { upTo: 330, name: "plum", deep: "aubergine", pale: "mauve" },
  { upTo: 350, name: "berry", deep: "blackberry", pale: "pink" },
  { upTo: 361, name: "raspberry", deep: "wine", pale: "blush" },
];

/**
 * Below this chroma there is no hue worth naming, so the name comes from lightness alone.
 *
 * Matches the garment palette's threshold rather than picking a second one: a colour that carries
 * no usable hue direction for an outfit carries none for a lip either.
 */
const NEUTRAL_CHROMA = 0.035;

/** Neutrals, by lightness. These are the browns, taupes and blacks a liner or brow lands on. */
const NEUTRALS: Array<{ upTo: number; name: string }> = [
  { upTo: 0.22, name: "black" },
  { upTo: 0.4, name: "espresso" },
  { upTo: 0.58, name: "taupe" },
  // "Grey", not "greige": these are below the chroma at which any warmth is visible, so a name
  // implying a cast would be describing a colour the swatch does not have.
  { upTo: 0.75, name: "grey" },
  { upTo: 0.9, name: "ivory" },
  { upTo: 1.01, name: "white" },
];

function family(hue: number, lightness: number): string {
  const wrapped = ((hue % 360) + 360) % 360;
  const band = FAMILIES.find((f) => wrapped < f.upTo) ?? FAMILIES[0];
  // A family's own name only holds across the middle of the lightness range. At the ends the word
  // changes rather than taking a modifier: a very deep brick is a mahogany, not a "deep brick",
  // and a pale one is a peach. Modifiers stack badly on the wrong noun.
  //
  // Deliberately the same threshold the modifier uses. Held separately at 0.40 against the
  // modifier's 0.45, the two boundaries fell in different places and split shades that are the
  // same colour: #5f2002 and #5d1801 are dE 0.018 apart, which nobody can see, and came back as
  // "chocolate" and "mahogany". One boundary can be argued with; two cannot be defended at all.
  if (lightness < DEEP_BELOW && band.deep) return band.deep;
  if (lightness > PALE_ABOVE && band.pale) return band.pale;
  return band.name;
}

/**
 * How saturated it is, in the words a shade range uses.
 *
 * Only applied where it changes the picture. Everything in the middle of the chroma range gets no
 * modifier at all, because "medium terracotta" is noise and a name that is always three words long
 * stops being read.
 */
/**
 * Where the modifiers start speaking, calibrated to the range makeup actually occupies.
 *
 * This is the correction that mattered. Set for the full theoretical colour space, both bands sat
 * entirely outside real shades: lipsticks cluster around lightness 0.43 to 0.67 and saturation
 * ratio 0.35 to 0.55, so nothing ever crossed a threshold and every warm lip came back "soft
 * brick". Chosen by sweeping them against every shade the fixtures produce and taking the values
 * that leave no two same-named shades further apart than dE 0.10, which is where a difference
 * stops being arguable. That is 0 of 210 pairs.
 */
const SOFT_BELOW = 0.34;
const VIVID_ABOVE = 0.48;
const DEEP_BELOW = 0.45;
const LIGHT_ABOVE = 0.62;

/** Where a family swaps to its pale noun. Higher than LIGHT_ABOVE: "peach" is a stronger claim
 *  than "light brick" and should be reserved for shades that genuinely are pale. */
const PALE_ABOVE = 0.78;

function saturationRatio(chroma: number, lightness: number): number {
  // Chroma is bounded by lightness in sRGB: a deep shade cannot reach the numbers a mid one can,
  // so a flat threshold would call every deep shade muted. Judged against what is reachable at
  // this lightness instead. The 0.4 factor is the approximate ceiling near mid-lightness.
  const headroom = Math.max(0.06, 0.4 * (1 - Math.abs(lightness - 0.55) / 0.55));
  return chroma / headroom;
}

/**
 * The one modifier, or none, taken from whichever axis is doing the distinguishing.
 *
 * Two earlier rules both failed, in opposite directions. Speaking only at the extremes left the
 * middle of the range wordless and gave four of one person's five lips the name "crimson" while
 * they sat up to dE 0.147 apart. Asking saturation first and lightness second then made a
 * different set worse: five warm lips all came back "soft" because they shared a saturation band,
 * even though they spanned dE 0.152 in lightness, which is the axis that actually separated them.
 *
 * So neither axis gets priority. Each proposes a word and how far past its threshold it is, in
 * units of its own band, and the more extreme one speaks. Two shades then share a name when they
 * are alike on both axes, which is when they really are the same shade.
 */
function modifier(chroma: number, lightness: number): string {
  const ratio = saturationRatio(chroma, lightness);

  const [satWord, satBy] =
    ratio > VIVID_ABOVE
      ? ["vivid", (ratio - VIVID_ABOVE) / (1 - VIVID_ABOVE)]
      : ratio < SOFT_BELOW
        ? ["soft", (SOFT_BELOW - ratio) / SOFT_BELOW]
        : ["", 0];

  const [lightWord, lightBy] =
    lightness < DEEP_BELOW
      ? ["deep", (DEEP_BELOW - lightness) / DEEP_BELOW]
      : lightness > LIGHT_ABOVE
        ? ["light", (lightness - LIGHT_ABOVE) / (1 - LIGHT_ABOVE)]
        : ["", 0];

  return (lightBy > satBy ? lightWord : satWord) as string;
}

/**
 * A short, sayable name for a measured colour, e.g. "soft terracotta" or "deep berry".
 *
 * Deliberately at most two words. Three-word names read as marketing copy and stop carrying
 * information, and this sits under a swatch she can already see: the name only has to be enough to
 * repeat out loud, since the swatch is doing the describing.
 */
export function nameShade(hex: string): string {
  const { l, c, h } = hexToOklch(hex);

  if (c < NEUTRAL_CHROMA) {
    return (NEUTRALS.find((n) => l < n.upTo) ?? NEUTRALS[NEUTRALS.length - 1]).name;
  }

  const noun = family(h, l);
  const base = FAMILIES.find((f) => (((h % 360) + 360) % 360) < f.upTo);
  const carried = noun !== base?.name;

  // A noun that already carries the depth ("mahogany" is deep by definition) must not take a
  // depth word on top, or we get "deep mahogany". Saturation still applies to it.
  const word = carried
    ? saturationRatio(c, l) > VIVID_ABOVE
      ? "vivid"
      : saturationRatio(c, l) < SOFT_BELOW
        ? "soft"
        : ""
    : modifier(c, l);
  return word ? `${word} ${noun}` : noun;
}

/** The same, capitalised for use at the start of a label. */
export function nameShadeTitle(hex: string): string {
  const name = nameShade(hex);
  return `${name[0].toUpperCase()}${name.slice(1)}`;
}
