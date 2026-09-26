/**
 * GET  — list every KnowledgeSource (the console's source table)
 * POST — create a pasted-text `manual` source
 * Auth: owner/head_office/admin. Reads/writes KnowledgeSource only — never Document.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { createManualSource } from "@/lib/knowledge/adapters/manual";
import { logger } from "@/lib/logger";
import { ENTRY_SELECT, toEntry } from "./_lib/entry";

const MAX_BODY_BYTES = 500_000;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  category: z.enum(["policy", "procedure", "sop", "guide", "reference", "centre"]).default("guide"),
  tier: z.enum(["safety_critical", "general"]).optional(),
  serviceId: z.string().min(1).nullable().optional(),
  state: z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]).nullable().optional(),
});

export const GET = withApiAuth(
  async () => {
    const rows = await prisma.knowledgeSource.findMany({
      select: ENTRY_SELECT,
      // Postgres sorts an enum by its DECLARATION order, not alphabetically:
      // KnowledgeStatus is `active, superseded, excluded`, so `status asc`
      // puts the live rows first — which is what the console wants.
      orderBy: [{ status: "asc" }, { title: "asc" }],
    });
    return NextResponse.json({ entries: rows.map(toEntry) });
  },
  { roles: [...ADMIN_ROLES] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
    const { title, body, category, tier, serviceId, state } = parsed.data;
    if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
      throw ApiError.badRequest(`Body too large (max ${MAX_BODY_BYTES.toLocaleString()} bytes).`);
    }
    if (serviceId) {
      const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { id: true } });
      if (!service) throw ApiError.badRequest("Unknown serviceId");
    }
    // An explicit tier is admin intent: it belongs in `tierOverride` (the same
    // slot the row's PATCH writes), not the heuristic `tier` column — otherwise
    // the next edit's re-derivation would silently overwrite it.
    const result = await createManualSource({ title: title.trim(), text: body, category, serviceId, state });
    if (tier) {
      await prisma.knowledgeSource.update({ where: { id: result.sourceId }, data: { tierOverride: tier } });
    }
    if (result.outcome === "error") {
      // The row exists (so the admin can retry via reindex) but nothing is
      // searchable yet — say so instead of a silent 201.
      logger.warn("AI knowledge: manual source created but not indexed", {
        sourceId: result.sourceId, actorId: session!.user.id, err: result.error,
      });
    } else {
      logger.info("AI knowledge: manual source created", { sourceId: result.sourceId, actorId: session!.user.id });
    }
    return NextResponse.json(
      { id: result.sourceId, outcome: result.outcome, error: result.error ?? null },
      { status: 201 },
    );
  },
  { roles: [...ADMIN_ROLES] },
);
