#!/usr/bin/env tsx
/**
 * One-shot codemod: migrate `await req.json()` → `await parseJsonBody(req)`
 * across all src/app/api/** route handlers.
 *
 * Inserts `import { parseJsonBody } from "@/lib/api-error"` if not already
 * present (or extends an existing import from that module). Idempotent —
 * re-running on already-migrated files is a no-op.
 *
 * Usage: npx tsx scripts/one-shots/codemod-parseJsonBody.ts
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const IMPORT_STATEMENT = 'import { parseJsonBody } from "@/lib/api-error";';
const API_ROOT = "src/app/api";

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walkFiles(full);
    else if (entry === "route.ts") yield full;
  }
}

let filesChanged = 0;
let totalReplacements = 0;
const skipped: { file: string; reason: string }[] = [];

for (const file of walkFiles(API_ROOT)) {
  const before = readFileSync(file, "utf8");

  // Count how many `await req.json()` occurrences exist
  const occurrences = (before.match(/await\s+req\.json\(\s*\)/g) || []).length;
  if (occurrences === 0) continue;

  // Replace the expression
  let after = before.replace(/await\s+req\.json\(\s*\)/g, "await parseJsonBody(req)");

  // Inspect the IMPORT STATEMENT specifically (not the whole file) to decide
  // whether parseJsonBody is in scope. NOTE: checking `after.includes("parseJsonBody")`
  // is WRONG because the call-site replacement above just inserted that string
  // into the body — which would fool the check into thinking the import exists.
  const apiErrorImportMatch = after.match(/import\s*\{([^}]+)\}\s*from\s*"@\/lib\/api-error"\s*;/);
  const importedNames = apiErrorImportMatch
    ? apiErrorImportMatch[1].split(",").map((n: string) => n.trim()).filter(Boolean)
    : null;
  const importHasParseJsonBody = importedNames?.includes("parseJsonBody") ?? false;

  if (!apiErrorImportMatch) {
    // No import from @/lib/api-error yet — insert the full statement after the
    // last top-of-file import.
    const importRegex = /^import[^;\n]+;\s*$/gm;
    let lastImportEnd = 0;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(after)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }
    if (lastImportEnd === 0) {
      skipped.push({ file, reason: "could not locate import block to insert parseJsonBody" });
      continue;
    }
    after = after.slice(0, lastImportEnd) + "\n" + IMPORT_STATEMENT + after.slice(lastImportEnd);
  } else if (!importHasParseJsonBody) {
    // Import exists but doesn't include parseJsonBody — extend the named list.
    after = after.replace(
      /import\s*\{([^}]+)\}\s*from\s*"@\/lib\/api-error"\s*;/,
      (_match, named) => {
        const names = named.split(",").map((n: string) => n.trim()).filter(Boolean);
        if (!names.includes("parseJsonBody")) names.push("parseJsonBody");
        return `import { ${names.join(", ")} } from "@/lib/api-error";`;
      },
    );
  }
  // else: import already has parseJsonBody — nothing to do for imports

  if (after !== before) {
    writeFileSync(file, after, "utf8");
    filesChanged++;
    totalReplacements += occurrences;
    console.log(`  ${file}  (${occurrences} sites)`);
  }
}

console.log();
console.log(`Codemod summary: ${filesChanged} files changed, ${totalReplacements} sites migrated.`);
if (skipped.length) {
  console.log();
  console.log("Skipped:");
  for (const s of skipped) console.log(`  ${s.file} — ${s.reason}`);
  process.exit(1);
}
