// Describe her complexion in the terms foundation is actually sold in.
//
// Finding a foundation shade is the most common frustration in the category — 65% report it,
// against 50% for lipstick (docs/RESEARCH.md §2). We measure exactly what that decision needs:
// depth from Fitzpatrick corroborated by skin lightness, and undertone from skin hue corroborated
// by hair and eyes.
//
// What we deliberately do not do is name a product. Without a shade catalogue that would be
// invention, and a confident wrong answer here is worse than a useful vague one — she would buy
// on it. So this gives her the two words to carry into a shop or a search box, and stops.
//
// It is also why foundation is never *rendered* onto the looks: done correctly it is invisible,
// and done incorrectly on deep skin it reads as skin-lightening, which is the exact failure the
// industry gets torched for.

import { hexToOklch } from "./oklch";
import type { ColourProfile } from "./season";

export interface FoundationGuide {
  /** Fair / Light / Medium / Tan / Deep / Rich — the depth ladder brands range by. */
  depth: string;
  /** Where that sits, since a word like "Rich" means nothing without the scale behind it. */
  depthMeaning: string;
  /** How the undertone is usually written on a shade name. */
  undertone: string;
  /** One line she can carry into a shop. */
  advice: string;
}

const DEPTH_LADDER: Array<{ upTo: number; label: string }> = [
  { upTo: 0.16, label: "Fair" },
  { upTo: 0.34, label: "Light" },
  { upTo: 0.52, label: "Medium" },
  { upTo: 0.68, label: "Tan" },
  { upTo: 0.85, label: "Deep" },
  { upTo: 1.01, label: "Rich" },
];

export function foundationGuide(profile: ColourProfile, skinHex: string): FoundationGuide {
  // profile.depth already blends Fitzpatrick with measured lightness. Without a Fitzpatrick
  // result it is measured lightness alone, which is a weaker but still usable reading.
  const rung = DEPTH_LADDER.findIndex((step) => profile.depth <= step.upTo);
  const depth = DEPTH_LADDER[rung].label;

  // Olive is a real and commonly mislabelled case: neutral-to-warm in hue but noticeably lower in
  // chroma than a golden complexion. It is also specifically a mid-depth phenomenon — fair skin
  // is frequently low-chroma without being olive, and keying on chroma alone labelled the fair
  // auburn sample olive, which is simply wrong.
  const chroma = hexToOklch(skinHex).c;
  const olive = profile.undertone !== "Cool" && chroma < 0.055 && profile.depth > 0.35 && profile.depth < 0.82;

  // Undertone vocabulary is depth-dependent, and this is where a generic answer goes wrong.
  // "Pink or blue-based" is how cool colouring is described at the fair end of the range; deep
  // shades are ranged and labelled by red, golden and neutral casts instead. Handing someone with
  // deep skin fair-skin vocabulary would send them looking for a shade name that does not exist.
  const deep = profile.depth > 0.65;

  const undertone = olive
    ? "Olive"
    : profile.undertone === "Warm"
      ? "Warm, golden"
      : profile.undertone === "Cool"
        ? deep ? "Cool, red" : "Cool, pink"
        : "Neutral";

  const advice = olive
    ? "Look for shades labelled olive or neutral — golden shades will run orange on you."
    : profile.undertone === "Warm"
      ? "Look for golden or yellow-based shades rather than pink-based ones."
      : profile.undertone === "Cool"
        ? deep
          ? "Look for shades with a red or cool cast rather than golden or orange ones."
          : "Look for pink or blue-based shades rather than golden ones."
        : "Neutral shades will match you most easily; you can wear either direction.";

  return {
    depth,
    depthMeaning: `${rung + 1} of ${DEPTH_LADDER.length} on the usual depth scale, from fair to deepest.`,
    undertone,
    // The caveat is derived from the profile rather than passed in alongside it. Held separately,
    // the two disagreed: the findings cited a Fitzpatrick type while this claimed the depth had
    // been estimated without one.
    advice: profile.fitzpatrick ? advice : `${advice} (Depth estimated from your photo alone.)`,
  };
}
