import { useState } from "react";
import CameraCapture from "../components/CameraCapture";


export default function CameraCaptureSpike() {
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleCapture(file: File) {
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18 }}>Spike 4 (React) — Camera Kit inside the app shell</h1>
      <p style={{ opacity: 0.7, fontSize: 13, maxWidth: 600 }}>
        Same SDK as camera-kit-quickstart.html, now wired through React with a stable mount point
        and the script loaded once outside the component tree. Capture a photo — if it shows up
        below as a File, the faceDetectionCaptured → normalizeCapturedImage path works end to end.
      </p>

      <CameraCapture onCapture={handleCapture} />

      {capturedFile && (
        <div style={{ marginTop: 16 }}>
          <p>
            Captured: {capturedFile.name} — {capturedFile.type} — {(capturedFile.size / 1024).toFixed(1)} KB
          </p>
          {previewUrl && (
            <img src={previewUrl} alt="captured" style={{ maxWidth: 320, borderRadius: 8 }} />
          )}
        </div>
      )}
    </div>
  );
}
