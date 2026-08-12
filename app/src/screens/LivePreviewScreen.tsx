import { useState } from "react";
import BackButton from "../components/ui/BackButton";
import LivePreview from "../components/LivePreview";
import Swatch from "../components/ui/Swatch";
import type { RenderedLook } from "./LooksScreen";

/**
 * Every colour the render carries, in the order a face is made up. Anything a template omits is
 * skipped rather than shown empty — a look without eyeshadow should not list one.
 */
const PALETTE_ROWS: Array<{ key: string; label: string }> = [
  { key: "lip", label: "Lip" },
  { key: "lipLiner", label: "Lip liner" },
  { key: "blush", label: "Blush" },
  { key: "shadowAccent", label: "Eyeshadow" },
  { key: "liner", label: "Liner" },
  { key: "lash", label: "Lashes" },
  { key: "brow", label: "Brow" },
  { key: "contour", label: "Contour" },
  { key: "highlight", label: "Highlight" },
];

interface LivePreviewScreenProps {
  rendered: RenderedLook;
  onBack: () => void;
}

/**
 * Screen 5. The live layer renders lip colour and blush only — it cannot do eyeshadow, liner,
 * lashes or brows. Rather than hide that, the full static render stays on screen as a reference
 * thumbnail and the caption says plainly what the live view covers.
 */
export default function LivePreviewScreen({ rendered, onBack }: LivePreviewScreenProps) {
  const [status, setStatus] = useState("Starting camera…");
  const { look, imageUrl } = rendered;
  const isLive = status === "Live";

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-black">
      {/* Camera feed */}
      <div className="absolute inset-0 z-0">
        <LivePreview
          lipColor={look.lipColor}
          blushColor={look.blushColor}
          onStatusChange={setStatus}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Overlay chrome */}
      <div className="pointer-events-none absolute inset-0 z-10 mx-auto flex max-w-[420px] flex-col justify-between">
        <header className="pointer-events-auto flex h-16 w-full items-center justify-start px-6">
          <BackButton onClick={onBack} onSurface label="Back to your looks" />
        </header>

        {!isLive && (
          <p className="font-body pointer-events-none self-center rounded-lg bg-surface/85 px-4 py-2 text-sm text-foreground backdrop-blur-md">
            {status}
          </p>
        )}

        <div className="pointer-events-auto w-full bg-gradient-to-t from-background via-background/90 to-transparent px-6 pb-8 pt-12">
          <div className="flex items-end justify-between gap-6">
            <div className="flex-1">
              <h1 className="font-headline mb-4 text-4xl font-medium tracking-tight text-foreground">
                {look.label}
              </h1>
              {/* The whole palette, here rather than on the cards: she is considering one look
                  now, not scanning five, so the shades she would have to buy are worth the room.
                  Named by region, since a column of hex codes is a debug view. */}
              <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
                {PALETTE_ROWS.map(({ key, label }) =>
                  look.palette[key] ? (
                    <li key={key} className="flex items-center gap-2">
                      <Swatch color={look.palette[key]} size="sm" />
                      <span className="font-body text-xs text-muted">{label}</span>
                    </li>
                  ) : null,
                )}
              </ul>
              <p className="font-body text-sm text-muted">Live preview shows lip and blush</p>
            </div>

            {/* The full look, kept present so it doesn't appear to vanish. */}
            <div className="flex flex-col items-center gap-2">
              <div className="h-28 w-20 overflow-hidden rounded-lg border border-border bg-surface">
                <img
                  src={imageUrl}
                  alt={`The full ${look.label} look, including eye makeup`}
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="font-label text-xs uppercase tracking-wider text-muted">Full look</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
