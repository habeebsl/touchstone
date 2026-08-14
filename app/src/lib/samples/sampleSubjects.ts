// Three faces offered on the intro screen, so the app can be tried without a camera.
//
// This exists for two audiences. A judge on a laptop who does not want to photograph themselves
// still needs to reach the payoff, and the argument this project makes is about how placement
// behaves across skin depth — which cannot be shown by one person's face, however good the
// analysis of it is.
//
// They are deliberately spread across the Fitzpatrick range rather than chosen for variety's
// sake: the adaptation in palette.ts is inert above ADAPTS_BELOW and only binds where there is no
// room beneath the skin's own lightness. Three faces from the same band would demonstrate
// nothing. See docs/SWEEP.md for the same span computed rather than photographed.
//
// The images are generated rather than photographs of real people. That is a deliberate trade:
// it costs the credibility of a real capture, and buys identical lighting, guaranteed bare faces
// and no likeness to license. The one fixture marked `measured: true` in analysisFixtures.ts is a
// real live-API capture, and the README says all of this plainly.

import type { FitzpatrickScale } from "../youcam/types";

export interface SampleSubject {
  id: string;
  /** Shown under the thumbnail. Describes colouring, not a person. */
  label: string;
  /** Why this face is in the set, for the judges as much as for her. */
  note: string;
  /** Full-resolution image, uploaded to the API on selection. */
  image: string;
  /** Small version, for the intro screen only. The full image is 40x the bytes. */
  thumb: string;
  /** What we expect the analyser to return, used only for the note. Never fed to the engine. */
  expected: FitzpatrickScale;
  /**
   * Id in ANALYSIS_FIXTURES holding this subject's real captured analysis, once it has been run.
   *
   * Present means the 30 units of analysis are replayed instead of spent, while the five renders
   * still run for real. That makes a demo cost 5 units rather than 35, and makes it deterministic
   * on a conference network. Absent means the full analysis runs.
   */
  fixtureId?: string;
}

export const SAMPLE_SUBJECTS: SampleSubject[] = [
  {
    id: "fair-cool",
    label: "Fair, cool",
    note: "Depth adaptation stays inert here. There is room beneath her skin, so colour is placed the conventional way.",
    image: "/samples/faces/fitz-ii-cool.jpg",
    thumb: "/samples/faces/thumbs/fitz-ii-cool.jpg",
    expected: "II",
  },
  {
    id: "medium-warm",
    label: "Medium, warm",
    note: "Mid-range colouring with high contrast between hair and skin, which is what decides how much makeup she carries.",
    image: "/samples/faces/fitz-iv-warm.jpg",
    thumb: "/samples/faces/thumbs/fitz-iv-warm.jpg",
    expected: "IV",
  },
  {
    id: "deep-cool",
    label: "Deep, cool",
    note: "Where the placement rule binds. Placed the conventional way her bold lip collapses towards black, so it is placed for depth instead.",
    image: "/samples/faces/fitz-vi-cool.jpg",
    thumb: "/samples/faces/thumbs/fitz-vi-cool.jpg",
    expected: "VI",
  },
];

export interface SampleOutfit {
  id: string;
  /** Shown under the thumbnail. */
  label: string;
  /** Which way this one pushes the looks. */
  note: string;
  image: string;
  thumb: string;
}

/**
 * Three garments, one per branch of garmentInfluence().
 *
 * An outfit does one of three things to a look: leads and makes the face step back, gets picked
 * up by the eye, or stays out of the way and lets the makeup lead. Three dresses of similar
 * saturation would run the same branch three times and demonstrate one behaviour, so these are
 * chosen by measured chroma rather than by looking different from each other.
 *
 * The thresholds they are placed against live in garment/influence.ts: below 0.035 chroma an
 * outfit carries no usable hue, and loudness of 0.5 is where it starts to lead. Verified by
 * running the real extraction over them, not by eye.
 */
export const SAMPLE_OUTFITS: SampleOutfit[] = [
  {
    id: "cobalt",
    label: "Cobalt",
    note: "Loud enough to lead, so the looks step back and let it.",
    image: "/samples/outfits/cobalt-loud.jpg",
    thumb: "/samples/outfits/thumbs/cobalt-loud.jpg",
  },
  {
    id: "clay",
    label: "Clay",
    note: "Carries a hue without shouting, so the eye picks it up.",
    image: "/samples/outfits/clay-muted.jpg",
    thumb: "/samples/outfits/thumbs/clay-muted.jpg",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    note: "No hue to work with, so the makeup is free to lead.",
    image: "/samples/outfits/charcoal-neutral.jpg",
    thumb: "/samples/outfits/thumbs/charcoal-neutral.jpg",
  },
];

/**
 * Fetch a sample as a File, so it enters the pipeline through exactly the path a real photo does.
 *
 * For a face that is upload, analyse, render. Passing the public URL to the API as `src_file_url`
 * would work for the analysis and then strand the renders, which key off the `src_file_id` the
 * upload returns. Reusing the photo path also means the sample flow cannot drift from the real
 * one, because there is only one flow.
 */
export async function sampleAsFile(sample: SampleSubject | SampleOutfit): Promise<File> {
  const res = await fetch(sample.image);
  if (!res.ok) throw new Error(`Could not load the sample photo (${res.status}).`);
  const blob = await res.blob();
  return new File([blob], `${sample.id}.jpg`, { type: "image/jpeg" });
}
