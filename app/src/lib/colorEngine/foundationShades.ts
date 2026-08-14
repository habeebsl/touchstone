// Three foundation shades to test, from her measured skin.
//
// Three rather than one because the measurement will not carry one: skin_color is an average off
// a photo of the face, foundation is matched at the jaw, and her camera is uncalibrated. Half a
// step out with one shade is a confident wrong answer; half a step out with three still contains
// the right shade. Not five, whose gaps would be finer than that error.

import { adjustOklch, hexToOklch } from "./oklch";

export interface FoundationShade {
  id: string;
  /** What this one is, in the language of a shade ladder. */
  label: string;
  hex: string;
  /** Why it is worth testing, and what it looks like if it is wrong. */
  note: string;
}

/** One rung of a real shade ladder, which steps by roughly 0.03-0.05 of OKLab lightness. */
const STEP = 0.038;

/**
 * Her measured skin, one step either side, holding hue and chroma.
 *
 * Only lightness moves: undertone is the axis foundation is most often got wrong on, so shades
 * that wander off it would offer the mistake this exists to prevent.
 */
export function foundationShades(skinHex: string): FoundationShade[] {
  const { l } = hexToOklch(skinHex);

  // adjustOklch takes a delta, not an absolute. Clamped so a very fair or very deep measurement
  // cannot step off the scale and come back white or black.
  const up = Math.min(STEP, Math.max(0, 0.98 - l));
  const down = Math.min(STEP, Math.max(0, l - 0.04));

  return [
    {
      id: "lighter",
      label: "One shade lighter",
      hex: adjustOklch(skinHex, { l: up }),
      note: "Sits on top and reads grey or ashy if it is too light for you.",
    },
    {
      id: "match",
      label: "Your measurement",
      hex: skinHex,
      note: "Where the analysis puts you. A correct match disappears.",
    },
    {
      id: "deeper",
      label: "One shade deeper",
      hex: adjustOklch(skinHex, { l: -down }),
      note: "Reads muddy or heavy if it is too deep, and shows at the jaw.",
    },
  ];
}
