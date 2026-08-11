// Perceptually uniform colour maths (OKLab / OKLCh, Björn Ottosson 2020).
//
// Why not HSL: HSL's "lightness" is not perceptual — #0000FF and #FFFF00 both sit at L=50%
// despite yellow being vastly brighter. Mixing or contrast-checking in HSL therefore produces
// results that drift unpredictably across hues, which is exactly the failure mode a product
// claiming colour accuracy cannot afford. OKLab is designed so equal numeric steps look like
// equal perceptual steps, so "make this 10% deeper" means the same thing on every skin tone.

export interface RGB {
  r: number; // 0-255
  g: number;
  b: number;
}

export interface OKLCH {
  l: number; // 0-1 perceptual lightness
  c: number; // 0-~0.4 chroma
  h: number; // 0-360 hue angle, degrees
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** sRGB companding: gamma-encoded channel (0-1) to linear-light. */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function rgbToOklch({ r, g, b }: RGB): OKLCH {
  const lr = toLinear(r / 255);
  const lg = toLinear(g / 255);
  const lb = toLinear(b / 255);

  // Linear sRGB -> LMS cone response
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c, h };
}

export function oklchToRgb({ l: L, c, h }: OKLCH): RGB {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);

  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: clamp(fromLinear(lr) * 255, 0, 255),
    g: clamp(fromLinear(lg) * 255, 0, 255),
    b: clamp(fromLinear(lb) * 255, 0, 255),
  };
}

export function hexToOklch(hex: string): OKLCH {
  return rgbToOklch(hexToRgb(hex));
}

/**
 * Convert back to hex, reducing chroma until the colour is actually representable in sRGB.
 *
 * Naively clamping RGB channels shifts hue — a too-saturated red clips to pure #FF0000 and stops
 * being the hue we asked for. Walking chroma down preserves hue and lightness, which is what
 * matters when a colour is meant to be "this shade, adjusted for this skin depth".
 */
export function oklchToHex(color: OKLCH): string {
  const l = clamp(color.l, 0, 1);
  let c = Math.max(0, color.c);

  for (let i = 0; i < 24; i++) {
    const rgb = oklchToRgb({ l, c, h: color.h });
    const inGamut =
      rgb.r >= -0.5 && rgb.r <= 255.5 && rgb.g >= -0.5 && rgb.g <= 255.5 && rgb.b >= -0.5 && rgb.b <= 255.5;
    // oklchToRgb already clamps, so re-derive to detect clipping rather than trusting the output.
    const round = rgbToOklch(rgb);
    if (inGamut && Math.abs(round.h - color.h) < 1.5 && Math.abs(round.l - l) < 0.02) {
      return rgbToHex(rgb);
    }
    c *= 0.92;
    if (c < 0.001) break;
  }
  return rgbToHex(oklchToRgb({ l, c: 0, h: color.h }));
}

/** Perceptual lightness difference, 0-1. The honest replacement for comparing HSL lightness. */
export function lightnessDelta(a: string, b: string): number {
  return Math.abs(hexToOklch(a).l - hexToOklch(b).l);
}

/**
 * Perceptual distance between two colours (Euclidean in OKLab).
 *
 * This is the right measure of "can you tell these apart", because distinction can come from
 * lightness, chroma or hue — and on deep skin it mostly comes from the latter two. Judging
 * visibility on lightness alone wrongly rejects a vivid berry that reads perfectly well.
 * Roughly: <0.02 imperceptible, ~0.05 subtle, >0.10 clearly distinct.
 */
export function deltaE(a: string, b: string): number {
  const A = hexToOklch(a);
  const B = hexToOklch(b);
  const ah = (A.h * Math.PI) / 180;
  const bh = (B.h * Math.PI) / 180;
  return Math.hypot(
    A.l - B.l,
    A.c * Math.cos(ah) - B.c * Math.cos(bh),
    A.c * Math.sin(ah) - B.c * Math.sin(bh),
  );
}

/** Shortest angular distance between two hues, 0-180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return 180 - d;
}

export function adjustOklch(hex: string, delta: Partial<OKLCH>): string {
  const base = hexToOklch(hex);
  return oklchToHex({
    l: clamp(base.l + (delta.l ?? 0), 0, 1),
    c: Math.max(0, base.c + (delta.c ?? 0)),
    h: (base.h + (delta.h ?? 0) + 360) % 360,
  });
}

/** Interpolate in OKLab so the midpoint of two colours looks like a midpoint. */
export function mixOklch(a: string, b: string, ratio: number): string {
  const A = hexToOklch(a);
  const B = hexToOklch(b);
  // Interpolate hue the short way round the wheel.
  let dh = B.h - A.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return oklchToHex({
    l: A.l + (B.l - A.l) * ratio,
    c: A.c + (B.c - A.c) * ratio,
    h: (A.h + dh * ratio + 360) % 360,
  });
}
