// Blend-mode compositing for the live preview layer.
//
// Landmark indices are MediaPipe's 468-point face mesh topology (Face Landmarker uses the same
// topology as FaceMesh).
//
// The approach throughout is to *tint* the video rather than paint over it: a mask defines where,
// a blend mode lets the underlying shading, specular highlights and lip texture show through.
// Painting flat colour reads as a sticker, which is what the first version of the blush did.

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
 * The model is relighting: `out = shade * (luminance(pixel) / luminance(mean))`, where `mean` is
 * what the region averages — her measured lip colour, or her skin. The shade supplies the colour
 * outright and the pixel supplies only how *lit* it is, so shading, creases and the specular
 * highlight all survive as a ratio while the hue is exactly the shade's.
 *
 * Scaling by luminance rather than per channel is the whole trick, and getting it wrong is
 * instructive: a per-channel ratio (`shade / mean` on r, g and b separately) explodes when the
 * mean is dark, because a channel near zero divides into a large number. On deep colouring the
 * small channels clamped to zero and the largest clipped, so every pixel landed on saturated red
 * whatever shade was asked for.
 *
 * It is also cheap: a grayscale-and-brightness filter produces the ratio, and one multiply
 * applies the shade. No per-pixel work, no shader.
 */
export function compositeRegion(
  targetCtx: CanvasRenderingContext2D,
  video: CanvasImageSource,
  maskCanvas: HTMLCanvasElement,
  scratchCanvas: HTMLCanvasElement,
  shadeHex: string,
  meanHex: string,
  intensity: number,
  w: number,
  h: number,
) {
  const scratch = scratchCanvas.getContext("2d")!;

  // Each pixel's luminance relative to the region's mean: 1 where it matches, above 1 on a
  // highlight, below in shadow.
  scratch.globalCompositeOperation = "source-over";
  scratch.clearRect(0, 0, w, h);
  scratch.filter = `grayscale(1) brightness(${(1 / Math.max(0.06, luminance(meanHex))).toFixed(4)})`;
  scratch.drawImage(video, 0, 0, w, h);
  scratch.filter = "none";

  // Multiplied by the shade, that ratio *is* the relit region.
  scratch.globalCompositeOperation = "multiply";
  scratch.fillStyle = shadeHex;
  scratch.fillRect(0, 0, w, h);

  scratch.globalCompositeOperation = "destination-in";
  scratch.drawImage(maskCanvas, 0, 0);
  scratch.globalCompositeOperation = "source-over";

  targetCtx.save();
  targetCtx.globalAlpha = intensity;
  targetCtx.drawImage(scratchCanvas, 0, 0);
  targetCtx.restore();
}

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

/** Rec. 709 luma, matching what the CSS `grayscale` filter computes. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** What a pixel of `backdrop` becomes under the relight — for the checks and for sizing shades. */
export function predictComposite(
  backdropHex: string,
  shadeHex: string,
  meanHex: string,
  intensity: number,
): string {
  const ratio = luminance(backdropHex) / Math.max(0.06, luminance(meanHex));
  const shade = toRgb(shadeHex);
  const backdrop = toRgb(backdropHex);
  const relit = shade.map((v) => Math.min(1, v * ratio));
  return toHex(backdrop.map((v, i) => v + (relit[i] - v) * intensity));
}
