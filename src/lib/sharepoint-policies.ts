/**
 * Sync the SharePoint policies & procedures master folder into the
 * dashboard's Policies & Procedures library (PolicyDocument + versions).
 *
 * 2026-10-08, Daniel: staff should see every policy and procedure we keep
 * in SharePoint, here. SharePoint stays where they're written; this keeps
 * the library in step:
 *   - the master folder (default "NSW & VIC state policies" in Shared
 *     Documents) is read recursively, skipping Archive/Old folders;
 *   - file names become staff-friendly titles ("QA2 Sun Safe Policy OSHC
 *     V14.docx" → "Sun Safe Policy"; state-specific → "Bushfire Policy (NSW)");
 *   - when a policy appears more than once (V9 beside V10, "Bush Fire" vs
 *     "Bushfire") only the highest version wins;
 *   - each winner is converted to PDF (readable on a phone, no Microsoft
 *     login needed) and stored as a new version when it changes — so
 *     required policies ask for re-acknowledgement automatically;
 *   - documents that vanish from SharePoint are ARCHIVED, never deleted
 *     (their acknowledgements are records).
 * PDF conversion is slow, so each run converts at most BATCH documents and
 * the next run carries on.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { uploadFile } from "@/lib/storage/uploadFile";
import { isDefaultKeyPolicyTitle } from "@/lib/key-policy-summaries";
import { downloadAsPdf, isGraphConfigured, listFolderFiles, type DriveItem } from "@/lib/ms-graph";

/** Shared Documents drive on amanaoshcptyltd.sharepoint.com (from the search API). */
const DRIVE_ID =
  process.env.SHAREPOINT_POLICIES_DRIVE_ID ||
  "b!anYMlR1iJE6qf8i6xx7oPUyIvXDGtQxOlxrLNjlUnU3tyQtxpG97R7qYu4_kCvu4";
const FOLDER = process.env.SHAREPOINT_POLICIES_FOLDER || "NSW & VIC state policies";

export const BATCH = 25;
const SUPPORTED = /\.(docx?|pdf|rtf|odt)$/i;
const SKIP_FOLDER = /archive|old|superseded|previous/i;

export function isSharepointPolicySyncConfigured(): boolean {
  return isGraphConfigured();
}

export interface ParsedPolicyFile {
  title: string;
  /** Normalised identity used to spot duplicates ("bushfirepolicynsw"). */
  key: string;
  version: number;
  qualityArea: number | null;
  state: "NSW" | "VIC" | null;
  category: "policy" | "procedure" | "other";
}

/** File name + path → library fields. Pure; tested. */
export function parsePolicyFile(name: string, parentPath = ""): ParsedPolicyFile {
  let base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();

  const v = base.match(/\s+v(?:ersion)?\s*(\d+)(?:\.\d+)?\s*$/i);
  const version = v ? Number(v[1]) : 0;
  if (v) base = base.slice(0, v.index).trim();

  const qa = base.match(/^QA\s*(\d)\s+/i);
  const qualityArea = qa ? Number(qa[1]) : null;
  if (qa) base = base.slice(qa[0].length).trim();

  const stateMatch = base.match(/\b(NSW|VIC)\b/i);
  const state = stateMatch ? (stateMatch[1].toUpperCase() as "NSW" | "VIC") : null;
  if (stateMatch) base = base.replace(stateMatch[0], " ");

  base = base.replace(/\bOSHC\b/gi, " ").replace(/\s{2,}/g, " ").replace(/\s+([,)])/g, "$1").trim();
  const title = state ? `${base} (${state})` : base;

  // Daniel, 2026-10-09: the FILE NAME decides — "…Policy…" is a policy,
  // "…Procedure…" a procedure. Only when the name says neither do we look
  // at the sub-folder, and never at the master folder itself: every file
  // lives under "NSW & VIC state policies", which used to file forms and
  // templates as policies.
  const lowerName = name.toLowerCase();
  const sub = parentPath.toLowerCase().split(FOLDER.toLowerCase()).pop() ?? "";
  const category: ParsedPolicyFile["category"] = /procedure/.test(lowerName)
    ? "procedure"
    : /polic/.test(lowerName)
      ? "policy"
      : /procedure/.test(sub)
        ? "procedure"
        : /polic/.test(sub)
          ? "policy"
          : "other";

  return {
    title,
    key: title.toLowerCase().replace(/[^a-z0-9]/g, ""),
    version,
    qualityArea,
    state,
    category,
  };
}

export interface Candidate {
  item: DriveItem;
  parsed: ParsedPolicyFile;
}

/** One file per policy: highest version, then most recently modified. */
export function pickWinners(items: DriveItem[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const item of items) {
    if (!SUPPORTED.test(item.name)) continue;
    const parsed = parsePolicyFile(item.name, item.parentReference?.path ?? "");
    if (!parsed.key) continue;
    const prev = best.get(parsed.key);
    if (
      !prev ||
      parsed.version > prev.parsed.version ||
      (parsed.version === prev.parsed.version &&
        item.lastModifiedDateTime > prev.item.lastModifiedDateTime)
    ) {
      best.set(parsed.key, { item, parsed });
    }
  }
  return [...best.values()].sort((a, b) => a.parsed.title.localeCompare(b.parsed.title));
}

export interface PolicySyncSummary {
  filesSeen: number;
  policies: number;
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  /** Changed in SharePoint but not converted yet (batch limit) — next run. */
  pending: number;
  failed: { title: string; error: string }[];
}

const keyOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function runSharepointPolicySync(
  opts: { batch?: number } = {},
): Promise<PolicySyncSummary> {
  const batch = opts.batch ?? BATCH;
  const files = await listFolderFiles(DRIVE_ID, FOLDER, (n) => SKIP_FOLDER.test(n));
  // Same guard as the EH sync: an empty listing means the read went wrong,
  // and an archive pass against it would hide every policy at once.
  if (files.length === 0) {
    throw new Error(`SharePoint folder "${FOLDER}" returned no files — refusing to sync`);
  }
  const winners = pickWinners(files);

  const existing = await prisma.policyDocument.findMany({
    select: {
      id: true,
      title: true,
      sharepointItemId: true,
      sharepointETag: true,
      isArchived: true,
      category: true,
    },
  });
  const byItem = new Map(existing.filter((d) => d.sharepointItemId).map((d) => [d.sharepointItemId!, d]));
  const byKey = new Map(existing.map((d) => [keyOf(d.title), d]));

  const summary: PolicySyncSummary = {
    filesSeen: files.length,
    policies: winners.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    pending: 0,
    failed: [],
  };
  const keptIds = new Set<string>();
  let converted = 0;

  for (const { item, parsed } of winners) {
    const doc = byItem.get(item.id) ?? byKey.get(parsed.key) ?? null;
    if (doc) keptIds.add(doc.id);
    const etag = item.cTag ?? item.eTag ?? item.lastModifiedDateTime;

    if (doc && doc.sharepointItemId === item.id && doc.sharepointETag === etag && !doc.isArchived) {
      // Re-file without re-downloading when the folder rule changes.
      if (doc.category !== parsed.category) {
        await prisma.policyDocument.update({ where: { id: doc.id }, data: { category: parsed.category } });
      }
      summary.unchanged++;
      continue;
    }
    if (converted >= batch) {
      summary.pending++;
      continue;
    }

    try {
      const pdf = await downloadAsPdf(DRIVE_ID, item);
      converted++;
      const fileName = item.name.replace(/\.[^.]+$/, ".pdf");
      const fileUrl = await uploadFile(pdf, `policies/sharepoint/${fileName}`, "application/pdf");
      const meta = {
        category: parsed.category,
        state: parsed.state,
        description: parsed.qualityArea ? `Quality Area ${parsed.qualityArea}` : null,
        sharepointItemId: item.id,
        sharepointETag: etag,
        sharepointWebUrl: item.webUrl,
        sharepointSyncedAt: new Date(),
        isArchived: false,
      };

      await prisma.$transaction(async (tx) => {
        let documentId: string;
        let versionNumber = 1;
        if (doc) {
          documentId = doc.id;
          const last = await tx.policyDocumentVersion.findFirst({
            where: { documentId },
            orderBy: { versionNumber: "desc" },
            select: { versionNumber: true },
          });
          versionNumber = (last?.versionNumber ?? 0) + 1;
        } else {
          // A reading library by default — an admin decides which synced
          // policies staff must sign (requiresAcknowledgement).
          const created = await tx.policyDocument.create({
            data: {
              title: parsed.title,
              ...meta,
              // Code of Conduct / Privacy arrive as KEY policies (short
              // version + signature at onboarding); the rest are reference.
              requiresAcknowledgement: isDefaultKeyPolicyTitle(parsed.title),
              keyPolicy: isDefaultKeyPolicyTitle(parsed.title),
            },
            select: { id: true },
          });
          documentId = created.id;
        }
        const version = await tx.policyDocumentVersion.create({
          data: { documentId, versionNumber, fileUrl, fileName, fileSize: pdf.length },
          select: { id: true },
        });
        await tx.policyDocument.update({
          where: { id: documentId },
          data: { ...meta, currentVersionId: version.id },
        });
        keptIds.add(documentId);
      });
      if (doc) summary.updated++;
      else summary.created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("SharePoint policy sync: document failed", { title: parsed.title, err: message });
      summary.failed.push({ title: parsed.title, error: message });
    }
  }

  // Synced documents no longer in SharePoint → archived (never deleted).
  const gone = existing.filter(
    (d) => d.sharepointItemId && !d.isArchived && !keptIds.has(d.id),
  );
  if (gone.length) {
    await prisma.policyDocument.updateMany({
      where: { id: { in: gone.map((d) => d.id) } },
      data: { isArchived: true },
    });
    summary.archived = gone.length;
  }

  return summary;
}
