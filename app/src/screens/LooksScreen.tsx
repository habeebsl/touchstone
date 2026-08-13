import type { ReactNode } from "react";
import Swatch from "../components/ui/Swatch";
import ColouringSummary from "../components/ColouringSummary";
import { TEMPLATE_COUNT, type FilledLook } from "../lib/colorEngine/template";
import type { ColourProfile } from "../lib/colorEngine/season";
import type { NormalisedColors } from "../lib/colorEngine/normalise";

const REGISTER_ORDER = { soft: 0, polished: 1, bold: 2 } as const;

export interface RenderedLook {
  look: FilledLook;
  /** Pre-signed URL from Makeup VTO. Expires in 2 hours — never treated as durable. */
  imageUrl: string;
}

interface LooksScreenProps {
  looks: RenderedLook[];
  /** What the analysis measured and derived, summarised above the looks. */
  colors: NormalisedColors;
  profile: ColourProfile;
  onSelect: (rendered: RenderedLook) => void;
  /** Discards this analysis and returns to the start. Costs 35 API units to redo — see below. */
  onStartOver: () => void;
  /** Fires when a render URL no longer loads — they are pre-signed and expire after 2 hours. */
  onImageExpired: () => void;
}

/**
 * No hex on the cards. Three swatches with their values came to roughly 440px against 370px of
 * card, and the hex is the part that does not earn its width here: this is a view she scans, and
 * the swatch already carries the colour. The values are on the look's own screen, where there is
 * room and where she is actually considering one shade.
 */
function SwatchPair({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Swatch color={color} size="md" />
      <span className="font-label text-xs uppercase tracking-widest text-muted">{label}</span>
    </div>
  );
}

/**
 * Screen 4. Mood labels only, one tap target per card, and deliberately no save/share/shopping
 * affordance — the renders are temporary by design and the product has no commerce surface.
 */
export default function LooksScreen({
  looks,
  colors,
  profile,
  onSelect,
  onStartOver,
  onImageExpired,
}: LooksScreenProps) {
  const boldest =
    [...looks].sort((a, b) => REGISTER_ORDER[b.look.register] - REGISTER_ORDER[a.look.register])[0];
  const lipPlacement = boldest?.look.placements.find((p) => p.role === "lip") ?? null;

  return (
    <MobileShell>
      <section className="mb-10 mt-12">
        <h1 className="font-headline mb-2 text-3xl font-medium tracking-tight text-foreground">
          {looks.length} looks, matched to you
        </h1>
        <p className="font-body text-base text-muted">
          Chosen from {TEMPLATE_COUNT} for your skin, eye and hair colour
        </p>
      </section>

      {/* The boldest look on show, because that is where the placement rule bites hardest — a
          soft register sits close to her own colouring either way, so it makes the weakest case
          for a decision that is real. */}
      <ColouringSummary colors={colors} profile={profile} placement={lipPlacement} />

      <div className="flex flex-col gap-10 pb-12">
        {looks.map((rendered) => (
          <button
            key={rendered.look.templateId}
            type="button"
            onClick={() => onSelect(rendered)}
            className="transition-interactive group w-full overflow-hidden rounded-lg border border-border bg-surface text-left hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* Aspect ratio reserved so the arriving render never shifts layout. */}
            <div className="relative aspect-[3/4] w-full bg-border">
              <img
                src={rendered.imageUrl}
                alt={`The ${rendered.look.label} look rendered on your photo`}
                className="h-full w-full object-cover"
                onError={onImageExpired}
              />
            </div>
            <div className="flex flex-col gap-6 p-6">
              <div>
                <h2 className="font-headline text-2xl font-medium text-foreground">{rendered.look.label}</h2>
                {/* Why this look, not just what it is called — the analysis is the product, so
                    hiding its reasoning would leave five arbitrary thumbnails. */}
                <p className="font-body mt-1 text-sm leading-relaxed text-muted">{rendered.look.why}</p>
              </div>
              {/* Three, not eight. Most of the palette is deliberately near-invisible — the brow
                  follows her hair, contour sits a shade under her skin — and showing all of it
                  would bury the shades she might actually go and buy. The rest is on the look's
                  own screen, where she is considering one look rather than scanning five. */}
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <SwatchPair label="Lip" color={rendered.look.lipColor} />
                <SwatchPair label="Blush" color={rendered.look.blushColor} />
                {rendered.look.palette.shadowAccent && (
                  <SwatchPair label="Eye" color={rendered.look.palette.shadowAccent} />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Placed after the looks, quiet, and named for its consequence — it is destructive and
          requires retaking the photo. Never the first thing a thumb finds. */}
      <div className="flex justify-center pb-12 pt-2">
        <button
          type="button"
          onClick={onStartOver}
          className="font-body transition-interactive rounded-sm px-4 py-3 text-sm text-muted underline underline-offset-4 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Start over with a new photo
        </button>
      </div>
    </MobileShell>
  );
}

/**
 * No back arrow. This is the destination of a linear flow, so a top-left arrow would be an
 * ambiguous, reflexively-tapped control whose only real meaning is "throw away a result that
 * cost 35 API units". The escape hatch lives below the looks instead, named for what it does.
 */
function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[420px] bg-background">
      <main className="px-6">{children}</main>
    </div>
  );
}
