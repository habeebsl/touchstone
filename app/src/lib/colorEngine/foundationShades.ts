// Three foundation shades to test, derived from her measured skin.
//
// The Foundation block was the only output in the product with nothing to look at. Depth and
// undertone are the right words, and "Rich depth, cool red undertone" still leaves her unable to
// picture what she is looking for. Every other shade in the app has a swatch and a rendered face;
// this one asked her to take it on faith, and by the research foundation.ts cites it is the
// decision people find hardest.
//
// Three, not one, and the number is the argument rather than a hedge. A single shade claims we
// know her match exactly, and we do not: skin_color is one average taken off a photo of her face,
// foundation is matched at the jaw and neck, and her camera is uncalibrated. Being half a step out
// with one shade produces a confident wrong answer she would buy on. Being half a step out with
// three still puts the right shade inside the range. It is also what anyone does at a counter,
// which is take two or three and test them until one disappears.
//
// Not five or more: the gaps between five shades would be finer than the error in the measurement
// they come from, which would be claiming a precision we have not got.

import { adjustOklch, hexToOklch } from "./oklch";

export interface FoundationShade {
  id: string;
  /** What this one is, in the language of a shade ladder. */
  label: string;
  hex: string;
  /** Why it is worth testing, and what it looks like if it is wrong. */
  note: string;
}

/**
 * One rung of a shade ladder, in OKLab lightness.
 *
 * Real ranges step by roughly 0.03 to 0.05 of perceptual lightness between adjacent shades, so
 * this is deliberately one step rather than a dramatic spread: the point is the shades she would
 * actually be choosing between, not a demonstration of light against dark.
 */
const STEP = 0.038;

/**
 * Her measured skin, one step either side of it, holding hue and chroma.
 *
 * Only lightness moves. Undertone is the axis foundation is most often got wrong on and the one
 * the analysis is most confident about, so offering shades that wander off her undertone would be
 * offering her the mistake we exist to prevent.
 */
export function foundationShades(skinHex: string): FoundationShade[] {
  const { l } = hexToOklch(skinHex);

  // adjustOklch takes a delta, not an absolute. Clamped either side so a very fair or very deep
  // measurement cannot step off the end of the scale and come back as white or black, which is
  // what happened when these were passed as absolutes.
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
