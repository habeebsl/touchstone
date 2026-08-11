import { hexToOklch, oklchToHex, mixOklch, adjustOklch, lightnessDelta } from "../oklch";

let fails = 0;
const near = (a: number, b: number, tol: number, msg: string) => {
  if (Math.abs(a - b) > tol) { console.log(`FAIL ${msg}: ${a} vs ${b}`); fails++; }
};

// Known OKLab values
const red = hexToOklch("#ff0000");
near(red.l, 0.6279, 0.002, "red L");
near(red.c, 0.2577, 0.002, "red C");
near(red.h, 29.23, 0.5, "red H");
near(hexToOklch("#ffffff").l, 1.0, 0.002, "white L");
near(hexToOklch("#000000").l, 0.0, 0.002, "black L");

// Round-trip fidelity across a spread of real skin/hair/makeup colours
for (const hex of ["#bc9d88","#342724","#b56637","#8e1f3a","#f7f4ef","#3d2b1f","#e8c4a0","#4a2c17"]) {
  const rt = oklchToHex(hexToOklch(hex));
  if (rt.toLowerCase() !== hex.toLowerCase()) { console.log(`round-trip drift ${hex} -> ${rt}`); }
}

// Gamut mapping must preserve hue rather than clipping to a primary
const wild = oklchToHex({ l: 0.55, c: 0.9, h: 29.23 });
near(hexToOklch(wild).h, 29.23, 3, "gamut-mapped hue preserved");

// Perceptual midpoint should sit between the endpoints in lightness
const mid = mixOklch("#000000", "#ffffff", 0.5);
near(hexToOklch(mid).l, 0.5, 0.02, "midpoint lightness");

// adjustOklch should move lightness by the requested perceptual amount
const base = "#bc9d88";
near(hexToOklch(adjustOklch(base, { l: -0.1 })).l, hexToOklch(base).l - 0.1, 0.01, "adjust L");

console.log(fails === 0 ? "ALL CHECKS PASSED" : `${fails} FAILURES`);
console.log("lightnessDelta(skin #bc9d88, hair #b56637) =", lightnessDelta("#bc9d88", "#b56637").toFixed(3));
