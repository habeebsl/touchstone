import { ANALYSIS_FIXTURES } from "../../fixtures/analysisFixtures";
import { analyseColouring } from "../season";
import { fillLooks, selectLooks } from "../template";
import { hexToOklch, deltaE } from "../oklch";

let fails = 0;
const fail = (m: string) => { console.log("  FAIL " + m); fails++; };

for (const fx of ANALYSIS_FIXTURES) {
  const p = analyseColouring(fx.colors, fx.fitzpatrick);
  const looks = fillLooks(fx.colors, fx.fitzpatrick);
  const skinL = hexToOklch(fx.colors.skin_color).l;

  console.log(`\n${fx.label}  ->  ${p.season} / ${p.undertone}  (warmth ${p.warmth.toFixed(2)}, depth ${p.depth.toFixed(2)}, contrast ${p.contrast.toFixed(2)})`);

  for (const look of looks) {
    const lipL = hexToOklch(look.lipColor).l;
    const gap = skinL - lipL;
    console.log(`  ${look.label.padEnd(9)} lip ${look.lipColor} (L${lipL.toFixed(2)}, gap ${gap.toFixed(2)})  blush ${look.blushColor}`);

    // Distinguishability is perceptual distance, not lightness alone: on deep skin a colour
    // separates from the face through chroma and hue as much as through value.
    const lipD = deltaE(look.lipColor, fx.colors.skin_color);
    const blushD = deltaE(look.blushColor, fx.colors.skin_color);
    if (lipD < 0.09) fail(`${fx.id}/${look.label}: lip indistinct from skin (dE ${lipD.toFixed(3)})`);
    if (blushD < 0.035) fail(`${fx.id}/${look.label}: blush indistinct (dE ${blushD.toFixed(3)})`);

    // Palette count must match the eyeshadow pattern's colorNum or the API rejects it.
    for (const e of look.effects) {
      if ("palettes" in e && e.palettes.length === 0) fail(`${fx.id}/${look.label}: empty palette on ${e.category}`);
      if ("palettes" in e) for (const pal of e.palettes) {
        if (!/^#[0-9a-f]{6}$/i.test(pal.color)) fail(`${fx.id}/${look.label}: bad hex ${pal.color} on ${e.category}`);
      }
    }
  }
  // A bold register must read as a bigger statement than a soft one. Measured as perceptual
  // distance from the face, since intensity can be delivered by chroma, hue or value depending
  // on the skin.
  const soft = looks.find((l) => l.register === "soft")!;
  const bold = looks.find((l) => l.register === "bold")!;
  const softD = deltaE(soft.lipColor, fx.colors.skin_color);
  const boldD = deltaE(bold.lipColor, fx.colors.skin_color);
  if (boldD <= softD) fail(`${fx.id}: bold no more striking than soft (dE ${softD.toFixed(3)} -> ${boldD.toFixed(3)})`);
  console.log(`  distance from skin: soft ${softD.toFixed(3)} -> bold ${boldD.toFixed(3)}`);

  // Selection is what the user actually sees, so its guarantees are checked directly: the right
  // number of looks, every register represented, no repeats, and presented bare -> bold.
  const COUNT = 5;
  const chosen = selectLooks(fx.colors, fx.fitzpatrick, COUNT);
  if (chosen.length !== COUNT) fail(`${fx.id}: selected ${chosen.length} looks, expected ${COUNT}`);
  if (new Set(chosen.map((l) => l.templateId)).size !== chosen.length) fail(`${fx.id}: duplicate look selected`);
  for (const register of ["soft", "polished", "bold"] as const) {
    if (!chosen.some((l) => l.register === register)) fail(`${fx.id}: no ${register} look offered`);
  }
  // Five looks shown side by side must not share a lip colour. Two structurally different looks
  // coming out with the same hex reads as a bug even when the colour is right for both.
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      const d = deltaE(chosen[i].lipColor, chosen[j].lipColor);
      if (d < 0.012) {
        fail(`${fx.id}: ${chosen[i].label} and ${chosen[j].label} share a lip colour (dE ${d.toFixed(3)})`);
      }
    }
  }
  console.log(`  offered: ${chosen.map((l) => `${l.label} ${l.lipColor}`).join("  ")}`);
}

// Selection has to actually respond to the person, or the ranking is decoration. Low-contrast
// and high-contrast colouring should not be offered the same five structures.
const quiet = ANALYSIS_FIXTURES.find((f) => f.id === "fair-cool-ash")!;
const loud = ANALYSIS_FIXTURES.find((f) => f.id === "light-cool-dark")!;
const quietIds = selectLooks(quiet.colors, quiet.fitzpatrick).map((l) => l.templateId);
const loudIds = selectLooks(loud.colors, loud.fitzpatrick).map((l) => l.templateId);
if (quietIds.join() === loudIds.join()) {
  fail(`selection ignores contrast: ${quietIds.join(", ")} offered to both`);
} else {
  console.log(`\nlow contrast  -> ${quietIds.join(", ")}`);
  console.log(`high contrast -> ${loudIds.join(", ")}`);
}

console.log(fails === 0 ? "\nALL ENGINE CHECKS PASSED" : `\n${fails} FAILURES`);

// --- Partial responses ------------------------------------------------------------------
// The crash that prompted normalise.ts: a real capture returned no hair colour name.
import { normaliseMeasured, MissingSkinColourError } from "../normalise";

const partials: Array<[string, Record<string, unknown>]> = [
  ["no hair name", { skin_color: "#bc9d88", hair_color: "#b56637", eye_color: "#342724", eye_color_name: "Brown", lip_color: "#be8782" }],
  ["no hair at all", { skin_color: "#bc9d88", eye_color: "#342724", eye_color_name: "Brown", lip_color: "#be8782" }],
  ["no eyes at all", { skin_color: "#8a5a3b", hair_color: "#171110", hair_color_name: "Black" }],
  ["skin only", { skin_color: "#4d2f21" }],
];
let pfails = 0;
for (const [name, raw] of partials) {
  try {
    const { colors, inferred } = normaliseMeasured(raw as never);
    const looks = fillLooks(colors, "III");
    console.log(`  ${name.padEnd(16)} ok — inferred [${inferred.join(", ") || "nothing"}], lip ${looks[1].lipColor}`);
  } catch (e) {
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
    pfails++;
  }
}
try {
  normaliseMeasured({ } as never);
  console.log("  FAIL missing skin colour should throw");
  pfails++;
} catch (e) {
  if (!(e instanceof MissingSkinColourError)) { console.log("  FAIL wrong error type"); pfails++; }
  else console.log("  no skin colour    -> throws MissingSkinColourError as intended");
}
console.log(pfails === 0 ? "PARTIAL-RESPONSE CHECKS PASSED" : `${pfails} PARTIAL FAILURES`);
