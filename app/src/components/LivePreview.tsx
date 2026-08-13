import { useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { TextureLip } from "../lib/youcam/types";
import type { FromWorker, ToWorker } from "../lib/livePreview/landmarkerMessages";
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
  skinColor: string;
  lipBaseColor: string;
  /** Applied to the output canvas so the parent controls framing (full-bleed vs boxed). */
  className?: string;
  onStatusChange?: (status: string) => void;
  /** Per-stage timings, so a stall can be attributed rather than guessed at. */
  onStats?: (stats: string) => void;
}

// Served from the installed package by the mediapipe-wasm plugin in vite.config.ts, not a CDN:
// the glue code and the wasm have to be the same version or detection silently falls back to a
// slower build. See the note there.
const WASM_BASE = "/mediapipe";
// Served from public/ rather than storage.googleapis.com. It is 3.7MB, and on a phone the cold
// download was landing inside the worker's startup — the main thread's fallback only ever looked
// fast because by then the file was in cache. Also means the demo does not need the network.
const MODEL_URL = "/models/face_landmarker.task";

// Relighting preserves the region's own variation, so it can run strong without flattening it.
// Lipstick is opaque and deliberate — leaving 15% of the bare lip showing through was reading as
// a wash rather than a shade. Blush is a flush and stays low.
const LIP_INTENSITY = 0.96;
const LINER_INTENSITY = 0.75;
const BLUSH_INTENSITY = 0.4;

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
// Measured against the clock rather than a frame count. Counting frames tied how fast the shade
// settles to how fast the device renders: at six frames a second, every-sixth-frame meant once a
// second, so lighting took five times longer to track than it did at thirty — on exactly the
// devices where the preview already felt slow to arrive.
const MEAN_EVERY_MS = 200;
// Eased, so a passing shadow or a single dark frame does not swing the whole region's colour.
const MEAN_SMOOTHING = 0.25;

// Frames excluded from the timing averages while the model warms up.
const WARMUP_FRAMES = 5;

/** The product's actual live preview: tap a look, see its lip + blush colors live. No user
 * controls — unlike LipBlendSpike, this renders whatever look was selected upstream. */
export default function LivePreview({
  lipColor,
  blushColor,
  lipLinerColor,
  finish,
  skinColor,
  lipBaseColor,
  className = "",
  onStatusChange,
  onStats,
}: LivePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lipMaskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const blushMaskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const colorScratchRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  // 1x1: the GPU downscale does the averaging, so reading the mean costs one pixel.
  const meanPixelRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const linerMaskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  // Sized to the mouth, so the per-pixel pass touches a few tens of thousands of pixels and never
  // reads back from the display canvas.
  const lipRoiRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const lipMeanRef = useRef<number | null>(null);
  const blushMeanRef = useRef<number | null>(null);
  // When each region's mean was last measured, so the cadence follows the clock and not the
  // frame rate. Separate, because the two regions are measured at different points in the frame.
  const lipClockRef = useRef({ at: 0 });
  const blushClockRef = useRef({ at: 0 });
  const frameRef = useRef(0);
  const timings = useRef({ detect: 0, blush: 0, lip: 0, frame: 16, last: 0, samples: 0 });
  // Only one of these is live. The worker is preferred; the inline landmarker is what runs if a
  // worker cannot be created, which keeps a slow preview rather than no preview.
  const workerRef = useRef<Worker | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  // True between posting a frame and hearing back, so only one detection is ever in flight. The
  // worker would otherwise queue frames it can never catch up on and the lag would grow forever.
  const inFlightRef = useRef(false);
  const detectRef = useRef({ cost: 0, count: 0, since: 0 });
  // Previous frame's smoothed landmarks, so the overlay edge stops shimmering between detections.
  const smoothedRef = useRef<NormalizedLandmark[] | null>(null);
  const rafRef = useRef<number | null>(null);

  // Held in a ref so a changing callback identity never restarts the camera pipeline.
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const setStatus = (next: string) => onStatusChangeRef.current?.(next);

  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  // Which wasm build actually loaded and whether the GPU delegate had anything to run on. Two
  // rounds of tuning the compositing were spent on what turned out to be detection cost, and
  // detection cost is decided here rather than anywhere in our code.
  const envRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    /**
     * Hand detection to a worker, resolving a label describing what happened. The label reaches
     * the on-screen readout rather than the console, because the device this matters on is a
     * phone and a console.error there is unreadable — the first attempt fell back silently and
     * cost a round trip to find out.
     *
     * The absolute URL form is what lets Vite bundle the worker; a bare path would not survive
     * the build.
     */
    function startWorker(): Promise<string> {
      return new Promise((resolve) => {
        let worker: Worker;
        try {
          // Classic, not a module worker. MediaPipe loads its wasm glue with importScripts(),
          // which is forbidden inside a module worker — it fails with "ModuleFactory not set."
          // for every delegate, which reads like a GPU problem and is not one. Vite bundles this
          // to an IIFE (see `worker.format` in vite.config.ts) so the imports still resolve.
          worker = new Worker(new URL("../lib/livePreview/landmarkerWorker.ts", import.meta.url));
        } catch (err) {
          resolve(`inline(spawn: ${err instanceof Error ? err.message : String(err)})`);
          return;
        }

        // The last startup step the worker announced. A worker that hangs never reports an error,
        // so without this a timeout names nothing you can act on — which is how the previous
        // round was spent.
        let stage = "spawn";

        const giveUp = (why: string) => {
          clearTimeout(timeout);
          worker.terminate();
          workerRef.current = null;
          resolve(`inline(${why})`);
        };

        // A backstop for a worker that stops responding entirely, not a budget for startup — the
        // worker times its own steps and reports which one failed. This has to sit clear of the
        // sum of those, or it fires first and discards the reasons it exists to surface: at 20s
        // against two 8s steps it reported "timeout@CPU" and lost both delegates' errors. Nothing
        // waits on it now that the camera starts independently.
        const timeout = setTimeout(() => giveUp(`timeout@${stage}`), 90_000);

        worker.onerror = (event) => giveUp(`load: ${event.message || "failed"}`);

        worker.onmessage = (event: MessageEvent<FromWorker>) => {
          const message = event.data;
          if (message.type === "stage") {
            stage = message.name;
            return;
          }
          if (message.type === "ready") {
            clearTimeout(timeout);
            workerRef.current = worker;
            resolve(`worker:${message.delegate}`);
            return;
          }
          if (message.type === "error") {
            giveUp(message.message);
            return;
          }
          if (message.type === "landmarks") {
            inFlightRef.current = false;
            detectRef.current.cost = message.cost;
            detectRef.current.count++;
            // Drop the smoothing history when the face leaves frame, or it eases in from wherever
            // the face was last seen when she comes back.
            smoothedRef.current = message.landmarks
              ? smoothLandmarks(smoothedRef.current, message.landmarks)
              : null;
          }
        };

        worker.postMessage({ type: "init", wasmBase: WASM_BASE, modelUrl: MODEL_URL } satisfies ToWorker);
      });
    }

    /**
     * Post the current frame for detection if the worker is free. Frames are dropped rather than
     * queued while it is busy — the newest frame is the only one worth landmarking.
     */
    function requestDetection(video: HTMLVideoElement) {
      const worker = workerRef.current;
      if (!worker || inFlightRef.current) return;
      inFlightRef.current = true;
      createImageBitmap(video).then(
        (bitmap) => {
          if (!workerRef.current) {
            bitmap.close();
            inFlightRef.current = false;
            return;
          }
          worker.postMessage({ type: "frame", bitmap, timestamp: performance.now() } satisfies ToWorker, [
            bitmap,
          ]);
        },
        () => {
          inFlightRef.current = false;
        },
      );
    }

    async function setup() {
      // The camera does not depend on the detector, and waiting for one before asking for the
      // other is what made the preview slow to open: every failed worker attempt spent its
      // fallback timeout — up to twenty seconds — before getUserMedia was even called. Started
      // together, the mirror appears as soon as the camera does and the makeup arrives when
      // detection is ready.
      const camera = navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      // Nothing is awaiting this yet; without a handler a slow permission prompt would surface as
      // an unhandled rejection before setup reaches it.
      camera.catch(() => {});

      startDetector();

      const stream = await camera;
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

    /** Stand up whichever detector this browser will give us, without holding up the camera. */
    async function startDetector() {
      const how = await startWorker();
      if (cancelled) return;

      if (!workerRef.current) {
        // Inline: detection blocks the frame, which on a slow device is the 6fps behaviour the
        // worker exists to avoid. Still better than a blank preview.
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
      }

      const wasm = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => n.includes("/mediapipe/") && n.endsWith(".wasm"));
      const gl = document.createElement("canvas").getContext("webgl2");
      envRef.current =
        `${gl ? "webgl2" : "NO webgl2"} · ` +
        `${wasm?.split("/").pop()?.replace("vision_wasm_", "").replace("_internal.wasm", "") ?? "wasm?"} · ` +
        `${(navigator as { deviceMemory?: number }).deviceMemory ?? "?"}GB · ` +
        `${navigator.hardwareConcurrency ?? "?"} cores · ${how}`;
    }

    /**
     * Keep the region's mean luminance current, falling back to what the analysis measured until
     * the first live reading lands.
     */
    function updateMean(
      current: number | null,
      mask: HTMLCanvasElement,
      fallbackHex: string,
      clock: { at: number },
    ): number {
      const canvas = canvasRef.current!;
      const now = performance.now();
      if (current === null || now - clock.at >= MEAN_EVERY_MS) {
        clock.at = now;
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
      // Deliberately not waiting on a detector: the frame is drawn either way, so the mirror is
      // live while landmarking is still starting up rather than after it.
      if (!video || !canvas || video.readyState < 2) {
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

      const tStart = performance.now();
      if (workerRef.current) {
        // Non-blocking: the worker answers whenever it answers, and this frame renders against
        // whatever the last answer was.
        requestDetection(video);
      } else if (landmarkerRef.current) {
        const result = landmarkerRef.current.detectForVideo(video, performance.now());
        const detected = result.faceLandmarks[0];
        smoothedRef.current = detected ? smoothLandmarks(smoothedRef.current, detected) : null;
        detectRef.current.cost = performance.now() - tStart;
        detectRef.current.count++;
      }
      const tDetect = performance.now();
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      frameRef.current++;
      const landmarks = smoothedRef.current;

      if (landmarks) {
        const w = canvas.width;
        const h = canvas.height;

        buildBlushMask(blushMaskRef.current.getContext("2d")!, landmarks, w, h);
        blushMeanRef.current = updateMean(blushMeanRef.current, blushMaskRef.current, skinColor, blushClockRef.current);
        compositeRegion(
          ctx,
          video,
          blushMaskRef.current,
          colorScratchRef.current,
          blushColor,
          blushMeanRef.current,
          BLUSH_INTENSITY,
          w,
          h,
        );

        buildLipMask(lipMaskRef.current.getContext("2d", { willReadFrequently: true })!, landmarks, w, h, FEATHER);
        lipMeanRef.current = updateMean(lipMeanRef.current, lipMaskRef.current, lipBaseColor, lipClockRef.current);

        // Per pixel, and only over the mouth: a blend mode cannot leave the specular alone, and
        // leaving it alone is the difference between lipstick and a plastic shell. Liner is a
        // second layer in the same pass — it defines the edge of what the first one laid down.
        const lipBox = boundsOf(landmarks, OUTER_LIPS, w, h, FEATHER * 2);
        const layers = [
          { maskCanvas: lipMaskRef.current, shadeHex: lipColor, intensity: LIP_INTENSITY, gloss: SHINE[finish] ?? 0.16 },
        ];
        if (lipLinerColor) {
          buildLipLinerMask(linerMaskRef.current.getContext("2d", { willReadFrequently: true })!, landmarks, w, h, LINER_FEATHER);
          layers.push({
            maskCanvas: linerMaskRef.current,
            shadeHex: lipLinerColor,
            intensity: LINER_INTENSITY,
            gloss: 0,
          });
        }
        const tBeforeLip = performance.now();
        recolourLip(ctx, video, lipRoiRef.current, lipBox, layers, lipMeanRef.current);

        // Rolling averages: a single frame says nothing, and the stall being hunted is
        // intermittent. The opening frames are dropped and the average is seeded from the first
        // one kept — model warm-up costs hundreds of milliseconds, and folded into a 0.1 average
        // it inflates the reading for seconds, which is long enough to be read off the screen and
        // acted on.
        const now = performance.now();
        const t = timings.current;
        t.samples++;
        if (t.samples > WARMUP_FRAMES) {
          const seed = t.samples === WARMUP_FRAMES + 1;
          const ease = (prev: number, next: number) => (seed ? next : prev + (next - prev) * 0.1);
          // On the worker path this is what detection cost on the other thread, which is no longer
          // part of this frame's budget — the two numbers now mean different things and the
          // readout says which.
          t.detect = ease(t.detect, detectRef.current.cost);
          t.blush = ease(t.blush, tBeforeLip - tDetect);
          t.lip = ease(t.lip, now - tBeforeLip);
          t.frame = ease(t.frame, now - (t.last || now));
        }
        t.last = now;

        if (frameRef.current % 15 === 0) {
          const d = detectRef.current;
          // Detections per second, measured over the reporting window. Rendering can now outrun
          // detection, so frame rate alone no longer says whether the mask is keeping up.
          const elapsed = now - (d.since || now);
          const rate = elapsed > 0 ? (d.count * 1000) / elapsed : 0;
          d.since = now;
          d.count = 0;
          onStatsRef.current?.(
            `${(1000 / Math.max(1, t.frame)).toFixed(0)}fps · detect ${t.detect.toFixed(0)}ms ` +
              `@${rate.toFixed(0)}/s · blush ${t.blush.toFixed(0)}ms · lip ${t.lip.toFixed(0)}ms · ` +
              `roi ${lipBox.width}x${lipBox.height} · frame ${w}x${h} · ${envRef.current}`,
          );
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
      workerRef.current?.terminate();
      workerRef.current = null;
      inFlightRef.current = false;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
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
