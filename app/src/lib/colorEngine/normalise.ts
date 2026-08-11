// Boundary between what the API actually returns and what the engine may assume.
//
// The API omits any reading it could not determine — hair out of frame, eyes in shadow — so raw
// responses have holes. Rather than scatter optional-chaining through every calculation (which
// is how a missing hair colour reached `.toLowerCase()` and took the app down), every raw
// response is normalised once, here, into a complete record the engine can rely on.
//
// Substituted values are recorded in `inferred` so the UI never presents a guess as a measurement.

import { adjustOklch, hexToOklch, oklchToHex } from "./oklch";
import type { EyeColorName, FacialColorTonesResult, HairColorName } from "../youcam/types";

export interface NormalisedColors {
  skin_color: string;
  eye_color: string;
  eye_color_name: EyeColorName;
  lip_color: string;
  eyebrow_color: string;
  hair_color: string;
  hair_color_name: HairColorName;
}

export interface NormalisedMeasurement {
  colors: NormalisedColors;
  /** Field names that were substituted rather than measured. */
  inferred: Array<keyof NormalisedColors>;
}

export class MissingSkinColourError extends Error {
  constructor() {
    super("The analysis returned no skin colour, so no personalised palette can be built.");
    this.name = "MissingSkinColourError";
  }
}

/** Rough hex for each named hair colour, used only when the hex itself is missing. */
const HAIR_NAME_TO_HEX: Record<HairColorName, string> = {
  Black: "#1c1614",
  Brown: "#4a3222",
  Auburn: "#8a4527",
  Red: "#a5432a",
  Blonde: "#c2a06a",
  "Grey/White": "#b8b2ac",
};

const EYE_NAME_TO_HEX: Record<EyeColorName, string> = {
  Brown: "#3a2a1e",
  Amber: "#8a5a24",
  Green: "#5d7048",
  Blue: "#4a6d94",
  Gray: "#5a5f63",
  Other: "#3a2a1e",
};

function nearestHairName(hex: string): HairColorName {
  const { l, c, h } = hexToOklch(hex);
  if (c < 0.03) return l > 0.6 ? "Grey/White" : "Black";
  if (l < 0.25) return "Black";
  if (l > 0.62) return "Blonde";
  if (h >= 20 && h < 40 && c > 0.09) return "Red";
  if (h >= 40 && h < 62 && c > 0.07) return "Auburn";
  return "Brown";
}

export function normaliseMeasured(raw: FacialColorTonesResult["color"]): NormalisedMeasurement {
  if (!raw?.skin_color) throw new MissingSkinColourError();

  const inferred: Array<keyof NormalisedColors> = [];
  const skin = raw.skin_color;

  // Hair: prefer the measured hex, else derive one from the name, else assume a deep neutral
  // brown — the least opinionated choice, since hair drives the contrast axis.
  let hair = raw.hair_color;
  if (!hair) {
    hair = raw.hair_color_name ? HAIR_NAME_TO_HEX[raw.hair_color_name] : "#3d2b1f";
    inferred.push("hair_color");
  }
  let hairName = raw.hair_color_name;
  if (!hairName) {
    hairName = nearestHairName(hair);
    inferred.push("hair_color_name");
  }

  let eye = raw.eye_color;
  if (!eye) {
    eye = raw.eye_color_name ? EYE_NAME_TO_HEX[raw.eye_color_name] : "#3a2a1e";
    inferred.push("eye_color");
  }
  let eyeName = raw.eye_color_name;
  if (!eyeName) {
    // Brown is the global majority and the most neutral assumption for accent selection.
    eyeName = "Brown";
    inferred.push("eye_color_name");
  }

  // Lips: a plausible stand-in is the skin, deepened and slightly more saturated.
  let lip = raw.lip_color;
  if (!lip) {
    lip = adjustOklch(skin, { l: -0.08, c: 0.03 });
    inferred.push("lip_color");
  }

  let brow = raw.eyebrow_color;
  if (!brow) {
    const h = hexToOklch(hair);
    brow = oklchToHex({ ...h, l: Math.max(0.16, h.l - 0.03) });
    inferred.push("eyebrow_color");
  }

  return {
    colors: {
      skin_color: skin,
      eye_color: eye,
      eye_color_name: eyeName,
      lip_color: lip,
      eyebrow_color: brow,
      hair_color: hair,
      hair_color_name: hairName,
    },
    inferred,
  };
}
