import { useState, type ReactNode } from "react";
import Swatch from "../components/ui/Swatch";
import ColouringSummary from "../components/ColouringSummary";
import ShadeSheet from "../components/ShadeSheet";
import PlacementProof from "../components/PlacementProof";
import FoundationMatch from "../components/FoundationMatch";
import { foundationGuide } from "../lib/colorEngine/foundation";
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
  /** Her own photo, for the foundation comparison's bare side. */
  sourceUrl: string | null;
  foundationRenders: Record<string, string>;
  foundationBusy: string | null;
  onRenderFoundation: (shadeId: string, hex: string) => void;
}

/**
 * Name, no hex. This is a view she scans and the swatch already carries the colour, so the hex
 * does not earn its width here; the sheet holds the values. The name does earn it: a hex is not
 * something she can repeat to anyone.
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
  sourceUrl,
  foundationRenders,
  foundationBusy,
  onRenderFoundation,
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

      {/* A grid once there is room: five looks exist to be compared, and a column showed one at a
          time. `items-start` so a card with no eyeshadow keeps its own height. */}
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
              {/* Three, not eight: most of the palette is deliberately near-invisible, and showing
                  all of it would bury the shades she might go and buy. Columns rather than rows
                  saves ~55px on a card already tall from a 3:4 render; equal widths so the cells
                  line up across every card whether or not a look wears eyeshadow. */}
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

      {/* After the proof: that section argues the engine is right, this is her acting on it. */}
      <FoundationMatch
        skinHex={colors.skin_color}
        guide={foundationGuide(profile, colors.skin_color)}
        sourceUrl={sourceUrl}
        renders={foundationRenders}
        busyId={foundationBusy}
        onRender={onRenderFoundation}
      />

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
 * No back arrow: this is the destination of a linear flow, so its only real meaning would be
 * "throw away a result that cost 35 API units". The escape hatch sits below the looks, named for
 * what it does.
 *
 * The one screen that widens. The steps before it ask one thing at a time; this one is five
 * renders meant to be compared.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[420px] bg-background md:max-w-3xl lg:max-w-6xl">
      <main className="px-6 md:px-8">{children}</main>
    </div>
  );
}
