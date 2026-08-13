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

import { lipPixel, predictComposite } from "../blendOverlay";
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

// Strength now comes from the look itself, as it does in LivePreview — a fixed 0.96 here would
// be checking a renderer that no longer exists, and would hide exactly the failure that matters:
// a soft look applied gently can fall back under the visibility floor.

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
      // The visibility floor scales with how strongly the look means to be worn, down to a hard
      // minimum. A gloss at 55% is *supposed* to read as less than a matte at 74% — holding both
      // to one threshold either forces the sheer looks to stop being sheer or lets the strong ones
      // off lightly. What may never happen is a lipstick you cannot see at all, and that is the
      // floor under the scaling, which is the failure this whole check exists for on deep tones.
      ["lip", look.lipColor, fx.colors.lip_color, look.lipIntensity, Math.max(0.038, 0.05 * (look.lipIntensity / 0.7)), 0.1],
      // Blush had a 0.02 floor while the lip had 0.05 — less than half the bar, set back when the
      // live layer composited blush at a fixed 0.4 and never revisited for the API render. Worn at
      // the look's own intensity it was landing at 0.022 on the fairest fixture: applied, rendered,
      // and invisible. Which is the exact failure this project quotes at the industry, so it does
      // not get to be the one shipping it.
      ["blush", look.blushColor, skin, look.blushIntensity, 0.033, 0.1],
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

// --- The lip, per pixel ---------------------------------------------------------------------
//
// The property that four attempts with blend modes could not deliver: a lipstick changes the
// albedo, not the light. Whatever colour is applied, the specular highlight stays the colour of
// the light source — near-white — and the deep shadow stays dark. Tinting those is what makes a
// lip read as a plastic shell.
console.log("");
{
  const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) * 1);
  const toHex = (c: number[]) =>
    "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

  const apply = (pixelHex: string, shadeHex: string, meanHex: string, gloss: number, strength: number) => {
    const [r, g, b] = toRgb(pixelHex);
    const [sr, sg, sb] = toRgb(shadeHex);
    const meanLum = (0.2126 * toRgb(meanHex)[0] + 0.7152 * toRgb(meanHex)[1] + 0.0722 * toRgb(meanHex)[2]);
    const out: [number, number, number] = [0, 0, 0];
    lipPixel(r, g, b, sr, sg, sb, meanLum, strength, gloss, out);
    return toHex(out);
  };

  for (const fx of ANALYSIS_FIXTURES) {
    const mean = fx.colors.lip_color;
    const { l, c, h } = hexToOklch(mean);
    // The three parts of a lip: shadow, evenly lit, and the specular catching the light.
    //
    // The specular has a lightness floor, because it is the light source reflected rather than a
    // brighter version of the surface — it does not get dimmer just because the lip is deeper.
    // Modelled as l * 1.75 alone it came out genuinely dark on deep lips, and the renderer was
    // right to treat a dark pixel as lip rather than as a highlight; it was this fixture that was
    // wrong. Which matters beyond the check: "bright relative to the region" is not the same
    // property as "bright", and taking them as the same is what left a strongly lit mouth
    // unpainted through its whole centre.
    const shadow = oklchToHex({ l: Math.max(0.04, l * 0.5), c: c * 0.8, h });
    const specular = oklchToHex({ l: Math.min(0.98, Math.max(0.74, l * 1.75)), c: c * 0.25, h });

    for (const look of selectLooks(fx.colors, fx.fitzpatrick)) {
      const shade = look.lipColor;

      // 1. The lit body of the lip travels toward the shade in proportion to how strongly the
      //    look wears it — not all the way to it.
      //
      //    This used to demand the body land on the shade exactly, which was only true because
      //    the renderer applied every look at 0.96 no matter what the look asked for. That is the
      //    bug this check was blind to: a lipstick the look wants at 45% is *supposed* to leave
      //    some of her own lip showing, and rendering it at full strength is what made the live
      //    view vivid where the API render was muted, and made five different looks land on the
      //    same intensity on camera.
      const body = apply(mean, shade, mean, 0, look.lipIntensity);
      const gap = deltaE(mean, shade);
      const remaining = deltaE(body, shade);
      if (remaining > (1 - look.lipIntensity) * gap * 1.3 + 0.02) {
        fail(
          `${fx.id}/${look.label}: at ${(look.lipIntensity * 100).toFixed(0)}% the lit lip renders ` +
            `${body}, ${remaining.toFixed(3)} short of ${shade} (bare lip is ${gap.toFixed(3)} away)`,
        );
      }
      // And it has to be the shade's colour, not merely nearer to it.
      const bodyHue = Math.abs(((hexToOklch(body).h - hexToOklch(shade).h + 540) % 360) - 180);
      if (hexToOklch(shade).c > 0.04 && bodyHue > 15) {
        fail(`${fx.id}/${look.label}: the lit lip renders ${bodyHue.toFixed(0)}° off the shade (${body} vs ${shade})`);
      }

      // 2. The specular still reads as light rather than as lipstick: clearly lighter than the
      //    body of the lip and clearly less saturated than it.
      //
      //    This used to demand that the highlight gain almost no chroma at all, and that was the
      //    wrong property. It is satisfied perfectly by applying no lipstick, which is what the
      //    renderer then did: under strong light a wide stretch of ordinary diffuse lip scores
      //    bright, so the lip rendered as a red rim around a bare centre. The check passed the
      //    whole time. Measured against the body rather than against bare lip, the real
      //    distinction — highlight versus painted surface — survives, and a lit lip still gets
      //    painted.
      const lit = apply(specular, shade, mean, 0, look.lipIntensity);
      const litC = hexToOklch(lit);
      const bodyC = hexToOklch(body);
      if (litC.l < bodyC.l + 0.08) {
        fail(
          `${fx.id}/${look.label}: the highlight stopped reading as one (lightness ${bodyC.l.toFixed(3)} body vs ${litC.l.toFixed(3)} highlight)`,
        );
      }
      // Proportional, with a small absolute allowance: on a muted shade the body's own chroma is
      // barely above neutral, and a purely proportional bound there demands a highlight more
      // colourless than the lipstick is.
      if (litC.c > bodyC.c * 0.6 + 0.02) {
        fail(
          `${fx.id}/${look.label}: the highlight is as saturated as the lipstick (chroma ${litC.c.toFixed(3)} vs body ${bodyC.c.toFixed(3)})`,
        );
      }

      // 3. The shadow stays a shadow rather than becoming dark lipstick.
      const dark = apply(shadow, shade, mean, 0, look.lipIntensity);
      if (hexToOklch(dark).l > hexToOklch(shadow).l + 0.06) {
        fail(`${fx.id}/${look.label}: the shadow was lifted (${shadow} -> ${dark})`);
      }
    }

    const look = selectLooks(fx.colors, fx.fitzpatrick)[2];
    console.log(
      `  ${fx.label.padEnd(30)} lit ${apply(mean, look.lipColor, mean, 0, look.lipIntensity)}  ` +
        `highlight ${apply(specular, look.lipColor, mean, 0, look.lipIntensity)}  shadow ${apply(shadow, look.lipColor, mean, 0, look.lipIntensity)}  ` +
        `(shade ${look.lipColor})`,
    );
  }
}

console.log(fails === 0 ? "\nBLEND CHECKS PASSED" : `\n${fails} BLEND FAILURES`);
if (fails) process.exit(1);
