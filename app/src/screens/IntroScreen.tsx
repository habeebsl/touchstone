import MobileFrame from "../components/ui/MobileFrame";

interface IntroScreenProps {
  onStart: () => void;
  disabled?: boolean;
}

/** Screen 1. One headline, one button, nothing else — the typography carries the whole screen. */
export default function IntroScreen({ onStart, disabled = false }: IntroScreenProps) {
  return (
    <MobileFrame className="justify-between px-8 py-12">
      <div className="h-12 w-full" />

      <div className="mb-auto mt-12 flex flex-col gap-6 text-center">
        <h1 className="font-headline text-[2.25rem] font-medium leading-[1.1] tracking-tight text-balance text-foreground">
          A mirror that already knows what works on you.
        </h1>
        <p className="font-body px-2 text-base font-light leading-relaxed text-muted">
          Our technology measures your unique skin, hair, and eye tones to find your perfect match.
        </p>
      </div>

      <div className="w-full pb-8 pt-12">
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          className="font-label transition-interactive flex w-full items-center justify-center rounded-lg bg-primary px-6 py-4 text-base font-medium text-on-primary hover:bg-black active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disabled ? "Preparing camera…" : "Take a selfie"}
        </button>
      </div>
    </MobileFrame>
  );
}
