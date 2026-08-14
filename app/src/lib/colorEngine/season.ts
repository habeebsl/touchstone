// Seasonal colour analysis, derived from the four values YouCam actually measures.
//
// The Facial Color Tones API documents itself as "the perfect solution for generating
// personalized color palettes and seasonal color reports", and seasonal analysis is the
// established professional framework for exactly this problem. Using it means the output is
// grounded in a real method rather than in arbitrary hue mixing.
//
// The method reduces a person's colouring to three axes, then names the quadrant:
//
//   warmth    cool  <------> warm     (hue direction of skin, corroborated by hair and eyes)
//   depth     light <------> deep     (Fitzpatrick, corroborated by measured skin lightness)
//   contrast  soft  <------> clear    (perceptual lightness gap between hair and skin)
//
//   Spring = warm + light + clear      Autumn = warm + deep + soft
//   Summer = cool + light + soft       Winter = cool + deep + clear

import { hexToOklch, lightnessDelta } from "./oklch";
import type { NormalisedColors } from "./normalise";
import type { EyeColorName, FitzpatrickScale, HairColorName } from "../youcam/types";

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";
export type Undertone = "Warm" | "Cool" | "Neutral";

/**
 * One axis of the analysis, as evidence rather than as prose.
 *
 * Structured because the UI needs to lay these out as rows, and because a bag of sentences
 * cannot be read by anything except a human — the demo, the docs and the summary card all want
 * the finding and its evidence separately.
 */
export interface Finding {
  axis: "Undertone" | "Depth" | "Contrast" | "Season";
  /** The conclusion, in one or two words. */
  value: string;
  /** Why, in plain language. Numbers are secondary and come last. */
  evidence: string;
}

export interface ColourProfile {
  season: Season;
  undertone: Undertone;
  /** -1 fully cool .. +1 fully warm */
  warmth: number;
  /** 0 lightest .. 1 deepest */
  depth: number;
  /** 0 softest .. 1 highest contrast */
  contrast: number;
  /**
   * The Fitzpatrick reading this profile was built from, or null if there wasn't one.
   *
   * Carried on the profile rather than tracked alongside it: the depth axis means something
   * different with and without it, and when the two were held separately the summary card
   * managed to cite Fitzpatrick VI and claim the depth was estimated without it, in adjacent
   * sentences.
   */
  fitzpatrick: FitzpatrickScale | null;
  /** The evidence, one per axis, shown in the UI so the result is legible rather than magic. */
  rationale: Finding[];
}

type Measured = NormalisedColors;

// --- Axis 1: warmth -------------------------------------------------------------------------

// Skin hue in OKLCH sits in a narrow band; within it, higher (toward yellow) reads warm and
// lower (toward pink/red) reads cool. These bounds were chosen against the measured hues of
// real skin values rather than generic colour-wheel thirds.
const SKIN_HUE_COOL = 42;
const SKIN_HUE_WARM = 62;

const HAIR_WARMTH: Record<HairColorName, number> = {
  Red: 1,
  Auburn: 0.8,
  Blonde: 0.35,
  Brown: 0.1,
  Black: -0.2,
  "Grey/White": -0.5,
};

const EYE_WARMTH: Record<EyeColorName, number> = {
  Amber: 0.9,
  Brown: 0.3,
  Green: 0.1,
  Blue: -0.7,
  Gray: -0.8,
  Other: 0,
};

function computeWarmth(colors: Measured, rationale: Finding[]): number {
  const skinHue = hexToOklch(colors.skin_color).h;

  // Map skin hue into -1..1 across the cool/warm band.
  const span = SKIN_HUE_WARM - SKIN_HUE_COOL;
  const skinWarmth = Math.max(-1, Math.min(1, ((skinHue - SKIN_HUE_COOL) / span) * 2 - 1));

  const hairWarmth = HAIR_WARMTH[colors.hair_color_name] ?? 0;
  const eyeWarmth = EYE_WARMTH[colors.eye_color_name] ?? 0;

  // Skin dominates; hair and eyes corroborate. Weights sum to 1.
  const warmth = skinWarmth * 0.55 + hairWarmth * 0.28 + eyeWarmth * 0.17;

  rationale.push({
    axis: "Undertone",
    value: warmth > 0.18 ? "Warm" : warmth < -0.18 ? "Cool" : "Neutral",
    evidence:
      `Your skin reads ${skinWarmth >= 0 ? "warm" : "cool"}, and your ` +
      `${colors.hair_color_name.toLowerCase()} hair and ${colors.eye_color_name.toLowerCase()} eyes ` +
      `${hairWarmth + eyeWarmth >= 0 ? "point the same way" : "pull the other way"} ` +
      `(skin hue ${skinHue.toFixed(0)}°).`,
  });

  return Math.max(-1, Math.min(1, warmth));
}

// --- Axis 2: depth --------------------------------------------------------------------------

// Fitzpatrick is a measured classification of how skin behaves, so it leads. Measured skin
// lightness corroborates it and smooths the six coarse steps into a continuum.
const FITZPATRICK_DEPTH: Record<FitzpatrickScale, number> = {
  I: 0.05,
  II: 0.22,
  III: 0.4,
  IV: 0.58,
  V: 0.76,
  VI: 0.93,
};

function computeDepth(colors: Measured, fitzpatrick: FitzpatrickScale | null, rationale: Finding[]): number {
  const skinL = hexToOklch(colors.skin_color).l;
  // Measured lightness inverted into a depth reading; sRGB skin spans roughly L 0.35-0.85.
  const fromSkin = Math.max(0, Math.min(1, (0.85 - skinL) / 0.5));

  const describe = (value: number) =>
    value > 0.8 ? "Very deep" : value > 0.62 ? "Deep" : value > 0.45 ? "Medium" : value > 0.25 ? "Light" : "Fair";

  if (fitzpatrick === null) {
    rationale.push({
      axis: "Depth",
      value: describe(fromSkin),
      evidence: "Estimated from your skin's lightness alone, since the Fitzpatrick reading didn't come back.",
    });
    return fromSkin;
  }

  const fromType = FITZPATRICK_DEPTH[fitzpatrick];
  const depth = fromType * 0.65 + fromSkin * 0.35;
  rationale.push({
    axis: "Depth",
    value: describe(depth),
    evidence: `Your Fitzpatrick type is ${fitzpatrick}, and your measured skin lightness agrees.`,
  });
  return depth;
}

// --- Axis 3: contrast -----------------------------------------------------------------------

function computeContrast(colors: Measured, rationale: Finding[]): number {
  // The classic measure: how far apart hair and skin sit in perceptual lightness.
  const gap = lightnessDelta(colors.skin_color, colors.hair_color);
  // Gaps beyond ~0.45 (black hair on fair skin) are maximal contrast.
  const contrast = Math.max(0, Math.min(1, gap / 0.45));

  // Vivid eyes add clarity; muted eyes soften the overall read.
  const eyeChroma = hexToOklch(colors.eye_color).c;
  const adjusted = Math.max(0, Math.min(1, contrast * 0.82 + Math.min(eyeChroma / 0.12, 1) * 0.18));

  rationale.push({
    axis: "Contrast",
    value: adjusted > 0.6 ? "High" : adjusted < 0.35 ? "Low" : "Moderate",
    evidence:
      adjusted > 0.6
        ? "Your hair is much darker than your skin, so clear, saturated colours hold their own."
        : adjusted < 0.35
          ? "Your hair and skin sit close together, so softer colours suit you better than stark ones."
          : "Your hair and skin sit a moderate distance apart.",
  });

  return adjusted;
}

// --- Composition ----------------------------------------------------------------------------

/**
 * The season names are the vocabulary of seasonal colour analysis and have nothing to do with the
 * calendar — worth saying, since "you are an Autumn" otherwise sounds like a horoscope.
 */
const SEASON_MEANING: Record<Season, string> = {
  Spring: "Warm and light. Your colouring suits clear, fresh colours like coral and peach.",
  Summer: "Cool and soft. Your colouring suits muted colours like rose, mauve and soft blue.",
  Autumn: "Warm and deep. Your colouring suits earthy colours like brick, bronze and olive.",
  Winter: "Cool and deep. Your colouring suits strong, clear colours like true red and plum.",
};

function nameUndertone(warmth: number): Undertone {
  if (warmth > 0.18) return "Warm";
  if (warmth < -0.18) return "Cool";
  return "Neutral";
}

function chooseSeason(warmth: number, depth: number, contrast: number): Season {
  const isWarm = warmth >= 0;
  // Deep colouring or strong contrast both push toward the "clear/deep" seasons.
  const intense = depth > 0.5 || contrast > 0.58;

  if (isWarm) return intense ? "Autumn" : "Spring";
  return intense ? "Winter" : "Summer";
}

export function analyseColouring(
  colors: Measured,
  fitzpatrick: FitzpatrickScale | null,
): ColourProfile {
  const rationale: Finding[] = [];

  const warmth = computeWarmth(colors, rationale);
  const depth = computeDepth(colors, fitzpatrick, rationale);
  const contrast = computeContrast(colors, rationale);

  const season = chooseSeason(warmth, depth, contrast);
  rationale.push({
    axis: "Season",
    value: season,
    evidence: SEASON_MEANING[season],
  });

  return { season, undertone: nameUndertone(warmth), warmth, depth, contrast, fitzpatrick, rationale };
}
