interface BackButtonProps {
  onClick: () => void;
  /** Live preview sits the control on top of video, so it needs its own surface. */
  onSurface?: boolean;
  label?: string;
}

/**
 * The designs used the Material Symbols icon font for a single glyph. DESIGN.md specifies
 * SVG icons (Heroicons/Lucide), so this is an inline Lucide `arrow-left` — same mark, no
 * webfont request, and it inherits currentColor.
 */
export default function BackButton({ onClick, onSurface = false, label = "Go back" }: BackButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={[
        "flex h-11 w-11 items-center justify-center text-foreground",
        "transition-interactive hover:opacity-80",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        onSurface ? "rounded-full border border-border/50 bg-surface/80 shadow-sm backdrop-blur-md" : "rounded-sm",
      ].join(" ")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
    </button>
  );
}
