/**
 * Import a local SharePoint export into the Amana AI knowledge store.
 *
 *   npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from ./knowledge-export [--dry] [--allow-no-embeddings]
 *
 * `--env-file` (not dotenv in-file) because ESM hoists imports: src/lib/prisma
 * and src/lib/env evaluate before any config() call could run. Targets
 * DATABASE_URL. For production, prefix the SAME command with the prod URL
 * inline (see scripts/export-sharepoint-knowledge/README.md) — Node's
 * --env-file never overrides a variable already set in the environment, so
 * the inline URL wins while VOYAGE_API_KEY still loads from .env.local.
 * Nothing here touches prod by default. Writes one KnowledgeSyncRun
 * (adapter "sharepoint") with the full report; a thrown import closes the
 * run row with `error` + `finishedAt` before exiting, so cron-health never
 * shows an orphaned open run.
 *
 * `--dry` is the eyeball gate before prod: same walk, parse, classification,
 * centre mapping and conflict detection as the real import, with NO upsert
 * or exclusion — it prints the tally, conflicts, unmapped folders and the
 * full list of paths that WOULD be imported. It reads Service (read-only)
 * to map centres; with an unreachable database it warns and reports every
 * centre folder as unmapped.
 *
 * Without VOYAGE_API_KEY every source is written with `embedding` null and
 * retrieval degrades to tsvector-only — a real import refuses (exit 3) unless
 * `--allow-no-embeddings` says that is intended; a dry run only warns.
 *
 * Top-level imports are relative; src/lib/prisma itself imports via `@/`,
 * so tsx's tsconfig-paths resolution is still load-bearing (verified by the
 * fixture dry run).
 */
import { prisma } from "../src/lib/prisma";
import { importExportDir, type ImportReport } from "../src/lib/knowledge/adapters/sharepoint-export";

const USAGE = "usage: import-sharepoint-knowledge.ts --from <export-dir> [--dry] [--allow-no-embeddings]";

function printReport(report: ImportReport, dry: boolean) {
  console.table(report.counts);
  if (dry) {
    const tally: Record<string, number> = {};
    for (const f of report.files) tally[`${f.tree}/${f.category}`] = (tally[`${f.tree}/${f.category}`] ?? 0) + 1;
    tally.skip = report.counts.skipped;
    console.table(tally);
  }
  for (const w of report.warnings) console.warn(`WARNING: ${w}`);
  if (report.conflicts.length) console.log("CONFLICTS (fix in SharePoint):", JSON.stringify(report.conflicts, null, 2));
  if (report.unmapped.length) console.log("UNMAPPED centre folders:", JSON.stringify(report.unmapped, null, 2));
  if (report.errors.length) console.log("ERRORS:", JSON.stringify(report.errors, null, 2));
  if (dry) {
    console.log(`\nWOULD IMPORT (${report.files.length} files) — read every line before running for real:`);
    for (const f of report.files) console.log(`  [${f.tree}/${f.category}${f.serviceId ? ` → ${f.serviceName ?? f.serviceId}` : ""}] ${f.path}`);
    if (report.skipped.length) {
      console.log(`\nSKIPPED (${report.skipped.length} files):`);
      for (const s of report.skipped) console.log(`  ${s.path}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf("--from");
  const dir = fromIdx >= 0 ? args[fromIdx + 1] : "./knowledge-export";
  if (fromIdx >= 0 && (!dir || dir.startsWith("--"))) {
    console.error("--from needs a directory\n" + USAGE);
    process.exit(1);
  }
  const dry = args.includes("--dry");
  const allowNoEmbeddings = args.includes("--allow-no-embeddings");
  const url = process.env.DATABASE_URL ?? "";
  const isProd = url.includes("ep-green-breeze-angq0yoa");
  console.log(`Importing from ${dir} into ${isProd ? "PRODUCTION" : "local/dev"} database${dry ? " (dry run)" : ""}`);
  if (isProd && process.env.ALLOW_PROD_DB !== "yes") {
    console.error("Refusing to write to production without ALLOW_PROD_DB=yes");
    process.exit(2);
  }
  if (!process.env.VOYAGE_API_KEY && !allowNoEmbeddings) {
    const why = "VOYAGE_API_KEY is not set: every source would be stored with a null embedding and the AI would fall back to keyword-only retrieval until a full re-index. Load it (e.g. --env-file=.env.local) or pass --allow-no-embeddings if that is intended.";
    if (dry) console.warn(`WARNING: ${why} The real import will exit 3.`);
    else { console.error(`Refusing to import. ${why}`); process.exit(3); }
  }

  if (dry) {
    printReport(await importExportDir(dir, { dry: true }), true);
    return;
  }

  const run = await prisma.knowledgeSyncRun.create({ data: { adapter: "sharepoint", counts: {}, details: {} } });
  let report: ImportReport;
  try {
    report = await importExportDir(dir);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await prisma.knowledgeSyncRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), error } });
    throw err;
  }
  await prisma.knowledgeSyncRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), counts: report.counts, details: { conflicts: report.conflicts, unmapped: report.unmapped, skipped: report.skipped, errors: report.errors } },
  });
  printReport(report, false);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
