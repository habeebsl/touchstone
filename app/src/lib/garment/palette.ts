// Read an outfit's colours out of a photo of it.
//
// Perfect Corp has no garment-analysis endpoint — AI Clothes renders a try-on and returns an
// image, nothing else — so what the makeup engine needs has to come from the pixels.
//
// An outfit is a *palette*, not a colour. A cream jacket over a red top with grey jeans is three
// facts, and each does different work downstream: the largest area sets the coordination
// direction, the most saturated one decides whether the makeup steps back, and a secondary
// colour can be echoed in the eye. Collapsing that to one colour throws away two thirds of it.
//
// Two things make this tractable rather than an unbounded computer-vision problem:
//
//   1. Background removal runs first (the sod endpoint, 1 unit), so the alpha channel says which
//      pixels are the subject. No segmentation, no guessing from position.
//   2. Her skin and hair colours are already *measured*, so excluding the wearer is a lookup
//      rather than a heuristic.
//
// Whatever survives that is shown to her for correction. Being correctable beats being clever:
// one tap fixes a mistake no amount of tuning would have prevented.

import { deltaE, hexToOklch, oklchToHex } from "../colorEngine/oklch";

export interface GarmentSwatch {
  hex: string;
  /** Share of the sampled garment area, 0-1. */
  share: number;
  /** Chroma in OKLCh. Near zero means an achromatic piece — black, white, grey, denim. */
  chroma: number;
  hue: number;
  lightness: number;
}

export interface GarmentPalette {
  /** Largest first. At most MAX_SWATCHES entries, each at least MIN_SHARE of the area. */
  swatches: GarmentSwatch[];
  /** Fraction of opaque pixels that survived filtering. Low means little was usable. */
  coverage: number;
}

/** Below this chroma a colour carries no usable hue direction. */
const NEUTRAL_CHROMA = 0.035;

/** More than this and the picker becomes a paint chart. */
const MAX_SWATCHES = 6;

/** Anything rarer than this is trim, piping or a compression artefact, not part of the outfit. */
const MIN_SHARE = 0.04;

/** Achromatic pieces within this much lightness of each other are the same garment, shaded. */
const NEUTRAL_MERGE_LIGHTNESS = 0.16;

interface Sample {
  l: number;
  c: number;
  h: number;
}

export interface ExtractOptions {
  /** Her measured skin colour, so the wearer is not mistaken for the outfit. */
  skinHex?: string;
  /** Her measured hair colour, same reason. */
  hairHex?: string;
  /**
   * True when the source has been through background removal, so transparency marks the
   * background. Without it, opaque background pixels have to be guessed at by position instead.
   */
  hasAlphaMask?: boolean;
}

export function extractGarmentPalette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: ExtractOptions = {},
): GarmentPalette {
  const skin = options.skinHex ? hexToOklch(options.skinHex) : null;
  const hair = options.hairHex ? hexToOklch(options.hairHex) : null;

  const samples: Sample[] = [];
  let considered = 0;

  // Stride so a large image costs no more than a small one; the answer is a handful of colours,
  // not a pixel-accurate map.
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 30000)));

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;

      // Background, when the cut-out told us where it is. Semi-transparent edge pixels are the
      // subject blended into whatever was behind it, so they are dropped too.
      if (pixels[i + 3] < 200) continue;
      considered++;

      const { l, c, h } = hexToOklch(rgbToHex(pixels[i], pixels[i + 1], pixels[i + 2]));

      // Without a mask, drop what is almost certainly seamless backdrop.
      if (!options.hasAlphaMask && c < NEUTRAL_CHROMA && (l > 0.92 || l < 0.08)) continue;

      // The wearer. Skin spans a range as it curves through light and shadow, so this compares
      // hue and chroma and allows lightness to vary; hair is matched more tightly since dark
      // hair sits near black, where clothes legitimately live too.
      if (skin && isSkinLike(l, c, h, skin)) continue;
      if (hair && deltaE(oklchToHex({ l, c, h }), oklchToHex(hair)) < 0.06) continue;

      samples.push({ l, c, h });
    }
  }

  const coverage = considered === 0 ? 0 : samples.length / considered;
  if (samples.length === 0) return { swatches: [], coverage: 0 };

  // Bucket by hue and lightness together: navy and sky blue share a hue but are not the same
  // garment, and black trousers and a white shirt share an absence of hue but are obviously not
  // one thing either.
  const grouped = new Map<string, Sample[]>();
  for (const s of samples) {
    const key =
      s.c < NEUTRAL_CHROMA
        ? `n${Math.floor(s.l * 6)}` // achromatic, split by lightness only
        : `${Math.floor((s.h / 360) * 18)}:${Math.floor(s.l * 5)}`;
    const list = grouped.get(key);
    if (list) list.push(s);
    else grouped.set(key, [s]);
  }

  let swatches: GarmentSwatch[] = [...grouped.values()].map((group) => {
    const l = mean(group.map((s) => s.l));
    const c = mean(group.map((s) => s.c));
    const h = meanHue(group);
    return { hex: oklchToHex({ l, c, h }), share: group.length / samples.length, chroma: c, hue: h, lightness: l };
  });

  // Merge anything perceptually indistinguishable — bucket boundaries are arbitrary, and a
  // colour straddling one would otherwise appear twice and split its own share.
  swatches = mergeClose(swatches);

  return {
    swatches: swatches
      .filter((s) => s.share >= MIN_SHARE)
      .sort((a, b) => b.share - a.share)
      .slice(0, MAX_SWATCHES),
    coverage,
  };
}

/**
 * Is this pixel the wearer rather than the outfit?
 *
 * Chroma carries the decision. Measured against a real photo, shadowed skin keeps almost exactly
 * the chroma of lit skin while its hue rotates by around 20° and its lightness drops — whereas a
 * pale garment sitting right next to skin in hue and lightness (a cream jacket, here) is set
 * apart by chroma alone. So the hue window is wide enough to catch skin in shadow, and chroma is
 * the narrow gate that keeps cream, beige and camel garments in the palette.
 */
function isSkinLike(l: number, c: number, h: number, skin: { l: number; c: number; h: number }): boolean {
  const hueGap = Math.abs(((h - skin.h + 540) % 360) - 180);
  return hueGap < 28 && Math.abs(c - skin.c) < 0.03 && Math.abs(l - skin.l) < 0.18;
}

/**
 * Merge clusters that are the same garment seen under different light.
 *
 * A red top has a lit side and a shadow side that can sit 0.15 apart in lightness — far enough
 * that a plain perceptual-distance test keeps them apart, which is how a three-piece outfit came
 * out as six swatches. So for colours that *have* a hue, matching is on hue and chroma and
 * lightness is allowed to vary: shadow changes how light a red is, not that it is red.
 *
 * Neutrals are the exception and keep their lightness separation, because lightness is the only
 * thing distinguishing black boots from a white shirt.
 */
function mergeClose(swatches: GarmentSwatch[]): GarmentSwatch[] {
  const merged: GarmentSwatch[] = [];

  for (const swatch of [...swatches].sort((a, b) => b.share - a.share)) {
    const isNeutral = swatch.chroma < NEUTRAL_CHROMA;

    const near = merged.find((m) => {
      const mNeutral = m.chroma < NEUTRAL_CHROMA;
      if (mNeutral !== isNeutral) return false;
      // Neutrals separate on lightness alone, but shading spreads one garment over a range of
      // it, so the threshold is a band rather than a point: a cream jacket's lit and shadowed
      // sides merge, while black boots and a white shirt stay apart.
      if (isNeutral) return Math.abs(m.lightness - swatch.lightness) < NEUTRAL_MERGE_LIGHTNESS;

      const hueGap = Math.abs(((m.hue - swatch.hue + 540) % 360) - 180);
      const chromaRatio = Math.max(m.chroma, swatch.chroma) / Math.max(0.001, Math.min(m.chroma, swatch.chroma));
      return hueGap < 20 && chromaRatio < 2;
    });

    if (!near) {
      merged.push({ ...swatch });
      continue;
    }

    // The representative colour is the most saturated of the group rather than the average:
    // shadow and blown highlights both desaturate, so the vivid member is the one closest to
    // what the garment actually is.
    if (!isNeutral && swatch.chroma > near.chroma) {
      near.hex = swatch.hex;
      near.chroma = swatch.chroma;
      near.hue = swatch.hue;
      near.lightness = swatch.lightness;
    }
    near.share += swatch.share;
  }

  return merged;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Hues are angles, so they average as unit vectors rather than as numbers. */
function meanHue(samples: Sample[]): number {
  let x = 0;
  let y = 0;
  for (const s of samples) {
    const rad = (s.h * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Browser entry point: load an image and read its palette. Requires a CORS-readable source. */
export async function garmentPaletteFromImage(src: string, options: ExtractOptions = {}): Promise<GarmentPalette> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();

  // Downscale on the way in: the answer is a handful of colours, and reading a 4096px source
  // costs a lot for no gain.
  const scale = Math.min(1, 500 / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get a 2D context to read the garment colours");
  ctx.drawImage(image, 0, 0, w, h);

  return extractGarmentPalette(ctx.getImageData(0, 0, w, h).data, w, h, options);
}
