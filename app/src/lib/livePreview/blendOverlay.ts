// Blend-mode compositing for the live preview layer.
//
// Landmark indices are MediaPipe's 468-point face mesh topology (Face Landmarker uses the same
// topology as FaceMesh).
//
// The approach throughout is to *tint* the video rather than paint over it: a mask defines where,
// a blend mode lets the underlying shading, specular highlights and lip texture show through.
// Painting flat colour reads as a sticker, which is what the first version of the blush did.

import { deltaE, hexToOklch } from "../colorEngine/oklch";

export const OUTER_LIPS = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61,
];

/**
 * The mouth opening. Subtracted from the lip mask, or an open mouth gets lipstick on the teeth
 * and tongue — which the outer ring alone cannot avoid.
 */
export const INNER_LIPS = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78,
];

// Blush sits on the cheekbone and sweeps up toward the temple. Landmark 50/280 alone (the
// previous anchor) sits closer to the nose than to the cheekbone, and a circle there reads as
// two round dots — the doll look. So the placement is built from three points per side: the
// cheekbone, the outer eye corner it sweeps toward, and the face edge for scale.
const CHEEKBONE = { left: 205, right: 425 };
const OUTER_EYE = { left: 33, right: 263 };
const FACE_EDGE = { left: 234, right: 454 };

export type NormalizedLandmark = { x: number; y: number };

/**
 * Which blend mode makes this colour read as makeup on this skin.
 *
 * The same lesson the palette learned, applied to compositing: `multiply` can only ever darken,
 * so on deep skin — where the engine deliberately places blush and lip *above* the skin's
 * lightness, because sRGB cannot hold a saturated colour below it — multiplying turns a bright
 * cheek into a shadow. Measured on the deepest fixture, multiply darkened the cheek by 0.076 in
 * lightness while screen lightened it by 0.063 and was more visible besides.
 *
 * So: a colour below her skin darkens (multiply, how pigment behaves on light skin), and a
 * colour above it lightens (screen). One rule, and it falls out of what the engine already
 * decided about the colour.
 */
export function chooseBlend(colorLightness: number, skinLightness: number): GlobalCompositeOperation {
  return colorLightness < skinLightness ? "multiply" : "screen";
}

function toPx(p: NormalizedLandmark, w: number, h: number) {
  return { x: p.x * w, y: p.y * h };
}

/**
 * Exponential smoothing of the landmark stream.
 *
 * Per-frame detections jitter by a pixel or two even on a still face, and because the overlay is
 * a hard-edged mask that jitter reads as shimmering. Smoothing trades a few milliseconds of lag
 * for a stable edge, which is the better deal at conversational head speeds.
 */
export function smoothLandmarks(
  previous: NormalizedLandmark[] | null,
  next: NormalizedLandmark[],
  factor = 0.5,
): NormalizedLandmark[] {
  if (!previous || previous.length !== next.length) return next;
  return next.map((point, i) => ({
    x: previous[i].x + (point.x - previous[i].x) * factor,
    y: previous[i].y + (point.y - previous[i].y) * factor,
  }));
}

export function buildLipMask(
  maskCtx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
  feather: number,
) {
  maskCtx.clearRect(0, 0, w, h);
  maskCtx.filter = feather > 0 ? `blur(${feather}px)` : "none";
  maskCtx.fillStyle = "white";

  maskCtx.beginPath();
  for (const [i, idx] of OUTER_LIPS.entries()) {
    const { x, y } = toPx(landmarks[idx], w, h);
    if (i === 0) maskCtx.moveTo(x, y);
    else maskCtx.lineTo(x, y);
  }
  maskCtx.closePath();

  // Second subpath, wound as a hole: with the even-odd rule the mouth opening is left unpainted.
  for (const [i, idx] of INNER_LIPS.entries()) {
    const { x, y } = toPx(landmarks[idx], w, h);
    if (i === 0) maskCtx.moveTo(x, y);
    else maskCtx.lineTo(x, y);
  }
  maskCtx.closePath();

  maskCtx.fill("evenodd");
  maskCtx.filter = "none";
}

export function buildBlushMask(
  maskCtx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
) {
  maskCtx.clearRect(0, 0, w, h);

  const faceWidth = Math.hypot(
    toPx(landmarks[FACE_EDGE.right], w, h).x - toPx(landmarks[FACE_EDGE.left], w, h).x,
    toPx(landmarks[FACE_EDGE.right], w, h).y - toPx(landmarks[FACE_EDGE.left], w, h).y,
  );

  for (const side of ["left", "right"] as const) {
    const cheek = toPx(landmarks[CHEEKBONE[side]], w, h);
    const eye = toPx(landmarks[OUTER_EYE[side]], w, h);
    const edge = toPx(landmarks[FACE_EDGE[side]], w, h);

    // Centre sits between the cheekbone and the face edge, which is where blush is actually
    // worn — further out than the cheekbone landmark itself.
    const cx = cheek.x + (edge.x - cheek.x) * 0.38;
    const cy = cheek.y + (edge.y - cheek.y) * 0.28;

    // The long axis points up toward the outer eye corner, so the sweep follows the cheekbone
    // and rotates correctly when the head tilts — no separate pose handling needed.
    const angle = Math.atan2(eye.y - cy, eye.x - cx);

    const major = faceWidth * 0.2;
    const minor = major * 0.62;

    maskCtx.save();
    maskCtx.translate(cx, cy);
    maskCtx.rotate(angle);
    maskCtx.scale(1, minor / major);

    // Soft all the way out: real blush has no boundary, and any hard stop reads as a shape drawn
    // on the face. The falloff is weighted toward the centre rather than linear.
    const gradient = maskCtx.createRadialGradient(0, 0, 0, 0, 0, major);
    gradient.addColorStop(0, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.45)");
    gradient.addColorStop(0.75, "rgba(255,255,255,0.14)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    maskCtx.fillStyle = gradient;
    maskCtx.beginPath();
    maskCtx.arc(0, 0, major, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.restore();
  }
}

/**
 * Tint a region so it reads as makeup rather than as paint.
 *
 * Compositing flat colour — multiply, screen, whatever — shifts every pixel in the region the
 * same way, so the lip's own shading, its specular highlight and the skin's texture are all
 * flattened. That is precisely what "paint on a photo" looks like, and no amount of lowering the
 * opacity fixes it: it just makes for thinner paint.
 *
 * Makeup does not cover a surface, it changes that surface's colour while all of its light
 * behaviour survives. So this is two passes:
 *
 *   1. `color` — takes hue and saturation from the shade and **luminosity from the video**. Every
 *      highlight, crease and shadow in the original comes through untouched; only the colour
 *      changes. This is the pass that does the work.
 *   2. A small luminance nudge, because real lipstick genuinely does change how light the lip is.
 *      Sized by how far the shade sits from her skin, and capped — enough to register, never
 *      enough to flatten what pass 1 preserved.
 */
export function compositeRegion(
  targetCtx: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement,
  colorCanvas: HTMLCanvasElement,
  color: string,
  luminanceShift: { mode: GlobalCompositeOperation; alpha: number },
  intensity: number,
  w: number,
  h: number,
) {
  const colorCtx = colorCanvas.getContext("2d")!;
  colorCtx.clearRect(0, 0, w, h);
  colorCtx.fillStyle = color;
  colorCtx.fillRect(0, 0, w, h);
  colorCtx.globalCompositeOperation = "destination-in";
  colorCtx.drawImage(maskCanvas, 0, 0);
  colorCtx.globalCompositeOperation = "source-over";

  targetCtx.save();
  targetCtx.globalAlpha = intensity;
  targetCtx.globalCompositeOperation = "color";
  targetCtx.drawImage(colorCanvas, 0, 0);

  if (luminanceShift.alpha > 0.01) {
    targetCtx.globalAlpha = luminanceShift.alpha;
    targetCtx.globalCompositeOperation = luminanceShift.mode;
    targetCtx.drawImage(colorCanvas, 0, 0);
  }
  targetCtx.restore();
}

// --- Predicting the composite ----------------------------------------------------------------
//
// The canvas does the real work, but the same arithmetic is needed up front to decide how hard
// to push: how visible a shade will end up is not knowable from the shade alone. These are the
// W3C compositing definitions, and they are exported so the checks exercise this code rather
// than a parallel implementation of it that can drift.

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

const SEPARABLE: Record<string, (b: number, s: number) => number> = {
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
};

const lum = (c: number[]) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

function clipColor(c: number[]): number[] {
  const l = lum(c);
  const min = Math.min(...c);
  const max = Math.max(...c);
  let out = c;
  if (min < 0) out = out.map((v) => l + ((v - l) * l) / (l - min));
  if (max > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (max - l));
  return out;
}

/** Hue and saturation from the shade, luminosity from what is underneath. */
function colorBlend(backdrop: number[], shade: number[]): number[] {
  const d = lum(backdrop) - lum(shade);
  return clipColor(shade.map((v) => v + d));
}

/** What a pixel of `backdrop` becomes under the two-pass tint. */
export function predictComposite(
  backdropHex: string,
  shadeHex: string,
  shift: { mode: GlobalCompositeOperation; alpha: number },
  intensity: number,
): string {
  const backdrop = toRgb(backdropHex);
  const shade = toRgb(shadeHex);

  const recoloured = colorBlend(backdrop, shade).map((v, i) => backdrop[i] + (v - backdrop[i]) * intensity);
  if (shift.alpha <= 0.01) return toHex(recoloured);

  return toHex(
    recoloured.map((b, i) => b + (SEPARABLE[shift.mode as string](b, shade[i]) - b) * shift.alpha),
  );
}

/**
 * How far to push the luminance pass so the shade actually reads.
 *
 * A fixed function of the lightness gap is not enough, and finding out why was the useful part:
 * `color` forces the backdrop's luminosity onto the shade, so on deep lips a vivid red is clipped
 * back toward grey and the recolour barely registers — a measured dE of 0.016 on one fixture,
 * which is invisible. The amount of push needed depends on the backdrop, so it is solved for
 * rather than assumed.
 *
 * Same principle as the palette's visibility guard: aim for a minimum perceptual change, and
 * stop at a cap rather than chasing it into looking painted.
 */
export function luminanceShiftFor(
  shadeHex: string,
  backdropHex: string,
  { cap, target, intensity }: { cap: number; target: number; intensity: number },
): { mode: GlobalCompositeOperation; alpha: number } {
  const mode = chooseBlend(hexToOklch(shadeHex).l, hexToOklch(backdropHex).l);

  let alpha = 0;
  while (alpha < cap) {
    const next = Math.min(cap, alpha + 0.02);
    const reached = deltaE(predictComposite(backdropHex, shadeHex, { mode, alpha: next }, intensity), backdropHex);
    if (reached >= target) {
      return { mode, alpha: next };
    }
    alpha = next;
  }
  return { mode, alpha: cap };
}
