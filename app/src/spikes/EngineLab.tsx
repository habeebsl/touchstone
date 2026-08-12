import { useState } from "react";
import { ANALYSIS_FIXTURES } from "../lib/fixtures/analysisFixtures";
import { analyseColouring } from "../lib/colorEngine/season";
import { fillLooks } from "../lib/colorEngine/template";
import { hexToOklch } from "../lib/colorEngine/oklch";

/**
 * Colour-engine workbench. Renders what the engine produces for every stored profile with no
 * API calls at all, so tuning costs nothing. Reach it at ?spike=engine-lab.
 *
 * This is the only way to actually check the inclusivity claim: whether a look holds up from
 * Fitzpatrick I to VI is not something you can judge from one test face.
 */
export default function EngineLab() {
  const [showAll, setShowAll] = useState(true);

  return (
    <div className="min-h-dvh bg-background px-6 py-10 text-foreground">
      <h1 className="font-headline mb-1 text-3xl font-medium">Colour engine lab</h1>
      <p className="font-body mb-6 text-sm text-muted">
        {ANALYSIS_FIXTURES.length} profiles · 0 API units · every colour derived from measured input
      </p>

      <label className="font-body mb-8 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show full palette (not just lip and blush)
      </label>

      <div className="flex flex-col gap-12">
        {ANALYSIS_FIXTURES.map((fx) => {
          const profile = analyseColouring(fx.colors, fx.fitzpatrick);
          const looks = fillLooks(fx.colors, fx.fitzpatrick);

          return (
            <section key={fx.id} className="border-t border-border pt-6">
              <div className="mb-4 flex flex-wrap items-baseline gap-3">
                <h2 className="font-headline text-xl font-medium">{fx.label}</h2>
                {fx.measured && (
                  <span className="font-label rounded-sm bg-primary px-2 py-0.5 text-[10px] uppercase tracking-widest text-on-primary">
                    real API data
                  </span>
                )}
              </div>

              {/* Measured input */}
              <div className="mb-4 flex flex-wrap gap-4">
                <Chip label="skin" color={fx.colors.skin_color} />
                <Chip label={`eyes · ${fx.colors.eye_color_name}`} color={fx.colors.eye_color} />
                <Chip label={`hair · ${fx.colors.hair_color_name}`} color={fx.colors.hair_color} />
                <Chip label="lips" color={fx.colors.lip_color} />
                <span className="font-label self-center text-xs uppercase tracking-widest text-muted">
                  Fitzpatrick {fx.fitzpatrick}
                </span>
              </div>

              {/* Derived profile */}
              <div className="mb-5 rounded-lg border border-border bg-surface p-4">
                <p className="font-headline mb-2 text-lg">
                  {profile.season} · {profile.undertone}
                </p>
                <div className="font-label mb-3 flex gap-6 text-xs uppercase tracking-widest text-muted">
                  <span>warmth {profile.warmth.toFixed(2)}</span>
                  <span>depth {profile.depth.toFixed(2)}</span>
                  <span>contrast {profile.contrast.toFixed(2)}</span>
                </div>
                <ul className="font-body list-disc space-y-1 pl-5 text-xs text-muted">
                  {profile.rationale.map((r) => (
                    <li key={r.axis}>
                      {r.axis}: {r.value} — {r.evidence}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Generated looks */}
              <div className="grid gap-4 sm:grid-cols-3">
                {looks.map((look) => (
                  <div key={look.templateId} className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="font-headline mb-3 text-lg">{look.label}</h3>
                    <div className="flex flex-col gap-2">
                      {Object.entries(showAll ? look.palette : { lip: look.lipColor, blush: look.blushColor }).map(
                        ([role, hex]) => {
                          const { l, c } = hexToOklch(hex);
                          return (
                            <div key={role} className="flex items-center gap-3">
                              <span
                                className="h-7 w-7 shrink-0 rounded-full border border-black/10"
                                style={{ backgroundColor: hex }}
                              />
                              <span className="font-label w-28 text-[11px] uppercase tracking-widest text-muted">
                                {role}
                              </span>
                              <span className="font-label text-[11px] tabular-nums text-foreground">{hex}</span>
                              <span className="font-label text-[10px] tabular-nums text-muted">
                                L{l.toFixed(2)} C{c.toFixed(3)}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: color }} />
      <span className="font-label text-[11px] uppercase tracking-widest text-muted">{label}</span>
      <span className="font-label text-[11px] tabular-nums">{color}</span>
    </span>
  );
}
