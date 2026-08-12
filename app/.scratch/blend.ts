import { hexToOklch, deltaE, oklchToHex } from "/workspaces/undertone/app/src/lib/colorEngine/oklch";
import { selectLooks } from "/workspaces/undertone/app/src/lib/colorEngine/template";
import { ANALYSIS_FIXTURES } from "/workspaces/undertone/app/src/lib/fixtures/analysisFixtures";

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

const multiply = (b: number, s: number) => b * s;
const screen = (b: number, s: number) => b + s - b * s;
const overlay = (b: number, s: number) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s));
const softLight = (b: number, s: number) => {
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (d - b);
};

const MODES = { multiply, screen, overlay, "soft-light": softLight };

// Alpha-composite the blended result back over the base, as canvas globalAlpha does.
function apply(baseHex: string, tintHex: string, mode: keyof typeof MODES, alpha: number) {
  const base = toRgb(baseHex);
  const tint = toRgb(tintHex);
  const blended = base.map((b, i) => MODES[mode](b, tint[i]));
  return toHex(base.map((b, i) => b + (blended[i] - b) * alpha));
}

for (const fx of [ANALYSIS_FIXTURES[1], ANALYSIS_FIXTURES[3], ANALYSIS_FIXTURES[6]]) {
  const look = selectLooks(fx.colors, fx.fitzpatrick).find((l) => l.register === "polished")!;
  const skin = fx.colors.skin_color;
  console.log(`\n${fx.label}  skin ${skin} (L ${hexToOklch(skin).l.toFixed(2)})  blush ${look.blushColor}`);
  for (const mode of Object.keys(MODES) as Array<keyof typeof MODES>) {
    const out = apply(skin, look.blushColor, mode, 0.45);
    const dE = deltaE(out, skin);
    const dL = hexToOklch(out).l - hexToOklch(skin).l;
    console.log(`  ${mode.padEnd(11)} -> ${out}  visible dE ${dE.toFixed(3)}  lightness ${dL >= 0 ? "+" : ""}${dL.toFixed(3)}`);
  }
}
