import { useState } from "react";
import Swatch from "./ui/Swatch";
import { foundationGuide } from "../lib/colorEngine/foundation";
import { hexToOklch } from "../lib/colorEngine/oklch";
import type { Placement } from "../lib/colorEngine/palette";
import type { ColourProfile } from "../lib/colorEngine/season";
import type { NormalisedColors } from "../lib/colorEngine/normalise";

interface ColouringSummaryProps {
  colors: NormalisedColors;
  profile: ColourProfile;
  /**
   * Where the lip was placed against where the conventional rule would have put it. Absent for a
   * role that has no placement decision. It belongs here rather than on a look because it is a
   * fact about her skin — the same argument whichever look she is looking at.
   */
  placement?: Placement | null;
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
export default function ColouringSummary({ colors, profile, placement }: ColouringSummaryProps) {
  const [open, setOpen] = useState(false);
  const foundation = foundationGuide(profile, colors.skin_color);
  // Said plainly either way: on colouring the rule already suits, "nothing needed changing" is
  // the honest result and still evidence the check ran.
  const sameShade = placement ? placement.conventional === placement.adapted : false;
  const conventionalChroma = placement ? hexToOklch(placement.conventional).c : 0;

  return (
    <section className="mb-8 rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-4 px-5 py-4">
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

      {open && (
        <div className="flex flex-col divide-y divide-border border-t border-border">
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

          {/* The engine's own working, not a description of it: both hexes below come from
              pickColour, which computes the conventional placement alongside the one it uses.
              This is the section that carries the actual claim — the visibility guard downstream
              is a backstop, and on deep colouring it rarely has anything left to do. */}
          {placement && (
            <Block title="How your shades were placed">
              <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
                <Measured label="The usual rule" hex={placement.conventional} />
                <Measured label="Placed for your depth" hex={placement.adapted} />
              </div>
              <p className="font-body mt-3 text-sm leading-relaxed text-muted">
                {sameShade ? (
                  <>
                    Makeup colour is normally placed below your skin&rsquo;s own lightness. On your
                    colouring there is room for that, so both rules agree and nothing needed
                    changing — the adjustment only starts to matter on deeper skin, where there
                    isn&rsquo;t.
                  </>
                ) : (
                  <>
                    Makeup colour is normally placed below your skin&rsquo;s own lightness. On your
                    colouring there is little room below, and going there costs the colour itself —
                    the usual rule lands on{" "}
                    <span className="text-foreground">{placement.conventional}</span>, which is
                    close to {conventionalChroma < 0.02 ? "black" : "colourless"}. Your shades are
                    placed where the colour survives instead.
                  </>
                )}
              </p>
            </Block>
          )}

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
              We measure your colouring, not specific products — so this describes the shade to
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
    <div className="px-5 py-4">
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
