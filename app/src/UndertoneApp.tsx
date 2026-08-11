import { useCallback, useMemo, useState } from "react";
import CameraKitMount from "./components/CameraKitMount";
import IntroScreen from "./screens/IntroScreen";
import AnalysingScreen from "./screens/AnalysingScreen";
import LooksScreen, { type RenderedLook } from "./screens/LooksScreen";
import LivePreviewScreen from "./screens/LivePreviewScreen";
import { useCameraKit } from "./lib/cameraKit/useCameraKit";
import { YouCamClient } from "./lib/youcam/client";
import { selectLooks } from "./lib/colorEngine/template";
import { analyseColouring, type ColourProfile } from "./lib/colorEngine/season";
import { normaliseMeasured } from "./lib/colorEngine/normalise";
import { getFixture, rememberAnalysis } from "./lib/fixtures/analysisFixtures";
import { clearSession, loadSession, saveSession } from "./lib/session/persistedSession";
import type { FacialColorTonesResult, FitzpatrickScale } from "./lib/youcam/types";

const API_KEY = import.meta.env.VITE_YOUCAM_API_KEY as string;
const SECRET_KEY = import.meta.env.VITE_YOUCAM_SECRET_KEY as string | undefined;

/**
 * `?fixture=<id>` replays a stored analysis instead of calling the analysis APIs.
 *
 * The analysis is 30 of the 33 units a full run costs, and returns the same answer for the same
 * face every time, so replaying it makes engine and template iteration nearly free. Rendering
 * still runs for real (1 unit per look) so what you see is genuinely what the API produces.
 * Pass `?fixture=list` names in analysisFixtures.ts; omit the param for the real flow.
 */
const FIXTURE = getFixture(new URLSearchParams(window.location.search).get("fixture"));

type Stage = "intro" | "analysing" | "looks" | "live";

/**
 * How many of the ten templates each person is shown.
 *
 * Every look is a separate render at 1 unit, so this is also the marginal cost of a run: 30 units
 * of analysis plus this many. Five is enough to feel like a wardrobe rather than a verdict,
 * while still fitting a scroll and a reasonable wait.
 */
const LOOKS_SHOWN = 5;

// Real units of work, used to drive the progress bar honestly: upload, colour tones,
// Fitzpatrick, and one per rendered look.
const TOTAL_STEPS = 3 + LOOKS_SHOWN;

export default function UndertoneApp() {
  // Restore a completed analysis if this tab reloaded — see lib/session/persistedSession.ts.
  const restored = useState(() => loadSession())[0];

  const [stage, setStage] = useState<Stage>(restored ? "looks" : "intro");
  const [colors, setColors] = useState<FacialColorTonesResult["color"] | null>(restored?.colors ?? null);
  const [profile, setProfile] = useState<ColourProfile | null>(restored?.profile ?? null);
  const [looks, setLooks] = useState<RenderedLook[]>(restored?.looks ?? []);
  const [selected, setSelected] = useState<RenderedLook | null>(null);
  const [stepsDone, setStepsDone] = useState(0);
  const [status, setStatus] = useState("Uploading your photo");
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => new YouCamClient({ apiKey: API_KEY }), []);

  const reset = useCallback(() => {
    clearSession();
    setStage("intro");
    setColors(null);
    setProfile(null);
    setLooks([]);
    setSelected(null);
    setStepsDone(0);
    setStatus("Uploading your photo");
    setError(null);
  }, []);

  const handleCapture = useCallback(
    async (file: File) => {
      setStage("analysing");
      setError(null);
      const advance = () => setStepsDone((n) => n + 1);

      try {
        const uploadedFileId = await client.uploadFile(file);
        advance();
        setStatus("Measuring your colouring");

        let raw: FacialColorTonesResult["color"];
        let fitzpatrick: FitzpatrickScale | null;

        if (FIXTURE) {
          // Replay a stored analysis: identical output for the same face, at 0 units instead of
          // 30. Rendering below still runs for real.
          raw = FIXTURE.colors;
          fitzpatrick = FIXTURE.fitzpatrick;
          advance();
          advance();
        } else {
          // Deliberately not Promise.all: each result is shown the moment it lands, so the
          // reveal reflects real resolution order rather than a staged animation.
          const tonesPromise = client
            .analyzeFacialColorTones({ src_file_id: uploadedFileId })
            .then((res) => {
              setColors(res.color);
              advance();
              return res;
            });

          const fitzPromise = client
            .analyzeFitzpatrickSkinType({ src_file_id: uploadedFileId, version: "1.0" })
            .then((res) => {
              advance();
              return res;
            });

          raw = (await tonesPromise).color;
          // Fitzpatrick drives the depth axis of the seasonal profile — it is paid for, so it
          // must be used. Tolerate its absence rather than failing the whole run.
          fitzpatrick = (await fitzPromise).fitzpatrick_scale ?? null;
        }

        // Single normalisation point, applied to every source. Replayed fixtures go through it
        // too: `?fixture=mine` deserialises from localStorage and can be missing fields written
        // by an older build, and a bypass here is what let a partial record reach the engine.
        const { colors: measured, inferred } = normaliseMeasured(raw);
        if (inferred.length) console.info("[undertone] inferred (not measured):", inferred.join(", "));
        setColors(measured);

        // Remember it so `?fixture=mine` can replay this exact analysis for free.
        if (!FIXTURE && fitzpatrick) rememberAnalysis(measured, fitzpatrick);

        const derived = analyseColouring(measured, fitzpatrick);
        setProfile(derived);

        setStatus("Rendering your looks");
        const filled = selectLooks(measured, fitzpatrick, LOOKS_SHOWN);

        const rendered = await Promise.all(
          filled.map(async (look) => {
            const result = await client.runMakeupVto({
              src_file_id: uploadedFileId,
              effects: look.effects,
              version: "1.0",
            });
            advance();
            return { look, imageUrl: result.url };
          }),
        );

        setLooks(rendered);
        setStage("looks");

        // Only a finished analysis is worth persisting: it cost 33 API units, and an in-flight
        // one has pending promises that could not be resumed anyway.
        saveSession({
          fileId: uploadedFileId,
          colors: measured,
          profile: derived,
          looks: rendered,
          selectedTemplateId: null,
        });
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client],
  );

  const camera = useCameraKit({ apiKey: API_KEY, secretKey: SECRET_KEY, onCapture: handleCapture });

  const fatal = error ?? (!API_KEY ? "VITE_YOUCAM_API_KEY is not set in .env.local" : null) ?? camera.error;

  return (
    <>
      {/* Never unmounted — the SDK owns these nodes. Overlaid while open so it cannot
          displace the screen underneath it. */}
      <CameraKitMount open={camera.isOpen} />

      {fatal ? (
        <ErrorState message={fatal} onRetry={reset} />
      ) : stage === "intro" ? (
        <IntroScreen onStart={camera.open} disabled={!camera.ready} />
      ) : stage === "analysing" ? (
        <AnalysingScreen
          colors={colors}
          profile={profile}
          progress={stepsDone / TOTAL_STEPS}
          status={status}
        />
      ) : stage === "looks" ? (
        <LooksScreen
          looks={looks}
          onStartOver={reset}
          onSelect={(rendered) => {
            setSelected(rendered);
            setStage("live");
          }}
          onImageExpired={() => {
            clearSession();
            setError("Your looks have expired. Renders are only kept for a couple of hours.");
          }}
        />
      ) : selected ? (
        <LivePreviewScreen rendered={selected} onBack={() => setStage("looks")} />
      ) : null}
    </>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-6 px-8">
      <h1 className="font-headline text-2xl font-medium text-foreground">Something went wrong</h1>
      <p className="font-body text-sm text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="font-label transition-interactive w-full rounded-lg bg-primary px-6 py-4 text-base font-medium text-on-primary hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Start over
      </button>
    </div>
  );
}
