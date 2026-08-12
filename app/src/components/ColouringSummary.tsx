import { useState } from "react";
import Swatch from "./ui/Swatch";
import { foundationGuide } from "../lib/colorEngine/foundation";
import type { ColourProfile } from "../lib/colorEngine/season";
import type { NormalisedColors } from "../lib/colorEngine/normalise";
import type { FitzpatrickScale } from "../lib/youcam/types";

interface ColouringSummaryProps {
  colors: NormalisedColors;
  profile: ColourProfile;
  fitzpatrick: FitzpatrickScale | null;
}

/**
 * What we worked out about her, sitting above the looks.
 *
 * Without this the analysis is invisible: five rendered faces and no evidence there is anything
 * behind them. The rationale is already computed for every axis and was being discarded.
 *
 * Collapsed to one line by default. The looks are the payoff and this must not delay them — but
 * "Why?" is there for the one person in ten who wants to know, and its presence is itself the
 * signal that an answer exists.
 */
export default function ColouringSummary({ colors, profile, fitzpatrick }: ColouringSummaryProps) {
  const [open, setOpen] = useState(false);
  const foundation = foundationGuide(profile, colors.skin_color, fitzpatrick);

  return (
    <section className="mb-8 rounded-lg border border-border bg-surface px-5 py-4">
      <div className="flex items-center gap-4">
        <Swatch color={colors.skin_color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-body text-base font-medium text-foreground">
            {foundation.depth} · {profile.undertone} undertone · {profile.season}
          </p>
          <p className="font-body mt-0.5 text-sm text-muted">
            Foundation: {foundation.depth.toLowerCase()}, {foundation.undertone.toLowerCase()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="font-label transition-interactive shrink-0 rounded-sm px-2 py-1 text-xs uppercase tracking-widest text-muted underline underline-offset-4 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {open ? "Close" : "Why?"}
        </button>
      </div>

      {open && (
        <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5">
          {/* The measurements, shown as the colours they are rather than as numbers. */}
          <div className="flex gap-6">
            <Measured label="Skin" hex={colors.skin_color} />
            <Measured label="Eyes" hex={colors.eye_color} />
            <Measured label="Hair" hex={colors.hair_color} />
          </div>

          {/* The reasoning, one line per axis, straight from the engine. */}
          <ul className="flex flex-col gap-2">
            {profile.rationale.map((line) => (
              <li key={line} className="font-body text-sm leading-relaxed text-muted">
                {line}
              </li>
            ))}
          </ul>

          <p className="font-body text-sm leading-relaxed text-foreground">{foundation.advice}</p>

          {/* Said plainly, because the alternative is her assuming we checked a product against
              her skin. We did not, and cannot. */}
          <p className="font-body text-xs leading-relaxed text-muted">
            We measure your colouring, not specific products — so this describes the shade to look
            for rather than naming one.
          </p>
        </div>
      )}
    </section>
  );
}

function Measured({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex items-center gap-2">
      <Swatch color={hex} size="sm" />
      <span className="font-body text-xs text-muted">{label}</span>
    </div>
  );
}
