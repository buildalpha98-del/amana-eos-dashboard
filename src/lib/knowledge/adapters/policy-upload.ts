import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { extractTextFromBuffer } from "@/lib/document-indexer";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import type { UpsertResult } from "../types";

const FETCH_TIMEOUT_MS = 30_000;
/** Policy PDFs are a few MB; the /policies uploader is the only writer of these URLs. */
const MAX_BYTES = 25 * 1024 * 1024;

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

  const fail = (what: string): UpsertResult => {
    logger.error("Knowledge: policy PDF download failed", { versionId, what });
    return { sourceId: "", outcome: "error", error: `${what} — ${v.document.title} (version ${v.versionNumber})` };
  };

  // Bounded like the regulator adapter: a hung Blob socket or a runaway
  // body must fail THIS policy, not stall the whole backfill run. The
  // Content-Length pre-check is cheap; the byte count after the read is
  // the backstop for a server that omits or understates it.
  let buf: Buffer;
  try {
    const res = await fetch(v.fileUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return fail(`download ${res.status}`);
    const declaredLength = res.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > MAX_BYTES) return fail(`too large (declared ${declaredLength} bytes)`);
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return fail(`too large (${buf.byteLength} bytes)`);
  } catch (err) {
    return fail(`download failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await extractTextFromBuffer(buf, "application/pdf");

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
