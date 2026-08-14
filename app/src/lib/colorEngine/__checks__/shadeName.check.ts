/**
 * Shade naming: does a name mean anything?
 *
 * A namer that returns the same word for everything passes any test that only asks whether it
 * returned a word, so the assertions here are about resolution and honesty rather than coverage.
 * Two shades should share a name when they are the same shade, and stop sharing one when they are
 * not. Both failure modes actually happened while this was being written.
 *
 * Offline and free, like every other suite here.
 */
import { nameShade } from "../shadeName";
import { deltaE, hexToOklch } from "../oklch";
import { selectLooks } from "../template";
import { ANALYSIS_FIXTURES } from "../../fixtures/analysisFixtures";

// Declared locally rather than pulling @types/node into the app's typecheck, matching the other
// suites here. These run under tsx; the app itself never sees them.
declare const process: { exit(code: number): never };

let failures = 0;
function fail(message: string) {
  console.error(`  FAIL ${message}`);
  failures++;
}

/**
 * Where a difference stops being arguable.
 *
 * Well above the engine's own visibility floor of 0.06: two shades can be distinguishable and
 * still fairly be called the same colour, which is what a shade family is. Past this they cannot.
 */
const SAME_NAME_LIMIT = 0.1;

/** A name as [modifier, noun]. A one-word name has no modifier, which is the common case. */
function split(name: string): [string, string] {
  const parts = name.split(" ");
  return parts.length === 2 ? [parts[0], parts[1]] : ["", parts[0]];
}

console.log("Shade names, per person\n");

for (const fx of ANALYSIS_FIXTURES) {
  const looks = selectLooks(fx.colors, fx.fitzpatrick);
  const named = looks.map((l) => ({ look: l.label, hex: l.lipColor, name: nameShade(l.lipColor) }));
  console.log(`  ${fx.label}`);
  for (const n of named) console.log(`    ${n.look.padEnd(12)} ${n.hex}  ${n.name}`);

  // 1. Two shades may share a name only if they really are the same shade. The first version gave
  //    four of one person's five lips the name "crimson" while they sat dE 0.147 apart, because
  //    its thresholds were set for the whole colour space rather than the part makeup occupies.
  for (const role of ["lipColor", "blushColor"] as const) {
    const shades = looks.map((l) => l[role]);
    for (let i = 0; i < shades.length; i++) {
      for (let j = i + 1; j < shades.length; j++) {
        if (nameShade(shades[i]) !== nameShade(shades[j])) continue;
        const distance = deltaE(shades[i], shades[j]);
        if (distance > SAME_NAME_LIMIT) {
          fail(
            `${fx.id}/${role}: ${shades[i]} and ${shades[j]} both name as ` +
              `"${nameShade(shades[i])}" but sit dE ${distance.toFixed(3)} apart`,
          );
        }
      }
    }
  }

  // 2. The converse, which is the failure a distinctness test alone would reward: without it,
  //    "make every name unique" would be a passing strategy.
  //
  //    Stated carefully, because the obvious version is not satisfiable. Any hard partition splits
  //    near-identical colours that happen to fall either side of a boundary, and no choice of
  //    threshold removes that: #5f2002 and #5d1801 are dE 0.018 apart and sit across the hue cut
  //    at 40 degrees, so one is a mahogany and the other a chocolate. Demanding they match would
  //    be demanding a namer with no boundaries in it.
  //
  //    What can be demanded is that such a split stays small. Crossing one boundary may change the
  //    noun or the modifier; changing both means two colours nobody can tell apart were described
  //    in entirely different terms, which is the erratic behaviour this is actually guarding.
  for (let i = 0; i < looks.length; i++) {
    for (let j = i + 1; j < looks.length; j++) {
      const [a, b] = [looks[i].lipColor, looks[j].lipColor];
      const distance = deltaE(a, b);
      if (distance >= 0.02) continue;

      const [modA = "", nounA = ""] = split(nameShade(a));
      const [modB = "", nounB = ""] = split(nameShade(b));
      if (modA !== modB && nounA !== nounB) {
        fail(
          `${fx.id}: ${a} and ${b} are dE ${distance.toFixed(3)} apart but named ` +
            `"${nameShade(a)}" and "${nameShade(b)}", differing in both noun and modifier`,
        );
      }
    }
  }
  console.log("");
}

// 3. Two words at most. This is a label under a swatch she can already see, so its job is to be
//    repeatable out loud; a third word turns it into marketing copy and stops being read.
// 4. And nothing may name as the empty string, which is what a missing modifier plus a missing
//    family would produce and which would render as a blank line rather than as an error.
for (const fx of ANALYSIS_FIXTURES) {
  for (const look of selectLooks(fx.colors, fx.fitzpatrick)) {
    for (const hex of Object.values(look.palette)) {
      const name = nameShade(hex);
      if (!name.trim()) fail(`${hex} produced an empty name`);
      if (name.trim().split(/\s+/).length > 2) fail(`${hex} named "${name}", which is more than two words`);
    }
  }
}

// 5. A colour with no usable hue must be named from lightness, not given a hue family. A brow at
//    near-zero chroma called "raspberry" because its hue rounded there would be worse than a hex.
for (const [hex, expected] of [
  ["#000000", "black"],
  ["#ffffff", "white"],
  ["#7f7f7f", "grey"],
] as const) {
  const name = nameShade(hex);
  const { c } = hexToOklch(hex);
  if (c >= 0.035) continue;
  if (name !== expected) fail(`${hex} (chroma ${c.toFixed(3)}) named "${name}", expected "${expected}"`);
}

if (failures > 0) {
  console.error(`\nSHADE NAME CHECKS FAILED: ${failures}`);
  process.exit(1);
}
console.log("SHADE NAME CHECKS PASSED");
