/**
 * GET    /api/settings/ai-knowledge/[id] — single entry with full body
 * PATCH  /api/settings/ai-knowledge/[id] — update title / body (manual only),
 *        or tierOverride / status (any kind — an admin exclusion decision)
 * DELETE /api/settings/ai-knowledge/[id] — delete a manual entry + its blob
 *
 * Any write that removes a row from its dedupe group (status change,
 * delete) re-runs applySupersession for that group so a `superseded`
 * sibling is promoted rather than left with no active winner.
 *
 * Reads/writes KnowledgeSource only — never Document.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { updateManualSource } from "@/lib/knowledge/adapters/manual";
import { applySupersession } from "@/lib/knowledge/pipeline";
import { deleteFile } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { ENTRY_SELECT, toEntry } from "../_lib/entry";

const MAX_BODY_BYTES = 500_000;
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  tierOverride: z.enum(["safety_critical", "general"]).nullable().optional(),
  status: z.enum(["active", "excluded"]).optional(),
});
interface RouteContext {
  params: Promise<{ id: string }>;
}

/** The dedupe key + the fields the state-based refusals read. */
const EXISTENCE_SELECT = {
  id: true, sourceKind: true, externalUrl: true, normalizedTitle: true, state: true, serviceId: true,
} as const;

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const row = await prisma.knowledgeSource.findUnique({
      where: { id },
      select: { ...ENTRY_SELECT, text: true },
    });
    if (!row) throw ApiError.notFound("Knowledge source not found");
    const { text, ...rest } = row;
    return NextResponse.json({ ...toEntry(rest), body: text });
  },
  { roles: [...ADMIN_ROLES] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.knowledgeSource.findUnique({ where: { id }, select: EXISTENCE_SELECT });
    if (!existing) throw ApiError.notFound("Knowledge source not found");
    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
    const { title, body, tierOverride, status } = parsed.data;
    const contentEdit = body !== undefined || title !== undefined;

    if (contentEdit) {
      if (existing.sourceKind !== "manual") {
        throw ApiError.conflict("Only pasted/uploaded entries can be edited here — adapter-owned sources change at their origin.");
      }
      if (body !== undefined && existing.externalUrl) {
        throw ApiError.conflict("Body of an uploaded file can't be edited inline. Delete and re-upload to change the content.");
      }
      if (body !== undefined && Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
        throw ApiError.badRequest(`Body too large (max ${MAX_BODY_BYTES.toLocaleString()} bytes).`);
      }
    }

    const data: {
      tierOverride?: "safety_critical" | "general" | null;
      status?: "active" | "excluded";
      excludedBy?: "admin" | null;
      supersededById?: null;
    } = {};
    if (tierOverride !== undefined) data.tierOverride = tierOverride;
    if (status !== undefined) {
      data.status = status;
      data.excludedBy = status === "excluded" ? "admin" : null; // admin decisions are never auto-reverted by adapters
      if (status === "active") data.supersededById = null; // it's back in contention — applySupersession decides
    }
    if (Object.keys(data).length) {
      await prisma.knowledgeSource.update({ where: { id }, data });
      if (status !== undefined) {
        await applySupersession({ normalizedTitle: existing.normalizedTitle, state: existing.state, serviceId: existing.serviceId });
      }
    }
    // The content edit runs LAST: it re-derives the key from the new title and
    // revisits both the old and new group itself, so the status pass above
    // always worked from a key that was still current.
    if (contentEdit) await updateManualSource(id, { title: title?.trim(), text: body });

    logger.info("AI knowledge: source updated", { id, keys: Object.keys(parsed.data), actorId: session!.user.id });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES] },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.knowledgeSource.findUnique({ where: { id }, select: EXISTENCE_SELECT });
    if (!existing) throw ApiError.notFound("Knowledge source not found");
    if (existing.sourceKind !== "manual") {
      throw ApiError.conflict("Adapter-owned sources can't be deleted — exclude them instead.");
    }
    if (existing.externalUrl) {
      try {
        await deleteFile(existing.externalUrl);
      } catch (err) {
        logger.warn("AI knowledge: blob delete failed", { id, err: err instanceof Error ? err.message : String(err) });
      }
    }
    await prisma.knowledgeSource.delete({ where: { id } });
    await applySupersession({ normalizedTitle: existing.normalizedTitle, state: existing.state, serviceId: existing.serviceId });
    logger.info("AI knowledge: source deleted", { id, sourceKind: existing.sourceKind, actorId: session!.user.id });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES] },
);
