import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { upsertKnowledgeSource } from "../pipeline";
import { looksLikeCredential } from "../normalize";
import { ApiError } from "@/lib/api-error";
import type { KnowledgeCategory } from "@prisma/client";
import type { UpsertResult } from "../types";

/** Shared by createManualSource + updateManualSource — never log the text this rejected. */
const CREDENTIAL_MESSAGE =
  "This document appears to contain a password or key — remove it before adding it to the knowledge store";

/**
 * A manual source never carries a `tier` — the pipeline's `inferTier`
 * derives the heuristic column, and admin intent lives in `tierOverride`
 * (written by the console's POST / PATCH routes, untouched by the upsert).
 */
export interface ManualSourceInput {
  title: string;
  text: string;
  category?: KnowledgeCategory;
  serviceId?: string | null;
  state?: string | null;
  /** Blob URL for uploaded files; null for pasted text */
  externalUrl?: string | null;
  /**
   * Stable identity for the row. Defaults to a fresh `manual:<uuid>` (a
   * paste is always a new entry). Uploads pass `uploadExternalId(blobUrl)`
   * so `(sourceKind, externalId)` is the real idempotency key — the client
   * `register` call and the Blob `onUploadCompleted` webhook both land on
   * the same row, and the second one is a hash-fast-path "unchanged".
   */
  externalId?: string;
}

/**
 * Deterministic externalId for an uploaded blob. BOTH the register route
 * and the upload webhook must derive the identical string for one blob, so
 * it is built from the URL pathname (Vercel's `blob.pathname` has no
 * leading slash; `new URL().pathname` always does — always go via URL).
 */
export function uploadExternalId(blobUrl: string): string {
  return `manual:upload:${new URL(blobUrl).pathname}`;
}

/**
 * Pick the KnowledgeCategory for an uploaded file from its filename (+ the
 * title the admin typed, when there is one). Daniel's library is full of
 * "QA2 X Policy / Procedure" + "Y Handbook / Guide" files, so a keyword
 * sniff puts them in the right console tab without a manual edit later.
 * Order matters: "Policy" wins over generic words like "OSHC". Anything
 * unrecognised is a "guide".
 *
 * ONE implementation, shared by the client-driven `register` route and the
 * Blob `onUploadCompleted` webhook: both land on the same row (see
 * `uploadExternalId`), and whichever arrives first sets the category — so
 * they must agree, or the winner is whichever was faster.
 */
export function inferCategory(fileName: string, title = ""): KnowledgeCategory {
  const haystack = `${fileName} ${title}`.toLowerCase();
  if (/\bpolicy\b|\bpolicies\b/.test(haystack)) return "policy";
  if (/\bprocedure\b|\bprocedures\b/.test(haystack)) return "procedure";
  return "guide";
}

/**
 * Admin paste/upload from /settings/ai-knowledge. externalId is minted here
 * unless supplied. Every caller — the paste route, the upload webhook and
 * the client-driven register route — flows through here, so this is the
 * ONE place a credential-shaped body is rejected before it reaches the
 * store.
 */
export async function createManualSource(input: ManualSourceInput): Promise<UpsertResult> {
  if (looksLikeCredential(input.text)) throw ApiError.badRequest(CREDENTIAL_MESSAGE);
  return upsertKnowledgeSource({
    sourceKind: "manual",
    externalId: input.externalId ?? `manual:${randomUUID()}`,
    title: input.title,
    category: input.category ?? "guide",
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
 * all re-derive from the edited value instead of drifting from it. A
 * rename with unchanged text takes the pipeline's hash fast-path (title
 * fields written, no re-embed) and revisits both the old and new group.
 * No `tier` is passed: the heuristic re-derives from the new title, and
 * the row's `tierOverride` is not part of the upsert's write set.
 */
export async function updateManualSource(
  id: string,
  patch: { title?: string; text?: string },
): Promise<UpsertResult> {
  const existing = await prisma.knowledgeSource.findUnique({
    where: { id },
    select: {
      sourceKind: true, externalId: true, title: true, category: true,
      serviceId: true, state: true, externalUrl: true, text: true,
    },
  });
  if (!existing || existing.sourceKind !== "manual") {
    throw new Error("Not a manual knowledge source");
  }
  // `text` is the canonical source text — never rejoin chunks (chunking
  // drops headings into their own column, so a rejoin is lossy and the
  // rejoined hash would differ from the stored one on every rename).
  const text = patch.text ?? existing.text;
  // Only gate on an ACTUAL text edit — a title-only rename must not start
  // failing because a row created before this guard existed already holds
  // credential-shaped text.
  if (patch.text !== undefined && looksLikeCredential(patch.text)) throw ApiError.badRequest(CREDENTIAL_MESSAGE);
  // Re-runs the whole derivation (normalizedTitle, contentHash, tier heuristic,
  // supersession) so an edited entry can never drift from its own key.
  return upsertKnowledgeSource({
    sourceKind: "manual",
    externalId: existing.externalId,
    title: patch.title ?? existing.title,
    category: existing.category,
    text,
    serviceId: existing.serviceId,
    state: existing.state,
    externalUrl: existing.externalUrl,
  });
}
