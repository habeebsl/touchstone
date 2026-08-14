// A template fixes the *structure* of a look — which regions get colour, at what pattern,
// texture and intensity — and leaves every colour as a role reference. The engine fills those
// roles from the user's seasonal profile, so the same template yields the same mood but
// different colours per person.
//
// There are eleven templates and each person is shown five. Rendering all ten would cost ten API
// units per analysis and bury the good answer in a long scroll; more importantly, not every
// structure suits every face. A heavy smokey eye overwhelms low-contrast colouring, and a sheer
// barely-there wash disappears on high-contrast colouring. So templates carry an `intensity`,
// the profile implies a preferred intensity, and selection picks the closest — always spanning
// soft to bold, so the set never collapses into five versions of one idea.
//
// Pattern labels are verified against the live catalogs by __checks__/patterns.check.ts, which
// runs offline and free. An invalid label fails the whole render with no useful message.

import type {
  BlushEffect,
  EyeLinerEffect,
  EyeShadowEffect,
  EyebrowsEffect,
  FitzpatrickScale,
  HighlighterEffect,
  LipColorEffect,
  LipColorPalette,
  LipLinerEffect,
  MakeupEffect,
  SimpleColorEffect,
  SkinSmoothEffect,
  TextureLip,
} from "../youcam/types";
import { analyseColouring, type ColourProfile, type Season } from "./season";
import type { NormalisedColors } from "./normalise";
import {
  checkDistance,
  enforceDistance,
  MIN_DISTANCE_FOR,
  MIN_FROM_NATURAL_LIP,
  pickColour,
  pickLipColour,
  type Register,
  type Placement,
  type ShadeCheck,
} from "./palette";
import { hexToOklch, mixOklch, oklchToHex } from "./oklch";
import { clashesWith, intensityShift, type GarmentInfluence } from "../garment/influence";

export interface FilledLook {
  templateId: string;
  /** The name shown to the user. */
  label: string;
  /** One line on why this look was chosen for this person. */
  why: string;
  register: Register;
  /** The lip's finish, so the live layer can render a gloss as a gloss and a matte as a matte. */
  finish: TextureLip;
  /** The two regions the live preview layer can render. */
  lipColor: string;
  blushColor: string;
  /**
   * How strongly each is worn, 0..1 — the same strength the rendered look is asking the API for.
   *
   * The live layer used to apply a fixed 0.96 to everything. That is not what any of these looks
   * specify: Glazed asks for 55 with a third of it transparent, Sunlit for 66. So the live view
   * came out vivid where the render came out muted, and worse, every look came out at the same
   * strength — a soft look and a bold one were indistinguishable on camera, which is most of what
   * a set of looks is for.
   */
  lipIntensity: number;
  blushIntensity: number;
  /**
   * What the visibility guard did to each shade, in the order it ran.
   *
   * The engine already computed all of this and discarded it. Kept, it is the product's own
   * evidence: the shade the palette first proposed, how far it sat from her skin or her bare
   * lips, the floor it had to clear, and what replaced it when it didn't. Shown to her rather
   * than logged, because a recommender that claims to check its work should be able to show it.
   */
  checks: ShadeCheck[];
  /**
   * Where each shade was placed, against where the conventional "sit below the skin" rule would
   * have put it. This is the part that adapts to measured depth, and on deep skin it is the
   * difference between a vivid shade and something close to black.
   */
  placements: Placement[];
  /**
   * This look's lip with the depth adaptation switched off and nothing else changed. Equal to
   * `lipColor` wherever the rule was not needed, which is most colouring.
   */
  conventionalLip: string;
  /** Every colour the render carries, for display and debugging. */
  palette: Record<string, string>;
  effects: MakeupEffect[];
}

type Measured = NormalisedColors;

/**
 * A look's colour character, on top of what the register already decides.
 *
 * Without this, two structurally different looks at the same register come out with an identical
 * lip — which is wrong twice over: it reads as a bug, and it isn't how makeup works. A bronze
 * eye look and a cool cut crease are different *colour* ideas, not just different placements.
 *
 * Hue shifts are deliberately small and clamped: the seasonal palette is the whole claim of the
 * product, and a look free to wander 40° out of it would quietly break that promise.
 */
interface ColourAccent {
  /** Degrees of hue shift, clamped to ±MAX_HUE_SHIFT. Positive is warmer. */
  lipHue?: number;
  /** Multiplier on lip chroma. Below 1 steps the lip back so the eye can lead. */
  lipChroma?: number;
  lipLightness?: number;
  shadowHue?: number;
  shadowChroma?: number;
  /** Pull cheek and lid toward the lip, for looks built on a single colour. */
  monochrome?: number;
}

const MAX_HUE_SHIFT = 16;

/**
 * The floor no lip shade may go under, whatever its accent says. Set from the other end: below
 * about 0.05 on the face the lipstick is not visible at all. How strongly the layer applies it is
 * no longer a single number — each look wears its own — so the gap is scaled by that where it is
 * enforced, and this stays the floor beneath all of them.
 */
const MIN_VISIBLE_LIP = 0.06;

interface LookTemplate {
  id: string;
  name: string;
  register: Register;
  /** How much makeup this look is, 0 (bare) to 1 (full evening face). Drives selection. */
  intensity: number;
  /** What the look is going for — the first half of the "why" line shown to the user. */
  note: string;
  /** Seasons this structure particularly flatters. Absent means it is season-neutral. */
  affinity?: Partial<Record<Season, number>>;
  /** Colour character beyond the register. Absent means the season's anchor, unmodified. */
  accent?: ColourAccent;

  smooth: number;
  lip: {
    texture: TextureLip;
    intensity: number;
    shape: string;
    /** Ombre needs innerRatio + featherStrength; the API rejects it without them. */
    ombre?: { innerRatio: number; featherStrength: number };
    fullness?: number;
  };
  // Everything below is optional: a look that omits the eyes entirely is a real look, and
  // sending an effect at intensity 0 is not the same thing.
  blush?: { pattern: string; intensity: number };
  eyeshadow?: { pattern: string; colors: 1 | 2 | 3; intensity: number };
  liner?: { pattern: string; intensity: number };
  brow?: { pattern: string; curvature: number; thickness: number; definition: number; intensity: number };
  contour?: { pattern: string; intensity: number };
  highlighter?: { pattern: string; intensity: number; glow: number };
  lashes?: { pattern: string; intensity: number };
  /** `thickness` is required by the API — omitting it is rejected outright. */
  lipLiner?: { pattern: string; intensity: number; thickness: number; smoothness: number };
}

// Eleven structures, ordered roughly bare -> full. Each differs in *shape*, not just in how
// much pigment it carries — otherwise "more templates" would just be one template at eleven
// volumes, and she only ever sees five of them anyway.
const TEMPLATES: LookTemplate[] = [
  {
    id: "bare",
    name: "Bare",
    register: "soft",
    intensity: 0.1,
    note: "skin first, with barely any colour on top",
    accent: { lipChroma: 0.8 },
    smooth: 58,
    lip: { texture: "sheer", intensity: 40, shape: "original" },
    blush: { pattern: "1color1", intensity: 39 }, // Blush 3D, oblong — a wash, not a shape
    brow: { pattern: "Original2", curvature: 0, thickness: 0, definition: 30, intensity: 35 },
  },
  {
    id: "everyday",
    name: "Everyday",
    register: "soft",
    intensity: 0.28,
    note: "your face on a good day",
    lashes: { pattern: "Natural1", intensity: 62 },
    smooth: 45,
    lip: { texture: "satin", intensity: 58, shape: "original" },
    blush: { pattern: "1color1", intensity: 57 },
    eyeshadow: { pattern: "1color9", colors: 1, intensity: 32 }, // single wash, whole eye
    liner: { pattern: "Lower1", intensity: 25 },
    brow: { pattern: "Original2", curvature: 0, thickness: 0, definition: 35, intensity: 45 },
    contour: { pattern: "OvalFace6", intensity: 24 },
  },
  {
    id: "doe",
    name: "Doe",
    register: "soft",
    intensity: 0.22,
    note: "everything quiet except the lashes",
    accent: { lipChroma: 0.85 },
    lashes: { pattern: "Upper&Lower4", intensity: 88 },
    smooth: 52,
    lip: { texture: "satin", intensity: 50, shape: "original" },
    blush: { pattern: "1color1", intensity: 48 },
    brow: { pattern: "SoftArch1", curvature: 5, thickness: 0, definition: 40, intensity: 42 },
  },
  {
    id: "monochrome",
    name: "Monochrome",
    register: "soft",
    intensity: 0.34,
    note: "one colour family across lip, cheek and lid",
    accent: { monochrome: 0.6 },
    lashes: { pattern: "Natural1", intensity: 60 },
    smooth: 48,
    lip: { texture: "satin", intensity: 62, shape: "original" },
    blush: { pattern: "Round1", intensity: 66 },
    eyeshadow: { pattern: "1color9", colors: 1, intensity: 40 },
    brow: { pattern: "SoftArch1", curvature: 5, thickness: 0, definition: 40, intensity: 45 },
    highlighter: { pattern: "OvalFace2", intensity: 30, glow: 40 },
  },
  {
    id: "glazed",
    name: "Glazed",
    register: "soft",
    intensity: 0.4,
    note: "light on the high points, gloss on the lip",
    accent: { lipChroma: 0.9, lipLightness: 0.03 },
    affinity: { Spring: 0.12, Summer: 0.08 },
    lashes: { pattern: "Wispies1", intensity: 66 },
    smooth: 62,
    lip: { texture: "gloss", intensity: 55, shape: "plump", fullness: 35 },
    blush: { pattern: "Oblique1", intensity: 60 },
    eyeshadow: { pattern: "1color9", colors: 1, intensity: 26 },
    brow: { pattern: "SoftArch1", curvature: 5, thickness: 5, definition: 45, intensity: 45 },
    highlighter: { pattern: "OvalFace2", intensity: 55, glow: 70 },
  },
  {
    id: "polished",
    name: "Polished",
    register: "polished",
    intensity: 0.55,
    note: "definition where it counts, nothing shouting",
    lashes: { pattern: "Upper1", intensity: 72 },
    lipLiner: { pattern: "Natural1", intensity: 55, thickness: 45, smoothness: 55 },
    smooth: 50,
    lip: { texture: "matte", intensity: 74, shape: "original" },
    blush: { pattern: "Oblique1", intensity: 69 },
    eyeshadow: { pattern: "2colors1", colors: 2, intensity: 48 }, // fan shape, upper lid
    liner: { pattern: "OpenWings1", intensity: 55 },
    brow: { pattern: "SoftArch1", curvature: 10, thickness: 5, definition: 55, intensity: 50 },
    contour: { pattern: "OvalFace6", intensity: 30 },
    highlighter: { pattern: "OvalFace2", intensity: 35, glow: 40 },
  },
  {
    id: "sunlit",
    name: "Sunlit",
    register: "polished",
    intensity: 0.58,
    note: "warm bronze through the socket and along the cheekbone",
    accent: { lipHue: 12, shadowHue: 10, shadowChroma: 1.1 },
    affinity: { Autumn: 0.18, Spring: 0.12 },
    lashes: { pattern: "UpperDense1", intensity: 74 },
    smooth: 50,
    lip: { texture: "satin", intensity: 66, shape: "original" },
    blush: { pattern: "Oblique1", intensity: 72 },
    eyeshadow: { pattern: "3colors103", colors: 3, intensity: 55 }, // closed banana — blended socket
    liner: { pattern: "Smoke11", intensity: 40 },
    brow: { pattern: "SoftArch1", curvature: 8, thickness: 8, definition: 55, intensity: 50 },
    contour: { pattern: "OvalFace6", intensity: 42 },
    highlighter: { pattern: "OvalFace2", intensity: 50, glow: 60 },
  },
  {
    id: "feline",
    name: "Feline",
    register: "polished",
    intensity: 0.66,
    note: "the weight on the eye, lifted and drawn out",
    accent: { lipChroma: 0.82, shadowChroma: 0.85 },
    lashes: { pattern: "Winged1", intensity: 82 },
    smooth: 48,
    lip: { texture: "satin", intensity: 58, shape: "original" },
    blush: { pattern: "Oblique1", intensity: 57 },
    eyeshadow: { pattern: "2colors40", colors: 2, intensity: 52 }, // cat eye
    liner: { pattern: "OpenWings2", intensity: 72 },
    brow: { pattern: "HighArch1", curvature: 15, thickness: 8, definition: 62, intensity: 52 },
    contour: { pattern: "OvalFace6", intensity: 34 },
  },
  {
    id: "cut-crease",
    name: "Cut Crease",
    register: "bold",
    intensity: 0.74,
    note: "a hard edge above the lid, kept quiet everywhere else",
    accent: { lipHue: -12, shadowChroma: 1.2 },
    affinity: { Winter: 0.12 },
    lashes: { pattern: "Upper&Lower1", intensity: 78 },
    smooth: 50,
    lip: { texture: "satin", intensity: 55, shape: "original" },
    blush: { pattern: "Oblique1", intensity: 54 },
    eyeshadow: { pattern: "2colors167", colors: 2, intensity: 68 }, // cut crease
    liner: { pattern: "OpenWings1", intensity: 62 },
    brow: { pattern: "HighArch1", curvature: 18, thickness: 10, definition: 70, intensity: 55 },
    highlighter: { pattern: "OvalFace2", intensity: 45, glow: 55 },
  },
  {
    id: "smoke",
    name: "Smoke",
    register: "bold",
    intensity: 0.85,
    note: "a full smoked eye, lip stepped back to let it lead",
    accent: { lipChroma: 0.68, lipLightness: -0.02 },
    affinity: { Winter: 0.14, Autumn: 0.08 },
    lashes: { pattern: "UpperDense1", intensity: 85 },
    smooth: 50,
    lip: { texture: "satin", intensity: 52, shape: "original" },
    blush: { pattern: "Oblique1", intensity: 60 },
    eyeshadow: { pattern: "3colors100", colors: 3, intensity: 72 }, // smokey, whole eye
    liner: { pattern: "PandaSmudge1", intensity: 70 },
    brow: { pattern: "HighArch1", curvature: 18, thickness: 12, definition: 68, intensity: 55 },
    contour: { pattern: "OvalFace6", intensity: 38 },
  },
  {
    id: "statement",
    name: "Statement",
    register: "bold",
    intensity: 0.8,
    note: "everything ceded to the lip",
    accent: { lipChroma: 1.22 },
    affinity: { Winter: 0.14 },
    lashes: { pattern: "Upper1", intensity: 70 },
    lipLiner: { pattern: "Large&Full1", intensity: 72, thickness: 62, smoothness: 40 },
    smooth: 50,
    lip: { texture: "matte", intensity: 92, shape: "original" },
    blush: { pattern: "Oblique1", intensity: 66 },
    eyeshadow: { pattern: "1color9", colors: 1, intensity: 30 },
    liner: { pattern: "OpenWings2", intensity: 60 },
    brow: { pattern: "HighArch1", curvature: 20, thickness: 12, definition: 72, intensity: 55 },
    contour: { pattern: "OvalFace6", intensity: 34 },
  },
];

// --- Effect construction ---------------------------------------------------------------------

const skinSmooth = (strength: number): SkinSmoothEffect => ({
  category: "skin_smooth",
  skinSmoothStrength: strength,
  skinSmoothColorIntensity: Math.round(strength * 0.85),
});

/**
 * Textures carry conditional required fields, and omitting one fails the entire render with an
 * unattributed `invalid_parameter` — so the requirement is encoded here rather than trusted to
 * each template getting it right.
 */
function lipPalette(color: string, texture: TextureLip, colorIntensity: number): LipColorPalette {
  const base: LipColorPalette = { color, texture, colorIntensity };
  switch (texture) {
    case "gloss":
    case "sheer":
      return { ...base, gloss: texture === "gloss" ? 70 : 30, transparencyIntensity: texture === "sheer" ? 55 : 35 };
    case "shimmer":
      return {
        ...base,
        gloss: 50,
        transparencyIntensity: 40,
        shimmerColor: color,
        shimmerIntensity: 50,
        shimmerDensity: 50,
        shimmerSize: 40,
      };
    case "holographic":
    case "metallic":
      return { ...base, gloss: 60, shimmerColor: color, shimmerIntensity: 55, shimmerDensity: 50, shimmerSize: 45 };
    default:
      // matte and satin take no extra fields.
      return base;
  }
}

/** Shift a colour within its family: hue in clamped degrees, chroma as a multiplier. */
function shift(hex: string, { h = 0, chroma = 1, l = 0 }: { h?: number; chroma?: number; l?: number }): string {
  const base = hexToOklch(hex);
  const clampedHue = Math.max(-MAX_HUE_SHIFT, Math.min(MAX_HUE_SHIFT, h));
  return oklchToHex({ l: Math.max(0.1, Math.min(0.97, base.l + l)), c: base.c * chroma, h: (base.h + clampedHue + 360) % 360 });
}

function buildEffects(
  spec: LookTemplate,
  inputs: { colors: Measured; profile: ColourProfile; garment?: GarmentInfluence },
): {
  effects: MakeupEffect[];
  palette: Record<string, string>;
  checks: ShadeCheck[];
  placements: Placement[];
  conventionalLip: string;
  live: { lip: string; blush: string; lipIntensity: number; blushIntensity: number };
} {
  const { register } = spec;
  const accent = spec.accent ?? {};
  const garment = inputs.garment;

  // The accent is applied to the picked colour, then the visibility guard runs again: a shift
  // that lowers chroma or lifts lightness can push a colour back under the threshold where it
  // disappears into the skin, which is exactly what the softer accents do on deep colouring.
  let lipBase = shift(pickLipColour(inputs, register), {
    h: accent.lipHue,
    chroma: accent.lipChroma,
    l: accent.lipLightness,
  });

  // Near-miss against a loud outfit is the most visible failure available to us — a warm coral
  // against a blue-based red reads as a mistake rather than as coordination. The fix is to stop
  // competing rather than to chase a match, since matching the dress is not the lip's job.
  if (garment && clashesWith(hexToOklch(lipBase).h, garment)) {
    lipBase = shift(lipBase, { chroma: 0.7 });
  }

  // Both guards again, because the accent runs after the engine applied them: a look that lowers
  // lip chroma pulls the shade back toward her natural lips, which is how the softest looks ended
  // up applying a lipstick you could not see.
  //
  // Scaled by the accent, though, and floored rather than fixed. Enforcing the register's full
  // requirement after the accent pushed two looks onto the same clamped value — the guard undoing
  // exactly the difference the accent exists to create. A look that steps its lip back is allowed
  // to sit closer to her natural colour, just never so close that it vanishes.
  //
  // Deliberately *not* scaled by how strongly the look wears the shade. Widening the gap for the
  // gentler looks does keep them above the visibility floor, but it pushes the soft register out
  // until it is as far from her natural lip as the bold one — which collapses the difference the
  // set exists to offer, and pushed two looks onto the same clamped colour. A sheer look being
  // subtler than a bold one is the point; the floor below is what stops subtle becoming invisible.
  const naturalLipGap = Math.max(
    MIN_VISIBLE_LIP,
    MIN_FROM_NATURAL_LIP[register] * (accent.lipChroma ?? 1),
  );
  const againstSkin = checkDistance(lipBase, inputs.colors.skin_color, MIN_DISTANCE_FOR.lip!, "lip", "skin");
  const againstBareLip = checkDistance(againstSkin.final, inputs.colors.lip_color, naturalLipGap, "lip", "lip");
  const lip = againstBareLip.final;

  // The same lip, derived again with the depth adaptation switched off — accent, clash handling
  // and both guards included, so the only difference between the two is the placement rule. A
  // comparison that also changed the accent or skipped the guards would be comparing two engines
  // rather than isolating the decision, and would not survive being looked at closely.
  const conventionalInputs = { ...inputs, conventional: true };
  let conventionalBase = shift(pickLipColour(conventionalInputs, register), {
    h: accent.lipHue,
    chroma: accent.lipChroma,
    l: accent.lipLightness,
  });
  if (garment && clashesWith(hexToOklch(conventionalBase).h, garment)) {
    conventionalBase = shift(conventionalBase, { chroma: 0.7 });
  }
  const conventionalLip = enforceDistance(
    enforceDistance(conventionalBase, inputs.colors.skin_color, MIN_DISTANCE_FOR.lip!),
    inputs.colors.lip_color,
    naturalLipGap,
  );
  // Both, in the order they ran. They answer different questions — whether the shade separates
  // from her face at all, and whether she could tell she had put anything on.
  const checks: ShadeCheck[] = [againstSkin, againstBareLip];
  // Where the lip was placed, against where the conventional rule would have put it. Collected
  // from a fresh pick because pickLipColour blends the palette's choice with her measured lips —
  // this records the palette's placement decision, which is the part that adapts to depth.
  const placements: Placement[] = [];
  pickColour(inputs, "lip", register, undefined, placements);

  let blush = pickColour(inputs, "blush", register, checks, placements);
  const shadowBase = pickColour(inputs, "eyeshadowBase", register);
  let shadowAccent = shift(pickColour(inputs, "eyeshadowAccent", register, checks), {
    h: accent.shadowHue,
    chroma: accent.shadowChroma,
  });

  // The eye is where an outfit is allowed to show up — but *how* depends on how far the garment
  // sits from her palette, and the trade advice is clearer than "match the hue". For a cool
  // outfit it prescribes taupe, grey and silver: a neutral eye, not a blue one.
  //
  // So a garment hue within reach harmonises — the accent leans toward it, still clamped inside
  // her palette. A distant one mutes the accent instead, which is what lets the outfit lead. The
  // earlier version rotated the hue in both cases and produced nothing: past the clamp, every
  // distant hue lands on the same boundary, so a red dress and a blue one gave identical eyes.
  if (garment?.hue != null) {
    const towardGarment = ((garment.hue - hexToOklch(shadowAccent).h + 540) % 360) - 180;
    shadowAccent =
      Math.abs(towardGarment) <= 45
        ? shift(shadowAccent, { h: towardGarment * 0.45 })
        : shift(shadowAccent, { chroma: 1 - Math.min(0.45, garment.loudness * 0.45) });
  }

  // A monochrome look is one colour worn three ways, so cheek and lid are pulled toward the lip
  // rather than picked independently. Partial, not total: identical hexes on lip and lid read as
  // a rendering fault, and the three regions sit on different skin anyway.
  if (accent.monochrome) {
    blush = enforceDistance(
      mixOklch(blush, lip, accent.monochrome * 0.7),
      inputs.colors.skin_color,
      MIN_DISTANCE_FOR.blush!,
    );
    shadowAccent = mixOklch(shadowAccent, lip, accent.monochrome);
  }

  const liner = pickColour(inputs, "liner", register);
  const brow = pickColour(inputs, "brow", register);
  const contour = pickColour(inputs, "contour", register);
  const highlight = pickColour(inputs, "highlight", register);

  // Lashes are darker than liner and carry almost no colour — mascara is not a shade decision.
  const lash = shift(liner, { chroma: 0.45, l: -0.06 });
  // Liner sits a touch deeper than the lipstick it edges, which is how it is actually worn. Same
  // hue: a liner in a different hue from the lip is the classic 1990s mistake.
  const lipLiner = shift(lip, { chroma: 1.08, l: -0.05 });

  const effects: MakeupEffect[] = [skinSmooth(spec.smooth)];

  if (spec.blush) {
    effects.push({
      category: "blush",
      pattern: { name: spec.blush.pattern },
      palettes: [{ color: blush, texture: "matte", colorIntensity: spec.blush.intensity }],
    } satisfies BlushEffect);
  }

  if (spec.eyeshadow) {
    // The palette array must hold exactly the pattern's colorNum entries.
    const ramp = [shadowBase, shadowAccent, liner].slice(0, spec.eyeshadow.colors);
    effects.push({
      category: "eye_shadow",
      pattern: { name: spec.eyeshadow.pattern },
      palettes: ramp.map((color) => ({
        color,
        texture: "matte" as const,
        colorIntensity: spec.eyeshadow!.intensity,
      })),
    } satisfies EyeShadowEffect);
  }

  if (spec.liner) {
    effects.push({
      category: "eye_liner",
      pattern: { name: spec.liner.pattern },
      palettes: [{ color: liner, texture: "matte", colorIntensity: spec.liner.intensity }],
    } satisfies EyeLinerEffect);
  }

  if (spec.brow) {
    effects.push({
      category: "eyebrows",
      // curvature/thickness/definition read as optional in the docs, but the API rejects the
      // whole task with `invalid_parameter` if any is missing while type is "shape".
      // Confirmed live — see __checks__/browProbe.ts.
      pattern: {
        type: "shape",
        name: spec.brow.pattern,
        curvature: spec.brow.curvature,
        thickness: spec.brow.thickness,
        definition: spec.brow.definition,
      },
      palettes: [{ color: brow, colorIntensity: spec.brow.intensity, texture: "matte" }],
    } satisfies EyebrowsEffect);
  }

  if (spec.contour) {
    effects.push({
      category: "contour",
      pattern: { name: spec.contour.pattern },
      palettes: [{ color: contour, colorIntensity: spec.contour.intensity }],
    } satisfies SimpleColorEffect);
  }

  if (spec.highlighter) {
    effects.push({
      category: "highlighter",
      pattern: { name: spec.highlighter.pattern },
      palettes: [
        {
          color: highlight,
          colorIntensity: spec.highlighter.intensity,
          glowIntensity: spec.highlighter.glow,
          shimmerIntensity: Math.round(spec.highlighter.glow * 0.6),
          shimmerDensity: 45,
          shimmerSize: 35,
        },
      ],
    } satisfies HighlighterEffect);
  }

  if (spec.lashes) {
    effects.push({
      category: "eyelashes",
      pattern: { name: spec.lashes.pattern },
      palettes: [{ color: lash, colorIntensity: spec.lashes.intensity }],
    } satisfies SimpleColorEffect);
  }

  if (spec.lipLiner) {
    effects.push({
      category: "lip_liner",
      pattern: { name: spec.lipLiner.pattern },
      palettes: [
        {
          color: lipLiner,
          texture: "matte",
          colorIntensity: spec.lipLiner.intensity,
          thickness: spec.lipLiner.thickness,
          smoothness: spec.lipLiner.smoothness,
        },
      ],
    } satisfies LipLinerEffect);
  }

  effects.push({
    category: "lip_color",
    shape: { name: spec.lip.shape },
    ...(spec.lip.fullness ? { morphology: { fullness: spec.lip.fullness, wrinkless: 30 } } : {}),
    // `style` is required by the API despite the docs implying otherwise — confirmed live.
    style: spec.lip.ombre
      ? { type: "ombre" as const, ...spec.lip.ombre }
      : { type: "full" as const },
    palettes: [lipPalette(lip, spec.lip.texture, spec.lip.intensity)],
  } satisfies LipColorEffect);

  // Only the roles this look actually wears. Every colour above is computed regardless — they
  // are cheap and some feed each other — but reporting all of them would have the shade list
  // claim an eyeshadow for a look that applies none.
  const palette: Record<string, string> = { lip };
  if (spec.blush) palette.blush = blush;
  if (spec.eyeshadow) {
    palette.shadowAccent = shadowAccent;
    if (spec.eyeshadow.colors > 1) palette.shadowBase = shadowBase;
  }
  if (spec.liner) palette.liner = liner;
  if (spec.lashes) palette.lash = lash;
  if (spec.brow) palette.brow = brow;
  if (spec.contour) palette.contour = contour;
  if (spec.highlighter) palette.highlight = highlight;
  if (spec.lipLiner) palette.lipLiner = lipLiner;

  // The live layer always draws lip and blush, even for a look that applies no blush effect — a
  // face on camera still has cheeks — so those two are returned separately from what the look
  // *reports* wearing.
  //
  // Their strengths come along, so the canvas applies what the look actually asks for rather than
  // a constant.
  //
  // Colour intensity alone, with no extra discount for a gloss or sheer texture's transparency.
  // Discounting it as well took Glazed down to 45% and back under the visibility floor — while
  // the rendered look, at the same 55 the API is given, is plainly visible. Transparency there
  // governs how the film reads, not how much colour lands, and the canvas has no film to thin.
  return {
    effects,
    palette,
    checks,
    placements,
    conventionalLip,
    live: {
      lip,
      blush,
      lipIntensity: spec.lip.intensity / 100,
      blushIntensity: (spec.blush?.intensity ?? 35) / 100,
    },
  };
}

// --- Selection -------------------------------------------------------------------------------

/**
 * How much makeup this person's colouring carries before it starts wearing them.
 *
 * Contrast leads: the same smoked eye that reads as definition on high-contrast colouring reads
 * as a bruise on low-contrast colouring, because there the makeup is the only strong edge on the
 * face. Depth contributes a little, since deeper colouring holds more pigment before it reads as
 * heavy.
 */
function preferredIntensity(profile: ColourProfile): number {
  return 0.3 + profile.contrast * 0.42 + profile.depth * 0.12;
}

function scoreTemplate(spec: LookTemplate, profile: ColourProfile, garment?: GarmentInfluence): number {
  const wanted = preferredIntensity(profile) + (garment ? intensityShift(garment) : 0);
  const distance = Math.abs(spec.intensity - wanted);
  const affinity = spec.affinity?.[profile.season] ?? 0;
  return 1 - distance + affinity;
}

/**
 * Pick `count` templates: the best in each register first, then the best of the rest.
 *
 * Taking the top N by score alone would hand a low-contrast face five near-identical quiet looks
 * — individually correct, collectively useless. Seeding one per register guarantees the set
 * spans bare to bold, so there is always something to choose *between*, and the fit still
 * decides which bare and which bold.
 */
function selectTemplates(profile: ColourProfile, count: number, garment?: GarmentInfluence): LookTemplate[] {
  const ranked = [...TEMPLATES].sort((a, b) => scoreTemplate(b, profile, garment) - scoreTemplate(a, profile, garment));

  const chosen: LookTemplate[] = [];
  for (const register of ["soft", "polished", "bold"] as const) {
    const best = ranked.find((t) => t.register === register);
    if (best) chosen.push(best);
  }
  for (const spec of ranked) {
    if (chosen.length >= count) break;
    if (!chosen.includes(spec)) chosen.push(spec);
  }

  // Present them bare -> bold rather than best-first: the ordering the user reads should be a
  // progression, not a ranking they have to argue with.
  return chosen.slice(0, count).sort((a, b) => a.intensity - b.intensity);
}

/** Small numbers read as words in a sentence. "The quietest of the 5" looks like a spreadsheet. */
function spell(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
}

/**
 * The "why" line under each look, for a whole set at once.
 *
 * Computed for the set because "no two cards say the same thing" is not a property one card can
 * check. Each look proposes reasons in descending order of how much it says and takes the best
 * one nobody above it has taken; the strongest are the ones true of this look and not the others.
 */
function explainAll(
  specs: LookTemplate[],
  profile: ColourProfile,
  garment?: GarmentInfluence,
): string[] {
  const total = specs.length;

  // The outfit's influence is deliberately subtle in the colours, so it is stated plainly here.
  // It belongs to one look: stamping a fact about the outfit on all five made them identical.
  const outfitReason = !garment
    ? null
    : garment.neutral
      ? "your outfit is quiet, so this can speak up"
      : garment.loudness > 0.5
        ? "stepped back, so your outfit leads"
        : "the eye picks up your outfit";

  // Closest to what her colouring carries: the look the outfit most shaped.
  const wanted = preferredIntensity(profile) + (garment ? intensityShift(garment) : 0);
  const centre = specs.reduce(
    (best, spec, i) => (Math.abs(spec.intensity - wanted) < Math.abs(specs[best].intensity - wanted) ? i : best),
    0,
  );

  const personal =
    profile.contrast > 0.6
      ? "your contrast carries it"
      : profile.contrast < 0.35
        ? "kept soft, like your colouring"
        : `built around your ${profile.undertone.toLowerCase()} undertone`;

  const used = new Set<string>();
  return specs.map((spec, i) => {
    const candidates = [
      spec.affinity?.[profile.season] ? `suits ${profile.season} colouring` : "",
      i === centre && outfitReason ? outfitReason : "",
      i === 0 ? `the quietest of the ${spell(total)}, for when you want almost nothing` : "",
      i === total - 1 ? `the boldest of the ${spell(total)}, for when you want it seen` : "",
      i === centre ? "about as much as your colouring carries" : "",
      outfitReason ?? "",
      personal,
      // Last resort, and the only one guaranteed to differ: selection seeds one per register.
      `a ${spec.lip.texture} lip, kept ${spec.register}`,
    ];

    const fit = candidates.find((c) => c && !used.has(c)) ?? candidates[candidates.length - 1];
    used.add(fit);

    // Two sentences: what the look is going for, then why it was picked for her.
    const note = `${spec.note[0].toUpperCase()}${spec.note.slice(1)}`;
    return `${note}. ${fit[0].toUpperCase()}${fit.slice(1)}.`;
  });
}

// --- Entry points ----------------------------------------------------------------------------

function fill(
  spec: LookTemplate,
  inputs: { colors: Measured; profile: ColourProfile; garment?: GarmentInfluence; why: string },
): FilledLook {
  const { effects, palette, live, checks, placements, conventionalLip } = buildEffects(spec, inputs);
  return {
    templateId: spec.id,
    label: spec.name,
    why: inputs.why,
    register: spec.register,
    finish: spec.lip.texture,
    lipColor: live.lip,
    blushColor: live.blush,
    lipIntensity: live.lipIntensity,
    blushIntensity: live.blushIntensity,
    checks,
    placements,
    conventionalLip,
    palette,
    effects,
  };
}

/**
 * The looks actually shown to one person: the templates that suit them, filled with their
 * colours, and — when she told us what she is wearing — coordinated with the outfit.
 */
export function selectLooks(
  colors: Measured,
  fitzpatrick: FitzpatrickScale | null = null,
  count = 5,
  garment?: GarmentInfluence,
): FilledLook[] {
  const profile = analyseColouring(colors, fitzpatrick);
  const specs = selectTemplates(profile, count, garment);
  const whys = explainAll(specs, profile, garment);
  return specs.map((spec, i) => fill(spec, { colors, profile, garment, why: whys[i] }));
}

/** Every template, filled. For the engine lab and the API probes — not the user-facing path. */
export function fillLooks(colors: Measured, fitzpatrick: FitzpatrickScale | null = null): FilledLook[] {
  const profile = analyseColouring(colors, fitzpatrick);
  const whys = explainAll(TEMPLATES, profile);
  return TEMPLATES.map((spec, i) => fill(spec, { colors, profile, why: whys[i] }));
}

export const TEMPLATE_COUNT = TEMPLATES.length;

export { analyseColouring };
export type { ColourProfile };
