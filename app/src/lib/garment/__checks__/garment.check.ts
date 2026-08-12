/**
 * Garment palette checks, on synthetic images — no decoding, no network, no API units.
 *
 * Each case is a failure mode that would silently produce wrong makeup: an outfit reported as
 * one colour when it is three, the wearer's skin counted as clothing, a black outfit assigned a
 * hue invented from noise.
 *
 *   npx tsx src/lib/garment/__checks__/garment.check.ts
 */

import { extractGarmentPalette, type GarmentPalette } from "../palette";
import { hexToOklch } from "../../colorEngine/oklch";
import { CUTOUT_HAIR, CUTOUT_SIZE, CUTOUT_SKIN, realCutoutPixels } from "./realCutout";

// Node-only script; the app tsconfig is browser-targeted and has no node types.
declare const process: { exit(code: number): never };

let fails = 0;
const fail = (m: string) => {
  console.log(`  FAIL ${m}`);
  fails++;
};

const W = 120;
const H = 120;

interface Band {
  /** Fraction of the height this band occupies, top to bottom. */
  height: number;
  hex: string;
  /** Transparent — i.e. removed by the background step. */
  cut?: boolean;
}

/** Paint horizontal bands, as an outfit stacks: hair, face, top, trousers. */
function bands(spec: Band[]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  let y = 0;
  for (const band of spec) {
    const until = Math.min(H, y + Math.round(band.height * H));
    for (; y < until; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        px[i] = parseInt(band.hex.slice(1, 3), 16);
        px[i + 1] = parseInt(band.hex.slice(3, 5), 16);
        px[i + 2] = parseInt(band.hex.slice(5, 7), 16);
        px[i + 3] = band.cut ? 0 : 255;
      }
    }
  }
  return px;
}

const hueGap = (a: string, b: string) => Math.abs(((hexToOklch(a).h - hexToOklch(b).h + 540) % 360) - 180);
const show = (p: GarmentPalette) =>
  p.swatches.map((s) => `${s.hex} ${(s.share * 100).toFixed(0)}%${s.chroma < 0.035 ? " (neutral)" : ""}`).join("  ");

// 1. A single-colour garment, background already removed. One swatch, right colour.
{
  const p = extractGarmentPalette(
    bands([{ height: 0.2, hex: "#000000", cut: true }, { height: 0.8, hex: "#c0182b" }]),
    W, H, { hasAlphaMask: true },
  );
  console.log(`  plain red     -> ${show(p)}`);
  if (p.swatches.length !== 1) fail(`plain red: expected 1 swatch, got ${p.swatches.length}`);
  else if (hueGap(p.swatches[0].hex, "#c0182b") > 15) fail(`plain red: read as ${p.swatches[0].hex}`);
}

// 2. The real case, and the one that made single-select wrong: cream jacket, red top, grey
//    jeans. All three must survive, ordered by area.
{
  const p = extractGarmentPalette(
    bands([
      { height: 0.15, hex: "#000000", cut: true },
      { height: 0.35, hex: "#e8dcc8" }, // cream jacket
      { height: 0.2, hex: "#c0182b" },  // red top
      { height: 0.3, hex: "#6b7280" },  // grey jeans
    ]),
    W, H, { hasAlphaMask: true },
  );
  console.log(`  three-piece   -> ${show(p)}`);
  if (p.swatches.length < 3) fail(`three-piece: only found ${p.swatches.length} of 3 colours`);
  const foundRed = p.swatches.some((s) => hueGap(s.hex, "#c0182b") < 20 && s.chroma > 0.05);
  if (!foundRed) fail("three-piece: the red top was lost");
}

// 3. The wearer must not be counted as the outfit. Skin and hair are measured values, so this is
//    exclusion by lookup rather than by heuristic.
{
  const skin = "#8a5a3b";
  const hair = "#171110";
  const spec: Band[] = [
    { height: 0.12, hex: hair },
    { height: 0.18, hex: skin },
    { height: 0.7, hex: "#2b4c8c" },
  ];
  const blind = extractGarmentPalette(bands(spec), W, H, { hasAlphaMask: true });
  const aware = extractGarmentPalette(bands(spec), W, H, { hasAlphaMask: true, skinHex: skin, hairHex: hair });
  console.log(`  worn: blind   -> ${show(blind)}`);
  console.log(`  worn: aware   -> ${show(aware)}`);

  if (aware.swatches.length !== 1) fail(`worn photo: expected only the garment, got ${aware.swatches.length} swatches`);
  if (aware.swatches.some((s) => hueGap(s.hex, skin) < 15 && s.chroma > 0.03 && s.chroma < 0.09)) {
    fail("worn photo: skin survived into the palette");
  }
}

// 4. Achromatic outfits must report neutral rather than a hue invented from noise, and must keep
//    their lightness — black and white are different briefs.
{
  const p = extractGarmentPalette(
    bands([{ height: 0.2, hex: "#000000", cut: true }, { height: 0.4, hex: "#f2f2f2" }, { height: 0.4, hex: "#141414" }]),
    W, H, { hasAlphaMask: true },
  );
  console.log(`  black + white -> ${show(p)}`);
  if (p.swatches.length !== 2) fail(`black + white: expected 2 swatches, got ${p.swatches.length}`);
  if (p.swatches.some((s) => s.chroma > 0.035)) fail("black + white: invented a hue");
  const lights = p.swatches.map((s) => hexToOklch(s.hex).l).sort((a, b) => a - b);
  if (lights[0] > 0.3 || lights[lights.length - 1] < 0.85) fail(`black + white: lightness wrong (${lights.map((l) => l.toFixed(2)).join(", ")})`);
}

// 5. Trim and piping are not the outfit — a 2% band must not earn a swatch.
{
  const p = extractGarmentPalette(
    bands([{ height: 0.15, hex: "#000000", cut: true }, { height: 0.83, hex: "#2f6b4f" }, { height: 0.02, hex: "#ffcc00" }]),
    W, H, { hasAlphaMask: true },
  );
  console.log(`  green + trim  -> ${show(p)}`);
  if (p.swatches.some((s) => hueGap(s.hex, "#ffcc00") < 20)) fail("green + trim: 2% trim became a swatch");
}

// 6. Nothing usable — degrade to an empty palette rather than throwing or inventing a colour.
{
  const p = extractGarmentPalette(bands([{ height: 1, hex: "#000000", cut: true }]), W, H, { hasAlphaMask: true });
  console.log(`  empty cutout  -> ${p.swatches.length} swatches, coverage ${p.coverage.toFixed(2)}`);
  if (p.swatches.length !== 0) fail("empty cutout: should yield no swatches");
}

// 7. A real photograph, with real light. The synthetic cases above are flat colour and cannot
//    catch what actually goes wrong: one garment splitting across its lit and shadowed sides,
//    and pale garments being mistaken for skin.
{
  const p = extractGarmentPalette(realCutoutPixels(), CUTOUT_SIZE, CUTOUT_SIZE, {
    hasAlphaMask: true,
    skinHex: CUTOUT_SKIN,
    hairHex: CUTOUT_HAIR,
  });
  console.log(`\n  real photo    -> ${show(p)}`);
  console.log(`  coverage ${p.coverage.toFixed(2)}`);

  // Ground truth: cream jacket, red top, grey jeans, black boots.
  // Chroma > 0.1 so a skin remnant, which sits near red in hue but is far duller, cannot pass
  // as the red top.
  const reds = p.swatches.filter((s) => s.chroma > 0.1 && hueGap(s.hex, "#b01c1d") < 25);
  if (reds.length === 0) fail("real photo: the red top was not found");
  if (reds.length > 1) fail(`real photo: the red top split into ${reds.length} swatches`);

  const cream = p.swatches.find((s) => hexToOklch(s.hex).l > 0.7);
  if (!cream) fail("real photo: the cream jacket was lost, probably to the skin filter");
  else if (p.swatches.some((s) => s.chroma > 0.05 && s.chroma < 0.09 && hueGap(s.hex, CUTOUT_SKIN) < 25))
    fail("real photo: shadowed skin survived into the palette");
  else if (cream.share < 0.1) fail(`real photo: cream jacket only ${(cream.share * 100).toFixed(0)}% of the outfit`);
}

console.log(fails === 0 ? "\nGARMENT CHECKS PASSED" : `\n${fails} GARMENT FAILURES`);
if (fails) process.exit(1);
