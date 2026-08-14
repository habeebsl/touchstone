import Swatch, { HexLabel } from "./ui/Swatch";
import { nameShade, nameShadeTitle } from "../lib/colorEngine/shadeName";
import type { FilledLook } from "../lib/colorEngine/template";

interface PlacementProofProps {
  look: FilledLook;
  /** The look as rendered, adaptation and all. Already paid for during the main render pass. */
  adaptedUrl: string;
  /** The same look with the depth adaptation off, once she asks for it. One extra API unit. */
  conventionalUrl: string | null;
  busy: boolean;
  onRender: () => void;
}

/**
 * The engine's one real claim, shown rather than asserted.
 *
 * Makeup colour is conventionally placed below the skin's own lightness. That is a fair-skin
 * assumption: there is room below fair skin and almost none below deep skin, where what room
 * exists is the region sRGB cannot hold a saturated colour in at all. So the rule does not
 * produce a deeper shade there, it produces something close to black.
 *
 * Both hexes come from the engine rather than being described beside it — the same look derived
 * twice with that one rule switched off, accent and both visibility guards included, so the only
 * difference between them is the placement decision. On the deepest fixture the conventional
 * pipeline lands on #22030c *after* the guard has tried to rescue it, which is the more honest
 * number than the raw placement and a stronger one: the backstop cannot fix this.
 *
 * The rendered comparison is deliberately on request. It costs an API unit, a real user does not
 * want the bad version of her own face shown to her unprompted, and the whole section is absent
 * on colouring where the rule never fires — which is most of it. A section that only ever
 * appeared for deep skin would read as a special case; one that reports honestly either way reads
 * as the rule it is.
 */
export default function PlacementProof({
  look,
  adaptedUrl,
  conventionalUrl,
  busy,
  onRender,
}: PlacementProofProps) {
  const differs = look.conventionalLip !== look.lipColor;

  return (
    // Label beside content once there is room, so the text can stop short of the right edge as a
    // gap rather than as a paragraph that ran out.
    <section className="mt-10 rounded-lg border border-border bg-surface px-5 py-4 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 md:px-8 md:py-7">
      {/* Full width would put these lines past 180 characters, twice a comfortable read. */}
      <h2 className="font-label mb-3 text-xs uppercase tracking-widest text-muted md:mb-0">
        How your shades were placed
      </h2>

      <div className="max-w-2xl">
        {differs ? (
          <>
            <p className="font-body text-sm leading-relaxed text-foreground">
              Makeup colour is normally placed below your skin&rsquo;s own lightness. On your
              colouring there is little room below, and going there costs the colour itself.
            </p>

            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
              <Placed label="Placed the usual way" hex={look.conventionalLip} />
              <Placed label="Placed for your depth" hex={look.lipColor} />
            </div>

            <p className="font-body mt-4 text-sm leading-relaxed text-muted">
              Both are the {look.label} lip, derived the same way: same palette, same look, same
              visibility checks. The only difference is that rule.
            </p>

            {conventionalUrl ? (
              // Capped: this is a footnote to the looks, not the payoff.
              <div className="mt-5 grid max-w-xl grid-cols-2 gap-3">
                <Rendered label="The usual way" src={conventionalUrl} hex={look.conventionalLip} />
                <Rendered label="Yours" src={adaptedUrl} hex={look.lipColor} />
              </div>
            ) : (
              <button
                type="button"
                onClick={onRender}
                disabled={busy}
                className="font-label transition-interactive mt-5 rounded-lg border border-border px-4 py-2 text-xs uppercase tracking-widest text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
              >
                {busy ? "Rendering…" : "Show me both on my face"}
              </button>
            )}
          </>
        ) : (
          <p className="font-body text-sm leading-relaxed text-muted">
            Makeup colour is normally placed below your skin&rsquo;s own lightness. On your
            colouring there is room for that, so it needed no adjusting. The shades below are where
            both rules agree. It starts to matter on deeper skin, where there isn&rsquo;t room and
            the usual rule runs the colour toward black.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The name carries this, not the hex: on the deepest colouring it reads "black" against "vivid
 * raspberry", which is the argument in two words. The hex stays because this is a section about a
 * measurement.
 */
function Placed({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex items-center gap-3">
      <Swatch color={hex} size="lg" />
      <div className="min-w-0">
        <p className="font-label text-xs uppercase tracking-widest text-muted">{label}</p>
        <p className="font-body text-sm font-medium text-foreground">{nameShadeTitle(hex)}</p>
        <HexLabel value={hex} className="text-xs text-muted" />
      </div>
    </div>
  );
}

function Rendered({ label, src, hex }: { label: string; src: string; hex: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <img
        src={src}
        // Named, not hexed: a screen reader cannot picture "the lip at #050403".
        alt={`The same look with a ${nameShade(hex)} lip`}
        className="w-full rounded-lg border border-border bg-background object-cover"
      />
      <figcaption className="font-label text-xs uppercase tracking-widest text-muted">
        {label}
      </figcaption>
    </figure>
  );
}
