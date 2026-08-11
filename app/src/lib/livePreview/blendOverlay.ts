// Shared blend-mode compositing for the live preview layer. Factored out of the spike #1
// prototype (LipBlendSpike) so both the free-play spike and the "tap a look, see it live"
// product flow (spike #5) share the same rendering code.
//
// Landmark indices are MediaPipe's 468-point face mesh topology (Face Landmarker uses the same
// topology as FaceMesh).

export const OUTER_LIPS = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61,
];

// Cheek "apple" centers and face-width reference points, used to size/place blush as soft
// radial gradients rather than a precise polygon (blush doesn't have a hard boundary in real
// makeup application, so a gradient reads more natural than a masked polygon does here).
const LEFT_CHEEK_CENTER = 50;
const RIGHT_CHEEK_CENTER = 280;
const FACE_LEFT_EDGE = 234;
const FACE_RIGHT_EDGE = 454;

export type NormalizedLandmark = { x: number; y: number };

function toPx(p: NormalizedLandmark, w: number, h: number) {
  return { x: p.x * w, y: p.y * h };
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
  OUTER_LIPS.forEach((idx, i) => {
    const { x, y } = toPx(landmarks[idx], w, h);
    if (i === 0) maskCtx.moveTo(x, y);
    else maskCtx.lineTo(x, y);
  });
  maskCtx.closePath();
  maskCtx.fill();
  maskCtx.filter = "none";
}

export function buildBlushMask(
  maskCtx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
) {
  maskCtx.clearRect(0, 0, w, h);
  const faceWidthPx = Math.abs(
    toPx(landmarks[FACE_RIGHT_EDGE], w, h).x - toPx(landmarks[FACE_LEFT_EDGE], w, h).x,
  );
  const radius = faceWidthPx * 0.16;

  for (const idx of [LEFT_CHEEK_CENTER, RIGHT_CHEEK_CENTER]) {
    const { x, y } = toPx(landmarks[idx], w, h);
    const gradient = maskCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    maskCtx.fillStyle = gradient;
    maskCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
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
