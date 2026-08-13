import { useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { TextureLip } from "../lib/youcam/types";
import {
  boundsOf,
  buildLipMask,
  buildLipLinerMask,
  buildBlushMask,
  compositeRegion,
  luminance,
  measureRegionLuminance,
  OUTER_LIPS,
  recolourLip,
  smoothLandmarks,
  type NormalizedLandmark,
} from "../lib/livePreview/blendOverlay";

interface LivePreviewProps {
  lipColor: string;
  blushColor: string;
  /** Drawn just inside the lip line. Absent for looks that apply no liner. */
  lipLinerColor?: string;
  /** How much the lip shines: a gloss carries a hard specular, a matte carries none. */
  finish: TextureLip;
  /**
   * What each shade is going *over*: her measured lip colour for the lip, her skin for the
   * cheek. Compositing both against skin was wrong — lips are already deeper and more saturated
   * than the face, so a shade sized against skin lands wide of what it actually has to shift.
   */
  /**
   * How strongly each is worn, 0..1, taken from the look itself rather than fixed here. A
   * constant meant the canvas applied every shade at the same strength — vivid where the
   * rendered look was muted, and identical across looks that are meant to differ.
   */
  lipIntensity: number;
  blushIntensity: number;
  skinColor: string;
  lipBaseColor: string;
  /** Applied to the output canvas so the parent controls framing (full-bleed vs boxed). */
  className?: string;
  onStatusChange?: (status: string) => void;
}

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Relighting preserves the region's own variation, so it can run strong without flattening it.
// Lipstick is opaque and deliberate — leaving 15% of the bare lip showing through was reading as
// a wash rather than a shade. Blush is a flush and stays low.
// Liner is a fraction of whatever the lip is wearing, not a fixed strength: it is an edge on the
// lipstick, so it has to move with it or a sheer lip gets a hard drawn border.
const LINER_OF_LIP = 0.78;

// How much specular each finish carries. Matte is genuinely zero: killing the shine is what
// makes a matte look matte.
const SHINE: Record<string, number> = {
  matte: 0,
  satin: 0.16,
  sheer: 0.2,
  gloss: 0.42,
  shimmer: 0.36,
  metallic: 0.4,
  holographic: 0.44,
};

// A tighter edge now that the contour is a curve rather than a polygon — the old blur existed to
// hide the straight segments between landmarks.
const FEATHER = 2;
const LINER_FEATHER = 3;

// The live mean is re-measured periodically rather than every frame: it tracks lighting, which
// changes far more slowly than the frame rate, and each measurement costs a pixel readback.
const MEAN_EVERY_N_FRAMES = 6;
// Eased, so a passing shadow or a single dark frame does not swing the whole region's colour.
const MEAN_SMOOTHING = 0.25;

/** The product's actual live preview: tap a look, see its lip + blush colors live. No user
 * controls — unlike LipBlendSpike, this renders whatever look was selected upstream. */
export default function LivePreview({
  lipColor,
  blushColor,
  lipLinerColor,
  finish,
  lipIntensity,
  blushIntensity,
  skinColor,
  lipBaseColor,
  className = "",
  onStatusChange,
}: LivePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lipMaskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const blushMaskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const colorScratchRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  // 1x1: the GPU downscale does the averaging, so reading the mean costs one pixel.
  const meanPixelRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const linerMaskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const lipMeanRef = useRef<number | null>(null);
  const blushMeanRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  // Previous frame's smoothed landmarks, so the overlay edge stops shimmering between detections.
  const smoothedRef = useRef<NormalizedLandmark[] | null>(null);
  const rafRef = useRef<number | null>(null);

  // Held in a ref so a changing callback identity never restarts the camera pipeline.
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const setStatus = (next: string) => onStatusChangeRef.current?.(next);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      if (cancelled) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;

      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      setStatus("Live");
      loop();
    }

    /**
     * Keep the region's mean luminance current, falling back to what the analysis measured until
     * the first live reading lands.
     */
    function updateMean(current: number | null, mask: HTMLCanvasElement, fallbackHex: string): number {
      const canvas = canvasRef.current!;
      if (current === null || frameRef.current % MEAN_EVERY_N_FRAMES === 0) {
        const measured = measureRegionLuminance(
          videoRef.current!,
          mask,
          colorScratchRef.current,
          meanPixelRef.current,
          canvas.width,
          canvas.height,
        );
        if (measured !== null) {
          return current === null ? measured : current + (measured - current) * MEAN_SMOOTHING;
        }
      }
      return current ?? luminance(fallbackHex);
    }

    function loop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !canvas || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        lipMaskRef.current.width = w;
        lipMaskRef.current.height = h;
        blushMaskRef.current.width = w;
        blushMaskRef.current.height = h;
        linerMaskRef.current.width = w;
        linerMaskRef.current.height = h;
        colorScratchRef.current.width = w;
        colorScratchRef.current.height = h;
        meanPixelRef.current.width = 1;
        meanPixelRef.current.height = 1;
        // Lighting is measured per frame size; a resize invalidates what was measured before.
        lipMeanRef.current = null;
        blushMeanRef.current = null;
      }

      const result = landmarker.detectForVideo(video, performance.now());
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      frameRef.current++;
      const detected = result.faceLandmarks[0];
      // Drop the smoothing history when the face leaves frame, or it eases in from wherever the
      // face was last seen when she comes back.
      if (!detected) smoothedRef.current = null;
      const landmarks = detected ? smoothLandmarks(smoothedRef.current, detected) : null;
      smoothedRef.current = landmarks;

      if (landmarks) {
        const w = canvas.width;
        const h = canvas.height;

        buildBlushMask(blushMaskRef.current.getContext("2d")!, landmarks, w, h);
        blushMeanRef.current = updateMean(blushMeanRef.current, blushMaskRef.current, skinColor);
        compositeRegion(
          ctx,
          video,
          blushMaskRef.current,
          colorScratchRef.current,
          blushColor,
          blushMeanRef.current,
          blushIntensity,
          w,
          h,
        );

        buildLipMask(lipMaskRef.current.getContext("2d")!, landmarks, w, h, FEATHER);
        lipMeanRef.current = updateMean(lipMeanRef.current, lipMaskRef.current, lipBaseColor);

        // Per pixel, and only over the mouth: a blend mode cannot leave the specular alone, and
        // leaving it alone is the difference between lipstick and a plastic shell.
        const lipBox = boundsOf(landmarks, OUTER_LIPS, w, h, FEATHER * 2);
        recolourLip(
          ctx,
          lipMaskRef.current,
          lipBox,
          lipColor,
          lipMeanRef.current,
          lipIntensity,
          SHINE[finish] ?? 0.16,
        );

        // Liner over the lip, since it defines the edge of what is already there.
        if (lipLinerColor) {
          buildLipLinerMask(linerMaskRef.current.getContext("2d")!, landmarks, w, h, LINER_FEATHER);
          recolourLip(ctx, linerMaskRef.current, lipBox, lipLinerColor, lipMeanRef.current, lipIntensity * LINER_OF_LIP, 0);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    setup().catch((err) => {
      console.error(err);
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lipColor, blushColor]);

  return (
    <>
      <video ref={videoRef} style={{ display: "none" }} playsInline muted />
      {/* Mirrored so it behaves like a mirror, which is the entire product metaphor. */}
      <canvas ref={canvasRef} className={className} style={{ transform: "scaleX(-1)" }} />
    </>
  );
}
