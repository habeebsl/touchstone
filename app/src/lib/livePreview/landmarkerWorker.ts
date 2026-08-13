/// <reference lib="webworker" />
/**
 * Face landmarking, off the render thread.
 *
 * Measured on the phone this is built for, `detectForVideo` costs 113ms a frame with WebGL2
 * available and the SIMD build loaded — so it is not a misconfiguration, it is what the model
 * costs on that hardware. Run inline it was 79% of the frame and the preview sat at 6fps, which
 * looked like the lipstick never finished drawing: the mask was always chasing a face that had
 * already moved.
 *
 * Detection cannot be made cheaper from here, but it can be made to not block. The main thread
 * renders every frame against the most recent landmarks it has, and detections arrive when they
 * arrive. The tradeoff is real and worth stating: during fast head movement the makeup lags the
 * face by roughly one detection. A smooth preview that trails slightly beats a synced slideshow.
 */
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";

export type ToWorker =
  | { type: "init"; wasmBase: string; modelUrl: string }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number };

export type FromWorker =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "landmarks"; landmarks: NormalizedLandmark[] | null; cost: number };

const post = (message: FromWorker) => (self as unknown as Worker).postMessage(message);

let landmarker: FaceLandmarker | null = null;

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;

  if (message.type === "init") {
    try {
      const vision = await FilesetResolver.forVisionTasks(message.wasmBase);
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: message.modelUrl, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      post({ type: "ready" });
    } catch (err) {
      // Reported rather than thrown: the main thread keeps a working inline path to fall back to,
      // and a preview that runs slowly beats one that does not run.
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (message.type === "frame") {
    if (!landmarker) {
      message.bitmap.close();
      return;
    }
    try {
      const started = performance.now();
      const result = landmarker.detectForVideo(message.bitmap, message.timestamp);
      post({
        type: "landmarks",
        landmarks: result.faceLandmarks[0] ?? null,
        cost: performance.now() - started,
      });
    } catch (err) {
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      // Transferred in, so it is ours to release. Leaking these stalls the pipeline within seconds.
      message.bitmap.close();
    }
  }
};
