import MobileFrame from "../components/ui/MobileFrame";
import Swatch, { HexLabel } from "../components/ui/Swatch";
import type { ColourProfile } from "../lib/colorEngine/season";
import type { FacialColorTonesResult } from "../lib/youcam/types";

type MeasuredColors = FacialColorTonesResult["color"];

interface AnalysingScreenProps {
  /** Null until the Facial Color Tones task resolves (~1.5s). */
  colors: MeasuredColors | null;
  /** Null until Fitzpatrick lands and the seasonal profile can be derived (~2s). */
  profile: ColourProfile | null;
  /** Real fraction of completed work, 0-1. Never a fabricated timer. */
  progress: number;
  status: string;
}

interface RowProps {
  label: string;
  qualifier?: string;
  color: string;
  hex: string;
}

function MeasurementRow({ label, qualifier, color, hex }: RowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Swatch color={color} />
        <div className="flex flex-col">
          <span className="font-body text-base font-medium text-foreground">{label}</span>
          {qualifier && <span className="font-body text-xs text-muted">{qualifier}</span>}
        </div>
      </div>
      <HexLabel value={hex} className="text-muted" />
    </div>
  );
}

/** Resolved row when the hex is present, pending skeleton when it isn't. */
function Measurement({ label, hex, qualifier }: { label: string; hex?: string; qualifier?: string }) {
  if (!hex) return <PendingRow label={label} />;
  return <MeasurementRow label={label} qualifier={qualifier} color={hex} hex={hex.toUpperCase()} />;
}

function PendingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between opacity-60">
      <div className="flex items-center gap-6">
        <div className="animate-soft-pulse h-8 w-8 shrink-0 rounded-full border border-dashed border-muted" />
        <span className="animate-soft-pulse font-body text-base font-medium text-muted">{label}</span>
      </div>
      <div className="animate-soft-pulse h-3 w-16 rounded-sm bg-border" />
    </div>
  );
}

/**
 * Screen 3. No app bar: this is a transient state in a linear flow, with nothing to navigate to.
 * The generated design shipped a settings button and a Camera/Face/Palette tab bar; neither
 * exists in this product.
 */
export default function AnalysingScreen({ colors, profile, progress, status }: AnalysingScreenProps) {
  return (
    <MobileFrame className="px-8 py-12">
      <h1 className="font-headline mb-16 text-center text-2xl font-medium tracking-wide text-foreground">
        Reading your colouring
      </h1>

      <div
        className="flex-1 space-y-8"
        aria-live="polite"
        aria-busy={progress < 1}
      >
        {/* A field can legitimately be absent — hair covered, eyes obscured — so each row falls
            back to its pending state rather than throwing on an undefined hex. */}
        <Measurement label="Skin" hex={colors?.skin_color} />
        <Measurement label="Eyes" hex={colors?.eye_color} qualifier={colors?.eye_color_name} />
        <Measurement label="Hair" hex={colors?.hair_color} qualifier={colors?.hair_color_name} />

        {/* Derived rather than measured, and labelled as such — the API returns colours, the
            seasonal profile is our own analysis of them. */}
        <div className="space-y-8 pt-4">
          {profile && colors ? (
            <>
              <MeasurementRow
                label="Undertone"
                qualifier="Derived"
                color={colors.skin_color}
                hex={profile.undertone}
              />
              <MeasurementRow
                label="Season"
                qualifier="Derived"
                color={colors.hair_color ?? colors.skin_color}
                hex={profile.season}
              />
            </>
          ) : (
            <>
              <PendingRow label="Undertone" />
              <PendingRow label="Season" />
            </>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-col items-center pb-8 pt-12">
        <p className="font-body mb-4 text-sm tracking-wide text-muted">{status}</p>
        <div className="h-px w-full overflow-hidden bg-border">
          <div
            className="h-full bg-foreground transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </div>
      </div>
    </MobileFrame>
  );
}
