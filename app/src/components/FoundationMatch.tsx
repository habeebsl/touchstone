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
 * This was the only output in the product that was words alone. Foundation is deliberately never
 * rendered onto the looks, because done correctly it is invisible and done incorrectly on deep
 * skin it reads as skin-lightening, so it was left as "Rich depth, cool red undertone" and she was
 * asked to picture it. By the research foundation.ts cites, it is also the decision people find
 * hardest, which made the least legible thing on screen the highest-stakes one.
 *
 * Three shades rather than one, because a single swatch claims a precision the measurement has
 * not got: skin_color is an average off a photo of her face, and foundation is matched at the jaw.
 * A range is not a hedge here, it is the instruction, and it is what anyone does at a counter.
 *
 * The lighter shade is labelled by what going wrong looks like rather than offered as an option.
 * On deep skin a too-light render is a lightened photograph of her, and the difference between
 * teaching her to recognise that and quietly presenting it as a choice is entirely in the words
 * around it.
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

  return (
    <section className="mt-10 rounded-lg border border-border bg-surface px-5 py-4 md:px-8 md:py-7">
      <h2 className="font-label mb-3 text-xs uppercase tracking-widest text-muted">
        Finding your foundation
      </h2>

      <p className="font-body max-w-2xl text-sm leading-relaxed text-foreground">
        We put you at <span className="font-medium">{guide.depth.toLowerCase()}</span> depth with a{" "}
        <span className="font-medium">{guide.undertone.toLowerCase()}</span> undertone. These are
        the three shades around that reading worth testing, not one shade to buy.
      </p>
      <p className="font-body mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        A correct foundation disappears into your skin. Try each one and look for the one that
        stops being visible.
      </p>

      <ul className="mt-5 flex flex-col gap-5">
        {shades.map((shade) => {
          const rendered = renders[shade.id];
          return (
            <li key={shade.id} className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-3">
                <Swatch color={shade.hex} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-body text-sm font-medium text-foreground">{shade.label}</p>
                  <p className="font-body text-xs leading-relaxed text-muted">{shade.note}</p>
                </div>
                <HexLabel value={shade.hex.toUpperCase()} className="shrink-0 text-xs text-muted" />
              </div>

              {rendered && sourceUrl ? (
                <div className="max-w-sm">
                  <BeforeAfter
                    beforeUrl={sourceUrl}
                    afterUrl={rendered}
                    beforeLabel="Bare"
                    afterLabel={shade.label}
                    description={`Compare your bare skin with ${shade.label.toLowerCase()}, ${shade.hex}`}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onRender(shade.id, shade.hex)}
                  disabled={busyId !== null || !sourceUrl}
                  className="font-label transition-interactive w-fit rounded-lg border border-border px-4 py-2 text-xs uppercase tracking-widest text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === shade.id ? "Rendering…" : "Try this one"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* The limitation, stated as the instruction it implies. Next to one shade this would read
          as "here is your match, but do not trust it"; next to three it is just correct advice. */}
      <p className="font-body mt-5 max-w-2xl text-xs leading-relaxed text-muted">
        Screens are not colour-accurate, yours or ours, so treat these as where to start rather
        than what to buy. Test the shade on your jaw in daylight and pick whichever disappears.
      </p>
    </section>
  );
}
