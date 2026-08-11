// Loads the YouCam JS Camera Kit script tag exactly once, globally — not tied to any React
// component's lifecycle. Confirmed live (2026-08-11, see /docs/youcam-api-notes.md):
// - script src: https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js
// - requires a real DOM element with id="YMK-module" to exist before init/openCameraKit, or
//   openCameraKit() throws (it tries to read .style off a null container).
// - window.YMKAsyncInit is effectively vestigial: window.YMK becomes available on its own
//   shortly after the script loads, and YMKAsyncInit does NOT reliably fire (confirmed: it
//   never fired within 8s in a real test, even though window.YMK was already a defined object).
//   Readiness is gated on window.YMK existing, not on that callback.

const SDK_URL = "https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js";

declare global {
  interface Window {
    YMK: {
      init: (options: { apiKey: string; secretKey?: string }) => void;
      openCameraKit: () => void;
      /** Dismisses the SDK UI. Fires the "closed" event. */
      close: () => void;
      /** Events seen in the shipped bundle: loaded, opened, closed, closeClicked,
       *  cameraOpened, cameraClosed, cameraFailed, faceDetectionCaptured. */
      addEventListener: (event: string, handler: (payload: unknown) => void) => void;
      removeEventListener: (event: string) => void;
    };
    YMKAsyncInit?: () => void;
  }
}

const POLL_INTERVAL_MS = 50;
const POLL_TIMEOUT_MS = 15000;

let loadPromise: Promise<void> | null = null;

export function loadCameraKitScript(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    // Belt-and-suspenders: if some SDK build does call this, take it, but don't depend on it.
    window.YMKAsyncInit = () => settleResolve();

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      const start = Date.now();
      const poll = () => {
        if (typeof window.YMK !== "undefined") {
          settleResolve();
          return;
        }
        if (Date.now() - start > POLL_TIMEOUT_MS) {
          if (!settled) {
            settled = true;
            reject(new Error("window.YMK never became available after script load"));
          }
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      };
      poll();
    };
    script.onerror = () => {
      if (!settled) {
        settled = true;
        reject(new Error("Failed to load YouCam Camera Kit script"));
      }
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
