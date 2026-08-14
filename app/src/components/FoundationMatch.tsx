import { useState } from "react";
import Swatch, { HexLabel } from "./ui/Swatch";
import BeforeAfter from "./ui/BeforeAfter";
import { foundationShades } from "../lib/colorEngine/foundationShades";
import type { FoundationGuide } from "../lib/colorEngine/foundation";

interface FoundationMatchProps {
  skinHex: string;
  guide: FoundationGuide;
  /** Her own photo, for the "before" side. Absent after a reload, since it is an object URL. */
  sourceUrl: string | null;
  /** Rendered foundation by shade id, filled in as she asks for them. One API unit each. */
  renders: Record<string, string>;
  busyId: string | null;
  onRender: (shadeId: string, hex: string) => void;
}

/**
 * The foundation guidance, with something to look at.
 *
 * Foundation is never rendered onto the looks (see foundation.ts), which left this as words alone
 * for the decision people find hardest. Shades are labelled by what going wrong looks like rather
 * than offered as options: on deep skin a too-light render is a lightened photograph of her, and
 * only the words around it separate teaching from quietly presenting that as a choice.
 */
export default function FoundationMatch({
  skinHex,
  guide,
  sourceUrl,
  renders,
  busyId,
  onRender,
}: FoundationMatchProps) {
  const shades = foundationShades(skinHex);
  // Her own measurement first; the other two exist to be compared against it.
  const [selectedId, setSelectedId] = useState("match");
  const selected = shades.find((s) => s.id === selectedId) ?? shades[1];
  const selectedRender = renders[selected.id];

  return (
    <section className="mt-10 rounded-lg border border-border bg-surface px-5 py-4 md:px-8 md:py-7">
      <h2 className="font-label mb-3 text-xs uppercase tracking-widest text-muted">
        Finding your foundation
      </h2>

      <p className="font-body max-w-2xl text-sm leading-relaxed text-foreground">
        We put you at <span className="font-medium">{guide.depth.toLowerCase()}</span> depth with a{" "}
        <span className="font-medium">{guide.undertone.toLowerCase()}</span> undertone. These are
        three shades around that reading, and all three hold that same undertone. Only the depth
        moves.
      </p>
      {/* Undertone held fixed is the instruction, not an implementation detail. */}
      <p className="font-body mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        A correct foundation disappears into your skin, so try each and look for the one that stops
        being visible. Shade codes do not carry between brands, so ask for a depth and an undertone
        rather than a number you saw somewhere else.
      </p>

      {/* One at a time: a wipe can only be dragged one at a time, so three at once was ~1500px of
          stacked faces for two comparisons nobody was looking at. Rendered shades are kept. */}
      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Foundation shades to try">
        {shades.map((shade) => {
          const on = shade.id === selected.id;
          return (
            <button
              key={shade.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSelectedId(shade.id)}
              className={`transition-interactive flex items-center gap-2 rounded-lg border px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                on ? "border-foreground bg-background" : "border-border hover:bg-background"
              }`}
            >
              <Swatch color={shade.hex} size="sm" />
              <span className="font-body text-xs text-foreground">{shade.label}</span>
              {renders[shade.id] && (
                <span aria-hidden="true" className="font-label text-xs text-muted">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm leading-relaxed text-muted">{selected.note}</p>
          </div>
          <HexLabel value={selected.hex.toUpperCase()} className="shrink-0 text-xs text-muted" />
        </div>

        {selectedRender && sourceUrl ? (
          <div className="max-w-sm">
            <BeforeAfter
              beforeUrl={sourceUrl}
              afterUrl={selectedRender}
              beforeLabel="Bare"
              afterLabel={selected.label}
              description={`Compare your bare skin with ${selected.label.toLowerCase()}, ${selected.hex}`}
            />
          </div>
        ) : sourceUrl ? (
          <button
            type="button"
            onClick={() => onRender(selected.id, selected.hex)}
            disabled={busyId !== null}
            className="font-label transition-interactive w-fit rounded-lg border border-border px-4 py-2 text-xs uppercase tracking-widest text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyId === selected.id ? "Rendering…" : "Try this one on my face"}
          </button>
        ) : (
          // Rather than a button that greys out for a reason nobody can see.
          <p className="font-body text-xs leading-relaxed text-muted">
            We no longer have your original photo to compare against. Start over to try shades on
            your own face; the shades above are still yours.
          </p>
        )}
      </div>

      {/* The limitation as the instruction it implies. */}
      <p className="font-body mt-5 max-w-2xl text-xs leading-relaxed text-muted">
        Screens are not colour-accurate, yours or ours, so treat these as where to start rather
        than what to buy. Test the shade on your jaw in daylight and pick whichever disappears.
      </p>
    </section>
  );
}
