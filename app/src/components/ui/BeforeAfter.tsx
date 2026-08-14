import { useState } from "react";

interface BeforeAfterProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  /** Described to a screen reader, which cannot use the slider at all. */
  description: string;
}

/**
 * Two images, one wiped across the other.
 *
 * Built for foundation specifically, where the correct answer is that nothing visibly changes. A
 * side-by-side pair cannot show that: two near-identical images read as a rendering failure or as
 * two copies of the same photo. Dragging a seam across a continuous face is the one presentation
 * where "no seam appears" is legible as a result, so the invisibility that made foundation hard to
 * show becomes the thing being shown.
 *
 * The control is a range input rather than pointer handlers on a div. It gets keyboard support,
 * touch, and a real accessibility role for free, and the hand-rolled version of this is a
 * well-known source of dropped pointer capture on mobile.
 */
export default function BeforeAfter({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  description,
}: BeforeAfterProps) {
  const [position, setPosition] = useState(50);

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative aspect-[3/4] w-full select-none overflow-hidden rounded-lg border border-border bg-border">
        <img src={beforeUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />

        {/* Clipped rather than resized, so both faces stay registered against each other. Scaling
            the top image to a percentage width would slide her features sideways as it moves. */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img src={afterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_4px_rgba(0,0,0,0.4)]"
          style={{ left: `${position}%` }}
        />

        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label={description}
          className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0 focus:outline-none focus-visible:opacity-10"
        />

        <span className="font-label pointer-events-none absolute left-2 top-2 rounded-sm bg-black/55 px-2 py-1 text-[0.65rem] uppercase tracking-widest text-white">
          {beforeLabel}
        </span>
        <span className="font-label pointer-events-none absolute right-2 top-2 rounded-sm bg-black/55 px-2 py-1 text-[0.65rem] uppercase tracking-widest text-white">
          {afterLabel}
        </span>
      </div>
      <figcaption className="font-body text-xs leading-relaxed text-muted">
        Drag to compare.
      </figcaption>
    </figure>
  );
}
