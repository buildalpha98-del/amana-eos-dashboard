import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Guards that keep Knox wired in.
 *
 * Every writer of the incident / complaint / staff-incident registers must
 * hand the record to Knox after it commits, and Knox's own tables are written
 * only from inside src/lib/knox. Without the first, a new writer silently
 * produces records nobody triages; without the second, a stray write could
 * mint a card or a pending action that skipped the worker's rules.
 */
const SRC_ROOT = join(__dirname, "..", "..");

const WRITERS = [
  "app/api/incidents/route.ts",
  "app/api/incidents/[id]/route.ts",
  "app/api/compliance/complaints/route.ts",
  "app/api/compliance/complaints/[id]/route.ts",
  "app/api/services/[id]/staff-incidents/route.ts",
  "app/api/cowork/operations/incidents/route.ts",
  "lib/owna-sync.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("Knox wiring guards", () => {
  it("every register writer calls triggerTriage or enqueueTriage", () => {
    const offenders = WRITERS.filter(
      (rel) => !/\b(triggerTriage|enqueueTriage)\s*\(/.test(readFileSync(join(SRC_ROOT, rel), "utf8")),
    );
    expect(
      offenders,
      "These register writers never hand their record to Knox. Call triggerTriage() from @/lib/knox/trigger after the write commits.",
    ).toEqual([]);
  });

  it("the two PATCH routes no longer call prisma.incidentRecord.update / prisma.complaintRecord.update directly", () => {
    const incidentPatch = readFileSync(join(SRC_ROOT, "app/api/incidents/[id]/route.ts"), "utf8");
    const complaintPatch = readFileSync(
      join(SRC_ROOT, "app/api/compliance/complaints/[id]/route.ts"),
      "utf8",
    );
    expect(incidentPatch).not.toMatch(/prisma\.incidentRecord\.update\s*\(/);
    expect(complaintPatch).not.toMatch(/prisma\.complaintRecord\.update\s*\(/);
  });

  it("no file outside src/lib/knox writes triageAssessment or pendingAction rows", () => {
    const WRITE = /(triageAssessment|pendingAction)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
    const offenders = walk(SRC_ROOT)
      .map((f) => relative(SRC_ROOT, f))
      .filter((rel) => !rel.startsWith("lib/knox/"))
      .filter((rel) => WRITE.test(readFileSync(join(SRC_ROOT, rel), "utf8")));
    expect(
      offenders,
      "Only src/lib/knox may write triage assessments or pending actions.",
    ).toEqual([]);
  });
});
