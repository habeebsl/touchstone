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
 * For foundation, where the correct answer is that nothing visibly changes: side by side, two
 * near-identical images read as a rendering failure, while a seam dragged across a continuous
 * face makes "no seam appears" legible as a result.
 *
 * A range input rather than pointer handlers, for keyboard, touch and a real role for free.
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

        {/* Clipped, not resized: a percentage width would slide her features sideways. */}
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
