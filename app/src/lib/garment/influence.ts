// Turn the outfit's colours into the handful of numbers the makeup engine can act on.
//
// The conventions this encodes are recorded in docs/RESEARCH.md §4. In short: complement rather
// than match, a loud outfit means the makeup steps back, and a cool or warm garment pulls the eye
// in the same direction.
//
// The deliberate limit is that the outfit never takes over the lip's hue family. If a garment can
// drag the makeup anywhere, the product is a colour-matching toy and the claim that any of this
// suits *her* is gone. So the outfit changes which looks are offered, nudges the eye, and steps
// out of the way of her own colouring.

import type { GarmentSwatch } from "./palette";

export interface GarmentInfluence {
  /**
   * How much the outfit is doing, 0 (all neutrals) to 1 (a large area of vivid colour). Drives
   * whether the makeup steps back.
   */
  loudness: number;
  /** Hue of the outfit's most defining colour, or null when the outfit is entirely neutral. */
  hue: number | null;
  /** The swatch that hue came from, for showing the user what we reacted to. */
  anchor: GarmentSwatch | null;
  /** True when nothing in the outfit carries a usable hue — black, white, grey, denim. */
  neutral: boolean;
}

/** Matches the palette module's threshold for "carries no usable hue". */
const NEUTRAL_CHROMA = 0.035;

/**
 * Chroma at which a garment reads as fully loud. Around this point a colour is unambiguously a
 * statement — a postbox red, a cobalt — rather than a muted or dusty tone.
 */
const LOUD_CHROMA = 0.16;

export function garmentInfluence(swatches: GarmentSwatch[]): GarmentInfluence {
  const chromatic = swatches.filter((s) => s.chroma >= NEUTRAL_CHROMA);

  if (chromatic.length === 0) {
    return { loudness: 0, hue: null, anchor: null, neutral: true };
  }

  // Loudness weighs saturation against how much of the outfit carries it, but only by the square
  // root of area: a vivid top under a black coat is still a loud outfit, and treating share
  // linearly would let the coat vote it down to nothing.
  const loudness = Math.min(
    1,
    Math.max(...chromatic.map((s) => (s.chroma / LOUD_CHROMA) * Math.sqrt(s.share))),
  );

  // The defining colour is the one that would draw the eye — again saturation weighted by the
  // root of area, so a small vivid piece can define an outfit that is mostly neutral.
  const anchor = chromatic.reduce((best, s) =>
    s.chroma * Math.sqrt(s.share) > best.chroma * Math.sqrt(best.share) ? s : best,
  );

  return { loudness, hue: anchor.hue, anchor, neutral: false };
}

/**
 * How much the outfit shifts the amount of makeup offered.
 *
 * Negative for a loud outfit — bright dress, quieter face, the one rule every source agreed on.
 * Slightly positive for an all-neutral outfit, which is the case where makeup is free to lead.
 */
export function intensityShift(influence: GarmentInfluence): number {
  if (influence.neutral) return 0.06;
  return -influence.loudness * 0.18;
}

/**
 * Does the lip clash with the outfit?
 *
 * Two colours in the same hue neighbourhood but not the same colour is the most visible failure
 * in the whole product — a warm coral lip against a blue-based red dress reads as a mistake, not
 * as coordination. Close enough to match is fine, and far enough apart to contrast is fine; the
 * danger zone is the gap between.
 */
export function clashesWith(lipHue: number, influence: GarmentInfluence): boolean {
  if (influence.hue === null || influence.loudness < 0.35) return false;
  const gap = Math.abs(((lipHue - influence.hue + 540) % 360) - 180);
  return gap > 8 && gap < 32;
}
