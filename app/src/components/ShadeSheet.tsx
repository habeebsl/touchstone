import { useEffect, useRef } from "react";
import Swatch, { HexLabel } from "./ui/Swatch";
import type { FilledLook } from "../lib/colorEngine/template";

interface ShadeSheetProps {
  look: FilledLook;
  open: boolean;
  onClose: () => void;
}

/**
 * Every colour the render carries, in the order a face is made up. A look that omits a region is
 * skipped rather than listed empty — a look without eyeshadow should not claim one.
 */
const PALETTE_ROWS: Array<{ key: string; label: string; note: string }> = [
  { key: "lip", label: "Lip", note: "The shade itself" },
  { key: "lipLiner", label: "Lip liner", note: "A touch deeper than the lip, same hue" },
  { key: "blush", label: "Blush", note: "Placed to sit where your cheek catches light" },
  { key: "shadowAccent", label: "Eyeshadow", note: "Chosen against your eye colour" },
  { key: "shadowBase", label: "Eyeshadow base", note: "The wash underneath" },
  { key: "liner", label: "Liner", note: "Dark, but never crushed to black" },
  { key: "lash", label: "Lashes", note: "Liner, darker and drained of colour" },
  { key: "brow", label: "Brow", note: "Follows your measured hair colour" },
  { key: "contour", label: "Contour", note: "A shade under your skin" },
  { key: "highlight", label: "Highlight", note: "A shade above it" },
];

/**
 * The full palette, on demand.
 *
 * A sheet rather than a screen: ten shades with their values is reference material, not a step
 * in the flow, and it keeps the values off the cards, where three swatches and their hexes
 * already overflowed.
 *
 * Opened from a look card. It used to be reachable only from behind the live camera view, which
 * has since been removed — so the shades were the one place the engine's choices were legible and
 * they sat behind the weakest thing in the product.
 */
export default function ShadeSheet({ look, open, onClose }: ShadeSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes it. On a phone this is the back-gesture's job, but the app is just as likely to
  // be opened on a laptop by a judge.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the sheet so keyboard and screen-reader users land inside it.
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Dimmed, not opaque: the look stays visible behind it, which is the point of comparing. */}
      <button
        type="button"
        aria-label="Close shades"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Every shade in the ${look.label} look`}
        tabIndex={-1}
        className="relative flex max-h-[80dvh] w-full max-w-[420px] flex-col rounded-t-2xl bg-background focus:outline-none"
      >
        <header className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div>
            <h2 className="font-headline text-2xl font-medium tracking-tight text-foreground">
              {look.label}
            </h2>
            <p className="font-body mt-1 text-sm text-muted">Every shade in this look</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-label transition-interactive shrink-0 rounded-sm px-2 py-1 text-xs uppercase tracking-widest text-muted underline underline-offset-4 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Close
          </button>
        </header>

        <ul className="flex-1 overflow-y-auto px-6 pb-2">
          {PALETTE_ROWS.map(({ key, label, note }) =>
            look.palette[key] ? (
              <li key={key} className="flex items-center gap-4 border-t border-border py-3 first:border-t-0">
                <Swatch color={look.palette[key]} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-body text-sm font-medium text-foreground">{label}</p>
                  <p className="font-body text-xs leading-relaxed text-muted">{note}</p>
                </div>
                <HexLabel value={look.palette[key].toUpperCase()} className="shrink-0 text-muted" />
              </li>
            ) : null,
          )}
        </ul>

        <p className="font-body border-t border-border px-6 py-4 text-xs leading-relaxed text-muted">
          These are shades matched to your colouring, not products. Take the values to a counter
          or a search box rather than expecting an exact bottle.
        </p>
      </div>
    </div>
  );
}
