import { prisma } from "@/lib/prisma";
import { KNOWLEDGE_SEEDS } from "@/lib/ai-knowledge-seeds";
import { upsertKnowledgeSource } from "../pipeline";
import type { UpsertResult } from "../types";

const SINGLETON_ID = "singleton";

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function overridesSection(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([, v]) => typeof v === "string" && (v as string).trim(),
  );
  if (entries.length === 0) return "";
  return `\n\n## Overrides\n\n${entries.map(([k, v]) => `${k}: ${String(v).trim()}`).join("\n")}\n`;
}

/**
 * Index the three seeded handbooks plus any admin override map. Called
 * from the two content PATCH routes and from the backfill adapter.
 * Overrides are APPENDED (not substituted), so a superseded seed sentence
 * remains searchable alongside the admin's replacement — acceptable for
 * slice 1; a keyed substitution needs the panels' section map.
 */
export async function syncHandbook(): Promise<UpsertResult[]> {
  const [way, handbook] = await Promise.all([
    prisma.amanaWayContent.findUnique({ where: { id: SINGLETON_ID }, select: { data: true } }),
    prisma.amanaHandbookContent.findUnique({ where: { id: SINGLETON_ID }, select: { data: true } }),
  ]);
  const overrides: Record<string, string> = {
    "the-amana-way": overridesSection(way?.data),
    "employee-handbook": overridesSection(handbook?.data),
  };
  const results: UpsertResult[] = [];
  for (const seed of KNOWLEDGE_SEEDS) {
    const id = slug(seed.title);
    results.push(
      await upsertKnowledgeSource({
        sourceKind: "handbook",
        externalId: id,
        title: seed.title,
        category: "guide",
        text: seed.body + (overrides[id] ?? ""),
        externalUrl: id === "employee-handbook" ? "/handbook" : id === "the-amana-way" ? "/amana-way" : null,
      }),
    );
  }
  return results;
}
