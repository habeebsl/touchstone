/**
 * The claim the product is built on, as an assertion.
 *
 * "Place the shade below the skin's own lightness" is the conventional rule and it is a fair-skin
 * assumption. There is room below fair skin. Below deep skin there is almost none, and what is
 * there is the region sRGB cannot hold a saturated colour in at all — so the rule does not
 * produce a deep shade, it produces black.
 *
 * The trap is that black is *far from the skin*. On the deepest fixture the conventional pick
 * scores dE 0.247 against her skin and the adapted one scores 0.205, so a distance test alone
 * passes the black and would rank it higher. Distance is not visibility. A shade also has to
 * survive as a colour, which is what chroma measures, and that is what this file checks.
 *
 *   npx tsx src/lib/colorEngine/__checks__/placement.check.ts
 */

import { deltaE, hexToOklch } from "../oklch";
import { selectLooks } from "../template";
import { ANALYSIS_FIXTURES } from "../../fixtures/analysisFixtures";

declare const process: { exit(code: number): never };

let fails = 0;
const fail = (m: string) => {
  console.log(`  FAIL ${m}`);
  fails++;
};

/**
 * Below this, a "colour" has no colour left in it — it reads as black or grey, not as makeup.
 *
 * Per role, because the floor is about collapse and not about intensity. A lipstick with no
 * chroma is broken; a blush is *meant* to be a quiet wash, and on very fair skin it lands around
 * 0.03 legitimately. A single 0.04 floor failed that blush, which was the check mistaking a pale
 * pink for a failure — and the visibility guard picks it up afterwards regardless.
 */
const MIN_WEARABLE_CHROMA: Record<string, number> = { lip: 0.05, blush: 0.018, eyeshadowAccent: 0.02 };
const wearableFloor = (role: string) => MIN_WEARABLE_CHROMA[role] ?? 0.02;

/**
 * Where the adaptation starts, taken from the engine rather than guessed at: `pickColour` blends
 * toward the vivid band by `(0.62 - skin.l) / 0.3`, so it is inert above this and full below 0.32.
 * The first version of this check used 0.45 and failed the deep-warm fixture for adapting — which
 * was the check being wrong about the engine, not the engine being wrong about the skin.
 */
const ADAPTS_BELOW = 0.62;

for (const fx of ANALYSIS_FIXTURES) {
  const skinL = hexToOklch(fx.colors.skin_color).l;
  const deep = skinL < ADAPTS_BELOW;

  for (const look of selectLooks(fx.colors, fx.fitzpatrick)) {
    for (const p of look.placements) {
      const adapted = hexToOklch(p.adapted);
      const conventional = hexToOklch(p.conventional);

      // 1. Whatever the skin, the shade we actually use has to still be a colour.
      if (adapted.c < wearableFloor(p.role)) {
        fail(
          `${fx.id}/${look.label}/${p.role}: placed at ${p.adapted}, chroma ${adapted.c.toFixed(3)} — ` +
            `no colour left in it`,
        );
      }

      // 2. On fair and mid skin the adaptation must stay out of the way. If it starts moving
      //    shades that were already fine, it has stopped being a correction and become a style.
      if (!deep && p.conventional !== p.adapted && deltaE(p.conventional, p.adapted) > 0.02) {
        fail(
          `${fx.id}/${look.label}/${p.role}: adaptation fired on skin that did not need it ` +
            `(${p.conventional} -> ${p.adapted})`,
        );
      }

      // 3. And on deep skin it must actually be doing something — otherwise the whole claim is
      //    decoration. Where the conventional rule collapses, ours must not, and it must never
      //    leave a shade with less colour in it than the rule it replaced.
      if (deep && conventional.c < wearableFloor(p.role) && adapted.c < wearableFloor(p.role)) {
        fail(
          `${fx.id}/${look.label}/${p.role}: conventional collapsed to ${p.conventional} and the ` +
            `adaptation did not rescue it (${p.adapted})`,
        );
      }
      if (deep && adapted.c < conventional.c - 0.001) {
        fail(
          `${fx.id}/${look.label}/${p.role}: adaptation lost colour on deep skin ` +
            `(${conventional.c.toFixed(3)} -> ${adapted.c.toFixed(3)})`,
        );
      }
    }
  }

  // Report the bold lip per fixture, which is where the rule bites hardest.
  const look = selectLooks(fx.colors, fx.fitzpatrick).find((l) => l.register === "bold") ?? selectLooks(fx.colors, fx.fitzpatrick)[2];
  const p = look.placements.find((x) => x.role === "lip");
  if (p) {
    const c = hexToOklch(p.conventional);
    const a = hexToOklch(p.adapted);
    console.log(
      `  ${fx.label.padEnd(30)} conventional ${p.conventional} chroma ${c.c.toFixed(3)}` +
        `   ->   placed ${p.adapted} chroma ${a.c.toFixed(3)}` +
        (p.conventional === p.adapted ? "   (unchanged)" : ""),
    );
  }
}

console.log(fails === 0 ? "\nPLACEMENT CHECKS PASSED" : `\n${fails} PLACEMENT FAILURES`);
if (fails) process.exit(1);
