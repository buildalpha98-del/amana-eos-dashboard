/**
 * GET  /api/services/[id]/hazards — the centre's hazard & maintenance log.
 * POST /api/services/[id]/hazards — report one (anyone at the centre).
 *
 * 2026-10-09, OWNA parity. A high-priority report tells the centre's
 * Coordinators straight away.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { safeAttachmentUrl } from "@/lib/schemas/message-attachments";
import { notifyUsers } from "@/lib/notify-user";
import { centreCoordinatorIds } from "@/lib/roster-staff";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  title: z.string().trim().min(3, "Say what the problem is").max(160),
  details: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(80).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  photoUrl: safeAttachmentUrl.optional(),
});

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as Ctx).params;
  assertServiceAccess(session, id);
  const show = new URL(req.url).searchParams.get("show") ?? "open";
  const hazards = await prisma.hazardReport.findMany({
    where: { serviceId: id, ...(show === "open" ? { status: { not: "fixed" } } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  // High first, then oldest-waiting — what needs a phone call now.
  const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  hazards.sort((a, b) =>
    a.status === "fixed" || b.status === "fixed"
      ? Number(a.status === "fixed") - Number(b.status === "fixed")
      : (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return NextResponse.json({ hazards });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    assertServiceAccess(session, id);
    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid hazard");
    const hazard = await prisma.hazardReport.create({
      data: {
        serviceId: id,
        ...parsed.data,
        reportedById: session.user.id,
        reportedByName: session.user.name ?? "Staff",
      },
    });
    if (hazard.priority === "high") {
      centreCoordinatorIds(id)
        .then((ids) =>
          notifyUsers(prisma, ids.filter((u) => u !== session.user.id), {
            type: "hazard",
            title: `High-priority hazard: ${hazard.title}`,
            body: [hazard.location, `Reported by ${hazard.reportedByName}`].filter(Boolean).join(" · "),
            link: `/services/${id}?tab=compliance&sub=hazards`,
          }),
        )
        .catch((err) => logger.error("Hazard notification failed", { err, hazardId: hazard.id }));
    }
    return NextResponse.json({ hazard }, { status: 201 });
  },
  { rateLimit: { max: 20, windowMs: 60_000 } },
);
