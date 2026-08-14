import { useState } from "react";
import Swatch from "./ui/Swatch";
import { foundationGuide } from "../lib/colorEngine/foundation";
import type { ColourProfile } from "../lib/colorEngine/season";
import type { NormalisedColors } from "../lib/colorEngine/normalise";

interface ColouringSummaryProps {
  colors: NormalisedColors;
  profile: ColourProfile;
}

/**
 * What we worked out about her, sitting above the looks.
 *
 * Without this the analysis is invisible: five rendered faces and no evidence there is anything
 * behind them. The findings are already computed for every axis and were being discarded.
 *
 * Collapsed to one line by default. The looks are the payoff and this must not delay them — but
 * "Why?" is there for whoever wants it, and its presence is itself the signal that an answer
 * exists.
 */
export default function ColouringSummary({ colors, profile }: ColouringSummaryProps) {
  const [open, setOpen] = useState(false);
  const foundation = foundationGuide(profile, colors.skin_color);

  return (
    <section className="mb-8 rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-4 px-5 py-4 md:px-8 md:py-5">
        <Swatch color={colors.skin_color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-body text-base font-medium text-foreground">
            {profile.undertone} undertone · {profile.season}
          </p>
          <p className="font-body mt-0.5 text-sm text-muted">
            Foundation: {foundation.depth.toLowerCase()} depth, {foundation.undertone.toLowerCase()} undertone
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

      {/* Stacked on a phone, three columns once there is room. The dividers turn with them, so the
          three kinds of claim stay visibly separate either way rather than running together into
          one wide block of text. */}
      {open && (
        <div className="flex flex-col divide-y divide-border border-t border-border md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
          {/* Measured, derived and prescriptive are three different kinds of claim, so they get
              three sections rather than one run of sentences. Anything we did not measure should
              never be able to pass for something we did. */}
          <Block title="What we measured">
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <Measured label="Skin" hex={colors.skin_color} />
              <Measured label="Eyes" hex={colors.eye_color} />
              <Measured label="Hair" hex={colors.hair_color} />
            </div>
            {profile.fitzpatrick && (
              <p className="font-body mt-3 text-sm text-muted">
                Fitzpatrick type {profile.fitzpatrick}
              </p>
            )}
          </Block>

          <Block title="What that tells us">
            <dl className="flex flex-col gap-3">
              {profile.rationale.map((finding) => (
                <div key={finding.axis} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline gap-2">
                    <dt className="font-label text-xs uppercase tracking-widest text-muted">
                      {finding.axis}
                    </dt>
                    <dd className="font-body text-sm font-medium text-foreground">{finding.value}</dd>
                  </div>
                  <p className="font-body text-sm leading-relaxed text-muted">{finding.evidence}</p>
                </div>
              ))}
            </dl>
          </Block>

          <Block title="Foundation">
            <p className="font-body text-sm text-foreground">
              <span className="font-medium">{foundation.depth}</span> depth,{" "}
              <span className="font-medium">{foundation.undertone}</span> undertone
            </p>
            <p className="font-body mt-1 text-sm leading-relaxed text-muted">{foundation.depthMeaning}</p>
            <p className="font-body mt-3 text-sm leading-relaxed text-foreground">{foundation.advice}</p>
            {/* Said plainly, because the alternative is her assuming we checked a product against
                her skin. We did not, and cannot. */}
            <p className="font-body mt-3 text-xs leading-relaxed text-muted">
              We measure your colouring, not specific products, so this describes the shade to
              look for rather than naming one.
            </p>
          </Block>
        </div>
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // Less generous than the header above: these are three columns inside the panel, not the
    // panel itself, so they have their own edges to sit inside already.
    <div className="px-5 py-4 md:px-6 md:py-5">
      <h3 className="font-label mb-3 text-xs uppercase tracking-widest text-muted">{title}</h3>
      {children}
    </div>
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
