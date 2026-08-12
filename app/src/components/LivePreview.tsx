import { useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { hexToOklch } from "../lib/colorEngine/oklch";
import {
  buildLipMask,
  buildBlushMask,
  chooseBlend,
  compositeRegion,
  smoothLandmarks,
  type NormalizedLandmark,
} from "../lib/livePreview/blendOverlay";

interface LivePreviewProps {
  lipColor: string;
  blushColor: string;
  /** Her measured skin colour, which decides how each shade has to be composited to be seen. */
  skinColor: string;
  /** Applied to the output canvas so the parent controls framing (full-bleed vs boxed). */
  className?: string;
  onStatusChange?: (status: string) => void;
}

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const LIP_INTENSITY = 0.75;
const BLUSH_INTENSITY = 0.45;
const FEATHER = 4;

/** The product's actual live preview: tap a look, see its lip + blush colors live. No user
 * controls — unlike LipBlendSpike, this renders whatever look was selected upstream. */
export default function LivePreview({
  lipColor,
  blushColor,
  skinColor,
  className = "",
  onStatusChange,
}: LivePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lipMaskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const blushMaskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const colorScratchRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lipBlend = chooseBlend(hexToOklch(lipColor).l, hexToOklch(skinColor).l);
  const blushBlend = chooseBlend(hexToOklch(blushColor).l, hexToOklch(skinColor).l);
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
        colorScratchRef.current.width = w;
        colorScratchRef.current.height = h;
      }

      const result = landmarker.detectForVideo(video, performance.now());
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
        compositeRegion(
          ctx,
          blushMaskRef.current,
          colorScratchRef.current,
          blushColor,
          blushBlend,
          BLUSH_INTENSITY,
          w,
          h,
        );

        buildLipMask(lipMaskRef.current.getContext("2d")!, landmarks, w, h, FEATHER);
        compositeRegion(
          ctx,
          lipMaskRef.current,
          colorScratchRef.current,
          lipColor,
          lipBlend,
          LIP_INTENSITY,
          w,
          h,
        );
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
