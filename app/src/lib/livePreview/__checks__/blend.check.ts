/**
 * The live layer has to obey the same rule the palette does: a shade must be *visible* on what it
 * sits on, and on deep tones that cannot be achieved by darkening.
 *
 * Two properties are checked together, because optimising either alone produces a known failure.
 * Chase visibility and you get flat paint; chase texture and you get an overlay so faint it may
 * as well not be applied. Both were shipped, in that order, before this check existed.
 *
 *   npx tsx src/lib/livePreview/__checks__/blend.check.ts
 */

import { predictComposite } from "../blendOverlay";
import { deltaE, hexToOklch, oklchToHex } from "../../colorEngine/oklch";
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
const LIP_INTENSITY = 0.85;
const BLUSH_INTENSITY = 0.4;

/**
 * A real region is not one colour: it has a shadowed side and a specular highlight. Texture
 * survives compositing only if those stay apart afterwards, so they are modelled explicitly
 * rather than assumed.
 */
function shadeAndHighlight(hex: string) {
  const { l, c, h } = hexToOklch(hex);
  return {
    shadow: oklchToHex({ l: Math.max(0.05, l - 0.1), c, h }),
    specular: oklchToHex({ l: Math.min(0.98, l + 0.14), c: c * 0.7, h }),
  };
}

for (const fx of ANALYSIS_FIXTURES) {
  const skin = fx.colors.skin_color;
  let worst = { label: "", visible: 1, texture: 1 };

  for (const look of selectLooks(fx.colors, fx.fitzpatrick)) {
    // Each region composites over what is actually beneath it: lipstick over her measured lip
    // colour, blush over her skin. Sizing a lip against skin overstates how far it has to travel.
    for (const [region, color, mean, intensity, minVisible, minTexture] of [
      ["lip", look.lipColor, fx.colors.lip_color, LIP_INTENSITY, 0.05, 0.1],
      ["blush", look.blushColor, skin, BLUSH_INTENSITY, 0.02, 0.1],
    ] as const) {
      const out = predictComposite(mean, color, mean, intensity);
      const visible = deltaE(out, mean);

      const { shadow, specular } = shadeAndHighlight(mean);
      const litOut = predictComposite(specular, color, mean, intensity);
      const shadowOut = predictComposite(shadow, color, mean, intensity);
      const texture = hexToOklch(litOut).l - hexToOklch(shadowOut).l;

      if (region === "lip" && visible < worst.visible) worst = { label: look.label, visible, texture };

      // 1. It has to be seen. This is the failure the `color`-only version shipped with.
      if (visible < minVisible) {
        fail(`${fx.id}/${look.label}/${region}: barely visible (dE ${visible.toFixed(3)})`);
      }

      // 2. And the region must still look like a surface afterwards. This is the failure the
      //    flat-colour version shipped with — a uniform shift that erases the highlight.
      if (texture < minTexture) {
        fail(`${fx.id}/${look.label}/${region}: flattened (highlight-to-shadow range ${texture.toFixed(3)})`);
      }

      // 3. It has to be the *right* colour, across the whole region and not just at its average.
      //    This is the failure that reached a user: a per-channel relight exploded where the mean
      //    was dark, clamping small channels and clipping the largest, so every shade rendered as
      //    saturated red. Every other check here passed while it did — they measured how far a
      //    pixel moved and whether texture survived, never which direction it moved in.
      //
      //    Measured at full application, on the highlight and the shadow rather than the mean:
      //    at the mean the old code was correct by construction, and it was pixels away from the
      //    mean that clipped.
      for (const [where, sample] of [["highlight", specular], ["shadow", shadow]] as const) {
        const rendered = predictComposite(sample, color, mean, 1);
        const gap = Math.abs(((hexToOklch(rendered).h - hexToOklch(color).h + 540) % 360) - 180);
        if (hexToOklch(color).c > 0.04 && gap > 15) {
          fail(`${fx.id}/${look.label}/${region}: ${where} renders ${gap.toFixed(0)}° off the shade (${rendered} vs ${color})`);
        }
      }

      // 4. Blush must not darken deep skin, which reads as a bruise rather than a flush.
      //    Deliberately not applied to the lip: a lipstick deeper than your own lip colour is
      //    ordinary at any skin depth.
      const lightnessShift = hexToOklch(out).l - hexToOklch(mean).l;
      if (region === "blush" && hexToOklch(skin).l < 0.45 && lightnessShift < -0.03) {
        fail(`${fx.id}/${look.label}/blush: darkens deep skin by ${(-lightnessShift).toFixed(3)}`);
      }
    }
  }

  // The webcam is not the analysis photo: it has its own exposure and white balance. The mean is
  // measured from the live frame precisely so the shade does not blow out when the two disagree,
  // and this is the check for it — under the old behaviour, where the mean came from the photo,
  // a region lit half a stop brighter clipped and turned orange-red.
  for (const look of selectLooks(fx.colors, fx.fitzpatrick)) {
    const shade = look.lipColor;
    const { l, c, h } = hexToOklch(fx.colors.lip_color);
    for (const stops of [-0.4, -0.2, 0.2, 0.4, 0.6]) {
      const asLit = oklchToHex({ l: Math.max(0.05, Math.min(0.97, l + stops * 0.5)), c, h });
      // Measured live, the mean *is* the region as the camera sees it.
      const out = predictComposite(asLit, shade, asLit, 1);
      const hueGap = Math.abs(((hexToOklch(out).h - hexToOklch(shade).h + 540) % 360) - 180);
      const chromaRatio = hexToOklch(out).c / Math.max(0.001, hexToOklch(shade).c);
      if (hueGap > 8 || chromaRatio > 1.25) {
        fail(
          `${fx.id}/${look.label}: at ${stops > 0 ? "+" : ""}${stops} stops renders ${out} — ` +
            `${hueGap.toFixed(0)}° off, chroma x${chromaRatio.toFixed(2)}`,
        );
      }
    }
  }

  console.log(
    `  ${fx.label.padEnd(30)} weakest lip: dE ${worst.visible.toFixed(3)}, texture ${worst.texture.toFixed(3)} (${worst.label})`,
  );
}

console.log(fails === 0 ? "\nBLEND CHECKS PASSED" : `\n${fails} BLEND FAILURES`);
if (fails) process.exit(1);
