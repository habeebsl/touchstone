import { ANALYSIS_FIXTURES } from "../../fixtures/analysisFixtures";
import { analyseColouring } from "../season";
import { fillLooks, selectLooks } from "../template";
import { garmentInfluence } from "../../garment/influence";
import { foundationGuide } from "../foundation";
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

// --- Outfit influence -------------------------------------------------------------------
// Two properties matter and they pull against each other: the outfit must visibly change the
// result, and it must never take over from her own colouring. A check for each.
{
  const fx = ANALYSIS_FIXTURES.find((f) => f.id === "medium-warm-brown")!;
  const swatch = (hex: string, share: number) => {
    const { l, c, h } = hexToOklch(hex);
    return { hex, share, chroma: c, hue: h, lightness: l };
  };

  const loud = garmentInfluence([swatch("#c0182b", 0.8)]);   // a red dress
  const quiet = garmentInfluence([swatch("#1a1a1a", 0.9)]);  // all black
  const cool = garmentInfluence([swatch("#1f3fa8", 0.75)]);  // royal blue

  const bare = selectLooks(fx.colors, fx.fitzpatrick);
  const withLoud = selectLooks(fx.colors, fx.fitzpatrick, 5, loud);
  const withQuiet = selectLooks(fx.colors, fx.fitzpatrick, 5, quiet);
  const withCool = selectLooks(fx.colors, fx.fitzpatrick, 5, cool);

  console.log(`\nno outfit    -> ${bare.map((l) => l.label).join(", ")}`);
  console.log(`red dress    -> ${withLoud.map((l) => l.label).join(", ")}  (loudness ${loud.loudness.toFixed(2)})`);
  console.log(`all black    -> ${withQuiet.map((l) => l.label).join(", ")}`);

  // 1. A loud outfit must pull the offered looks quieter than a neutral one does.
  const meanIntensity = (looks: typeof bare) =>
    looks.filter((l) => l.register === "bold").length + looks.filter((l) => l.register === "polished").length * 0.5;
  if (meanIntensity(withLoud) >= meanIntensity(withQuiet)) {
    fail("a red dress should pull the looks quieter than all-black does");
  }

  // 2. The eye must respond to the outfit — by leaning toward a nearby hue, or by muting for a
  //    distant one. Compared as perceptual distance rather than hue, since either response is
  //    correct and only "no response at all" is a failure.
  // Compared per template across both selections — comparing looks[0] of each would mix the
  // accent response together with the fact that the selections differ. Monochrome is excluded
  // because it deliberately pulls its accent toward the lip, which drowns out any outfit signal.
  const shared = withCool
    .filter((c) => c.templateId !== "monochrome" && withLoud.some((l) => l.templateId === c.templateId))
    .map((c) => {
      const other = withLoud.find((l) => l.templateId === c.templateId)!;
      return { label: c.label, cool: c.palette.shadowAccent, warm: other.palette.shadowAccent,
               dE: deltaE(c.palette.shadowAccent, other.palette.shadowAccent) };
    });
  for (const s of shared) console.log(`    ${s.label.padEnd(11)} ${s.warm} vs ${s.cool}  dE ${s.dE.toFixed(3)}`);
  const eyeResponse = Math.max(...shared.map((s) => s.dE));
  if (eyeResponse < 0.01) fail(`the eyeshadow accent ignores the outfit (dE ${eyeResponse.toFixed(3)})`);
  console.log(`  strongest eye response between a red and a blue outfit: dE ${eyeResponse.toFixed(3)}`);

  // 3. And the limit: her lip must stay recognisably hers. The outfit may mute it, never move it
  //    into the garment's hue family — that would be a matching toy, not colour analysis.
  for (const [name, withOutfit] of [["red", withLoud], ["blue", withCool]] as const) {
    for (const look of withOutfit) {
      const original = bare.find((b) => b.templateId === look.templateId);
      if (!original) continue;
      const moved = Math.abs(((hexToOklch(look.lipColor).h - hexToOklch(original.lipColor).h + 540) % 360) - 180);
      if (moved > 1) fail(`${name} outfit moved the ${look.label} lip hue by ${moved.toFixed(0)}°; it should only mute it`);
    }
  }
  // 4. The anti-clash rule, which is where a red outfit must differ from a blue one: a lip
  //    landing in the same hue neighbourhood as a loud garment — close but not matching — is the
  //    most visible failure available to us, so it steps back rather than competing.
  const warmLip = ANALYSIS_FIXTURES.find((f) => f.id === "olive-green-eyes")!; // Autumn, warm lips
  const nearby = garmentInfluence([swatch("#a8402a", 0.8)]); // brick red, close to an Autumn lip
  const far = garmentInfluence([swatch("#1f3fa8", 0.8)]);    // royal blue, nowhere near it

  const clashLooks = selectLooks(warmLip.colors, warmLip.fitzpatrick, 5, nearby);
  const farLooks = selectLooks(warmLip.colors, warmLip.fitzpatrick, 5, far);
  const shared2 = clashLooks.filter((c) => farLooks.some((f) => f.templateId === c.templateId));

  let muted = 0;
  for (const look of shared2) {
    const other = farLooks.find((f) => f.templateId === look.templateId)!;
    if (hexToOklch(look.lipColor).c < hexToOklch(other.lipColor).c - 0.005) muted++;
  }
  console.log(`  lip stepped back on ${muted}/${shared2.length} looks against a same-family outfit`);
  if (muted === 0) fail("the lip does not step back from an outfit in its own hue family");

  console.log("  outfit shifts the eye and the selection, and leaves the lip hue alone");
}

// --- Foundation readout -----------------------------------------------------------------
// She may spend money on this, so it gets checked like the rest: the depth ladder has to be
// monotonic across the Fitzpatrick range, and the undertone has to agree with the profile.
{
  console.log("");
  const LADDER = ["Fair", "Light", "Medium", "Tan", "Deep", "Rich"];
  let previous = -1;
  for (const fx of [...ANALYSIS_FIXTURES].sort((a, b) => "I II III IV V VI".indexOf(a.fitzpatrick) - "I II III IV V VI".indexOf(b.fitzpatrick))) {
    const profile = analyseColouring(fx.colors, fx.fitzpatrick);
    const guide = foundationGuide(profile, fx.colors.skin_color, fx.fitzpatrick);
    console.log(`  ${fx.fitzpatrick.padEnd(4)} ${guide.depth.padEnd(7)} ${guide.undertone.padEnd(13)} ${guide.advice}`);

    const rung = LADDER.indexOf(guide.depth);
    if (rung < 0) fail(`${fx.id}: unknown depth label "${guide.depth}"`);
    if (rung < previous) fail(`${fx.id}: depth ladder went backwards at Fitzpatrick ${fx.fitzpatrick}`);
    previous = rung;

    // Olive is its own answer and legitimately crosses warm/neutral, so it is exempt.
    if (guide.undertone !== "Olive" && !guide.undertone.startsWith(profile.undertone)) {
      fail(`${fx.id}: foundation undertone "${guide.undertone}" disagrees with profile "${profile.undertone}"`);
    }
    // Olive is a mid-depth reading. Fair skin is often low-chroma without being olive, and
    // labelling it so sends her to a shade range that will not match.
    if (guide.undertone === "Olive" && (guide.depth === "Fair" || guide.depth === "Rich")) {
      fail(`${fx.id}: called ${guide.depth} skin olive`);
    }
    // Fair-skin vocabulary on deep skin describes shade names that do not exist in that range.
    if (profile.depth > 0.65 && /pink|blue-based/.test(guide.advice)) {
      fail(`${fx.id}: deep skin given fair-skin shade vocabulary — "${guide.advice}"`);
    }
  }

  // Without a Fitzpatrick result the advice must say so rather than implying the same confidence.
  const fx = ANALYSIS_FIXTURES[0];
  const noFitz = foundationGuide(analyseColouring(fx.colors, null), fx.colors.skin_color, null);
  if (!noFitz.advice.includes("estimated")) fail("no Fitzpatrick: advice does not flag the weaker reading");
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
