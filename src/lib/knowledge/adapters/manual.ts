import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { upsertKnowledgeSource } from "../pipeline";
import type { KnowledgeCategory, KnowledgeTier } from "@prisma/client";
import type { UpsertResult } from "../types";

export interface ManualSourceInput {
  title: string;
  text: string;
  category?: KnowledgeCategory;
  tier?: KnowledgeTier;
  serviceId?: string | null;
  state?: string | null;
  /** Blob URL for uploaded files; null for pasted text */
  externalUrl?: string | null;
}

/** Admin paste/upload from /settings/ai-knowledge. externalId is minted here. */
export async function createManualSource(input: ManualSourceInput): Promise<UpsertResult> {
  return upsertKnowledgeSource({
    sourceKind: "manual",
    externalId: `manual:${randomUUID()}`,
    title: input.title,
    category: input.category ?? "guide",
    tier: input.tier,
    text: input.text,
    serviceId: input.serviceId ?? null,
    state: input.state ?? null,
    externalUrl: input.externalUrl ?? null,
  });
}

/**
 * Inline edit of a pasted entry. Routed entirely through
 * upsertKnowledgeSource — never write title/text on the row directly —
 * so normalizedTitle, contentHash, the tier heuristic, and supersession
 * all re-derive from the edited value instead of drifting from it.
 *
 * Known follow-up: renaming does not revisit the OLD dedupe group (see
 * the note above applySupersession in ../pipeline.ts) — an edited entry
 * that changes normalizedTitle can leave a stale `superseded` row behind
 * in its previous group.
 */
export async function updateManualSource(
  id: string,
  patch: { title?: string; text?: string },
): Promise<UpsertResult> {
  const existing = await prisma.knowledgeSource.findUnique({
    where: { id },
    select: {
      sourceKind: true, externalId: true, title: true, category: true, tier: true, tierOverride: true,
      serviceId: true, state: true, externalUrl: true,
      chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } },
    },
  });
  if (!existing || existing.sourceKind !== "manual") {
    throw new Error("Not a manual knowledge source");
  }
  const text = patch.text ?? existing.chunks.map((c) => c.content).join("\n\n");
  // Re-runs the whole derivation (normalizedTitle, contentHash, tier heuristic,
  // supersession) so an edited entry can never drift from its own key.
  return upsertKnowledgeSource({
    sourceKind: "manual",
    externalId: existing.externalId,
    title: patch.title ?? existing.title,
    category: existing.category,
    tier: existing.tierOverride ?? existing.tier,
    text,
    serviceId: existing.serviceId,
    state: existing.state,
    externalUrl: existing.externalUrl,
  });
}
