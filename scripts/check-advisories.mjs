// Dependency advisory gate (security brief 2026-10-21, batch 3).
//
//   node scripts/check-advisories.mjs            # uses `npm audit --omit=dev --json`
//
// Fails when a HIGH or CRITICAL production advisory isn't covered by an
// unexpired entry in security/advisory-exceptions.json, or when an entry has
// expired. Moderate/low are reported, not blocking. Exceptions are deliberate:
// owner + reason + expiry, reviewed in docs/security/dependency-advisories.md.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BLOCKING = new Set(["high", "critical"]);
let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = err.stdout;
}
const audit = JSON.parse(raw);
const { exceptions } = JSON.parse(readFileSync(new URL("../security/advisory-exceptions.json", import.meta.url), "utf8"));
const today = new Date().toISOString().slice(0, 10);

const problems = [];
for (const e of exceptions) {
  if (!e.owner || !e.reason || !e.expires) problems.push(`Exception for ${e.packages.join(", ")} is missing owner/reason/expiry`);
  else if (e.expires < today) problems.push(`Exception for ${e.packages.join(", ")} expired on ${e.expires} (owner: ${e.owner}) — re-review it`);
}

const covered = (name) => exceptions.some((e) => e.expires >= today && e.packages.includes(name));
const report = [];
for (const [name, v] of Object.entries(audit.vulnerabilities ?? {})) {
  const ids = (v.via ?? []).filter((x) => typeof x === "object").map((x) => x.url?.split("/").pop());
  report.push(`${v.severity.padEnd(8)} ${name}${ids.length ? ` (${ids.join(", ")})` : ""}${covered(name) ? " [accepted]" : ""}`);
  if (BLOCKING.has(v.severity) && !covered(name)) problems.push(`${v.severity} advisory in ${name} is not fixed or accepted`);
}

console.log(report.sort().join("\n") || "No production advisories.");
if (problems.length) {
  console.error("\n" + problems.map((p) => `✖ ${p}`).join("\n"));
  process.exit(1);
}
console.log("\n✓ No unaccepted high/critical production advisories.");
