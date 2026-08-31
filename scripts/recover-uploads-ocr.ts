/**
 * OCR the still-unattributed uploads/* files (image scans, scanned PDFs),
 * read the name off each certificate, and attach it to the matching staff
 * member as a Document. Uses tesseract (+ pdftoppm for scanned PDFs, sips
 * for heic/webp).
 *
 * Usage:
 *   npx tsx scripts/recover-uploads-ocr.ts           # DRY RUN
 *   npx tsx scripts/recover-uploads-ocr.ts --commit  # apply
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { execFileSync } from "node:child_process";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue;
  let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}
const COMMIT = process.argv.includes("--commit");
const TMP = "/private/tmp/claude-503/-Users-jaydenkowaider-Developer-amana-eos-dashboard/ec8cd29d-1461-429b-a9f7-b58f7ea91189/scratchpad/ocr";
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function certType(f: string): string {
  f = f.toLowerCase();
  if (/child.?protection|chcprt|child.?safety/.test(f)) return "Child Protection";
  if (/police/.test(f)) return "Police Check";
  if (/hltaid|first.?aid|\bcpr\b|anaphylaxis|asthma/.test(f)) return "First Aid / CPR";
  if (/wwcc|working.?with.?children/.test(f)) return "Working With Children Check";
  if (/identif|identity|passport|licence|license/.test(f)) return "Identity / ID";
  if (/visa|citizen/.test(f)) return "Visa / Right to Work";
  return "Uploaded Document";
}
function tess(file: string): string {
  try { return execFileSync("tesseract", [file, "stdout", "--psm", "6"], { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return ""; }
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { list } = await import("@vercel/blob");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const prisma = new PrismaClient();

  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  // known name-variant aliases: regex on OCR text -> staff email
  const ALIAS: [RegExp, string][] = [
    [/rifka\s*inoon|fathima\s*rifka|rifka\s*riya/i, "rifka.riyaz@gmail.com"], // Fathima Riyas
  ];
  const firstFreq = new Map<string, number>();
  for (const u of users) { const f = norm(u.name.split(/\s+/)[0]); firstFreq.set(f, (firstFreq.get(f) || 0) + 1); }
  const keys = users.map((u) => { const p = u.name.split(/\s+/); return { u, first: norm(p[0]), sur: norm(p.slice(1).join("")), full: norm(u.name), rev: norm(p.slice(1).join("") + p[0]) }; });
  const owner = await prisma.user.findFirst({ where: { role: "owner" }, select: { id: true } });

  function match(text: string) {
    for (const [re, email] of ALIAS) { if (re.test(text)) { const u = userByEmail.get(email); if (u) return { u, how: "alias" }; } }
    const t = norm(text);
    let hit = keys.find((k) => k.full.length >= 8 && (t.includes(k.full) || t.includes(k.rev)));
    if (hit) return { u: hit.u, how: "fullname" };
    // both first + surname present anywhere, and uniquely
    const both = keys.filter((k) => k.sur.length >= 5 && k.first.length >= 3 && t.includes(k.sur) && t.includes(k.first));
    if (both.length === 1) return { u: both[0].u, how: "both-tokens" };
    return null;
  }

  const have = new Set((await prisma.document.findMany({ select: { fileUrl: true } })).map((d) => d.fileUrl));
  let cursor: string | undefined; const blobs: any[] = [];
  do { const r: any = await list({ prefix: "uploads/", cursor, limit: 1000 }); blobs.push(...r.blobs); cursor = r.cursor; } while (cursor);
  const todo = blobs.filter((b) => !have.has(b.url) && !/contract/i.test(basename(b.pathname)));

  let ocrMatched = 0, unreadable = 0, unmatched = 0, i = 0;
  const perUser = new Map<string, number>(); const stillUnmatched: string[] = [];

  for (const b of todo) {
    i++;
    const fn = basename(b.pathname);
    const ext = (fn.split(".").pop() || "").toLowerCase();
    const local = join(TMP, `f${i}.${ext}`);
    let text = "";
    try {
      writeFileSync(local, Buffer.from(await (await fetch(b.url)).arrayBuffer()));
      if (ext === "pdf") {
        try { const { text: t } = await extractText(await getDocumentProxy(new Uint8Array(readFileSync(local))), { mergePages: true }); text = t as string; } catch {}
        if (norm(text).length < 40) { // scanned PDF -> render + OCR
          try { execFileSync("pdftoppm", ["-png", "-r", "150", "-f", "1", "-l", "2", local, join(TMP, `p${i}`)], { timeout: 60000, stdio: "ignore" });
            for (const f of readdirSync(TMP).filter((x) => x.startsWith(`p${i}`))) text += "\n" + tess(join(TMP, f)); } catch {}
        }
      } else if (["jpg", "jpeg", "png", "tif", "tiff", "bmp"].includes(ext)) {
        text = tess(local);
      } else if (["heic", "webp", "gif"].includes(ext)) {
        const png = join(TMP, `c${i}.png`);
        try { execFileSync("sips", ["-s", "format", "png", local, "--out", png], { timeout: 30000, stdio: "ignore" }); text = tess(png); } catch {}
      }
    } catch { /* download/convert failed */ }

    if (norm(text).length < 20) { unreadable++; stillUnmatched.push(fn + "  [unreadable]"); continue; }
    const m = match(text);
    if (!m) { unmatched++; if (stillUnmatched.length < 40) stillUnmatched.push(fn); continue; }

    if (COMMIT) {
      const dup = await prisma.document.findFirst({ where: { fileUrl: b.url }, select: { id: true } });
      if (!dup) await prisma.document.create({ data: {
        title: `${certType(fn)} — ${m.u.name}`, category: "compliance", fileName: fn, fileUrl: b.url,
        fileSize: b.size ?? null, assignedToId: m.u.id, uploadedById: owner?.id ?? null,
        tags: ["certificate", "recovered-ocr"],
      } });
    }
    ocrMatched++;
    perUser.set(m.u.name, (perUser.get(m.u.name) || 0) + 1);
    if (i % 20 === 0) console.log(`  ...${i}/${todo.length} processed, ${ocrMatched} matched`);
  }

  rmSync(TMP, { recursive: true, force: true });
  console.log(`\n=== OCR pass — ${COMMIT ? "COMMIT" : "DRY RUN"} ===`);
  console.log(`processed: ${todo.length} | OCR-matched: ${ocrMatched} | unreadable: ${unreadable} | readable-but-no-name-match: ${unmatched}`);
  console.log(`\nStaff receiving OCR'd docs (${perUser.size}):`);
  for (const [n, c] of [...perUser.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n.padEnd(26)} ${c}`);
  console.log(`\nStill unmatched (sample):`); for (const s of stillUnmatched.slice(0, 30)) console.log(`  ${s}`);
  if (!COMMIT) console.log("\nDRY RUN — nothing written.\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
