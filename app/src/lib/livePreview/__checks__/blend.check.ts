/**
 * The live layer has to obey the same rule the palette does: a shade must be *visible* on what it
 * sits on, and on deep tones that cannot be achieved by darkening.
 *
 * This exercises the compositing code itself — `predictComposite` is the arithmetic the runtime
 * uses to size its own nudge — rather than a second implementation of it that could drift away
 * from what the canvas actually draws.
 *
 *   npx tsx src/lib/livePreview/__checks__/blend.check.ts
 */

import { luminanceShiftFor, predictComposite } from "../blendOverlay";
import { deltaE, hexToOklch } from "../../colorEngine/oklch";
import { selectLooks } from "../../colorEngine/template";
import { ANALYSIS_FIXTURES } from "../../fixtures/analysisFixtures";

// Node-only script; the app tsconfig is browser-targeted and has no node types.
declare const process: { exit(code: number): never };

let fails = 0;
const fail = (m: string) => {
  console.log(`  FAIL ${m}`);
  fails++;
};

// Mirrors LivePreview.tsx.
const LIP = { intensity: 0.9, cap: 0.35, target: 0.07 };
const BLUSH = { intensity: 0.5, cap: 0.15, target: 0.03 };

for (const fx of ANALYSIS_FIXTURES) {
  const skin = fx.colors.skin_color;
  let worstLip = { label: "", dE: 1 };

  for (const look of selectLooks(fx.colors, fx.fitzpatrick)) {
    // Each region composites over what is actually beneath it: lipstick over her lips, blush over
    // her skin. Measuring the lip against skin overstates how far it has to travel.
    for (const [region, color, backdrop, spec] of [
      ["lip", look.lipColor, fx.colors.lip_color, LIP],
      ["blush", look.blushColor, skin, BLUSH],
    ] as const) {
      const backdropL = hexToOklch(backdrop).l;
      const shift = luminanceShiftFor(color, backdrop, spec);
      const out = predictComposite(backdrop, color, shift, spec.intensity);
      const visible = deltaE(out, backdrop);
      const lightnessShift = hexToOklch(out).l - backdropL;

      if (region === "lip" && visible < worstLip.dE) worstLip = { label: look.label, dE: visible };

      // 1. It has to be seen. Allowed to fall short of target when the cap binds first — that is
      //    the cap doing its job — but not to vanish.
      if (visible < spec.target * 0.6) {
        fail(
          `${fx.id}/${look.label}/${region}: effectively invisible (dE ${visible.toFixed(3)}, ${shift.mode} at ${shift.alpha.toFixed(2)})`,
        );
      }

      // 2. Blush must not darken deep skin — that is the failure multiply produced before the
      //    mode was chosen per shade, and a darkened cheek reads as a bruise rather than a flush.
      //    Deliberately not applied to the lip: a lipstick deeper than your own lip colour is
      //    ordinary at any skin depth, and the first version of this check wrongly flagged five
      //    perfectly good shades for it.
      if (region === "blush" && backdropL < 0.45 && lightnessShift < -0.03) {
        fail(
          `${fx.id}/${look.label}/blush: darkens deep skin by ${(-lightnessShift).toFixed(3)} — reads as a bruise`,
        );
      }

      // 3. Never so strong that it stops being makeup. The point of the colour pass is that the
      //    underlying luminosity survives; a nudge at full strength would undo it.
      if (shift.alpha > spec.cap + 0.001) {
        fail(`${fx.id}/${look.label}/${region}: nudge ${shift.alpha.toFixed(2)} exceeds the cap`);
      }
    }
  }

  const sample = selectLooks(fx.colors, fx.fitzpatrick)[2];
  const shift = luminanceShiftFor(sample.lipColor, fx.colors.lip_color, LIP);
  const out = predictComposite(fx.colors.lip_color, sample.lipColor, shift, LIP.intensity);
  console.log(
    `  ${fx.label.padEnd(30)} lips ${fx.colors.lip_color} -> ${out}  ${shift.mode.padEnd(8)} +${shift.alpha.toFixed(2)}  ` +
      `(dE ${deltaE(out, fx.colors.lip_color).toFixed(3)}, weakest look ${worstLip.dE.toFixed(3)})`,
  );
}

console.log(fails === 0 ? "\nBLEND CHECKS PASSED" : `\n${fails} BLEND FAILURES`);
if (fails) process.exit(1);
