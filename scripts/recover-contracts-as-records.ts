/**
 * Create EmploymentContract records from the recovered contract PDFs so they
 * show in the staff ContractsTab (not just Documents). Extracts hourly pay +
 * start date from each PDF; maps contractType/awardLevel from the payroll sheet.
 *
 * Reads the finalised CSV (email, employment_type, job_title, contract_files).
 * Idempotent: skips a contract whose documentUrl already has a record.
 *
 * Usage:
 *   npx tsx scripts/recover-contracts-as-records.ts [sheet.csv]           # DRY RUN
 *   npx tsx scripts/recover-contracts-as-records.ts [sheet.csv] --commit  # apply
 */
import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue;
  let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}
const COMMIT = process.argv.includes("--commit");
const CSV = process.argv.find((a) => a.endsWith(".csv")) ||
  "/private/tmp/claude-503/-Users-jaydenkowaider-Developer-amana-eos-dashboard/ec8cd29d-1461-429b-a9f7-b58f7ea91189/scratchpad/amana-staff-finalised.csv";
const EMAIL_OVERRIDE: Record<string, string> = {
  "akrammaarbani@gmail.com": "akram@amanaoshc.com.au",
  "mirnz_m@hotmail.com": "mirna@amanaoshc.com.au",
  "traciee@live.com.au": "tracie@amanaoshc.com.au",
};

function parseCSV(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; } else if (c === "\r") {} else cur += c; } }
  if (cur.length || row.length) { row.push(cur); rows.push(row); } return rows;
}
function parseDMY(s: string): Date | null {
  const m = (s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return isNaN(d.getTime()) || +m[3] < 1990 ? null : d;
}
function ctype(s: string): string {
  const t = (s || "").toLowerCase();
  if (t.includes("casual")) return "ct_casual";
  if (t.includes("part")) return "ct_part_time";
  if (t.includes("fixed")) return "ct_fixed_term";
  return "ct_permanent";
}
function award(job: string): string | null {
  const t = (job || "").toLowerCase();
  const lvl = t.match(/(?:cse\s*level|level)\s*(\d)/); if (lvl) return "cs" + lvl[1];
  if (t.includes("director")) return "director";
  if (t.includes("coordinator")) return "coordinator";
  return null;
}
function extractPay(text: string): { rate: number | null; source: string } {
  const f = text.replace(/\s+/g, " ");
  let m = f.match(/\$\s?(\d{1,3}(?:\.\d{1,2})?)\s*(?:per\s*hour|\/\s*hour|\/hr\b|an hour|hourly|ph\b)/i);
  if (m) return { rate: +m[1], source: "hourly" };
  m = f.match(/(?:ordinary|base|hourly)[^$]{0,25}\$\s?(\d{1,3}(?:\.\d{1,2})?)/i);
  if (m) return { rate: +m[1], source: "hourly-rate" };
  m = f.match(/\$\s?(\d{2,3},\d{3})(?:\.\d{2})?\s*(?:per annum|p\.?a\.?|gross|annum|per year)/i);
  if (m) return { rate: +(+m[1].replace(/,/g, "") / 52 / 38).toFixed(2), source: "annual/38h" };
  const c = [...f.matchAll(/\$\s?(\d{2,3}(?:\.\d{2})?)/g)].map((x) => +x[1]).filter((n) => n >= 20 && n <= 80);
  if (c.length) return { rate: c[0], source: "GUESS-verify" };
  return { rate: null, source: "none" };
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { list } = await import("@vercel/blob");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const prisma = new PrismaClient();

  const urlByPath = new Map<string, string>(); const dateByPath = new Map<string, Date>();
  let cursor: string | undefined;
  do { const r: any = await list({ prefix: "contracts/", cursor, limit: 1000 }); for (const b of r.blobs) { urlByPath.set(b.pathname, b.url); dateByPath.set(b.pathname, new Date(b.uploadedAt)); } cursor = r.cursor; } while (cursor);

  const rows = parseCSV(readFileSync(CSV, "utf8")).filter((r) => r.some((c) => c.trim()));
  const header = rows.shift()!;
  const recs = rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])) as Record<string, string>);

  type C = { userId: string; name: string; url: string; path: string; type: string; pay: number | null; paySrc: string; start: Date; award: string | null };
  const built: C[] = [];
  for (const rec of recs) {
    if (rec["likely_inactive"] === "yes") continue;
    const email = EMAIL_OVERRIDE[rec["email"].toLowerCase().trim()] ?? rec["email"].toLowerCase().trim();
    const files = (rec["contract_files"] || "").split("|").map((s) => s.trim()).filter(Boolean);
    if (!files.length) continue;
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) { console.warn(`  ! no user for ${email}`); continue; }
    for (const path of files) {
      const url = urlByPath.get(path); if (!url) { console.warn(`  ! blob missing ${path}`); continue; }
      let pay = { rate: null as number | null, source: "none" }; let start: Date | null = parseDMY(rec["start_date_contract"]);
      try {
        const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
        pay = extractPay(text as string);
        if (!start) { const d = (text as string).replace(/\s+/g, " ").match(/commencement date of your employment is\s*\.?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] || (text as string).match(/\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/)?.[1]; start = parseDMY(d || ""); }
      } catch { /* keep fallbacks */ }
      built.push({ userId: u.id, name: rec["name"], url, path, type: ctype(rec["employment_type"]), pay: pay.rate, paySrc: pay.source, start: start ?? dateByPath.get(path) ?? new Date(Date.UTC(2026, 0, 1)), award: award(rec["job_title"]) });
    }
  }

  // status: newest per user = active (or draft if no pay), older = superseded
  const byUser = new Map<string, C[]>();
  for (const c of built) { const a = byUser.get(c.userId) || []; a.push(c); byUser.set(c.userId, a); }
  let created = 0, dup = 0, noPay = 0, guess = 0;
  for (const [, list2] of byUser) {
    list2.sort((a, b) => b.start.getTime() - a.start.getTime());
    for (let i = 0; i < list2.length; i++) {
      const c = list2[i];
      const status = i > 0 ? "superseded" : c.pay == null ? "contract_draft" : "active";
      if (c.pay == null) noPay++; if (c.paySrc === "GUESS-verify") guess++;
      const notes = [c.pay == null ? "Pay rate not detected — verify" : c.paySrc === "GUESS-verify" ? "Pay rate is a best-guess — verify" : "", "Recovered 2026-07-08"].filter(Boolean).join(". ");
      if (COMMIT) {
        const exists = await prisma.employmentContract.findFirst({ where: { documentUrl: c.url }, select: { id: true } });
        if (exists) { dup++; continue; }
        await prisma.employmentContract.create({ data: {
          userId: c.userId, contractType: c.type as any, payRate: c.pay ?? 0, startDate: c.start,
          status: status as any, documentUrl: c.url, awardLevel: c.award as any, notes,
        } });
      }
      created++;
      console.log(`  ${c.name.padEnd(24)} ${c.type.padEnd(14)} $${(c.pay ?? 0).toString().padEnd(6)} ${c.paySrc.padEnd(12)} ${c.start.toISOString().slice(0,10)} ${(c.award ?? "").padEnd(11)} ${status}`);
    }
  }
  console.log(`\n${COMMIT ? "APPLIED" : "PLAN"} — contracts:${created} dup-skipped:${dup} | no-pay-detected:${noPay} guessed-pay:${guess}`);
  if (!COMMIT) console.log("DRY RUN — nothing written. Re-run with --commit.\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
