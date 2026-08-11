/**
 * Narrow down *why* the eyebrows effect is rejected. Same economics as vtoProbe: rejected tasks
 * are free, so this costs one unit per variant that actually works.
 *
 *   npx tsx --env-file=.env.local src/lib/colorEngine/__checks__/browProbe.ts
 */

// Node-only script; the app tsconfig is browser-targeted and has no node types.
declare const process: { env: Record<string, string | undefined> };

const API_KEY = process.env.VITE_YOUCAM_API_KEY;
const BASE_URL = "https://yce-api-01.makeupar.com";
const SAMPLE = "https://plugins-media.makeupar.com/strapi/assets/sample_Image_1_202b6bf6e6.jpg";

if (!API_KEY) throw new Error("VITE_YOUCAM_API_KEY missing — run with --env-file=.env.local");

const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

async function run(effect: unknown): Promise<string> {
  const start = await fetch(`${BASE_URL}/s2s/v2.0/task/makeup-vto`, {
    method: "POST",
    headers,
    body: JSON.stringify({ src_file_url: SAMPLE, effects: [effect], version: "1.0" }),
  });
  const body = await start.text();
  if (!start.ok) return `REJECTED ${start.status}: ${body}`;
  const taskId = (JSON.parse(body) as { data: { task_id: string } }).data.task_id;

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${BASE_URL}/s2s/v2.0/task/makeup-vto/${taskId}`, { headers });
    const json = (await res.json()) as {
      data: { task_status: string; failure_reason?: string; error?: string };
    };
    if (json.data.task_status === "success") return "OK";
    if (json.data.task_status === "error") return `FAILED: ${json.data.failure_reason ?? json.data.error}`;
  }
  return "TIMED OUT";
}

const colour = "#5a4030";
const palette = { color: colour, colorIntensity: 45, texture: "matte" };

const variants: Array<[string, unknown]> = [
  ["current (shape + name only)", { category: "eyebrows", pattern: { type: "shape", name: "Original2" }, palettes: [palette] }],
  ["shape + all shape fields", { category: "eyebrows", pattern: { type: "shape", name: "Original2", curvature: 0, thickness: 0, definition: 50 }, palettes: [palette] }],
  ["name only, no type", { category: "eyebrows", pattern: { name: "Original2" }, palettes: [palette] }],
  ["type=color, no name", { category: "eyebrows", pattern: { type: "color" }, palettes: [palette] }],
  ["shape, palette without texture", { category: "eyebrows", pattern: { type: "shape", name: "Original2" }, palettes: [{ color: colour, colorIntensity: 45 }] }],
  ["shape name from another category", { category: "eyebrows", pattern: { type: "shape", name: "Arrow1", curvature: 0, thickness: 0, definition: 50 }, palettes: [palette] }],
];

for (const [label, effect] of variants) {
  console.log(`${label.padEnd(34)} ${await run(effect)}`);
}
