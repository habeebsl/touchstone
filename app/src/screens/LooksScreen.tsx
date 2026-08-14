import { useState, type ReactNode } from "react";
import Swatch from "../components/ui/Swatch";
import ColouringSummary from "../components/ColouringSummary";
import ShadeSheet from "../components/ShadeSheet";
import PlacementProof from "../components/PlacementProof";
import { TEMPLATE_COUNT, type FilledLook } from "../lib/colorEngine/template";
import { nameShadeTitle } from "../lib/colorEngine/shadeName";
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
  /** Discards this analysis and returns to the start. Costs 35 API units to redo — see below. */
  onStartOver: () => void;
  /** Fires when a render URL no longer loads — they are pre-signed and expire after 2 hours. */
  onImageExpired: () => void;
  /** Renders the boldest look again with the depth adaptation off. Costs one API unit. */
  onCompare: (look: FilledLook) => void;
  comparisonUrl: string | null;
  comparing: boolean;
}

/**
 * No hex on the cards. Three swatches with their values came to roughly 440px against 370px of
 * card, and the hex is the part that does not earn its width here: this is a view she scans, and
 * the swatch already carries the colour. The values are on the look's own screen, where there is
 * room and where she is actually considering one shade.
 *
 * The name does earn it, and it is the reason these became rows rather than a wrapped line. A
 * horizontal row of three left about 90px each, which holds "LIP" and nothing else; a hex is a
 * measurement she cannot repeat to anyone, so without the name the swatch was the only part of
 * this she could act on, and only while looking at it.
 */
function SwatchCell({ label, color }: { label: string; color: string }) {
  const name = nameShadeTitle(color);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Swatch color={color} size="md" />
      <span className="font-label text-[0.65rem] uppercase tracking-widest text-muted">{label}</span>
      {/* `title` because a long name truncates here. The sheet behind the card carries all ten
          shades in full, so this is a preview rather than the record. */}
      <span title={name} className="font-body min-w-0 truncate text-sm text-foreground">
        {name}
      </span>
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
  onStartOver,
  onImageExpired,
  onCompare,
  comparisonUrl,
  comparing,
}: LooksScreenProps) {
  // Tapping a look opens its shades. It used to open the live camera view, which has been
  // removed: a half-working AR filter was the weakest thing in the product and invited comparison
  // with the sponsor's own shipped app. The shades were reachable only from behind it.
  const [shades, setShades] = useState<RenderedLook | null>(null);
  const boldest =
    [...looks].sort((a, b) => REGISTER_ORDER[b.look.register] - REGISTER_ORDER[a.look.register])[0];

  return (
    <Shell>
      <section className="mb-10 mt-12 md:mt-16">
        <h1 className="font-headline mb-2 text-3xl font-medium tracking-tight text-foreground md:text-4xl">
          {looks.length} looks, matched to you
        </h1>
        <p className="font-body text-base text-muted">
          Chosen from {TEMPLATE_COUNT} for your skin, eye and hair colour
        </p>
      </section>

      <ColouringSummary colors={colors} profile={profile} />

      {/* A grid, not a column, once there is room. Five looks exist to be compared and a phone can
          only ever show one at a time; on a laptop that became five screens of scrolling with no
          two ever side by side. `items-start` so a card with no eyeshadow swatch keeps its own
          height instead of being stretched to match its row. */}
      <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
        {looks.map((rendered) => (
          <button
            key={rendered.look.templateId}
            type="button"
            onClick={() => setShades(rendered)}
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
              {/* Columns, not rows. Stacked, the three shades cost about 130px of a card that is
                  already tall from a 3:4 render; side by side the swatches share one line and it
                  is about 75px. Equal columns rather than auto so the three cells line up across
                  every card in the grid, whether or not a look wears eyeshadow. */}
              <div className="grid grid-cols-3 gap-x-3">
                <SwatchCell label="Lip" color={rendered.look.lipColor} />
                <SwatchCell label="Blush" color={rendered.look.blushColor} />
                {rendered.look.palette.shadowAccent && (
                  <SwatchCell label="Eye" color={rendered.look.palette.shadowAccent} />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Below the looks, not above them. It is evidence, and evidence reads better after the
          thing it is evidence for: it names a look ("both are the Glazed lip"), which only
          resolves once that look has been seen, and putting a technical exhibit — two rendered
          faces — in front of the payoff delayed exactly what ColouringSummary collapses itself to
          avoid delaying.

          The boldest look on show, because that is where the placement rule bites hardest: a soft
          register sits close to her own colouring under either rule and makes the weakest case for
          a decision that is real. */}
      {boldest && (
        <PlacementProof
          look={boldest.look}
          adaptedUrl={boldest.imageUrl}
          conventionalUrl={comparisonUrl}
          busy={comparing}
          onRender={() => onCompare(boldest.look)}
        />
      )}

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


      {shades && <ShadeSheet look={shades.look} open onClose={() => setShades(null)} />}
    </Shell>
  );
}

/**
 * No back arrow. This is the destination of a linear flow, so a top-left arrow would be an
 * ambiguous, reflexively-tapped control whose only real meaning is "throw away a result that
 * cost 35 API units". The escape hatch lives below the looks instead, named for what it does.
 *
 * This is the one screen that widens. The steps before it ask for a single thing at a time and a
 * wide column would only put more distance between the question and its answer, but this screen
 * is five renders meant to be compared, and comparison is exactly what a phone column cannot do.
 * On a laptop the looks were five screens of scrolling with no two ever visible together.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[420px] bg-background md:max-w-3xl lg:max-w-6xl">
      <main className="px-6 md:px-8">{children}</main>
    </div>
  );
}
