/**
 * Backfill: insert text-node spaces between adjacent merge tags in
 * ContractTemplate.contentJson.
 *
 * Fixes templates authored by clicking merge-tag chips back-to-back in the
 * editor (root cause of the "SarahDoe" / "BonnyriggNSW2177" rendering bug).
 *
 * Usage:
 *   npx tsx scripts/fix-template-spacing.ts            # dry-run
 *   npx tsx scripts/fix-template-spacing.ts --apply    # write changes
 *   npx tsx scripts/fix-template-spacing.ts --id <id>  # target one template
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: unknown[];
};
type TipTapDoc = { type: "doc"; content?: TipTapNode[] };

/**
 * Walk a node's content array and insert a `{ type: "text", text: " " }` node
 * between any two consecutive `mergeTag` children. Returns the number of
 * insertions made (for reporting).
 *
 * Recurses into children so nested structures (tables, lists, blockquotes)
 * are also covered.
 */
function fixAdjacentMergeTags(node: TipTapNode): number {
  let inserted = 0;
  if (!node.content || node.content.length === 0) return 0;

  // Recurse first so nested counts are correct.
  for (const child of node.content) {
    inserted += fixAdjacentMergeTags(child);
  }

  // Walk pairs and splice in spaces. Iterate backwards to keep indices stable
  // while splicing forward-direction additions in.
  const next: TipTapNode[] = [];
  for (let i = 0; i < node.content.length; i++) {
    const cur = node.content[i];
    const prev = next[next.length - 1];
    if (prev?.type === "mergeTag" && cur.type === "mergeTag") {
      next.push({ type: "text", text: " " });
      inserted++;
    }
    next.push(cur);
  }
  node.content = next;
  return inserted;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const idIdx = args.indexOf("--id");
  const targetId = idIdx >= 0 ? args[idIdx + 1] : null;

  const templates = await prisma.contractTemplate.findMany({
    where: targetId ? { id: targetId } : undefined,
    select: { id: true, name: true, contentJson: true, status: true },
    orderBy: { name: "asc" },
  });

  if (templates.length === 0) {
    console.log(targetId ? `No template found with id ${targetId}` : "No templates found.");
    process.exit(0);
  }

  console.log(`Scanning ${templates.length} template${templates.length === 1 ? "" : "s"}…`);
  console.log(apply ? "  Mode: APPLY (will write changes)" : "  Mode: DRY-RUN (no writes)");
  console.log("");

  let totalInsertions = 0;
  let touchedTemplates = 0;

  for (const t of templates) {
    // Deep-clone so we don't mutate Prisma's cached object.
    const doc = JSON.parse(JSON.stringify(t.contentJson)) as TipTapDoc;
    const root: TipTapNode = doc as unknown as TipTapNode;
    const count = fixAdjacentMergeTags(root);

    if (count === 0) {
      console.log(`  ✓  ${t.name} (${t.id}) — already clean`);
      continue;
    }

    touchedTemplates++;
    totalInsertions += count;
    console.log(`  ⚡ ${t.name} (${t.id}) — ${count} insertion${count === 1 ? "" : "s"}${t.status === "disabled" ? " [disabled]" : ""}`);

    if (apply) {
      await prisma.contractTemplate.update({
        where: { id: t.id },
        data: { contentJson: doc as object },
      });
    }
  }

  console.log("");
  console.log(
    `${apply ? "Wrote" : "Would write"} ${totalInsertions} space${totalInsertions === 1 ? "" : "s"} across ${touchedTemplates} template${touchedTemplates === 1 ? "" : "s"}.`,
  );
  if (!apply && totalInsertions > 0) {
    console.log("Re-run with --apply to commit changes.");
  }
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
