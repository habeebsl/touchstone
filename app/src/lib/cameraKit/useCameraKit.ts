import { useEffect, useRef, useState } from "react";
import { loadCameraKitScript } from "./loadCameraKit";
import { normalizeCapturedImage } from "./normalizeCapturedImage";

interface UseCameraKitOptions {
  apiKey: string;
  secretKey?: string;
  onCapture: (file: File) => void;
}

interface UseCameraKitResult {
  ready: boolean;
  error: string | null;
  /** True while the SDK's UI should be on screen. Drives <CameraKitMount open={...} />. */
  isOpen: boolean;
  open: () => void;
}

// The SDK is a global singleton: init and event registration must happen exactly once per page,
// not once per component mount.
let initialised = false;

/**
 * Wraps the YouCam Camera Kit lifecycle.
 *
 * Behaviours the SDK requires that are easy to get wrong (all confirmed against the shipped
 * bundle — see /docs/youcam-api-notes.md):
 *  - A `<div id="YMK-module">` must exist before `openCameraKit()` runs, or it throws on a null
 *    container. It renders its UI *inline* into that div, so the div must be positioned as an
 *    overlay or it will push page content down.
 *  - Readiness is gated on `window.YMK` existing, not on `YMKAsyncInit`, which never fires.
 *  - Nothing closes the UI automatically after a capture; call `close()` explicitly.
 */
export function useCameraKit({ apiKey, secretKey, onCapture }: UseCameraKitOptions): UseCameraKitResult {
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  useEffect(() => {
    let cancelled = false;

    loadCameraKitScript()
      .then(() => {
        if (cancelled) return;

        if (!initialised) {
          initialised = true;
          window.YMK.init(secretKey ? { apiKey, secretKey } : { apiKey });

          window.YMK.addEventListener("faceDetectionCaptured", async (payload) => {
            // The SDK leaves its UI up after a capture. Dismiss it before handing the image
            // onward, so the next screen isn't rendered underneath a live camera.
            try {
              window.YMK.close();
            } catch {
              /* closing is best-effort; never block the capture on it */
            }
            setIsOpen(false);

            try {
              const file = await normalizeCapturedImage(payload);
              onCaptureRef.current(file);
            } catch (err) {
              console.error(err);
              setError(err instanceof Error ? err.message : String(err));
            }
          });

          // Covers the user dismissing the SDK themselves rather than capturing.
          window.YMK.addEventListener("closed", () => setIsOpen(false));
          window.YMK.addEventListener("closeClicked", () => setIsOpen(false));
        }

        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ready,
    error,
    isOpen,
    open: () => {
      // Set optimistically rather than waiting for the "opened" event: the container must
      // already be laid out when the SDK measures it, and "opened" fires after that point.
      setIsOpen(true);
      try {
        window.YMK.openCameraKit();
      } catch (err) {
        console.error(err);
        setIsOpen(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
  };
}
