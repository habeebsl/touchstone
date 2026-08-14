import { useRef, useState } from "react";
import MobileFrame from "../components/ui/MobileFrame";
import Swatch from "../components/ui/Swatch";
import type { GarmentSwatch } from "../lib/garment/palette";
import { SAMPLE_OUTFITS, type SampleOutfit } from "../lib/samples/sampleSubjects";

interface OutfitScreenProps {
  /** Uploads, cuts out the background and reads the colours. Costs 2 units. */
  onPhoto: (file: File) => Promise<void>;
  /** The same, for a garment we ship. Fetched by the app so one error path covers both. */
  onSampleOutfit: (outfit: SampleOutfit) => void;
  /** Null until a photo has been read. Empty array means nothing usable was found. */
  swatches: GarmentSwatch[] | null;
  /** Local preview of her photo, shown while the colours are being read. */
  previewUrl: string | null;
  busy: boolean;
  error: string | null;
  /** Continue with the ticked colours, or with none of them. */
  onContinue: (keep: GarmentSwatch[]) => void;
  onSkip: () => void;
}

/**
 * Screen 3.5 — optional. "What are you wearing?"
 *
 * Sits between the analysis and the looks because the outfit changes which looks are worth
 * rendering, and rendering is the expensive part. It matches the real order of events too: the
 * outfit is chosen first, then the face is done, then the dress goes on last.
 *
 * Skipping is a first-class option, not a failure path. Plenty of people are not dressing for
 * anything in particular, and the colour analysis stands on its own without an outfit.
 */
export default function OutfitScreen({
  onPhoto,
  onSampleOutfit,
  swatches,
  previewUrl,
  busy,
  error,
  onContinue,
  onSkip,
}: OutfitScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Everything we found starts ticked: the common case is that we got it right, and that case
  // should cost zero taps. Unticking is a correction, not a selection.
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  const kept = (swatches ?? []).filter((s) => !dropped.has(s.hex));

  const toggle = (hex: string) =>
    setDropped((current) => {
      const next = new Set(current);
      if (next.has(hex)) next.delete(hex);
      else next.add(hex);
      return next;
    });

  return (
    <MobileFrame className="px-8 py-12">
      <section className="mb-10">
        <h1 className="font-headline mb-2 text-3xl font-medium tracking-tight text-foreground">
          What are you wearing?
        </h1>
        <p className="font-body text-base leading-relaxed text-muted">
          Optional. If you know what you're putting on, the looks will be built around it.
        </p>
      </section>

      {previewUrl && (
        <div className="mb-8 overflow-hidden rounded-lg border border-border bg-surface">
          <img src={previewUrl} alt="The outfit you photographed" className="max-h-64 w-full object-contain" />
        </div>
      )}

      {swatches === null ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="font-label transition-interactive w-full rounded-lg bg-primary px-6 py-4 text-base font-medium text-on-primary hover:bg-black active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Reading the colours…" : "Photograph your outfit"}
          </button>
          {/* `capture` is deliberately absent: on a phone this offers both the camera and the
              gallery, and a photo of a dress on a hanger is as valid as one of her wearing it. */}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset so choosing the same file twice still fires a change event.
              event.target.value = "";
              if (file) void onPhoto(file);
            }}
          />

          {/* Same reasoning as the intro screen's sample faces: the demonstration sits under the
              real thing rather than beside it. Here it earns its place twice over, because an
              outfit photo is the one input a judge is least likely to have to hand. */}
          <div className="mt-4">
            <p className="font-label mb-3 text-center text-xs uppercase tracking-widest text-muted">
              Or pick one of these
            </p>
            <ul className="grid grid-cols-3 gap-3">
              {SAMPLE_OUTFITS.map((outfit) => (
                <li key={outfit.id}>
                  <button
                    type="button"
                    disabled={busy}
                    title={outfit.note}
                    onClick={() => onSampleOutfit(outfit)}
                    className="transition-interactive group flex w-full flex-col gap-2 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <img
                      src={outfit.thumb}
                      alt={`${outfit.label} dress`}
                      width={320}
                      height={320}
                      className="aspect-square w-full rounded-lg border border-border object-cover transition-opacity group-hover:opacity-80"
                    />
                    <span className="font-body text-center text-xs leading-tight text-muted">
                      {outfit.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : swatches.length === 0 ? (
        <p className="font-body text-base text-muted">
          We couldn't read any colours from that photo. You can try another one, or carry on
          without it.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="font-body text-sm text-muted">
            Untick anything that isn't part of the outfit.
          </p>

          <ul className="flex flex-col gap-3">
            {swatches.map((swatch) => {
              const on = !dropped.has(swatch.hex);
              return (
                <li key={swatch.hex}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(swatch.hex)}
                    className={`transition-interactive flex w-full items-center gap-4 rounded-lg border px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      on ? "border-foreground bg-surface" : "border-border opacity-50"
                    }`}
                  >
                    <Swatch color={swatch.hex} size="lg" />
                    <span className="font-body flex-1 text-sm text-foreground">
                      {describe(swatch)}
                    </span>
                    <span className="font-label text-xs tracking-widest text-muted">
                      {Math.round(swatch.share * 100)}%
                    </span>
                    <span aria-hidden="true" className="font-label text-sm text-foreground">
                      {on ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => onContinue(kept)}
            disabled={kept.length === 0}
            className="font-label transition-interactive w-full rounded-lg bg-primary px-6 py-4 text-base font-medium text-on-primary hover:bg-black active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {kept.length === 0 ? "Untick fewer colours to continue" : "Build my looks around this"}
          </button>
        </div>
      )}

      {error && <p className="font-body mt-6 text-sm text-destructive">{error}</p>}

      <div className="mt-auto flex justify-center pb-4 pt-12">
        <button
          type="button"
          onClick={onSkip}
          className="font-body transition-interactive rounded-sm px-4 py-3 text-sm text-muted underline underline-offset-4 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Skip and show me what suits me
        </button>
      </div>
    </MobileFrame>
  );
}

/**
 * Name a colour roughly, so the row means something without her having to decode a hex. Rough is
 * the point: this is a label for a swatch she can already see, not a claim about the shade.
 */
function describe(swatch: GarmentSwatch): string {
  if (swatch.chroma < 0.035) {
    if (swatch.lightness > 0.85) return "Off-white";
    if (swatch.lightness > 0.6) return "Light neutral";
    if (swatch.lightness > 0.35) return "Grey";
    return "Black";
  }
  const hue = swatch.hue;
  const name =
    hue < 25 || hue >= 350 ? "Red" :
    hue < 55 ? "Orange" :
    hue < 100 ? "Yellow" :
    hue < 165 ? "Green" :
    hue < 230 ? "Teal" :
    hue < 290 ? "Blue" :
    hue < 330 ? "Purple" : "Pink";
  const depth = swatch.lightness > 0.72 ? "Light " : swatch.lightness < 0.4 ? "Deep " : "";
  return `${depth}${name}`;
}
