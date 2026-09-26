/**
 * Import a local SharePoint export into the Amana AI knowledge store.
 *
 *   npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from ./knowledge-export [--dry]
 *
 * `--env-file` (not dotenv in-file) because ESM hoists imports: src/lib/prisma
 * and src/lib/env evaluate before any config() call could run. Targets
 * DATABASE_URL. For production, export PROD_DATABASE_URL explicitly (see
 * .env.example) — nothing here touches prod by default. Writes one
 * KnowledgeSyncRun (adapter "sharepoint") with the full report.
 *
 * Top-level imports are relative; src/lib/prisma itself imports via `@/`,
 * so tsx's tsconfig-paths resolution is still load-bearing (verified by the
 * fixture dry run in the plan). Prisma connects lazily on the first query,
 * so a `--dry` run never opens a connection — the guard and tally print
 * even with an unreachable DATABASE_URL.
 */
import { prisma } from "../src/lib/prisma";
import { importExportDir } from "../src/lib/knowledge/adapters/sharepoint-export";

async function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf("--from");
  const dir = fromIdx >= 0 ? args[fromIdx + 1] : "./knowledge-export";
  const dry = args.includes("--dry");
  const url = process.env.DATABASE_URL ?? "";
  const isProd = url.includes("ep-green-breeze-angq0yoa");
  console.log(`Importing from ${dir} into ${isProd ? "PRODUCTION" : "local/dev"} database${dry ? " (dry run)" : ""}`);
  if (isProd && process.env.ALLOW_PROD_DB !== "yes") {
    console.error("Refusing to write to production without ALLOW_PROD_DB=yes");
    process.exit(2);
  }
  if (dry) {
    // Dry run: classification only, no DB writes
    const { classifyPath } = await import("../src/lib/knowledge/adapters/sharepoint-export");
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    const walk = async (d: string): Promise<string[]> => {
      const out: string[] = [];
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) out.push(...(await walk(f))); else if (e.name.endsWith(".md")) out.push(f);
      }
      return out;
    };
    const files = await walk(dir);
    const tally: Record<string, number> = {};
    for (const f of files) {
      const c = classifyPath(path.relative(dir, f).replace(/\.md$/, ""));
      const k = c.skip ? "skip" : `${c.tree}/${c.category}`;
      tally[k] = (tally[k] ?? 0) + 1;
    }
    console.table(tally);
    return;
  }
  const run = await prisma.knowledgeSyncRun.create({ data: { adapter: "sharepoint", counts: {}, details: {} } });
  const report = await importExportDir(dir);
  await prisma.knowledgeSyncRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), counts: report.counts, details: { conflicts: report.conflicts, unmapped: report.unmapped, skipped: report.skipped, errors: report.errors } },
  });
  console.table(report.counts);
  if (report.conflicts.length) console.log("CONFLICTS (fix in SharePoint):", JSON.stringify(report.conflicts, null, 2));
  if (report.unmapped.length) console.log("UNMAPPED centre folders:", JSON.stringify(report.unmapped, null, 2));
  if (report.errors.length) console.log("ERRORS:", JSON.stringify(report.errors, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
