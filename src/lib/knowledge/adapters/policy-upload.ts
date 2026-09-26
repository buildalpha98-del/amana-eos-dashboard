import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { extractTextFromBuffer } from "@/lib/document-indexer";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import type { UpsertResult } from "../types";

/**
 * Official PDFs from /policies. One source per PolicyDocumentVersion;
 * supersession (pipeline) keeps the highest versionNumber active and —
 * because policy_upload outranks sharepoint — retires the imported text
 * of the same title. PolicyDocument has no state, so only the state-null
 * SharePoint variant is superseded (spec §3.3).
 */
export async function syncPolicyVersion(versionId: string): Promise<UpsertResult | null> {
  const v = await prisma.policyDocumentVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true, versionNumber: true, fileUrl: true,
      document: { select: { id: true, title: true, category: true, isArchived: true } },
    },
  });
  if (!v || v.document.isArchived) return null;

  const res = await fetch(v.fileUrl);
  if (!res.ok) {
    logger.error("Knowledge: policy PDF download failed", { versionId, status: res.status });
    return {
      sourceId: "",
      outcome: "error",
      error: `download ${res.status} — ${v.document.title} (version ${v.versionNumber})`,
    };
  }
  const text = await extractTextFromBuffer(Buffer.from(await res.arrayBuffer()), "application/pdf");

  return upsertKnowledgeSource({
    sourceKind: "policy_upload",
    externalId: v.id,
    title: v.document.title,
    category: v.document.category === "procedure" ? "procedure" : v.document.category === "policy" ? "policy" : "guide",
    text,
    version: v.versionNumber,
    externalUrl: `/policies/${v.document.id}`,
  });
}

/** Archived policy → every version's source adapter-excluded; un-archiving re-syncs the current version, which re-activates it. */
export async function excludePolicySources(documentId: string): Promise<void> {
  const versions = await prisma.policyDocumentVersion.findMany({
    where: { documentId }, select: { id: true },
  });
  await excludeSources(
    { sourceKind: "policy_upload", externalId: { in: versions.map((x) => x.id) } },
    "adapter",
  );
}
