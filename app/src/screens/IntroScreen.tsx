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
 * Samples sit below the camera, not beside it: a selfie is the product and these are the
 * demonstration. They ignore `disabled`, which tracks Camera Kit warming up, since the point of a
 * sample is that it needs no camera.
 */
export default function IntroScreen({ onStart, onSample, disabled = false }: IntroScreenProps) {
  return (
    <MobileFrame className="justify-between px-8 py-10">
      <div className="mb-auto mt-6 flex flex-col gap-5 text-center">
        <h1 className="font-headline text-[2.25rem] font-medium leading-[1.1] tracking-tight text-balance text-foreground">
          A mirror that already knows what works on you.
        </h1>
        <p className="font-body px-2 text-base font-light leading-relaxed text-muted">
          Our technology measures your unique skin, hair, and eye tones to find your perfect match.
        </p>
      </div>

      <div className="w-full pt-8">
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          className="font-label transition-interactive flex w-full items-center justify-center rounded-lg bg-primary px-6 py-4 text-base font-medium text-on-primary hover:bg-black active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disabled ? "Preparing camera…" : "Take a selfie"}
        </button>

        <div className="mt-6">
          {/* "Generated" carries the disclosure, in one word rather than a paragraph. */}
          <p className="font-label mb-3 text-center text-xs uppercase tracking-widest text-muted">
            Or try a generated face
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
        </div>
      </div>
    </MobileFrame>
  );
}
