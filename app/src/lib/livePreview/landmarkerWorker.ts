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
 *
 * ---
 *
 * This file must transpile to a plain script: no imports, no exports, not even type ones. It is a
 * classic worker, and a classic worker cannot run an `export {}` marker — which is what a file
 * gets when it exports anything at all, types included. Every type below is therefore referenced
 * through inline `import(...)` type syntax, which is erased outright, and the message shapes live
 * in landmarkerMessages.ts. Both mistakes were made in order: "Unexpected token 'export'" is what
 * the second one looks like.
 *
 * MediaPipe itself arrives through importScripts as the global `Vision`, from its IIFE build. It
 * has to be a classic worker because MediaPipe loads its wasm glue with importScripts, which a
 * module worker forbids — that failure surfaces as "ModuleFactory not set." on every delegate and
 * reads like a GPU problem when it is not. But Vite's dev server hands classic workers their
 * source with ESM imports still in it, so importing the library is not open either. The global is
 * the one form that works in both dev and a production build.
 */
declare const Vision: typeof import("@mediapipe/tasks-vision");

type FaceLandmarker = import("@mediapipe/tasks-vision").FaceLandmarker;
type ToWorker = import("./landmarkerMessages").ToWorker;
type FromWorker = import("./landmarkerMessages").FromWorker;

const post = (message: FromWorker) => (self as unknown as Worker).postMessage(message);

/**
 * Fail a step that hangs instead of waiting on it forever.
 *
 * Creating the GPU landmarker in a worker does not reject when the worker cannot get a WebGL2
 * context — it simply never settles. Awaited plainly, that swallowed the CPU attempt underneath
 * it and surfaced as a bare startup timeout with nothing to act on.
 */
function within<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} hung for ${ms / 1000}s`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const STEP_TIMEOUT = 8_000;

let landmarker: FaceLandmarker | null = null;

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;

  if (message.type === "init") {
    // Each step announces itself, so a startup that never finishes can still say where it stopped.
    // The first attempt at this reported a bare "timeout", which named nothing.
    let vision;
    try {
      post({ type: "stage", name: "script" });
      importScripts(`${message.wasmBase}/vision_bundle.js`);
      post({ type: "stage", name: "wasm" });
      vision = await within(
        Vision.FilesetResolver.forVisionTasks(message.wasmBase),
        STEP_TIMEOUT,
        "wasm",
      );
    } catch (err) {
      post({ type: "error", message: `wasm: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    // The GPU delegate needs a WebGL2 context inside the worker, which not every browser grants
    // even when the page itself has one. Falling straight back to inline on that would give up
    // the whole point of the worker: CPU inference off the render thread still leaves the frame
    // free, it just detects less often.
    const failures: string[] = [];
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        post({ type: "stage", name: delegate });
        landmarker = await within(
          Vision.FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: message.modelUrl, delegate },
            runningMode: "VIDEO",
            numFaces: 1,
          }),
          STEP_TIMEOUT,
          delegate,
        );
        post({ type: "ready", delegate });
        return;
      } catch (err) {
        failures.push(`${delegate}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Reported rather than thrown: the main thread keeps a working inline path, and a preview
    // that runs slowly beats one that does not run. Both reasons go back, since the GPU one is
    // usually the informative half.
    post({ type: "error", message: failures.join(" / ") });
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
