// Stored analysis results, so engine work doesn't cost 30 units per iteration.
//
// A full run costs 33 units (Facial Color Tones 20 + Fitzpatrick 10 + 3x VTO 1). The analysis is
// 91% of that, and it returns the same answer for the same face every time — so replaying it is
// both cheap and lossless. Rendering can still be run for real at 1 unit per look.
//
// The first entry is a genuine captured response from the live API. The rest are plausible
// profiles spanning Fitzpatrick I-VI and both undertones, because an engine that claims to work
// across all skin tones has to actually be exercised across them.

import type { FitzpatrickScale } from "../youcam/types";
import { normaliseMeasured, type NormalisedColors } from "../colorEngine/normalise";

export interface AnalysisFixture {
  id: string;
  label: string;
  /** True only for data captured verbatim from the live API. */
  measured: boolean;
  colors: NormalisedColors;
  fitzpatrick: FitzpatrickScale;
}

export const ANALYSIS_FIXTURES: AnalysisFixture[] = [
  {
    id: "live-sample",
    label: "Live API sample (fair, auburn)",
    measured: true,
    colors: {
      skin_color: "#bc9d88",
      eye_color: "#342724",
      eye_color_name: "Brown",
      lip_color: "#be8782",
      eyebrow_color: "#805d47",
      hair_color: "#B56637",
      hair_color_name: "Auburn",
    },
    fitzpatrick: "I",
  },
  {
    id: "fair-cool-ash",
    label: "Very fair, cool, ash blonde",
    measured: false,
    colors: {
      skin_color: "#f0d8cc",
      eye_color: "#5b7fa6",
      eye_color_name: "Blue",
      lip_color: "#c98d8d",
      eyebrow_color: "#a08a76",
      hair_color: "#c9b393",
      hair_color_name: "Blonde",
    },
    fitzpatrick: "I",
  },
  {
    id: "light-cool-dark",
    label: "Light, cool, near-black hair",
    measured: false,
    colors: {
      skin_color: "#e5c4b0",
      eye_color: "#3a3a3f",
      eye_color_name: "Gray",
      lip_color: "#c07f80",
      eyebrow_color: "#2e2622",
      hair_color: "#1e1a18",
      hair_color_name: "Black",
    },
    fitzpatrick: "II",
  },
  {
    id: "medium-warm-brown",
    label: "Medium, warm, brown hair",
    measured: false,
    colors: {
      skin_color: "#c99a6e",
      eye_color: "#4a3520",
      eye_color_name: "Brown",
      lip_color: "#a86a5e",
      eyebrow_color: "#4a3524",
      hair_color: "#5c3a22",
      hair_color_name: "Brown",
    },
    fitzpatrick: "IV",
  },
  {
    id: "olive-green-eyes",
    label: "Olive, neutral, green eyes",
    measured: false,
    colors: {
      skin_color: "#b08d63",
      eye_color: "#5e7048",
      eye_color_name: "Green",
      lip_color: "#9c6558",
      eyebrow_color: "#3d2c1c",
      hair_color: "#3b2a1a",
      hair_color_name: "Brown",
    },
    fitzpatrick: "IV",
  },
  {
    id: "deep-warm",
    label: "Deep, warm, black hair",
    measured: false,
    colors: {
      skin_color: "#8a5a3b",
      eye_color: "#2b1d14",
      eye_color_name: "Brown",
      lip_color: "#7a4238",
      eyebrow_color: "#241813",
      hair_color: "#171110",
      hair_color_name: "Black",
    },
    fitzpatrick: "V",
  },
  {
    id: "deepest",
    label: "Deepest, black hair",
    measured: false,
    colors: {
      skin_color: "#4d2f21",
      eye_color: "#1f1512",
      eye_color_name: "Brown",
      lip_color: "#4a2620",
      eyebrow_color: "#150f0d",
      hair_color: "#100b0a",
      hair_color_name: "Black",
    },
    fitzpatrick: "VI",
  },
];

// --- Remembering a real analysis ------------------------------------------------------------

const LAST_ANALYSIS_KEY = "undertone.lastAnalysis.v1";

/**
 * Store a genuine analysis so later runs can replay it instead of paying for it again.
 *
 * localStorage rather than sessionStorage: this is a development convenience that should
 * survive reloads, new tabs and restarts. It is written on every real analysis and only ever
 * *read* when explicitly asked for via `?fixture=mine`, so the production path is untouched.
 */
export function rememberAnalysis(colors: AnalysisFixture["colors"], fitzpatrick: FitzpatrickScale): void {
  try {
    localStorage.setItem(LAST_ANALYSIS_KEY, JSON.stringify({ colors, fitzpatrick, at: Date.now() }));
  } catch {
    /* private mode or quota — remembering is a nicety */
  }
}

export function getRememberedAnalysis(): AnalysisFixture | null {
  try {
    const raw = localStorage.getItem(LAST_ANALYSIS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { colors: AnalysisFixture["colors"]; fitzpatrick: FitzpatrickScale };
    if (typeof parsed?.colors?.skin_color !== "string") return null;
    // Deserialised JSON is untrusted — an entry written by an older build can be missing fields.
    // Normalising on read means a stale cache heals itself instead of crashing the engine.
    return {
      id: "mine",
      label: "Your last real analysis",
      measured: true,
      colors: normaliseMeasured(parsed.colors).colors,
      fitzpatrick: parsed.fitzpatrick,
    };
  } catch {
    return null;
  }
}

/**
 * `?fixture=mine` replays your own last real analysis; `?fixture=<id>` replays a stock profile.
 *
 * Returning null means "call the real API". That is deliberate for `mine` with nothing cached:
 * silently substituting a stranger's colouring would be worse than spending the units, and the
 * result gets remembered so the next run is free.
 */
export function getFixture(id: string | null): AnalysisFixture | null {
  if (!id) return null;
  if (id === "mine") {
    const remembered = getRememberedAnalysis();
    if (!remembered) {
      console.warn("[undertone] ?fixture=mine but nothing cached yet — running a real analysis and remembering it.");
    }
    return remembered;
  }
  return ANALYSIS_FIXTURES.find((f) => f.id === id) ?? ANALYSIS_FIXTURES[0];
}
