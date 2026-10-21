/**
 * Historical card-data inventory and cleanup — security brief 2026-10-21,
 * batch 2 (S04). Plan: docs/security/payment-card-cleanup.md.
 *
 *   npx tsx scripts/payment-card-inventory.ts            # dry run (default)
 *   npx tsx scripts/payment-card-inventory.ts --apply --actor=<userId>
 *                                                       # local/test DB ONLY;
 *                                                       # actor = the person running it
 *   ... --report=path.json                               # write the report
 *
 * LOCAL ONLY. It refuses any DATABASE_URL whose host isn't localhost /
 * 127.0.0.1 — there is no override flag. Running this against production is
 * a separately reviewed change, not a flag (see the plan).
 *
 * It never prints, logs or writes a payment value: the report holds record
 * ids, classifications and the key NAMES found, nothing else.
 *
 * What --apply does to a record holding card data (and ONLY those records):
 *   - removes the encrypted `raw` copy (the only place a full PAN/CCV lived);
 *   - removes card keys from the open mask EXCEPT `lastFour`/`cardType`, which
 *     stay so the financial record still says how the family once paid;
 *   - leaves `paymentMethod` as "credit_card" (history), never touches a
 *     bank_account record, and writes one ActivityLog row per record.
 * Bank records are excluded by construction: a record is only a candidate
 * when its decrypted copy contains a card value.
 */
import { writeFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";
import { decryptField } from "../src/lib/field-encryption";
import { CARD_FIELD_KEYS, hasCardFields } from "../src/lib/payment-details";

const apply = process.argv.includes("--apply");
const reportPath = process.argv.find((a) => a.startsWith("--report="))?.slice("--report=".length);
const actorId = process.argv.find((a) => a.startsWith("--actor="))?.slice("--actor=".length);

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // fall through
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error("⛔ Refusing to run: DATABASE_URL is not a local database. This script is local/test only.");
    process.exit(1);
  }
}

type Classification = "bank_only" | "card_data" | "no_encrypted_copy" | "undecryptable" | "card_keys_in_open_mask";

const KEEP_IN_MASK = new Set(["lastFour", "cardType"]);
const CARD_KEYS = new Set<string>(CARD_FIELD_KEYS);

async function main() {
  assertLocalDatabase();
  const prisma = new PrismaClient();
  // Every removal is attributed to the person who ran it.
  if (apply) {
    const actor = actorId ? await prisma.user.findUnique({ where: { id: actorId }, select: { active: true } }) : null;
    if (!actor?.active) {
      console.error("⛔ --apply needs --actor=<id of the active user running this cleanup>.");
      process.exit(1);
    }
  }
  const rows = await prisma.enrolmentSubmission.findMany({
    where: { paymentDetails: { not: Prisma.DbNull } },
    select: { id: true, paymentMethod: true, paymentDetails: true },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    scanned: rows.length,
    counts: {} as Record<Classification, number>,
    candidates: [] as { id: string; paymentMethod: string | null; classes: Classification[]; cardKeyNames: string[] }[],
    cleaned: [] as string[],
    failed: [] as { id: string; reason: string }[],
  };
  const bump = (c: Classification) => (report.counts[c] = (report.counts[c] ?? 0) + 1);

  for (const row of rows) {
    const pd = (row.paymentDetails ?? {}) as Record<string, unknown>;
    const classes: Classification[] = [];
    const cardKeyNames = new Set<string>();

    for (const k of Object.keys(pd)) {
      if (CARD_KEYS.has(k) && !KEEP_IN_MASK.has(k) && !["expiryMonth", "expiryYear"].includes(k)) cardKeyNames.add(`mask.${k}`);
    }
    if (cardKeyNames.size) classes.push("card_keys_in_open_mask");

    if (typeof pd.raw !== "string") {
      classes.push("no_encrypted_copy");
    } else {
      try {
        const decrypted = JSON.parse(decryptField(pd.raw)) as Record<string, unknown>;
        if (hasCardFields(decrypted)) {
          classes.push("card_data");
          for (const [k, v] of Object.entries(decrypted)) {
            if (CARD_KEYS.has(k) && typeof v === "string" && v.trim() !== "") cardKeyNames.add(`raw.${k}`);
          }
        } else {
          classes.push("bank_only");
        }
      } catch {
        classes.push("undecryptable");
      }
    }
    classes.forEach(bump);

    const isCandidate = classes.includes("card_data") || classes.includes("card_keys_in_open_mask");
    if (!isCandidate) continue;
    report.candidates.push({ id: row.id, paymentMethod: row.paymentMethod, classes, cardKeyNames: [...cardKeyNames].sort() });

    if (!apply) continue;
    // Never a bank record: a bank_account row whose copy is bank-only can't
    // reach here; a bank_account row WITH card values is reported, not changed.
    if (row.paymentMethod === "bank_account") {
      report.failed.push({ id: row.id, reason: "bank_account record holds card values — needs manual review" });
      continue;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(pd)) {
      if (k === "raw") continue;
      if (CARD_KEYS.has(k) && !KEEP_IN_MASK.has(k)) continue;
      cleaned[k] = v;
    }
    try {
      await prisma.$transaction([
        prisma.enrolmentSubmission.update({ where: { id: row.id }, data: { paymentDetails: cleaned as Prisma.InputJsonValue } }),
        prisma.activityLog.create({
          data: {
            userId: actorId!,
            action: "payment_card_data_removed",
            entityType: "EnrolmentSubmission",
            entityId: row.id,
            details: { removed: [...cardKeyNames].sort(), kept: Object.keys(cleaned).sort() },
          },
        }),
      ]);
      report.cleaned.push(row.id);
    } catch (err) {
      report.failed.push({ id: row.id, reason: err instanceof Error ? err.name : "error" });
    }
  }

  const summary = {
    mode: report.mode,
    scanned: report.scanned,
    counts: report.counts,
    candidates: report.candidates.length,
    cleaned: report.cleaned.length,
    failed: report.failed.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report (ids and key names only) written to ${reportPath}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Inventory failed:", err instanceof Error ? err.name : "error");
  process.exit(1);
});
