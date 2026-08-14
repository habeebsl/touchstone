import MobileFrame from "../components/ui/MobileFrame";
import { SAMPLE_SUBJECTS, type SampleSubject } from "../lib/samples/sampleSubjects";

interface IntroScreenProps {
  onStart: () => void;
  onSample: (subject: SampleSubject) => void;
  disabled?: boolean;
}

/**
 * Screen 1. One headline, one button, and a way in for anyone who will not use the camera.
 *
 * The samples sit below the camera rather than beside it. A selfie is the product and the samples
 * are the demonstration, so making them equal would say the app is a gallery of strangers. Kept
 * visible rather than behind a link because the people most likely to want them, judges and
 * anyone on a desktop, are also the least likely to go hunting.
 *
 * They do not depend on `disabled`: that flag tracks Camera Kit warming up, and the whole point
 * of a sample is that it needs no camera at all.
 */
export default function IntroScreen({ onStart, onSample, disabled = false }: IntroScreenProps) {
  return (
    <MobileFrame className="justify-between px-8 py-12">
      <div className="h-6 w-full" />

      <div className="mb-auto mt-10 flex flex-col gap-6 text-center">
        <h1 className="font-headline text-[2.25rem] font-medium leading-[1.1] tracking-tight text-balance text-foreground">
          A mirror that already knows what works on you.
        </h1>
        <p className="font-body px-2 text-base font-light leading-relaxed text-muted">
          Our technology measures your unique skin, hair, and eye tones to find your perfect match.
        </p>
      </div>

      <div className="w-full pb-4 pt-10">
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          className="font-label transition-interactive flex w-full items-center justify-center rounded-lg bg-primary px-6 py-4 text-base font-medium text-on-primary hover:bg-black active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disabled ? "Preparing camera…" : "Take a selfie"}
        </button>

        <div className="mt-8">
          <p className="font-label mb-3 text-center text-xs uppercase tracking-widest text-muted">
            Or try someone else's colouring
          </p>
          <ul className="grid grid-cols-3 gap-3">
            {SAMPLE_SUBJECTS.map((subject) => (
              <li key={subject.id}>
                <button
                  type="button"
                  onClick={() => onSample(subject)}
                  title={subject.note}
                  className="transition-interactive group flex w-full flex-col gap-2 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <img
                    src={subject.thumb}
                    alt={`${subject.label} colouring`}
                    width={320}
                    height={428}
                    className="aspect-[3/4] w-full rounded-lg border border-border object-cover transition-opacity group-hover:opacity-80"
                  />
                  <span className="font-body text-center text-xs leading-tight text-muted">
                    {subject.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Said here rather than in the write-up alone. Anyone who assumes these are customers
              has been misled by us, and the honest version costs one line. */}
          <p className="font-body mt-3 text-center text-xs leading-relaxed text-muted">
            Generated faces, chosen to span skin depth. Everything measured from them is real.
          </p>
        </div>
      </div>
    </MobileFrame>
  );
}
