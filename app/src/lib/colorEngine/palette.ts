// Turns a ColourProfile into concrete makeup colours, per role and per intensity register.
//
// Every colour is built in OKLCH from three inputs: a season-appropriate hue, a chroma scaled by
// how clear or muted that season is, and a lightness placed relative to the person's own measured
// skin lightness. Placing lightness *relative to skin* rather than absolutely is what makes the
// same template work on Fitzpatrick I and VI: a shade that reads bold on fair skin is invisible
// on deep skin if you hardcode the value.

import { adjustOklch, deltaE, hexToOklch, mixOklch, oklchToHex } from "./oklch";
import type { ColourProfile, Season } from "./season";
import type { NormalisedColors } from "./normalise";
import type { EyeColorName } from "../youcam/types";

export type Register = "soft" | "polished" | "bold";
export type Role = "lip" | "blush" | "eyeshadowBase" | "eyeshadowAccent" | "liner" | "brow" | "contour" | "highlight";

type Measured = NormalisedColors;

interface SeasonSpec {
  lipHue: [number, number];
  blushHue: [number, number];
  accentHue: [number, number];
  neutralHue: [number, number];
  /** Overall clarity: >1 clear and saturated, <1 muted and greyed. */
  chroma: number;
  /** Whether the season's colours sit lighter or deeper by nature. */
  lightnessBias: number;
}

const SEASONS: Record<Season, SeasonSpec> = {
  // Warm, clear, light — coral, peach, golden bronze.
  Spring: { lipHue: [24, 42], blushHue: [26, 40], accentHue: [55, 75], neutralHue: [58, 80], chroma: 1.0, lightnessBias: 0.04 },
  // Cool, soft, light — rose, mauve, lilac.
  Summer: { lipHue: [352, 372], blushHue: [356, 376], accentHue: [300, 332], neutralHue: [300, 340], chroma: 0.72, lightnessBias: 0.02 },
  // Warm, muted, deep — brick, terracotta, bronze.
  Autumn: { lipHue: [34, 54], blushHue: [34, 50], accentHue: [56, 82], neutralHue: [58, 86], chroma: 0.85, lightnessBias: -0.05 },
  // Cool, clear, deep — true red, berry, plum.
  Winter: { lipHue: [346, 372], blushHue: [350, 368], accentHue: [304, 334], neutralHue: [284, 320], chroma: 1.12, lightnessBias: -0.06 },
};

interface RegisterSpec {
  /** Multiplier on chroma. */
  chroma: number;
  /** How far below the skin's lightness the colour sits. */
  drop: number;
  /** Where in the season's hue range to sit: 0 = start, 1 = end. */
  huePosition: number;
}

// Bold means *more vivid*, not darker. Available chroma in sRGB peaks around L 0.5-0.6 and
// falls away sharply below it, so a register that bought intensity by dropping lightness would
// get less saturated the bolder it went — which is how the first version produced near-black
// "statement" lips on deep skin.
const REGISTERS: Record<Register, RegisterSpec> = {
  soft: { chroma: 0.6, drop: 0.09, huePosition: 0.25 },
  polished: { chroma: 1.0, drop: 0.15, huePosition: 0.5 },
  bold: { chroma: 1.65, drop: 0.19, huePosition: 0.8 },
};

/** Base chroma per role before season and register scaling. */
const ROLE_CHROMA: Record<Role, number> = {
  lip: 0.15,
  blush: 0.075,
  eyeshadowBase: 0.05,
  eyeshadowAccent: 0.1,
  liner: 0.045,
  brow: 0.04,
  contour: 0.045,
  highlight: 0.03,
};

// Below this lightness, sRGB cannot hold a saturated colour at all — pushing further down
// decays any hue toward black, which is how a "bold" lip once came out at #040403 on deep skin.
const CHROMA_FLOOR = 0.3;

function lerpHue([start, end]: [number, number], t: number): number {
  return (start + (end - start) * t + 360) % 360;
}

/**
 * Eyes read as more vivid against their complement, so the accent hue is chosen opposite the
 * eye colour — then pulled back into the season's range so it still belongs to the face.
 */
function accentHueForEyes(eye: EyeColorName, spec: SeasonSpec, register: RegisterSpec): number {
  const seasonAnchor = lerpHue(spec.accentHue, register.huePosition);
  const complement: Partial<Record<EyeColorName, number>> = {
    Blue: 62, // copper / bronze
    Gray: 44, // warm taupe lifts grey eyes
    Green: 358, // plum / burgundy
    Amber: 268, // deep blue-violet
    Brown: seasonAnchor, // versatile; let the season lead
  };
  const target = complement[eye] ?? seasonAnchor;
  // Blend toward the season so the complement never fights the overall harmony.
  const blended = mixOklch(oklchToHex({ l: 0.5, c: 0.1, h: target }), oklchToHex({ l: 0.5, c: 0.1, h: seasonAnchor }), 0.4);
  return hexToOklch(blended).h;
}

export interface PaletteInputs {
  colors: Measured;
  profile: ColourProfile;
}

/**
 * Build one colour for one role at one intensity.
 *
 * Depth adaptation is the important part: chroma rises and lightness falls with measured depth,
 * and a minimum perceptual gap from the skin is enforced so no colour ever disappears into it.
 */
export function pickColour({ colors, profile }: PaletteInputs, role: Role, register: Register): string {
  const spec = SEASONS[profile.season];
  const reg = REGISTERS[register];
  const skin = hexToOklch(colors.skin_color);
  const { depth } = profile;

  // --- Hue -------------------------------------------------------------------------------
  let hue: number;
  switch (role) {
    case "lip":
      hue = lerpHue(spec.lipHue, reg.huePosition);
      break;
    case "blush":
      hue = lerpHue(spec.blushHue, reg.huePosition * 0.7);
      break;
    case "eyeshadowAccent":
      hue = accentHueForEyes(colors.eye_color_name, spec, reg);
      break;
    case "eyeshadowBase":
    case "contour":
    case "highlight":
      hue = lerpHue(spec.neutralHue, 0.4);
      break;
    case "liner":
      hue = lerpHue(spec.accentHue, 0.6);
      break;
    case "brow":
      // Brows belong to the hair, not the palette — follow measured hair hue.
      hue = hexToOklch(colors.hair_color).h;
      break;
  }

  // --- Chroma ----------------------------------------------------------------------------
  // Deeper colouring carries more saturation before a colour reads as garish; on very fair
  // skin the same chroma looks costumey.
  const depthChroma = 1 + depth * 0.45;
  // Low-contrast (soft) colouring is overwhelmed by clear colour, and vice versa.
  const contrastChroma = 0.85 + profile.contrast * 0.3;
  let chroma = ROLE_CHROMA[role] * spec.chroma * reg.chroma * depthChroma * contrastChroma;

  // --- Lightness -------------------------------------------------------------------------
  //
  // A makeup colour has to be *distinguishable* from the skin it sits on. That distinction can
  // be bought with lightness or with chroma, and which is available depends on the skin.
  //
  // On fair skin there is plenty of room below, so dropping lightness works. On deep skin there
  // is very little: pushing further down runs into the region where sRGB cannot represent a
  // saturated colour at all, and the result decays to near-black. So once lightness headroom
  // runs out, the remaining separation is bought with chroma instead — which is also what
  // actually happens in practice, where bold on deep skin means vivid, not dark.
  let lightness: number;
  if (role === "highlight") {
    lightness = Math.min(0.96, skin.l + 0.12 + spec.lightnessBias);
    chroma *= 0.6;
  } else if (role === "brow") {
    lightness = Math.max(0.16, hexToOklch(colors.hair_color).l - 0.05);
  } else if (role === "contour") {
    lightness = Math.max(CHROMA_FLOOR * 0.6, skin.l - 0.11 - depth * 0.04);
  } else if (role === "eyeshadowBase") {
    lightness = Math.max(CHROMA_FLOOR * 0.75, skin.l - 0.05 + spec.lightnessBias);
  } else if (role === "liner") {
    // Liner is meant to be dark; it just must not be crushed to pure black.
    lightness = Math.max(0.14, Math.min(0.3, skin.l - 0.28));
  } else {
    // lip, blush, eyeshadowAccent
    //
    // "Sit below the skin" is a fair-skin assumption. Deep skin has almost no usable room
    // below it, and real makeup on deep skin doesn't go darker — a bold lip there is a vivid
    // fuchsia or red that is *lighter* than the face. So the target is blended: below the skin
    // for fair colouring, and toward the band where sRGB can actually hold vivid colour as the
    // skin deepens.
    const VIVID_L = 0.56; // available chroma peaks around here for most hues
    const roleScale = role === "blush" ? 0.55 : 1;
    const wanted = reg.drop * roleScale;

    const below = skin.l - wanted;
    // 0 for fair skin, 1 for the deepest.
    const deepBlend = Math.max(0, Math.min(1, (0.62 - skin.l) / 0.3));
    // Blush stays a flush close to the face, so it follows the skin more than the lip does.
    const pull = role === "blush" ? deepBlend * 0.6 : deepBlend;

    lightness = below * (1 - pull) + VIVID_L * pull + spec.lightnessBias;
    // Colour placed at or above the skin has to carry the distinction through saturation.
    chroma *= 1 + pull * 0.5;
  }

  let result = oklchToHex({ l: Math.max(0.1, Math.min(0.97, lightness)), c: Math.max(0, chroma), h: hue });

  const required = MIN_DISTANCE[role];
  return required === undefined ? result : enforceDistance(result, colors.skin_color, required);
}

/** How far each role must sit from the skin to be seen at all, in ΔE. */
const MIN_DISTANCE: Partial<Record<Role, number>> = { lip: 0.1, blush: 0.045, eyeshadowAccent: 0.08 };

export const MIN_DISTANCE_FOR: Readonly<Partial<Record<Role, number>>> = MIN_DISTANCE;

/**
 * Push a colour away from the skin until it is actually visible on it.
 *
 * Judged on perceptual distance, not lightness: on deep skin a colour separates from the face
 * mostly through chroma and hue, and a lightness-only test would wrongly reject a vivid shade
 * that reads perfectly well. Chroma is raised first because it stays in gamut; lightness is only
 * lowered as a fallback, and never past the floor where chroma collapses toward black.
 *
 * Exported because anything that modifies a picked colour afterwards — a template's colour
 * accent, say — can push it back under the threshold, and re-deriving the rule at each of those
 * sites is how the two versions drift apart.
 */
export function enforceDistance(hex: string, skinHex: string, minDistance: number): string {
  let { l, c, h } = hexToOklch(hex);
  let result = hex;
  for (let i = 0; i < 6 && deltaE(result, skinHex) < minDistance; i++) {
    c *= 1.3;
    if (l > CHROMA_FLOOR + 0.04) l -= 0.02;
    result = oklchToHex({ l: Math.max(0.1, Math.min(0.97, l)), c, h });
  }
  return result;
}

/**
 * The "Soft" lip is meant to read as the user's own lips, improved — so it starts from the
 * measured lip colour and is only pulled partway toward the season's anchor. Bolder registers
 * move further from the measurement and closer to the season statement.
 */
export function pickLipColour(inputs: PaletteInputs, register: Register): string {
  const seasonLip = pickColour(inputs, "lip", register);
  const pullTowardSeason = { soft: 0.45, polished: 0.78, bold: 0.95 }[register];

  // Lift the measured lip colour first: raw measured lips are desaturated by ambient light.
  const measured = adjustOklch(inputs.colors.lip_color, { c: 0.02 });
  const blended = mixOklch(measured, seasonLip, pullTowardSeason);

  // Re-apply the visibility guard after blending, since the measured colour can be very pale.
  // Same principle as pickColour: never darken past the point where chroma collapses — add
  // saturation instead.
  const skinL = hexToOklch(inputs.colors.skin_color).l;
  const lip = hexToOklch(blended);
  const minGap = 0.08 + inputs.profile.depth * 0.02;
  if (skinL - lip.l < minGap) {
    const target = skinL - minGap;
    if (target >= 0.27) return oklchToHex({ ...lip, l: target });
    return oklchToHex({ ...lip, c: lip.c * 1.4 });
  }
  return blended;
}
