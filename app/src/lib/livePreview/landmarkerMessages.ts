/**
 * The messages passed between the render thread and the landmarker worker.
 *
 * These live here rather than in the worker itself for a mechanical reason: a file that exports
 * anything — including types — is transpiled with an `export {}` marker, and a classic worker
 * cannot run that. It fails with "Unexpected token 'export'" before a line of the worker executes.
 * See landmarkerWorker.ts for why the worker has to be classic.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type ToWorker =
  | { type: "init"; wasmBase: string; modelUrl: string }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number };

export type FromWorker =
  | { type: "ready"; delegate: "GPU" | "CPU" }
  /** How far startup got, so a worker that never finishes can still say where it stopped. */
  | { type: "stage"; name: string }
  | { type: "error"; message: string }
  | { type: "landmarks"; landmarks: NormalizedLandmark[] | null; cost: number };
