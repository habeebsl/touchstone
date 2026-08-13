import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Prebuild-validation spike #1: does client-side blend-mode compositing look like real
// lipstick, not a flat color overlay? See /undertone-prebuild-validation.md item 1.
//
// Outer lip contour, MediaPipe 468-point face mesh topology (same indices as FaceMesh).
// Closed loop tracing the outer boundary of both lips + mouth corners.
const OUTER_LIPS = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61,
];

const WASM_BASE = "/mediapipe";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type BlendMode = "multiply" | "soft-light";

export default function LipBlendSpike() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const colorCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState("Loading model...");
  const [lipColor, setLipColor] = useState("#b5273f");
  const [blendMode, setBlendMode] = useState<BlendMode>("multiply");
  const [intensity, setIntensity] = useState(0.75);
  const [feather, setFeather] = useState(4);

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

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
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
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        maskCanvasRef.current.width = video.videoWidth;
        maskCanvasRef.current.height = video.videoHeight;
        colorCanvasRef.current.width = video.videoWidth;
        colorCanvasRef.current.height = video.videoHeight;
      }

      const result = landmarker.detectForVideo(video, performance.now());
      const ctx = canvas.getContext("2d")!;
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const landmarks = result.faceLandmarks[0];
      if (landmarks) {
        renderLipOverlay(canvas, landmarks);
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    }

    function renderLipOverlay(
      canvas: HTMLCanvasElement,
      landmarks: { x: number; y: number }[],
    ) {
      const w = canvas.width;
      const h = canvas.height;

      // 1. Feathered alpha mask of the outer lip polygon.
      const maskCanvas = maskCanvasRef.current;
      const maskCtx = maskCanvas.getContext("2d")!;
      maskCtx.clearRect(0, 0, w, h);
      maskCtx.filter = feather > 0 ? `blur(${feather}px)` : "none";
      maskCtx.fillStyle = "white";
      maskCtx.beginPath();
      OUTER_LIPS.forEach((idx, i) => {
        const p = landmarks[idx];
        const x = p.x * w;
        const y = p.y * h;
        if (i === 0) maskCtx.moveTo(x, y);
        else maskCtx.lineTo(x, y);
      });
      maskCtx.closePath();
      maskCtx.fill();
      maskCtx.filter = "none";

      // 2. Solid color layer, clipped to the mask via destination-in (keeps feathered alpha).
      const colorCanvas = colorCanvasRef.current;
      const colorCtx = colorCanvas.getContext("2d")!;
      colorCtx.clearRect(0, 0, w, h);
      colorCtx.fillStyle = lipColor;
      colorCtx.fillRect(0, 0, w, h);
      colorCtx.globalCompositeOperation = "destination-in";
      colorCtx.drawImage(maskCanvas, 0, 0);
      colorCtx.globalCompositeOperation = "source-over";

      // 3. Composite onto the video frame with a blend mode so underlying shading/highlights
      // show through, instead of flat paint.
      const ctx = canvas.getContext("2d")!;
      ctx.save();
      ctx.globalAlpha = intensity;
      ctx.globalCompositeOperation = blendMode;
      ctx.drawImage(colorCanvas, 0, 0);
      ctx.restore();
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
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18 }}>Spike 1 — Live lip blend-mode rendering</h1>
      <p style={{ opacity: 0.7, fontSize: 13 }}>{status}</p>

      <div style={{ position: "relative", width: 640, maxWidth: "100%" }}>
        <video ref={videoRef} style={{ display: "none" }} playsInline muted />
        <canvas ref={canvasRef} style={{ width: "100%", borderRadius: 8, transform: "scaleX(-1)" }} />
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
        <label>
          Color{" "}
          <input type="color" value={lipColor} onChange={(e) => setLipColor(e.target.value)} />
        </label>
        <label>
          Blend mode{" "}
          <select value={blendMode} onChange={(e) => setBlendMode(e.target.value as BlendMode)}>
            <option value="multiply">multiply</option>
            <option value="soft-light">soft-light</option>
          </select>
        </label>
        <label>
          Intensity{" "}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
          />{" "}
          {intensity.toFixed(2)}
        </label>
        <label>
          Feather (px){" "}
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={feather}
            onChange={(e) => setFeather(Number(e.target.value))}
          />{" "}
          {feather}
        </label>
      </div>

      <p style={{ opacity: 0.6, fontSize: 12, marginTop: 16, maxWidth: 640 }}>
        Pass condition (prebuild-validation.md item 1): looks like lipstick, not paint — natural
        lip shading/highlights visible through the color, no hard-cut edges, holds up as you move
        and talk. Try multiply vs soft-light and tune feather/intensity to judge.
      </p>
    </div>
  );
}
