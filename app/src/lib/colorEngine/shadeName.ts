// A measured colour as words: "vivid brick", "deep berry".
//
// Makeup vocabulary, not colour-wheel vocabulary. A lip at hue 30 is a brick or a terracotta;
// "dark orange" is accurate and useless. Names a colour, never a product — see foundation.ts for
// why that line is drawn.

import { hexToOklch } from "./oklch";

/**
 * Hue families by OKLCh degree, read as "up to" and wrapping at 360.
 *
 * 0-90 carries most of the resolution: it holds nearly every lip, cheek and bronzer shade. Greens
 * and blues get one name each, appearing only as eyeshadow.
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

/** Below this, name from lightness alone. Matches the garment palette's threshold. */
const NEUTRAL_CHROMA = 0.035;

/** Neutrals, by lightness. These are the browns, taupes and blacks a liner or brow lands on. */
const NEUTRALS: Array<{ upTo: number; name: string }> = [
  { upTo: 0.22, name: "black" },
  { upTo: 0.4, name: "espresso" },
  { upTo: 0.58, name: "taupe" },
  // "Grey", not "greige": below the chroma at which any warmth is visible.
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
 * Where the modifiers start speaking, calibrated to the range makeup occupies rather than the
 * whole colour space: lipsticks cluster at lightness 0.43-0.67 and saturation ratio 0.35-0.55.
 *
 * Swept against every shade the fixtures produce, taking the values that leave no two same-named
 * shades further apart than dE 0.10. Regenerate before changing one.
 */
const SOFT_BELOW = 0.34;
const VIVID_ABOVE = 0.48;
const DEEP_BELOW = 0.45;
const LIGHT_ABOVE = 0.62;

/** Where a family swaps to its pale noun. Above LIGHT_ABOVE: "peach" is a stronger claim than
 *  "light brick". */
const PALE_ABOVE = 0.78;

function saturationRatio(chroma: number, lightness: number): number {
  // sRGB bounds chroma by lightness, so a flat threshold would call every deep shade muted.
  // Judged against what is reachable here instead; 0.4 is the approximate ceiling at mid-lightness.
  const headroom = Math.max(0.06, 0.4 * (1 - Math.abs(lightness - 0.55) / 0.55));
  return chroma / headroom;
}

/**
 * One modifier, or none, from whichever axis is doing the distinguishing.
 *
 * Neither axis gets priority: each proposes a word and how far past its threshold it sits, in
 * units of its own band, and the more extreme one speaks. Giving either priority collapses sets
 * that differ on the other one.
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
 * The modifier for a noun that already carries depth ("mahogany", "peach").
 *
 * As `modifier`, but lightness is judged inside the variant's own band. Judged against the whole
 * scale, everything under DEEP_BELOW collapses to one word.
 */
function carriedModifier(chroma: number, lightness: number): string {
  const ratio = saturationRatio(chroma, lightness);

  const [satWord, satBy] =
    ratio > VIVID_ABOVE
      ? ["vivid", (ratio - VIVID_ABOVE) / (1 - VIVID_ABOVE)]
      : ratio < SOFT_BELOW
        ? ["soft", (SOFT_BELOW - ratio) / SOFT_BELOW]
        : ["", 0];

  // Not the arithmetic midpoint of the band. Halfway down (0.225) sat below almost every deep
  // shade the engine produces, so the depth word never won against saturation and #4a0013 and
  // #84002c both came back "vivid oxblood" at dE 0.141 despite 0.13 of lightness between them.
  // Placed where the deep shades actually sit instead.
  const deepMid = DEEP_BELOW * 0.7;
  const paleMid = PALE_ABOVE + (1 - PALE_ABOVE) * 0.3;
  const [lightWord, lightBy] =
    lightness < deepMid
      ? ["deep", (deepMid - lightness) / deepMid]
      : lightness > paleMid
        ? ["pale", (lightness - paleMid) / (1 - paleMid)]
        : ["", 0];

  return (lightBy > satBy ? lightWord : satWord) as string;
}

/**
 * A short, sayable name: "soft terracotta", "deep berry".
 *
 * Two words at most. It sits under a swatch she can already see, so it only has to be repeatable
 * out loud; a third word turns it into marketing copy.
 */
export function nameShade(hex: string): string {
  const { l, c, h } = hexToOklch(hex);

  if (c < NEUTRAL_CHROMA) {
    return (NEUTRALS.find((n) => l < n.upTo) ?? NEUTRALS[NEUTRALS.length - 1]).name;
  }

  const noun = family(h, l);
  const base = FAMILIES.find((f) => (((h % 360) + 360) % 360) < f.upTo);
  const carried = noun !== base?.name;

  // A carried noun cannot take the global depth word on top, or everything under 0.45 becomes
  // "deep mahogany". Suppressing it entirely is worse: see carriedModifier.
  const word = carried ? carriedModifier(c, l) : modifier(c, l);
  return word ? `${word} ${noun}` : noun;
}

/** The same, capitalised for use at the start of a label. */
export function nameShadeTitle(hex: string): string {
  const name = nameShade(hex);
  return `${name[0].toUpperCase()}${name.slice(1)}`;
}
