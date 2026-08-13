/**
 * Isolate which effect the Makeup VTO API rejects.
 *
 * The API's only failure detail is the string `invalid_parameter` — it does not say which effect
 * or field. So this sends each effect on its own, then the whole look, and prints what came back.
 *
 * Costs almost nothing: a task is only charged when it *succeeds*, so every rejected probe is
 * free, and the passing ones are 1 unit each. It renders Perfect Corp's own sample face by URL,
 * so no upload and no personal photo is involved.
 *
 *   npx tsx --env-file=.env.local src/lib/colorEngine/__checks__/vtoProbe.ts
 */

import { fillLooks } from "../template";
import { ANALYSIS_FIXTURES } from "../../fixtures/analysisFixtures";
import type { MakeupEffect } from "../../youcam/types";

// Node-only script; the app tsconfig is browser-targeted and has no node types.
declare const process: { env: Record<string, string | undefined> };

const API_KEY = process.env.YOUCAM_API_KEY;
const BASE_URL = "https://yce-api-01.makeupar.com";
const SAMPLE = "https://plugins-media.makeupar.com/strapi/assets/sample_Image_1_202b6bf6e6.jpg";

if (!API_KEY) throw new Error("YOUCAM_API_KEY missing — run with --env-file=.env.local");

const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

async function runVto(effects: MakeupEffect[]): Promise<string> {
  const start = await fetch(`${BASE_URL}/s2s/v2.0/task/makeup-vto`, {
    method: "POST",
    headers,
    body: JSON.stringify({ src_file_url: SAMPLE, effects, version: "1.0" }),
  });
  const startBody = await start.text();
  if (!start.ok) return `REJECTED AT START ${start.status}: ${startBody}`;

  const taskId = (JSON.parse(startBody) as { data: { task_id: string } }).data.task_id;

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${BASE_URL}/s2s/v2.0/task/makeup-vto/${taskId}`, { headers });
    const body = (await res.json()) as {
      data: { task_status: string; failure_reason?: string; error?: string; results?: { url: string } };
    };
    const { task_status, failure_reason, error } = body.data;
    if (task_status === "success") return "OK";
    if (task_status === "error") return `FAILED: ${failure_reason ?? error ?? "unknown"}`;
  }
  return "TIMED OUT";
}

const fixture = ANALYSIS_FIXTURES[0];
const looks = fillLooks(fixture.colors, fixture.fitzpatrick);

for (const look of looks) {
  console.log(`\n--- ${look.label} (${look.templateId}) ---`);

  // The whole look first: when it passes, that is the only answer we need and it costs 1 unit.
  const combined = await runVto(look.effects);
  console.log(`  ${"all effects".padEnd(12)} ${combined}`);
  if (combined === "OK") continue;

  // It failed, and the API will not say which effect — so send them one at a time. Each of
  // these that fails is free; the ones that pass cost a unit apiece.
  for (const effect of look.effects) {
    console.log(`  ${effect.category.padEnd(12)} ${await runVto([effect])}`);
  }
}
