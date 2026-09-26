import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { upsertKnowledgeSource, indexSource } from "../pipeline";
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

/** Inline edit of a pasted entry: re-chunk + re-embed under the same externalId. */
export async function updateManualSource(
  id: string,
  patch: { title?: string; text?: string },
): Promise<void> {
  if (patch.title !== undefined) {
    await prisma.knowledgeSource.update({ where: { id }, data: { title: patch.title } });
  }
  if (patch.text !== undefined) {
    await indexSource(id, patch.text);
  }
}
