import { useState } from "react";
import BackButton from "../components/ui/BackButton";
import LivePreview from "../components/LivePreview";
import Swatch, { HexLabel } from "../components/ui/Swatch";
import type { RenderedLook } from "./LooksScreen";

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
              <div className="mb-3 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Swatch color={look.lipColor} size="sm" />
                  <HexLabel value={look.lipColor.toUpperCase()} className="text-xs text-muted" />
                </div>
                <div className="flex items-center gap-2">
                  <Swatch color={look.blushColor} size="sm" />
                  <HexLabel value={look.blushColor.toUpperCase()} className="text-xs text-muted" />
                </div>
              </div>
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
