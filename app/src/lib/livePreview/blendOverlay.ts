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
 * Fills `colorCanvas` with `color` clipped to whatever's currently in `maskCanvas`, then
 * composites it onto `targetCtx` with a blend mode so underlying shading/highlights show through.
 */
export function compositeRegion(
  targetCtx: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement,
  colorCanvas: HTMLCanvasElement,
  color: string,
  blendMode: GlobalCompositeOperation,
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
  targetCtx.globalCompositeOperation = blendMode;
  targetCtx.drawImage(colorCanvas, 0, 0);
  targetCtx.restore();
}
