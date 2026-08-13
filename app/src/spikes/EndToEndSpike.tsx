import { useState } from "react";
import CameraCapture from "../components/CameraCapture";
import LivePreview from "../components/LivePreview";
import { YouCamClient } from "../lib/youcam/client";
import { fillLooks, type FilledLook } from "../lib/colorEngine/template";
import { normaliseMeasured } from "../lib/colorEngine/normalise";
import type { FacialColorTonesResult, FitzpatrickResult } from "../lib/youcam/types";

const API_KEY = import.meta.env.VITE_YOUCAM_API_KEY as string;
const SECRET_KEY = import.meta.env.VITE_YOUCAM_SECRET_KEY as string | undefined;

type Stage =
  | { name: "capture" }
  | { name: "uploading" }
  | { name: "analyzing" }
  | { name: "rendering"; look: FilledLook }
  | {
      name: "done";
      look: FilledLook;
      renderedUrl: string;
      colors: FacialColorTonesResult["color"];
      fitzpatrick: FitzpatrickResult;
    }
  | { name: "live"; look: FilledLook; colors: FacialColorTonesResult["color"] }
  | { name: "error"; message: string };

// Prebuild-validation.md item 5, the last blocking spike: wire every piece built so far into one
// unhardcoded-except-the-template pass. Camera Kit capture -> Facial Color Tones + Fitzpatrick ->
// one template filled by the color engine -> Makeup VTO -> render on screen -> tap -> live preview.
export default function EndToEndSpike() {
  const [stage, setStage] = useState<Stage>({ name: "capture" });

  async function handleCapture(file: File) {
    if (!API_KEY) {
      setStage({ name: "error", message: "VITE_YOUCAM_API_KEY is not set in .env.local" });
      return;
    }
    const client = new YouCamClient({ apiKey: API_KEY });

    try {
      setStage({ name: "uploading" });
      const fileId = await client.uploadFile(file);

      setStage({ name: "analyzing" });
      const [colorTones, fitzpatrick] = await Promise.all([
        client.analyzeFacialColorTones({ src_file_id: fileId }),
        client.analyzeFitzpatrickSkinType({ src_file_id: fileId, version: "1.0" }),
      ]);

      // This spike validates one look end to end; the real flow renders all three.
      const look = fillLooks(normaliseMeasured(colorTones.color).colors, fitzpatrick.fitzpatrick_scale ?? null)[0];
      setStage({ name: "rendering", look });

      const result = await client.runMakeupVto({
        src_file_id: fileId,
        effects: look.effects,
        version: "1.0",
      });

      setStage({
        name: "done",
        look,
        renderedUrl: result.url,
        colors: colorTones.color,
        fitzpatrick,
      });
    } catch (err) {
      console.error(err);
      setStage({ name: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18 }}>Spike 5 — Full hardcoded end-to-end pass</h1>
      <p style={{ opacity: 0.7, fontSize: 13, maxWidth: 600 }}>
        Capture → Facial Color Tones + Fitzpatrick → one hardcoded template ("Soft") filled with
        your extracted colors → Makeup VTO render → tap to see it live.
      </p>

      {stage.name === "capture" && (
        <CameraCapture apiKey={API_KEY} secretKey={SECRET_KEY} onCapture={handleCapture} />
      )}

      {stage.name === "uploading" && <p>Uploading photo…</p>}
      {stage.name === "analyzing" && <p>Analyzing skin tone, eye color, hair color, Fitzpatrick type…</p>}
      {stage.name === "rendering" && (
        <div>
          <p>Rendering "{stage.look.label}" look…</p>
          <LookSwatches look={stage.look} />
        </div>
      )}

      {stage.name === "done" && (
        <div>
          <LookSwatches look={stage.look} />
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            Detected: skin {stage.colors.skin_color}, eye {stage.colors.eye_color_name} (
            {stage.colors.eye_color}), hair {stage.colors.hair_color_name} ({stage.colors.hair_color}),
            Fitzpatrick {stage.fitzpatrick.fitzpatrick_scale ?? "?"}
          </p>
          <img
            src={stage.renderedUrl}
            alt={`${stage.look.label} look`}
            style={{ maxWidth: 400, borderRadius: 8, display: "block", marginTop: 8 }}
          />
          <button style={{ marginTop: 12 }} onClick={() => setStage({ name: "live", look: stage.look, colors: stage.colors })}>
            See it live
          </button>
        </div>
      )}

      {stage.name === "live" && (
        <div>
          <LookSwatches look={stage.look} />
          <LivePreview
            lipColor={stage.look.lipColor}
            blushColor={stage.look.blushColor}
            lipLinerColor={stage.look.palette.lipLiner}
            finish={stage.look.finish}
            lipIntensity={stage.look.lipIntensity}
            blushIntensity={stage.look.blushIntensity}
            skinColor={stage.colors.skin_color ?? "#c69c7b"}
            lipBaseColor={stage.colors.lip_color ?? stage.colors.skin_color ?? "#b9776f"}
          />
        </div>
      )}

      {stage.name === "error" && (
        <p style={{ color: "salmon" }}>Error: {stage.message}</p>
      )}
    </div>
  );
}

function LookSwatches({ look }: { look: FilledLook }) {
  const swatch = (color: string, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16 }}>
      <span style={{ width: 16, height: 16, borderRadius: "50%", background: color, display: "inline-block", border: "1px solid #555" }} />
      {label}: {color}
    </span>
  );
  return (
    <p style={{ fontSize: 12 }}>
      {swatch(look.lipColor, "lip")}
      {swatch(look.blushColor, "blush")}
    </p>
  );
}
