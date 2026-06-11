/**
 * Backfill the responsible-person register.
 *
 * Idempotent: every row is upserted on the (serviceId, date, sessionType)
 * unique key, so re-running with the same data is a no-op (and re-running
 * with corrected data just overwrites). Built for the Unity Grammar
 * April→now backfill, but works for any service.
 *
 * Usage:
 *   # 1) edit the inline ENTRIES below, then:
 *   npx tsx scripts/backfill-responsible-person.ts
 *
 *   # …or point at a JSON file (array of the same shape):
 *   npx tsx scripts/backfill-responsible-person.ts data/unity-rp.json
 *
 *   # preview without writing:
 *   npx tsx scripts/backfill-responsible-person.ts --dry
 *   npx tsx scripts/backfill-responsible-person.ts data/unity-rp.json --dry
 *
 * Each entry:
 *   {
 *     "service": "UNITY",      // Service.code (preferred) or exact name
 *     "date":    "2026-04-28", // YYYY-MM-DD
 *     "session": "bsc",        // bsc | asc | vc
 *     "name":    "Sara Ahmed", // responsible person's full name
 *     "role":    "Director of Service", // optional position
 *     "on":      "06:30",      // optional — defaults from the session window
 *     "off":     "08:30",      // optional — defaults from the session window
 *     "notes":   ""            // optional
 *   }
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_SESSION_TIMES,
  isHhMm,
  isIsoDate,
  isRpSessionType,
  type RpSessionType,
} from "../src/lib/responsible-person";

// Best-effort env load so the script picks up the local DATABASE_URL the
// same way the dev server does. Guarded — if dotenv isn't present the
// PrismaClient will still use whatever's already in process.env.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require("dotenv");
  dotenv.config({ path: ".env.local" });
  dotenv.config();
} catch {
  /* dotenv optional */
}

const prisma = new PrismaClient();

interface BackfillEntry {
  service: string;
  date: string;
  session: RpSessionType;
  name: string;
  role?: string | null;
  on?: string;
  off?: string;
  notes?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Inline data — paste the Unity Grammar (or any service) records here, or
// pass a JSON file path as the first argument instead.
// ─────────────────────────────────────────────────────────────────────────
const ENTRIES: BackfillEntry[] = [
  // {
  //   service: "UNITY",
  //   date: "2026-04-28",
  //   session: "bsc",
  //   name: "Sara Ahmed",
  //   role: "Director of Service",
  // },
];

function loadEntries(): { entries: BackfillEntry[]; dry: boolean; source: string } {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const fileArg = args.find((a) => !a.startsWith("--"));
  if (fileArg) {
    const raw = readFileSync(fileArg, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${fileArg} must contain a JSON array of entries`);
    }
    return { entries: parsed as BackfillEntry[], dry, source: fileArg };
  }
  return { entries: ENTRIES, dry, source: "inline ENTRIES" };
}

function validate(e: BackfillEntry, i: number): string[] {
  const errs: string[] = [];
  if (!e.service) errs.push("missing service");
  if (!isIsoDate(e.date)) errs.push(`bad date "${e.date}" (want YYYY-MM-DD)`);
  if (!isRpSessionType(e.session)) errs.push(`bad session "${e.session}"`);
  if (!e.name || !e.name.trim()) errs.push("missing name");
  if (e.on && !isHhMm(e.on)) errs.push(`bad on "${e.on}"`);
  if (e.off && !isHhMm(e.off)) errs.push(`bad off "${e.off}"`);
  return errs.length ? [`Row ${i + 1}: ${errs.join("; ")}`] : [];
}

async function main() {
  const { entries, dry, source } = loadEntries();
  console.log(
    `Responsible-person backfill — ${entries.length} row(s) from ${source}${
      dry ? " (DRY RUN — no writes)" : ""
    }\n`,
  );

  if (entries.length === 0) {
    console.log("No entries to process. Edit ENTRIES or pass a JSON file.");
    return;
  }

  // Validate everything up front — fail loudly before touching the DB.
  const allErrors = entries.flatMap(validate);
  if (allErrors.length) {
    console.error("Validation failed:\n" + allErrors.join("\n"));
    process.exitCode = 1;
    return;
  }

  // Resolve services by code (preferred) then exact name. Cache lookups.
  const serviceCache = new Map<string, { id: string; name: string }>();
  async function resolveService(ref: string) {
    if (serviceCache.has(ref)) return serviceCache.get(ref)!;
    const svc =
      (await prisma.service.findUnique({
        where: { code: ref },
        select: { id: true, name: true },
      })) ??
      (await prisma.service.findFirst({
        where: { name: ref },
        select: { id: true, name: true },
      }));
    if (!svc) throw new Error(`Service not found for "${ref}" (by code or name)`);
    serviceCache.set(ref, svc);
    return svc;
  }

  let created = 0;
  let updated = 0;
  for (const [i, e] of entries.entries()) {
    const svc = await resolveService(e.service);
    const session = e.session;
    const defaults = DEFAULT_SESSION_TIMES[session];
    const startTime = e.on ?? defaults.start;
    const endTime = e.off ?? defaults.end;
    const date = new Date(`${e.date}T00:00:00.000Z`);

    const label = `${svc.name} · ${e.date} · ${session.toUpperCase()} → ${e.name}`;
    if (dry) {
      console.log(`  [dry] ${label} (${startTime}-${endTime})`);
      continue;
    }

    const existing = await prisma.responsiblePersonEntry.findUnique({
      where: {
        serviceId_date_sessionType: { serviceId: svc.id, date, sessionType: session },
      },
      select: { id: true },
    });

    await prisma.responsiblePersonEntry.upsert({
      where: {
        serviceId_date_sessionType: { serviceId: svc.id, date, sessionType: session },
      },
      create: {
        serviceId: svc.id,
        date,
        sessionType: session,
        personName: e.name.trim(),
        personRole: e.role?.trim() || null,
        startTime,
        endTime,
        notes: e.notes?.trim() || null,
      },
      update: {
        personName: e.name.trim(),
        personRole: e.role?.trim() || null,
        startTime,
        endTime,
        notes: e.notes?.trim() || null,
      },
    });

    if (existing) {
      updated++;
      console.log(`  ~ updated  ${label}`);
    } else {
      created++;
      console.log(`  + created  ${label}`);
    }
    void i;
  }

  if (!dry) {
    console.log(`\nDone. ${created} created, ${updated} updated.`);
  } else {
    console.log(`\nDry run complete — ${entries.length} row(s) would be written.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
