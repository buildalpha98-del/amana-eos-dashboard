/**
 * Re-attach staff-uploaded documents (certificates) from blob storage to the
 * recovered User profiles. Matches each uploads/* blob to a staff member by
 * the name embedded in its filename.
 *
 * Usage:
 *   npx tsx scripts/recover-certs-from-uploads.ts           # DRY RUN
 *   npx tsx scripts/recover-certs-from-uploads.ts --commit  # apply
 */
import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue;
  let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}
const COMMIT = process.argv.includes("--commit");
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function certType(fn: string): string | null {
  const f = fn.toLowerCase();
  if (/contract/.test(f)) return null; // handled by the contract importer
  if (/child.?protection|chcprt|child.?safety|nation.?child/.test(f)) return "Child Protection";
  if (/police/.test(f)) return "Police Check";
  if (/hltaid|first.?aid|\bcpr\b|anaphylaxis|asthma/.test(f)) return "First Aid / CPR";
  if (/wwcc|working.?with.?children|\bwwc\b/.test(f)) return "Working With Children Check";
  if (/identif|identity|passport|licence|license|\bid\b/.test(f)) return "Identity / ID";
  if (/visa|citizen/.test(f)) return "Visa / Right to Work";
  if (/certif|qualif|diploma|cert3|cert iii|statement/.test(f)) return "Qualification";
  return null; // unknown / not obviously a staff cert
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { list } = await import("@vercel/blob");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const prisma = new PrismaClient();

  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  // frequency of first names to know which are unique
  const firstFreq = new Map<string, number>();
  for (const u of users) { const f = norm(u.name.split(/\s+/)[0]); firstFreq.set(f, (firstFreq.get(f) || 0) + 1); }
  const byKey: { user: typeof users[number]; first: string; sur: string; full: string }[] = users.map(u => {
    const parts = u.name.split(/\s+/); return { user: u, first: norm(parts[0]), sur: norm(parts.slice(1).join("")), full: norm(u.name) };
  });
  const owner = await prisma.user.findFirst({ where: { role: "owner" }, select: { id: true } });

  function matchUser(fileNorm: string) {
    // strong: first+surname adjacency
    let hit = byKey.find(k => k.full.length >= 6 && fileNorm.includes(k.full));
    if (hit) return hit.user;
    // surname (>=5 chars, reasonably unique)
    hit = byKey.find(k => k.sur.length >= 5 && fileNorm.includes(k.sur));
    if (hit) return hit.user;
    // unique first name (>=4 chars)
    hit = byKey.find(k => k.first.length >= 4 && (firstFreq.get(k.first) || 0) === 1 && fileNorm.includes(k.first));
    if (hit) return hit.user;
    return null;
  }

  let cursor: string | undefined; const blobs: any[] = [];
  do { const r: any = await list({ prefix: "uploads/", cursor, limit: 1000 }); blobs.push(...r.blobs); cursor = r.cursor; } while (cursor);

  // strict: only first+surname adjacency (used for reading names inside files)
  function matchStrict(text: string) {
    const t = norm(text);
    const hit = byKey.find(k => k.full.length >= 7 && t.includes(k.full));
    return hit?.user ?? null;
  }

  let attached = 0, byContent = 0, skippedContract = 0, unmatched = 0, dupSkip = 0;
  const unmatchedSamples: string[] = [];
  const perUser = new Map<string, number>();

  for (const b of blobs) {
    const fn = basename(b.pathname);
    const type = certType(fn);
    if (type === null && /contract/i.test(fn)) { skippedContract++; continue; }
    const fileNorm = norm(fn);
    let user = matchUser(fileNorm);
    // fallback: read the name inside the PDF (strict full-name match only)
    if (!user && /\.pdf$/i.test(fn)) {
      try {
        const buf = new Uint8Array(await (await fetch(b.url)).arrayBuffer());
        const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
        user = matchStrict(text as string);
        if (user) byContent++;
      } catch { /* unreadable — leave unmatched */ }
    }
    if (!user) { unmatched++; if (unmatchedSamples.length < 25) unmatchedSamples.push(fn); continue; }

    if (COMMIT) {
      const dup = await prisma.document.findFirst({ where: { fileUrl: b.url }, select: { id: true } });
      if (dup) { dupSkip++; continue; }
      await prisma.document.create({
        data: {
          title: `${type ?? "Uploaded Document"} — ${user.name}`,
          category: "compliance",
          fileName: fn,
          fileUrl: b.url,
          fileSize: b.size ?? null,
          assignedToId: user.id,
          uploadedById: owner?.id ?? null,
          tags: ["certificate", "recovered-upload", ...(type ? [norm(type)] : [])],
        },
      });
    }
    attached++;
    perUser.set(user.name, (perUser.get(user.name) || 0) + 1);
  }

  console.log(`\n=== Cert re-attach — ${COMMIT ? "COMMIT" : "DRY RUN"} ===`);
  console.log(`uploads blobs: ${blobs.length}`);
  console.log(`would attach: ${attached} (of which ${byContent} matched by reading inside the PDF) | contracts skipped: ${skippedContract} | unmatched: ${unmatched} | dup-skipped: ${dupSkip}`);
  console.log(`\nStaff receiving docs (${perUser.size}):`);
  for (const [n, c] of [...perUser.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n.padEnd(26)} ${c}`);
  console.log(`\nUnmatched sample (need manual assignment — no name in filename):`);
  for (const s of unmatchedSamples) console.log(`  ${s}`);
  if (!COMMIT) console.log("\nDRY RUN — nothing written. Re-run with --commit.\n");
  await prisma.$disconnect();
}
main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
