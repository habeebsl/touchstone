#!/usr/bin/env node
/**
 * Every offline check, in one command.
 *
 *   npm run checks
 *
 * These are the project's evidence, not just its safety net: each suite asserts a property the
 * product actually claims, and several of them are named after the failure they were written in
 * response to. They run without network and without API units, so they can be run on every change
 * — which matters when a full analysis costs 33 units and there are a few hundred left.
 *
 * The probes alongside them (browProbe, vtoProbe, realCutout) are excluded deliberately: those
 * call the live API, cost units, and exist to answer a question once rather than to be re-run.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;

/** Every *.check.ts under src, so a new suite is picked up without editing this file. */
function findChecks(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findChecks(path));
    else if (entry.name.endsWith(".check.ts")) found.push(path);
  }
  return found.sort();
}

const checks = findChecks(join(ROOT, "src"));
if (checks.length === 0) {
  console.error("No *.check.ts files found under src.");
  process.exit(1);
}

let failed = 0;
for (const file of checks) {
  const name = relative(join(ROOT, "src"), file);
  process.stdout.write(`\n[1m${name}[0m\n`);
  const run = spawnSync("npx", ["tsx", file], { cwd: ROOT, stdio: "inherit" });
  if (run.status !== 0) failed++;
}

console.log(
  failed === 0
    ? `\n[32mAll ${checks.length} check suites passed.[0m`
    : `\n[31m${failed} of ${checks.length} check suites failed.[0m`,
);
process.exit(failed === 0 ? 0 : 1);
