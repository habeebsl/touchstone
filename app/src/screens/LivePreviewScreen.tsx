import { useState } from "react";
import BackButton from "../components/ui/BackButton";
import LivePreview from "../components/LivePreview";
import ShadeSheet from "../components/ShadeSheet";
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
  const [shadesOpen, setShadesOpen] = useState(false);
  const { look, imageUrl } = rendered;
  const isLive = status === "Live";
  const shadeCount = Object.keys(look.palette).length;

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
              {/* One control instead of the palette. The shades are reference, and reference over
                  a live camera competes with the thing she is actually looking at. */}
              <button
                type="button"
                onClick={() => setShadesOpen(true)}
                className="font-label transition-interactive mb-3 rounded-lg border border-border px-4 py-2 text-xs uppercase tracking-widest text-foreground hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Shades ({shadeCount})
              </button>
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

      <ShadeSheet look={look} open={shadesOpen} onClose={() => setShadesOpen(false)} />
    </div>
  );
}
