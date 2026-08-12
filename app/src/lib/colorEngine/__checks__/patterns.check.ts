/**
 * Verify every pattern label the templates use exists in the live catalog, with the right
 * palette count. Costs nothing — the catalogs are public JSON, no API key and no task.
 *
 * This matters because an invalid label does not fail loudly: the render task is accepted, then
 * dies with a bare `invalid_parameter` that names neither the effect nor the field.
 *
 *   npx tsx src/lib/colorEngine/__checks__/patterns.check.ts
 */

import { fillLooks } from "../template";
import { ANALYSIS_FIXTURES } from "../../fixtures/analysisFixtures";

// Node-only script; the app tsconfig is browser-targeted and has no node types.
declare const process: { exit(code: number): never };

interface CatalogEntry {
  label: string;
  colorNum?: number;
}

// The catalog filenames do not match the effect category names — `eye_shadow` is `eyeshadow.json`
// and `eye_liner` is `eyeliner.json`, and lip shapes live under /shapes/ rather than /patterns/.
const CATALOGS: Record<string, string> = {
  blush: "https://plugins-media.makeupar.com/wcm-saas/patterns/blush.json",
  eye_shadow: "https://plugins-media.makeupar.com/wcm-saas/patterns/eyeshadow.json",
  eye_liner: "https://plugins-media.makeupar.com/wcm-saas/patterns/eyeliner.json",
  eyebrows: "https://plugins-media.makeupar.com/wcm-saas/patterns/eyebrows.json",
  contour: "https://plugins-media.makeupar.com/wcm-saas/patterns/contour.json",
  highlighter: "https://plugins-media.makeupar.com/wcm-saas/patterns/highlighter.json",
  lip_color: "https://plugins-media.makeupar.com/wcm-saas/shapes/lipshape.json",
  eyelashes: "https://plugins-media.makeupar.com/wcm-saas/patterns/eyelashes.json",
  lip_liner: "https://plugins-media.makeupar.com/wcm-saas/patterns/lipliner.json",
};

const catalogs = new Map<string, Map<string, CatalogEntry>>();
for (const [category, url] of Object.entries(CATALOGS)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catalog fetch failed for ${category}: ${res.status}`);
  const entries = (await res.json()) as CatalogEntry[];
  catalogs.set(category, new Map(entries.map((e) => [e.label, e])));
}

const failures: string[] = [];
const seen = new Set<string>();

// One fixture is enough: templates are structural, so the patterns they use are the same for
// everyone. Only the colours vary.
for (const look of fillLooks(ANALYSIS_FIXTURES[0].colors, ANALYSIS_FIXTURES[0].fitzpatrick)) {
  for (const effect of look.effects) {
    const catalog = catalogs.get(effect.category);
    if (!catalog) continue; // skin_smooth has no pattern catalog

    const name =
      "pattern" in effect ? effect.pattern.name : "shape" in effect ? effect.shape.name : undefined;
    if (!name) {
      failures.push(`${look.templateId}/${effect.category}: no pattern name`);
      continue;
    }

    const entry = catalog.get(name);
    if (!entry) {
      failures.push(`${look.templateId}/${effect.category}: "${name}" is not in the catalog`);
      continue;
    }

    // A pattern declaring colorNum requires exactly that many palette entries.
    if ("palettes" in effect && entry.colorNum !== undefined && effect.palettes.length !== entry.colorNum) {
      failures.push(
        `${look.templateId}/${effect.category}: "${name}" needs ${entry.colorNum} palette(s), got ${effect.palettes.length}`,
      );
    }
    seen.add(`${effect.category}/${name}`);
  }
}

for (const key of [...seen].sort()) console.log(`  ok  ${key}`);

if (failures.length) {
  console.error("\nPATTERN CHECKS FAILED");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\nPATTERN CHECKS PASSED — ${seen.size} distinct patterns across all templates`);
