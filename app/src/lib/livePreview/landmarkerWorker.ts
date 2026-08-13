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
  | { type: "ready"; delegate: "GPU" | "CPU" }
  | { type: "error"; message: string }
  | { type: "landmarks"; landmarks: NormalizedLandmark[] | null; cost: number };

const post = (message: FromWorker) => (self as unknown as Worker).postMessage(message);

let landmarker: FaceLandmarker | null = null;

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;

  if (message.type === "init") {
    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(message.wasmBase);
    } catch (err) {
      post({ type: "error", message: `wasm: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    // The GPU delegate needs a WebGL2 context inside the worker, which not every browser grants
    // even when the page itself has one. Falling straight back to inline on that would give up
    // the whole point of the worker: CPU inference off the render thread still leaves the frame
    // free, it just detects less often.
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: message.modelUrl, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        post({ type: "ready", delegate });
        return;
      } catch (err) {
        if (delegate === "CPU") {
          // Reported rather than thrown: the main thread keeps a working inline path, and a
          // preview that runs slowly beats one that does not run.
          post({ type: "error", message: `${delegate}: ${err instanceof Error ? err.message : String(err)}` });
        }
      }
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
