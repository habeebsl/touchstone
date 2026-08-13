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

/**
 * Trace a closed loop through the points as a curve rather than a polygon.
 *
 * Lips are not made of straight lines, and a 20-point polygon between landmarks loses exactly the
 * parts that make a mouth recognisable: the cupid's bow, the taper into the corners, the curve of
 * the lower lip. Catmull-Rom through the landmarks, converted to the cubics canvas draws, puts
 * them back — this is most of the difference between "a shape filled with colour" and a lip.
 */
function traceSmoothLoop(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  const n = points.length;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
  ctx.closePath();
}

/** Pull a ring of points toward its own centre, for the inset used to make a liner band. */
function inset(points: Array<{ x: number; y: number }>, amount: number) {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.map((p) => ({ x: p.x + (cx - p.x) * amount, y: p.y + (cy - p.y) * amount }));
}

export function buildLipMask(
  maskCtx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
  feather: number,
) {
  const outer = OUTER_LIPS.slice(0, -1).map((i) => toPx(landmarks[i], w, h));
  const inner = INNER_LIPS.slice(0, -1).map((i) => toPx(landmarks[i], w, h));

  maskCtx.clearRect(0, 0, w, h);
  maskCtx.filter = feather > 0 ? `blur(${feather}px)` : "none";
  maskCtx.fillStyle = "white";

  maskCtx.beginPath();
  traceSmoothLoop(maskCtx, outer);
  // Second subpath, so the even-odd rule leaves the mouth opening unpainted — otherwise an open
  // mouth is painted across the teeth and tongue.
  traceSmoothLoop(maskCtx, inner);
  maskCtx.fill("evenodd");
  maskCtx.filter = "none";
}

/**
 * A band just inside the lip line, where liner is actually worn.
 *
 * Defining the edge is most of what separates a lip that looks made up from one that looks
 * washed with colour, and it is the detail whose absence reads as "paint" — a real lip is darker
 * at its border and the shape is deliberate there.
 */
export function buildLipLinerMask(
  maskCtx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
  feather: number,
) {
  const outer = OUTER_LIPS.slice(0, -1).map((i) => toPx(landmarks[i], w, h));

  maskCtx.clearRect(0, 0, w, h);
  maskCtx.filter = feather > 0 ? `blur(${feather}px)` : "none";
  maskCtx.fillStyle = "white";
  maskCtx.beginPath();
  traceSmoothLoop(maskCtx, outer);
  traceSmoothLoop(maskCtx, inset(outer, 0.12));
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
  meanLuminance: number,
  intensity: number,
  w: number,
  h: number,
) {
  const scratch = scratchCanvas.getContext("2d")!;

  // Each pixel's luminance relative to the region's mean: 1 where it matches, above 1 on a
  // highlight, below in shadow.
  scratch.globalCompositeOperation = "source-over";
  scratch.clearRect(0, 0, w, h);
  scratch.filter = `grayscale(1) brightness(${(1 / Math.max(MIN_MEAN_LUMINANCE, meanLuminance)).toFixed(4)})`;
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

/**
 * Guards the divide. It has to be low enough not to distort a genuinely dark region — at 0.06 a
 * deep lip in low light was floored, which quietly darkened and desaturated the shade — and high
 * enough that a near-black frame does not send the brightness factor to infinity.
 */
const MIN_MEAN_LUMINANCE = 0.025;

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

/** Rec. 709 luma, matching what the CSS `grayscale` filter computes. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The average luminance of a region *in the live video*.
 *
 * This has to be measured rather than taken from the analysis photo, and the difference is not
 * subtle: the webcam has its own exposure and white balance, and if it runs brighter than the
 * photo then every pixel's ratio exceeds 1, the shade scales past full and the largest channel
 * clips. Modelled at +0.4 stops, a brick lip rendered #ff6f35 — pinned at 255, chroma pushed from
 * 0.146 to 0.189. That is the "everything looks red" that survived three attempts at fixing the
 * hue arithmetic, because the arithmetic was never the problem.
 *
 * Averaged by letting the GPU downscale the masked region to a single pixel, so this costs one
 * 1x1 read rather than a pass over the frame.
 */
export interface LipLayer {
  maskCanvas: HTMLCanvasElement;
  shadeHex: string;
  intensity: number;
  gloss: number;
}

/**
 * Recolour the lip, per pixel, over its bounding box only.
 *
 * Blend modes cannot express what makeup actually does, which is why several attempts with them
 * looked like paint. Following the physics: a face is albedo, diffuse shading and specular
 * highlight, and lipstick changes the *albedo*. The specular is the colour of the light, not of
 * the product — a glossy red lip still has a near-white highlight. Multiplying a shade through
 * every luminance level, which is what a blend mode does, tints that highlight red and turns the
 * shadows into dark red, and the result reads as a plastic shell.
 *
 * So the recolouring is weighted by how mid-tone a pixel is: full strength where the lip is
 * evenly lit, tapering to nothing in the specular and in the deepest shadow. Those keep the
 * original pixel, which is what the trade literature means by applying the change in hue while
 * leaving saturation and brightness alone at the extremes.
 *
 * The pixels come from the video into a small CPU-side buffer rather than being read back off the
 * display canvas. Reading a GPU-backed canvas stalls the pipeline hard enough to drop frames, and
 * doing it twice a frame — once for the lip, once for the liner — made the mouth appear in pieces
 * as the compositing fell behind. All the layers are applied in one pass over one buffer instead.
 *
 * Worth being honest about in the code, since the comment above reads like a win: measured after
 * the fact, this pass costs 25ms against detection's 113ms, so it was never the bottleneck it was
 * written to fix. The first version of it also reallocated the buffer every frame and blitted the
 * whole rectangle opaquely — two stalls and one erased blush, in the name of removing a stall.
 * Both are addressed below.
 */
export function recolourLip(
  targetCtx: CanvasRenderingContext2D,
  video: CanvasImageSource,
  roiCanvas: HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number },
  layers: LipLayer[],
  meanLuminance: number,
) {
  const { x, y, width, height } = box;
  if (width < 2 || height < 2 || layers.length === 0) return;

  // Grown, never resized to fit. Assigning width or height reallocates the backing store and
  // resets the context, and the mouth's box changes size on almost every frame — so sizing it
  // exactly meant a fresh allocation per frame, which is a stall in the same place this buffer
  // exists to remove one. A larger canvas costs nothing here; only the sub-rectangle is used.
  if (roiCanvas.width < width || roiCanvas.height < height) {
    roiCanvas.width = Math.max(roiCanvas.width, width);
    roiCanvas.height = Math.max(roiCanvas.height, height);
  }

  const roi = roiCanvas.getContext("2d", { willReadFrequently: true })!;
  roi.clearRect(0, 0, width, height);
  roi.drawImage(video, x, y, width, height, 0, 0, width, height);

  const frame = roi.getImageData(0, 0, width, height);
  const px = frame.data;
  const mean = Math.max(MIN_MEAN_LUMINANCE, meanLuminance) * 255;
  const out: [number, number, number] = [0, 0, 0];

  // The buffer starts fully transparent and gains opacity only where a mask covers it. This is
  // what keeps the blit to the lip: the pixels come from the video, not from the display canvas,
  // so blitting the whole rectangle opaquely would erase the blush already composited underneath
  // wherever the mouth's box overlaps the cheek.
  for (let i = 3; i < px.length; i += 4) px[i] = 0;

  for (const layer of layers) {
    const mask = layer.maskCanvas
      .getContext("2d", { willReadFrequently: true })!
      .getImageData(x, y, width, height).data;
    const [sr, sg, sb] = toRgb(layer.shadeHex).map((v) => v * 255);

    for (let i = 0; i < px.length; i += 4) {
      const coverage = mask[i + 3] / 255;
      if (coverage < 0.004) continue;

      lipPixel(px[i], px[i + 1], px[i + 2], sr, sg, sb, mean, layer.intensity * coverage, layer.gloss * coverage, out);
      px[i] = out[0];
      px[i + 1] = out[1];
      px[i + 2] = out[2];
      // Layers overlap — the liner sits inside the lip — so the most-covered one wins rather than
      // the last one drawn.
      px[i + 3] = Math.max(px[i + 3], coverage * 255);
    }
  }

  roi.putImageData(frame, 0, 0);
  targetCtx.drawImage(roiCanvas, 0, 0, width, height, x, y, width, height);
}

/**
 * One pixel of lipstick, written out so the checks can exercise the same arithmetic the renderer
 * runs rather than a description of it.
 */
export function lipPixel(
  r: number,
  g: number,
  b: number,
  sr: number,
  sg: number,
  sb: number,
  mean: number,
  alpha: number,
  gloss: number,
  out: [number, number, number],
) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ratio = lum / mean;

  // 1 through the mid-tones, falling away into the specular. The highlight is the colour of the
  // light, not of the lipstick, and tinting it is what makes a lip read as a plastic shell.
  //
  // Judged on the ratio *and* on absolute brightness, because on pale lips the ratio alone
  // under-detects a highlight: when the mean is already bright there is little headroom above it,
  // so a genuine specular scores barely 1.6 and took a third of the lipstick's colour.
  // A specular has to be bright in itself, not merely brighter than the region's average. The
  // average is dragged down by the lip line and the corners, so on a strongly lit mouth the
  // ordinary centre scores a high ratio while being nowhere near white — and it was that, read as
  // a highlight, that left it unpainted. The ratio only counts to the extent the pixel is
  // genuinely bright.
  const bright = Math.max(0, Math.min(1, (lum / 255 - 0.55) / 0.3));
  // Absolute brightness still stands on its own once a pixel is close to white, because on pale
  // lips the ratio under-detects: with the mean already bright there is little headroom above it,
  // so a real specular scores barely 1.6.
  const nearWhite = Math.max(0, Math.min(1, (lum / 255 - 0.85) / 0.1));
  const light = Math.min(1, Math.max(0, (ratio - SPECULAR_FROM) / 0.5) * bright + nearWhite);
  // Shadow keeps most of its coverage. Lipstick in shadow is dark lipstick, not bare lip, and the
  // relight already carries the darkness — fading it out here as well left the lip line and the
  // corners of the mouth uncoloured.
  const shadow = Math.max(0, (SHADOW_FROM - ratio) / 0.45) * SHADOW_FADE;
  const weight = Math.max(0, Math.min(1, 1 - shadow) * (1 - light * (1 - SPECULAR_KEEP)));

  const a = alpha * weight;

  // The albedo, relit by however much light this pixel is receiving. Where that overflows, the
  // excess spills into the other channels rather than being clipped away.
  //
  // Clipping each channel on its own is what made a bright pixel on a deep lip come out *more*
  // saturated than the lip itself: the mean is dark, so the ratio runs high, red pins at 255 while
  // green and blue keep climbing, and chroma rises with them. Real light does the opposite — as a
  // surface blows out it washes toward white. Spilling the overflow across all three channels is
  // that rolloff, and it is also the fix for the hue shift the same clipping used to cause.
  let rr = sr * ratio;
  let gg = sg * ratio;
  let bb = sb * ratio;
  const over = Math.max(rr, gg, bb) - 255;
  if (over > 0) {
    rr = Math.min(255, rr + over);
    gg = Math.min(255, gg + over);
    bb = Math.min(255, bb + over);
  }

  out[0] = r + (rr - r) * a;
  out[1] = g + (gg - g) * a;
  out[2] = b + (bb - b) * a;

  // Gloss is added as light, not as colour — white, and only where the lip was already catching
  // it, so it sits where the surface actually curves toward the source.
  if (gloss > 0.01 && ratio > SPECULAR_FROM) {
    const shine = Math.min(1, (ratio - SPECULAR_FROM) / 0.6) * gloss;
    out[0] += (255 - out[0]) * shine;
    out[1] += (255 - out[1]) * shine;
    out[2] += (255 - out[2]) * shine;
  }
}

/** Above this multiple of the region's mean, a pixel starts reading as light rather than lit lip. */
const SPECULAR_FROM = 1.35;
/** And below this, it is shadow — the corners of the mouth, the line between the lips. */
const SHADOW_FROM = 0.62;
/**
 * How much of the shade even a full highlight keeps. Not zero: a glossy red lip has a pink-white
 * highlight, not a bare-lip one, and taking it to zero is what left the middle of the lip unpainted.
 */
const SPECULAR_KEEP = 0.2;
/** How much of its coverage a shadow gives up. Most of it is kept: it is still lipstick. */
const SHADOW_FADE = 0.3;

/** The pixel bounds of a set of landmarks, padded and clamped to the frame. */
export function boundsOf(
  landmarks: NormalizedLandmark[],
  indices: number[],
  w: number,
  h: number,
  padding: number,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of indices) {
    const p = toPx(landmarks[i], w, h);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x = Math.max(0, Math.floor(minX - padding));
  const y = Math.max(0, Math.floor(minY - padding));
  return {
    x,
    y,
    width: Math.min(w - x, Math.ceil(maxX - minX + padding * 2)),
    height: Math.min(h - y, Math.ceil(maxY - minY + padding * 2)),
  };
}

export function measureRegionLuminance(
  video: CanvasImageSource,
  maskCanvas: HTMLCanvasElement,
  scratchCanvas: HTMLCanvasElement,
  meanCanvas: HTMLCanvasElement,
  w: number,
  h: number,
): number | null {
  const scratch = scratchCanvas.getContext("2d")!;
  scratch.globalCompositeOperation = "source-over";
  scratch.clearRect(0, 0, w, h);
  scratch.drawImage(video, 0, 0, w, h);
  scratch.globalCompositeOperation = "destination-in";
  scratch.drawImage(maskCanvas, 0, 0);
  scratch.globalCompositeOperation = "source-over";

  const mean = meanCanvas.getContext("2d", { willReadFrequently: true })!;
  mean.clearRect(0, 0, 1, 1);
  mean.drawImage(scratchCanvas, 0, 0, 1, 1);

  const [r, g, b, a] = mean.getImageData(0, 0, 1, 1).data;
  // Nothing in the mask — no face, or the region is off-frame.
  if (a < 8) return null;

  // Un-premultiply: the downscale averaged colour weighted by mask coverage.
  const scale = 255 / a;
  return (0.2126 * r * scale + 0.7152 * g * scale + 0.0722 * b * scale) / 255;
}

/** What a pixel of `backdrop` becomes under the relight — for the checks and for sizing shades. */
export function predictComposite(
  backdropHex: string,
  shadeHex: string,
  meanHex: string,
  intensity: number,
): string {
  const ratio = luminance(backdropHex) / Math.max(MIN_MEAN_LUMINANCE, luminance(meanHex));
  const shade = toRgb(shadeHex);
  const backdrop = toRgb(backdropHex);
  const relit = shade.map((v) => Math.min(1, v * ratio));
  return toHex(backdrop.map((v, i) => v + (relit[i] - v) * intensity));
}
