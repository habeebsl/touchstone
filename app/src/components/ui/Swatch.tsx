interface SwatchProps {
  color: string;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
} as const;

/**
 * A measured colour, shown as its true value.
 *
 * DESIGN.md: "Never tint, overlay or harmonise them; show the true measured value." The
 * generated designs put `shadow-sm` on some swatches — dropped here, because a shadow shifts
 * perceived colour and these exist precisely to be judged accurately. The hairline border is
 * kept: it delineates pale swatches against the white surface without touching the fill.
 */
export default function Swatch({ color, size = "md" }: SwatchProps) {
  return (
    <div
      aria-hidden="true"
      className={`${SIZES[size]} shrink-0 rounded-full border border-black/10`}
      style={{ backgroundColor: color }}
    />
  );
}

/** Hex values should read as measurements: tabular, letter-spaced, understated. */
export function HexLabel({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span
      className={`font-label text-sm uppercase tracking-[0.15em] tabular-nums ${className}`}
    >
      {value}
    </span>
  );
}
