import CameraKitMount from "./CameraKitMount";
import { useCameraKit } from "../lib/cameraKit/useCameraKit";

interface CameraCaptureProps {
  apiKey: string;
  secretKey?: string;
  onCapture: (file: File) => void;
}

/**
 * Self-contained capture control used by the prebuild-validation spikes. The real app drives the
 * same `useCameraKit` hook directly, because there the "open camera" action belongs to the intro
 * screen's own button rather than to a component that owns both button and mount point.
 */
export default function CameraCapture({ apiKey, secretKey, onCapture }: CameraCaptureProps) {
  const { ready, error, isOpen, open } = useCameraKit({ apiKey, secretKey, onCapture });

  return (
    <div>
      {!ready && !error && <p>Loading camera…</p>}
      {error && <p style={{ color: "salmon" }}>Camera Kit error: {error}</p>}

      <button type="button" disabled={!ready} onClick={open}>
        Open Camera
      </button>

      <CameraKitMount open={isOpen} />
    </div>
  );
}
