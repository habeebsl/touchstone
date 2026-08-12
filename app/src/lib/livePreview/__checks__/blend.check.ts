/**
 * The live layer has to obey the same rule the palette does: a shade must be *visible* on the
 * skin it sits on, and on deep skin that cannot be achieved by darkening.
 *
 * Canvas does the real compositing, so the blend formulas are reproduced here as a model of it —
 * they are the W3C compositing definitions, and the point is to check the *choice* of mode
 * against every fixture rather than to re-implement the canvas.
 *
 *   npx tsx src/lib/livePreview/__checks__/blend.check.ts
 */

import { chooseBlend } from "../blendOverlay";
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

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

const BLEND: Record<string, (b: number, s: number) => number> = {
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
};

/** What the canvas produces: blend, then alpha-composite the result back over the base. */
function composite(baseHex: string, tintHex: string, mode: string, alpha: number): string {
  const base = toRgb(baseHex);
  const tint = toRgb(tintHex);
  return toHex(base.map((b, i) => b + (BLEND[mode](b, tint[i]) - b) * alpha));
}

const LIP_INTENSITY = 0.75;
const BLUSH_INTENSITY = 0.45;

for (const fx of ANALYSIS_FIXTURES) {
  const skin = fx.colors.skin_color;
  const skinL = hexToOklch(skin).l;

  for (const look of selectLooks(fx.colors, fx.fitzpatrick)) {
    for (const [region, color, alpha, minVisible] of [
      ["lip", look.lipColor, LIP_INTENSITY, 0.05],
      ["blush", look.blushColor, BLUSH_INTENSITY, 0.025],
    ] as const) {
      const mode = chooseBlend(hexToOklch(color).l, skinL);
      const out = composite(skin, color, mode, alpha);
      const visible = deltaE(out, skin);
      const lightnessShift = hexToOklch(out).l - skinL;

      // 1. It has to be seen at all. An invisible overlay is the failure the whole rule exists
      //    to prevent.
      if (visible < minVisible) {
        fail(`${fx.id}/${look.label}/${region}: barely visible (dE ${visible.toFixed(3)}, ${mode})`);
      }

      // 2. On deep skin it must not read as a shadow. This is the specific failure multiply
      //    produced before the mode was chosen per shade.
      if (skinL < 0.45 && lightnessShift < -0.03) {
        fail(
          `${fx.id}/${look.label}/${region}: darkens deep skin by ${(-lightnessShift).toFixed(3)} — reads as a shadow`,
        );
      }

      // 3. The chosen mode must beat the alternative on visibility, or it is the wrong choice.
      const other = mode === "multiply" ? "screen" : "multiply";
      const otherVisible = deltaE(composite(skin, color, other, alpha), skin);
      if (otherVisible > visible * 1.5) {
        fail(
          `${fx.id}/${look.label}/${region}: ${other} would be far more visible (dE ${otherVisible.toFixed(3)} vs ${visible.toFixed(3)})`,
        );
      }
    }
  }

  const sample = selectLooks(fx.colors, fx.fitzpatrick)[2];
  const lipMode = chooseBlend(hexToOklch(sample.lipColor).l, skinL);
  const blushMode = chooseBlend(hexToOklch(sample.blushColor).l, skinL);
  console.log(
    `  ${fx.label.padEnd(30)} skin L ${skinL.toFixed(2)}  lip ${lipMode.padEnd(8)} blush ${blushMode}`,
  );
}

console.log(fails === 0 ? "\nBLEND CHECKS PASSED" : `\n${fails} BLEND FAILURES`);
if (fails) process.exit(1);
