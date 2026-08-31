/**
 * Staff recovery importer — rebuilds User accounts + re-attaches contract PDFs
 * from the finalised payroll/contract merge sheet, after the 2026-07-07 wipe.
 *
 * Reads the finalised CSV (name,email,role_mapped,...,bank_details,tax_file_number,
 * contract_files) and:
 *   - upserts a User per row with all HR fields (TFN encrypted with the app's
 *     own encrypt(); bank fields plain, matching how the app stores them)
 *   - re-attaches each contract PDF as a Document (category hr, assignedTo the
 *     staff member), pointing at the intact blob that survived the wipe
 *
 * DATABASE_URL (.env.local) currently points at production — the recovery target.
 *
 * Usage:
 *   npx tsx scripts/recover-staff-from-payroll.ts           # DRY RUN, no writes
 *   npx tsx scripts/recover-staff-from-payroll.ts --commit  # apply
 */
import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

// ── load .env.local (DATABASE_URL, XERO_ENCRYPTION_KEY, BLOB_READ_WRITE_TOKEN) ──
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}

const COMMIT = process.argv.includes("--commit");
const WITH_TFN = process.argv.includes("--with-tfn"); // gated: needs confirmed XERO_ENCRYPTION_KEY == prod
const CSV = process.argv.find((a) => a.endsWith(".csv")) ||
  "/private/tmp/claude-503/-Users-jaydenkowaider-Developer-amana-eos-dashboard/ec8cd29d-1461-429b-a9f7-b58f7ea91189/scratchpad/amana-staff-finalised.csv";

// The 3 managers keep their existing work-email accounts (seeded). Map their
// payroll personal email -> the work email we upsert against, so we update in
// place instead of creating a duplicate.
const EMAIL_OVERRIDE: Record<string, string> = {
  "akrammaarbani@gmail.com": "akram@amanaoshc.com.au",
  "mirnz_m@hotmail.com": "mirna@amanaoshc.com.au",
  "traciee@live.com.au": "tracie@amanaoshc.com.au",
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else if (c === "\r") {} else cur += c; }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function parseDMY(s: string): Date | null {
  const m = (s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return isNaN(d.getTime()) || +m[3] < 1990 ? null : d;
}
function parseBank(raw: string) {
  const seg = (raw || "").split("|")[0].trim();
  const m = seg.match(/^(.+?)\s+(\d{6})\s*-\s*(\d+)/);
  if (!m) return { name: "", bsb: "", acct: "", note: raw || "" };
  return { name: m[1].trim(), bsb: m[2], acct: m[3], note: raw || "" };
}
const mask = (s: string) => (s ? "***(" + String(s).length + ")" : "");
function mapEmpType(s: string): string | null {
  const t = (s || "").toLowerCase();
  if (t.includes("casual")) return "casual";
  if (t.includes("part")) return "part_time";
  if (t.includes("full") || t.includes("permanent")) return "permanent";
  if (t.includes("fixed")) return "fixed_term";
  return null;
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { encrypt } = await import("@/lib/encryption");
  const { getDefaultNotificationPrefs } = await import("@/lib/notification-defaults");
  const { list } = await import("@vercel/blob");
  const bcrypt = (await import("bcryptjs")).default;
  const prisma = new PrismaClient();

  console.log(`\n=== Staff payroll recovery — ${COMMIT ? "COMMIT (writing to PROD)" : "DRY RUN (no writes)"} ===\n`);

  // pathname -> blob URL map (for Document.fileUrl)
  const urlByPath = new Map<string, string>();
  let cursor: string | undefined;
  do { const r: any = await list({ prefix: "contracts/", cursor, limit: 1000 }); for (const b of r.blobs) urlByPath.set(b.pathname, b.url); cursor = r.cursor; } while (cursor);

  const rows = parseCSV(readFileSync(CSV, "utf8")).filter(r => r.some(c => c.trim()));
  const header = rows.shift()!;
  const idx = (k: string) => header.indexOf(k);
  const records = rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])) as Record<string, string>);

  // an owner to attribute uploads to
  const owner = await prisma.user.findFirst({ where: { role: "owner" }, select: { id: true } });

  let created = 0, updated = 0, docs = 0, skipped = 0;
  for (const rec of records) {
    if (rec["likely_inactive"] === "yes") { skipped++; continue; }
    const rowEmail = rec["email"].toLowerCase().trim();
    if (!rowEmail) { skipped++; continue; }
    const email = EMAIL_OVERRIDE[rowEmail] ?? rowEmail; // managers -> work email

    const bank = parseBank(rec["bank_details"]);
    const dob = parseDMY(rec["date_of_birth"]);
    const start = parseDMY(rec["start_date_contract"]);
    const tfnPlain = rec["tax_file_number"]?.trim();

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    const keepRole = existing && ["owner", "admin"].includes(existing.role);
    const role = keepRole ? existing!.role : rec["role_mapped"];

    const common = {
      name: rec["name"],
      role: role as any,
      state: rec["postal_state"] || null,
      phone: rec["phone"] || null,
      active: true,
      dateOfBirth: dob,
      addressStreet: rec["address_line1"] || null,
      addressSuburb: rec["suburb"] || null,
      addressState: rec["postal_state"] || null,
      addressPostcode: rec["postcode"] || null,
      employmentType: mapEmpType(rec["employment_type"]) as any,
      xeroEmployeeId: rec["employee_id"] || null,
      startDate: start,
      bankAccountName: bank.name || null,
      bankBSB: bank.bsb || null,
      bankAccountNumber: bank.acct || null,
      bankDetailsNote: bank.note || null,
      ...(WITH_TFN && tfnPlain ? { taxFileNumber: encrypt(tfnPlain) } : {}),
    };

    let userId = existing?.id;
    if (existing) {
      if (COMMIT) await prisma.user.update({ where: { email }, data: common });
      updated++;
    } else {
      if (COMMIT) {
        const u = await prisma.user.create({
          data: {
            email,
            passwordHash: await bcrypt.hash(`Welcome_${Math.random().toString(36).slice(2, 10)}!`, 12),
            notificationPrefs: getDefaultNotificationPrefs(role),
            ...common,
          },
          select: { id: true },
        });
        userId = u.id;
      }
      created++;
    }

    // re-attach contract PDFs as Documents
    const files = (rec["contract_files"] || "").split("|").map(s => s.trim()).filter(Boolean);
    for (const path of files) {
      const url = urlByPath.get(path);
      if (!url) { console.warn(`  ! blob not found for ${path}`); continue; }
      if (COMMIT && userId) {
        // idempotent: skip if a doc with this url already exists
        const dup = await prisma.document.findFirst({ where: { fileUrl: url }, select: { id: true } });
        if (!dup) {
          await prisma.document.create({
            data: {
              title: `Employment Contract — ${rec["name"]}`,
              category: "hr",
              fileName: basename(path),
              fileUrl: url,
              assignedToId: userId,
              uploadedById: owner?.id ?? null,
              tags: ["contract", "recovered"],
            },
          });
        }
      }
      docs++;
    }

    console.log(`  ${existing ? "update" : "CREATE"}  ${rec["name"].padEnd(24)} ${String(role).padEnd(12)} ${email.padEnd(34)} tfn:${mask(tfnPlain)} bank:${mask(bank.acct)} contracts:${files.length}`);
  }

  console.log(`\n${COMMIT ? "APPLIED" : "PLAN"} — create:${created} update:${updated} contract-docs:${docs} skipped:${skipped}`);
  if (!COMMIT) console.log("\nDRY RUN — nothing written. Re-run with --commit to apply.\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
